"""
Courtroom barrier (bar) with a witness stand in the middle, for Unity / VR.

Built from a partly cut-out photo; the hidden parts are completed the way such
joinery is built: slatted sections run down to a bottom rail, the witness-stand
piers and the back panel reach the floor on moulded plinths.

Layout (Y up, metres): the barrier runs along X, the witness stand opens toward
+Z (public side); the court is at -Z. Pivot on the floor at the centre of the
barrier line. Wood texture uses the given palette: main tone WOOD_LIGHT, grain
lines WOOD_DARK (embedded in FBX).

Run with the Blender Python module (pip install bpy==4.2.0 numpy pillow):
    python3 generate_barrier.py [--out DIR] [--render]
or inside Blender:
    blender -b -P generate_barrier.py -- [--out DIR] [--render]
"""
import argparse
import math
import os
import sys

import bpy  # must be imported before bmesh when running as a module
import bmesh
import numpy as np
from mathutils import Vector

WOOD_LIGHT = "#4A2F2A"   # main wood tone
WOOD_DARK = "#331F19"    # grain lines
UV_M = 1.0               # metres of wood per texture tile
TEX_SIZE = 2048
SEED = 9

# ---------------------------------------------------------------- dimensions (m)
POST = 0.30              # end posts, square
POST_H = 1.00            # post body height (cap sits on top)
CAP = (0.04, 0.06, 0.05) # cap overhang, cap board thickness, top block thickness
SECTION = 1.00           # each slatted section between a post and the stand
SLATS = 4                # slats per section
SLAT = (0.15, 0.05)      # slat width, depth
RAIL_TOP = 1.00          # top of the handrail board
PIER = (0.20, 0.66)      # witness-stand piers: width (x), depth (z)
PIER_Z0 = -0.11          # piers start at the court-side face of the rail
OPENING = 0.70           # clear opening between the piers
TRAY = (0.75, 0.62)      # desk tray width, depth (nearly square, as in the photo)
PLINTH = (0.09, 0.015)   # skirt height, projection

W_CENTER = OPENING + 2 * PIER[0]
LENGTH = 2 * POST + 2 * SECTION + W_CENTER
CAP_TOP = POST_H + CAP[1] + CAP[2]


# ---------------------------------------------------------------- textures (same recipe as the other props)
def periodic_noise(n, sx, sy, rng):
    f = np.fft.fft2(rng.standard_normal((n, n)))
    fr = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(fr, fr)
    out = np.real(np.fft.ifft2(f * np.exp(-((fx / sx) ** 2 + (fy / sy) ** 2))))
    out -= out.mean()
    return out / (out.std() + 1e-9)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def hex_rgb(h):
    h = h.lstrip("#")
    return [float(int(h[i:i + 2], 16)) for i in (0, 2, 4)]


