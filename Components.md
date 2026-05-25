
# Components to keep

Objects confirmed for the Riftbound build.

---

## Zone / trigger infrastructure

Invisible TTS objects that define hand zones and scripting regions.

| GUID | Object |
|------|--------|
| 360dc1, 640235, a11f20, 7295a1 | HandTrigger ×4 (seats 1–4) |
| b798d6, 350f7f, 993f89, bb8c76 | HandTrigger ×4 (seats 5–8) |

The ScriptingTriggers below are the **functional zones** for each player seat. Their positions must align with both the playmat art and the table's snap points — all three must move together if the layout changes. `global.lua:registerObjectGUIDs()` hard-codes `mainDeckZone`, `trash`, and `banishmentZone` GUIDs; renaming or deleting them breaks Draw/Mill/Predict and trash/banishment keybinds.

Seat keys in `global.lua` (`data`, `props`, `deckDirs`) use **Green** / Red / Yellow / Blue (legacy upstream used `White` for the green seat).

| GUID | Role | Seats |
|------|------|-------|
| 166036 | main deck (mainDeckZone) | Green |
| 2365d0 | main deck (mainDeckZone) | Red |
| 033b34 | main deck (mainDeckZone) | Yellow |
| c04462 | main deck (mainDeckZone) | Blue |
| 68549d | trash | Green |
| 07dd80 | trash | Red |
| 8b439a | trash | Yellow |
| debc40 | trash | Blue |
| bf0002 | banishment (banishmentZone) | Green |
| bf0001 | banishment (banishmentZone) | Red |
| bf0003 | banishment (banishmentZone) | Yellow |
| bf0004 | banishment (banishmentZone) | Blue |
| f1e001 | legend | Green |
| 1e9001 | legend | Red |
| e1e001 | legend | Yellow |
| b1e001 | legend | Blue |
| f4c001 | champion | Green |
| c4a001 | champion | Red |
| e4c001 | champion | Yellow |
| b4c001 | champion | Blue |
| f4d001 | rune deck | Green |
| 4d0001 | rune deck | Red |
| e4d001 | rune deck | Yellow |
| b4d001 | rune deck | Blue |
| 8b3401 | playmat | Green |
| c20e3f | playmat | Red |
| 129eaa | playmat | Yellow |
| 56cd9d | playmat | Blue |

### Playboard zones (tagged ScriptingTriggers)

Three triggers per seat (Main, Side, Rune), tagged `playboard{color}`. Used by
`global.lua` for play-area detection, mulligan safety, and Ready (untap) on
board objects. Must stay aligned with playmat art and snap points.

| GUID | Role | Seat |
|------|------|------|
| e045d9 | playboard Main | Green |
| 8ecbef | playboard Rune | Green |
| 317569 | playboard Side | Green |
| d64a19 | playboard Main | Red |
| a67f19 | playboard Rune | Red |
| f6152f | playboard Side | Red |
| 2c718e | playboard Main | Yellow |
| b5c8e9 | playboard Rune | Yellow |
| 65d86e | playboard Side | Yellow |
| 92d981 | playboard Main | Blue |
| 679690 | playboard Rune | Blue |
| 6a0546 | playboard Side | Blue |

### Rune channels (ScriptingTriggers)

Twelve rune slots per seat; `global.lua` registers them as `runeZones` and moves
cards from `runeDeckZone` via the Channel button (`ch0001`–`ch0004`).

| Seat | GUIDs |
|------|-------|
| Green | f4a001–f4a00c |
| Red | 4da001–4da00c |
| Yellow | e4a001–e4a00c |
| Blue | b4a001–b4a00c |

### Battlefield (ScriptingTriggers)

Three shared slots along the table center line (horizontal `scaleX`/`scaleZ`).
Tagged `battlefield`; zones registered on controller `bfc001`. Global
`getBattlefieldZone()` / `getBattlefieldObjects()` delegate to the controller.

Snap points live in the save root `SnapPoints` array (same as legend/champion
zones): world X/Z aligned to each trigger center, Y `0.9611349`, rotY `180` for
the negative-Z center line.

| Snap X | Z | rotY |
|--------|---|------|
| −29.63 | −0.02 | 180 |
| 0 | −0.02 | 180 |
| 29.63 | −0.02 | 180 |

Battlefield controls (Custom_Model, scale `0.85`, Grey tint — any player may
click). Link uses Ready button art; Conquer uses Channel art (placeholders). Logic
lives on the Battlefield Controller (`bfc001`); `global.lua` forwards zone enter/leave
and card drops via `battlefieldNotifyZone` / `battlefieldRefreshAll`. Link/Conquer
buttons stay hidden until a card is in that slot; removing the card hides them and
clears link/claim state.

| GUID | Role | Slot |
|------|------|------|
| bf2k01 | Link / Unlink (left click / right click) | left |
| bf2c01 | Conquer / Unclaim | left |
| bf2k02 | Link / Unlink | center |
| bf2c02 | Conquer / Unclaim | center |
| bf2k03 | Link / Unlink | right |
| bf2c03 | Conquer / Unclaim | right |

