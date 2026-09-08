
# Components

All GUIDs confirmed in the Riftbound build. **Owner** is the original author; **RB** ticks when a component has been meaningfully updated for Riftbound (re-scripted, retextured with new art, or its Riftbound-specific fork is now the live version).

---

## Zone / trigger infrastructure

Invisible ScriptingTrigger objects that define hand zones and scripting regions.

### Hand triggers

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| 360dc1, 640235, a11f20, 7295a1 | HandTrigger ×4 (seats 1–4) | OIBAP | — | TTS hand zones; must stay seated at their player positions |
| b798d6, 350f7f, 993f89, bb8c76 | HandTrigger ×4 (seats 5–8) | OIBAP | — | TTS hand zones for seats 5–8 |

### Functional zones (ScriptingTriggers)

Positions must align with the playmat art and snap points. `global.lua:registerObjectGUIDs()` hard-codes the GUIDs for `mainDeckZone`, `trash`, and `banishmentZone`; renaming or deleting them breaks Draw/Mill/Predict and trash/banishment keybinds.

| GUID | Role | Seat | Owner | RB |
|------|------|------|-------|----|
| 166036 | mainDeckZone | Green | OIBAP | — |
| 2365d0 | mainDeckZone | Red | OIBAP | — |
| 033b34 | mainDeckZone | Yellow | OIBAP | — |
| c04462 | mainDeckZone | Blue | OIBAP | — |
| 68549d | trash | Green | OIBAP | — |
| 07dd80 | trash | Red | OIBAP | — |
| 8b439a | trash | Yellow | OIBAP | — |
| debc40 | trash | Blue | OIBAP | — |
| bf0002 | banishmentZone | Green | amory | ✓ |
| bf0001 | banishmentZone | Red | amory | ✓ |
| bf0003 | banishmentZone | Yellow | amory | ✓ |
| bf0004 | banishmentZone | Blue | amory | ✓ |
| f1e001 | legend zone | Green | amory | ✓ |
| 1e9001 | legend zone | Red | amory | ✓ |
| e1e001 | legend zone | Yellow | amory | ✓ |
| b1e001 | legend zone | Blue | amory | ✓ |
| f4c001 | champion zone | Green | amory | ✓ |
| c4a001 | champion zone | Red | amory | ✓ |
| e4c001 | champion zone | Yellow | amory | ✓ |
| b4c001 | champion zone | Blue | amory | ✓ |
| f4d001 | rune deck zone | Green | amory | ✓ |
| 4d0001 | rune deck zone | Red | amory | ✓ |
| e4d001 | rune deck zone | Yellow | amory | ✓ |
| b4d001 | rune deck zone | Blue | amory | ✓ |
| 8b3401 | playmat | Green | amory | ✓ |
| c20e3f | playmat | Red | amory | ✓ |
| 129eaa | playmat | Yellow | amory | ✓ |
| 56cd9d | playmat | Blue | amory | ✓ |

### Playboard zones (ScriptingTriggers, tagged `playboard{color}`)

Three triggers per seat (Main, Side, Rune). Used by `global.lua` for play-area detection, mulligan safety, and Ready on board objects. All three must move together if the layout changes.

| GUID | Role | Seat | Owner | RB |
|------|------|------|-------|----|
| e045d9 | playboard Main | Green | amory | ✓ |
| 8ecbef | playboard Rune | Green | amory | ✓ |
| 317569 | playboard Side | Green | amory | ✓ |
| d64a19 | playboard Main | Red | amory | ✓ |
| a67f19 | playboard Rune | Red | amory | ✓ |
| f6152f | playboard Side | Red | amory | ✓ |
| 2c718e | playboard Main | Yellow | amory | ✓ |
| b5c8e9 | playboard Rune | Yellow | amory | ✓ |
| 65d86e | playboard Side | Yellow | amory | ✓ |
| 92d981 | playboard Main | Blue | amory | ✓ |
| 679690 | playboard Rune | Blue | amory | ✓ |
| 6a0546 | playboard Side | Blue | amory | ✓ |

### Rune channels (ScriptingTriggers)

Twelve rune slots per seat; registered as `runeZones` and populated by the Channel button (`ch0001`–`ch0004`).

| Seat | GUIDs | Owner | RB |
|------|-------|-------|----|
| Green | f4a001–f4a00c | amory | ✓ |
| Red | 4da001–4da00c | amory | ✓ |
| Yellow | e4a001–e4a00c | amory | ✓ |
| Blue | b4a001–b4a00c | amory | ✓ |

