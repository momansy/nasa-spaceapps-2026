import os, sys
sys.path.insert(0, "/Users/yousofdiaa/Desktop/nasa-amek/assets/blender/scripts")
import bpy
from mfkit import pipeline, studio
scene = bpy.context.scene
pipeline.clear_scene(scene, keep_collection="")
studio.setup_studio(scene)
out = "/Users/yousofdiaa/Desktop/nasa-amek/assets/blender/_build/tmp_fb"
def region(name, lo, hi):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])], [], [])
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); return ob
shots = {
 "booster_heavy_solid": [("aft", (-2.6,-2.6,0), (2.6,2.6,7.5)), ("fwd", (-2.2,-2.2,35.5), (2.2,2.6,45.5))],
 "booster_small_solid": [("aft", (-1.1,-1.1,0), (1.1,1.1,3.6)), ("fwd", (-1.0,-1.0,13.5), (1.0,1.1,20))],
}
for pid, regs in shots.items():
    pipeline.clear_scene(scene)
    inst = pipeline.instantiate(pid, scene=scene)
    for o in inst["lod"][1]: o.hide_render = True
    for tag, lo, hi in regs:
        reg = region("reg", lo, hi)
        paths = []
        for i, v in enumerate([(0.8,-1.0,0.25), (0.9,0.7,0.15), (0.6,-0.8,-0.7)]):
            studio.frame_camera(scene, [reg], v)
            p = f"{out}/{pid}_{tag}_{i}.png"; studio.render_to(scene, p, 520, 520); paths.append(p)
        studio.stitch(paths, f"{out}/{pid}_{tag}.png")
        for p in paths: os.remove(p)
        bpy.data.objects.remove(reg, do_unlink=True)
