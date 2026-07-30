-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Phase 7 — searchable keywords, richer search grammar, ruling rules      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Three related changes:
--
--   1. `cards.keywords` — the `[Keyword]` tags a printing's rules text carries,
--      kept in sync by trigger so `kw:` search and keyword-scoped rulings can
--      use an index instead of scanning text.
--
--   2. `card_search_ast_to_sql` grows the v2 grammar: keyword / domain / tag /
--      set / produces / supertype / name filters, numeric comparisons, legality
--      lookups and `is:` flags.
--
--   3. Rulings gain a **targets** layer. A ruling is no longer bound to one
--      oracle group: it carries any number of targets, each of which is a whole
--      card (`oracle`), a single printing (`printing`), or a saved search query
--      (`query`). Query targets are materialised into `card_ruling_matches`,
--      refreshed after every ingest, which is what makes a rule like
--      "every unit with [Deathknell]" pick up future releases on its own.

-- ── 1. cards.keywords ─────────────────────────────────────────────────────────

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

-- SQL mirror of `extractCardKeywords()` in packages/types/src/keywords.ts.
--
-- Unlike `card_oracle_key`, this one is not backfill-only: keywords are derived
-- here on every write (see the trigger below) rather than sent in the ingest
-- payload. Deriving in one trigger keeps ingest, admin card patches and manual
-- card creation in step automatically — three separate write paths that would
-- otherwise each have to remember to recompute the column. Keep the TypeScript
-- copy, which backs the admin rule preview, in step with this one.
--
-- Mirrors the TS filter exactly: a `[…]` span counts as a keyword only when it
-- starts with a letter, is at most 40 characters, and is not the `[No Text]`
-- sentinel. A trailing number is part of the badge, not the identity, so
-- `[Deflect 3]` and `[Deflect 1]` both key as `deflect`.
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

