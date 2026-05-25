# CLAUDE.md

Instructions for Claude Code working in this repo.

## What this project is

A scripted Tabletop Simulator (TTS) table for the Riftbound TCG, forked from
"MTG 4 player table - scripted" (Steam Workshop ID `2296042369`) by Oops I
Baked a Pie. We are reskinning the original MTG mod into a Riftbound-native
table — replacing zones, removing MTG-specific mechanics (mana, commander
damage, planechase, dungeons), and eventually adding a Riftseer-backed deck
importer.

The fork is mid-migration: core zones, rune channeling, domain counters,
πKeywords, and Riftseer import are in place, but much Lua/XmlUI is still
upstream MTG lineage. Treat unfamiliar code as load-bearing legacy until proven
otherwise. Use `Components.md` for GUID inventory and what is already Riftbound-native.

## How a TTS mod works (essential context)

A TTS mod is **one big JSON file** describing a saved game. TTS reconstructs
the entire table from this JSON on load — every object's position, model,
texture URL, Lua script, and contents. There is no engine or framework
beyond TTS itself.

- **`mod/Riftbound.json`** is the build artifact TTS loads. It is symlinked
  into `~/Library/Tabletop Simulator/Saves/Riftbound.json` on the user's
  machine.
- **Objects are nested data** — `ObjectStates` is an array of objects, each
  with a `GUID`, `Name`, `Transform`, optional `LuaScript`, and optional
  `ContainedObjects`/`ChildObjects`/`States` for nesting.
- **Lua runs in two scopes**: the global script (the JSON's top-level
  `LuaScript` field), and per-object scripts. Objects communicate via
  `getObjectFromGUID("abc123")` and `Object.call("functionName", params)`.
- **Assets are URLs** — card images, models, playmat textures all reference
  external URLs (Steam Cloud, Imgur, etc.). Reskinning visuals means
  swapping URLs, not editing image files in the repo.
- **The Encoder object** (GUID `02e062`) is load-bearing. The global script's
  `onload` waits for it before doing zone work. Many other scripts call into
  it via `Encoder.call("APIxxx", ...)`. Do not delete it.

## Repo layout

```
mod/Riftbound.json       The TTS save file. Build artifact. Loaded by TTS.
scripts/global.lua       Global Lua script (extracted from the JSON).
scripts/objects/*.lua    One file per scripted object. Filename is {GUID}_{slug}.lua.
ui/global.xml            Global XmlUI (extracted from the JSON).
tools/extract.py         Pull scripts/UI out of the JSON into source files.
tools/inject.py          Push scripts/UI back into the JSON.
Components.md            GUID inventory — kept objects and migration status.
LICENSE                  MIT license (scoped — see NOTICE).
NOTICE                   License scope, upstream credits, MIT file list.
vendor/                  Patched VS Code extension (.vsix) and other vendored deps.
```

**Riftbound-specific wiring (do not break casually):**

- `global.lua:registerObjectGUIDs()` — `mainDeckZone`, `trash`, `banishmentZone`,
  `runeDeckZone`, `runeZones`, playboard tags (`playboard{color}`), Channel buttons
  (`ch0001`–`ch0004`).
- Encoder πKeywords (`ae12d3`) — `rb_*` counter/status keys; not legacy `mtg_*`.
- Domain Module (`b8b8df`, `RB_Domain`) — six domains, not MTG colours.

The `.lua` and `.xml` files under `scripts/` and `ui/` are **the readable
source of truth for code review and diffs**. The JSON is the build artifact.
Both are committed. They must stay in sync.

## How to make changes

There are two valid paths for editing scripts. Pick the right one for the
change.

**Path A — script-only changes (preferred for code edits).**
1. Edit files in `scripts/` directly.
2. Run `python3 tools/inject.py` to write changes back into `mod/Riftbound.json`.
3. The user reloads the save in TTS to verify.
4. Commit both the `.lua` files and the updated JSON together.

**Path B — changes that involve object placement, deletion, or new objects.**
This requires TTS itself. Do not attempt these via JSON surgery unless the
change is small and well-understood (e.g. removing a top-level object by
GUID match in `ObjectStates`).
1. The user opens TTS, makes the change, saves the mod.
2. The JSON updates via the symlink.
3. Run `python3 tools/extract.py` to regenerate `scripts/`.
4. Review `git diff`, commit.

For the GUI-driven Path B, prepare instructions for the user rather than
attempting it yourself.

## Verification

- After any script edit: run `python3 tools/inject.py` and confirm it reports
  expected updates without errors.
- After any structural edit to the JSON: confirm `len(ObjectStates)` is what
  you expect, the JSON parses, and `tools/extract.py` round-trips cleanly.
- The user verifies behaviourally by loading the save in TTS. Always tell
  them what to test (e.g. "load the save and try drawing from a deck").

## Conventions

- **Line endings**: the original JSON stores Lua with `\r\n` line endings.
  `tools/extract.py` and `tools/inject.py` preserve this via byte-mode I/O.
  Do not convert to `\n` — it produces noisy diffs against upstream.
