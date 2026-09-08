import { t, Elysia } from "elysia";
import type { CollaboratorRole } from "../../repos/decks.repo";
import { canRead } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { RoleSchema } from "./schemas";
import { unavailable, type DeckRouteContext } from "./shared";

// ─── Deck invites and collaborators ───────────────────────────────────────────

/** Unambiguous alphabet — no 0/O or 1/I, because invite codes get read aloud. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateInviteCode(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** Invites, joining by code and the roster. Owner-only except joining. */
export function collaboratorWrites(ctx: DeckRouteContext) {
  const { repository, load } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── POST /decks/:id/invite ────────────────────────────────────────
      .post(
        "/decks/:id/invite",
        async ({ params, body, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (loaded.role !== "owner") {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "Only the owner manages invites.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }

          // Regenerating replaces the link and nothing else: redemption
          // wrote a `deck_collaborators` row, so existing collaborators
          // keep their access and stay individually revocable.
          const code = generateInviteCode();
          const role = (body.role ?? "editor") as CollaboratorRole;
          await repository.setInvite(loaded.deck.id, code, role);
          return { invite_code: code, invite_role: role };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({ role: t.Optional(RoleSchema) }),
          response: {
            200: t.Object({ invite_code: t.String(), invite_role: t.String() }),
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Create or regenerate the invite link",
            description:
              "Owner only. Issues a fresh code granting `role` (default `editor`). " +
              "Regenerating replaces the link and nothing else: anyone who already " +
              "redeemed it keeps their access.",
          },
        },
      )

      // ── DELETE /decks/:id/invite ──────────────────────────────────────
      .delete(
        "/decks/:id/invite",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (loaded.role !== "owner") {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "Only the owner manages invites.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }
          await repository.clearInvite(loaded.deck.id);
          return { message: "Invite link disabled." };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Disable the invite link",
            description: "Owner only. Existing collaborators are unaffected.",
          },
        },
      )

      // ── POST /decks/join/:code ────────────────────────────────────────
      .post(
        "/decks/join/:code",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const deck = await repository.getDeckByInviteCode(params.code);
          if (!deck || !deck.invite_role) {
            set.status = 404;
            return { error: "Invite link not found", code: "NOT_FOUND" };
          }
          if (deck.owner_id === user.id) {
            return { deck_id: deck.id, role: "owner" };
          }
          const existing = await repository.getCollaboratorRole(deck.id, user.id);
          if (!existing) {
            await repository.addCollaborator(deck.id, user.id, deck.invite_role, "link");
          }
          return { deck_id: deck.id, role: existing ?? deck.invite_role };
        },
        {
          params: t.Object({ code: t.String() }),
          response: {
            200: t.Object({ deck_id: t.String(), role: t.String() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Redeem an invite link",
            description:
              "Inserts a collaborator row, so revoking the link later does not revoke this access.",
          },
        },
      )

      // ── POST /decks/:id/collaborators ─────────────────────────────────
      .post(
        "/decks/:id/collaborators",
        async ({ params, body, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (loaded.role !== "owner") {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "Only the owner manages collaborators.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }
          const profile = await repository.getProfileByHandle(body.handle.toLowerCase());
          if (!profile) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }
          if (profile.id === loaded.deck.owner_id) {
            set.status = 400;
            return { error: "The owner is already on the deck.", code: "IS_OWNER" };
          }
          await repository.addCollaborator(
            loaded.deck.id,
            profile.id,
            body.role ?? "editor",
            "invite",
          );
          return {
            user_id: profile.id,
            handle: profile.handle,
            role: body.role ?? "editor",
          };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({ handle: t.String(), role: t.Optional(RoleSchema) }),
          response: {
            200: t.Object({
              user_id: t.String(),
              handle: t.String(),
              role: t.String(),
            }),
            400: ErrorSchema,
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Invite a collaborator by handle",
            description:
              "Owner only. Adds the user directly with `role` (default `editor`); " +
              "the owner cannot be added.",
          },
        },
      )

      // ── DELETE /decks/:id/collaborators ───────────────────────────────
      .delete(
        "/decks/:id/collaborators",
        async ({ params, query, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (loaded.role !== "owner") {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "Only the owner manages collaborators.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }
          const profile = await repository.getProfileByHandle(query.handle.toLowerCase());
          if (!profile) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }
          await repository.removeCollaborator(loaded.deck.id, profile.id);
          return { message: "Collaborator removed." };
        },
        {
          params: t.Object({ id: t.String() }),
          query: t.Object({ handle: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Remove a collaborator",
            description: "Owner only. Names the collaborator by `?handle=`.",
          },
        },
      )
  );
}
