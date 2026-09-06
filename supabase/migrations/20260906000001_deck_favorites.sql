-- Deck favorites ("likes"). One row per (deck, user); the count is computed
-- live on read, the same stance the follows graph takes — no denormalized
-- counter to drift.

CREATE TABLE deck_favorites (
  deck_id    uuid NOT NULL REFERENCES decks(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);

-- "My favorites", newest first.
CREATE INDEX deck_favorites_user_idx ON deck_favorites (user_id, created_at DESC);

ALTER TABLE deck_favorites ENABLE ROW LEVEL SECURITY;

-- Defence in depth; the Worker's service-role path is the boundary. You may
-- favorite any deck you can read, and only ever as yourself.
CREATE POLICY deck_favorites_read ON deck_favorites FOR SELECT
  USING (user_id = auth.uid() OR deck_is_readable(deck_id, auth.uid()));
CREATE POLICY deck_favorites_self_write ON deck_favorites FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND deck_is_readable(deck_id, auth.uid()));