Conquer (left click) spawns a Highlight Mat clone (`5cb175` asset) at the slot's X,
Y `0.92`, Z `0`, scale `{7.52, 1, 2.6}`, tinted to the clicking player's color
(same alpha as turn highlight). Unclaim (right click) removes it.

Link (left click) shows the card's Description at world offsets ±`4.80` along the zone's
forward axis (±`4.20` world units) above/below
the zone (3D text, max width `27.40`, font capped at 32; positive-Z label rotated
180°). Unlink removes text and unlocks the card. Requires a Battlefield card in the zone.

| GUID | Role | Position (X, Y, Z) |
|------|------|-------------------|
| bf1d02 | battlefield left | −29.63, 1.95, −0.02 |
| bf1d01 | battlefield center | 0, 1.95, −0.02 |
| bf1d03 | battlefield right | 29.63, 1.95, −0.02 |

### Battlefield controller

| GUID | Object | Note |
|------|--------|------|
| bfc001 | Battlefield Controller | `PiecePack_Arms` mesh (same as “Is it a token?” `716ee6`); locked, non-interactable; side table at X −46.75, Z −8.5 (`716ee6` is Z −6.5). Script: `scripts/objects/bfc001_battlefield_controller.lua`. |

---

## Core engine (load-bearing)

| GUID | Object |
|------|--------|
| 02e062 | Encoder — central API hub; `onload` depends on it |
| b93b40 | TyrantNomad's Easy Modules Unified |
| 82bf98 | PiecePack_Crowns (supports Easy Modules) |
| cd83de | Auto Player Promoter |
| b8b8df | Domain Module (`RB_Domain`) — Riftbound domain designators on encoded cards |
| c369d7 | πMenu |
| 7a0067 | πNotepad |
| de4346 | πScry |
| def0af | πCounter |

---

## Per-player UI — 4× symmetrical sets

> **Mostly Riftbound-ready.** Mulligan deals 4 (friendly only). Ready untaps
> playboard units and clears `rb_stun` / `rb_temporary` on encoded cards. Channel
> pulls runes from the rune deck into `runeZones`. Trash/banishment use dedicated
> zones (keybind 7 → trash, 8 → banishment). Life trackers spawn 0–8 locked
> reversi chips along the board edge as might tokens. **Still upstream-labelled:**
> Mill (deck top → trash), Predict (πScry), and life-tracker chat strings.

| GUID | Object |
|------|--------|
| 23e485, 448880, 37e533, 395037 | Life Tracker ×4 — might counter (0–8) with physical reversi tokens; see `scripts/objects/*_life_tracker.lua` |
| 2f714c, 25f80a, 5b0cc8, b40ce7 | Hand Counter ×4 |
| 9d9dda, 0af44c, 9243e9, d29299 | Hand Counter (Self) ×4 |
| 3d7324, 5137aa, fcb7b5, 4563bf | Hand Counter Screen ×4 |
| 809133, 29f427, 57b8f3, 9df6a3 | Timer ×4 |
| 5cb175, 40b95f, a42baa, d1ae7b | Highlight Mat ×4 |
| c53ac6, 3b07ae, 47645d, e0a3bc | Mulligan tile ×4 |
| 86e447, 18fb5d, e2f7ae, 1f3e4a | Ready button ×4 |
| ch0001, ch0002, ch0003, ch0004 | Channel (Rune) button ×4 |
| 885f49, 26775a, b49d50, 305c12 | Draw button ×4 |
| ffa67c, 614515, 4e19c8, 8a4c8b | Predict button ×4 |
| da5d0d, 57914a, d06889, 67b4a5 | Mill button ×4 |
| d67eb4, 0ad181, 59ab68, c489e1 | Reveal button ×4 |

---

## Counters and tokens

| GUID | Object |
|------|--------|
| beb998, d82eb8 | +1 Counter bags ×2 — flat bag mesh + chip diffuse `…/232DF325…/`; `onLoad` calls `setCustomObject` + full white tint (`scripts/objects/beb998_plus1_counter.lua`, `d82eb8_plus1_counter.lua`) |
| 7c9dfd, ad6bf5 | +1 Counter spawn templates (inside bags) — button-chip UI, hidden custom mesh; `scripts/objects/7c9dfd_1.lua`, `ad6bf5_1_1.lua` |
| ~~29d31b, 2e1ed6~~ | ~~+X/+Y Counter bags ×2~~ — deleted; replaced by +1 bags and life-tracker might tokens |
| ~~f07e80, 9360fc~~ | ~~Suspend Counter bags ×2~~ — deleted; MTG suspend not used in Riftbound (spawn template `a5df2d`) |
| 4256ba, 917dc3 | Generic Counter bags ×2 |
| b02684, 7eeb77 | Text + Counter bags ×2 |
| 855d09, 195243 | Notecard bags ×2 |
| 3c7ad3, 82e64d | Drop-On-Card Counter bags ×2 — draggable chip (`7071ce`, `f62d00`, `4f684b`, `c1ae57`) retextured to Riftbound UI; infinite-bag mesh/diffuse still upstream |
| 3cba4d/30f3c2/94b67a, bfceec/30f3c2/e6f47f | Experience Counter bags ×2 — re-added from legacy side-table counter pile template; converted to plain custom-card objects using Riftbound experience front/back art |

