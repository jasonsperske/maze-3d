#!/usr/bin/env python3
"""
convert-doom.py — Convert each map in a Doom WAD file into a level JSON
that the DoomMapProvider can render in the 3D maze engine.

Usage:
    python3 tools/convert-doom.py <path/to/file.WAD> [--scale SCALE] [--out-dir DIR]

Outputs one JSON file per map, named  <wadname>-<mapname>.json (all lowercase).
Default output directory is public/static/level/ relative to the project root
(one level up from the tools/ directory).

Default scale: 0.05  (Doom's ~128-unit corridor → 6.4 world units)
"""

import argparse
import json
import math
import re
import struct
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Doom linedef specials that represent interactive doors / portals
# ---------------------------------------------------------------------------
DOOR_SPECIALS = {
    1,   # DR  Door open-wait-close (push)
    2,   # W1  Door open
    3,   # W1  Door close
    4,   # W1  Door open-wait-close
    11,  # S1  Exit level
    26,  # DR  Blue-key door
    27,  # DR  Yellow-key door
    28,  # DR  Red-key door
    29,  # S1  Door open
    31,  # D1  Door open (no key)
    32,  # D1  Blue-key door
    33,  # D1  Yellow-key door
    34,  # D1  Red-key door
    46,  # GR  Door open
    52,  # W1  Exit level (secret)
    61,  # SR  Door close
    62,  # SR  Door open-wait-close
    63,  # SR  Door open
    90,  # WR  Door open-wait-close
    105, # WR  Door open-wait-close (Boom)
    106, # WR  Door open (Boom)
}

# Linedef flag bits
FLAG_TWO_SIDED = 0x04


# ---------------------------------------------------------------------------
# WAD parsing
# ---------------------------------------------------------------------------

def parse_wad(path: Path) -> list[dict]:
    """Return list of lump dicts: {name, offset, size, data}."""
    with open(path, 'rb') as f:
        data = f.read()

    magic = data[:4]
    if magic not in (b'IWAD', b'PWAD'):
        raise ValueError(f'Not a WAD file (got magic {magic!r})')

    num_lumps, dir_off = struct.unpack_from('<II', data, 4)
    lumps = []
    for i in range(num_lumps):
        base = dir_off + i * 16
        lump_off, lump_sz = struct.unpack_from('<II', data, base)
        name = data[base + 8: base + 16].rstrip(b'\x00').decode('ascii', errors='replace')
        lumps.append({
            'name': name,
            'offset': lump_off,
            'size': lump_sz,
            'data': data[lump_off: lump_off + lump_sz],
        })
    return lumps


def find_maps(lumps: list[dict]) -> list[tuple[str, int]]:
    """Return [(map_name, lump_index)] for every map marker lump."""
    pattern = re.compile(r'^(E\dM\d|MAP\d\d)$')
    return [
        (lump['name'], i)
        for i, lump in enumerate(lumps)
        if pattern.match(lump['name']) and lump['size'] == 0
    ]


def lump_after_marker(lumps: list[dict], marker_idx: int, name: str) -> bytes | None:
    """
    Search for a named lump within the ~11 lumps that follow a map marker.
    Returns the lump data or None if not found.
    """
    for lump in lumps[marker_idx + 1: marker_idx + 12]:
        if lump['name'] == name:
            return lump['data']
    return None


# ---------------------------------------------------------------------------
# Lump parsers
# ---------------------------------------------------------------------------

def parse_vertexes(data: bytes) -> list[tuple[int, int]]:
    """Return list of (x, y) in Doom coordinates."""
    count = len(data) // 4
    return [struct.unpack_from('<hh', data, i * 4) for i in range(count)]


def parse_linedefs(data: bytes) -> list[dict]:
    """Each linedef is 14 bytes."""
    count = len(data) // 14
    result = []
    for i in range(count):
        v1, v2, flags, special, tag, right_sdf, left_sdf = struct.unpack_from(
            '<hhhhhhh', data, i * 14
        )
        result.append({
            'v1': v1,
            'v2': v2,
            'flags': flags,
            'special': special,
            'tag': tag,
            'right_sidedef': right_sdf,
            'left_sidedef': left_sdf,
        })
    return result


