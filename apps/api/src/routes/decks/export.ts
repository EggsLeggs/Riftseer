import { t, Elysia } from "elysia";
import { normalizeCardName } from "@riftseer/types/parser";
import { zoneForCard, type DeckZone } from "@riftseer/types/deck";
import { formatDeckText, parseDeckText, type DeckTextCard } from "@riftseer/types/deck-text";
import type {
  DeckCardBase,
  DeckCardChange,
  DeckCardRow,
  DeckVisibility,
} from "../../repos/decks.repo";
import { canRead } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { DeckDetailSchema, VisibilitySchema } from "./schemas";
import {
  NAME_MAX,
  CARD_BATCH_MAX,
  unavailable,
  rpcFailure,
  deckShape,
  ownerProfile,
  type DeckRouteContext,
} from "./shared";

// ─── Deck text import and export ──────────────────────────────────────────────

function exportCards(cards: DeckCardRow[]): DeckTextCard[] {
  return cards.map((card) => ({
    zone: card.zone,
    quantity: card.quantity,
    name: card.name,
    ...(card.set_code ? { set_code: card.set_code } : {}),
    ...(card.set_code && card.collector_number ? { collector_number: card.collector_number } : {}),
    ...(card.is_champion ? { is_champion: true } : {}),
  }));
}

/** Export follows deck read access. */
export function exportReads(ctx: DeckRouteContext) {
  const { repository, load } = ctx;
  return (
    new Elysia()
      .use(ctx.optionalAuthPlugin)

      // ── GET /decks/:id/export ─────────────────────────────────────────
      .get(
        "/decks/:id/export",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user?.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (!canRead(loaded.deck, loaded.role)) {
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          const cards = await repository.getDeckCards(loaded.deck.id);
          return { name: loaded.deck.name, text: formatDeckText(exportCards(cards)) };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ name: t.String(), text: t.String() }),
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Export a deck as text",
            description: "Moxfield-style plain text, round-trippable through import.",
          },
        },
      )
  );
}

/** Import creates a deck, so it needs an owner. */
export function importWrites(ctx: DeckRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── POST /decks/import ────────────────────────────────────────────
      .post(
        "/decks/import",
        async ({ body, user, set }) => {
          if (!repository) return unavailable(set);
          const parsed = parseDeckText(body.text);

          const format = await repository.getFormatByCode(body.format ?? "standard");
          if (!format) {
            set.status = 400;
            return { error: "Unknown format.", code: "UNKNOWN_FORMAT" };
          }

          // Resolving a name (and optional set/collector) to an oracle and
          // printing is the API's job — only it can see the catalogue.
          const candidates = await repository.findPrintingsByNames(
            parsed.cards.map((card) => normalizeCardName(card.name)),
          );
          const byName = new Map<string, DeckCardBase[]>();
          for (const card of candidates) {
            const list = byName.get(card.name_normalized) ?? [];
            list.push(card);
            byName.set(card.name_normalized, list);
          }
          const preferred = new Map(
            (
              await repository.getPreferredPrintings([
                ...new Set(candidates.map((card) => card.oracle_id)),
              ])
            ).map((row) => [row.oracle_id, row.printing_id]),
          );

          const unresolved = [...parsed.errors];
          const changes = new Map<string, DeckCardChange>();

          for (const line of parsed.cards) {
            const pool = byName.get(normalizeCardName(line.name));
            if (!pool || pool.length === 0) {
              unresolved.push({
                line: line.line,
                text: line.name,
                message: "No card with that name.",
              });
              continue;
            }
            const picked = pickPrinting(pool, line.set_code, line.collector_number, preferred);
            // A bare list has no zone headers, so honour the parsed zone
            // only when the card can actually sit there.
            const eligible = zoneForCard(picked.card_type, picked.supertype, picked.is_token);
            const zone: DeckZone = eligible.includes(line.zone) ? line.zone : eligible[0]!;
            const key = `${zone}:${picked.printing_id}`;
            const existing = changes.get(key);
            if (existing) {
              existing.quantity += line.quantity;
              existing.is_champion = existing.is_champion || line.is_champion === true;
              continue;
            }
            // Folding into a row already in the batch is free; a new row is
            // not, so the cap is checked here and the line is reported
            // rather than silently dropped.
            if (changes.size >= CARD_BATCH_MAX) {
              unresolved.push({
                line: line.line,
                text: line.name,
                message: `An import carries at most ${CARD_BATCH_MAX} distinct cards.`,
              });
              continue;
            }
            changes.set(key, {
              zone,
              printing_id: picked.printing_id,
              oracle_id: picked.oracle_id,
              quantity: line.quantity,
              is_champion: line.is_champion === true,
            });
          }

          const deck = await repository.createDeck({
            owner_id: user.id,
            format_id: format.id,
            name: (body.name ?? "Imported deck").trim().slice(0, NAME_MAX) || "Imported deck",
            visibility: (body.visibility ?? "private") as DeckVisibility,
          });

          if (changes.size > 0) {
            const result = await repository.callRpc("deck_apply_card_changes", {
              p_deck_id: deck.id,
              p_author: user.id,
              p_changes: [...changes.values()],
            });
            if (!result.ok) {
              const failure = rpcFailure(result.reason);
              set.status = failure.status;
              return failure.body;
            }
          }

          set.status = 201;
          return {
            ...deckShape(deck, format, await ownerProfile(repository, user.id), "owner"),
            favorite_count: 0,
            is_favorited: false,
            imported: changes.size,
            unresolved,
          };
        },
        {
          body: t.Object({
            text: t.String({ maxLength: 100_000 }),
            name: t.Optional(t.String({ maxLength: NAME_MAX })),
            format: t.Optional(t.String()),
            visibility: t.Optional(VisibilitySchema),
          }),
          response: {
            201: t.Composite([
              t.Omit(DeckDetailSchema, ["cards", "tokens", "violations"]),
              t.Object({
                imported: t.Number(),
                unresolved: t.Array(
                  t.Object({
                    line: t.Number(),
                    text: t.String(),
                    message: t.String(),
                  }),
                ),
              }),
            ]),
            400: ErrorSchema,
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Import a deck from text",
            description:
              "Moxfield-style text. Lines that cannot be resolved are reported; the rest of the list still imports.",
          },
        },
      )
  );
}

/**
 * Choose which printing a text line meant: the named one, else the set, else
 * the oracle's preferred printing, else whatever the catalogue lists first.
 */
function pickPrinting(
  pool: DeckCardBase[],
  setCode: string | undefined,
  collectorNumber: string | undefined,
  preferred: Map<string, string>,
): DeckCardBase {
  const set = setCode?.toLowerCase();
  const collector = collectorNumber?.toLowerCase();
  if (set && collector) {
    const exact = pool.find(
      (card) =>
        card.set_code?.toLowerCase() === set && card.collector_number?.toLowerCase() === collector,
    );
    if (exact) return exact;
  }
  if (set) {
    const inSet = pool.find((card) => card.set_code?.toLowerCase() === set);
    if (inSet) return inSet;
  }
  const preferredCard = pool.find((card) => preferred.get(card.oracle_id) === card.printing_id);
  return preferredCard ?? pool[0]!;
}
