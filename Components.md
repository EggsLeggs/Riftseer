
# Components to keep

Objects confirmed for the Riftbound build.

---

## Zone / trigger infrastructure

Invisible TTS objects that define hand zones and scripting regions.

| GUID | Object |
|------|--------|
| 360dc1, 640235, a11f20, 7295a1 | HandTrigger ×4 (seats 1–4) |
| b798d6, 350f7f, 993f89, bb8c76 | HandTrigger ×4 (seats 5–8) |

The ScriptingTriggers below are the **functional zones** for each player seat. Their positions must align with both the playmat art and the table's snap points — all three must move together if the layout changes. `global.lua:registerObjectGUIDs()` hard-codes the `mainDeckZone` and `trash` GUIDs; renaming or deleting them breaks Draw/Mill/Predict.

| GUID | Role | Seats |
|------|------|-------|
| 166036 | main deck (mainDeckZone) | White |
| 2365d0 | main deck (mainDeckZone) | Red |
| 033b34 | main deck (mainDeckZone) | Yellow |
| c04462 | main deck (mainDeckZone) | Blue |
| 68549d | trash | White |
| 07dd80 | trash | Red |
| 8b439a | trash | Yellow |
| debc40 | trash | Blue |
| bf0002 | banished zone | White |
| bf0001 | banished zone | Red |
| bf0003 | banished zone | Yellow |
| bf0004 | banished zone | Blue |
| f1e001 | legend | White |
| 1e9001 | legend | Red |
| e1e001 | legend | Yellow |
| b1e001 | legend | Blue |
| f4c001 | champion | White |
| c4a001 | champion | Red |
| e4c001 | champion | Yellow |
| b4c001 | champion | Blue |
| f4d001 | rune deck | White |
| 4d0001 | rune deck | Red |
| e4d001 | rune deck | Yellow |
| b4d001 | rune deck | Blue |
| 8b3401 | playmat | White |
| c20e3f | playmat | Red |
| 129eaa | playmat | Yellow |
| 56cd9d | playmat | Blue |

---

## Core engine (load-bearing)

| GUID | Object |
|------|--------|
| 02e062 | Encoder — central API hub; `onload` depends on it |
| b93b40 | TyrantNomad's Easy Modules Unified |
| 82bf98 | PiecePack_Crowns (supports Easy Modules) |
| cd83de | Auto Player Promoter |
| b8b8df | Color Module |
| c369d7 | πMenu |
| 7a0067 | πNotepad |
| de4346 | πScry |
| def0af | πCounter |

---

## Per-player UI — 4× symmetrical sets

> **Needs Riftbound layout work.** The Mill button label and keybind broadcasts
> still use upstream terminology. The infrastructure (life trackers, hand counters,
> timers, highlight mats, reveal) is reusable as-is. Mulligan rules updated
> (4-card friendly only). Ready/Predict/Draw buttons renamed.

| GUID | Object |
|------|--------|
| 23e485, 448880, 37e533, 395037 | Life Tracker ×4 |
| 2f714c, 25f80a, 5b0cc8, b40ce7 | Hand Counter ×4 |
| 9d9dda, 0af44c, 9243e9, d29299 | Hand Counter (Self) ×4 |
| 3d7324, 5137aa, fcb7b5, 4563bf | Hand Counter Screen ×4 |
| 809133, 29f427, 57b8f3, 9df6a3 | Timer ×4 |
| 5cb175, 40b95f, a42baa, d1ae7b | Highlight Mat ×4 |
| c53ac6, 3b07ae, 47645d, e0a3bc | Mulligan tile ×4 |
| 86e447, 18fb5d, e2f7ae, 1f3e4a | Ready button ×4 |
| 885f49, 26775a, b49d50, 305c12 | Draw button ×4 |
| ffa67c, 614515, 4e19c8, 8a4c8b | Predict button ×4 |
| da5d0d, 57914a, d06889, 67b4a5 | Mill button ×4 |
| d67eb4, 0ad181, 59ab68, c489e1 | Reveal button ×4 |

---

## Counters and tokens

> **Note:** The +X/+Y Counter bags need to be relabeled / retextured as Might
> counters (or whatever Riftbound's stat-modifier equivalent is).

| GUID | Object |
|------|--------|
| beb998, d82eb8 | +X/+Y Counter bags ×2 |
| 4256ba, 917dc3 | Generic Counter bags ×2 |
| b02684, 7eeb77 | Text + Counter bags ×2 |
| 855d09, 195243 | Notecard bags ×2 |
| 3c7ad3, 82e64d | Drop-On-Card Counter bags ×2 |
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

### Keyword tokens

Legacy keyword tokens (Defender, Flying, Hexproof, etc.). Keep the infinite bag
+ token infrastructure; replace artwork and labels with Riftbound status
keywords once the keyword set is known.

Two full sets (one per table half).

| Objects |
|---------|
| Defender, Deathtouch, Double Strike, First Strike, Flying, Hexproof, Haste |
| Indestructible, Lifelink, Menace, Monstrous, Reach, Trample, Vigilance |
| Goaded, Frozen |

### Resource counters

Two full sets (one per table half).

| Objects |
|---------|
| Suspend Counter ×2 sets — still labelled as legacy suspend; retexture/relabel for Riftbound if needed |

### πKeywords (ae12d3)

TyrantNomad keyword reference popup. Currently shows legacy keyword definitions
on right-click. Update the keyword list and definitions to match Riftbound's
keyword set.

### Chat Commands tile (7b59f7)

Currently lists legacy chat commands. Update to document Riftbound
chat commands.

### Table Instructions tile (e40450)

Currently shows legacy rules and setup instructions. Rewrite for Riftbound.
The × button that removes table clutter will need its `unnecessaryStuff`
GUID list updated as more objects are removed.
