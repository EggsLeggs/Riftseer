# Riftbound TCG — Tabletop Simulator Table

A scripted Tabletop Simulator table for the Riftbound TCG, forked from the excellent
[MTG 4 player table - scripted](https://steamcommunity.com/sharedfiles/filedetails/?id=2296042369)
by Oops I Baked a Pie.

The port is **playable and largely complete**. The table includes Riftbound zones
(main deck, trash, banishment, legend/champion/rune decks, playboards, rune
channels, shared battlefields), domain counters, on-card πKeywords (`rb_*`),
Piltover Archive / Riftseer deck import, channel and ready automation, score
trackers with might tokens, and battlefield Link/Unlink and Conquer/Unclaim.

**Remaining polish** (not blockers for play): Table Instructions and Chat
Commands tiles still show legacy MTG text; πMenu still uses WUBRGC colour-filter
names; a few dead MTG code paths remain in `global.lua`. See [Components.md](Components.md)
for the full GUID inventory (Owner / RB columns) and the **MTG remnants in code**
section.

## Workshop Items

- **Riftbound 4-Player Table** (ID `3732199052`):
  [https://steamcommunity.com/sharedfiles/filedetails/?id=3732199052](https://steamcommunity.com/sharedfiles/filedetails/?id=3732199052)

- **Riftbound Card Importer** (ID `3717685169`):
  [https://steamcommunity.com/sharedfiles/filedetails/?id=3717685169](https://steamcommunity.com/sharedfiles/filedetails/?id=3717685169)

## Credits

The original mod is the work of several authors over five years. Most scripted
infrastructure inherits from the MTG table; Riftbound-specific additions are
credited separately:

- **Oops I Baked a Pie** — original table, global script, hand counters, timers, draw/mill/predict/reveal buttons, overall design
- **TyrantNomad** — Easy Modules Unified, the πMenu / πNotepad / πScry / πKeywords suite
- **Tipsy Hobbit** — Keyword Abilities module (lineage of πKeywords on cards)
- **Amuzet / π** — Score Tracker lineage (might tokens on this table)
- **rikrassen** — MTG Deck/Draft/Cube Importer (removed; replaced by Riftbound loaders)
- Encoder API author (unattributed in source — happy to credit if identified)
- **amory** — Riftbound zones, battlefield controller, importers, score presentation, and most fork art (see [NOTICE](NOTICE))

Visual assets:

- **amory** — original fork art (playmats, battlefields, domain counters, turn order
  cards, card backs, counter chips, etc.), hosted via Steam Cloud URLs in the save.
- A **small subset** of remaining visuals (notably some card back art variants) is
  adapted from other community Workshop mods. Full credit remains with those authors.

If you're one of the above and want changes to attribution or licensing here, open an issue.

## Repo layout

```
mod/Riftbound.json       The TTS save file. This is what TTS loads.
scripts/global.lua       Global script (extracted from the JSON).
scripts/objects/*.lua    One file per scripted object, named {GUID}_{slug}.lua.
ui/global.xml            Global XmlUI (extracted from the JSON).
tools/extract.py         Pull scripts/UI out of the JSON into source files.
tools/inject.py          Push scripts/UI back into the JSON.
Components.md            GUID inventory — Owner/RB status and known cleanup.
LICENSE / NOTICE         Split license scope and upstream credits.
AGENTS.md / CLAUDE.md    Agent instructions for editing this repo.
vendor/                  Patched VS Code extension and other vendored deps.
```

The `.lua` and `.xml` files are the readable source of truth. The JSON is the
build artifact TTS actually loads. Both are committed so the mod is loadable
straight from a clone.

## Setup (macOS)

### 1. Clone

```bash
git clone git@github.com:YOUR_USERNAME/riftbound-tcg-tts.git
cd riftbound-tcg-tts
```

### 2. Symlink the save into TTS

This makes editing in the repo equivalent to editing the save TTS loads.

```bash
ln -s "$(pwd)/mod/Riftbound.json" "$HOME/Library/Tabletop Simulator/Saves/Riftbound.json"
```

In TTS: Create → Singleplayer → Save & Load → **Saves** tab → Riftbound. This
should match the [published Riftbound table](#workshop-items) when built from
this repo (after `inject.py` if you edited scripts locally).

### 3. Install the patched VS Code extension

The marketplace build of rolandostar's "Tabletop Simulator Lua" extension is
broken on recent VS Code versions. A patched `.vsix` is vendored in this repo
at `vendor/Tabletop Simulator Lua 1.1.3 Patched.vsix`.

If you have an old/broken version installed, uninstall it cleanly first:

```bash
# In VS Code: Extensions panel → Tabletop Simulator Lua → cog → Uninstall
# Then quit VS Code (Cmd+Q), and clear any leftover extension dir:
rm -rf ~/.vscode/extensions/rolandostar.tabletopsimulator-lua-*
```

Install the patched build:

```bash
code --install-extension "vendor/Tabletop Simulator Lua 1.1.3 Patched.vsix"
```

If `code` isn't on your PATH, install via the UI instead: `Cmd+Shift+P` →
"Extensions: Install from VSIX..." → pick `vendor/Tabletop Simulator Lua 1.1.3 Patched.vsix`.

Reopen VS Code, open this repo, then open `scripts/global.lua` to activate the
extension.

### 4. Verify the dev loop

1. Launch TTS, load the Riftbound save.
2. In VS Code: `Cmd+Shift+P` → **Tabletop Simulator: Get Lua Scripts**.
3. The extension dumps scripts into `~/Documents/Tabletop Simulator/` and
   opens them. From there, edit and use **Tabletop Simulator: Save And Play**
   to push changes back into the live game.

> **Note on script location.** The rolandostar extension dumps scripts into
> `~/Documents/Tabletop Simulator/`, not into this repo. Day-to-day editing
> happens there. When you save the mod in TTS itself (via the in-game save
> menu), the JSON in `mod/Riftbound.json` updates via the symlink — and you
> can run `python3 tools/extract.py` to regenerate the readable `.lua` files
> in `scripts/` for committing.

## Workflow

### Edit / test cycle

1. Launch TTS, load the Riftbound save.
2. `Cmd+Shift+P` → **Tabletop Simulator: Get Lua Scripts** (pulls from the running game).
3. Edit the scripts the extension opened.
4. `Cmd+Shift+P` → **Tabletop Simulator: Save And Play** (pushes back, TTS reloads).
5. When happy, save the mod in TTS itself — this writes the JSON via the symlink.
6. Run `python3 tools/extract.py` to refresh `scripts/*.lua` from the new JSON.
7. `git diff` to review, then commit both the JSON and the regenerated scripts.

### Rebuilding the JSON manually

If the JSON ever drifts from the source files (or for CI):

```bash
python3 tools/inject.py
```

This rewrites `mod/Riftbound.json` using the current `.lua` and `.xml` files.

## Optional follow-ups

- **Table Instructions** (`e40450`) and **Chat Commands** (`7b59f7`) — rewrite tile copy for Riftbound (content is still legacy MTG).
- **`global.lua` cleanup** — remove dead MTG ready/untap paths and align Stun with `rb_stun` (see Components.md).
- **πMenu** — replace WUBRGC colour-filter variable names with Riftbound domains.

### Re-adding physical keyword token bags (optional)

MTG keyword token bags (Defender, Flying, etc.) were removed; on-card πKeywords
(`ae12d3`, `rb_*` counters and statuses) are the supported path. To add physical
bags again with Riftbound art:

1. Open TTS and load the Riftbound save.
2. Spawn infinite-bag + token pairs via the TTS object menu; position on the table.
3. Save in TTS — the JSON updates via the symlink.
4. Run `python3 tools/extract.py`, update `unnecessaryStuff` in
   `scripts/objects/e40450_table_instructions.lua`, document in `Components.md`,
   run `python3 tools/inject.py`, and commit.

## License

This repo uses a **split license**:

- **[LICENSE](LICENSE)** — MIT applies to files and works listed in **[NOTICE](NOTICE)**
  (`tools/`, project docs, Riftbound importer/deck-loader scripts, battlefield
  controller, and original table art by amory).
- **Everything else** — inherited from the forked Workshop mod and other upstream
  authors; no explicit upstream license. See NOTICE for credits and scope.

The original MTG table mod has no stated open-source license. Treat inherited
Lua and XmlUI as workshop/personal-use derivatives unless you have permission
from upstream authors.

Original table art (playmat, counters, card backs, etc.) is MIT-licensed; see
NOTICE for legacy upstream URLs, imported card faces, and Riftbound game IP.