### Battlefield zones (ScriptingTriggers, tagged `battlefield`)

Three shared slots on the table centre line. `getBattlefieldZone()` / `getBattlefieldObjects()` delegate to the Battlefield Controller (`bfc001`).

| GUID | Role | Position (X, Y, Z) | Owner | RB |
|------|------|--------------------|-------|----|
| bf1d02 | battlefield left | −29.63, 1.95, −0.02 | amory | ✓ |
| bf1d01 | battlefield centre | 0, 1.95, −0.02 | amory | ✓ |
| bf1d03 | battlefield right | 29.63, 1.95, −0.02 | amory | ✓ |

---

## Core engine

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| 02e062 | Encoder | TyrantNomad | — | Central API hub; `onload` depends on it. Handles per-card data, button rebuilding, zone tracking. Do not delete. |
| b93b40 | Easy Modules Unified | TyrantNomad | ✓ | Riftbound fork — provides Might and Riftseer re-import modules; MTG-only UI stripped. |
| 82bf98 | PiecePack_Crowns | TyrantNomad | — | Mesh/asset pack required by Easy Modules. |
| cd83de | Auto Player Promoter | upstream | — | Automatically promotes players from observer on join. |
| b8b8df | Domain Module (`RB_Domain`) | TyrantNomad | ✓ | Registers Riftbound domain designators (Fury, Calm, Mind, Body, Chaos, Order) on encoded cards. |
| c369d7 | πMenu | TyrantNomad | — | Card search and import UI overlay. |
| 7a0067 | πNotepad | TyrantNomad | — | In-game notepad for players. |
| de4346 | πScry | TyrantNomad | ✓ | Scry/Predict — updated to target the Riftbound main deck and trash zones (not legacy library zones). |
| def0af | πCounter | TyrantNomad | — | Generic numeric counter object. |
| ae12d3 | πKeywords | Tipsy Hobbit | ✓ | On-card Riftbound counters (Assault, Deflect, Hunt, Shield) and statuses (Backline, Ganking, Mighty, Stun, Tank, Temporary). All keys are `rb_*`; MTG keys removed. |
| 716ee6 | Is it a token? (`RB_Token`) | Tipsy Hobbit | ✓ | Registers `rb_token` boolean on encoded cards to flag non-card permanents. |
| bfc001 | Battlefield Controller | amory | ✓ | Manages Link/Unlink and Conquer/Unclaim per battlefield slot. Handles highlight mats and 3D description text. Script: `scripts/objects/bfc001_battlefield_controller.lua`. |

---

## Card importers / deck loaders

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| 80c03d | Riftbound Card Importer | amory | ✓ | API handler for the Piltover Archive importer; do not move or delete. |
| 25dbaf | Riftbound Deck Loader | amory | ✓ | Companion to Card Importer; receives decoded deck lists and spawns cards. |
| c91a72, f4d8be | Riftbound Deck Loader ×2 (infinite bag) | amory / DXHHH101 | ✓ | Bag-style deck loaders; upstream auto-update removed. Legacy GUIDs: 5aebeb, 3ede22. |

---

## Per-player UI — 4× symmetrical sets

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| 23e485, 448880, 37e533, 395037 | Score Tracker ×4 | Amuzet / π | ✓ | Tracks score (0–8) with physical reversi tokens spawned along the board edge; state persisted in `script_state`. |
| 2f714c, 25f80a, 5b0cc8, b40ce7 | Hand Counter ×4 | OIBAP | — | Shows opponent's hand count. |
| 9d9dda, 0af44c, 9243e9, d29299 | Hand Counter (Self) ×4 | OIBAP | — | Shows the owning player's own hand count. |
| 3d7324, 5137aa, fcb7b5, 4563bf | Hand Counter Screen ×4 | OIBAP | — | Screen-space hand count display. |
| 809133, 29f427, 57b8f3, 9df6a3 | Timer ×4 | OIBAP | — | Countdown timer per player. |
| 5cb175, 40b95f, a42baa, d1ae7b | Highlight Mat ×4 | OIBAP | — | Translucent coloured mat; placed under active-turn player and cloned by Conquer. |
| c53ac6, 3b07ae, 47645d, e0a3bc | Mulligan tile ×4 | OIBAP | ✓ | Deals 4 cards to hand (Riftbound opening hand size). |
| 86e447, 18fb5d, e2f7ae, 1f3e4a | Ready button ×4 | OIBAP | — | Rotates cards on the playboard back to the ready (upright) orientation; checks `rb_stun` before rotating. |
| ch0001, ch0002, ch0003, ch0004 | Channel button ×4 | amory | ✓ | Moves runes from the rune deck into the player's rune channel zones. |
| 885f49, 26775a, b49d50, 305c12 | Draw button ×4 | OIBAP | — | Draws cards from the main deck. |
| ffa67c, 614515, 4e19c8, 8a4c8b | Predict button ×4 | OIBAP | ✓ | Triggers πScry on the main deck (Riftbound Predict mechanic). |
| da5d0d, 57914a, d06889, 67b4a5 | Mill button ×4 | OIBAP | — | Moves cards from the top of the main deck to trash. Chat label says "milling" (upstream string); left as-is intentionally. |
| d67eb4, 0ad181, 59ab68, c489e1 | Reveal button ×4 | OIBAP | — | Reveals the top N cards of the main deck face-up on the table (fan or stack). |

