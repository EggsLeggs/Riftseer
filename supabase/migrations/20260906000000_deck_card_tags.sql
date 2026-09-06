-- Per-deck manual card tags.
--
-- Keyed by (deck_id, oracle_id), not by the deck-card row: a zone move or an
-- art swap is a routine edit and must not drop the tags riding the card. A tag
-- whose oracle has since left the deck is a harmless orphan, ignored on read
-- and cleaned up lazily — the same stance `deck_token_printings` takes.
--
-- `kind` exists so predefined or system-derived tags can join later without a
-- rebuild; today only 'manual' is legal. Tags are annotation, not deck
-- content: they are not revisioned and do not enter the text interchange
-- format.

CREATE TABLE deck_card_tags (
  deck_id    uuid NOT NULL REFERENCES decks(id)   ON DELETE CASCADE,
  oracle_id  uuid NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  tag        text NOT NULL CHECK (btrim(tag) <> '' AND char_length(tag) <= 40),
  kind       text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, oracle_id, tag)
);

ALTER TABLE deck_card_tags ENABLE ROW LEVEL SECURITY;

-- Defence in depth, mirroring deck_cards: the Worker's service-role key is the
-- real path and bypasses these.
CREATE POLICY deck_card_tags_read ON deck_card_tags FOR SELECT
  USING (deck_is_readable(deck_id, auth.uid()));
CREATE POLICY deck_card_tags_write ON deck_card_tags FOR ALL
  USING (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'))
  WITH CHECK (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'));
