# T006 — Vehicle 3D models, first set (package G1)

**Worker:** `yousuf-amek` (Blender MCP, Unity MCP) · **Owns:** `assets/blender/`, `unity/MissionForge/Assets/Art/Models/`, `unity/MissionForge/Assets/Art/Materials/`, `client/public/models/`, `orchestration/evidence/T006/`

Do not change `unity/MissionForge/ProjectSettings/`, `Packages/` or any scene: task T001
is creating the Unity project at the same time. If `unity/MissionForge/` does not exist
yet when you export, create only the `Assets/Art/` folders you own.

## Goal

A modular rocket kit at release quality, so the Build Bay can assemble any vehicle the
players vote for, piece by piece. Stylised realism, accurate proportions, clean
silhouettes (design section 15). Follow `assets/media/style/STYLE_GUIDE.md` if it exists.

## Modular standard (every part follows it)

- Units: metres, 1 Blender unit = 1 m. +Y forward, +Z up in Blender; export so that the
  rocket's long axis is +Y (up) in Unity.
- Origin at the centre of the part's **bottom** mating ring. An empty named `attach_top`
  at the top mating ring. Engines also carry `nozzle_exit` (plume origin) and
  `gimbal_pivot`. Boosters carry `attach_side`.
- Stack diameters: 1.5 m, 3.7 m, 5.4 m and 8.4 m. Parts are authored per diameter or
  scale cleanly between them.
- File name = part ID from design section 7 in snake case, for example
  `eng_kerolox_workhorse`. Source in `assets/blender/<id>.blend`, FBX in
  `unity/.../Art/Models/<id>.fbx`, GLB in `client/public/models/<id>.glb`.
- Budgets: host model at most 30k triangles per part with LOD1 at 30%; phone GLB at most
  8k triangles and 2 MB, textures 1024 px or smaller. PBR metal/rough, shared trim-sheet
  materials where possible.
- Material slots that the game recolours: `hull` (structural material look: aluminium,
  aluminium-lithium, carbon composite, stainless steel), `livery`, `engine_metal`,
  `nozzle_hot` (emissive mask for heat glow), `thermal`.

## Parts in this task

1. First-stage engines, design section 7.7, all six, with visibly different bells,
   turbopump plumbing and scale (the Kerolox Giant is far larger than the Electric-Pump Mini).
2. Upper-stage engines, section 7.8, all five (vacuum nozzles are visibly larger in
   proportion; the solid kick motor is a sphere-and-nozzle).
3. Engine mounts for 1, 3, 5 and 9 engines on the first stage and 1 and 2 on the upper stage.
4. Tanks for first and upper stage in sizes XS, S, M, L, XL (section 7.9) with correct
   relative lengths, intertank and common-dome detail, hydrolox variants visibly bulkier.
5. Interstages for the three separation systems of section 7.12 (the hot-staging one is a
   vented truss ring).
6. Fairings, section 7.5: small, standard, large, each as two halves that can separate.
7. Strap-on boosters, section 7.11: small solid and heavy solid, with nose cones and
   attach struts.

## Acceptance

- Every part above exists as `.blend`, FBX and GLB at the paths given, within budget.
- A Blender test scene `assets/blender/_assembly_test.blend` stacks three different full
  vehicles from the kit with no gaps or overlaps at the mating rings.
- Renders in `orchestration/evidence/T006/`: one beauty render of each assembled vehicle,
  a contact sheet of every part, and a triangle-count table.
- If Unity is available, the FBX files import with correct scale and orientation
  (screenshot of one assembled vehicle in an empty Unity scene).
- `assets/blender/README.md` documents the modular standard so later model tasks match.
