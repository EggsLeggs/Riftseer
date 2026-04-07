-- cards.id was declared uuid but RiftCodex uses MongoDB ObjectIds (24-char hex).
-- Remap primary keys to external_ids.riftcodex_id and carry rulings references forward.

BEGIN;

-- 1. Drop FK while remapping both tables.
ALTER TABLE rulings DROP CONSTRAINT IF EXISTS rulings_card_id_fkey;

-- 2. Add a new text id column and populate from external_ids.riftcodex_id.
ALTER TABLE cards ADD COLUMN new_id text;
UPDATE cards
SET new_id = NULLIF(external_ids->>'riftcodex_id', '');

-- 3. Validate migration inputs before swapping keys.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cards WHERE new_id IS NULL) THEN
    RAISE EXCEPTION 'cards_id_text migration failed: missing external_ids.riftcodex_id for one or more cards';
  END IF;

  IF EXISTS (
    SELECT new_id
    FROM cards
    GROUP BY new_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cards_id_text migration failed: duplicate external_ids.riftcodex_id values found';
  END IF;
END;
$$;

ALTER TABLE cards ALTER COLUMN new_id SET NOT NULL;

-- 4. Convert rulings.card_id to text and rewrite to the new object IDs.
ALTER TABLE rulings ALTER COLUMN card_id TYPE text USING card_id::text;
UPDATE rulings r
SET card_id = c.new_id
FROM cards c
WHERE r.card_id = c.id::text;

-- 5. Swap the cards primary key from uuid id -> text new_id.
ALTER TABLE cards DROP CONSTRAINT cards_pkey;
ALTER TABLE cards DROP COLUMN id;
ALTER TABLE cards RENAME COLUMN new_id TO id;
ALTER TABLE cards ADD PRIMARY KEY (id);

-- 6. Re-add FK with updated text ids.
ALTER TABLE rulings ADD CONSTRAINT rulings_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;

COMMIT;
