GLB part models go here, one per part id: <part_id>.glb (under 2 MB each).
They are exported from assets/blender/. Until a model exists the phone shows
the built-in wireframe viewer for that part.

Texture provenance (T032): engine GLBs (eng_*.glb) embed one 512 px texture set on UV1
(albedo with AO, soot and decals; ORM; tangent normal) baked in Blender by
assets/blender/scripts/mfkit/phone_bake.py from the shared material library
assets/blender/materials/library.json. Every source is CC0 (ambientCG, Poly Haven) or
procedural, and the decal lettering uses Saira Stencil One (OFL); see
assets/blender/materials/THIRD_PARTY.md. No logos, flags or agency insignia.
