-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Ruling data port — flat `cards` model → oracle/printing model          │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The rulings themselves carry across unchanged; only their *targets* change
-- level. The old model pointed an oracle-scoped target at `oracle_key`, a
-- name-derived text slug with no foreign key. The new model points it at
-- `oracles.id`, a surrogate UUID. This script resolves one to the other with a
-- join, so a key that no longer names a live oracle inserts nothing rather
-- than tripping the foreign key — the shortfall is reported at the end instead
-- of aborting a port that is otherwise good.
--
-- Ids are preserved from the source database so a ruling keeps its identity
-- across the move and re-running this changes nothing.
--
-- Query targets need no remapping: the search grammar is unchanged, so the
-- stored AST renders under `card_search_ast_to_sql` exactly as it did before.
--
-- Idempotent. Run against the local stack with:
--   bun run db:local:psql -f scripts/rulings-port.sql

BEGIN;

-- ── the rulings ───────────────────────────────────────────────────────────────

INSERT INTO rulings (id, type, text, dated, source, active, created_by, created_at, updated_at)
VALUES
  ('1dc7bc25-1d0b-490d-ac00-27b8a25e3245', 'note', 'If an opponent plays a unit at the end of the turn, such as with Dazzling Aurora, while Vex Apathetic is at a battlefield you control, that unit becomes stunned. Because the unit is played after the end step begins, the game has already passed the point when stuns are removed. The unit remains stunned during the next turn.', '2026-07-30'::date, '423.1.a.2', true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:35:39.735697+00:00'::timestamptz, '2026-07-30T13:35:39.735697+00:00'::timestamptz),
  ('5911624e-ced7-4bbe-8460-50f137b289a0', 'note', 'If Glasc Mixologist dies during a showdown at Aspirant’s Climb, its Death-Nail ability is added to the chain. The showdown remains in progress while that ability is on the chain, so the player who controlled the battlefield may play another unit there before the showdown ends. Before combat resumes, a cleanup occurs and damage is removed from the units in the showdown, creating a new combat state. No points are granted until the second showdown ends.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:44:28.324199+00:00'::timestamptz, '2026-07-30T13:44:28.324199+00:00'::timestamptz),
  ('202246ce-ed04-4911-808d-b2eda690e701', 'note', 'If Glasc Mixologist and another unit die at the same time, both are moved to the trash before their triggered abilities are added to the chain. Glasc Mixologist’s Death-Nail ability may therefore target the other unit that died alongside it. If damage is dealt in separate instances instead, Glasc Mixologist can be killed first, preventing its Death-Nail ability from targeting a unit that dies later.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:46:03.729679+00:00'::timestamptz, '2026-07-30T13:46:03.729679+00:00'::timestamptz),
  ('9477dde0-d875-4441-bc51-786bbc9155c5', 'note', 'If a spell played using Fizz would be countered or banished, Fizz’s effect still puts that spell on the bottom of its owner’s deck instead. This applies even if the spell is countered by an effect such as Defy or would normally banish itself after resolving, such as Arcane Shift.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:47:49.975191+00:00'::timestamptz, '2026-07-30T13:47:49.975191+00:00'::timestamptz),
  ('460bca80-3ae9-4ce7-aa16-0a699d901534', 'note', 'When playing Alpha Strike, you choose all friendly and enemy units it will affect. Damage is not assigned until the effect resolves. You must assign at least 1 damage to each chosen unit if able. If your Might is reduced before Alpha Strike resolves, you must still distribute as much damage as possible among the chosen units, even if some of them are assigned 0 damage.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:49:40.396524+00:00'::timestamptz, '2026-07-30T13:49:44.084235+00:00'::timestamptz),
  ('ba5b21f3-e652-4aa1-ab94-da61465175e4', 'note', 'Sacrificing a unit is an additional cost to play Sacrifice. If Sacrifice is countered, the sacrificed unit remains in the trash and any of its Death-Nail abilities still trigger, but Sacrifice’s effects, such as drawing cards or channeling, do not occur.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:51:06.40948+00:00'::timestamptz, '2026-07-30T13:51:06.40948+00:00'::timestamptz),
  ('282dc1a5-22c9-45dc-8131-5609566a7787', 'note', 'Kha’Zix, Mutating Horror’s ability triggers if there is only one enemy unit at the battlefield when it attacks or defends. Once the ability is added to the chain, it will still grant +2 Might and +2 XP even if another enemy unit is played or the number of enemy units changes before it resolves.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T13:52:10.676753+00:00'::timestamptz, '2026-07-30T13:52:10.676753+00:00'::timestamptz),
  ('91ccee2e-e340-426b-9160-f52cb520ae39', 'note', 'If this unit is played into an open showdown started by an opponent, it becomes a defender rather than an attacker. It receives any bonuses that apply while defending, but not bonuses that apply while attacking. If one or more of your units remain at the battlefield after the showdown ends, you score 1 point.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T15:07:01.168137+00:00'::timestamptz, '2026-07-30T15:07:01.168137+00:00'::timestamptz),
  ('c4dcf48d-951f-4569-9aac-ee23a00bf7e9', 'note', 'If you take control of an opponent’s equipment with Akshan and attach it to a unit you control, the equipment remains attached even if Akshan leaves play. Its owner does not regain control of it until the equipped unit leaves play and the equipment becomes unattached.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T15:07:35.318551+00:00'::timestamptz, '2026-07-30T15:07:35.318551+00:00'::timestamptz),
  ('89372aa2-5741-4dbf-980e-94f9c7773599', 'note', 'If Zhonya’s Hourglass is hidden at a battlefield and a unit there with Deathknell dies, its Deathknell ability is added to the chain. You continue to control the battlefield until that ability resolves, giving you a window to react by revealing Zhonya’s Hourglass. If there are no other units at that battlefield for its effect to target, Zhonya’s Hourglass is returned to your base instead of being sent to the trash.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T15:17:23.87756+00:00'::timestamptz, '2026-07-30T15:17:23.87756+00:00'::timestamptz),
  ('23f9d7ff-978d-4238-9dfa-93edebf9cab9', 'note', 'If your last unit at a battlefield dies and its Deathknell ability is added to the chain, you retain control of that battlefield until the ability resolves.', '2026-07-30'::date, NULL, true, 'fb247b80-998f-4ece-afb5-41afc7c908ad'::uuid, '2026-07-30T19:49:38.0021+00:00'::timestamptz, '2026-07-30T19:49:38.0021+00:00'::timestamptz)
ON CONFLICT (id) DO NOTHING;

-- ── oracle targets: oracle_key (text) → oracles.id (uuid) ─────────────────────
--
-- The JOIN is the safety property. An unresolvable key drops out here and is
-- reported below; it never reaches the foreign key as a hard failure.

INSERT INTO ruling_targets (id, ruling_id, kind, oracle_id, created_at)
SELECT v.id, v.ruling_id, 'oracle', o.id, v.created_at
FROM (VALUES
  ('18f09b2a-e917-4d3e-84e0-09bd92d1a160'::uuid, 'ba5b21f3-e652-4aa1-ab94-da61465175e4'::uuid, 'sacrifice', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('ed3be532-0fd7-4d89-befc-bb2b1d98e751'::uuid, '89372aa2-5741-4dbf-980e-94f9c7773599'::uuid, 'zhonyas hourglass', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('1ff2008a-82ab-4ef1-b992-094db908c69b'::uuid, '91ccee2e-e340-426b-9160-f52cb520ae39'::uuid, 'rengar trophy hunter', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('6d0e48c6-95d4-4836-b431-161e89fcb5be'::uuid, '5911624e-ced7-4bbe-8460-50f137b289a0'::uuid, 'glasc mixologist', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('78578d38-f2fd-41a6-8136-d53cd352a84c'::uuid, '460bca80-3ae9-4ce7-aa16-0a699d901534'::uuid, 'alpha strike', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('0da1beb0-dba6-4c93-9630-d7b1211c4873'::uuid, '282dc1a5-22c9-45dc-8131-5609566a7787'::uuid, 'khazix mutating horror', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('6693a144-5fe8-42f5-b021-fcdabcda8e68'::uuid, '1dc7bc25-1d0b-490d-ac00-27b8a25e3245'::uuid, 'vex apathetic', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('8e82f2e9-e689-4944-82b4-5b69ad1fd341'::uuid, 'c4dcf48d-951f-4569-9aac-ee23a00bf7e9'::uuid, 'akshan mischievous', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('a77b3115-06e2-4bae-9689-ef974eeba869'::uuid, '9477dde0-d875-4441-bc51-786bbc9155c5'::uuid, 'fizz trickster', '2026-07-30T16:38:16.913045+00:00'::timestamptz),
  ('52cc7978-5567-4aef-b63d-39fd5da87ffa'::uuid, '202246ce-ed04-4911-808d-b2eda690e701'::uuid, 'glasc mixologist', '2026-07-30T16:38:16.913045+00:00'::timestamptz)
) AS v(id, ruling_id, oracle_key, created_at)
JOIN oracles o ON o.oracle_key = v.oracle_key AND o.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- ── query targets: the AST carries across verbatim ────────────────────────────

INSERT INTO ruling_targets (id, ruling_id, kind, query, ast, created_at)
VALUES
  ('e0f05dbd-faf2-4e97-810b-aa73b9702ace', '23f9d7ff-978d-4238-9dfa-93edebf9cab9', 'query', 't:unit kw:deathknell', '{"op":"and","children":[{"op":"filter","field":"type","value":"unit"},{"op":"filter","field":"keyword","value":"deathknell"}]}'::jsonb, '2026-07-30T19:49:38.0021+00:00'::timestamptz)
ON CONFLICT (id) DO NOTHING;

-- Materialise the query targets against the current catalogue.
SELECT refresh_ruling_rule_matches(NULL);

COMMIT;

-- ── report ────────────────────────────────────────────────────────────────────
--
-- A ruling with no targets is invisible on every card page: both
-- `rulings_for_printing` and `admin_printing_rulings` inner-join the target
-- table. This must come back empty.

SELECT ru.id, left(ru.text, 60) AS unreachable_ruling
FROM rulings ru
WHERE NOT EXISTS (SELECT 1 FROM ruling_targets t WHERE t.ruling_id = ru.id);

-- count(DISTINCT t.id), not count(*): the join to matches fans a query target
-- out to one row per matched printing.
SELECT t.kind,
       count(DISTINCT t.id)     AS targets,
       count(m.printing_id)     AS materialised_matches
FROM ruling_targets t
LEFT JOIN ruling_matches m ON m.target_id = t.id
GROUP BY t.kind ORDER BY t.kind;
