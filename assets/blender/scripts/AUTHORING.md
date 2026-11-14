# Authoring a kit part (rules for every `mfkit/parts_*.py` module)

Read `mfkit/core.py` (MeshBuilder API), `mfkit/spec.py` (shared dimensions: never hard-code a
dimension that exists there), `mfkit/pipeline.py` (register / PartCtx / validate) and, for
engines, `mfkit/engine_common.py`. `parts_structures.py::gen_adapter` is the worked example.

## Generator contract

```python
def gen_something(ctx):          # called once per LOD (ctx.lod is 0 or 1)
    mb = ctx.mesh()              # MeshBuilder; ctx.mesh("half_a") for separable sub-objects
    ...
    ctx.empty("attach_top", (0, 0, length))
    ctx.meta.update(length_m=..., diameter_bottom_m=..., diameter_top_m=..., ...)

register("part_id", "family", gen_something, "7.x", **params)   # params -> ctx.params
```

- Units metres, +Z up (stack axis), +Y forward. Origin = centre of the bottom mating ring.
  All geometry has z >= 0. Stack parts (everything except boosters) keep all geometry within
  0 <= z <= length_m and the outer skin radius at z = 0 and z = length_m is exactly the stack
  radius (validation tolerance 3 mm). Raised detail (stringers, raceways, bolts, pods) must
  stay at least 0.02 m away from both end planes and must not exceed the skin radius there.
- Material slots, by name only: `hull`, `livery`, `engine_metal`, `nozzle_hot`, `thermal`,
  `detail_dark`. No other materials, no textures. `nozzle_hot` faces carry the heat mask
  (the `heat=` argument, 0..1).
- LOD: use `mb.seg(n)` for radial segments and `mb.steps(n)` for lengthwise steps, and wrap
  small detail (bolts, thin pipes, ribs) in `if mb.want(0):` so LOD1 drops it. LOD0 must be
  at most 30 000 triangles; LOD1 is cut to 30 % automatically (procedural reduction first,
  decimation only as a fallback, so make LOD1 naturally light).
- Normals: lathe profiles face to the RIGHT of the travel direction in the r-z plane.
  Bottom->top faces outward. Open shells need an inner wall (top->bottom) or they look
  see-through from inside. Hard edges appear automatically at profile corners sharper than
  `crease` degrees.
- meta: always `length_m`, `diameter_bottom_m`, `diameter_top_m`; add `stack=False` or
  `ring_check=False` only where the brief for that family says so; add a `value_types` dict
  tagging numbers `physical`, `real_world_approximate` or `game_value`.

## Test loop (headless; the live Blender session belongs to the lead agent)

    BL=/Applications/Blender.app/Contents/MacOS/Blender
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- preview 'eng_kerolox_*' --views 3q,side,low --size 640 2>&1 | grep -E "PART|ISSUE|DONE|Error|Traceback|File |line "

Views: 3q, side, front, back3q, low, under, top, high. `--lod 1` shows LOD1. Output:
`assets/blender/_build/preview/<id>.png` (git-ignored). Open it and look at it. A part is
done when it prints no ISSUE line, the render looks like release-quality stylised realism
(clean silhouette, believable engineering detail, no z-fighting, no inside-out faces, no
floating pieces) and LOD1 still reads as the same part.
