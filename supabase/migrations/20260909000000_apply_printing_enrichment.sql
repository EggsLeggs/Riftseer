-- Write TCGPlayer enrichment without writing the catalogue.
--
-- Prices, the TCGPlayer ids and (rarely) the image source were settable only
-- through `ingest_catalogue`, so refreshing a price meant resending every
-- printing across nine batched RPCs. That coupling is why enrichment could not
-- leave the ingest invocation, and why a run cost ~54 subrequests against the
-- 50 a Worker gets on the free plan: every cron run died at
-- `ingest_catalogue batch 7/9` with "Too many subrequests by single Worker
-- invocation", so batches 7-9 were a day stale and steps 10-12 never ran at
-- all — including the one that asks for card art to be hosted.
--
-- This writes only the columns enrichment owns, only for rows that already
-- exist. It is deliberately narrow: it cannot create a printing, cannot delete
-- one, and cannot touch a column RiftCodex is authoritative for.
--
-- Lock semantics mirror the ON CONFLICT clause of `ingest_catalogue` for these
-- same columns, and must keep mirroring it: prices are never locked,
-- `tcgplayer_id` honours its own lock, and the image source honours the
-- `image` lock. Change one, change the other.
--
-- `coalesce(incoming, existing)` throughout, so a key the payload omits leaves
-- the column alone rather than nulling it. `released_at` is coalesced against
-- the *existing* value first, matching `applyProduct`, which only fills a
-- release date the catalogue does not already have.

CREATE OR REPLACE FUNCTION apply_printing_enrichment(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS x(
      id                    text,
      tcgplayer_id          text,
      tcgplayer_url         text,
      released_at           date,
      price_normal          numeric,
      price_foil            numeric,
      price_low_normal      numeric,
      price_low_foil        numeric,
      image_source_url      text,
      image_source_hash     text,
      image_source_provider text
    )
  )
  UPDATE printings p SET
    -- Volatile and never locked; an admin does not curate a price.
    price_normal     = coalesce(i.price_normal, p.price_normal),
    price_foil       = coalesce(i.price_foil, p.price_foil),
    price_low_normal = coalesce(i.price_low_normal, p.price_low_normal),
    price_low_foil   = coalesce(i.price_low_foil, p.price_low_foil),
    tcgplayer_url    = coalesce(i.tcgplayer_url, p.tcgplayer_url),

    released_at = CASE WHEN 'released_at' = ANY (p.locked_fields)
                       THEN p.released_at
                       ELSE coalesce(p.released_at, i.released_at) END,

    tcgplayer_id = CASE WHEN 'tcgplayer_id' = ANY (p.locked_fields)
                        THEN p.tcgplayer_id
                        ELSE coalesce(i.tcgplayer_id, p.tcgplayer_id) END,

    -- The three image columns move together or not at all: a URL without its
    -- hash would leave the queue believing the hosted art is current.
    image_source_url = CASE WHEN 'image' = ANY (p.locked_fields)
                            THEN p.image_source_url
                            ELSE coalesce(i.image_source_url, p.image_source_url) END,
    image_source_hash = CASE WHEN 'image' = ANY (p.locked_fields)
                             THEN p.image_source_hash
                             ELSE coalesce(i.image_source_hash, p.image_source_hash) END,
    image_source_provider = CASE WHEN 'image' = ANY (p.locked_fields)
                                 THEN p.image_source_provider
                                 ELSE coalesce(i.image_source_provider,
                                               p.image_source_provider) END
  FROM incoming i
  WHERE p.id = i.id
    AND p.deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION apply_printing_enrichment(jsonb) IS
  'Applies TCGPlayer-owned columns to existing printings. Mirrors the lock '
  'semantics of ingest_catalogue for the same columns; never inserts or deletes.';