CREATE OR REPLACE FUNCTION cards_set_keywords()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Rich text carries the markup; plain is the fallback for rows that only ever
  -- had the stripped variant.
  NEW.keywords := card_keywords_from_text(
    coalesce(NEW.text->>'rich', NEW.text->>'plain', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cards_keywords_sync ON cards;
CREATE TRIGGER cards_keywords_sync
  BEFORE INSERT OR UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION cards_set_keywords();

-- Backfill everything that predates the column.
UPDATE cards
SET keywords = card_keywords_from_text(
  coalesce(text->>'rich', text->>'plain', '')
)
WHERE keywords = '{}'::text[];

-- `kw:` is array containment; `d:` walks the domains array. Both get GIN.
CREATE INDEX IF NOT EXISTS cards_keywords_idx ON cards USING gin (keywords);
CREATE INDEX IF NOT EXISTS cards_domains_idx
  ON cards USING gin ((classification -> 'domains'));

-- ── 2. Search grammar v2 ──────────────────────────────────────────────────────
--
-- Mirrors `CardSearchAst` in packages/core/src/card-search-query.ts:
--   { op: "and"|"or", children: AST[] }
--   { op: "not", child: AST }
--   { op: "text", value }                      -- FTS
--   { op: "exact_name", value }                -- pre-normalized
--   { op: "filter", field, value }             -- see FIELD list below
--   { op: "numeric", field, cmp, value }       -- energy|might|power|domain_count
--   { op: "legality", format, status }         -- resolved through the 3 layers
--   { op: "flag", value }                      -- is:token, is:signature, …
--
-- Every field is whitelisted and every value goes through quote_literal or
-- escape_ilike_pattern, so an AST arriving over PostgREST cannot inject SQL.
-- The expression is evaluated against `cards c LEFT JOIN artists a`.
CREATE OR REPLACE FUNCTION card_search_ast_to_sql(p_ast jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_op       text;
  v_children jsonb;
  v_child    jsonb;
  v_field    text;
  v_value    text;
  v_pattern  text;
  v_clean    text;
  v_words    text[];
  v_parts    text[];
  v_word     text;
  v_i        int;
  v_cmp      text;
  v_num      numeric;
  v_expr     text;
  v_status   text;
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
    RETURN 'c.name_search @@ to_tsquery(''simple'', ' ||
           quote_literal(array_to_string(v_parts, ' & ')) || ')';
  END IF;

  IF v_op = 'exact_name' THEN
    v_value := coalesce(p_ast->>'value', '');
    RETURN 'c.name_normalized = ' || quote_literal(v_value);
  END IF;

  IF v_op = 'filter' THEN
    v_field := p_ast->>'field';
    v_value := coalesce(p_ast->>'value', '');
    v_pattern := '%' || escape_ilike_pattern(v_value) || '%';

    IF v_field = 'type' THEN
      -- Match the type line broadly: type, supertype, or any tag.
      RETURN
        '((c.classification->>''type'') ILIKE '   || quote_literal(v_pattern) ||
        ' OR (c.classification->>''supertype'') ILIKE ' || quote_literal(v_pattern) ||
        ' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
              'coalesce(c.classification->''tags'', ''[]''::jsonb)) tag ' ||
              'WHERE tag ILIKE ' || quote_literal(v_pattern) || '))';

    ELSIF v_field = 'supertype' THEN
      RETURN '(c.classification->>''supertype'') ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'rarity' THEN
      RETURN '(c.classification->>''rarity'') ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'artist' THEN
      RETURN 'a.name ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'name' THEN
      RETURN 'c.name ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'tag' THEN
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
             'coalesce(c.classification->''tags'', ''[]''::jsonb)) tag ' ||
             'WHERE tag ILIKE ' || quote_literal(v_pattern) || ')';

    ELSIF v_field = 'keyword' THEN
      -- Exact containment against the normalized array — the parser has already
      -- folded the value to its base key, so `kw:"Deflect 3"` arrives as
      -- `deflect` and hits the GIN index.
      RETURN 'c.keywords @> ARRAY[' || quote_literal(lower(btrim(v_value))) || ']::text[]';

    ELSIF v_field = 'domain' THEN
      -- Exact (case-insensitive) rather than substring: domains are a small
      -- closed vocabulary, and a card may carry several.
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
             'coalesce(c.classification->''domains'', ''[]''::jsonb)) dom ' ||
             'WHERE lower(dom) = ' || quote_literal(lower(btrim(v_value))) || ')';

    ELSIF v_field = 'set' THEN
      RETURN 'EXISTS (SELECT 1 FROM sets st WHERE st.id = c.set_id ' ||
             'AND lower(st.set_code) = ' || quote_literal(lower(btrim(v_value))) || ')';

    ELSIF v_field = 'produces' THEN
      -- Tokens and other produced parts hang off all_parts.
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements(' ||
             'coalesce(c.all_parts, ''[]''::jsonb)) part ' ||
             'WHERE (part->>''name'') ILIKE ' || quote_literal(v_pattern) || ')';

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
      v_expr := 'jsonb_array_length(coalesce(c.classification->''domains'', ''[]''::jsonb))';
    ELSIF v_field IN ('energy', 'might', 'power') THEN
      -- Guard the cast: a stat may be absent, null, or (defensively) non-numeric
      -- text. Anything uncastable yields NULL, so the comparison is unknown and
      -- the card drops out — the same semantics the TS evaluator uses.
      v_expr :=
        '(CASE WHEN (c.attributes->>' || quote_literal(v_field) ||
        ') ~ ''^-?[0-9]+(\.[0-9]+)?$'' THEN (c.attributes->>' ||
        quote_literal(v_field) || ')::numeric END)';
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
    -- Precedence: printing override → oracle row → default legal. The EXISTS
    -- guard means an unknown format code matches nothing, rather than matching
    -- every card by falling through to the default.
    RETURN
      '(EXISTS (SELECT 1 FROM formats f0 WHERE f0.code = ' || quote_literal(v_value) || ') ' ||
      'AND coalesce(' ||
        '(SELECT o.status FROM card_legality_overrides o ' ||
         'JOIN formats f1 ON f1.id = o.format_id ' ||
         'WHERE o.card_id = c.id AND f1.code = ' || quote_literal(v_value) || '), ' ||
        '(SELECT l.status FROM card_legalities l ' ||
         'JOIN formats f2 ON f2.id = l.format_id ' ||
         'WHERE l.oracle_key = c.oracle_key AND f2.code = ' || quote_literal(v_value) || '), ' ||
        '''legal'') = ' || quote_literal(v_status) || ')';
  END IF;

  IF v_op = 'flag' THEN
    v_value := coalesce(p_ast->>'value', '');
    -- Compare the JSON text to 'true' rather than casting: a malformed value
    -- would make a ::boolean cast raise mid-query.
    IF    v_value = 'token'        THEN RETURN 'c.is_token';
    ELSIF v_value = 'manual'       THEN RETURN '(c.source = ''manual'')';
    ELSIF v_value = 'signature'    THEN RETURN '((c.metadata->>''signature'') = ''true'')';
    ELSIF v_value = 'alternate'    THEN RETURN '((c.metadata->>''alternate_art'') = ''true'')';
    ELSIF v_value = 'overnumbered' THEN RETURN '((c.metadata->>''overnumbered'') = ''true'')';
    ELSIF v_value = 'foil'         THEN
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
             'coalesce(c.metadata->''finishes'', ''[]''::jsonb)) fin ' ||
             'WHERE lower(fin) = ''foil'')';
    ELSE
      RAISE EXCEPTION 'Unsupported is: value: %', v_value;
    END IF;
  END IF;

  RAISE EXCEPTION 'Unknown AST op: %', coalesce(v_op, '<null>');
END;
$$;

-- `search_card_ids` builds `FROM cards c LEFT JOIN artists a`, which the set and
-- legality branches above rely on; it is otherwise unchanged from
-- 20260510140000 and does not need redefining here.

-- ── 3. Ruling targets ─────────────────────────────────────────────────────────
--
-- A ruling is the text; a target is what it applies to. Splitting them lets one
-- ruling cover several printings, a whole card, and/or a rule, and lets a rule
-- pick up cards that do not exist yet.

ALTER TABLE card_rulings
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS card_ruling_targets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ruling_id  uuid        NOT NULL REFERENCES card_rulings(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('oracle', 'printing', 'query')),
  -- Exactly one of these is populated, per the shape constraint below.
  oracle_key text,
  card_id    text,
  -- Query targets keep both the source text (so the admin UI can round-trip
  -- what was typed) and its parsed AST (what actually gets evaluated).
  query      text,
  ast        jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_ruling_targets_shape CHECK (
       (kind = 'oracle'   AND oracle_key IS NOT NULL AND card_id IS NULL     AND ast IS NULL)
    OR (kind = 'printing' AND card_id    IS NOT NULL AND oracle_key IS NULL  AND ast IS NULL)
    OR (kind = 'query'    AND ast IS NOT NULL AND NULLIF(btrim(query), '') IS NOT NULL
                          AND card_id IS NULL AND oracle_key IS NULL)
  )
);
ALTER TABLE card_ruling_targets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS card_ruling_targets_ruling_idx
  ON card_ruling_targets (ruling_id);
CREATE INDEX IF NOT EXISTS card_ruling_targets_oracle_idx
  ON card_ruling_targets (oracle_key) WHERE kind = 'oracle';
CREATE INDEX IF NOT EXISTS card_ruling_targets_card_idx
  ON card_ruling_targets (card_id) WHERE kind = 'printing';
CREATE INDEX IF NOT EXISTS card_ruling_targets_query_idx
  ON card_ruling_targets (id) WHERE kind = 'query';

-- One ruling should not name the same card or oracle group twice.
CREATE UNIQUE INDEX IF NOT EXISTS card_ruling_targets_oracle_uniq
  ON card_ruling_targets (ruling_id, oracle_key) WHERE kind = 'oracle';
CREATE UNIQUE INDEX IF NOT EXISTS card_ruling_targets_card_uniq
  ON card_ruling_targets (ruling_id, card_id) WHERE kind = 'printing';

-- Materialised query-target membership. No FK to cards: like the other override
-- tables these rows must survive a card being pruned and re-ingested, and the
-- refresh below rebuilds membership from `cards` anyway.
CREATE TABLE IF NOT EXISTS card_ruling_matches (
  target_id  uuid        NOT NULL REFERENCES card_ruling_targets(id) ON DELETE CASCADE,
  card_id    text        NOT NULL,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_id, card_id)
);
ALTER TABLE card_ruling_matches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS card_ruling_matches_card_idx
  ON card_ruling_matches (card_id);

-- Move the Phase 5 inline targeting into the new table, then drop the columns.
-- A row with card_id set was printing-scoped; a null card_id meant the whole
-- oracle group.
INSERT INTO card_ruling_targets (ruling_id, kind, oracle_key, card_id)
SELECT
  r.id,
  CASE WHEN r.card_id IS NULL THEN 'oracle' ELSE 'printing' END,
  CASE WHEN r.card_id IS NULL THEN r.oracle_key ELSE NULL END,
  r.card_id
FROM card_rulings r
WHERE NOT EXISTS (
  SELECT 1 FROM card_ruling_targets t WHERE t.ruling_id = r.id
);

DROP INDEX IF EXISTS card_rulings_oracle_key_idx;
DROP INDEX IF EXISTS card_rulings_card_id_idx;
ALTER TABLE card_rulings DROP COLUMN IF EXISTS oracle_key;
ALTER TABLE card_rulings DROP COLUMN IF EXISTS card_id;

CREATE INDEX IF NOT EXISTS card_rulings_created_idx
  ON card_rulings (created_at DESC);

-- ── refresh_ruling_rule_matches ───────────────────────────────────────────────
-- Recompute materialised membership for query targets: one target when given an
-- id, otherwise every one. Ingest calls the no-argument form once it finishes,
-- which is how a rule reaches a newly released card.
--
-- A target whose AST no longer renders (a field dropped from the grammar, say)
-- is skipped with its previous matches intact rather than aborting the run —
-- one bad rule must not cost every other rule its links.
CREATE OR REPLACE FUNCTION refresh_ruling_rule_matches(p_target_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t          record;
  v_where    text;
  v_sql      text;
  v_rows     bigint;
  v_targets  int    := 0;
  v_skipped  int    := 0;
  v_total    bigint := 0;
BEGIN
  FOR t IN
    SELECT tg.id, tg.ast
    FROM card_ruling_targets tg
    JOIN card_rulings r ON r.id = tg.ruling_id
    WHERE tg.kind = 'query'
      AND r.active
      AND (p_target_id IS NULL OR tg.id = p_target_id)
  LOOP
    BEGIN
      v_where := card_search_ast_to_sql(t.ast);
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    BEGIN
      DELETE FROM card_ruling_matches WHERE target_id = t.id;

      v_sql :=
        'INSERT INTO card_ruling_matches (target_id, card_id) ' ||
        'SELECT ' || quote_literal(t.id) || '::uuid, c.id ' ||
        'FROM cards c LEFT JOIN artists a ON a.id = c.artist_id ' ||
        'WHERE ' || v_where;
      EXECUTE v_sql;
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      v_targets := v_targets + 1;
      v_total   := v_total + v_rows;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  -- Drop matches belonging to rulings that have since been deactivated, so a
  -- disabled ruling stops appearing without waiting for its target to change.
  DELETE FROM card_ruling_matches m
  USING card_ruling_targets tg
  JOIN card_rulings r ON r.id = tg.ruling_id
  WHERE m.target_id = tg.id
    AND NOT r.active;

  RETURN jsonb_build_object(
    'ok',       true,
    'targets',  v_targets,
    'skipped',  v_skipped,
    'matches',  v_total
  );
END;
$$;

-- ── card_ruling_rule_preview ──────────────────────────────────────────────────
-- Evaluate an AST without storing anything, for the admin rule editor's
-- "matches N cards" readout. Returns the count plus a bounded sample.
CREATE OR REPLACE FUNCTION card_ruling_rule_preview(
  p_ast   jsonb,
  p_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_where  text;
  v_sql    text;
  v_result jsonb;
BEGIN
  p_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_where := card_search_ast_to_sql(p_ast);

  v_sql :=
    'WITH matched AS (' ||
    '  SELECT c.id, c.name, c.collector_number, c.public_slug, st.set_code ' ||
    '  FROM cards c ' ||
    '  LEFT JOIN artists a ON a.id = c.artist_id ' ||
    '  LEFT JOIN sets st ON st.id = c.set_id ' ||
    '  WHERE ' || v_where ||
    ') ' ||
    'SELECT jsonb_build_object(' ||
    '  ''total'', (SELECT count(*) FROM matched), ' ||
    '  ''sample'', coalesce((SELECT jsonb_agg(to_jsonb(sub)) FROM (' ||
    '     SELECT id, name, set_code, collector_number, public_slug ' ||
    '     FROM matched ORDER BY name LIMIT ' || p_limit::text ||
    '  ) sub), ''[]''::jsonb)' ||
    ')';

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

-- ── card_rulings_for_card ─────────────────────────────────────────────────────
-- The public read path. Oracle and printing targets resolve live (indexed, and
-- never stale for a brand-new printing of an existing card); query targets read
-- the materialised table.
CREATE OR REPLACE FUNCTION card_rulings_for_card(
  p_card_id    text,
  p_oracle_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH oracle AS (
    SELECT coalesce(
      NULLIF(btrim(coalesce(p_oracle_key, '')), ''),
      (SELECT c.oracle_key FROM cards c WHERE c.id = p_card_id)
    ) AS key
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.dated NULLS LAST, x.created_at), '[]'::jsonb)
  FROM (
    SELECT
      r.id, r.type, r.text, r.dated, r.source, r.created_at, r.updated_at,
      -- Which target pulled this ruling in, so the card page can distinguish an
      -- entry written for this printing from one inherited via a rule.
      (CASE
        WHEN bool_or(t.kind = 'printing') THEN 'printing'
        WHEN bool_or(t.kind = 'oracle')   THEN 'oracle'
        ELSE 'rule'
      END) AS scope
    FROM card_rulings r
    JOIN card_ruling_targets t ON t.ruling_id = r.id
    WHERE r.active
      AND (
           (t.kind = 'printing' AND t.card_id = p_card_id)
        OR (t.kind = 'oracle'   AND t.oracle_key = (SELECT key FROM oracle))
        OR (t.kind = 'query'    AND EXISTS (
              SELECT 1 FROM card_ruling_matches m
              WHERE m.target_id = t.id AND m.card_id = p_card_id))
      )
    GROUP BY r.id, r.type, r.text, r.dated, r.source, r.created_at, r.updated_at
  ) x;
$$;

REVOKE ALL ON FUNCTION refresh_ruling_rule_matches(uuid)      FROM PUBLIC;
REVOKE ALL ON FUNCTION card_ruling_rule_preview(jsonb, int)   FROM PUBLIC;
REVOKE ALL ON FUNCTION card_rulings_for_card(text, text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION card_keywords_from_text(text)          FROM PUBLIC;

-- ── 4. Admin RPCs ─────────────────────────────────────────────────────────────
--
-- The Phase 5 per-card entry points keep their signatures and their semantics —
-- the card editor's rulings panel is unchanged — but now read and write through
-- `card_ruling_targets` instead of the dropped inline columns.
--
-- They deliberately refuse to retarget a ruling that has more than one target
-- or any rule target. Such a ruling is shared, and "applies to every printing"
-- has no single meaning for it; the Rulings tab owns those.

-- Serialise a ruling and its targets for the admin list/editor.
CREATE OR REPLACE FUNCTION admin__ruling_json(p_ruling_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'object',     'card_ruling',
    'id',         r.id,
    'type',       r.type,
    'text',       r.text,
    'dated',      r.dated,
    'source',     r.source,
    'active',     r.active,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'targets',    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',         t.id,
        'kind',       t.kind,
        'oracle_key', t.oracle_key,
        'card_id',    t.card_id,
        'card_name',  (SELECT c.name FROM cards c WHERE c.id = t.card_id),
        'query',      t.query,
        'ast',        t.ast,
        -- Only query targets have a materialised count; the others are direct.
        'match_count', CASE WHEN t.kind = 'query' THEN (
          SELECT count(*) FROM card_ruling_matches m WHERE m.target_id = t.id
        ) ELSE NULL END
      ) ORDER BY t.kind, t.created_at)
      FROM card_ruling_targets t WHERE t.ruling_id = r.id
    ), '[]'::jsonb)
  )
  FROM card_rulings r
  WHERE r.id = p_ruling_id;
$$;

-- True when the per-card panel may still retarget this ruling on its own.
CREATE OR REPLACE FUNCTION admin__ruling_is_simple(p_ruling_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*) = 1 AND bool_and(t.kind <> 'query')
  FROM card_ruling_targets t
  WHERE t.ruling_id = p_ruling_id;
$$;

CREATE OR REPLACE FUNCTION admin_create_card_ruling(
  p_card_id       text,
  p_all_printings boolean,
  p_type          text,
  p_text          text,
  p_dated         date,
  p_source        text,
  p_actor         uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_oracle text;
  v_text   text;
  v_id     uuid;
  v_all    boolean := coalesce(p_all_printings, false);
BEGIN
  IF p_type NOT IN ('ruling', 'note') THEN
    RAISE EXCEPTION 'invalid ruling type: %', p_type;
  END IF;
  v_text := NULLIF(btrim(p_text), '');
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'ruling text must not be empty';
  END IF;

  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;
  v_oracle := admin__card_oracle_key(p_card_id);

  INSERT INTO card_rulings (type, text, dated, source, created_by)
  VALUES (p_type, v_text, p_dated, NULLIF(btrim(p_source), ''), p_actor)
  RETURNING id INTO v_id;

  INSERT INTO card_ruling_targets (ruling_id, kind, oracle_key, card_id)
  VALUES (
    v_id,
    CASE WHEN v_all THEN 'oracle' ELSE 'printing' END,
    CASE WHEN v_all THEN v_oracle ELSE NULL END,
    CASE WHEN v_all THEN NULL ELSE p_card_id END
  );

  PERFORM admin__log(
    p_actor, 'card.ruling.create', 'card', p_card_id,
    jsonb_strip_nulls(jsonb_build_object(
      'ruling_id',     v_id,
      'oracle_key',    v_oracle,
      'all_printings', v_all,
      'type',          p_type,
      'text',          v_text,
      'dated',         p_dated,
      'source',        NULLIF(btrim(p_source), '')
    ))
  );

  RETURN jsonb_build_object('ok', true, 'ruling_id', v_id, 'card_id', p_card_id);
END;
$$;

-- Patch keys: type, text, dated, source, all_printings.
--
-- Like Phase 5 this takes the card the caller reached the ruling through and
-- refuses a ruling that does not apply to it, so a mistyped card id in the URL
-- cannot edit an unrelated card's ruling.
CREATE OR REPLACE FUNCTION admin_patch_card_ruling(
  p_card_id   text,
  p_ruling_id uuid,
  p_patch     jsonb,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ruling card_rulings;
  v_oracle text;
  v_text   text;
  v_all    boolean;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;
  IF p_patch ? 'type' AND p_patch->>'type' NOT IN ('ruling', 'note') THEN
    RAISE EXCEPTION 'invalid ruling type: %', p_patch->>'type';
  END IF;
  IF p_patch ? 'text' AND NULLIF(btrim(p_patch->>'text'), '') IS NULL THEN
    RAISE EXCEPTION 'ruling text must not be empty';
  END IF;

  v_oracle := admin__card_oracle_key(p_card_id);
  IF v_oracle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

  SELECT r.* INTO v_ruling
  FROM card_rulings r
  WHERE r.id = p_ruling_id
    AND EXISTS (
      SELECT 1 FROM card_ruling_targets t
      WHERE t.ruling_id = r.id
        AND ((t.kind = 'printing' AND t.card_id = p_card_id)
          OR (t.kind = 'oracle'   AND t.oracle_key = v_oracle))
    )
  FOR UPDATE;
  IF v_ruling.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  IF p_patch ? 'all_printings' THEN
    IF NOT admin__ruling_is_simple(p_ruling_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'ruling_is_shared');
    END IF;
    v_all := coalesce((p_patch->>'all_printings')::boolean, false);
    UPDATE card_ruling_targets SET
      kind       = CASE WHEN v_all THEN 'oracle' ELSE 'printing' END,
      oracle_key = CASE WHEN v_all THEN v_oracle ELSE NULL END,
      card_id    = CASE WHEN v_all THEN NULL ELSE p_card_id END
    WHERE ruling_id = p_ruling_id;
  END IF;

  v_text := CASE
    WHEN p_patch ? 'text' THEN btrim(p_patch->>'text')
    ELSE v_ruling.text
  END;

  UPDATE card_rulings SET
    type   = coalesce(NULLIF(p_patch->>'type', ''), type),
    text   = v_text,
    dated  = CASE WHEN p_patch ? 'dated' THEN (
      CASE WHEN NULLIF(p_patch->>'dated', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(p_patch->>'dated', 10)::date
        ELSE NULL
      END
    ) ELSE dated END,
    source = CASE WHEN p_patch ? 'source'
      THEN NULLIF(btrim(p_patch->>'source'), '') ELSE source END
  WHERE id = p_ruling_id;

  PERFORM admin__log(
    p_actor, 'card.ruling.patch', 'card_ruling', p_ruling_id::text,
    p_patch || jsonb_build_object('card_id', p_card_id)
  );

  RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_card_ruling(
  p_card_id   text,
  p_ruling_id uuid,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_oracle text;
  v_found  boolean;
BEGIN
  v_oracle := admin__card_oracle_key(p_card_id);
  IF v_oracle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM card_ruling_targets t
    WHERE t.ruling_id = p_ruling_id
      AND ((t.kind = 'printing' AND t.card_id = p_card_id)
        OR (t.kind = 'oracle'   AND t.oracle_key = v_oracle))
  ) INTO v_found;
  IF NOT v_found THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  -- A shared ruling is detached from this card rather than destroyed, so
  -- deleting from one card's panel cannot silently strip it from others.
  IF NOT admin__ruling_is_simple(p_ruling_id) THEN
    DELETE FROM card_ruling_targets t
    WHERE t.ruling_id = p_ruling_id
      AND ((t.kind = 'printing' AND t.card_id = p_card_id)
        OR (t.kind = 'oracle'   AND t.oracle_key = v_oracle));

    PERFORM admin__log(
      p_actor, 'card.ruling.detach', 'card_ruling', p_ruling_id::text,
      jsonb_build_object('card_id', p_card_id)
    );
    RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id, 'detached', true);
  END IF;

  DELETE FROM card_rulings WHERE id = p_ruling_id;

  PERFORM admin__log(
    p_actor, 'card.ruling.delete', 'card_ruling', p_ruling_id::text,
    jsonb_build_object('card_id', p_card_id)
  );

  RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id);
END;
$$;

-- ── Rulings tab ───────────────────────────────────────────────────────────────
--
-- `p_targets` is the complete target list, as a JSON array of
--   { kind: 'oracle',   oracle_key }
--   { kind: 'printing', card_id }
--   { kind: 'query',    query, ast }
-- and **replaces** whatever the ruling had, matching how the relationships
-- endpoint behaves. The AST is parsed in TypeScript by the same parser the
-- search bar uses; SQL only stores and evaluates it.
CREATE OR REPLACE FUNCTION admin__replace_ruling_targets(
  p_ruling_id uuid,
  p_targets   jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t jsonb;
BEGIN
  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' THEN
    RAISE EXCEPTION 'targets must be a JSON array';
  END IF;
  IF jsonb_array_length(p_targets) = 0 THEN
    RAISE EXCEPTION 'a ruling needs at least one target';
  END IF;

  DELETE FROM card_ruling_targets WHERE ruling_id = p_ruling_id;

  FOR t IN SELECT * FROM jsonb_array_elements(p_targets)
  LOOP
    IF t->>'kind' = 'oracle' THEN
      IF NULLIF(btrim(coalesce(t->>'oracle_key', '')), '') IS NULL THEN
        RAISE EXCEPTION 'oracle target needs an oracle_key';
      END IF;
      INSERT INTO card_ruling_targets (ruling_id, kind, oracle_key)
      VALUES (p_ruling_id, 'oracle', btrim(t->>'oracle_key'))
      ON CONFLICT DO NOTHING;

    ELSIF t->>'kind' = 'printing' THEN
      IF NULLIF(btrim(coalesce(t->>'card_id', '')), '') IS NULL THEN
        RAISE EXCEPTION 'printing target needs a card_id';
      END IF;
      INSERT INTO card_ruling_targets (ruling_id, kind, card_id)
      VALUES (p_ruling_id, 'printing', btrim(t->>'card_id'))
      ON CONFLICT DO NOTHING;

    ELSIF t->>'kind' = 'query' THEN
      IF NULLIF(btrim(coalesce(t->>'query', '')), '') IS NULL
         OR t->'ast' IS NULL OR jsonb_typeof(t->'ast') <> 'object' THEN
        RAISE EXCEPTION 'query target needs both a query string and a parsed ast object';
      END IF;
      -- Reject an AST the executor cannot render, at save time rather than at
      -- refresh time, so a rule can never be stored in a state that silently
      -- matches nothing.
      PERFORM card_search_ast_to_sql(t->'ast');
      INSERT INTO card_ruling_targets (ruling_id, kind, query, ast)
      VALUES (p_ruling_id, 'query', btrim(t->>'query'), t->'ast');

    ELSE
      RAISE EXCEPTION 'unknown ruling target kind: %', coalesce(t->>'kind', '<null>');
    END IF;
  END LOOP;
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
SET search_path = public
AS $$
DECLARE
  v_text text;
  v_id   uuid;
BEGIN
  IF p_type NOT IN ('ruling', 'note') THEN
    RAISE EXCEPTION 'invalid ruling type: %', p_type;
  END IF;
  v_text := NULLIF(btrim(p_text), '');
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'ruling text must not be empty';
  END IF;

  INSERT INTO card_rulings (type, text, dated, source, created_by)
  VALUES (p_type, v_text, p_dated, NULLIF(btrim(p_source), ''), p_actor)
  RETURNING id INTO v_id;

  PERFORM admin__replace_ruling_targets(v_id, p_targets);
  -- Materialise immediately so the editor can show what the rule caught without
  -- waiting for the next ingest.
  PERFORM refresh_ruling_rule_matches(t.id)
  FROM card_ruling_targets t
  WHERE t.ruling_id = v_id AND t.kind = 'query';

  PERFORM admin__log(
    p_actor, 'ruling.create', 'card_ruling', v_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'type', p_type, 'text', v_text, 'dated', p_dated,
      'source', NULLIF(btrim(p_source), ''), 'targets', p_targets
    ))
  );

  RETURN jsonb_build_object('ok', true, 'ruling', admin__ruling_json(v_id));
END;
$$;

-- Patch keys: type, text, dated, source, active, targets. `targets` replaces the
-- whole list; omitting it leaves targeting alone.
CREATE OR REPLACE FUNCTION admin_patch_ruling(
  p_ruling_id uuid,
  p_patch     jsonb,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ruling card_rulings;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;
  IF p_patch ? 'type' AND p_patch->>'type' NOT IN ('ruling', 'note') THEN
    RAISE EXCEPTION 'invalid ruling type: %', p_patch->>'type';
  END IF;
  IF p_patch ? 'text' AND NULLIF(btrim(p_patch->>'text'), '') IS NULL THEN
    RAISE EXCEPTION 'ruling text must not be empty';
  END IF;

  SELECT r.* INTO v_ruling FROM card_rulings r WHERE r.id = p_ruling_id FOR UPDATE;
  IF v_ruling.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  UPDATE card_rulings SET
    type   = coalesce(NULLIF(p_patch->>'type', ''), type),
    text   = CASE WHEN p_patch ? 'text' THEN btrim(p_patch->>'text') ELSE text END,
    dated  = CASE WHEN p_patch ? 'dated' THEN (
      CASE WHEN NULLIF(p_patch->>'dated', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(p_patch->>'dated', 10)::date
        ELSE NULL
      END
    ) ELSE dated END,
    source = CASE WHEN p_patch ? 'source'
      THEN NULLIF(btrim(p_patch->>'source'), '') ELSE source END,
    active = CASE WHEN p_patch ? 'active'
      THEN coalesce((p_patch->>'active')::boolean, true) ELSE active END
  WHERE id = p_ruling_id;

  IF p_patch ? 'targets' THEN
    PERFORM admin__replace_ruling_targets(p_ruling_id, p_patch->'targets');
  END IF;

  -- Re-materialise on any patch: a target change alters membership, and
  -- toggling `active` has to add or drop this ruling's matches. Deactivation is
  -- handled inside the refresh, which sweeps matches belonging to inactive
  -- rulings whether or not it re-evaluated anything.
  PERFORM refresh_ruling_rule_matches(t.id)
  FROM card_ruling_targets t
  WHERE t.ruling_id = p_ruling_id AND t.kind = 'query';

  PERFORM admin__log(
    p_actor, 'ruling.patch', 'card_ruling', p_ruling_id::text, p_patch
  );

  RETURN jsonb_build_object('ok', true, 'ruling', admin__ruling_json(p_ruling_id));
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_ruling(
  p_ruling_id uuid,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM card_rulings WHERE id = p_ruling_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  PERFORM admin__log(p_actor, 'ruling.delete', 'card_ruling', p_ruling_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id);
END;
$$;

-- Paged list for the Rulings tab. `p_query` matches ruling text or source;
-- `p_kind` narrows to rulings carrying at least one target of that kind.
CREATE OR REPLACE FUNCTION admin_list_rulings(
  p_query  text    DEFAULT NULL,
  p_kind   text    DEFAULT NULL,
  p_limit  int     DEFAULT 50,
  p_offset int     DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT r.id, r.created_at
    FROM card_rulings r
    WHERE (NULLIF(btrim(coalesce(p_query, '')), '') IS NULL
           OR r.text ILIKE '%' || escape_ilike_pattern(btrim(p_query)) || '%'
           OR coalesce(r.source, '') ILIKE '%' || escape_ilike_pattern(btrim(p_query)) || '%')
      AND (NULLIF(btrim(coalesce(p_kind, '')), '') IS NULL
           OR EXISTS (
             SELECT 1 FROM card_ruling_targets t
             WHERE t.ruling_id = r.id AND t.kind = btrim(p_kind)
           ))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rulings', coalesce((
      SELECT jsonb_agg(admin__ruling_json(f.id) ORDER BY f.created_at DESC)
      FROM (
        SELECT id, created_at FROM filtered
        ORDER BY created_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
        OFFSET greatest(0, coalesce(p_offset, 0))
      ) f
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION admin__ruling_json(uuid)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION admin__ruling_is_simple(uuid)             FROM PUBLIC;
REVOKE ALL ON FUNCTION admin__replace_ruling_targets(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_create_ruling(text, text, date, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_patch_ruling(uuid, jsonb, uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_ruling(uuid, uuid)           FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_rulings(text, text, int, int)  FROM PUBLIC;

-- ── admin_card_rulings ────────────────────────────────────────────────────────
-- The card editor's rulings panel. Like the public read it resolves all three
-- target kinds, but it also reports how each entry got here so the panel can
-- render the right controls:
--
--   scope          which target kind pulled the ruling onto this printing
--   all_printings  scope = 'oracle' — the panel's "applies to every printing"
--   shared         more than one target, or any rule target: the panel shows it
--                  read-only and points at the Rulings tab, because retargeting
--                  or deleting it here would silently affect other cards
--
-- Rulings scoped to a *sibling* printing are absent by construction: nothing
-- here matches them.
CREATE OR REPLACE FUNCTION admin_card_rulings(p_card_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_oracle text;
BEGIN
  v_oracle := admin__card_oracle_key(p_card_id);
  IF v_oracle IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'card_id',    p_card_id,
    'oracle_key', v_oracle,
    'entries', coalesce((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.dated NULLS LAST, e.created_at)
      FROM (
        SELECT
          r.id, r.type, r.text, r.dated, r.source, r.active,
          r.created_at, r.updated_at,
          CASE
            WHEN bool_or(t.kind = 'printing') THEN 'printing'
            WHEN bool_or(t.kind = 'oracle')   THEN 'oracle'
            ELSE 'rule'
          END AS scope,
          bool_or(t.kind = 'oracle') AND NOT bool_or(t.kind = 'printing') AS all_printings,
          (SELECT count(*) FROM card_ruling_targets t2 WHERE t2.ruling_id = r.id) AS target_count,
          (SELECT count(*) > 1 OR bool_or(t2.kind = 'query')
             FROM card_ruling_targets t2 WHERE t2.ruling_id = r.id) AS shared
        FROM card_rulings r
        JOIN card_ruling_targets t ON t.ruling_id = r.id
        WHERE (
             (t.kind = 'printing' AND t.card_id = p_card_id)
          OR (t.kind = 'oracle'   AND t.oracle_key = v_oracle)
          OR (t.kind = 'query'    AND EXISTS (
                SELECT 1 FROM card_ruling_matches m
                WHERE m.target_id = t.id AND m.card_id = p_card_id))
        )
        GROUP BY r.id, r.type, r.text, r.dated, r.source, r.active,
                 r.created_at, r.updated_at
      ) e
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_card_rulings(text) FROM PUBLIC;
