"""Inject the extracted Lua and XML source files back into the TTS save.

Run from the repo root:
    python3 tools/inject.py

Reads:
    scripts/global.lua
    scripts/objects/{GUID}_*.lua
    ui/global.xml
And rewrites mod/Riftbound.json with those contents.

Use this when:
    - You edited scripts outside of the rolandostar VS Code extension
    - You need to apply scripts in CI
    - The JSON has somehow drifted from the source files

In normal day-to-day editing you don't need this — the VS Code extension's
"Save And Play" handles round-tripping through TTS itself.
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SAVE = REPO / 'mod' / 'Riftbound.json'

GUID_RE = re.compile(r'^([a-f0-9]{6})_')


def load_object_scripts():
    """Return {guid: lua_source} from scripts/objects/."""
    out = {}
    for p in (REPO / 'scripts' / 'objects').glob('*.lua'):
        m = GUID_RE.match(p.name)
        if not m:
            print(f"  skipping {p.name} (no GUID prefix)")
            continue
        out[m.group(1)] = p.read_bytes().decode('utf-8')
    return out


def inject(obj, scripts, stats):
    if not isinstance(obj, dict):
        return
    guid = obj.get('GUID')
    if guid and guid in scripts:
        new_src = scripts[guid]
        if obj.get('LuaScript') != new_src:
            obj['LuaScript'] = new_src
            stats['updated'] += 1
        else:
            stats['unchanged'] += 1
    for child in (obj.get('ContainedObjects') or []):
        inject(child, scripts, stats)
    for child in (obj.get('ChildObjects') or []):
        inject(child, scripts, stats)
    for state_obj in (obj.get('States') or {}).values():
        inject(state_obj, scripts, stats)


def main():
    with open(SAVE) as f:
        data = json.load(f)

    # Global
    global_lua = (REPO / 'scripts' / 'global.lua').read_bytes().decode('utf-8')
    if data.get('LuaScript') != global_lua:
        data['LuaScript'] = global_lua
        print("Updated global Lua script")

    global_xml = (REPO / 'ui' / 'global.xml').read_bytes().decode('utf-8')
    if data.get('XmlUI') != global_xml:
        data['XmlUI'] = global_xml
        print("Updated global XmlUI")

    # Per-object
    scripts = load_object_scripts()
    stats = {'updated': 0, 'unchanged': 0}
    for top in data.get('ObjectStates', []):
        inject(top, scripts, stats)
    print(f"Per-object: {stats['updated']} updated, {stats['unchanged']} unchanged "
          f"(of {len(scripts)} script files)")

    # Match TTS's own formatting: 2-space indent, no extra spaces, preserve unicode.
    with open(SAVE, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Wrote {SAVE}")


if __name__ == '__main__':
    main()