def make_wood_textures(outdir, n=TEX_SIZE):
    """Tileable wood spanning exactly WOOD_LIGHT..WOOD_DARK, grain along V."""
    from PIL import Image

    rng = np.random.default_rng(SEED)
    x = np.arange(n)[None, :] / n
    warp = 3.0 * periodic_noise(n, 1.5, 0.8, rng) + 0.6 * periodic_noise(n, 5.0, 2.0, rng)
    phase = 90 * x + warp
    line = smoothstep(0.55, 1.0, phase - np.floor(phase)) ** 3
    fig_phase = 14 * x + 4.5 * periodic_noise(n, 1.2, 0.7, rng)
    figure = smoothstep(0.5, 1.0, fig_phase - np.floor(fig_phase)) ** 2
    streak = periodic_noise(n, 30.0, 1.2, rng)
    fib = periodic_noise(n, 400.0, 6.0, rng)
    pores = smoothstep(2.2, 3.2, periodic_noise(n, 700.0, 50.0, rng))
    big = periodic_noise(n, 3.0, 2.0, rng)

    t = 0.12 * figure + 0.26 * line + 0.18 * streak * 0.35 + 0.05 * fib
    lo, hi = np.percentile(t, (1.0, 99.5))
    t = np.clip((t - lo) / (hi - lo), 0.0, 1.0)
    light, dark = np.array(hex_rgb(WOOD_LIGHT)), np.array(hex_rgb(WOOD_DARK))
    col = light * (1 - t[..., None]) + dark * t[..., None]
    col *= (1 + 0.02 * np.clip(big, -2, 2))[..., None]
    col = col * (1 - 0.3 * pores[..., None]) + dark * 0.3 * pores[..., None]
    albedo = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB")

    height = -0.5 * line - 0.3 * figure - 0.1 * fib - 0.8 * pores
    du = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
    dv = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2
    nrm = np.dstack([-0.6 * du, -0.6 * dv, np.ones_like(du)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    normal = Image.fromarray(((nrm * 0.5 + 0.5) * 255).round().astype(np.uint8), "RGB")

    tdir = os.path.join(outdir, "Textures")
    os.makedirs(tdir, exist_ok=True)
    p_alb = os.path.join(tdir, "Barrier_Wood_BaseColor.jpg")
    p_nrm = os.path.join(tdir, "Barrier_Wood_Normal.png")
    albedo.save(p_alb, quality=92)
    normal.save(p_nrm, optimize=True)
    return p_alb, p_nrm


def make_material(p_alb, p_nrm):
    mat = bpy.data.materials.new("Barrier_Wood")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)   # FBX tint; the texture carries the colour
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(p_alb)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    ntex = nt.nodes.new("ShaderNodeTexImage")
    ntex.image = bpy.data.images.load(p_nrm)
    ntex.image.colorspace_settings.name = "Non-Color"
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.5
    nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.3        # satin lacquer
    return mat


# ---------------------------------------------------------------- geometry helpers
class Part:
    """Geometry of one wooden part; UVs follow the part's grain direction (0=x, 1=y, 2=z)."""

    def __init__(self, bm, uvl, grain, off):
        self.bm, self.uvl, self.grain, self.off = bm, uvl, grain, off
        self.faces = []

    def box(self, lo, hi, bevel=0.002):
        lo, hi = Vector(lo), Vector(hi)
        c, s = (lo + hi) / 2, hi - lo
        verts = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        for v in verts:
            v.co = Vector((c.x + v.co.x * s.x, c.y + v.co.y * s.y, c.z + v.co.z * s.z))
        faces = list({f for v in verts for f in v.link_faces})
        if bevel and min(s) > 2.5 * bevel:
            edges = list({e for v in verts for e in v.link_edges})
            res = bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=2, profile=0.5,
                                  affect="EDGES", clamp_overlap=True)
            faces = [f for f in faces if f.is_valid] + list(res["faces"])
        self.faces += faces

    def prism(self, outline, axis, a0, a1, bevel=0.002):
        """Extrude a polygon drawn in the plane perpendicular to `axis` (0=x, 2=z) from a0 to a1.
        outline: [(p, y)] where p is z for axis x, or x for axis z (counter-clockwise)."""
        def P(p, y, a):
            return Vector((a, y, p)) if axis == 0 else Vector((p, y, a))
        f0 = [self.bm.verts.new(P(p, y, a0)) for p, y in outline]
        f1 = [self.bm.verts.new(P(p, y, a1)) for p, y in outline]
        new = [self.bm.faces.new(f0), self.bm.faces.new(f1[::-1])]
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            new.append(self.bm.faces.new((f0[i], f1[i], f1[j], f0[j])))
        bmesh.ops.recalc_face_normals(self.bm, faces=new)
        if bevel:
            rim = list({e for f in new[:2] for e in f.edges})
            res = bmesh.ops.bevel(self.bm, geom=rim, offset=bevel, segments=2, profile=0.5,
                                  affect="EDGES", clamp_overlap=True)
            new = [f for f in new if f.is_valid] + list(res["faces"])
        tri = bmesh.ops.triangulate(self.bm, faces=[f for f in new if len(f.verts) > 4])
        self.faces += [f for f in new if f.is_valid] + list(tri["faces"])

    def rings(self, profile, half_x, half_z, corner):
        """Rounded-rectangle slab: profile = [(inset, y)] bottom to top."""
        def rr(hx, hz, rc, y, seg=4):
            pts = []
            for cx, cz, a0 in ((hx - rc, hz - rc, 0), (-hx + rc, hz - rc, 90), (-hx + rc, -hz + rc, 180),
                               (hx - rc, -hz + rc, 270)):
                for i in range(seg + 1):
                    a = math.radians(a0 + 90 * i / seg)
                    pts.append(self.bm.verts.new((cx + rc * math.cos(a), y, cz + rc * math.sin(a))))
            return pts
        rs = [rr(half_x - d, half_z - d, max(corner - d, 0.0015), y) for d, y in profile]
        new = []
        for ra, rb in zip(rs[:-1], rs[1:]):
            for i in range(len(ra)):
                j = (i + 1) % len(ra)
                new.append(self.bm.faces.new((ra[i], ra[j], rb[j], rb[i])))
        new += [self.bm.faces.new(rs[0][::-1]), self.bm.faces.new(rs[-1])]
        bmesh.ops.recalc_face_normals(self.bm, faces=new)
        tri = bmesh.ops.triangulate(self.bm, faces=new[-2:])
        self.faces += [f for f in new if f.is_valid] + list(tri["faces"])

    def finish(self):
        """Planar UVs per face with the grain along the part's grain axis."""
        g = self.grain
        for f in {f for f in self.faces if f.is_valid}:
            f.smooth = True
            f.normal_update()
            n = [abs(c) for c in f.normal]
            k = max(range(3), key=lambda i: n[i])          # projection axis
            a, b = [i for i in range(3) if i != k]
            if g == k:                                     # end grain: any in-plane mapping
                ua, va = a, b
            else:
                va = g
                ua = a if b == g else b
            for lp in f.loops:
                co = lp.vert.co
                lp[self.uvl].uv = ((co[ua] + self.off[0]) / UV_M, (co[va] + self.off[1]) / UV_M)



