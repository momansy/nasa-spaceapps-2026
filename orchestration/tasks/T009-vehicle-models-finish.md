# T009 — Finish the vehicle model kit (package G1, continuation of T006)

**Worker:** `cyrex04` (Blender MCP, Unity MCP) · **Owns:** `assets/blender/`, `client/public/models/`, `orchestration/evidence/T009/`

Task T006 was cut off by a usage limit. The procedural kit generator is merged to `main`
in `assets/blender/scripts/` (read `assets/blender/scripts/AUTHORING.md` first: it is the
contract for every part module). Per the last progress report, 65 of about 97 parts
generated and validated: all 11 engines, 24 engine mounts, 20 tanks, 4 fairings, 6
adapters. Read `orchestration/tasks/T006-vehicle-models.md` for the original goal and
acceptance; this task finishes it.

Unfinished work from that run may be on branch `salvage/yousuf-t008-worktree`
(`git fetch origin salvage/yousuf-t008-worktree`). It also holds about 25,000 build
files; take only source files from it (`assets/blender/scripts/**`, `kit_manifest.json`),
never `_build/` or caches.

Task T008 (`yousuf-amek`) is working on `unity/MissionForge/` at the same time. Do not
touch `unity/`. Unity import of the kit is T008's job.

Work in this order; each step leaves a usable result:

1. Run the generator for the existing families and confirm they still validate.
2. Finish the missing families: interstages for the three separation systems across the
   stack diameters, and the two solid strap-on boosters (design sections 7.11, 7.12).
3. Export every part: `.blend` source in `assets/blender/`, GLB for phones in
   `client/public/models/<part_id>.glb` (at most 8k triangles, 2 MB). File names are the
   part IDs from `data/README.md`. FBX export for Unity goes to
   `assets/blender/export/fbx/<part_id>.fbx` (T008 imports from there).
4. The assembly test scene `assets/blender/_assembly_test.blend` with three different
   complete vehicles, and beauty renders following `assets/media/style/STYLE_GUIDE.md`.
5. Evidence in `orchestration/evidence/T009/`: one beauty render per assembled vehicle,
   a contact sheet of all parts, the triangle-count table.

`assets/blender/_build/` is a scratch folder and is never committed.

## Acceptance

Every part ID that `data/README.md` lists for design sections 7.5, 7.6, 7.7, 7.8, 7.9,
7.11 and 7.12 has a validated `.blend`, GLB and FBX, within budget; the three assembled
vehicles have no gaps at the mating rings; the renders look like release-quality
stylised realism. Use subagents for independent part families.