---

## Turn / phase utilities

| GUID | Object | Note |
|------|--------|------|
| b653d2, 05b07c | Turn Skipper Puck ×2 | |
| cafe01, cafe02 | Turn Order card ×2 | Updated for Riftbound (new face/back art, unlocked; legacy GUIDs: aea3f4, 633ed3) |
| ~~dc2d88~~ | ~~Smart Mulligan~~ | Deleted — toggled legacy land-check logic removed from `global.lua`. |

---

## Fun props / table atmosphere

| GUID | Object | Note |
|------|--------|------|
| 540e21 | Pirate Cannon | Fires selected objects with physics; integrates with Who Goes First die |
| 5a7db4 | Bruh Button | |
| ee33ec | Who Goes First? (custom dice) | Sets turn order automatically when die lands |

---

## Dice

| GUID | Object |
|------|--------|
| 1d701a, ae70ca | d20 ×2 |
| 5c471e, e3ecb3 | d12 ×2 |
| 544ef3, 64d53e | d10 ×2 |
| 14da25, fcd8d9 | d8 ×2 |
| 979e78, b8b9ed | d6 ×2 |
| e86d81, cbcbea | d4 ×2 |
| 9cf532 | d2 ×1 |

---

## General utilities

| GUID | Object | Note |
|------|--------|------|
| fb6538 | hold alt (context-menu helper) | |
| 716ee6 | Is it a token? | |
| 7cf430 | Steam Workshop link tile | Click to reveal copyable links: [Riftbound TTS table](https://steamcommunity.com/sharedfiles/filedetails/?id=3732199052) and [Riftbound Card Importer](https://steamcommunity.com/sharedfiles/filedetails/?id=3717685169) |

---

## Unnamed / unidentified objects

Unknown purpose — do not remove until identified.

| GUID | Type |
|------|------|
| eb479b, a3e6a8, a7a029, 4c02f8, 9c553c, cb1610 | Custom_Assetbundle ×6 |
| 3d4319 | Custom_Model |

---

## Needs Riftbound update

Objects kept in the mod but requiring content changes before the table is
Riftbound-native.

### Finished rewrites

Components fully rewritten for Riftbound and no longer pending migration.

| GUID | Object |
|------|--------|
| 80c03d | Riftbound Card Importer — API handler; do not move or delete |
| 25dbaf | Riftbound Deck Loader — companion to Card Importer |
| c91a72, f4d8be | Riftbound Deck Loader ×2 (infinite bag) — overhauled for Riftbound; upstream auto-update removed (legacy GUIDs: 5aebeb, 3ede22) |
| 7ae211/be93f0, daebb2/8e1f05, b991d5/a90926, 887dd2/63e4e1, 52e44b/a7dc6e, 389c4d/2c49c6 (set 1) + 4783af, cdbccc, 220d2f, 1c4a59, aeeb11, cd8bb6 (set 2) | Domain Counter bags ×12 — retextured and relabeled from upstream mana colours to Riftbound domains: Calm, Body, Fury, Chaos, Mind, Order |
| ae12d3 | πKeywords — on-card Riftbound counters (Assault, Deflect, Hunt, Shield) and statuses (Backline, Ganking, Mighty, Stun, Tank, Temporary); see `scripts/objects/ae12d3_keywords.lua` |
| b8b8df | Domain Module — `RB_Domain` designators (Fury, Calm, Mind, Body, Chaos, Order) |
| b93b40 | Easy Modules Unified — Riftbound fork (Might, Riftseer re-import; MTG-only UI stripped) |
| de4346 | πScry — top/bottom of **main deck** and trash (not legacy library zones) |
| 23e485, 448880, 37e533, 395037 | Life Tracker ×4 — might tokens (reversi chips 0–8, owner-tinted, persisted in `script_state`) |
| beb998, d82eb8, 7c9dfd, ad6bf5 | +1 Counter bags + spawn templates (see Counters and tokens) |
| — | `scripts/global.lua` + `ui/global.xml` — playboard/rune/banishment zones, channeling, importer UI labels; seat key **Green** (not `White`) |

### Physical keyword token bags (removed)

The MTG infinite-bag keyword tokens (Defender, Flying, etc.) were removed from the
table. On-card tokens use Encoder πKeywords (`ae12d3`) instead. To re-add
physical bags, see README → Future plans.

### Chat Commands tile (7b59f7)

Currently lists legacy chat commands. Update to document Riftbound
chat commands.

### Table Instructions tile (e40450)

Currently shows legacy rules and setup instructions. Rewrite for Riftbound.
The × button clutter lists (`unnecessaryStuff`, `moveThese`) were updated to
drop removed +X/+Y bags (`29d31b`, `2e1ed6`) and suspend counters (`f07e80`,
`9360fc`); more GUIDs will need pruning as objects are removed.
