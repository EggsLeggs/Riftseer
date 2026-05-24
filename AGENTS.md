# AGENTS.md

Instructions for Codex working in this repo.

## What this project is

A scripted Tabletop Simulator (TTS) table for the Riftbound TCG, forked from
"MTG 4 player table - scripted" (Steam Workshop ID `2296042369`) by Oops I
Baked a Pie. We are reskinning the original MTG mod into a Riftbound-native
table — replacing zones, removing MTG-specific mechanics (mana, commander
damage, planechase, dungeons), and eventually adding a Riftseer-backed deck
importer.

The fork is in early stages. Most of the codebase is still the original
authors' work. Treat their code as load-bearing legacy until proven otherwise.

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
vendor/                  Patched VS Code extension (.vsix) and other vendored deps.
```

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
- **Never add `Co-Authored-By: Codex` or any "Generated with Codex"
  trailer.** Commits in this repo are authored by the user only. No exceptions.

## Credits and licensing

The original mod is the work of multiple authors over five years:
- Oops I Baked a Pie (table, global script, life trackers)
- TyrantNomad (Easy Modules Unified, the πMenu/πNotepad/πScry/πKeywords suite)
- rikrassen (the MTG Deck/Draft/Cube Importer — being removed)

Attribution lives in `README.md`. Preserve it. If a change removes one of
these authors' work entirely, note it in the commit message but leave the
README credit in place — they still contributed to the lineage.

The original mod has no explicit license. Treat the fork as personal-use
with attribution, same as upstream.