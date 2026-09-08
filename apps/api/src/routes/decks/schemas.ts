import { t } from "elysia";
import { DECK_ZONES } from "@riftseer/types/deck";
import { PrintingImageSchema } from "../../schemas";

// ─── Deck schemas ─────────────────────────────────────────────────────────────
//
// The wire shapes of every deck route. Shared here because a deck detail is
// returned by the create, get and import routes alike.

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const FormatSchema = t.Object({
  id: t.String(),
  code: t.String(),
  name: t.String(),
});

export const ProfileStubSchema = t.Object({
  id: t.String(),
  handle: t.String(),
  username: t.String(),
});

export const DeckSummarySchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  visibility: t.String(),
  format: t.Nullable(FormatSchema),
  owner: t.Nullable(ProfileStubSchema),
  role: t.Nullable(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
  favorite_count: t.Number(),
  view_count: t.Number(),
  /** Only present for an authenticated caller. */
  is_favorited: t.Optional(t.Boolean()),
});

export const DeckFolderSchema = t.Object({
  id: t.String(),
  name: t.String(),
  deck_count: t.Number(),
  /** Present only when the listing was asked about one deck (`?deck=`). */
  contains_deck: t.Optional(t.Boolean()),
  created_at: t.String(),
  updated_at: t.String(),
});

export const CardBaseFields = {
  printing_id: t.String(),
  oracle_id: t.String(),
  name: t.String(),
  card_type: t.Nullable(t.String()),
  supertype: t.Nullable(t.String()),
  is_token: t.Boolean(),
  domains: t.Array(t.String()),
  energy: t.Nullable(t.Number()),
  might: t.Nullable(t.Number()),
  power: t.Nullable(t.Number()),
  set_code: t.Nullable(t.String()),
  collector_number: t.Nullable(t.String()),
  rarity: t.Nullable(t.String()),
  public_slug: t.Nullable(t.String()),
  has_hosted_image: t.Boolean(),
  /** Derived art URLs — see `DeckCardBase.image`. Absent when no art exists. */
  image: t.Optional(PrintingImageSchema),
};

export const DeckCardSchema = t.Object({
  ...CardBaseFields,
  zone: t.String(),
  quantity: t.Number(),
  is_champion: t.Boolean(),
  /** Manual tags, oracle-keyed: both rows of a two-art card carry the same list. */
  tags: t.Array(t.String()),
});

export const DeckTokenSchema = t.Object({
  ...CardBaseFields,
  /** Deck oracles whose `makes_token` edges put this token here. */
  sources: t.Array(t.String()),
});

export const ViolationSchema = t.Object({
  code: t.String(),
  severity: t.String(),
  zone: t.Optional(t.String()),
  oracle_id: t.Optional(t.String()),
  printing_id: t.Optional(t.String()),
  scope: t.Optional(t.String()),
  status: t.Optional(t.String()),
  count: t.Optional(t.Number()),
  limit: t.Optional(t.Number()),
  message: t.String(),
});

export const CollaboratorSchema = t.Object({
  user_id: t.String(),
  handle: t.Nullable(t.String()),
  username: t.Nullable(t.String()),
  role: t.String(),
  added_via: t.String(),
  created_at: t.String(),
});

export const DeckDetailSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  primer: t.Nullable(t.String()),
  visibility: t.String(),
  format: t.Nullable(FormatSchema),
  owner: t.Nullable(ProfileStubSchema),
  role: t.Nullable(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
  favorite_count: t.Number(),
  view_count: t.Number(),
  /** Only present for an authenticated caller. */
  is_favorited: t.Optional(t.Boolean()),
  cards: t.Array(DeckCardSchema),
  tokens: t.Array(DeckTokenSchema),
  violations: t.Array(ViolationSchema),
  collaborators: t.Optional(t.Array(CollaboratorSchema)),
  invite_code: t.Optional(t.Nullable(t.String())),
  invite_role: t.Optional(t.Nullable(t.String())),
});

export const CardsResponseSchema = t.Object({
  revision_id: t.Nullable(t.String()),
  cards: t.Array(DeckCardSchema),
  tokens: t.Array(DeckTokenSchema),
  violations: t.Array(ViolationSchema),
});

export const RevisionSchema = t.Object({
  id: t.String(),
  ordinal: t.Number(),
  author: t.Nullable(ProfileStubSchema),
  format_id: t.String(),
  created_at: t.String(),
  changes: t.Array(
    t.Object({
      zone: t.String(),
      oracle_id: t.String(),
      printing_id: t.String(),
      name: t.Nullable(t.String()),
      qty_before: t.Number(),
      qty_after: t.Number(),
    }),
  ),
});

export const VisibilitySchema = t.Union([
  t.Literal("private"),
  t.Literal("unlisted"),
  t.Literal("public"),
]);

export const RoleSchema = t.Union([t.Literal("editor"), t.Literal("viewer")]);

export const ZoneSchema = t.Union(DECK_ZONES.map((zone) => t.Literal(zone)) as never);

export const CardChangeSchema = t.Object({
  zone: ZoneSchema,
  printing_id: t.String(),
  oracle_id: t.Optional(t.Nullable(t.String())),
  quantity: t.Number({ minimum: 0, maximum: 999 }),
  is_champion: t.Optional(t.Boolean()),
});

export const DeckCommentSchema = t.Object({
  id: t.String(),
  parent_id: t.Nullable(t.String()),
  depth: t.Number(),
  /** Null exactly when `deleted` — the tombstone keeps the thread shape. */
  body: t.Nullable(t.String()),
  deleted: t.Boolean(),
  created_at: t.String(),
  author: t.Nullable(ProfileStubSchema),
  /** What the *caller* may do; the UI never re-derives moderation rules. */
  can_delete: t.Optional(t.Boolean()),
  like_count: t.Number(),
  /** Only present for an authenticated caller. */
  is_liked: t.Optional(t.Boolean()),
});
