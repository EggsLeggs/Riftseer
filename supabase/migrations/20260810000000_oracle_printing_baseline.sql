-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  RiftSeer — oracle/printing baseline                                    │
-- │                                                                         │
-- │  This file replaces the 29 migrations that preceded it. It is the       │
-- │  squashed baseline: the whole schema, stated once. Migrations stay      │
-- │  append-only after it.                                                  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The model is two levels.
--
--   oracle    The rules object. Not a physical card. Everything true of the
--             card regardless of which piece of cardboard you hold: name,
--             type, tags, rules text, equip data, relationships, meta flags.
--
--   printing  The physical card: art, artist, flavour, rarity, collector
--             number, set, finishes, marketplace data — plus a delta layer
--             for the places one printing genuinely differs from its oracle.
--
-- Two mechanisms that look similar and are not:
--
--   printing_deltas   The card really differs. Vayne carries `Sentinel` on
--                     newer printings but not the original: the oracle has
--                     the tag and the old printing carries a `remove` delta,
--                     so printings that arrive later inherit correctly with
--                     no action. Ingest owns source='ingest' rows and never
--                     touches source='admin' rows.
--
--   locked_fields     An admin decided a value and ingest must not undo it.
--                     Admin writes the real column and appends the field
--                     name; the ingest upsert keeps the stored value for any
--                     field named there. This is what replaces the whole
--                     card_overrides / manual_cards overlay: a manual card is
--                     a row with source='manual' that pruning skips, and a
--                     deletion is deleted_at rather than a tombstone table.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Shared helpers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION escape_ilike_pattern(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(coalesce(v, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Base keys for the `[Keyword]` badges a rules text carries: `[Deflect 3]` →
-- `deflect`. Mirrored in TypeScript by extractCardKeywords() in
-- packages/types/src/keywords.ts; the two must agree.
CREATE OR REPLACE FUNCTION card_keywords_from_text(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}'::text[])
  FROM (
    SELECT regexp_replace(
             regexp_replace(lower(btrim(m[1])), '\s+\d+$', ''),
             '\s+', ' ', 'g'
           ) AS k
    FROM regexp_matches(coalesce(p_text, ''), '\[([^\[\]]+)\]', 'g') AS m
    WHERE btrim(m[1]) ~ '^[A-Za-z]'
      AND length(btrim(m[1])) <= 40
      AND btrim(m[1]) !~* '^no text$'
  ) s
  WHERE k <> '';
$$;

-- The one implementation of "array field, plus adds, minus removes". Every
-- array-valued delta (tags, domains, keywords, meta flags) resolves through
-- this, so they cannot drift apart. Result is sorted and distinct so a
-- projection row is byte-stable and ingest diffing stays cheap.
CREATE OR REPLACE FUNCTION apply_array_delta(
  p_base    text[],
  p_added   text[],
  p_removed text[]
) RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT v ORDER BY v), '{}'::text[])
  FROM (
    SELECT unnest(coalesce(p_base, '{}'::text[])) AS v
    UNION
    SELECT unnest(coalesce(p_added, '{}'::text[]))
  ) s
  WHERE v <> ''
    AND NOT (v = ANY (coalesce(p_removed, '{}'::text[])));
$$;

-- ── sets ──────────────────────────────────────────────────────────────────────

CREATE TABLE sets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_code        text        NOT NULL UNIQUE,
  set_name        text        NOT NULL,
  set_uri         text,
  set_search_uri  text,
  card_count      integer,
  published_on    date,
  is_promo        boolean     NOT NULL DEFAULT false,
  parent_set_code text,
  riftcodex_set_id   text,
  tcgplayer_group_id text,
  cardmarket_id      text,
  locked_fields   text[]      NOT NULL DEFAULT '{}',
  source          text        NOT NULL DEFAULT 'riftcodex'
                              CHECK (source IN ('riftcodex', 'manual')),
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sets_tcgplayer_group_idx ON sets (tcgplayer_group_id)
  WHERE tcgplayer_group_id IS NOT NULL;
CREATE INDEX sets_live_idx ON sets (set_code) WHERE deleted_at IS NULL;

CREATE TRIGGER sets_updated_at
  BEFORE UPDATE ON sets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE sets ENABLE ROW LEVEL SECURITY;

-- ── artists ───────────────────────────────────────────────────────────────────

CREATE TABLE artists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;

-- ── oracles ───────────────────────────────────────────────────────────────────
--
-- `oracle_key` is a stable name-derived lookup slug, and nothing more. It is
-- NOT the identity: printings carry `oracle_id`, a real surrogate key. Ingest
-- uses oracleKeyForName() as a *matching heuristic* to attach a new printing
-- to an existing oracle; a printing it cannot match goes to the review queue
-- rather than silently creating a second oracle.

CREATE TABLE oracles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  oracle_key      text        NOT NULL UNIQUE,
  slug            text        NOT NULL UNIQUE,
  name            text        NOT NULL,
  name_normalized text        NOT NULL,

  card_type       text,
  supertype       text,
  -- A token has a card_type (Unit, Gear, Battlefield) *and* is a token, so
  -- this does not fold into card_type without losing one of them.
  is_token        boolean     NOT NULL DEFAULT false,

  energy          integer,
  might           integer,
  power           integer,
  -- The `[Equip]` gear second text box. RiftCodex omits it entirely; the
  -- official gallery is the only source. A might_bonus of 0 is a real printed
  -- value, so presence — never truthiness — decides whether a card is
  -- equipment.
  might_bonus     integer,
  equipment_text  text,

  text_rich       text,
  text_plain      text,

  -- Derived by trigger from text_rich, so ingest, admin patches and manual
  -- creation all stay in sync without each remembering to recompute it.
  keywords        text[]      NOT NULL DEFAULT '{}',
  tags            text[]      NOT NULL DEFAULT '{}',
  domains         text[]      NOT NULL DEFAULT '{}',
  -- Searchable `is:` flags that are not printed on the card. Extensible
  -- without a migration per flag.
  meta_flags      text[]      NOT NULL DEFAULT '{}',

  preferred_printing_id     text,
  preferred_printing_locked boolean NOT NULL DEFAULT false,

  locked_fields   text[]      NOT NULL DEFAULT '{}',
  source          text        NOT NULL DEFAULT 'riftcodex'
                              CHECK (source IN ('riftcodex', 'manual')),
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  ingested_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oracles_name_normalized_idx ON oracles (name_normalized);
CREATE INDEX oracles_keywords_idx   ON oracles USING GIN (keywords);
CREATE INDEX oracles_tags_idx       ON oracles USING GIN (tags);
CREATE INDEX oracles_domains_idx    ON oracles USING GIN (domains);
CREATE INDEX oracles_meta_flags_idx ON oracles USING GIN (meta_flags);
CREATE INDEX oracles_live_idx       ON oracles (id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION oracles_set_keywords()
RETURNS TRIGGER AS $$
BEGIN
  NEW.keywords := card_keywords_from_text(
    coalesce(NEW.text_rich, NEW.text_plain, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oracles_keywords_sync
  BEFORE INSERT OR UPDATE ON oracles
  FOR EACH ROW EXECUTE FUNCTION oracles_set_keywords();

CREATE TRIGGER oracles_updated_at
  BEFORE UPDATE ON oracles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE oracles ENABLE ROW LEVEL SECURITY;

-- ── printings ─────────────────────────────────────────────────────────────────
--
-- `id` is the RiftCodex Mongo ObjectId (24-char hex text, not a uuid). Deck
-- short-form strings already in the wild encode these, so they must stay
-- stable across a re-ingest.

CREATE TABLE printings (
  id               text        PRIMARY KEY,
  oracle_id        uuid        NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  set_id           uuid        NOT NULL REFERENCES sets(id)    ON DELETE RESTRICT,
  artist_id        uuid        REFERENCES artists(id)          ON DELETE SET NULL,

  collector_number text,
  released_at      date,
  -- Printing-level, deliberately. TCGPlayer treats Showcase as a rarity while
  -- RiftCodex and the official gallery report the base card's rarity on an
  -- alternate-art or showcase printing. That disagreement is real, not noise.
  rarity           text,

  -- Pinned on first insert and never overwritten, so public URLs do not drift
  -- as upstream data is corrected.
  public_slug      text        NOT NULL UNIQUE,
  flavour_text     text,
  finishes         text[]      NOT NULL DEFAULT '{}',

  is_signature          boolean NOT NULL DEFAULT false,
  is_alternate_art      boolean NOT NULL DEFAULT false,
  is_overnumbered       boolean NOT NULL DEFAULT false,
  is_special_collection boolean NOT NULL DEFAULT false,

  riftcodex_id  text,
  riftbound_id  text,
  tcgplayer_id  text,
  cardmarket_id text,

  -- Hosted variant URLs are derived from `id` and CARD_IMAGE_BASE_URL, so
  -- there is nothing to store: image_hosted_at IS NOT NULL means the full R2
  -- set exists. `image_source_hash` is the source-URL hash — unchanged
  -- completed media is reused, changed sources are re-queued, and the publish
  -- RPC verifies the current hash before writing.
  image_source_url      text,
  image_source_hash     text,
  image_source_provider text CHECK (
    image_source_provider IS NULL
    OR image_source_provider IN ('riftcodex', 'tcgplayer', 'admin')
  ),
  image_orientation text,
  image_alt_text    text,
  image_hosted_at   timestamptz,

  -- TCGPlayer only. No cardmarket price columns: nothing writes them, and a
  -- column needs a writer as well as a reader.
  price_normal     numeric,
  price_foil       numeric,
  price_low_normal numeric,
  price_low_foil   numeric,

  tcgplayer_url  text,
  cardmarket_url text,

  locked_fields text[]      NOT NULL DEFAULT '{}',
  source        text        NOT NULL DEFAULT 'riftcodex'
                            CHECK (source IN ('riftcodex', 'manual')),
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  ingested_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX printings_oracle_idx    ON printings (oracle_id);
CREATE INDEX printings_set_idx       ON printings (set_id);
CREATE INDEX printings_artist_idx    ON printings (artist_id);
CREATE INDEX printings_collector_idx ON printings (set_id, collector_number);
CREATE INDEX printings_tcgplayer_idx ON printings (tcgplayer_id) WHERE tcgplayer_id IS NOT NULL;
CREATE INDEX printings_riftbound_idx ON printings (riftbound_id) WHERE riftbound_id IS NOT NULL;
CREATE INDEX printings_live_idx      ON printings (id) WHERE deleted_at IS NULL;

CREATE TRIGGER printings_updated_at
  BEFORE UPDATE ON printings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE printings ENABLE ROW LEVEL SECURITY;

ALTER TABLE oracles
  ADD CONSTRAINT oracles_preferred_printing_fkey
  FOREIGN KEY (preferred_printing_id) REFERENCES printings(id) ON DELETE SET NULL;

CREATE INDEX oracles_preferred_printing_idx ON oracles (preferred_printing_id);

-- ── printing_deltas ───────────────────────────────────────────────────────────
--
-- Typed columns rather than a generic (field, op, value) table: a delta is
-- checkable, constrainable and greppable this way, and the field vocabulary is
-- closed regardless.
--
-- Arrays support add and remove. Scalars support override and clear only —
-- there is nothing to "add to" a rules text. NULL in an override column means
-- inherit, so clearing needs its own channel: `cleared_fields`.

CREATE TABLE printing_deltas (
  printing_id text PRIMARY KEY REFERENCES printings(id) ON DELETE CASCADE,

  tags_added         text[] NOT NULL DEFAULT '{}',
  tags_removed       text[] NOT NULL DEFAULT '{}',
  domains_added      text[] NOT NULL DEFAULT '{}',
  domains_removed    text[] NOT NULL DEFAULT '{}',
  keywords_added     text[] NOT NULL DEFAULT '{}',
  keywords_removed   text[] NOT NULL DEFAULT '{}',
  meta_flags_added   text[] NOT NULL DEFAULT '{}',
  meta_flags_removed text[] NOT NULL DEFAULT '{}',

  name_override           text,
  card_type_override      text,
  supertype_override      text,
  energy_override         integer,
  might_override          integer,
  power_override          integer,
  might_bonus_override    integer,
  text_rich_override      text,
  text_plain_override     text,
  equipment_text_override text,

  cleared_fields text[] NOT NULL DEFAULT '{}',

  source     text        NOT NULL CHECK (source IN ('ingest', 'admin')),
  note       text,
  edited_by  uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT printing_deltas_cleared_fields_check CHECK (
    cleared_fields <@ ARRAY[
      'name', 'card_type', 'supertype', 'energy', 'might', 'power',
      'might_bonus', 'text_rich', 'text_plain', 'equipment_text'
    ]::text[]
  )
);

CREATE INDEX printing_deltas_source_idx ON printing_deltas (source);

CREATE TRIGGER printing_deltas_updated_at
  BEFORE UPDATE ON printing_deltas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE printing_deltas ENABLE ROW LEVEL SECURITY;

-- ── oracle_relationships ──────────────────────────────────────────────────────
--
-- Oracle → oracle edges, stored once. The six denormalised JSONB stub arrays
-- this replaces were four reverse views and a self-join:
--
--   all_parts / used_by             → one `makes_token` edge, reversed by query
--   related_champions / _legends    → one `character` edge (legend → champion)
--   related_signatures + reverse    → one `signature` edge
--   related_printings               → gone: printings WHERE oracle_id = …
--
-- There is no printing-scoped relationship override. Printing scope only ever
-- existed because there was no oracle row to hang the edge on; a relationship
-- is a property of the rules object.

CREATE TABLE oracle_relationships (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_oracle_id uuid        NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  to_oracle_id   uuid        NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  kind           text        NOT NULL CHECK (kind IN ('makes_token', 'character', 'signature')),
  source         text        NOT NULL CHECK (source IN ('ingest', 'admin')),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT oracle_relationships_unique UNIQUE (from_oracle_id, kind, to_oracle_id),
  CONSTRAINT oracle_relationships_no_self CHECK (from_oracle_id <> to_oracle_id)
);

CREATE INDEX oracle_relationships_to_idx     ON oracle_relationships (to_oracle_id, kind);
CREATE INDEX oracle_relationships_source_idx ON oracle_relationships (source);

ALTER TABLE oracle_relationships ENABLE ROW LEVEL SECURITY;

-- ── resolved_printings ────────────────────────────────────────────────────────
--
-- The projection: one flat row per printing with oracle fields resolved
-- through the delta layer. Search must never resolve deltas per row at query
-- time, and `card_search_ast_to_sql` — which is also the ruling-rule language
-- — keeps scanning exactly one relation, as it always has.
--
-- Maintained by trigger on every table that can change a resolved value.

CREATE TABLE resolved_printings (
  printing_id text PRIMARY KEY REFERENCES printings(id) ON DELETE CASCADE,
  oracle_id   uuid NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,

  name            text NOT NULL,
  name_normalized text NOT NULL,
  name_search     tsvector,

  card_type      text,
  supertype      text,
  is_token       boolean NOT NULL DEFAULT false,
  energy         integer,
  might          integer,
  power          integer,
  might_bonus    integer,
  text_rich      text,
  text_plain     text,
  equipment_text text,

  keywords   text[] NOT NULL DEFAULT '{}',
  tags       text[] NOT NULL DEFAULT '{}',
  domains    text[] NOT NULL DEFAULT '{}',
  meta_flags text[] NOT NULL DEFAULT '{}',
  -- Token oracle names reachable by a `makes_token` edge — backs `produces:`.
  produces   text[] NOT NULL DEFAULT '{}',

  set_id           uuid,
  set_code         text,
  set_name         text,
  published_on     date,
  collector_number text,
  released_at      date,
  rarity           text,
  artist_id        uuid,
  artist_name      text,
  public_slug      text,

  finishes              text[] NOT NULL DEFAULT '{}',
  is_signature          boolean NOT NULL DEFAULT false,
  is_alternate_art      boolean NOT NULL DEFAULT false,
  is_overnumbered       boolean NOT NULL DEFAULT false,
  is_special_collection boolean NOT NULL DEFAULT false,
  is_promo_set          boolean NOT NULL DEFAULT false,
  has_hosted_image      boolean NOT NULL DEFAULT false,

  source     text,
  has_delta  boolean NOT NULL DEFAULT false,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX resolved_printings_oracle_idx     ON resolved_printings (oracle_id);
CREATE INDEX resolved_printings_name_norm_idx  ON resolved_printings (name_normalized);
CREATE INDEX resolved_printings_name_search_idx ON resolved_printings USING GIN (name_search);
CREATE INDEX resolved_printings_keywords_idx   ON resolved_printings USING GIN (keywords);
CREATE INDEX resolved_printings_tags_idx       ON resolved_printings USING GIN (tags);
CREATE INDEX resolved_printings_domains_idx    ON resolved_printings USING GIN (domains);
CREATE INDEX resolved_printings_meta_flags_idx ON resolved_printings USING GIN (meta_flags);
CREATE INDEX resolved_printings_produces_idx   ON resolved_printings USING GIN (produces);
CREATE INDEX resolved_printings_set_idx        ON resolved_printings (set_id, collector_number);
CREATE INDEX resolved_printings_artist_idx     ON resolved_printings (artist_id);

ALTER TABLE resolved_printings ENABLE ROW LEVEL SECURITY;

-- Rebuild the projection for a set of printings, or for all of them when
-- p_printing_ids is NULL. Deleted oracles and printings are excluded, which
-- is what makes deleted_at a real soft delete for every reader.
CREATE OR REPLACE FUNCTION refresh_resolved_printings(p_printing_ids text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_printing_ids IS NULL THEN
    DELETE FROM resolved_printings;
  ELSE
    DELETE FROM resolved_printings WHERE printing_id = ANY (p_printing_ids);
  END IF;

  WITH produced AS (
    SELECT rel.from_oracle_id AS oracle_id,
           coalesce(array_agg(DISTINCT tok.name ORDER BY tok.name), '{}'::text[]) AS names
    FROM oracle_relationships rel
    JOIN oracles tok ON tok.id = rel.to_oracle_id AND tok.deleted_at IS NULL
    WHERE rel.kind = 'makes_token'
    GROUP BY rel.from_oracle_id
  ),
  resolved AS (
    SELECT
      p.id AS printing_id,
      o.id AS oracle_id,
      CASE WHEN 'name' = ANY (d.cleared_fields) THEN o.name
           ELSE coalesce(d.name_override, o.name) END AS name,
      CASE WHEN 'card_type' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.card_type_override, o.card_type) END AS card_type,
      CASE WHEN 'supertype' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.supertype_override, o.supertype) END AS supertype,
      CASE WHEN 'energy' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.energy_override, o.energy) END AS energy,
      CASE WHEN 'might' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.might_override, o.might) END AS might,
      CASE WHEN 'power' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.power_override, o.power) END AS power,
      CASE WHEN 'might_bonus' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.might_bonus_override, o.might_bonus) END AS might_bonus,
      CASE WHEN 'text_rich' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.text_rich_override, o.text_rich) END AS text_rich,
      CASE WHEN 'text_plain' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.text_plain_override, o.text_plain) END AS text_plain,
      CASE WHEN 'equipment_text' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.equipment_text_override, o.equipment_text) END AS equipment_text,
      o.is_token,
      apply_array_delta(o.tags,       d.tags_added,       d.tags_removed)       AS tags,
      apply_array_delta(o.domains,    d.domains_added,    d.domains_removed)    AS domains,
      apply_array_delta(o.meta_flags, d.meta_flags_added, d.meta_flags_removed) AS meta_flags,
      d.keywords_added,
      d.keywords_removed,
      (d.printing_id IS NOT NULL) AS has_delta,
      p.set_id, p.collector_number, p.released_at, p.rarity, p.artist_id,
      p.public_slug, p.finishes, p.is_signature, p.is_alternate_art,
      p.is_overnumbered, p.is_special_collection, p.source,
      (p.image_hosted_at IS NOT NULL) AS has_hosted_image,
      s.set_code, s.set_name, s.published_on, s.is_promo,
      a.name AS artist_name,
      coalesce(pr.names, '{}'::text[]) AS produces
    FROM printings p
    JOIN oracles o          ON o.id = p.oracle_id AND o.deleted_at IS NULL
    JOIN sets s             ON s.id = p.set_id
    LEFT JOIN artists a     ON a.id = p.artist_id
    LEFT JOIN printing_deltas d ON d.printing_id = p.id
    LEFT JOIN produced pr   ON pr.oracle_id = o.id
    WHERE p.deleted_at IS NULL
      AND (p_printing_ids IS NULL OR p.id = ANY (p_printing_ids))
  )
  INSERT INTO resolved_printings (
    printing_id, oracle_id, name, name_normalized, name_search,
    card_type, supertype, is_token, energy, might, power, might_bonus,
    text_rich, text_plain, equipment_text,
    keywords, tags, domains, meta_flags, produces,
    set_id, set_code, set_name, published_on, collector_number, released_at,
    rarity, artist_id, artist_name, public_slug,
    finishes, is_signature, is_alternate_art, is_overnumbered,
    is_special_collection, is_promo_set, has_hosted_image,
    source, has_delta
  )
  SELECT
    r.printing_id,
    r.oracle_id,
    r.name,
    -- Mirrors normalizeCardName() in packages/types/src/parser.ts.
    regexp_replace(
      regexp_replace(
        replace(replace(lower(r.name), '''', ''), '-', ' '),
        '[^\w\s]', '', 'g'
      ),
      '\s+', ' ', 'g'
    ),
    to_tsvector('simple', coalesce(r.name, '')),
    r.card_type, r.supertype, r.is_token, r.energy, r.might, r.power,
    r.might_bonus, r.text_rich, r.text_plain, r.equipment_text,
    -- Keywords come from the *resolved* rules text, so a printing whose text
    -- is overridden gets the badges its own text carries, then its own
    -- add/remove delta on top.
    apply_array_delta(
      card_keywords_from_text(coalesce(r.text_rich, r.text_plain, '')),
      r.keywords_added,
      r.keywords_removed
    ),
    r.tags, r.domains, r.meta_flags, r.produces,
    r.set_id, r.set_code, r.set_name, r.published_on, r.collector_number,
    r.released_at, r.rarity, r.artist_id, r.artist_name, r.public_slug,
    r.finishes, r.is_signature, r.is_alternate_art, r.is_overnumbered,
    r.is_special_collection, r.is_promo, r.has_hosted_image,
    r.source, r.has_delta
  FROM resolved r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Ingest rewrites the whole catalogue in bounded batches; refreshing the
-- projection per row would be thousands of redundant rebuilds. The ingest RPC
-- sets `riftseer.defer_projection` for its transaction and calls
-- refresh_resolved_printings() once at the end.
CREATE OR REPLACE FUNCTION projection_deferred()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('riftseer.defer_projection', true), 'off') = 'on';
$$;

CREATE OR REPLACE FUNCTION resolved_printings_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ids text[];
BEGIN
  IF projection_deferred() THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'printings' THEN
    v_ids := ARRAY[coalesce(NEW.id, OLD.id)];
  ELSIF TG_TABLE_NAME = 'printing_deltas' THEN
    v_ids := ARRAY[coalesce(NEW.printing_id, OLD.printing_id)];
  ELSIF TG_TABLE_NAME = 'oracles' THEN
    SELECT coalesce(array_agg(id), '{}'::text[]) INTO v_ids
    FROM printings WHERE oracle_id = coalesce(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'oracle_relationships' THEN
    -- Only `produces` depends on an edge, and only for the source oracle.
    SELECT coalesce(array_agg(id), '{}'::text[]) INTO v_ids
    FROM printings WHERE oracle_id = coalesce(NEW.from_oracle_id, OLD.from_oracle_id);
  ELSIF TG_TABLE_NAME = 'sets' THEN
    SELECT coalesce(array_agg(id), '{}'::text[]) INTO v_ids
    FROM printings WHERE set_id = coalesce(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'artists' THEN
    SELECT coalesce(array_agg(id), '{}'::text[]) INTO v_ids
    FROM printings WHERE artist_id = coalesce(NEW.id, OLD.id);
  END IF;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    PERFORM refresh_resolved_printings(v_ids);
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER printings_projection_sync
  AFTER INSERT OR UPDATE OR DELETE ON printings
  FOR EACH ROW EXECUTE FUNCTION resolved_printings_sync();

CREATE TRIGGER printing_deltas_projection_sync
  AFTER INSERT OR UPDATE OR DELETE ON printing_deltas
  FOR EACH ROW EXECUTE FUNCTION resolved_printings_sync();

CREATE TRIGGER oracles_projection_sync
  AFTER INSERT OR UPDATE OR DELETE ON oracles
  FOR EACH ROW EXECUTE FUNCTION resolved_printings_sync();

CREATE TRIGGER oracle_relationships_projection_sync
  AFTER INSERT OR UPDATE OR DELETE ON oracle_relationships
  FOR EACH ROW EXECUTE FUNCTION resolved_printings_sync();

CREATE TRIGGER sets_projection_sync
  AFTER UPDATE OR DELETE ON sets
  FOR EACH ROW EXECUTE FUNCTION resolved_printings_sync();

CREATE TRIGGER artists_projection_sync
  AFTER UPDATE OR DELETE ON artists
  FOR EACH ROW EXECUTE FUNCTION resolved_printings_sync();

-- ── preferred printing ────────────────────────────────────────────────────────
--
-- Computed default plus an explicit admin lock: `preferred_printing_locked`
-- gives a deliberate admin choice the same durability guarantee locked_fields
-- gives every other value.

CREATE OR REPLACE FUNCTION refresh_preferred_printings(p_oracle_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH ranked AS (
    SELECT
      p.oracle_id,
      p.id,
      row_number() OVER (
        PARTITION BY p.oracle_id
        ORDER BY
          (p.image_hosted_at IS NULL),
          (s.is_promo OR p.is_alternate_art OR p.is_special_collection OR p.is_signature),
          s.published_on DESC NULLS LAST,
          nullif(regexp_replace(coalesce(p.collector_number, ''), '\D', '', 'g'), '')::integer
            NULLS LAST,
          p.id
      ) AS rn
    FROM printings p
    JOIN sets s ON s.id = p.set_id
    WHERE p.deleted_at IS NULL
      AND (p_oracle_ids IS NULL OR p.oracle_id = ANY (p_oracle_ids))
  )
  UPDATE oracles o
  SET preferred_printing_id = ranked.id
  FROM ranked
  WHERE ranked.oracle_id = o.id
    AND ranked.rn = 1
    AND NOT o.preferred_printing_locked
    AND o.preferred_printing_id IS DISTINCT FROM ranked.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── formats and legalities ────────────────────────────────────────────────────
--
-- Default-legal: only non-legal statuses are stored at oracle level, and
-- precedence is printing row → oracle row → legal. An explicit 'legal' is
-- meaningful only on a printing, where it exempts one printing from a
-- card-wide ban.

CREATE TABLE formats (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  name       text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX formats_order_idx ON formats (sort_order, name);

CREATE TRIGGER formats_updated_at
  BEFORE UPDATE ON formats
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE formats ENABLE ROW LEVEL SECURITY;

CREATE TABLE oracle_legalities (
  oracle_id  uuid        NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  format_id  uuid        NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  status     text        NOT NULL CHECK (status IN ('legal', 'not_legal', 'banned')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (oracle_id, format_id)
);

CREATE INDEX oracle_legalities_format_idx ON oracle_legalities (format_id);

ALTER TABLE oracle_legalities ENABLE ROW LEVEL SECURITY;

CREATE TABLE printing_legalities (
  printing_id text        NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
  format_id   uuid        NOT NULL REFERENCES formats(id)   ON DELETE CASCADE,
  status      text        NOT NULL CHECK (status IN ('legal', 'not_legal', 'banned')),
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (printing_id, format_id)
);

CREATE INDEX printing_legalities_format_idx ON printing_legalities (format_id);

ALTER TABLE printing_legalities ENABLE ROW LEVEL SECURITY;

-- ── rulings ───────────────────────────────────────────────────────────────────
--
-- A ruling is separate from what it applies to. A target points one ruling at
-- a whole oracle, a single printing, or a saved search query. Query targets
-- are materialised into ruling_matches — refreshed on admin save, at the end
-- of every ingest, and per printing on every admin mutation — which is what
-- makes a rule cover cards written after it.

CREATE TABLE rulings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text        NOT NULL CHECK (type IN ('ruling', 'note')),
  text       text        NOT NULL CHECK (btrim(text) <> ''),
  dated      date,
  source     text,
  active     boolean     NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rulings_created_idx ON rulings (created_at DESC);

CREATE TRIGGER rulings_updated_at
  BEFORE UPDATE ON rulings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE rulings ENABLE ROW LEVEL SECURITY;

CREATE TABLE ruling_targets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ruling_id   uuid        NOT NULL REFERENCES rulings(id)   ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('oracle', 'printing', 'query')),
  oracle_id   uuid        REFERENCES oracles(id)   ON DELETE CASCADE,
  printing_id text        REFERENCES printings(id) ON DELETE CASCADE,
  query       text,
  ast         jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ruling_targets_shape CHECK (
    (kind = 'oracle'   AND oracle_id IS NOT NULL AND printing_id IS NULL AND ast IS NULL)
    OR (kind = 'printing' AND printing_id IS NOT NULL AND oracle_id IS NULL AND ast IS NULL)
    OR (kind = 'query'    AND ast IS NOT NULL AND oracle_id IS NULL AND printing_id IS NULL)
  )
);

CREATE INDEX ruling_targets_ruling_idx ON ruling_targets (ruling_id);
CREATE UNIQUE INDEX ruling_targets_oracle_uniq
  ON ruling_targets (ruling_id, oracle_id) WHERE kind = 'oracle';
CREATE UNIQUE INDEX ruling_targets_printing_uniq
  ON ruling_targets (ruling_id, printing_id) WHERE kind = 'printing';
CREATE INDEX ruling_targets_query_idx ON ruling_targets (id) WHERE kind = 'query';

ALTER TABLE ruling_targets ENABLE ROW LEVEL SECURITY;

-- Printing-keyed, because a rule can name printing-level fields
-- (`is:alternate`, `set:ogn`) as readily as oracle-level ones.
CREATE TABLE ruling_matches (
  target_id   uuid        NOT NULL REFERENCES ruling_targets(id) ON DELETE CASCADE,
  printing_id text        NOT NULL REFERENCES printings(id)      ON DELETE CASCADE,
  matched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_id, printing_id)
);

CREATE INDEX ruling_matches_printing_idx ON ruling_matches (printing_id);

ALTER TABLE ruling_matches ENABLE ROW LEVEL SECURITY;

-- ── reconciliation queue ──────────────────────────────────────────────────────
--
-- What ingest cannot reconcile is filed here for /admin/review rather than
-- applied. `source` says which observer raised the entry; `fingerprint` is the
-- identity of the discrepancy (including the observed upstream value), so a
-- dismissal survives while a genuinely new disagreement re-surfaces.

CREATE TABLE reconciliation_queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text        NOT NULL CHECK (
                            kind IN ('unmatched_product', 'field_diff',
                                     'missing_printing', 'unmatched_oracle')),
  source      text        NOT NULL CHECK (source IN ('tcgplayer', 'gallery')),
  fingerprint text        NOT NULL UNIQUE,
  payload     jsonb       NOT NULL DEFAULT '{}',
  proposed_printing_id text,
  proposed_oracle_id   uuid,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  note        text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reconciliation_queue_status_idx ON reconciliation_queue (status, created_at DESC);
CREATE INDEX reconciliation_queue_kind_idx   ON reconciliation_queue (kind);
CREATE INDEX reconciliation_queue_source_idx ON reconciliation_queue (source);
CREATE INDEX reconciliation_queue_printing_idx
  ON reconciliation_queue (proposed_printing_id) WHERE proposed_printing_id IS NOT NULL;

CREATE TRIGGER reconciliation_queue_updated_at
  BEFORE UPDATE ON reconciliation_queue
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE reconciliation_queue ENABLE ROW LEVEL SECURITY;

-- ── admin audit log ───────────────────────────────────────────────────────────

CREATE TABLE admin_audit_log (
  id          bigserial   PRIMARY KEY,
  actor_id    uuid        NOT NULL,
  action      text        NOT NULL,
  target_type text        NOT NULL,
  target_id   text,
  detail      jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx     ON admin_audit_log (target_type, target_id);
CREATE INDEX admin_audit_log_actor_idx      ON admin_audit_log (actor_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ── users ─────────────────────────────────────────────────────────────────────
--
-- The only tables with RLS policies. Everything above is service-role only:
-- RLS enabled with zero policies means anon and authenticated see no rows.

CREATE TABLE profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text        NOT NULL,
  handle       text        NOT NULL,
  bio          text,
  pronouns     text[]      NOT NULL DEFAULT '{}',
  social_links jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_length  CHECK (char_length(username) BETWEEN 1 AND 50),
  CONSTRAINT profiles_handle_format    CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT profiles_handle_unique    UNIQUE (handle),
  CONSTRAINT profiles_bio_length       CHECK (bio IS NULL OR char_length(bio) <= 300),
  CONSTRAINT profiles_pronouns_count   CHECK (
    array_length(pronouns, 1) IS NULL OR array_length(pronouns, 1) <= 3)
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE follows (
  follower_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX follows_follower_idx  ON follows (follower_id);
CREATE INDEX follows_following_idx ON follows (following_id);

-- One Riftseer account per external identity: the Metafy webhook resolves a
-- linked account by (provider, provider_user_id) with maybeSingle(), so a
-- duplicate on that pair would silently stop status updates.
CREATE TABLE linked_accounts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider          text        NOT NULL,
  provider_user_id  text        NOT NULL,
  provider_username text,
  access_token      text,
  refresh_token     text,
  is_supporter      boolean     NOT NULL DEFAULT false,
  is_member         boolean     NOT NULL DEFAULT false,
  status_checked_at timestamptz,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linked_accounts_user_provider_unique  UNIQUE (user_id, provider),
  CONSTRAINT linked_accounts_provider_identity_unique UNIQUE (provider, provider_user_id)
);

CREATE INDEX linked_accounts_user_id_idx ON linked_accounts (user_id);

CREATE TRIGGER linked_accounts_updated_at
  BEFORE UPDATE ON linked_accounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_public_read  ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_owner_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_owner_update ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY follows_public_read ON follows FOR SELECT USING (true);
CREATE POLICY follows_auth_insert ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY follows_auth_delete ON follows FOR DELETE USING (auth.uid() = follower_id);

-- ── search ────────────────────────────────────────────────────────────────────
--
-- The card search grammar is ALSO the ruling rule language: an admin-written
-- query is parsed by packages/core/src/card-search-query.ts, stored as its
-- AST, and evaluated by this same function. Adding a field to search adds it
-- to rules, and a leaf that cannot be rendered here must not parse there.
--
-- Every leaf renders against `r`, one row of resolved_printings, because the
-- projection has already applied the delta layer. Values pass through
-- quote_literal / escape_ilike_pattern; an unknown field or op raises rather
-- than silently matching everything.

CREATE OR REPLACE FUNCTION card_search_ast_to_sql(p_ast jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_op      text;
  v_children jsonb;
  v_child   jsonb;
  v_field   text;
  v_value   text;
  v_pattern text;
  v_clean   text;
  v_words   text[];
  v_parts   text[];
  v_word    text;
  v_i       int;
  v_cmp     text;
  v_num     numeric;
  v_expr    text;
  v_status  text;
BEGIN
  IF p_ast IS NULL OR jsonb_typeof(p_ast) <> 'object' THEN
    RETURN 'true';
  END IF;

  v_op := p_ast->>'op';

  IF v_op = 'and' THEN
    v_children := p_ast->'children';
    IF v_children IS NULL OR jsonb_array_length(v_children) = 0 THEN
      RETURN 'true';
    END IF;
    v_parts := ARRAY[]::text[];
    FOR v_i IN 0..(jsonb_array_length(v_children) - 1) LOOP
      v_parts := v_parts || ('(' || card_search_ast_to_sql(v_children->v_i) || ')');
    END LOOP;
    RETURN array_to_string(v_parts, ' AND ');
  END IF;

  IF v_op = 'or' THEN
    v_children := p_ast->'children';
    IF v_children IS NULL OR jsonb_array_length(v_children) = 0 THEN
      RETURN 'false';
    END IF;
    v_parts := ARRAY[]::text[];
    FOR v_i IN 0..(jsonb_array_length(v_children) - 1) LOOP
      v_parts := v_parts || ('(' || card_search_ast_to_sql(v_children->v_i) || ')');
    END LOOP;
    RETURN array_to_string(v_parts, ' OR ');
  END IF;

  IF v_op = 'not' THEN
    v_child := p_ast->'child';
    IF v_child IS NULL THEN
      RETURN 'true';
    END IF;
    RETURN 'NOT (' || card_search_ast_to_sql(v_child) || ')';
  END IF;

  IF v_op = 'text' THEN
    v_value := coalesce(p_ast->>'value', '');
    v_clean := trim(regexp_replace(lower(v_value), '[^a-z0-9 ]', ' ', 'g'));
    IF length(v_clean) = 0 THEN
      RETURN 'true';
    END IF;
    v_words := regexp_split_to_array(v_clean, '\s+');
    v_parts := ARRAY[]::text[];
    FOREACH v_word IN ARRAY v_words LOOP
      IF length(v_word) > 0 THEN
        v_parts := v_parts || (v_word || ':*');
      END IF;
    END LOOP;
    IF array_length(v_parts, 1) IS NULL THEN
      RETURN 'true';
    END IF;
    RETURN 'r.name_search @@ to_tsquery(''simple'', ' ||
           quote_literal(array_to_string(v_parts, ' & ')) || ')';
  END IF;

  IF v_op = 'exact_name' THEN
    RETURN 'r.name_normalized = ' || quote_literal(coalesce(p_ast->>'value', ''));
  END IF;

  IF v_op = 'filter' THEN
    v_field   := p_ast->>'field';
    v_value   := coalesce(p_ast->>'value', '');
    v_pattern := '%' || escape_ilike_pattern(v_value) || '%';

    IF v_field = 'type' THEN
      -- Match the type line broadly: type, supertype, or any tag.
      RETURN '(r.card_type ILIKE ' || quote_literal(v_pattern) ||
             ' OR r.supertype ILIKE ' || quote_literal(v_pattern) ||
             ' OR EXISTS (SELECT 1 FROM unnest(r.tags) tag WHERE tag ILIKE ' ||
             quote_literal(v_pattern) || '))';

    ELSIF v_field = 'supertype' THEN
      RETURN 'r.supertype ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'rarity' THEN
      -- Printing-level: `r:showcase` matches the showcase printing, not every
      -- printing of that card.
      RETURN 'r.rarity ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'artist' THEN
      RETURN 'r.artist_name ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'name' THEN
      RETURN 'r.name ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'tag' THEN
      RETURN 'EXISTS (SELECT 1 FROM unnest(r.tags) tag WHERE tag ILIKE ' ||
             quote_literal(v_pattern) || ')';

    ELSIF v_field = 'keyword' THEN
      -- Exact containment against the normalized array — the parser has
      -- already folded the value to its base key, so `kw:"Deflect 3"` arrives
      -- as `deflect` and hits the GIN index.
      RETURN 'r.keywords @> ARRAY[' || quote_literal(lower(btrim(v_value))) || ']::text[]';

    ELSIF v_field = 'domain' THEN
      -- Exact (case-insensitive) rather than substring: domains are a small
      -- closed vocabulary and a card may carry several.
      RETURN 'EXISTS (SELECT 1 FROM unnest(r.domains) dom WHERE lower(dom) = ' ||
             quote_literal(lower(btrim(v_value))) || ')';

    ELSIF v_field = 'set' THEN
      RETURN 'lower(r.set_code) = ' || quote_literal(lower(btrim(v_value)));

    ELSIF v_field = 'produces' THEN
      RETURN 'EXISTS (SELECT 1 FROM unnest(r.produces) tok WHERE tok ILIKE ' ||
             quote_literal(v_pattern) || ')';

    ELSE
      RAISE EXCEPTION 'Unsupported filter field: %', v_field;
    END IF;
  END IF;

  IF v_op = 'numeric' THEN
    v_field := p_ast->>'field';
    v_cmp   := p_ast->>'cmp';
    BEGIN
      v_num := (p_ast->>'value')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Numeric filter needs a number, got: %', p_ast->>'value';
    END;

    IF v_field = 'domain_count' THEN
      v_expr := 'coalesce(array_length(r.domains, 1), 0)';
    ELSIF v_field IN ('energy', 'might', 'power') THEN
      -- A NULL stat leaves the comparison unknown and the card drops out —
      -- the same semantics the TypeScript evaluator uses. These are real
      -- integer columns now, so no cast guard is needed.
      v_expr := 'r.' || quote_ident(v_field);
    ELSE
      RAISE EXCEPTION 'Unsupported numeric field: %', v_field;
    END IF;

    IF v_cmp NOT IN ('eq', 'ne', 'gt', 'gte', 'lt', 'lte') THEN
      RAISE EXCEPTION 'Unsupported comparator: %', coalesce(v_cmp, '<null>');
    END IF;

    RETURN '(' || v_expr || ' ' || CASE v_cmp
      WHEN 'eq'  THEN '='
      WHEN 'ne'  THEN '<>'
      WHEN 'gt'  THEN '>'
      WHEN 'gte' THEN '>='
      WHEN 'lt'  THEN '<'
      WHEN 'lte' THEN '<='
    END || ' ' || v_num::text || ')';
  END IF;

  IF v_op = 'legality' THEN
    v_value  := lower(coalesce(p_ast->>'format', ''));
    v_status := coalesce(p_ast->>'status', '');
    IF v_status NOT IN ('legal', 'not_legal', 'banned') THEN
      RAISE EXCEPTION 'Unsupported legality status: %', v_status;
    END IF;
    -- Precedence: printing row → oracle row → default legal. The EXISTS guard
    -- means an unknown format code matches nothing rather than matching every
    -- card by falling through to the default.
    RETURN
      '(EXISTS (SELECT 1 FROM formats f0 WHERE f0.code = ' || quote_literal(v_value) || ') ' ||
      'AND coalesce(' ||
        '(SELECT pl.status FROM printing_legalities pl ' ||
         'JOIN formats f1 ON f1.id = pl.format_id ' ||
         'WHERE pl.printing_id = r.printing_id AND f1.code = ' || quote_literal(v_value) || '), ' ||
        '(SELECT ol.status FROM oracle_legalities ol ' ||
         'JOIN formats f2 ON f2.id = ol.format_id ' ||
         'WHERE ol.oracle_id = r.oracle_id AND f2.code = ' || quote_literal(v_value) || '), ' ||
        '''legal'') = ' || quote_literal(v_status) || ')';
  END IF;

  IF v_op = 'flag' THEN
    v_value := coalesce(p_ast->>'value', '');
    IF    v_value = 'token'        THEN RETURN 'r.is_token';
    ELSIF v_value = 'manual'       THEN RETURN '(r.source = ''manual'')';
    ELSIF v_value = 'signature'    THEN RETURN 'r.is_signature';
    ELSIF v_value = 'alternate'    THEN RETURN 'r.is_alternate_art';
    ELSIF v_value = 'overnumbered' THEN RETURN 'r.is_overnumbered';
    ELSIF v_value = 'special'      THEN RETURN 'r.is_special_collection';
    ELSIF v_value = 'foil'         THEN
      RETURN 'EXISTS (SELECT 1 FROM unnest(r.finishes) fin WHERE lower(fin) = ''foil'')';
    ELSE
      -- Anything else is a meta flag: the extensible `is:` vocabulary that is
      -- not printed on the card, so a new flag needs no migration.
      RETURN 'r.meta_flags @> ARRAY[' || quote_literal(lower(btrim(v_value))) || ']::text[]';
    END IF;
  END IF;

  RAISE EXCEPTION 'Unknown AST op: %', coalesce(v_op, '<null>');
END;
$$;

-- Search returns printing ids. `p_collapse` folds them to one row per oracle
-- (the preferred printing when it matched, otherwise the best-ranked match) —
-- which is what "one row per card" now means, instead of the name-string
-- heuristic the provider used to apply on every read path.
CREATE OR REPLACE FUNCTION search_printing_ids(
  p_ast       jsonb,
  p_set       text    DEFAULT NULL,
  p_collector text    DEFAULT NULL,
  p_max_ids   int     DEFAULT 500,
  p_collapse  boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_set_id uuid;
  v_where  text;
  v_sql    text;
  v_result jsonb;
BEGIN
  p_max_ids := greatest(1, least(coalesce(p_max_ids, 500), 5000));

  IF p_set IS NOT NULL AND p_set <> '' THEN
    SELECT id INTO v_set_id FROM sets WHERE set_code = upper(p_set) AND deleted_at IS NULL;
    IF v_set_id IS NULL THEN
      RETURN jsonb_build_object('ids', '[]'::jsonb, 'total', 0);
    END IF;
  END IF;

  v_where := card_search_ast_to_sql(p_ast);
  IF v_set_id IS NOT NULL THEN
    v_where := v_where || ' AND r.set_id = ' || quote_literal(v_set_id);
  END IF;
  IF p_collector IS NOT NULL AND p_collector <> '' THEN
    v_where := v_where || ' AND r.collector_number = ' || quote_literal(p_collector);
  END IF;

  IF p_collapse THEN
    v_sql :=
      'WITH matched AS (' ||
      '  SELECT r.printing_id, r.oracle_id, r.name, ' ||
      '         row_number() OVER (PARTITION BY r.oracle_id ORDER BY ' ||
      '           (o.preferred_printing_id IS DISTINCT FROM r.printing_id), ' ||
      '           r.printing_id) AS rn ' ||
      '  FROM resolved_printings r ' ||
      '  JOIN oracles o ON o.id = r.oracle_id ' ||
      '  WHERE ' || v_where ||
      '), picked AS (SELECT printing_id, name FROM matched WHERE rn = 1)';
  ELSE
    v_sql :=
      'WITH picked AS (' ||
      '  SELECT r.printing_id, r.name FROM resolved_printings r WHERE ' || v_where || ')';
  END IF;

  v_sql := v_sql ||
    ' SELECT jsonb_build_object(' ||
    '   ''ids'', coalesce((SELECT jsonb_agg(printing_id ORDER BY name) FROM (' ||
    '     SELECT printing_id, name FROM picked ORDER BY name LIMIT ' || p_max_ids::text ||
    '   ) sub), ''[]''::jsonb), ' ||
    '   ''total'', (SELECT count(*) FROM picked))';

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

-- ── ruling rule materialisation ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_ruling_rule_matches(p_target_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_target  record;
  v_where   text;
  v_targets int := 0;
  v_skipped int := 0;
  v_matches int := 0;
  v_added   int;
BEGIN
  FOR v_target IN
    SELECT t.id, t.ast
    FROM ruling_targets t
    JOIN rulings ru ON ru.id = t.ruling_id
    WHERE t.kind = 'query'
      AND ru.active
      AND (p_target_id IS NULL OR t.id = p_target_id)
  LOOP
    BEGIN
      v_where := card_search_ast_to_sql(v_target.ast);
    EXCEPTION WHEN OTHERS THEN
      -- A target whose AST no longer renders keeps its existing matches: a
      -- rule going stale must not silently strip rulings off card pages.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    DELETE FROM ruling_matches WHERE target_id = v_target.id;

    EXECUTE
      'INSERT INTO ruling_matches (target_id, printing_id) ' ||
      'SELECT ' || quote_literal(v_target.id) || '::uuid, r.printing_id ' ||
      'FROM resolved_printings r WHERE ' || v_where;

    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_targets := v_targets + 1;
    v_matches := v_matches + v_added;
  END LOOP;

  DELETE FROM ruling_matches m
  USING ruling_targets t, rulings ru
  WHERE m.target_id = t.id AND t.ruling_id = ru.id AND NOT ru.active;

  RETURN jsonb_build_object(
    'ok', true, 'targets', v_targets, 'skipped', v_skipped, 'matches', v_matches);
END;
$$;

-- Per-printing counterpart, called after every admin mutation. Deliberately
-- not a trigger: ingest rewrites the whole catalogue and would fire it once
-- per row for no benefit.
CREATE OR REPLACE FUNCTION refresh_ruling_matches_for_printing(p_printing_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_target  record;
  v_where   text;
  v_hit     boolean;
  v_checked int := 0;
  v_matched int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM resolved_printings WHERE printing_id = p_printing_id) THEN
    DELETE FROM ruling_matches WHERE printing_id = p_printing_id;
    RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id, 'removed', true);
  END IF;

  FOR v_target IN
    SELECT t.id, t.ast
    FROM ruling_targets t
    JOIN rulings ru ON ru.id = t.ruling_id
    WHERE t.kind = 'query' AND ru.active
  LOOP
    BEGIN
      v_where := card_search_ast_to_sql(v_target.ast);
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM resolved_printings r WHERE r.printing_id = ' ||
      quote_literal(p_printing_id) || ' AND (' || v_where || '))'
      INTO v_hit;

    v_checked := v_checked + 1;
    IF v_hit THEN
      INSERT INTO ruling_matches (target_id, printing_id)
      VALUES (v_target.id, p_printing_id)
      ON CONFLICT DO NOTHING;
      v_matched := v_matched + 1;
    ELSE
      DELETE FROM ruling_matches
      WHERE target_id = v_target.id AND printing_id = p_printing_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id,
                            'checked', v_checked, 'matched', v_matched,
                            'skipped', v_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION ruling_rule_preview(p_ast jsonb, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_where  text;
  v_result jsonb;
BEGIN
  p_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_where := card_search_ast_to_sql(p_ast);

  EXECUTE
    'SELECT jsonb_build_object(' ||
    '  ''total'', (SELECT count(*) FROM resolved_printings r WHERE ' || v_where || '), ' ||
    '  ''sample'', coalesce((SELECT jsonb_agg(s) FROM (' ||
    '     SELECT r.printing_id AS id, r.name, r.set_code, r.collector_number, r.public_slug ' ||
    '     FROM resolved_printings r WHERE ' || v_where ||
    '     ORDER BY r.name LIMIT ' || p_limit::text || ') s), ''[]''::jsonb))'
    INTO v_result;

  RETURN v_result;
END;
$$;

-- Public read path for a card page: printing targets and oracle targets
-- resolve live, query targets through the materialised matches.
CREATE OR REPLACE FUNCTION rulings_for_printing(p_printing_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.dated NULLS LAST, x.created_at), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (ru.id)
      ru.id, ru.type, ru.text, ru.dated, ru.source, ru.created_at, ru.updated_at,
      CASE t.kind WHEN 'printing' THEN 'printing'
                  WHEN 'oracle'   THEN 'oracle'
                  ELSE 'rule' END AS scope
    FROM rulings ru
    JOIN ruling_targets t ON t.ruling_id = ru.id
    LEFT JOIN printings p ON p.id = p_printing_id
    WHERE ru.active
      AND (
        (t.kind = 'printing' AND t.printing_id = p_printing_id)
        OR (t.kind = 'oracle' AND t.oracle_id = p.oracle_id)
        OR (t.kind = 'query' AND EXISTS (
              SELECT 1 FROM ruling_matches m
              WHERE m.target_id = t.id AND m.printing_id = p_printing_id))
      )
    ORDER BY ru.id, t.kind
  ) x;
$$;

-- ── ingest ────────────────────────────────────────────────────────────────────
--
-- Called with bounded batches and pruning disabled, then once more with the
-- complete valid-id list and p_prune true. A failed batch therefore leaves
-- stale rows in place rather than deleting a catalogue it only half wrote,
-- and the run is safely re-runnable.
--
-- Every section may be NULL, meaning "do not touch". `p_oracles` must be
-- deduplicated by oracle_key by the caller.
--
-- locked_fields is honoured per column: a field an admin has claimed keeps its
-- stored value, and everything else takes the upstream value. That, plus
-- source='manual' rows being exempt from the prune and deleted_at blocking
-- resurrection, is the whole durability story — there is no override overlay.

CREATE OR REPLACE FUNCTION ingest_catalogue(
  p_sets               jsonb   DEFAULT NULL,
  p_artists            jsonb   DEFAULT NULL,
  p_oracles            jsonb   DEFAULT NULL,
  p_printings          jsonb   DEFAULT NULL,
  p_deltas             jsonb   DEFAULT NULL,
  p_relationships      jsonb   DEFAULT NULL,
  p_valid_printing_ids jsonb   DEFAULT NULL,
  p_prune              boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_touched  text[] := '{}';
  v_valid    text[];
  v_pruned_p integer := 0;
  v_pruned_o integer := 0;
BEGIN
  -- One projection rebuild at the end beats thousands of per-row ones.
  PERFORM set_config('riftseer.defer_projection', 'on', true);

  -- ── sets ────────────────────────────────────────────────────────────────
  IF p_sets IS NOT NULL THEN
    INSERT INTO sets (
      set_code, set_name, set_uri, set_search_uri, published_on, is_promo,
      parent_set_code, riftcodex_set_id, tcgplayer_group_id, cardmarket_id
    )
    SELECT upper(s.set_code), s.set_name, s.set_uri, s.set_search_uri,
           s.published_on, coalesce(s.is_promo, false), s.parent_set_code,
           s.riftcodex_set_id, s.tcgplayer_group_id, s.cardmarket_id
    FROM jsonb_to_recordset(p_sets) AS s(
      set_code text, set_name text, set_uri text, set_search_uri text,
      published_on date, is_promo boolean, parent_set_code text,
      riftcodex_set_id text, tcgplayer_group_id text, cardmarket_id text
    )
    WHERE s.set_code IS NOT NULL AND s.set_name IS NOT NULL
    ON CONFLICT (set_code) DO UPDATE SET
      set_name        = CASE WHEN 'set_name' = ANY (sets.locked_fields)
                             THEN sets.set_name ELSE excluded.set_name END,
      set_uri         = coalesce(excluded.set_uri, sets.set_uri),
      set_search_uri  = coalesce(excluded.set_search_uri, sets.set_search_uri),
      published_on    = CASE WHEN 'published_on' = ANY (sets.locked_fields)
                             THEN sets.published_on ELSE excluded.published_on END,
      is_promo        = CASE WHEN 'is_promo' = ANY (sets.locked_fields)
                             THEN sets.is_promo ELSE excluded.is_promo END,
      parent_set_code = coalesce(excluded.parent_set_code, sets.parent_set_code),
      riftcodex_set_id   = coalesce(excluded.riftcodex_set_id, sets.riftcodex_set_id),
      tcgplayer_group_id = coalesce(excluded.tcgplayer_group_id, sets.tcgplayer_group_id),
      cardmarket_id      = coalesce(excluded.cardmarket_id, sets.cardmarket_id)
    WHERE sets.deleted_at IS NULL;
  END IF;

  -- ── artists ─────────────────────────────────────────────────────────────
  IF p_artists IS NOT NULL THEN
    INSERT INTO artists (name)
    SELECT DISTINCT btrim(a.name)
    FROM jsonb_array_elements_text(p_artists) AS a(name)
    WHERE btrim(coalesce(a.name, '')) <> ''
    ON CONFLICT (name) DO NOTHING;
  END IF;

  -- ── oracles ─────────────────────────────────────────────────────────────
  IF p_oracles IS NOT NULL THEN
    INSERT INTO oracles (
      oracle_key, slug, name, name_normalized, card_type, supertype, is_token,
      energy, might, power, might_bonus, equipment_text, text_rich, text_plain,
      tags, domains, meta_flags, ingested_at
    )
    SELECT o.oracle_key, o.slug, o.name, o.name_normalized, o.card_type,
           o.supertype, coalesce(o.is_token, false), o.energy, o.might,
           o.power, o.might_bonus, o.equipment_text, o.text_rich, o.text_plain,
           coalesce(o.tags, '{}'), coalesce(o.domains, '{}'),
           coalesce(o.meta_flags, '{}'), now()
    FROM jsonb_to_recordset(p_oracles) AS o(
      oracle_key text, slug text, name text, name_normalized text,
      card_type text, supertype text, is_token boolean, energy integer,
      might integer, power integer, might_bonus integer, equipment_text text,
      text_rich text, text_plain text, tags text[], domains text[],
      meta_flags text[]
    )
    WHERE o.oracle_key IS NOT NULL AND o.name IS NOT NULL AND o.slug IS NOT NULL
    ON CONFLICT (oracle_key) DO UPDATE SET
      -- The slug is pinned on first insert, exactly like a printing's.
      slug            = oracles.slug,
      name            = CASE WHEN 'name' = ANY (oracles.locked_fields)
                             THEN oracles.name ELSE excluded.name END,
      name_normalized = CASE WHEN 'name' = ANY (oracles.locked_fields)
                             THEN oracles.name_normalized ELSE excluded.name_normalized END,
      card_type       = CASE WHEN 'card_type' = ANY (oracles.locked_fields)
                             THEN oracles.card_type ELSE excluded.card_type END,
      supertype       = CASE WHEN 'supertype' = ANY (oracles.locked_fields)
                             THEN oracles.supertype ELSE excluded.supertype END,
      is_token        = CASE WHEN 'is_token' = ANY (oracles.locked_fields)
                             THEN oracles.is_token ELSE excluded.is_token END,
      energy          = CASE WHEN 'energy' = ANY (oracles.locked_fields)
                             THEN oracles.energy ELSE excluded.energy END,
      might           = CASE WHEN 'might' = ANY (oracles.locked_fields)
                             THEN oracles.might ELSE excluded.might END,
      power           = CASE WHEN 'power' = ANY (oracles.locked_fields)
                             THEN oracles.power ELSE excluded.power END,
      -- might_bonus and equipment_text come from the official gallery, which
      -- clears them by sending NULL when a card stops being equipment. They
      -- are assigned rather than coalesced so that clearing works.
      might_bonus     = CASE WHEN 'might_bonus' = ANY (oracles.locked_fields)
                             THEN oracles.might_bonus ELSE excluded.might_bonus END,
      equipment_text  = CASE WHEN 'equipment_text' = ANY (oracles.locked_fields)
                             THEN oracles.equipment_text ELSE excluded.equipment_text END,
      text_rich       = CASE WHEN 'text_rich' = ANY (oracles.locked_fields)
                             THEN oracles.text_rich ELSE excluded.text_rich END,
      text_plain      = CASE WHEN 'text_plain' = ANY (oracles.locked_fields)
                             THEN oracles.text_plain ELSE excluded.text_plain END,
      tags            = CASE WHEN 'tags' = ANY (oracles.locked_fields)
                             THEN oracles.tags ELSE excluded.tags END,
      domains         = CASE WHEN 'domains' = ANY (oracles.locked_fields)
                             THEN oracles.domains ELSE excluded.domains END,
      meta_flags      = CASE WHEN 'meta_flags' = ANY (oracles.locked_fields)
                             THEN oracles.meta_flags ELSE excluded.meta_flags END,
      ingested_at     = now()
    WHERE oracles.deleted_at IS NULL;
  END IF;

  -- ── printings ───────────────────────────────────────────────────────────
  IF p_printings IS NOT NULL THEN
    INSERT INTO printings (
      id, oracle_id, set_id, artist_id, collector_number, released_at, rarity,
      public_slug, flavour_text, finishes, is_signature, is_alternate_art,
      is_overnumbered, is_special_collection, riftcodex_id, riftbound_id,
      tcgplayer_id, cardmarket_id, image_source_url, image_source_hash,
      image_source_provider, image_orientation, image_alt_text,
      price_normal, price_foil, price_low_normal, price_low_foil,
      tcgplayer_url, cardmarket_url, ingested_at
    )
    SELECT
      pr.id, o.id, s.id, a.id, pr.collector_number, pr.released_at, pr.rarity,
      pr.public_slug, pr.flavour_text, coalesce(pr.finishes, '{}'),
      coalesce(pr.is_signature, false), coalesce(pr.is_alternate_art, false),
      coalesce(pr.is_overnumbered, false), coalesce(pr.is_special_collection, false),
      pr.riftcodex_id, pr.riftbound_id, pr.tcgplayer_id, pr.cardmarket_id,
      pr.image_source_url, pr.image_source_hash, pr.image_source_provider,
      pr.image_orientation, pr.image_alt_text,
      pr.price_normal, pr.price_foil, pr.price_low_normal, pr.price_low_foil,
      pr.tcgplayer_url, pr.cardmarket_url, now()
    FROM jsonb_to_recordset(p_printings) AS pr(
      id text, oracle_key text, set_code text, artist text,
      collector_number text, released_at date, rarity text, public_slug text,
      flavour_text text, finishes text[], is_signature boolean,
      is_alternate_art boolean, is_overnumbered boolean,
      is_special_collection boolean, riftcodex_id text, riftbound_id text,
      tcgplayer_id text, cardmarket_id text, image_source_url text,
      image_source_hash text, image_source_provider text,
      image_orientation text, image_alt_text text, price_normal numeric,
      price_foil numeric, price_low_normal numeric, price_low_foil numeric,
      tcgplayer_url text, cardmarket_url text
    )
    JOIN oracles o ON o.oracle_key = pr.oracle_key AND o.deleted_at IS NULL
    JOIN sets s    ON s.set_code = upper(pr.set_code) AND s.deleted_at IS NULL
    LEFT JOIN artists a ON a.name = btrim(pr.artist)
    WHERE pr.id IS NOT NULL AND pr.public_slug IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      oracle_id   = excluded.oracle_id,
      -- Pinned on first insert: public URLs must not drift as upstream data
      -- is corrected.
      public_slug = printings.public_slug,
      set_id      = CASE WHEN 'set_id' = ANY (printings.locked_fields)
                         THEN printings.set_id ELSE excluded.set_id END,
      artist_id   = CASE WHEN 'artist_id' = ANY (printings.locked_fields)
                         THEN printings.artist_id
                         ELSE coalesce(excluded.artist_id, printings.artist_id) END,
      collector_number = CASE WHEN 'collector_number' = ANY (printings.locked_fields)
                              THEN printings.collector_number
                              ELSE excluded.collector_number END,
      released_at = CASE WHEN 'released_at' = ANY (printings.locked_fields)
                         THEN printings.released_at ELSE excluded.released_at END,
      rarity      = CASE WHEN 'rarity' = ANY (printings.locked_fields)
                         THEN printings.rarity ELSE excluded.rarity END,
      flavour_text = CASE WHEN 'flavour_text' = ANY (printings.locked_fields)
                          THEN printings.flavour_text ELSE excluded.flavour_text END,
      finishes    = CASE WHEN 'finishes' = ANY (printings.locked_fields)
                         THEN printings.finishes ELSE excluded.finishes END,
      is_signature = CASE WHEN 'is_signature' = ANY (printings.locked_fields)
                          THEN printings.is_signature ELSE excluded.is_signature END,
      is_alternate_art = CASE WHEN 'is_alternate_art' = ANY (printings.locked_fields)
                              THEN printings.is_alternate_art
                              ELSE excluded.is_alternate_art END,
      is_overnumbered = CASE WHEN 'is_overnumbered' = ANY (printings.locked_fields)
                             THEN printings.is_overnumbered
                             ELSE excluded.is_overnumbered END,
      is_special_collection = CASE WHEN 'is_special_collection' = ANY (printings.locked_fields)
                                   THEN printings.is_special_collection
                                   ELSE excluded.is_special_collection END,
      riftcodex_id = coalesce(excluded.riftcodex_id, printings.riftcodex_id),
      riftbound_id = coalesce(excluded.riftbound_id, printings.riftbound_id),
      tcgplayer_id = CASE WHEN 'tcgplayer_id' = ANY (printings.locked_fields)
                          THEN printings.tcgplayer_id
                          ELSE coalesce(excluded.tcgplayer_id, printings.tcgplayer_id) END,
      cardmarket_id = coalesce(excluded.cardmarket_id, printings.cardmarket_id),
      -- Image state is owned by the queue, not by ingest: only the source URL
      -- and its hash are refreshed here, and apply_printing_hosted_media
      -- publishes the variants once R2 has them.
      image_source_url  = CASE WHEN 'image' = ANY (printings.locked_fields)
                               THEN printings.image_source_url
                               ELSE coalesce(excluded.image_source_url,
                                             printings.image_source_url) END,
      image_source_hash = CASE WHEN 'image' = ANY (printings.locked_fields)
                               THEN printings.image_source_hash
                               ELSE coalesce(excluded.image_source_hash,
                                             printings.image_source_hash) END,
      image_source_provider = CASE WHEN 'image' = ANY (printings.locked_fields)
                                   THEN printings.image_source_provider
                                   ELSE coalesce(excluded.image_source_provider,
                                                 printings.image_source_provider) END,
      image_orientation = coalesce(excluded.image_orientation, printings.image_orientation),
      image_alt_text    = coalesce(excluded.image_alt_text, printings.image_alt_text),
      -- Prices are volatile and never locked.
      price_normal     = coalesce(excluded.price_normal, printings.price_normal),
      price_foil       = coalesce(excluded.price_foil, printings.price_foil),
      price_low_normal = coalesce(excluded.price_low_normal, printings.price_low_normal),
      price_low_foil   = coalesce(excluded.price_low_foil, printings.price_low_foil),
      tcgplayer_url    = coalesce(excluded.tcgplayer_url, printings.tcgplayer_url),
      cardmarket_url   = coalesce(excluded.cardmarket_url, printings.cardmarket_url),
      ingested_at      = now()
    WHERE printings.deleted_at IS NULL;

    SELECT coalesce(array_agg(value), '{}'::text[]) INTO v_touched
    FROM jsonb_array_elements_text(
      coalesce(jsonb_path_query_array(p_printings, '$[*].id'), '[]'::jsonb));
  END IF;

  -- Printings of an oracle touched by this batch may live in another batch,
  -- so they need re-resolving too.
  IF p_oracles IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT p.id), '{}'::text[]) INTO v_touched
    FROM printings p
    WHERE p.id = ANY (v_touched)
       OR p.oracle_id IN (
         SELECT o.id FROM oracles o
         WHERE o.oracle_key IN (
           SELECT value FROM jsonb_array_elements_text(
             coalesce(jsonb_path_query_array(p_oracles, '$[*].oracle_key'), '[]'::jsonb))));
  END IF;

  -- ── ingest-owned deltas ─────────────────────────────────────────────────
  -- Admin deltas are never touched: source is the whole boundary.
  IF p_deltas IS NOT NULL THEN
    DELETE FROM printing_deltas d
    WHERE d.source = 'ingest' AND d.printing_id = ANY (v_touched);

    INSERT INTO printing_deltas (
      printing_id, tags_added, tags_removed, domains_added, domains_removed,
      keywords_added, keywords_removed, meta_flags_added, meta_flags_removed,
      name_override, card_type_override, supertype_override, energy_override,
      might_override, power_override, might_bonus_override, text_rich_override,
      text_plain_override, equipment_text_override, cleared_fields, source
    )
    SELECT d.printing_id,
           coalesce(d.tags_added, '{}'), coalesce(d.tags_removed, '{}'),
           coalesce(d.domains_added, '{}'), coalesce(d.domains_removed, '{}'),
           coalesce(d.keywords_added, '{}'), coalesce(d.keywords_removed, '{}'),
           coalesce(d.meta_flags_added, '{}'), coalesce(d.meta_flags_removed, '{}'),
           d.name_override, d.card_type_override, d.supertype_override,
           d.energy_override, d.might_override, d.power_override,
           d.might_bonus_override, d.text_rich_override, d.text_plain_override,
           d.equipment_text_override, coalesce(d.cleared_fields, '{}'), 'ingest'
    FROM jsonb_to_recordset(p_deltas) AS d(
      printing_id text, tags_added text[], tags_removed text[],
      domains_added text[], domains_removed text[], keywords_added text[],
      keywords_removed text[], meta_flags_added text[], meta_flags_removed text[],
      name_override text, card_type_override text, supertype_override text,
      energy_override integer, might_override integer, power_override integer,
      might_bonus_override integer, text_rich_override text,
      text_plain_override text, equipment_text_override text,
      cleared_fields text[]
    )
    JOIN printings p ON p.id = d.printing_id AND p.deleted_at IS NULL
    ON CONFLICT (printing_id) DO NOTHING;
  END IF;

  -- ── ingest-owned relationships ──────────────────────────────────────────
  -- An oracle whose relationships an admin has claimed is skipped entirely,
  -- both when clearing and when inserting — the same locked_fields rule every
  -- other value follows.
  IF p_relationships IS NOT NULL THEN
    DELETE FROM oracle_relationships rel
    WHERE rel.source = 'ingest'
      AND NOT EXISTS (
        SELECT 1 FROM oracles o
        WHERE o.id = rel.from_oracle_id AND 'relationships' = ANY (o.locked_fields));

    INSERT INTO oracle_relationships (from_oracle_id, to_oracle_id, kind, source)
    SELECT fo.id, tt.id, rel.kind, 'ingest'
    FROM jsonb_to_recordset(p_relationships) AS rel(
      from_oracle_key text, to_oracle_key text, kind text
    )
    JOIN oracles fo ON fo.oracle_key = rel.from_oracle_key AND fo.deleted_at IS NULL
    JOIN oracles tt ON tt.oracle_key = rel.to_oracle_key   AND tt.deleted_at IS NULL
    WHERE fo.id <> tt.id
      AND rel.kind IN ('makes_token', 'character', 'signature')
      AND NOT ('relationships' = ANY (fo.locked_fields))
    ON CONFLICT (from_oracle_id, kind, to_oracle_id) DO NOTHING;
  END IF;

  -- ── prune ───────────────────────────────────────────────────────────────
  -- Runs only after every batch succeeded, against the complete valid-id
  -- list. Manual rows are never pruned; deleted rows are already gone.
  IF p_prune AND p_valid_printing_ids IS NOT NULL THEN
    SELECT coalesce(array_agg(value), '{}'::text[]) INTO v_valid
    FROM jsonb_array_elements_text(p_valid_printing_ids);

    IF array_length(v_valid, 1) > 0 THEN
      DELETE FROM printings p
      WHERE p.source = 'riftcodex' AND NOT (p.id = ANY (v_valid));
      GET DIAGNOSTICS v_pruned_p = ROW_COUNT;

      DELETE FROM oracles o
      WHERE o.source = 'riftcodex'
        AND NOT EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.id);
      GET DIAGNOSTICS v_pruned_o = ROW_COUNT;
    END IF;
  END IF;

  -- ── set counts ──────────────────────────────────────────────────────────
  UPDATE sets s
  SET card_count = counts.n
  FROM (
    SELECT set_id, count(*) AS n FROM printings WHERE deleted_at IS NULL GROUP BY set_id
  ) counts
  WHERE counts.set_id = s.id AND s.card_count IS DISTINCT FROM counts.n;

  -- ── projection ──────────────────────────────────────────────────────────
  PERFORM set_config('riftseer.defer_projection', 'off', true);

  IF p_prune THEN
    PERFORM refresh_resolved_printings(NULL);
    PERFORM refresh_preferred_printings(NULL);
  ELSIF array_length(v_touched, 1) > 0 THEN
    PERFORM refresh_resolved_printings(v_touched);
    PERFORM refresh_preferred_printings(
      ARRAY(SELECT DISTINCT oracle_id FROM printings WHERE id = ANY (v_touched)));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'touched', coalesce(array_length(v_touched, 1), 0),
    'pruned_printings', v_pruned_p,
    'pruned_oracles', v_pruned_o
  );
