-- Deck folders: a user's private organisation of decks, Moxfield-binder-ish.
--
-- v1 is deliberately flat, unordered and private — no nesting, no manual sort,
-- no visibility column. Any deck the owner can *read* may be filed (their own,
-- shared with them, or public), so an item row is a bookmark, not a claim on
-- the deck; a deck that later goes private simply stops rendering.

CREATE TABLE deck_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deck_folders_owner_idx ON deck_folders (owner_id);

CREATE TRIGGER deck_folders_updated_at
  BEFORE UPDATE ON deck_folders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE deck_folder_items (
  folder_id uuid NOT NULL REFERENCES deck_folders(id) ON DELETE CASCADE,
  deck_id   uuid NOT NULL REFERENCES decks(id)        ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, deck_id)
);

CREATE INDEX deck_folder_items_deck_idx ON deck_folder_items (deck_id);

ALTER TABLE deck_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_folder_items ENABLE ROW LEVEL SECURITY;

-- Defence in depth; the Worker's service-role path is the boundary.
CREATE POLICY deck_folders_owner_all ON deck_folders FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY deck_folder_items_owner_all ON deck_folder_items FOR ALL
  USING (EXISTS (SELECT 1 FROM deck_folders f
                 WHERE f.id = folder_id AND f.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM deck_folders f
                      WHERE f.id = folder_id AND f.owner_id = auth.uid()));