---

## Counters and tokens

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| beb998, d82eb8 | +1 Counter bags ×2 | OIBAP | ✓ | Spawns flat +1 chip tokens; retextured with Riftbound UI art. |
| 7c9dfd, ad6bf5 | +1 Counter spawn templates (inside bags) | OIBAP | ✓ | Button-chip with Riftbound art; hidden custom mesh. Scripts: `7c9dfd_1.lua`, `ad6bf5_1_1.lua`. |
| 4256ba, 917dc3 | Generic Counter bags ×2 | OIBAP | — | Spawns plain numeric counter chips. |
| b02684, 7eeb77 | Text + Counter bags ×2 | OIBAP | — | Spawns counters with a text label. |
| 855d09, 195243 | Notecard bags ×2 | OIBAP | — | Spawns blank notecard objects. |
| 3c7ad3, 82e64d | Drop-On-Card Counter bags ×2 | OIBAP | ✓ | Spawns draggable chip counters (`7071ce`, `f62d00`, `4f684b`, `c1ae57`); chip art retextured to Riftbound UI. Bag mesh/diffuse still upstream. |
| 3cba4d/30f3c2/94b67a, bfceec/30f3c2/e6f47f | Experience Counter bags ×2 | amory | ✓ | Re-added from legacy side-table pile; converted to custom-card objects using Riftbound experience front/back art. |
| 7ae211/be93f0, daebb2/8e1f05, b991d5/a90926, 887dd2/63e4e1, 52e44b/a7dc6e, 389c4d/2c49c6 (set 1) + 4783af, cdbccc, 220d2f, 1c4a59, aeeb11, cd8bb6 (set 2) | Domain Counter bags ×12 | OIBAP | ✓ | Retextured and relabelled from upstream mana colours to Riftbound domains: Calm, Body, Fury, Chaos, Mind, Order. |

---

## Turn / phase utilities

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| b653d2, 05b07c | Turn Skipper Puck ×2 | OIBAP | — | Marks a player as skipping their next turn. |
| cafe01, cafe02 | Turn Order card ×2 | amory | ✓ | Two-sided card showing turn sequence; Riftbound face/back art, GUIDs kept (legacy: aea3f4, 633ed3). |

---

## Battlefield controls (Custom_Model, tagged to `bfc001`)

| GUID | Role | Slot | Owner | RB |
|------|------|------|-------|----|
| bf2k01 | Link / Unlink (left / right click) | left | amory | ✓ |
| bf2c01 | Conquer / Unclaim | left | amory | ✓ |
| bf2k02 | Link / Unlink | centre | amory | ✓ |
| bf2c02 | Conquer / Unclaim | centre | amory | ✓ |
| bf2k03 | Link / Unlink | right | amory | ✓ |
| bf2c03 | Conquer / Unclaim | right | amory | ✓ |

---

## Fun props / table atmosphere

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| 540e21 | Pirate Cannon | upstream | — | Fires selected objects with physics; integrates with Who Goes First die. |
| 5a7db4 | Bruh Button | upstream | — | Plays a sound effect. |
| ee33ec | Who Goes First? (custom die) | upstream | — | Sets turn order automatically when the die lands. |

---

## Dice