END;
$$;

-- ── hosted image publication ──────────────────────────────────────────────────
--
-- The queue may deliver a job for a source URL that has since changed. The
-- hash guard is what makes that safe: publication only lands when the printing
-- still points at the source the variants were built from.

CREATE OR REPLACE FUNCTION apply_printing_hosted_media(
  p_printing_id     text,
  p_source_hash     text,
  p_source_url      text,
  p_source_provider text,
  p_orientation     text DEFAULT NULL,
  p_alt_text        text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE printings
  SET image_source_url      = coalesce(p_source_url, image_source_url),
      image_source_provider = coalesce(p_source_provider, image_source_provider),
      image_orientation     = coalesce(p_orientation, image_orientation),
      image_alt_text        = coalesce(p_alt_text, image_alt_text),
      image_hosted_at       = now(),
      -- An admin upload is a deliberate choice, so it locks the image against
      -- the next ingest the same way any other admin edit does.
      locked_fields = CASE
        WHEN p_source_provider = 'admin' AND NOT ('image' = ANY (locked_fields))
        THEN locked_fields || 'image'::text
        ELSE locked_fields
      END
  WHERE id = p_printing_id
    AND image_source_hash IS NOT DISTINCT FROM p_source_hash;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- ── reconciliation queue sync ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ingest_reconciliation_queue(
  p_entries      jsonb,
  p_fingerprints jsonb,
  p_prune        boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_upserted integer := 0;
  v_pruned   integer := 0;
  v_prints   text[];
BEGIN
  INSERT INTO reconciliation_queue (
    kind, source, fingerprint, payload, proposed_printing_id, proposed_oracle_id, last_seen_at
  )
  SELECT e.kind, e.source, e.fingerprint, coalesce(e.payload, '{}'::jsonb),
         e.proposed_printing_id, e.proposed_oracle_id, now()
  FROM jsonb_to_recordset(p_entries) AS e(
    kind text, source text, fingerprint text, payload jsonb,
    proposed_printing_id text, proposed_oracle_id uuid
  )
  WHERE e.fingerprint IS NOT NULL
  ON CONFLICT (fingerprint) DO UPDATE SET
    payload              = excluded.payload,
    proposed_printing_id = excluded.proposed_printing_id,
    proposed_oracle_id   = excluded.proposed_oracle_id,
    last_seen_at         = now()
  -- An admin decision is durable: a resolved row is never reopened by a
  -- later sighting of the same discrepancy.
  WHERE reconciliation_queue.status = 'pending';

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  IF p_prune THEN
    SELECT coalesce(array_agg(value), '{}'::text[]) INTO v_prints
    FROM jsonb_array_elements_text(coalesce(p_fingerprints, '[]'::jsonb));

    DELETE FROM reconciliation_queue
    WHERE status = 'pending' AND NOT (fingerprint = ANY (v_prints));
    GET DIAGNOSTICS v_pruned = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'upserted', v_upserted, 'pruned', v_pruned);
END;
$$;

-- ── admin: shared helpers ─────────────────────────────────────────────────────
--
-- An admin patch is a flat jsonb of column → value. Applying it is an explicit
-- column list per table rather than a generic merge-patch engine: the old
-- jsonb_merge_patch / jsonb_compose_merge_patch pair existed only to maintain
-- a shadow overlay table, and locked_fields replaced that.
--
-- Every patched key is added to locked_fields, which is what makes the edit
-- survive the next ingest.

CREATE OR REPLACE FUNCTION admin__log(
  p_actor       uuid,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_detail      jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (p_actor, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION admin__resolve_artist(p_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN NULL;
  END IF;
  INSERT INTO artists (name) VALUES (btrim(p_name))
  ON CONFLICT (name) DO NOTHING;
  SELECT id INTO v_id FROM artists WHERE name = btrim(p_name);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin__text_array(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR jsonb_typeof(p_value) <> 'array' THEN NULL
    ELSE coalesce(
      (SELECT array_agg(v ORDER BY v) FROM jsonb_array_elements_text(p_value) AS t(v)),
      '{}'::text[])
  END;
$$;

-- Union of the fields a patch touched with what is already locked.
CREATE OR REPLACE FUNCTION admin__merge_locks(p_existing text[], p_patch jsonb, p_allowed text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT v ORDER BY v), '{}'::text[])
  FROM (
    SELECT unnest(coalesce(p_existing, '{}'::text[])) AS v
    UNION
    SELECT k FROM jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) AS k
    WHERE k = ANY (p_allowed)
  ) s;
$$;

-- ── admin: oracles ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_patch_oracle(
  p_oracle_id uuid,
  p_patch     jsonb,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'name', 'card_type', 'supertype', 'is_token', 'energy', 'might', 'power',
    'might_bonus', 'equipment_text', 'text_rich', 'text_plain', 'tags',
    'domains', 'meta_flags'
  ];
  v_printings text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM oracles WHERE id = p_oracle_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oracle_not_found');
  END IF;

  UPDATE oracles o SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE o.name END,
    name_normalized = CASE WHEN p_patch ? 'name_normalized'
                           THEN p_patch->>'name_normalized' ELSE o.name_normalized END,
    oracle_key = CASE WHEN p_patch ? 'oracle_key'
                      THEN p_patch->>'oracle_key' ELSE o.oracle_key END,
    card_type = CASE WHEN p_patch ? 'card_type' THEN p_patch->>'card_type' ELSE o.card_type END,
    supertype = CASE WHEN p_patch ? 'supertype' THEN p_patch->>'supertype' ELSE o.supertype END,
    is_token  = CASE WHEN p_patch ? 'is_token'
                     THEN coalesce((p_patch->>'is_token')::boolean, false) ELSE o.is_token END,
    energy    = CASE WHEN p_patch ? 'energy' THEN (p_patch->>'energy')::integer ELSE o.energy END,
    might     = CASE WHEN p_patch ? 'might'  THEN (p_patch->>'might')::integer  ELSE o.might END,
    power     = CASE WHEN p_patch ? 'power'  THEN (p_patch->>'power')::integer  ELSE o.power END,
    -- Presence, not truthiness: 0 is a real printed Might bonus.
    might_bonus = CASE WHEN p_patch ? 'might_bonus'
                       THEN (p_patch->>'might_bonus')::integer ELSE o.might_bonus END,
    equipment_text = CASE WHEN p_patch ? 'equipment_text'
                          THEN p_patch->>'equipment_text' ELSE o.equipment_text END,
    text_rich  = CASE WHEN p_patch ? 'text_rich'  THEN p_patch->>'text_rich'  ELSE o.text_rich END,
    text_plain = CASE WHEN p_patch ? 'text_plain' THEN p_patch->>'text_plain' ELSE o.text_plain END,
    tags       = coalesce(admin__text_array(p_patch->'tags'), o.tags),
    domains    = coalesce(admin__text_array(p_patch->'domains'), o.domains),
    meta_flags = coalesce(admin__text_array(p_patch->'meta_flags'), o.meta_flags),
    locked_fields = admin__merge_locks(o.locked_fields, p_patch, v_allowed)
  WHERE o.id = p_oracle_id;

  PERFORM admin__log(p_actor, 'oracle.patch', 'oracle', p_oracle_id::text,
                     jsonb_build_object('patch', p_patch));

  SELECT coalesce(array_agg(id), '{}'::text[]) INTO v_printings
  FROM printings WHERE oracle_id = p_oracle_id AND deleted_at IS NULL;

  PERFORM refresh_ruling_matches_for_printing(pid) FROM unnest(v_printings) AS pid;

  RETURN jsonb_build_object('ok', true, 'oracle_id', p_oracle_id, 'patch', p_patch);
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_oracle(
  p_oracle_key text,
  p_slug       text,
  p_definition jsonb,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(btrim(p_definition->>'name'), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;
  IF EXISTS (SELECT 1 FROM oracles WHERE oracle_key = p_oracle_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oracle_exists');
  END IF;

  INSERT INTO oracles (oracle_key, slug, name, name_normalized, source)
  VALUES (p_oracle_key, p_slug, p_definition->>'name',
          coalesce(p_definition->>'name_normalized', p_definition->>'name'), 'manual')
  RETURNING id INTO v_id;

  PERFORM admin__log(p_actor, 'oracle.create', 'oracle', v_id::text,
                     jsonb_build_object('definition', p_definition));

  RETURN admin_patch_oracle(v_id, p_definition, p_actor)
         || jsonb_build_object('oracle_id', v_id);
END;
$$;

-- Soft delete. deleted_at both hides the row from every reader (the
-- projection excludes it) and stops ingest resurrecting it, which is what the
-- separate tombstone tables used to do.
CREATE OR REPLACE FUNCTION admin_delete_oracle(
  p_oracle_id uuid,
  p_reason    text,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM oracles WHERE id = p_oracle_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oracle_not_found');
  END IF;

  UPDATE oracles SET deleted_at = now() WHERE id = p_oracle_id;
  UPDATE printings SET deleted_at = now()
  WHERE oracle_id = p_oracle_id AND deleted_at IS NULL;

  DELETE FROM resolved_printings WHERE oracle_id = p_oracle_id;

  PERFORM admin__log(p_actor, 'oracle.delete', 'oracle', p_oracle_id::text,
                     jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'oracle_id', p_oracle_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_restore_oracle(p_oracle_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE oracles SET deleted_at = NULL WHERE id = p_oracle_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oracle_not_found');
  END IF;
  UPDATE printings SET deleted_at = NULL WHERE oracle_id = p_oracle_id;
  PERFORM refresh_resolved_printings(
    ARRAY(SELECT id FROM printings WHERE oracle_id = p_oracle_id));
  PERFORM refresh_preferred_printings(ARRAY[p_oracle_id]);
  PERFORM admin__log(p_actor, 'oracle.restore', 'oracle', p_oracle_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'oracle_id', p_oracle_id);
END;
$$;

-- ── admin: printings ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_patch_printing(
  p_printing_id text,
  p_patch       jsonb,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'collector_number', 'released_at', 'rarity', 'flavour_text', 'finishes',
    'is_signature', 'is_alternate_art', 'is_overnumbered',
    'is_special_collection', 'artist_id', 'tcgplayer_id'
  ];
  v_set_id    uuid;
  v_artist_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM printings WHERE id = p_printing_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'printing_not_found');
  END IF;

  IF p_patch ? 'set_code' THEN
    SELECT id INTO v_set_id FROM sets
    WHERE set_code = upper(p_patch->>'set_code') AND deleted_at IS NULL;
    IF v_set_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
    END IF;
  END IF;

  IF p_patch ? 'artist' THEN
    v_artist_id := admin__resolve_artist(p_patch->>'artist');
  END IF;

  UPDATE printings p SET
    set_id = coalesce(v_set_id, p.set_id),
    artist_id = CASE WHEN p_patch ? 'artist' THEN v_artist_id ELSE p.artist_id END,
    collector_number = CASE WHEN p_patch ? 'collector_number'
                            THEN p_patch->>'collector_number' ELSE p.collector_number END,
    released_at = CASE WHEN p_patch ? 'released_at'
                       THEN (p_patch->>'released_at')::date ELSE p.released_at END,
    rarity = CASE WHEN p_patch ? 'rarity' THEN p_patch->>'rarity' ELSE p.rarity END,
    flavour_text = CASE WHEN p_patch ? 'flavour_text'
                        THEN p_patch->>'flavour_text' ELSE p.flavour_text END,
    finishes = coalesce(admin__text_array(p_patch->'finishes'), p.finishes),
    is_signature = CASE WHEN p_patch ? 'is_signature'
                        THEN coalesce((p_patch->>'is_signature')::boolean, false)
                        ELSE p.is_signature END,
    is_alternate_art = CASE WHEN p_patch ? 'is_alternate_art'
                            THEN coalesce((p_patch->>'is_alternate_art')::boolean, false)
                            ELSE p.is_alternate_art END,
    is_overnumbered = CASE WHEN p_patch ? 'is_overnumbered'
                           THEN coalesce((p_patch->>'is_overnumbered')::boolean, false)
                           ELSE p.is_overnumbered END,
    is_special_collection = CASE WHEN p_patch ? 'is_special_collection'
                                 THEN coalesce((p_patch->>'is_special_collection')::boolean, false)
                                 ELSE p.is_special_collection END,
    tcgplayer_id = CASE WHEN p_patch ? 'tcgplayer_id'
                        THEN p_patch->>'tcgplayer_id' ELSE p.tcgplayer_id END,
    tcgplayer_url = CASE WHEN p_patch ? 'tcgplayer_url'
                         THEN p_patch->>'tcgplayer_url' ELSE p.tcgplayer_url END,
    cardmarket_url = CASE WHEN p_patch ? 'cardmarket_url'
                          THEN p_patch->>'cardmarket_url' ELSE p.cardmarket_url END,
    locked_fields = admin__merge_locks(
      p.locked_fields,
      p_patch || CASE WHEN v_set_id IS NOT NULL THEN '{"set_id":true}'::jsonb ELSE '{}'::jsonb END,
      v_allowed || ARRAY['set_id'])
  WHERE p.id = p_printing_id;

  PERFORM admin__log(p_actor, 'printing.patch', 'printing', p_printing_id,
                     jsonb_build_object('patch', p_patch));
  PERFORM refresh_ruling_matches_for_printing(p_printing_id);

  RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id, 'patch', p_patch);
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_printing(
  p_printing_id text,
  p_oracle_id   uuid,
  p_set_code    text,
  p_public_slug text,
  p_definition  jsonb,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_set_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM printings WHERE id = p_printing_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'printing_exists');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM oracles WHERE id = p_oracle_id AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oracle_not_found');
  END IF;

  SELECT id INTO v_set_id FROM sets
  WHERE set_code = upper(p_set_code) AND deleted_at IS NULL;
  IF v_set_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  INSERT INTO printings (id, oracle_id, set_id, public_slug, source)
  VALUES (p_printing_id, p_oracle_id, v_set_id, p_public_slug, 'manual');

  PERFORM admin__log(p_actor, 'printing.create', 'printing', p_printing_id,
                     jsonb_build_object('definition', p_definition));

  RETURN admin_patch_printing(p_printing_id, p_definition, p_actor);
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_printing(
  p_printing_id text,
  p_reason      text,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE printings SET deleted_at = now() WHERE id = p_printing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'printing_not_found');
  END IF;
  DELETE FROM resolved_printings WHERE printing_id = p_printing_id;
  DELETE FROM ruling_matches WHERE printing_id = p_printing_id;
  PERFORM admin__log(p_actor, 'printing.delete', 'printing', p_printing_id,
                     jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_restore_printing(p_printing_id text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE printings SET deleted_at = NULL WHERE id = p_printing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'printing_not_found');
  END IF;
  PERFORM refresh_ruling_matches_for_printing(p_printing_id);
  PERFORM admin__log(p_actor, 'printing.restore', 'printing', p_printing_id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_printing_slug(
  p_printing_id text,
  p_slug        text,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM printings WHERE public_slug = p_slug AND id <> p_printing_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_taken');
  END IF;
  UPDATE printings SET public_slug = p_slug WHERE id = p_printing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'printing_not_found');
  END IF;
  PERFORM admin__log(p_actor, 'printing.slug', 'printing', p_printing_id,
                     jsonb_build_object('slug', p_slug));
  RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id, 'slug', p_slug);
END;
$$;

-- ── admin: printing deltas ────────────────────────────────────────────────────
--
-- The same mechanism ingest uses, written by hand. A NULL delta clears the
-- admin row entirely and the printing falls back to inheriting its oracle.

CREATE OR REPLACE FUNCTION admin_set_printing_delta(
  p_printing_id text,
  p_delta       jsonb,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM printings WHERE id = p_printing_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'printing_not_found');
  END IF;

  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    DELETE FROM printing_deltas WHERE printing_id = p_printing_id AND source = 'admin';
    PERFORM admin__log(p_actor, 'printing.delta.clear', 'printing', p_printing_id, '{}'::jsonb);
    RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id, 'cleared', true);
  END IF;

  INSERT INTO printing_deltas (
    printing_id, tags_added, tags_removed, domains_added, domains_removed,
    keywords_added, keywords_removed, meta_flags_added, meta_flags_removed,
    name_override, card_type_override, supertype_override, energy_override,
    might_override, power_override, might_bonus_override, text_rich_override,
    text_plain_override, equipment_text_override, cleared_fields, source, edited_by
  )
  VALUES (
    p_printing_id,
    coalesce(admin__text_array(p_delta->'tags_added'), '{}'),
    coalesce(admin__text_array(p_delta->'tags_removed'), '{}'),
    coalesce(admin__text_array(p_delta->'domains_added'), '{}'),
    coalesce(admin__text_array(p_delta->'domains_removed'), '{}'),
    coalesce(admin__text_array(p_delta->'keywords_added'), '{}'),
    coalesce(admin__text_array(p_delta->'keywords_removed'), '{}'),
    coalesce(admin__text_array(p_delta->'meta_flags_added'), '{}'),
    coalesce(admin__text_array(p_delta->'meta_flags_removed'), '{}'),
    p_delta->>'name_override', p_delta->>'card_type_override',
    p_delta->>'supertype_override', (p_delta->>'energy_override')::integer,
    (p_delta->>'might_override')::integer, (p_delta->>'power_override')::integer,
    (p_delta->>'might_bonus_override')::integer, p_delta->>'text_rich_override',
    p_delta->>'text_plain_override', p_delta->>'equipment_text_override',
    coalesce(admin__text_array(p_delta->'cleared_fields'), '{}'),
    'admin', p_actor
  )
  ON CONFLICT (printing_id) DO UPDATE SET
    tags_added         = excluded.tags_added,
    tags_removed       = excluded.tags_removed,
    domains_added      = excluded.domains_added,
    domains_removed    = excluded.domains_removed,
    keywords_added     = excluded.keywords_added,
    keywords_removed   = excluded.keywords_removed,
    meta_flags_added   = excluded.meta_flags_added,
    meta_flags_removed = excluded.meta_flags_removed,
    name_override           = excluded.name_override,
    card_type_override      = excluded.card_type_override,
    supertype_override      = excluded.supertype_override,
    energy_override         = excluded.energy_override,
    might_override          = excluded.might_override,
    power_override          = excluded.power_override,
    might_bonus_override    = excluded.might_bonus_override,
    text_rich_override      = excluded.text_rich_override,
    text_plain_override     = excluded.text_plain_override,
    equipment_text_override = excluded.equipment_text_override,
    cleared_fields          = excluded.cleared_fields,
    source                  = 'admin',
    edited_by               = excluded.edited_by;

  PERFORM admin__log(p_actor, 'printing.delta', 'printing', p_printing_id,
                     jsonb_build_object('delta', p_delta));
  PERFORM refresh_ruling_matches_for_printing(p_printing_id);

  RETURN jsonb_build_object('ok', true, 'printing_id', p_printing_id, 'delta', p_delta);
END;
$$;

-- ── admin: relationships ──────────────────────────────────────────────────────
--
-- Oracle scope only — a relationship is a property of the rules object, so
-- there is no per-printing exception to express. Setting an edge list locks
-- the oracle's relationships against ingest.

CREATE OR REPLACE FUNCTION admin_set_oracle_relationships(
  p_oracle_id uuid,
  p_entries   jsonb,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry   jsonb;
  v_written integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM oracles WHERE id = p_oracle_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oracle_not_found');
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) LOOP
    IF (v_entry->>'kind') NOT IN ('makes_token', 'character', 'signature') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind',
                                'kind', v_entry->>'kind');
    END IF;
    IF (v_entry->>'to_oracle_id')::uuid = p_oracle_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'self_relation');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM oracles
                   WHERE id = (v_entry->>'to_oracle_id')::uuid AND deleted_at IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'related_oracle_not_found',
                                'to_oracle_id', v_entry->>'to_oracle_id');
    END IF;
  END LOOP;

  DELETE FROM oracle_relationships WHERE from_oracle_id = p_oracle_id;

  INSERT INTO oracle_relationships (from_oracle_id, to_oracle_id, kind, source)
  SELECT p_oracle_id, (e->>'to_oracle_id')::uuid, e->>'kind', 'admin'
  FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) AS e
  ON CONFLICT (from_oracle_id, kind, to_oracle_id) DO NOTHING;

  GET DIAGNOSTICS v_written = ROW_COUNT;

  UPDATE oracles
  SET locked_fields = CASE WHEN 'relationships' = ANY (locked_fields)
                           THEN locked_fields
                           ELSE locked_fields || 'relationships'::text END
  WHERE id = p_oracle_id;

  PERFORM admin__log(p_actor, 'oracle.relationships', 'oracle', p_oracle_id::text,
                     jsonb_build_object('entries', p_entries, 'written', v_written));

  RETURN jsonb_build_object('ok', true, 'oracle_id', p_oracle_id, 'written', v_written);
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_oracle_relationships(p_oracle_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'oracle_id', p_oracle_id,
    'outgoing', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', rel.kind, 'to_oracle_id', rel.to_oracle_id,
        'name', o.name, 'slug', o.slug, 'source', rel.source) ORDER BY rel.kind, o.name)
      FROM oracle_relationships rel
      JOIN oracles o ON o.id = rel.to_oracle_id
      WHERE rel.from_oracle_id = p_oracle_id), '[]'::jsonb),
    'incoming', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', rel.kind, 'from_oracle_id', rel.from_oracle_id,
        'name', o.name, 'slug', o.slug, 'source', rel.source) ORDER BY rel.kind, o.name)
      FROM oracle_relationships rel
      JOIN oracles o ON o.id = rel.from_oracle_id
      WHERE rel.to_oracle_id = p_oracle_id), '[]'::jsonb)
  );