def parse_sidedefs(data: bytes) -> list[dict]:
    """Each sidedef is 30 bytes: x_off(2) y_off(2) upper(8) lower(8) mid(8) sector(2)."""
    count = len(data) // 30
    result = []
    for i in range(count):
        base = i * 30
        x_off, y_off = struct.unpack_from('<hh', data, base)
        sector = struct.unpack_from('<H', data, base + 28)[0]
        result.append({'x_offset': x_off, 'y_offset': y_off, 'sector': sector})
    return result


def parse_sectors(data: bytes) -> list[dict]:
    """Each sector is 26 bytes: floor_h(2) ceil_h(2) floor_tex(8) ceil_tex(8) light(2) type(2) tag(2)."""
    count = len(data) // 26
    result = []
    for i in range(count):
        base = i * 26
        floor_h, ceil_h = struct.unpack_from('<hh', data, base)
        light = struct.unpack_from('<H', data, base + 20)[0]
        result.append({'floor_h': floor_h, 'ceil_h': ceil_h, 'light': light})
    return result


def parse_things(data: bytes) -> list[dict]:
    """Each thing is 10 bytes: x(2) y(2) angle(2) type(2) flags(2)."""
    count = len(data) // 10
    result = []
    for i in range(count):
        x, y, angle, typ, flags = struct.unpack_from('<hhHHH', data, i * 10)
        result.append({'x': x, 'y': y, 'angle': angle, 'type': typ, 'flags': flags})
    return result


# ---------------------------------------------------------------------------
# Coordinate helpers
# ---------------------------------------------------------------------------

def doom_to_world(dx: int, dy: int, scale: float,
                  offset_x: float, offset_z: float) -> tuple[float, float]:
    """
    Convert Doom map coordinates to Three.js world XZ.

    Doom X → world X  (east = +X in both systems)
    Doom Y → world -Z (north = +Y in Doom, north = -Z in Three.js)
    """
    wx = round(dx * scale - offset_x, 4)
    wz = round(-dy * scale - offset_z, 4)
    return wx, wz


def doom_angle_to_rotation_y(angle_deg: int) -> float:
    """
    Convert a Doom thing angle (0 = east, 90 = north, CCW) to a Three.js
    Euler Y rotation in radians (camera default faces -Z).

    Derivation:
        Three.js camera direction for rotY θ = (-sin θ, 0, -cos θ)
        Doom east (+X): -sin θ = 1 → θ = -π/2
        Doom north after Z-flip (-Z): -cos θ = -1 → θ = 0
        General: θ = (angle_deg - 90) * π / 180
    """
    return round((angle_deg - 90) * math.pi / 180, 6)


# ---------------------------------------------------------------------------
# Light hint computation
# ---------------------------------------------------------------------------

def compute_light_hints(
    vertexes: list[tuple[int, int]],
    linedefs: list[dict],
    sidedefs: list[dict],
    sectors: list[dict],
    scale: float,
    offset_x: float,
    offset_z: float,
    light_threshold: int = 160,
) -> list[dict]:
    """
    Place a light hint at the centroid of each sector whose light level
    exceeds light_threshold.  Centroid is the average of the sector's vertex
    positions (derived via sidedef → linedef → vertex chain).
    """
    # Map sector index → set of vertex indices used by that sector
    sector_verts: dict[int, set[int]] = {}

    for ld in linedefs:
        for sdf_idx in (ld['right_sidedef'], ld['left_sidedef']):
            if sdf_idx == -1 or sdf_idx >= len(sidedefs):
                continue
            sec_idx = sidedefs[sdf_idx]['sector']
            if sec_idx not in sector_verts:
                sector_verts[sec_idx] = set()
            sector_verts[sec_idx].add(ld['v1'])
            sector_verts[sec_idx].add(ld['v2'])

    hints = []
    for sec_idx, vert_set in sector_verts.items():
        if sec_idx >= len(sectors):
            continue
        if sectors[sec_idx]['light'] < light_threshold:
            continue
        xs = [vertexes[v][0] for v in vert_set if v < len(vertexes)]
        ys = [vertexes[v][1] for v in vert_set if v < len(vertexes)]
        if not xs:
            continue
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        wx, wz = doom_to_world(int(cx), int(cy), scale, offset_x, offset_z)
        hints.append({'x': wx, 'z': wz})

    return hints


