-- Ingest rewrite Phase 2: atomically publish queue-generated R2 image URLs.
--
-- Image source metadata remains in cards.media:
--   source_url      best upstream image for this printing
--   source_hash     SHA-256(source_url), used as the idempotency/version key
--   source_provider riftcodex | tcgplayer | admin
--   media_urls      R2 custom-domain URLs after the queue consumer succeeds
--
-- The hash predicate prevents a delayed queue job for an old upstream URL from
-- overwriting media written by a newer ingest. This function is invoker-rights
-- and executable only by service_role.

CREATE OR REPLACE FUNCTION apply_card_hosted_media(
  p_card_id         text,
  p_source_hash     text,
  p_source_url      text,
  p_source_provider text,
  p_orientation     text,
  p_media_urls      jsonb
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated_rows integer;
BEGIN
  IF p_source_hash IS NULL OR p_source_hash = '' THEN
    RAISE EXCEPTION 'p_source_hash must not be empty';
  END IF;

  IF jsonb_typeof(p_media_urls) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'p_media_urls must be a JSON object';
  END IF;

  UPDATE cards
  SET media = coalesce(media, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'source_hash', p_source_hash,
      'source_url', p_source_url,
      'source_provider', p_source_provider,
      'orientation', p_orientation,
      'media_urls', p_media_urls
    )
  )
  WHERE id = p_card_id
    AND media->>'source_hash' = p_source_hash;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  RETURN v_updated_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION apply_card_hosted_media(
  text,
  text,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION apply_card_hosted_media(
  text,
  text,
  text,
  text,
  text,
  jsonb
) TO service_role;
