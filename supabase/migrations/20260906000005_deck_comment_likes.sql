-- Comment likes. One row per (comment, user); the count is computed live on
-- read, the same stance deck favorites take — no denormalized counter to drift.

CREATE TABLE deck_comment_likes (
  comment_id uuid NOT NULL REFERENCES deck_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX deck_comment_likes_user_idx ON deck_comment_likes (user_id, created_at DESC);

ALTER TABLE deck_comment_likes ENABLE ROW LEVEL SECURITY;

-- Defence in depth; the Worker's service-role path is the boundary. You may
-- like a comment on any deck you can read, and only ever as yourself.
CREATE POLICY deck_comment_likes_read ON deck_comment_likes FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM deck_comments
      WHERE deck_comments.id = comment_id
        AND deck_is_readable(deck_comments.deck_id, auth.uid())
    )
  );
CREATE POLICY deck_comment_likes_self_write ON deck_comment_likes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM deck_comments
      WHERE deck_comments.id = comment_id
        AND deck_is_readable(deck_comments.deck_id, auth.uid())
    )
  );
