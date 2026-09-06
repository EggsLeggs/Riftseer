-- Deck view counting.
--
-- A denormalized counter rather than an events table: nobody has asked for
-- per-day analytics, and a single integer is the cheapest thing that can say
-- "1.2k views". Dedup happens in the API (Redis, per viewer per six hours);
-- the database only ever increments.

ALTER TABLE decks ADD COLUMN view_count integer NOT NULL DEFAULT 0;

-- `decks_updated_at` stamps every UPDATE, and a view is not an update in the
-- "most recently updated decks" sense — counting a reader must not float the
-- deck up the browse index. The trigger now skips exactly the writes that
-- change `view_count`; nothing legitimate changes it alongside anything else.
DROP TRIGGER decks_updated_at ON decks;
CREATE TRIGGER decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW
  WHEN (OLD.view_count IS NOT DISTINCT FROM NEW.view_count)
  EXECUTE FUNCTION trigger_set_updated_at();

-- The Supabase client cannot express `SET view_count = view_count + 1`, hence
-- an RPC. The `{ok}` envelope is what `callRpc` asserts on every deck RPC.
CREATE OR REPLACE FUNCTION deck_increment_views(p_deck_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE decks SET view_count = view_count + 1 WHERE id = p_deck_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