# ---------------------------------------------------------------------------
# Map geometry parser (returns the per-map data file content)
# ---------------------------------------------------------------------------

def parse_map_geometry(
    map_name: str,
    lumps: list[dict],
    marker_idx: int,
    scale: float,
) -> dict:
    """
    Parse one map's geometry lumps and return a map-data dict suitable for
    writing to  public/static/level/{wad}/{mapname}.json.
    """

    # ---- Load required lumps ----
    vx_data = lump_after_marker(lumps, marker_idx, 'VERTEXES')
    ld_data = lump_after_marker(lumps, marker_idx, 'LINEDEFS')
    sd_data = lump_after_marker(lumps, marker_idx, 'SIDEDEFS')
    se_data = lump_after_marker(lumps, marker_idx, 'SECTORS')
    th_data = lump_after_marker(lumps, marker_idx, 'THINGS')

    if vx_data is None or ld_data is None:
        raise ValueError(f'{map_name}: missing VERTEXES or LINEDEFS lump')

    vertexes = parse_vertexes(vx_data)
    linedefs = parse_linedefs(ld_data)
    sidedefs = parse_sidedefs(sd_data) if sd_data else []
    sectors  = parse_sectors(se_data) if se_data else []
    things   = parse_things(th_data) if th_data else []

    # ---- Coordinate offset so world coords start near (0, 0) ----
    xs = [v[0] for v in vertexes]
    ys = [v[1] for v in vertexes]
    # World: X = doom_x * scale - offset_x, Z = -doom_y * scale - offset_z
    # We want min world X ≈ 0, min world Z ≈ 0 (with a 2-unit padding).
    PADDING = 2.0
    offset_x = min(xs) * scale - PADDING
    offset_z = -max(ys) * scale - PADDING   # max doom Y → min world Z

    # ---- Linedefs — embed resolved world coordinates directly ----
    out_linedefs = []
    min_x, max_x, min_z, max_z = float('inf'), float('-inf'), float('inf'), float('-inf')

    for ld in linedefs:
        v1_idx, v2_idx = ld['v1'], ld['v2']
        if v1_idx >= len(vertexes) or v2_idx >= len(vertexes):
            continue  # malformed linedef

        dx1, dy1 = vertexes[v1_idx]
        dx2, dy2 = vertexes[v2_idx]
        x1, z1 = doom_to_world(dx1, dy1, scale, offset_x, offset_z)
        x2, z2 = doom_to_world(dx2, dy2, scale, offset_x, offset_z)

        # Track bounds from linedef endpoints (avoids needing a vertices array)
        for wx in (x1, x2):
            if wx < min_x: min_x = wx
            if wx > max_x: max_x = wx
        for wz in (z1, z2):
            if wz < min_z: min_z = wz
            if wz > max_z: max_z = wz

        two_sided = bool(ld['flags'] & FLAG_TWO_SIDED)
        is_door   = ld['special'] in DOOR_SPECIALS

        entry: dict = {'x1': x1, 'z1': z1, 'x2': x2, 'z2': z2}

        if is_door:
            entry['isDoor'] = True
        elif two_sided:
            entry['twoSided'] = True
        # one-sided non-door: solid wall (default, no extra flags needed)

        out_linedefs.append(entry)

    bounds = {
        'minX': round(min_x, 4), 'maxX': round(max_x, 4),
        'minZ': round(min_z, 4), 'maxZ': round(max_z, 4),
    }

    # ---- Player start (THING type 1 = Player 1 start) ----
    out_things = []
    for th in things:
        if th['type'] == 1:
            wx, wz = doom_to_world(th['x'], th['y'], scale, offset_x, offset_z)
            out_things.append({
                'type': 'playerStart',
                'x': wx,
                'z': wz,
                'angle': th['angle'],
            })
            break  # only player 1 start

    # ---- Light hints from bright sectors ----
    light_hints = compute_light_hints(
        vertexes, linedefs, sidedefs, sectors,
        scale, offset_x, offset_z,
        light_threshold=160,
    )

    return {
        'wallHeight': 3.0,
        'linedefs':   out_linedefs,   # each entry: {x1,z1,x2,z2[,isDoor|twoSided]}
        'things':     out_things,
        'lightHints': light_hints,
        '_bounds':    bounds,         # informational, recomputed by DoomMapProvider
    }


