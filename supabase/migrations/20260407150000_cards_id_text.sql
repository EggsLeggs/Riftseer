-- cards.id was declared uuid but RiftCodex uses MongoDB ObjectIds (24-char hex).
-- Change to text throughout.

-- 1. Drop the FK on rulings that references cards(id)
ALTER TABLE rulings DROP CONSTRAINT IF EXISTS rulings_card_id_fkey;

-- 2. Drop the PK on cards (required before changing its type)
ALTER TABLE cards DROP CONSTRAINT cards_pkey;

-- 3. Change cards.id to text
ALTER TABLE cards ALTER COLUMN id TYPE text USING id::text;

-- 4. Re-add the PK
ALTER TABLE cards ADD PRIMARY KEY (id);

-- 5. Change rulings.card_id to text and re-add FK
ALTER TABLE rulings ALTER COLUMN card_id TYPE text USING card_id::text;
ALTER TABLE rulings ADD CONSTRAINT rulings_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;
