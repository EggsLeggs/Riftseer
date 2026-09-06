TRUNCATE TABLE
  admin_audit_log,
  reconciliation_queue,
  ruling_matches,
  ruling_targets,
  rulings,
  printing_legalities,
  oracle_legalities,
  formats,
  oracle_relationships,
  printing_deltas,
  resolved_printings,
  printings,
  oracles,
  artists,
  sets
RESTART IDENTITY CASCADE;

SELECT ingest_catalogue(
  p_sets := '[
    {"set_code":"OGN","set_name":"Origins","published_on":"2025-01-01","is_promo":false},
    {"set_code":"VEN","set_name":"Vendetta","published_on":"2026-01-01","is_promo":false},
    {"set_code":"PRM","set_name":"Promos","published_on":"2026-03-01","is_promo":true}
  ]'::jsonb,
  p_artists := '["Jane Doe","Rex Ample"]'::jsonb,
  p_oracles := '[
    {"oracle_key":"vayne","slug":"vayne","name":"Vayne","name_normalized":"vayne",
     "card_type":"Unit","supertype":"Champion","energy":3,"might":4,"power":2,
     "text_rich":"[Deflect 3] and [Accelerate]","text_plain":"Deflect 3 and Accelerate",
     "tags":["Sentinel","Marksman"],"domains":["Fury","Order"]},
    {"oracle_key":"brush","slug":"brush","name":"Brush","name_normalized":"brush",
     "card_type":"Spell","energy":1,"text_rich":"Create a Sprite unit token.",
     "text_plain":"Create a Sprite unit token.","tags":["Nature"],"domains":["Calm"]},
    {"oracle_key":"sprite","slug":"sprite","name":"Sprite","name_normalized":"sprite",
     "card_type":"Unit","is_token":true,"might":1,"power":1,"domains":["Calm"]},
    {"oracle_key":"warhammer","slug":"warhammer","name":"Warhammer","name_normalized":"warhammer",
     "card_type":"Gear","text_rich":"[Equip]","text_plain":"Equip",
     "might_bonus":0,"equipment_text":"This unit has [Deflect 1].","domains":["Fury"]}
  ]'::jsonb,
  p_printings := '[
    {"id":"aaa000000000000000000001","oracle_key":"vayne","set_code":"OGN","artist":"Jane Doe",
     "collector_number":"042","rarity":"Rare","public_slug":"ogn/042/vayne",
     "released_at":"2025-01-01","flavour_text":"Original run.","finishes":["Normal","Foil"]},
    {"id":"aaa000000000000000000002","oracle_key":"vayne","set_code":"VEN","artist":"Rex Ample",
     "collector_number":"SP3","rarity":"Showcase","public_slug":"ven/sp3/vayne",
     "released_at":"2026-01-01","is_special_collection":true},
    {"id":"aaa000000000000000000003","oracle_key":"vayne","set_code":"PRM","artist":"Jane Doe",
     "collector_number":"007","rarity":"Rare","public_slug":"prm/007/vayne"},
    {"id":"bbb000000000000000000001","oracle_key":"brush","set_code":"OGN","artist":"Jane Doe",
     "collector_number":"100","rarity":"Common","public_slug":"ogn/100/brush"},
    {"id":"ccc000000000000000000001","oracle_key":"sprite","set_code":"OGN","artist":"Jane Doe",
     "collector_number":"T03","rarity":"Token","public_slug":"ogn/t03/sprite"},
    {"id":"ddd000000000000000000001","oracle_key":"warhammer","set_code":"OGN","artist":"Rex Ample",
     "collector_number":"200","rarity":"Uncommon","public_slug":"ogn/200/warhammer"}
  ]'::jsonb,
  p_deltas := '[
    {"printing_id":"aaa000000000000000000001","tags_removed":["Sentinel"]}
  ]'::jsonb,
  p_relationships := '[
    {"from_oracle_key":"brush","to_oracle_key":"sprite","kind":"makes_token"}
  ]'::jsonb,
  p_valid_printing_ids := '[
    "aaa000000000000000000001",
    "aaa000000000000000000002",
    "aaa000000000000000000003",
    "bbb000000000000000000001",
    "ccc000000000000000000001",
    "ddd000000000000000000001"
  ]'::jsonb,
  p_prune := true
);

SELECT admin_create_format(
  'standard',
  'Standard',
  1,
  true,
  '00000000-0000-0000-0000-0000000000aa'
);

SELECT admin_set_legality(
  (SELECT id FROM oracles WHERE oracle_key = 'vayne'),
  NULL,
  'standard',
  'banned',
  NULL,
  '00000000-0000-0000-0000-0000000000aa'
);

SELECT admin_set_legality(
  NULL,
  'aaa000000000000000000002',
  'standard',
  'legal',
  NULL,
  '00000000-0000-0000-0000-0000000000aa'
);

SELECT admin_create_ruling(
  'ruling',
  'Deflect reduces damage, not the attack itself.',
  '2026-05-01',
  'rules-team',
  '[{"kind":"query","query":"kw:deflect","ast":{"op":"filter","field":"keyword","value":"deflect"}}]'::jsonb,
  '00000000-0000-0000-0000-0000000000aa'
);