| GUID | Object | Owner | RB |
|------|--------|-------|----|
| 1d701a, ae70ca | d20 ×2 | upstream | — |
| 5c471e, e3ecb3 | d12 ×2 | upstream | — |
| 544ef3, 64d53e | d10 ×2 | upstream | — |
| 14da25, fcd8d9 | d8 ×2 | upstream | — |
| 979e78, b8b9ed | d6 ×2 | upstream | — |
| e86d81, cbcbea | d4 ×2 | upstream | — |
| 9cf532 | d2 ×1 | upstream | — |

---

## General utilities

| GUID | Object | Owner | RB | What it does |
|------|--------|-------|----|--------------|
| fb6538 | Hold Alt (context-menu helper) | upstream | — | Adds right-click context menus; deleted by the × button on Table Instructions. |
| 7cf430 | Battlefield lane counter | amory | ✓ | Spawns/manages a ▲▼ counter panel to set the number of active battlefield lanes (2–4); calls `bfc001` `APIsetBattlefieldCount`. Hosted on the former Steam Workshop link tile (tile visual kept). |

---

## Unnamed / unidentified objects

Unknown purpose — do not remove until identified.

| GUID | Type | Owner | RB |
|------|------|-------|----|
| eb479b, a3e6a8, a7a029, 4c02f8, 9c553c, cb1610 | Custom_Assetbundle ×6 | unknown | — |
| 3d4319 | Custom_Model | unknown | — |

---

## Tiles needing content updates

~~These objects exist and function but display legacy MTG content.~~

All previously listed tiles have been updated with Riftbound content.

---

## Removed objects (for reference)

| GUID | Object | Why removed |
|------|--------|-------------|
| 29d31b, 2e1ed6 | +X/+Y Counter bags ×2 | Replaced by +1 Counter bags and life-tracker might tokens. |
| f07e80, 9360fc | Suspend Counter bags ×2 | MTG suspend mechanic; not used in Riftbound. |
| dc2d88 | Smart Mulligan | Toggled legacy land-check logic removed from `global.lua`. |
| (MTG keyword bags) | Defender, Flying, etc. | On-card tokens use Encoder πKeywords (`ae12d3`) instead. |

---

## MTG remnants in code

These are live code issues — not cosmetic. They should be cleaned up before the table is fully Riftbound-native.

### Unchanged components that are still MTG-specific

| Object | Issue |
|--------|-------|
| **πMenu** (`c369d7`) | Colour-filter UI uses MTG mana-colour variable names (`vWhite`, `vBlue`, `vBlack`, `vRed`, `vGreen`, `vColorless`) and WUBRGC symbols in `global.lua:2545`. |

### MTG-specific logic still in `global.lua`

The ready/untap remnants are fixed. What is left is cosmetic and tracked above.

| Location | Code | Issue |
|----------|------|-------|
| `global.lua:3051` | `--json.mana_cost` | A commented-out Scryfall field left beside the parser. The key itself is gone from `normal_card_keys` and `card_face_keys`. |

Fixed and kept here so the same ground is not re-walked:

| Was | Resolution |
|-----|------------|
| `rb_stuncounter`, `rb_frozen`, `rb_exert` in `playerUntap` | `playerUntap` reads `rb_stun`, the registered boolean, and clears it on ready. Stun now prevents readying and is consumed by it, which is what the Ready button row above always claimed. `rb_frozen` and `rb_exert` were never registered keywords, so both branches were unreachable and are gone. |
| `'mana_cost'` in `card_keys` and `card_face_keys` | Removed from both arrays. |
| `-- ... from the library zones` | Comment says "deck zones". |
| `4a0860_custom_dice.lua:37` "paid X mana for Y" | The object is not in the save. Its orphaned script was deleted rather than reworded — see below. |
| `mana vault` / `basalt monolith` / `grim monolith` / `doesn't untap during your untap step` | Not present in `global.lua`; cleaned up before this pass. |

### Orphaned object scripts

`scripts/objects/` held 19 `.lua` files whose GUIDs are in no object in the
save — MTG Planechase and Archenemy cards plus the custom dice, removed from
the table but never from the source tree. Neither tool notices: `extract.py`
only writes files for objects it finds and `inject.py` skips a file with no
matching GUID, so the round trip in `.github/workflows/tts.yml` stayed green
with all 19 present. Deleted, taking `scripts/objects/` from 111 files to 92,
one per scripted object in the save.

When an object is removed from the table in TTS, delete its script file in the
same commit. Nothing else will tell you.
