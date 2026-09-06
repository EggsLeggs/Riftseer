-- Deck comments: threaded, YouTube/Reddit-style.
--
-- `parent_id` plus a *stored* depth: the parent's depth + 1 is written at
-- insert, so the nesting cap is a plain CHECK instead of a recursive query,
-- and the client builds the tree from one flat read.
--
-- Deleting is always a soft tombstone (`deleted_at` set, `body` nulled) so a
-- reply thread stays coherent; the author may delete their own comment and the
-- deck's owner may delete any (that is the whole moderation model, v1).
-- Deleting the deck hard-cascades everything. A deleted *account* keeps its
-- comments readable with no author (`SET NULL`).

CREATE TABLE deck_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  parent_id  uuid REFERENCES deck_comments(id) ON DELETE CASCADE,
  depth      integer NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth < 8),
  body       text CHECK (body IS NULL OR char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT body_unless_deleted
    CHECK (deleted_at IS NOT NULL OR (body IS NOT NULL AND btrim(body) <> ''))
);

CREATE INDEX deck_comments_deck_idx ON deck_comments (deck_id, created_at DESC);

ALTER TABLE deck_comments ENABLE ROW LEVEL SECURITY;

-- Defence in depth; the Worker's service-role path is the boundary.
CREATE POLICY deck_comments_read ON deck_comments FOR SELECT
  USING (deck_is_readable(deck_id, auth.uid()));
CREATE POLICY deck_comments_author_insert ON deck_comments FOR INSERT
  WITH CHECK (author_id = auth.uid() AND deck_is_readable(deck_id, auth.uid()));