$$;

-- ── admin: legalities ─────────────────────────────────────────────────────────
--
-- One function for both scopes. Oracle scope also clears every printing
-- exception in the group, so an admin setting a card-wide status is not
-- silently overruled by a stale per-printing row.

CREATE OR REPLACE FUNCTION admin_set_legality(
  p_oracle_id   uuid,
  p_printing_id text,
  p_format_code text,
  p_status      text,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_format_id uuid;
BEGIN
  SELECT id INTO v_format_id FROM formats WHERE code = lower(p_format_code);
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('legal', 'not_legal', 'banned') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  IF p_printing_id IS NOT NULL THEN
    IF p_status IS NULL THEN
      DELETE FROM printing_legalities
      WHERE printing_id = p_printing_id AND format_id = v_format_id;
    ELSE
      INSERT INTO printing_legalities (printing_id, format_id, status, updated_by)
      VALUES (p_printing_id, v_format_id, p_status, p_actor)
      ON CONFLICT (printing_id, format_id)
      DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by,
                    updated_at = now();
    END IF;
    PERFORM admin__log(p_actor, 'printing.legality', 'printing', p_printing_id,
                       jsonb_build_object('format', p_format_code, 'status', p_status));
    RETURN jsonb_build_object('ok', true, 'scope', 'printing', 'printing_id', p_printing_id);
  END IF;

  -- Absence means legal at oracle level, so 'legal' is a delete rather than a
  -- stored row.
  IF p_status IS NULL OR p_status = 'legal' THEN
    DELETE FROM oracle_legalities WHERE oracle_id = p_oracle_id AND format_id = v_format_id;
  ELSE
    INSERT INTO oracle_legalities (oracle_id, format_id, status, updated_by)
    VALUES (p_oracle_id, v_format_id, p_status, p_actor)
    ON CONFLICT (oracle_id, format_id)
    DO UPDATE SET status = excluded.status, updated_by = excluded.updated_by,
                  updated_at = now();
  END IF;

  DELETE FROM printing_legalities pl
  USING printings p
  WHERE pl.printing_id = p.id AND p.oracle_id = p_oracle_id AND pl.format_id = v_format_id;

  PERFORM admin__log(p_actor, 'oracle.legality', 'oracle', p_oracle_id::text,
                     jsonb_build_object('format', p_format_code, 'status', p_status));
  RETURN jsonb_build_object('ok', true, 'scope', 'oracle', 'oracle_id', p_oracle_id);
END;
$$;

CREATE OR REPLACE FUNCTION legalities_for_printing(p_printing_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.sort_order, x.name), '[]'::jsonb)
  FROM (
    SELECT f.id AS format_id, f.code AS format_code, f.name, f.sort_order,
           coalesce(pl.status, ol.status, 'legal') AS status,
           CASE WHEN pl.status IS NOT NULL THEN 'printing'
                WHEN ol.status IS NOT NULL THEN 'oracle'
                ELSE 'default' END AS scope
    FROM formats f
    CROSS JOIN printings p
    LEFT JOIN printing_legalities pl
      ON pl.printing_id = p.id AND pl.format_id = f.id
    LEFT JOIN oracle_legalities ol
      ON ol.oracle_id = p.oracle_id AND ol.format_id = f.id
    WHERE p.id = p_printing_id AND f.active
  ) x;
