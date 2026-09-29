"""
Wooden lectern (speaker's podium) generator for Unity / VR.

Moulded plinth, box body with a picture-frame moulding on the front, and a
reading desk with a crested front apron, raked side boards, a sloped reading
surface and a back lip that stops papers sliding off. Wood texture uses the
given palette: main tone WOOD_LIGHT, grain lines WOOD_DARK (embedded in FBX).

Run with the Blender Python module (pip install bpy==4.2.0 numpy pillow):
    python3 generate_lectern.py [--out DIR] [--render]
or inside Blender:
    blender -b -P generate_lectern.py -- [--out DIR] [--render]
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
SEED = 5

# ---------------------------------------------------------------- dimensions (m), Y up, front = +Z
BASE = (0.70, 0.075, 0.56)          # plinth width, height, depth
BODY = (0.50, 0.40)                 # body width, depth
DESK_Y = 1.01                       # underside of the reading desk
DESK = (0.65, 0.50)                 # desk width (incl. side boards), depth
BOARD = 0.02                        # desk board thickness
APRON_TOP = 1.15                    # front apron height at its ends
CREST = 0.045                       # crest rise at the centre
CREST_HALF = 0.21                   # crest half-width incl. its S-curves
READ_FRONT, READ_BACK = 1.135, 1.045
SIDE_FRONT_TOP, SIDE_BACK_TOP = 1.175, 1.075
PANEL = (0.32, 0.39, 0.82)          # front moulding: width, bottom, top
MOULD_W = 0.022


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
    p_alb = os.path.join(tdir, "Lectern_Wood_BaseColor.jpg")
    p_nrm = os.path.join(tdir, "Lectern_Wood_Normal.png")
    albedo.save(p_alb, quality=92)
    normal.save(p_nrm, optimize=True)
    return p_alb, p_nrm


def make_material(p_alb, p_nrm):
    mat = bpy.data.materials.new("Lectern_Wood")
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


def sweep_closed(bm, uvl, path, normal, profile, off):
    """Moulding swept along a closed planar path (mitred corners); profile = [(u, h)] with
    u across the moulding (positive = left of travel) and h outward along `normal`."""
    P = [Vector(p) for p in path]
    n = len(P)
    dirs = [(P[(i + 1) % n] - P[i]).normalized() for i in range(n)]
    left = [normal.cross(d) for d in dirs]
    rings = []
    for i in range(n):
        lp, lc = left[i - 1], left[i]
        m = (lp + lc).normalized()
        sc = 1.0 / m.dot(lc)
        rings.append([bm.verts.new(P[i] + m * (sc * u) + normal * h) for u, h in profile])
    K = len(profile)
    arc = [0.0]
    for k in range(1, K):
        arc.append(arc[-1] + math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]))
    cum = 0.0
    faces = []
    for j in range(n):
        ra, rb = rings[j], rings[(j + 1) % n]
        for k in range(K - 1):
            f = bm.faces.new((ra[k], ra[k + 1], rb[k + 1], rb[k]))
            f.smooth = True
            faces.append(f)
            for lp_, kk in zip(f.loops, (k, k + 1, k + 1, k)):
                v = (lp_.vert.co - P[j]).dot(dirs[j]) + cum
                lp_[uvl].uv = ((arc[kk] + off[0]) / UV_M, (v + off[1]) / UV_M)
        cum += (P[(j + 1) % n] - P[j]).length
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    for f in faces:                                     # keep the moulding facing outward
        f.normal_update()
    if sum(f.normal.dot(normal) for f in faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=faces)


def crest_outline():
    """Front apron outline in (x, y), counter-clockwise seen from the front."""
    hw = DESK[0] / 2 - BOARD
    flat = CREST_HALF
    top = []
    for i in range(0, 41):                               # left to right along the top edge
        x = -flat + 2 * flat * i / 40
        s = abs(x) / flat
        # raised cosine arch with S-shaped shoulders
        y = APRON_TOP + CREST * (0.5 + 0.5 * math.cos(math.pi * min(1.0, s ** 1.35)))
        top.append((x, y))
    pts = [(-hw, DESK_Y), (hw, DESK_Y), (hw, APRON_TOP)]
    pts += list(reversed(top))
    pts += [(-hw, APRON_TOP)]
    return pts


def build(mat):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    bw, bh, bd = BASE
    W, D = BODY
    dw, dd = DESK

    # plinth: vertical face, a turned groove line, rounded top band
    base = Part(bm, uvl, 0, (0.13, 0.71))
    base.rings([(0.002, 0.0), (0.0, 0.002), (0.0, 0.058), (0.003, 0.0605), (0.0, 0.063), (0.0, 0.069),
                (0.0015, 0.0725), (0.0045, 0.0745), (0.0075, bh)], bw / 2, bd / 2, 0.006)
    base.finish()

    body = Part(bm, uvl, 1, (0.52, 0.05))
    body.box((-W / 2, bh - 0.002, -D / 2), (W / 2, DESK_Y + 0.002, D / 2), bevel=0.0025)
    body.finish()

    # front picture-frame moulding
    pw, py0, py1 = PANEL
    zf = D / 2 - 0.0005
    path = [(-pw / 2, py0, zf), (pw / 2, py0, zf), (pw / 2, py1, zf), (-pw / 2, py1, zf)]
    h = MOULD_W / 2
    prof = [(-h, 0.0), (-h, 0.004), (-h + 0.003, 0.009), (-h + 0.008, 0.012), (-h + 0.013, 0.0115),
            (h - 0.004, 0.007), (h - 0.002, 0.0045), (h, 0.003), (h, 0.0)]
    sweep_closed(bm, uvl, path, Vector((0, 0, 1)), prof, (0.33, 0.9))

    # reading desk
    desk = Part(bm, uvl, 0, (0.61, 0.27))
    inner = dw / 2 - BOARD
    desk.box((-inner, DESK_Y, -dd / 2 + BOARD), (inner, DESK_Y + 0.018, dd / 2 - BOARD))       # bottom board
    ytop = lambda z: READ_BACK + (z + (dd / 2 - BOARD)) * (READ_FRONT - READ_BACK) / (dd - 2 * BOARD)
    zb, zf2 = -dd / 2 + BOARD, dd / 2 - BOARD
    desk.prism([(zb, ytop(zb) - 0.018), (zf2, ytop(zf2) - 0.018), (zf2, ytop(zf2)), (zb, ytop(zb))],
               0, -inner, inner, bevel=0.0015)                                                    # sloped reading board
    desk.box((-inner, DESK_Y + 0.018, -dd / 2), (inner, ytop(zb) + 0.022, -dd / 2 + BOARD))       # back lip
    desk.finish()

    apron = Part(bm, uvl, 0, (0.07, 0.44))
    apron.prism([(x, y) for x, y in crest_outline()], 2, dd / 2 - BOARD, dd / 2, bevel=0.003)
    apron.finish()

    sides = Part(bm, uvl, 2, (0.81, 0.19))
    outline = [(-dd / 2, DESK_Y), (dd / 2 + 0.005, DESK_Y), (dd / 2 + 0.005, SIDE_FRONT_TOP), (-dd / 2, SIDE_BACK_TOP)]
    for sx in (-1, 1):
        a0, a1 = sorted((sx * inner, sx * dw / 2))
        sides.prism(outline, 0, a0, a1, bevel=0.003)
    sides.finish()

    me = bpy.data.meshes.new("Lectern")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new("Lectern", me)
    bpy.context.scene.collection.objects.link(ob)
    me.set_sharp_from_angle(angle=math.radians(40))
    mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.keep_sharp = True
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = baked
    baked.name = "Lectern"
    bpy.data.meshes.remove(me)

    root = bpy.data.objects.new("LecternSet", None)
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
    for name, loc, energy, size in (("Key", (-1.4, -2.2, 2.6), 170, 1.6), ("Rim", (1.8, 1.4, 2.2), 70, 1.4)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = size
        light.location = loc
        look_at(light, (0, 0, 0.7))
        scene.collection.objects.link(light)
    bpy.ops.mesh.primitive_plane_add(size=12)
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
    print(f"[lectern] triangles={tris}")
    fbx = os.path.join(args.out, "Lectern.fbx")
    export_fbx(fbx)
    print(f"[lectern] exported {fbx}")

    if args.render:
        setup_preview_scene()
        render_preview(os.path.join(args.out, "preview_front.jpg"), (0.85, -2.7, 1.3), (0.0, 0.0, 0.64),
                       50, (1000, 1400), 128)
        render_preview(os.path.join(args.out, "preview_back.jpg"), (-1.3, 2.2, 1.75), (0.0, 0.0, 0.8),
                       50, (1100, 1200), 96)


if __name__ == "__main__":
    main()