def plinth(part, x0, x1, z0, z1, faces="xz"):
    """Skirt board around the foot of a box (x0..x1, z0..z1)."""
    h, p = PLINTH
    part.box((x0 - p, 0.0, z0 - p), (x1 + p, h, z1 + p), bevel=0.004)


def cap(part, x0, x1, z0, z1):
    o, t1, t2 = CAP
    part.box((x0 - o, POST_H, z0 - o), (x1 + o, POST_H + t1, z1 + o), bevel=0.005)
    part.box((x0, POST_H + t1, z0), (x1, CAP_TOP, z1), bevel=0.006)


def build(mat):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    X0 = -LENGTH / 2
    xs_post = [(X0, X0 + POST), (-X0 - POST, -X0)]
    xs_pier = [(-W_CENTER / 2, -W_CENTER / 2 + PIER[0]), (W_CENTER / 2 - PIER[0], W_CENTER / 2)]
    pz0, pz1 = PIER_Z0, PIER_Z0 + PIER[1]

    # end posts and stand piers: vertical grain on the bodies, plinths and caps along x
    bodies = Part(bm, uvl, 1, (0.21, 0.4))
    trims = Part(bm, uvl, 0, (0.63, 0.12))
    for a, b in xs_post:
        bodies.box((a, PLINTH[0] - 0.01, -POST / 2), (b, POST_H, POST / 2), bevel=0.003)
        plinth(trims, a, b, -POST / 2, POST / 2)
        cap(trims, a, b, -POST / 2, POST / 2)
    for a, b in xs_pier:
        bodies.box((a, PLINTH[0] - 0.01, pz0), (b, POST_H, pz1), bevel=0.003)
        plinth(trims, a, b, pz0, pz1)
        cap(trims, a, b, pz0, pz1)

    # slatted sections: handrail (board + sub-rail), bottom rail, slats
    rails = Part(bm, uvl, 0, (0.37, 0.88))
    slats = Part(bm, uvl, 1, (0.09, 0.55))
    for s in (-1, 1):
        a = X0 + POST if s < 0 else W_CENTER / 2
        b = -W_CENTER / 2 if s < 0 else -X0 - POST
        rails.box((a, RAIL_TOP - 0.04, -0.11), (b, RAIL_TOP, 0.11), bevel=0.006)       # handrail board
        rails.box((a, RAIL_TOP - 0.10, -0.035), (b, RAIL_TOP - 0.04, 0.035))            # sub-rail
        rails.box((a, 0.0, -0.06), (b, 0.07, 0.06), bevel=0.004)                        # bottom rail
        gap = (SECTION - SLATS * SLAT[0]) / (SLATS + 1)
        for i in range(SLATS):
            x = a + gap + i * (SLAT[0] + gap)
            slats.box((x, 0.07, -SLAT[1] / 2), (x + SLAT[0], RAIL_TOP - 0.10, SLAT[1] / 2))

    # witness stand: back panel on the court side, kick board, riser under the tray
    stand = Part(bm, uvl, 0, (0.74, 0.31))
    ia, ib = xs_pier[0][1], xs_pier[1][0]
    stand.box((ia, 0.0, pz0), (ib, CAP_TOP, pz0 + 0.022))                                 # back panel
    stand.box((ia, 0.0, pz0 + 0.022), (ib, 0.09, pz0 + 0.04), bevel=0.003)               # kick board

    # desk tray on top: floor board, back board, S-curved side boards, low front lip
    tray = Part(bm, uvl, 0, (0.18, 0.62))
    tw, td = TRAY
    tz0 = pz0                                 # flush with the court-side back panel, no overhang
    tz1 = tz0 + td
    ty = CAP_TOP
    tray.box((-tw / 2, ty, tz0), (tw / 2, ty + 0.022, tz1), bevel=0.003)                 # floor board
    tray.box((-tw / 2 + 0.02, ty + 0.022, tz0), (tw / 2 - 0.02, ty + 0.21, tz0 + 0.02), bevel=0.003)   # back board
    tray.box((-tw / 2 + 0.02, ty + 0.022, tz1 - 0.02), (tw / 2 - 0.02, ty + 0.055, tz1), bevel=0.003)  # front lip
    front_h, back_h = 0.115, 0.21                            # side board height above the tray bottom
    side = [(tz0, ty + 0.022), (tz1, ty + 0.022), (tz1, ty + front_h)]
    for i in range(1, 25):                                   # top edge: level at the back, falling ever faster
        t = 1 - i / 24                                       # toward a half-height front end (t: 0 back .. 1 front)
        side.append((tz0 + (tz1 - tz0) * t, ty + back_h - (back_h - front_h) * t ** 1.7))
    sides = Part(bm, uvl, 2, (0.44, 0.07))
    for sx in (-1, 1):
        a0, a1 = sorted((sx * (tw / 2 - 0.02), sx * tw / 2))
        sides.prism(side, 0, a0, a1, bevel=0.003)

    for p in (bodies, trims, rails, slats, stand, tray, sides):
        p.finish()

    me = bpy.data.meshes.new("CourtBarrier")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new("CourtBarrier", me)
    bpy.context.scene.collection.objects.link(ob)
    me.set_sharp_from_angle(angle=math.radians(40))
    mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.keep_sharp = True
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = baked
    baked.name = "CourtBarrier"
    bpy.data.meshes.remove(me)

    root = bpy.data.objects.new("CourtBarrierSet", None)
    bpy.context.scene.collection.objects.link(root)
    ob.parent = root
    root.rotation_euler = (math.pi / 2, 0, 0)       # mesh is stored Y-up; FBX export cancels this tilt
    return root, ob