def wad_level_config() -> dict:
    """
    Return the shared level config written to  public/static/level/{wad}.json.
    Visual settings here apply to every map in the WAD; edit after generation
    to customise colours, lighting, etc.
    """
    return {
        'walldef':              'DoomMap',
        'wallColor':            '#888888',
        'floorColor':           '#555555',
        'ceilingColor':         '#2a2a2a',
        'doorFrequency':        0,
        'ambientLight':         0.3,
        'lightSpacing':         8,
        'halfHeightPartitions': False,
        'halfHeightColor':      '#666666',
        'halfHeightFrequency':  0.0,
        'widerRooms':           False,
        'widerRoomFrequency':   0.0,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wad', type=Path, help='Path to the .WAD file')
    parser.add_argument(
        '--scale', type=float, default=0.05,
        help='Doom-units → world-units scale factor (default: 0.05)',
    )
    parser.add_argument(
        '--out-dir', type=Path, default=None,
        help='Output directory (default: <project_root>/public/static/level/)',
    )
    args = parser.parse_args()

    wad_path: Path = args.wad.resolve()
    if not wad_path.exists():
        sys.exit(f'ERROR: {wad_path} does not exist')

    # Default output dir: two levels up from this script → project root
    if args.out_dir is None:
        script_dir = Path(__file__).resolve().parent  # tools/
        out_dir = script_dir.parent / 'public' / 'static' / 'level'
    else:
        out_dir = args.out_dir.resolve()

    out_dir.mkdir(parents=True, exist_ok=True)

    wad_stem = wad_path.stem.lower()  # e.g. "rage"

    print(f'Reading {wad_path}')
    lumps = parse_wad(wad_path)

    maps = find_maps(lumps)
    if not maps:
        sys.exit('ERROR: no map markers (E1M1, MAP01, …) found in WAD')

    print(f'Found {len(maps)} map(s): {", ".join(n for n, _ in maps)}')

    # ---- Write shared level config  public/static/level/{wad}.json ----
    level_config_path = out_dir / f'{wad_stem}.json'
    with open(level_config_path, 'w') as f:
        json.dump(wad_level_config(), f, indent=2)
    print(f'Level config → {level_config_path}')

    # ---- Write per-map geometry  public/static/level/{wad}/{map}.json ----
    map_dir = out_dir / wad_stem
    map_dir.mkdir(exist_ok=True)

    for map_name, marker_idx in maps:
        map_path = map_dir / f'{map_name.lower()}.json'
        print(f'  {map_name} → {map_path}', end=' ... ', flush=True)

        try:
            map_data = parse_map_geometry(map_name, lumps, marker_idx, args.scale)
        except ValueError as e:
            print(f'SKIPPED ({e})')
            continue

        b = map_data['_bounds']
        print(
            f'{len(map_data["linedefs"])} linedefs, '
            f'{len(map_data["lightHints"])} lights, '
            f'bounds {b["minX"]}–{b["maxX"]} × {b["minZ"]}–{b["maxZ"]}'
        )

        with open(map_path, 'w') as f:
            json.dump(map_data, f, indent=2)

    print(f'Done. Load maps at /level/{wad_stem}/{{mapname}}')


if __name__ == '__main__':
    main()
