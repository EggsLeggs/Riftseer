-- Add bidirectional champion/legend link columns to cards.
-- related_champions: populated on Legend cards (RelatedCard[] of their Champions)
-- related_legends:   populated on Champion cards (RelatedCard[] of their Legends)
ALTER TABLE cards
  ADD COLUMN related_champions jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN related_legends   jsonb NOT NULL DEFAULT '[]';
