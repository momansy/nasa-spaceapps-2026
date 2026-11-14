"""Registry shared by the library builders: asset provenance, paths and library.json assembly."""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MATERIALS_DIR = os.path.dirname(HERE)
LIBRARY_JSON = os.path.join(MATERIALS_DIR, "library.json")
THIRD_PARTY_JSON = os.path.join(HERE, "third_party.json")
THIRD_PARTY_MD = os.path.join(MATERIALS_DIR, "THIRD_PARTY.md")
SRC_DIR = os.environ.get("MF_TEX_SRC", "/tmp/mfdl")          # raw downloads; never committed
DOWNLOAD_DATE = "2026-11-15"

AMBIENTCG = "ambientCG (Lennart Demes and contributors)"
POLYHAVEN = "Poly Haven"


def ambientcg(asset_id: str) -> dict:
    return dict(name=f"ambientCG {asset_id} (2K-JPG)", url=f"https://ambientcg.com/a/{asset_id}",
                author=AMBIENTCG, licence="CC0 1.0", date=DOWNLOAD_DATE)


def src(asset_id: str, name: str) -> str:
    """Path of one map of a downloaded ambientCG set (2K-JPG)."""
    return os.path.join(SRC_DIR, asset_id, f"{asset_id}_2K-JPG_{name}.jpg")


def rel(path: str) -> str:
    return os.path.relpath(path, MATERIALS_DIR).replace(os.sep, "/")


def load_json(path: str, default):
    if os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    return default


def save_json(path: str, data) -> None:
    with open(path, "w") as fh:
        json.dump(data, fh, indent=1, sort_keys=False)
        fh.write("\n")


def library() -> dict:
    lib = load_json(LIBRARY_JSON, None)
    if lib is None:
        lib = {
            "version": 1,
            "value_type": "game_value",
            "uv": {"uv0": "metric, 1 unit = 1 m; bells angle-normalised",
                   "uv1": "unique 0..1 bake layout"},
            "channel_layout": {"albedo": "sRGB, near-neutral luminance; multiply by tint (sRGB hex)",
                               "normal": "OpenGL +Y tangent space (glTF and Unity)",
                               "orm": "linear: R occlusion, G roughness, B metallic",
                               "mask": "UV1: R AO, G edge wear, B heat or frost, A grime and cavity"},
            "materials": {}, "trim": {}, "decals": {}, "parts": {}}
    return lib


def record_material(lib: dict, slot: str, *, albedo, normal, orm, tiling_m, tint, metallic, roughness,
                    normal_strength, hero, sources, files_bytes=None) -> None:
    lib["materials"][slot] = {
        "albedo": rel(albedo), "normal": rel(normal), "orm": rel(orm), "tiling_m": tiling_m, "tint": tint,
        "metallic": list(metallic), "roughness": list(roughness), "normal_strength": normal_strength,
        "hero": hero, "source": [dict(name=s["name"], url=s["url"], licence=s["licence"]) for s in sources],
        "value_type": "game_value"}


def note_assets(assets: list[dict], path: str, changes: str) -> None:
    """Add/replace provenance rows in third_party.json (key = name + path)."""
    rows = load_json(THIRD_PARTY_JSON, [])
    for a in assets:
        row = dict(a, path=path, changes=changes)
        rows = [r for r in rows if not (r["name"] == row["name"] and r["path"] == row["path"])]
        rows.append(row)
    save_json(THIRD_PARTY_JSON, rows)


def write_third_party_md() -> None:
    rows = load_json(THIRD_PARTY_JSON, [])
    out = ["# Third-party assets in assets/blender/materials/", "",
           "Every downloaded or derived asset: name, URL, author, licence, download date, local path, changes.",
           "Allowed sources (VISUAL_TARGET 2.6): Poly Haven and ambientCG (CC0), OFL fonts, procedural shaders",
           "written for this project. Rebuild with `assets/blender/materials/source/build_library.py`.", "",
           "| Asset | URL | Author | Licence | Downloaded | Local path | Changes |", "|---|---|---|---|---|---|---|"]
    for r in sorted(rows, key=lambda r: (r["path"], r["name"])):
        out.append(f"| {r['name']} | {r['url']} | {r['author']} | {r['licence']} | {r['date']} | `{r['path']}` | {r['changes']} |")
    with open(THIRD_PARTY_MD, "w") as fh:
        fh.write("\n".join(out) + "\n")
