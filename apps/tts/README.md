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

The mod lives inside the Riftseer monorepo at `apps/tts`. Clone the monorepo,
not the old standalone `riftbound-tcg-tts` repo — that one stopped receiving
changes when the mod was imported here with its history.

```bash
git clone git@github.com:EggsLeggs/Riftseer.git
cd Riftseer/apps/tts
```

Every path below is relative to `apps/tts/`. The mod needs no `bun install`;
it is Lua plus two stdlib-only Python tools and is not a Bun workspace member.

### 2. Symlink the save into TTS

This makes editing in the repo equivalent to editing the save TTS loads. Run it
from `apps/tts/`, and use `-sfn` so it replaces an existing link rather than
nesting a new one inside a stale directory:

```bash
ln -sfn "$(pwd)/mod/Riftbound.json" "$HOME/Library/Tabletop Simulator/Saves/Riftbound.json"
```

Check it landed on this checkout, not another one:

```bash
readlink "$HOME/Library/Tabletop Simulator/Saves/Riftbound.json"
cmp "$HOME/Library/Tabletop Simulator/Saves/Riftbound.json" mod/Riftbound.json && echo in sync
```

> **If you set this up before the monorepo import, your link is stale.** It
> points at `riftbound-tcg-tts/mod/Riftbound.json`, so TTS loads a save frozen
> at the import and **saving in TTS writes to the old repo** —
> `apps/tts/mod/Riftbound.json` never changes and `tools/extract.py` shows no
> diff no matter what you did in game. The symptom is subtle: the table loads
> and plays fine, but **Get Lua Scripts** returns scripts that disagree with
> `scripts/objects/` for the objects that have moved since. Re-run the `ln`
> above to fix it, then reload the save in TTS.

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

Reopen VS Code, open `riftseer.code-workspace` from the monorepo root (the
`tts` folder root is the mod), then open `scripts/global.lua` to activate the
extension.

### 4. Verify the dev loop

1. Launch TTS and **load the Riftbound save**. This has to be the actual save,
   not a fresh table — see the check in step 3 below.
2. In VS Code: `Cmd+Shift+P` → **Tabletop Simulator: Get Lua Scripts**.
3. The extension adds a folder to your workspace and fills it with the running
   game's scripts, one file per scripted object plus `Global.-1.lua`. Confirm
   you pulled the real table: `Global.-1.lua` should be around 109 KB and
   roughly 70 files should arrive. A 320-byte `Global.-1.lua` on its own is
   TTS's empty-table boilerplate, which means no save was loaded.
4. Edit the files in that folder, then `Cmd+Shift+P` → **Tabletop Simulator:
   Save And Play** to push them into the live game.

**Where the scripts actually go.** Not into this repo, and not into
`~/Documents/Tabletop Simulator`. The extension writes to a fixed temporary
directory, `$TMPDIR/TabletopSimulator/Tabletop Simulator Lua`, and **Get Lua
Scripts** adds that directory to your VS Code workspace. There is no setting
to change it; the path is hardcoded. `~/Documents/Tabletop Simulator` is a
different thing — it is the `require()` include root that the **Add include
folder to workspace** command mounts as "TTS Includes", and where Console++
installs.

**Get Lua Scripts before Save And Play, every session.** Save And Play sends
the contents of that temp directory to the game, and refuses to run at all
unless the directory is one of your workspace folders — you get a modal
reading "The workspace does not contain the Tabletop Simulator folder". Get
Lua Scripts is what adds it. Running Save And Play on a temp directory left
over from an earlier session pushes those older scripts into the game and
overwrites what is there.

**Not every script comes down.** TTS only sends scripts for objects in play,
so objects nested inside bags and decks never appear in the temp directory.
Expect it to be a subset of `scripts/objects/` — around 70 files against 111
on disk. That gap is normal and is not drift.

## Workflow

There are two loops. Use the second one for anything that is only code — it is
shorter, and it never puts the game between you and the diff.

### Through the game (needed for object placement, or to test live)

1. Launch TTS, load the Riftbound save.
2. `Cmd+Shift+P` → **Tabletop Simulator: Get Lua Scripts** (pulls from the running game).
3. Edit the scripts the extension opened, in the temp folder it added to the workspace.
4. `Cmd+Shift+P` → **Tabletop Simulator: Save And Play** (pushes back, TTS reloads).
5. When happy, save the mod in TTS itself — this writes the JSON via the symlink.
6. Run `python3 tools/extract.py` to refresh `scripts/*.lua` from the new JSON.
7. Drop the temp folder from the workspace file (below), `git diff` to review,
   then commit both the JSON and the regenerated scripts.

### Straight in the repo (preferred for code)

1. Edit `scripts/*.lua` and `ui/global.xml` directly.
2. Run `python3 tools/inject.py` to write them into `mod/Riftbound.json`.
3. Reload the save in TTS to verify.
4. `git diff` to review, then commit the sources and the JSON together.

From the monorepo root, `bun run tts:extract` and `bun run tts:inject` are the
same two commands, and are what the workspace file's tasks call.

### Get Lua Scripts dirties the workspace file

**Get Lua Scripts** adds the temp directory to the workspace by calling VS
Code's `updateWorkspaceFolders`. In a saved multi-root workspace that edits the
workspace file on disk, so `riftseer.code-workspace` comes back modified — with
a machine-specific `../../../../var/folders/…` path appended, and the whole
`folders` array reflowed from one line per entry into expanded objects. It is a
~44-line diff for what looks like one added folder.

Leave it while you work: Save And Play stops working the moment that folder is
not a workspace root. Just never commit it. Before you commit anything from a
TTS session, from the monorepo root:

```bash
git checkout -- riftseer.code-workspace
```

Committing it would break the workspace for everyone else, since the temp path
is specific to your machine.

### Rebuilding the JSON manually

If the JSON ever drifts from the source files (or for CI):

```bash
python3 tools/inject.py
```

This rewrites `mod/Riftbound.json` using the current `.lua` and `.xml` files.

## Optional follow-ups

- **Table Instructions** (`e40450`) and **Chat Commands** (`7b59f7`) — rewrite tile copy for Riftbound (content is still legacy MTG).
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