$$;

-- ── admin: sets ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_create_set(
  p_set_code   text,
  p_definition jsonb,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text := upper(btrim(p_set_code));
BEGIN
  IF coalesce(btrim(p_definition->>'set_name'), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_name_required');
  END IF;
  IF EXISTS (SELECT 1 FROM sets WHERE set_code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_exists');
  END IF;

  INSERT INTO sets (set_code, set_name, set_uri, set_search_uri, published_on,
                    is_promo, parent_set_code, source)
  VALUES (v_code, p_definition->>'set_name', p_definition->>'set_uri',
          p_definition->>'set_search_uri', (p_definition->>'published_on')::date,
          coalesce((p_definition->>'is_promo')::boolean, false),
          p_definition->>'parent_set_code', 'manual');

  PERFORM admin__log(p_actor, 'set.create', 'set', v_code,
                     jsonb_build_object('definition', p_definition));
  RETURN jsonb_build_object('ok', true, 'set_code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION admin_patch_set(
  p_set_code text,
  p_patch    jsonb,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code    text := upper(btrim(p_set_code));
  v_allowed text[] := ARRAY['set_name', 'published_on', 'is_promo'];
BEGIN
  UPDATE sets s SET
    set_name = CASE WHEN p_patch ? 'set_name' THEN p_patch->>'set_name' ELSE s.set_name END,
    set_uri  = CASE WHEN p_patch ? 'set_uri'  THEN p_patch->>'set_uri'  ELSE s.set_uri END,
    set_search_uri = CASE WHEN p_patch ? 'set_search_uri'
                          THEN p_patch->>'set_search_uri' ELSE s.set_search_uri END,
    published_on = CASE WHEN p_patch ? 'published_on'
                        THEN (p_patch->>'published_on')::date ELSE s.published_on END,
    is_promo = CASE WHEN p_patch ? 'is_promo'
                    THEN coalesce((p_patch->>'is_promo')::boolean, false) ELSE s.is_promo END,
    parent_set_code = CASE WHEN p_patch ? 'parent_set_code'
                           THEN p_patch->>'parent_set_code' ELSE s.parent_set_code END,
    locked_fields = admin__merge_locks(s.locked_fields, p_patch, v_allowed)
  WHERE s.set_code = v_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  PERFORM admin__log(p_actor, 'set.patch', 'set', v_code,
                     jsonb_build_object('patch', p_patch));
  RETURN jsonb_build_object('ok', true, 'set_code', v_code, 'patch', p_patch);
END;
$$;

-- printings.set_id is ON DELETE RESTRICT, so a non-empty set is refused by the
-- constraint rather than by a hand-rolled count.
CREATE OR REPLACE FUNCTION admin_delete_set(
  p_set_code text,
  p_reason   text,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code  text := upper(btrim(p_set_code));
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sets WHERE set_code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  SELECT count(*) INTO v_count FROM printings p
  JOIN sets s ON s.id = p.set_id WHERE s.set_code = v_code;

  IF v_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_empty', 'card_count', v_count);
  END IF;

  UPDATE sets SET deleted_at = now() WHERE set_code = v_code;
  PERFORM admin__log(p_actor, 'set.delete', 'set', v_code,
                     jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'set_code', v_code);
END;
$$;

-- ── admin: formats ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin__format_json(p_format formats)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'object', 'format', 'id', p_format.id, 'code', p_format.code,
    'name', p_format.name, 'sort_order', p_format.sort_order,
    'active', p_format.active);
$$;

CREATE OR REPLACE FUNCTION admin_create_format(
  p_code       text,
  p_name       text,
  p_sort_order integer,
  p_active     boolean,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text := lower(btrim(p_code));
  v_row  formats;
BEGIN
  IF v_code !~ '^[a-z0-9][a-z0-9_-]*$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;
  IF EXISTS (SELECT 1 FROM formats WHERE code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_exists');
  END IF;

  INSERT INTO formats (code, name, sort_order, active)
  VALUES (v_code, p_name,
          coalesce(p_sort_order, (SELECT coalesce(max(sort_order), 0) + 1 FROM formats)),
          coalesce(p_active, true))
  RETURNING * INTO v_row;

  PERFORM admin__log(p_actor, 'format.create', 'format', v_code, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'format', admin__format_json(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION admin_patch_format(p_code text, p_patch jsonb, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row formats;
BEGIN
  UPDATE formats f SET
    name       = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE f.name END,
    sort_order = CASE WHEN p_patch ? 'sort_order'
                      THEN (p_patch->>'sort_order')::integer ELSE f.sort_order END,
    active     = CASE WHEN p_patch ? 'active'
                      THEN coalesce((p_patch->>'active')::boolean, true) ELSE f.active END
  WHERE f.code = lower(p_code)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  PERFORM admin__log(p_actor, 'format.patch', 'format', lower(p_code),
                     jsonb_build_object('patch', p_patch));
  RETURN jsonb_build_object('ok', true, 'format', admin__format_json(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_format(p_code text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_oracle integer;
  v_printing integer;
BEGIN
  SELECT id INTO v_id FROM formats WHERE code = lower(p_code);
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  SELECT count(*) INTO v_oracle   FROM oracle_legalities   WHERE format_id = v_id;
  SELECT count(*) INTO v_printing FROM printing_legalities WHERE format_id = v_id;

  DELETE FROM formats WHERE id = v_id;

  PERFORM admin__log(p_actor, 'format.delete', 'format', lower(p_code),
                     jsonb_build_object('legalities_removed', v_oracle,
                                        'overrides_removed', v_printing));
  RETURN jsonb_build_object('ok', true, 'legalities_removed', v_oracle,
                            'overrides_removed', v_printing);
END;
$$;

CREATE OR REPLACE FUNCTION admin_reorder_formats(p_codes jsonb, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_i    integer := 0;
BEGIN
  FOR v_code IN SELECT value FROM jsonb_array_elements_text(p_codes) LOOP
    IF NOT EXISTS (SELECT 1 FROM formats WHERE code = lower(v_code)) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found', 'code', v_code);
    END IF;
  END LOOP;

  FOR v_code IN SELECT value FROM jsonb_array_elements_text(p_codes) LOOP
    v_i := v_i + 1;
    UPDATE formats SET sort_order = v_i WHERE code = lower(v_code);
  END LOOP;

  PERFORM admin__log(p_actor, 'format.reorder', 'format', NULL,
                     jsonb_build_object('codes', p_codes));
  RETURN jsonb_build_object('ok', true, 'count', v_i);
END;
$$;

-- ── admin: rulings ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin__ruling_json(p_ruling_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'object', 'ruling', 'id', ru.id, 'type', ru.type, 'text', ru.text,
    'dated', ru.dated, 'source', ru.source, 'active', ru.active,
    'created_at', ru.created_at, 'updated_at', ru.updated_at,
    'targets', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'kind', t.kind, 'oracle_id', t.oracle_id,
        'printing_id', t.printing_id, 'query', t.query,
        'match_count', CASE WHEN t.kind = 'query'
          THEN (SELECT count(*) FROM ruling_matches m WHERE m.target_id = t.id)
          ELSE NULL END) ORDER BY t.kind, t.created_at)
      FROM ruling_targets t WHERE t.ruling_id = ru.id), '[]'::jsonb))
  FROM rulings ru WHERE ru.id = p_ruling_id;
$$;

-- Full replacement. A `query` target is rendered at save time so an AST that
-- cannot become SQL is rejected here rather than silently matching nothing
-- forever.
CREATE OR REPLACE FUNCTION admin__replace_ruling_targets(p_ruling_id uuid, p_targets jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_target jsonb;
  v_dummy  text;
BEGIN
  IF p_targets IS NULL OR jsonb_array_length(p_targets) = 0 THEN
    RAISE EXCEPTION 'A ruling needs at least one target';
  END IF;

  FOR v_target IN SELECT * FROM jsonb_array_elements(p_targets) LOOP
    IF (v_target->>'kind') = 'query' THEN
      v_dummy := card_search_ast_to_sql(v_target->'ast');
    ELSIF (v_target->>'kind') NOT IN ('oracle', 'printing') THEN
      RAISE EXCEPTION 'Unsupported ruling target kind: %', v_target->>'kind';
    END IF;
  END LOOP;

  DELETE FROM ruling_targets WHERE ruling_id = p_ruling_id;

  INSERT INTO ruling_targets (ruling_id, kind, oracle_id, printing_id, query, ast)
  SELECT p_ruling_id, t->>'kind',
         nullif(t->>'oracle_id', '')::uuid,
         nullif(t->>'printing_id', ''),
         t->>'query',
         CASE WHEN (t->>'kind') = 'query' THEN t->'ast' ELSE NULL END
  FROM jsonb_array_elements(p_targets) AS t;
END;
$$;

CREATE OR REPLACE FUNCTION admin_create_ruling(
  p_type    text,
  p_text    text,
  p_dated   date,
  p_source  text,
  p_targets jsonb,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO rulings (type, text, dated, source, created_by)
  VALUES (p_type, p_text, p_dated, p_source, p_actor)
  RETURNING id INTO v_id;

  PERFORM admin__replace_ruling_targets(v_id, p_targets);
  PERFORM refresh_ruling_rule_matches(t.id)
  FROM ruling_targets t WHERE t.ruling_id = v_id AND t.kind = 'query';

  PERFORM admin__log(p_actor, 'ruling.create', 'ruling', v_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'ruling', admin__ruling_json(v_id));
END;
$$;

CREATE OR REPLACE FUNCTION admin_patch_ruling(p_ruling_id uuid, p_patch jsonb, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rulings WHERE id = p_ruling_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  UPDATE rulings ru SET
    type   = CASE WHEN p_patch ? 'type'   THEN p_patch->>'type'   ELSE ru.type END,
    text   = CASE WHEN p_patch ? 'text'   THEN p_patch->>'text'   ELSE ru.text END,
    dated  = CASE WHEN p_patch ? 'dated'  THEN (p_patch->>'dated')::date ELSE ru.dated END,
    source = CASE WHEN p_patch ? 'source' THEN p_patch->>'source' ELSE ru.source END,
    active = CASE WHEN p_patch ? 'active'
                  THEN coalesce((p_patch->>'active')::boolean, true) ELSE ru.active END
  WHERE ru.id = p_ruling_id;

  IF p_patch ? 'targets' THEN
    PERFORM admin__replace_ruling_targets(p_ruling_id, p_patch->'targets');
  END IF;

  PERFORM refresh_ruling_rule_matches(t.id)
  FROM ruling_targets t WHERE t.ruling_id = p_ruling_id AND t.kind = 'query';

  PERFORM admin__log(p_actor, 'ruling.patch', 'ruling', p_ruling_id::text,
                     jsonb_build_object('patch', p_patch));
  RETURN jsonb_build_object('ok', true, 'ruling', admin__ruling_json(p_ruling_id));
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_ruling(p_ruling_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM rulings WHERE id = p_ruling_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;
  PERFORM admin__log(p_actor, 'ruling.delete', 'ruling', p_ruling_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_rulings(
  p_query  text DEFAULT NULL,
  p_kind   text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT DISTINCT ru.id, ru.created_at
    FROM rulings ru
    LEFT JOIN ruling_targets t ON t.ruling_id = ru.id
    WHERE (p_query IS NULL OR p_query = ''
           OR ru.text ILIKE '%' || escape_ilike_pattern(p_query) || '%')
      AND (p_kind IS NULL OR p_kind = '' OR t.kind = p_kind)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rulings', coalesce((
      SELECT jsonb_agg(admin__ruling_json(f.id) ORDER BY f.created_at DESC)
      FROM (SELECT id, created_at FROM filtered ORDER BY created_at DESC
            LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
            OFFSET greatest(0, coalesce(p_offset, 0))) f), '[]'::jsonb));
$$;

-- Card-editor panel view: every ruling that reaches this printing, with how it
-- got there.
CREATE OR REPLACE FUNCTION admin_printing_rulings(p_printing_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.dated NULLS LAST, x.created_at), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (ru.id)
      ru.id, ru.type, ru.text, ru.dated, ru.source, ru.active,
      ru.created_at, ru.updated_at,
      CASE t.kind WHEN 'printing' THEN 'printing'
                  WHEN 'oracle'   THEN 'oracle'
                  ELSE 'rule' END AS scope,
      (SELECT count(*) FROM ruling_targets t2 WHERE t2.ruling_id = ru.id) AS target_count,
      (SELECT count(*) FROM ruling_targets t3 WHERE t3.ruling_id = ru.id) > 1 AS shared
    FROM rulings ru
    JOIN ruling_targets t ON t.ruling_id = ru.id
    JOIN printings p ON p.id = p_printing_id
    WHERE (t.kind = 'printing' AND t.printing_id = p_printing_id)
       OR (t.kind = 'oracle' AND t.oracle_id = p.oracle_id)
       OR (t.kind = 'query' AND EXISTS (
             SELECT 1 FROM ruling_matches m
             WHERE m.target_id = t.id AND m.printing_id = p_printing_id))
    ORDER BY ru.id, t.kind
  ) x;
$$;

-- ── admin: review queue ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_resolve_reconciliation_entry(
  p_entry_id    uuid,
  p_action      text,
  p_printing_id text,
  p_patch       jsonb,
  p_note        text,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  SELECT status INTO v_status FROM reconciliation_queue WHERE id = p_entry_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_entry_not_found');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_entry_resolved');
  END IF;
  IF p_action NOT IN ('confirm', 'dismiss') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  -- Confirming routes the patch through the normal admin path, so the change
  -- lands in locked_fields and survives the next ingest exactly like a
  -- hand-made edit.
  IF p_action = 'confirm' AND p_printing_id IS NOT NULL
     AND p_patch IS NOT NULL AND p_patch <> '{}'::jsonb THEN
    v_result := admin_patch_printing(p_printing_id, p_patch, p_actor);
    IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
      RETURN v_result;
    END IF;
  END IF;

  UPDATE reconciliation_queue
  SET status = CASE p_action WHEN 'confirm' THEN 'confirmed' ELSE 'dismissed' END,
      note = coalesce(p_note, note),
      resolved_by = p_actor,
      resolved_at = now()
  WHERE id = p_entry_id;

  PERFORM admin__log(p_actor, 'reconciliation.' || p_action, 'reconciliation',
                     p_entry_id::text,
                     jsonb_build_object('printing_id', p_printing_id, 'patch', p_patch));
  RETURN jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'action', p_action);
END;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
--
-- Every card table is service-role only: RLS is enabled with no policies, and
-- the explicit grants below make that intent legible rather than relying on
-- default privileges.

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'sets', 'artists', 'oracles', 'printings', 'printing_deltas',
    'oracle_relationships', 'resolved_printings', 'formats',
    'oracle_legalities', 'printing_legalities', 'rulings', 'ruling_targets',
    'ruling_matches', 'reconciliation_queue'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END
$$;

-- Append-only by grant: an audit log you can delete from is not an audit log.
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'escape_ilike_pattern(text)',
    'card_keywords_from_text(text)',
    'apply_array_delta(text[], text[], text[])',
    'card_search_ast_to_sql(jsonb)',
    'search_printing_ids(jsonb, text, text, int, boolean)',
    'refresh_resolved_printings(text[])',
    'refresh_preferred_printings(uuid[])',
    'projection_deferred()',
    'refresh_ruling_rule_matches(uuid)',
    'refresh_ruling_matches_for_printing(text)',
    'ruling_rule_preview(jsonb, int)',
    'rulings_for_printing(text)',
    'legalities_for_printing(text)',
    'ingest_catalogue(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean)',
    'apply_printing_hosted_media(text, text, text, text, text, text)',
    'ingest_reconciliation_queue(jsonb, jsonb, boolean)',
    'admin__log(uuid, text, text, text, jsonb)',
    'admin__resolve_artist(text)',
    'admin__text_array(jsonb)',
    'admin__merge_locks(text[], jsonb, text[])',
    'admin_patch_oracle(uuid, jsonb, uuid)',
    'admin_create_oracle(text, text, jsonb, uuid)',
    'admin_delete_oracle(uuid, text, uuid)',
    'admin_restore_oracle(uuid, uuid)',
    'admin_patch_printing(text, jsonb, uuid)',
    'admin_create_printing(text, uuid, text, text, jsonb, uuid)',
    'admin_delete_printing(text, text, uuid)',
    'admin_restore_printing(text, uuid)',
    'admin_set_printing_slug(text, text, uuid)',
    'admin_set_printing_delta(text, jsonb, uuid)',
    'admin_set_oracle_relationships(uuid, jsonb, uuid)',
    'admin_list_oracle_relationships(uuid)',
    'admin_set_legality(uuid, text, text, text, uuid)',
    'admin_create_set(text, jsonb, uuid)',
    'admin_patch_set(text, jsonb, uuid)',
    'admin_delete_set(text, text, uuid)',
    'admin__format_json(formats)',
    'admin_create_format(text, text, integer, boolean, uuid)',
    'admin_patch_format(text, jsonb, uuid)',
    'admin_delete_format(text, uuid)',
    'admin_reorder_formats(jsonb, uuid)',
    'admin__ruling_json(uuid)',
    'admin__replace_ruling_targets(uuid, jsonb)',
    'admin_create_ruling(text, text, date, text, jsonb, uuid)',
    'admin_patch_ruling(uuid, jsonb, uuid)',
    'admin_delete_ruling(uuid, uuid)',
    'admin_list_rulings(text, text, int, int)',
    'admin_printing_rulings(text)',
    'admin_resolve_reconciliation_entry(uuid, text, text, jsonb, text, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', v_fn);
  END LOOP;
END
$$;