- **Filenames in `scripts/objects/`**: `{6-char-guid}_{slug}.lua`. The GUID
  prefix is what `tools/inject.py` matches on. Don't rename without updating
  the inject script.
- **GUIDs are stable identifiers**. When referencing objects in code or
  commits, use the GUID, not the nickname (nicknames have rich-text tags
  like `[b]...[/b]` and frequently duplicate).
- **Lua style**: match the surrounding file. The original authors use
  `camelCase` for functions and tabs for indentation. Don't reformat
  existing code; new code matches existing style.

## Things to be careful with

- **Do not delete the Encoder object** (GUID `02e062`). Many scripts depend
  on it. Removing it breaks `onload`.
- **Do not delete or rename objects without checking cross-references**.
  Before removing any GUID, grep `scripts/global.lua` and
  `scripts/objects/*.lua` for that GUID. If found, that's a dependency.
- **Do not commit changes that fail round-tripping**. After any edit, verify
  `tools/extract.py` followed by `tools/inject.py` produces a JSON whose
  re-extracted scripts equal the source files.
- **Do not "fix" code from the original authors that looks idiosyncratic**
  but works. The MTG mod has had 985 updates over five years; weird patterns
  often have history.
- **Do not push** to GitHub without explicit user confirmation. Commits are
  fine; pushes need a green light.

## Commit conventions

- Imperative mood subject line, ≤72 chars: `Remove MTG-specific deck importers`.
- Body explains the **why**, not just the what. The diff shows the what.
- Reference GUIDs when removing or modifying specific objects.
- **Never add `Co-Authored-By: Claude` or any "Generated with Claude Code"
  trailer.** Commits in this repo are authored by the user only. No exceptions.

## Credits and licensing

This repo uses a **split license**. Read `LICENSE` and `NOTICE` before
committing licensing-sensitive changes.

- **MIT** — original repo files and visual assets listed under
  `Licensed under MIT` in `NOTICE`.
- **Not MIT** — inherited Workshop Lua/XmlUI, upstream-derived scripts not
  listed in `NOTICE`, third-party assets, imported card faces, Riftbound game IP.

Upstream authors (credit in `README.md` and `NOTICE`; preserve attribution):
- Oops I Baked a Pie (table, global script, life trackers)
- TyrantNomad (Easy Modules Unified, the πMenu/πNotepad/πScry/πKeywords suite)
- Tipsy Hobbit (Keyword Abilities module — πKeywords / Ready-button lineage)
- rikrassen (the MTG Deck/Draft/Cube Importer — replaced on-table by Riftbound loaders)

If a change removes one of these authors' work entirely, note it in the commit
message but leave the README credit in place — they still contributed to the
lineage.

### When to update NOTICE (and README License if scope changes)

Update `NOTICE` in the **same commit** whenever work is brought under MIT or
removed from MIT scope. Do **not** edit the MIT boilerplate in `LICENSE`
unless the legal text itself changes — scope lives in `NOTICE`.

**Add to MIT scope** when you create or promote:

| Kind | Qualifies if… | NOTICE update |
|------|----------------|---------------|
| Repo file | Original tool, doc, or substantially **new** Riftbound Lua (not a thin reskin of upstream) | Add path under `Repository files:` |
| Visual asset | Original art by amory, referenced via Steam Cloud URL in the save | Add a `-` bullet under `Original visual assets (amory):` |
| Derivative script | Fork rewrite with clear upstream lineage (e.g. deck loaders from DXHHH101) | Add path under `Repository files:` **and** add or extend an upstream-lineage subsection |

**Do not add to MIT scope** without maintainer intent:

- Inherited upstream scripts (`global.lua`, life trackers, πMenu, Encoder, etc.)
- Reskins that only change labels/textures on upstream Lua (e.g. domain counters)
- Third-party or Workshop-adapted art (credit under `Visual assets — not under MIT`)
- Imported card faces (piltoverarchive, etc.)

**Remove from MIT scope** when deleting or reverting to upstream: remove the
path or bullet from `NOTICE` and update the `Everything else — not under MIT`
exclusion list if the wildcard exception note needs changing.

### NOTICE edit format

Match the existing `NOTICE` structure exactly:

```
================================================================================
Licensed under MIT
================================================================================

Repository files:

  tools/extract.py
  scripts/objects/{guid}_{slug}.lua    ← two-space indent, one path per line

Original visual assets (amory):

  Visual art created for this fork ...
    - Playmat / table art              ← hyphen bullets for asset categories
    - New asset type you added

When copying any MIT-licensed file or asset, include the LICENSE and this NOTICE.
```

For **new derivative scripts**, also add a subsection (after the MIT list or
under existing lineage sections) naming upstream authors and URLs, following
the `Riftbound Deck Loader lineage` block as a template.

For **upstream or third-party material**, add credits under the appropriate
`Everything else`, `Upstream`, or `Visual assets — not under MIT` section —
never under `Licensed under MIT`.

After editing `NOTICE`, skim `README.md` → License and ensure it still
accurately summarizes scope.