# ---------------------------------------------------------------- export / preview
def export_fbx(path):
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=False,
        object_types={"EMPTY", "MESH"},
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        bake_space_transform=False,
        use_mesh_modifiers=True,
        mesh_smooth_type="OFF",
        use_triangles=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="COPY",
        embed_textures=True,
    )


def look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()


def setup_preview_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    wt = world.node_tree
    fill = wt.nodes["Background"]
    fill.inputs["Color"].default_value = (1, 1, 1, 1)
    fill.inputs["Strength"].default_value = 0.12
    backdrop = wt.nodes.new("ShaderNodeBackground")
    backdrop.inputs["Color"].default_value = (1, 1, 1, 1)
    mix = wt.nodes.new("ShaderNodeMixShader")
    ray = wt.nodes.new("ShaderNodeLightPath")
    wt.links.new(ray.outputs["Is Camera Ray"], mix.inputs["Fac"])
    wt.links.new(fill.outputs["Background"], mix.inputs[1])
    wt.links.new(backdrop.outputs["Background"], mix.inputs[2])
    wt.links.new(mix.outputs["Shader"], wt.nodes["World Output"].inputs["Surface"])
    scene.world = world
    for name, loc, energy, size in (("Key", (-2.6, -3.6, 3.6), 380, 2.6), ("Rim", (3.2, 3.0, 3.0), 160, 2.2)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = size
        light.location = loc
        look_at(light, (0, 0, 0.6))
        scene.collection.objects.link(light)
    bpy.ops.mesh.primitive_plane_add(size=20)
    bpy.context.active_object.is_shadow_catcher = True
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(cam)
    scene.camera = cam


def render_preview(path, cam_loc, target, lens, res, samples):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.camera.data.lens = lens
    scene.camera.location = cam_loc
    look_at(scene.camera, target)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--render", action="store_true")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material(*make_wood_textures(args.out))
    root, ob = build(mat)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"[barrier] triangles={tris} length={LENGTH:.2f} m")
    fbx = os.path.join(args.out, "CourtBarrier.fbx")
    export_fbx(fbx)
    print(f"[barrier] exported {fbx}")

    if args.render:
        setup_preview_scene()
        render_preview(os.path.join(args.out, "preview_front.jpg"), (-3.3, -4.3, 2.15), (0.15, 0.0, 0.6),
                       36, (1600, 1000), 128)
        render_preview(os.path.join(args.out, "preview_court.jpg"), (3.2, 4.2, 2.2), (-0.1, 0.0, 0.6),
                       36, (1600, 1000), 96)


if __name__ == "__main__":
    main()
