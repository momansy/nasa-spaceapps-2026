"""Build the PBR material library: textures, library.json and THIRD_PARTY.md (T032).

    BL=/Applications/Blender.app/Contents/MacOS/Blender
    $BL -b --factory-startup --python assets/blender/materials/source/build_library.py -- hull engine_metal
    $BL -b --factory-startup --python assets/blender/materials/source/build_library.py -- all

Raw ambientCG downloads are fetched with `--fetch` into $MF_TEX_SRC (default /tmp/mfdl) and are not committed.
"""
from __future__ import annotations

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import registry as R  # noqa: E402

ASSET_IDS = ["Metal009", "Metal012", "Rubber004"]       # extended by later steps


def fetch():
    for a in ASSET_IDS:
        d = os.path.join(R.SRC_DIR, a)
        if os.path.isdir(d):
            continue
        os.makedirs(d)
        subprocess.run(["curl", "-sfL", "-o", os.path.join(d, "a.zip"),
                        f"https://ambientcg.com/get?file={a}_2K-JPG.zip"], check=True)
        subprocess.run(["unzip", "-oq", "a.zip"], cwd=d, check=True)
        os.remove(os.path.join(d, "a.zip"))


def builders():
    import mat_basic
    import mat_misc
    import mat_decals
    import mat_trim
    import mat_nozzle
    import mat_metal
    mat_metal.drop_stale_provenance()
    table = {"hull": mat_basic.build_hull, "engine_metal": mat_metal.build_engine_metal,
             "engine_metal_satin": mat_metal.build_engine_metal_satin, "nozzle_inner": mat_nozzle.build_nozzle_inner,
             "detail_dark": mat_basic.build_detail_dark,
             "nozzle_hot": mat_nozzle.build_nozzle_hot, "nozzle_radiative": mat_nozzle.build_nozzle_radiative,
             "nozzle_ablative": mat_nozzle.build_nozzle_ablative,
             "trim": mat_trim.build_trim, "decal": mat_decals.build_decals, "livery": mat_misc.build_livery, "thermal": mat_misc.build_thermal, "foam": mat_misc.build_foam}
    return table


def lookdev_sources():
    R.note_assets([dict(name="Poly Haven studio_small_09 (2K HDR)", url="https://polyhaven.com/a/studio_small_09",
                        author="Sergej Majboroda", licence="CC0 1.0", date=R.DOWNLOAD_DATE)],
                  "hdri/studio_small_09_2k.hdr", "none")
    R.note_assets([dict(name="Poly Haven belfast_sunset_puresky (2K HDR)",
                        url="https://polyhaven.com/a/belfast_sunset_puresky",
                        author="Greg Zaal (processing), Dimitrios Savva (photography), Jarod Guest (sky edits)",
                        licence="CC0 1.0", date=R.DOWNLOAD_DATE)],
                  "hdri/belfast_sunset_puresky_2k.hdr", "none")
    R.note_assets([R.ambientcg("Concrete034")], "textures/lookdev_concrete034/",
                  "Look-dev ground only (dusk_pad); colour, roughness and NormalGL kept at 1K (resized from 2K), other maps deleted")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["all"]
    if "--fetch" in argv:
        fetch()
        argv.remove("--fetch")
    table = builders()
    want = list(table) if (not argv or "all" in argv) else argv
    lib = R.library()
    for name in want:
        sizes = table[name](lib)
        print(f"BUILT {name}: " + ", ".join(f"{s / 1024:.0f} KB" for s in sizes))
    lookdev_sources()
    R.save_json(R.LIBRARY_JSON, lib)
    R.write_third_party_md()
    print("WROTE", R.LIBRARY_JSON)


if __name__ == "__main__":
    main()
