"""Extract Lua scripts and XmlUI from the TTS save into a readable source tree.

Run from the repo root:
    python3 tools/extract.py

Reads mod/Riftbound.json. Writes:
    scripts/global.lua
    scripts/objects/{GUID}_{slug}.lua  (one per scripted object, including nested)
    ui/global.xml

Safe to re-run; overwrites existing files.
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SAVE = REPO / 'mod' / 'Riftbound.json'

GUID_RE = re.compile(r'^([a-f0-9]{6})_')


def existing_filenames(out_dir: Path) -> dict:
    """Map {guid: existing filename} so curated names are preserved on re-extract.

    Filenames are matched on the {GUID}_ prefix (the same key inject.py uses),
    so a hand-picked slug like `7cf430_battlefield_count_control.lua` is reused
    instead of being regenerated from the nickname (which would create a
    duplicate file for the same GUID and make inject.py non-deterministic).

    Two files already claiming one GUID is that same non-determinism, one step
    earlier: whichever the glob yields last would win. Refuse rather than pick.
    """
    out = {}
    for p in sorted(out_dir.glob('*.lua')):
        m = GUID_RE.match(p.name)
        if not m:
            continue
        guid = m.group(1)
        if guid in out:
            raise SystemExit(duplicate_guid_error(guid, out[guid], p.name))
        out[guid] = p.name
    return out


def duplicate_guid_error(guid: str, first: str, second: str) -> str:
    """One object has one script; two files for one GUID resolve by glob order."""
    return (
        f"Two files claim GUID {guid}: {first} and {second}.\n"
        f"An object has one script, and which of these reached the save would "
        f"depend on the filesystem. Delete whichever no longer matches the "
        f"object's nickname."
    )


def slug(s: str) -> str:
    """Turn an object nickname into a safe filename fragment."""
    if not s:
        return 'unnamed'
    # Strip TTS rich text tags like [b]...[/b], [00B4FF], [-]
    s = re.sub(r'\[/?[A-Za-z0-9]*\]', '', s)
    s = re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_').lower()
    return s[:50] or 'unnamed'


def walk(obj, seen, out_dir, existing):
    if not isinstance(obj, dict):
        return
    guid = obj.get('GUID')
    script = obj.get('LuaScript') or ''
    if guid and script and guid not in seen:
        seen.add(guid)
        nick = obj.get('Nickname') or obj.get('Name', 'unknown')
        fname = existing.get(guid) or f"{guid}_{slug(nick)}.lua"
        (out_dir / fname).write_bytes(script.encode('utf-8'))
    for child in (obj.get('ContainedObjects') or []):
        walk(child, seen, out_dir, existing)
    for child in (obj.get('ChildObjects') or []):
        walk(child, seen, out_dir, existing)
    for state_obj in (obj.get('States') or {}).values():
        walk(state_obj, seen, out_dir, existing)


def main():
    with open(SAVE) as f:
        data = json.load(f)

    # Write bytes with newline='' equivalent: preserve \r\n exactly as TTS stored it.
    (REPO / 'scripts' / 'global.lua').write_bytes(
        data.get('LuaScript', '').encode('utf-8'))
    (REPO / 'ui' / 'global.xml').write_bytes(
        data.get('XmlUI', '').encode('utf-8'))

    obj_dir = REPO / 'scripts' / 'objects'
    obj_dir.mkdir(parents=True, exist_ok=True)
    existing = existing_filenames(obj_dir)
    seen = set()
    for top in data.get('ObjectStates', []):
        walk(top, seen, obj_dir, existing)

    print(f"Extracted {len(seen)} object scripts -> scripts/objects/")
    print(f"Wrote scripts/global.lua ({len(data.get('LuaScript', ''))} chars)")
    print(f"Wrote ui/global.xml ({len(data.get('XmlUI', ''))} chars)")


if __name__ == '__main__':
    main()
