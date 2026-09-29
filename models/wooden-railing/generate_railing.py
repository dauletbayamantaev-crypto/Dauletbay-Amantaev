"""
Wooden balustrade (U-shaped railing) generator for Unity / VR.

Builds the railing procedurally with Blender's Python API, bakes a tileable
cherry-wood texture set with numpy and exports a Unity-ready FBX
(1 unit = 1 metre, Y-up, no rotation/scale on import, textures embedded).

Run with the Blender Python module (pip install bpy==4.2.0):
    python3 generate_railing.py [--out DIR] [--render]
or inside Blender:
    blender -b -P generate_railing.py -- [--out DIR] [--render]
"""
import argparse
import math
import os
import random
import sys

import bpy  # must be imported before bmesh when running as a module
import bmesh
import numpy as np
from mathutils import Vector

# ---------------------------------------------------------------- dimensions (m)
H = 0.95        # floor -> top of handrail
BASE_H = 0.04   # bottom rail height
BASE_W = 0.12   # bottom rail width
RAIL_H = 0.055  # handrail thickness
RAIL_W = 0.12   # handrail width
POST_W = 0.09   # newel post width
BAL_W = 0.058   # baluster block width
GAP = 0.095     # clear gap between balusters (kept under 0.1 m)
N_FRONT = 10    # balusters on the front span
N_SIDE = 8      # balusters on each side span
UV_M = 0.8      # metres of wood covered by one texture tile
TEX_SIZE = 2048
WOOD_LIGHT = "#4A2F2A"  # main wood tone
WOOD_DARK = "#331F19"   # grain lines
SEED = 7

BAL_Z0 = BASE_H
BAL_Z1 = H - RAIL_H
POST_A = (N_FRONT * BAL_W + (N_FRONT + 1) * GAP + POST_W) / 2   # x of post centres
DEPTH = N_SIDE * BAL_W + (N_SIDE + 1) * GAP + POST_W            # front->back post spacing
Y_FRONT = -DEPTH / 2
Y_BACK = DEPTH / 2


# ---------------------------------------------------------------- textures
def periodic_noise(n, sx, sy, rng):
    """Tileable gaussian noise; sx/sy = frequency cut-off (cycles per tile)."""
    f = np.fft.fft2(rng.standard_normal((n, n)))
    fr = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(fr, fr)
    out = np.real(np.fft.ifft2(f * np.exp(-((fx / sx) ** 2 + (fy / sy) ** 2))))
    out -= out.mean()
    return out / (out.std() + 1e-9)


def hex_rgb(h):
    h = h.lstrip("#")
    return [float(int(h[i:i + 2], 16)) for i in (0, 2, 4)]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def make_wood_textures(outdir, n=TEX_SIZE):
    """Dark wood (WOOD_LIGHT -> WOOD_DARK) with the grain running along V. Returns (albedo, normal) paths."""
    from PIL import Image

    rng = np.random.default_rng(SEED)
    x = np.arange(n)[None, :] / n
    warp = 3.0 * periodic_noise(n, 1.5, 0.8, rng) + 0.6 * periodic_noise(n, 5.0, 2.0, rng)
    phase = 90 * x + warp
    g = phase - np.floor(phase)
    line = smoothstep(0.55, 1.0, g) ** 3                 # fine latewood lines
    fig_phase = 14 * x + 4.5 * periodic_noise(n, 1.2, 0.7, rng)
    figure = smoothstep(0.5, 1.0, fig_phase - np.floor(fig_phase)) ** 2   # soft cathedral figure
    streak = periodic_noise(n, 30.0, 1.2, rng)           # colour bands along the grain
    fib = periodic_noise(n, 400.0, 6.0, rng)             # long fibres
    pores = smoothstep(2.2, 3.2, periodic_noise(n, 700.0, 50.0, rng))
    big = periodic_noise(n, 3.0, 2.0, rng)               # board-to-board variation

    t = 0.12 * figure + 0.26 * line + 0.18 * streak * 0.35 + 0.05 * fib
    lo, hi = np.percentile(t, (1.0, 99.5))
    t = np.clip((t - lo) / (hi - lo), 0.0, 1.0)          # span exactly WOOD_LIGHT..WOOD_DARK
    light = np.array(hex_rgb(WOOD_LIGHT))
    dark = np.array(hex_rgb(WOOD_DARK))
    col = light * (1 - t[..., None]) + dark * t[..., None]
    col *= (1 + 0.02 * np.clip(big, -2, 2))[..., None]    # subtle board-to-board variation
    col = col * (1 - 0.3 * pores[..., None]) + dark * 0.3 * pores[..., None]
    albedo = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB")

    height = -0.5 * line - 0.3 * figure - 0.1 * fib - 0.8 * pores
    du = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
    dv = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2   # rows run top->bottom
    s = 0.6
    nrm = np.dstack([-s * du, -s * dv, np.ones_like(du)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    normal = Image.fromarray(((nrm * 0.5 + 0.5) * 255).round().astype(np.uint8), "RGB")

    tdir = os.path.join(outdir, "Textures")
    os.makedirs(tdir, exist_ok=True)
    p_alb = os.path.join(tdir, "Wood_Cherry_BaseColor.jpg")
    p_nrm = os.path.join(tdir, "Wood_Cherry_Normal.png")
    albedo.save(p_alb, quality=92)
    normal.save(p_nrm, optimize=True)
    return p_alb, p_nrm


def make_materials(p_alb, p_nrm):
    wood = bpy.data.materials.new("Wood_Cherry")
    wood.use_nodes = True
    nt = wood.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(p_alb)
    # exported as the FBX DiffuseColor; Unity multiplies it with the texture
    bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    ntex = nt.nodes.new("ShaderNodeTexImage")
    ntex.image = bpy.data.images.load(p_nrm)
    ntex.image.colorspace_settings.name = "Non-Color"
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.6
    nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.32

    metal = bpy.data.materials.new("Metal_Screw")
    metal.use_nodes = True
    b = metal.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.72, 0.72, 0.74, 1.0)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.28
    return wood, metal


# ---------------------------------------------------------------- mesh helpers
def uv_of(u, v, off):
    return ((u + off[0]) / UV_M, (v + off[1]) / UV_M)


def mark_sharp(bm, a, b):
    e = bm.edges.get((a, b))
    if e:
        e.smooth = False


def baluster_rows():
    """Square-section profile as (t, w, hard): t = 0..1 along the length,
    w = half-width relative to the plain block."""
    rows = []

    def p(t, w, hard=True):
        rows.append((t, w, hard))

    groove = 0.76

    def rings(t0, count=3, h=0.032):
        for _ in range(count):
            p(t0, 1.0)                 # step out of the groove
            p(t0 + 0.6 * h, 1.0)
            p(t0 + h, groove)          # chamfered top of the ring
            t0 += h
        return t0

    def curve(t0, w0, t1, w1, flat_end, n=10, hard_end=False):
        for i in range(1, n + 1):
            s = i / n
            k = 1 - (1 - s) ** 2 if flat_end else s ** 1.8
            p(t0 + (t1 - t0) * s, w0 + (w1 - w0) * k, hard_end and i == n)

    p(0.0, 0.90)
    p(0.012, 1.0)
    p(0.105, 1.0)
    p(0.12, groove)
    t = rings(0.12)
    p(t + 0.016, 1.0)
    curve(t + 0.016, 1.0, 0.35, 0.60, flat_end=True)
    curve(0.35, 0.60, 0.575, 1.12, flat_end=False, n=14, hard_end=True)
    curve(0.575, 1.12, 0.70, 0.60, flat_end=True)
    curve(0.70, 0.60, 0.772, 1.0, flat_end=False, n=8, hard_end=True)
    p(0.788, groove)
    t = rings(0.788)
    p(t, 1.0)
    p(1.0, 1.0)
    return rows


CORNERS = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
SIDE_T = [(-1, 0), (0, -1), (1, 0), (0, 1)]   # horizontal tangent of each side


def add_baluster(bm, uvl, cx, cy, rows, off):
    hw0 = BAL_W / 2
    L = BAL_Z1 - BAL_Z0
    ring = []
    for t, w, _ in rows:
        z = BAL_Z0 + t * L
        ring.append([bm.verts.new((cx + sx * w * hw0, cy + sy * w * hw0, z)) for sx, sy in CORNERS])
    for i in range(len(rows) - 1):
        for k in range(4):
            k2 = (k + 1) % 4
            f = bm.faces.new((ring[i][k], ring[i][k2], ring[i + 1][k2], ring[i + 1][k]))
            f.smooth = True
            tx, ty = SIDE_T[k]
            for lp in f.loops:
                co = lp.vert.co
                lp[uvl].uv = uv_of((co.x - cx) * tx + (co.y - cy) * ty + 0.17 * k, co.z, off)
    for verts, rev in ((ring[0], True), (ring[-1], False)):
        f = bm.faces.new(verts[::-1] if rev else verts)
        f.smooth = True
        for lp in f.loops:
            lp[uvl].uv = uv_of(lp.vert.co.x, lp.vert.co.y, off)
    for i, (_, _, hard) in enumerate(rows):
        for k in range(4):
            if i + 1 < len(rows):
                mark_sharp(bm, ring[i][k], ring[i + 1][k])
            if hard or i in (0, len(rows) - 1):
                mark_sharp(bm, ring[i][k], ring[i][(k + 1) % 4])


def rounded_profile(half_w, height, radius, lower):
    """Closed CCW profile (u, z, hard) with rounded top corners.
    `lower` lists (u, z, hard) points of the right-hand side below the round,
    from the bottom up; the left side mirrors them."""
    right = list(lower)
    cx, cz = half_w - radius, height - radius
    arc = []
    for i in range(7):
        a = math.radians(90 * i / 6)
        arc.append((cx + radius * math.cos(a), cz + radius * math.sin(a), False))
    right += arc
    left = [(-u, z, h) for u, z, h in reversed(right)]
    return right + left


def handrail_profile():
    lower = [(0.050, 0.000, True), (0.050, 0.010, True), (0.060, 0.016, True)]
    return rounded_profile(RAIL_W / 2, RAIL_H, 0.017, lower)


def base_profile():
    lower = [(BASE_W / 2, 0.000, True)]
    return rounded_profile(BASE_W / 2, BASE_H, 0.015, lower)


def add_sweep(bm, uvl, path, profile, z0, off):
    """Sweep a closed profile along an open 2D polyline with mitred corners."""
    P = [Vector((x, y, 0.0)) for x, y in path]
    n = len(P)
    dirs = [(P[i + 1] - P[i]).normalized() for i in range(n - 1)]
    left = [Vector((-d.y, d.x, 0.0)) for d in dirs]
    rings = []
    for i in range(n):
        if i == 0:
            m, sc = left[0], 1.0
        elif i == n - 1:
            m, sc = left[-1], 1.0
        else:
            m = (left[i - 1] + left[i]).normalized()
            sc = 1.0 / m.dot(left[i - 1])
        rings.append([bm.verts.new(P[i] + m * (sc * u) + Vector((0, 0, z0 + z))) for u, z, _ in profile])

    K = len(profile)
    arc = [0.0]
    for k in range(1, K + 1):
        a, b = profile[k - 1], profile[k % K]
        arc.append(arc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))

    cum = 0.0
    for j in range(n - 1):
        for k in range(K):
            k2 = (k + 1) % K
            f = bm.faces.new((rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k]))
            f.smooth = True
            us = {rings[j][k]: arc[k], rings[j + 1][k]: arc[k],
                  rings[j][k2]: arc[k + 1], rings[j + 1][k2]: arc[k + 1]}
            for lp in f.loops:
                v = (lp.vert.co - P[j]).dot(dirs[j]) + cum
                lp[uvl].uv = uv_of(us[lp.vert], v, off)
        cum += (P[j + 1] - P[j]).length
        for k in range(K):
            if profile[k][2]:
                mark_sharp(bm, rings[j][k], rings[j + 1][k])

    # every ring is either a mitre or borders an end cap
    for ring in rings:
        for k in range(K):
            mark_sharp(bm, ring[k], ring[(k + 1) % K])

    caps = [bm.faces.new(rings[0][::-1]), bm.faces.new(rings[-1])]
    for f, d in zip(caps, (left[0], left[-1])):
        f.smooth = True
        for lp in f.loops:
            lp[uvl].uv = uv_of(lp.vert.co.dot(d), lp.vert.co.z, off)
    bmesh.ops.triangulate(bm, faces=caps)


def add_lathe(bm, prof, seg, center, smooth=True, uvl=None):
    """Closed surface of revolution around Z; prof = [(r, z)] from bottom pole to top pole."""
    cx, cy, cz = center
    rings = []
    for r, z in prof:
        if r < 1e-9:
            rings.append([bm.verts.new((cx, cy, cz + z))] * seg)
        else:
            rings.append([bm.verts.new((cx + r * math.cos(2 * math.pi * i / seg),
                                        cy + r * math.sin(2 * math.pi * i / seg), cz + z))
                          for i in range(seg)])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(seg):
            i2 = (i + 1) % seg
            quad = [a[i], a[i2], b[i2], b[i]]
            verts = [v for j, v in enumerate(quad) if v not in quad[:j]]
            f = bm.faces.new(verts)
            f.smooth = smooth
            if uvl is not None:
                for lp in f.loops:
                    lp[uvl].uv = (lp.vert.co.x * 20, lp.vert.co.y * 20)


def bm_to_object(bm, name, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = ob.name
    bpy.data.meshes.remove(old)


def harden_normals(ob):
    """Weighted normals keep large flat faces flat next to bevels / rounds."""
    mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.keep_sharp = True
    bake_modifiers(ob)


# ---------------------------------------------------------------- parts
def baluster_positions():
    pitch = BAL_W + GAP
    pos = []
    start = -POST_A + POST_W / 2 + GAP + BAL_W / 2
    pos += [(start + i * pitch, Y_FRONT) for i in range(N_FRONT)]
    start = Y_FRONT + POST_W / 2 + GAP + BAL_W / 2
    for sx in (-1, 1):
        pos += [(sx * POST_A, start + i * pitch) for i in range(N_SIDE)]
    return pos


def rail_path(extra):
    return [(-POST_A, Y_BACK + extra), (-POST_A, Y_FRONT), (POST_A, Y_FRONT), (POST_A, Y_BACK + extra)]


def build_balusters(wood, rnd):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    rows = baluster_rows()
    for x, y in baluster_positions():
        add_baluster(bm, uvl, x, y, rows, (rnd.random(), rnd.random()))
    ob = bm_to_object(bm, "Balusters", [wood])
    harden_normals(ob)
    return ob


def build_rails(wood, rnd):
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    add_sweep(bm, uvl, rail_path(RAIL_W / 2), handrail_profile(), H - RAIL_H, (rnd.random(), rnd.random()))
    hand = bm_to_object(bm, "Handrail", [wood])
    harden_normals(hand)

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    add_sweep(bm, uvl, rail_path(BASE_W / 2), base_profile(), 0.0, (rnd.random(), rnd.random()))
    base = bm_to_object(bm, "BaseRail", [wood])
    harden_normals(base)
    return hand, base


POST_CENTRES = [(-POST_A, Y_FRONT), (POST_A, Y_FRONT), (-POST_A, Y_BACK), (POST_A, Y_BACK)]


def build_posts(wood, rnd):
    z0, z1 = BASE_H, H - RAIL_H
    bm = bmesh.new()
    for cx, cy in POST_CENTRES:
        res = bmesh.ops.create_cube(bm, size=1.0)
        vs = res["verts"]
        for v in vs:
            v.co = Vector((cx + v.co.x * POST_W, cy + v.co.y * POST_W, z0 + (v.co.z + 0.5) * (z1 - z0)))
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.003, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    posts = bm_to_object(bm, "Posts", [wood])

    # fluting: three stopped flutes per face with a drilled dot below each
    r, depth = 0.0042, 0.0028
    f_lo, f_hi = z0 + 0.11, z1 - 0.075
    capsule = [(0.0, -r)]
    capsule += [(r * math.sin(math.radians(a)), -r * math.cos(math.radians(a))) for a in range(30, 90, 30)]
    capsule += [(r, 0.0), (r, f_hi - f_lo)]
    capsule += [(r * math.cos(math.radians(a)), f_hi - f_lo + r * math.sin(math.radians(a))) for a in range(30, 90, 30)]
    capsule += [(0.0, f_hi - f_lo + r)]
    dot_r = 0.003
    dot = [(0.0, -dot_r)] + [(dot_r * math.sin(math.radians(a)), -dot_r * math.cos(math.radians(a)))
                              for a in range(30, 180, 30)] + [(0.0, dot_r)]
    cbm = bmesh.new()
    for cx, cy in POST_CENTRES:
        for nx, ny in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            for s in (-0.021, 0.0, 0.021):
                tx, ty = -ny, nx
                ax = cx + nx * (POST_W / 2 + r - depth) + tx * s
                ay = cy + ny * (POST_W / 2 + r - depth) + ty * s
                add_lathe(cbm, capsule, 16, (ax, ay, f_lo), smooth=False)
                dx = cx + nx * (POST_W / 2 + dot_r - 0.0024) + tx * s
                dy = cy + ny * (POST_W / 2 + dot_r - 0.0024) + ty * s
                add_lathe(cbm, dot, 12, (dx, dy, f_lo - r - 0.016), smooth=False)
    cutter = bm_to_object(cbm, "FluteCutter", [])
    mod = posts.modifiers.new("Flutes", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bake_modifiers(posts)
    bpy.data.objects.remove(cutter)

    me = posts.data
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(40))
    # box-projected UVs, grain vertical on the side faces
    uv = me.uv_layers.new(name="UVMap")
    offs = {c: (rnd.random(), rnd.random()) for c in POST_CENTRES}
    for p in me.polygons:
        c = min(POST_CENTRES, key=lambda q: (p.center.x - q[0]) ** 2 + (p.center.y - q[1]) ** 2)
        nx, ny, nz = (abs(a) for a in p.normal)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if nz >= max(nx, ny):
                u, v = co.x, co.y
            elif nx >= ny:
                u, v = co.y + 0.3, co.z
            else:
                u, v = co.x, co.z
            uv.data[li].uv = uv_of(u, v, offs[c])
    harden_normals(posts)
    return posts


def build_screws(metal):
    """Small domed screw heads on the bottom rail next to each post."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    prof = [(0.0, 0.0), (0.0055, 0.0), (0.0055, 0.0008)]
    prof += [(0.0055 * math.cos(math.radians(a)), 0.0008 + 0.0014 * math.sin(math.radians(a)))
             for a in range(20, 90, 20)]
    prof += [(0.0, 0.0022)]
    d = POST_W / 2 + 0.028
    spots = [(-POST_A + d, Y_FRONT), (POST_A - d, Y_FRONT)]
    for sx in (-1, 1):
        spots += [(sx * POST_A, Y_FRONT + d), (sx * POST_A, Y_BACK - d)]
    for x, y in spots:
        add_lathe(bm, prof, 16, (x, y, BASE_H - 0.0002), uvl=uvl)
    ob = bm_to_object(bm, "Screws", [metal])
    ob.data.set_sharp_from_angle(angle=math.radians(50))
    return ob


# ---------------------------------------------------------------- export / preview
def export_fbx(path):
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=False,
        object_types={"EMPTY", "MESH"},
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL",   # Unity: scale 1, 1 unit = 1 m
        axis_forward="-Z",
        axis_up="Y",
        bake_space_transform=True,             # Unity: no -90 deg X rotation
        use_mesh_modifiers=True,
        mesh_smooth_type="OFF",                # export split normals
        use_triangles=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="COPY",
        embed_textures=True,
    )


def look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(path, cam_loc, target, lens=50, res=(1400, 1120), samples=96):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.view_settings.view_transform = "Standard"

    if scene.camera is None:
        world = bpy.data.worlds.new("World")
        world.use_nodes = True
        wt = world.node_tree
        light_bg = wt.nodes["Background"]           # soft fill light, dim so dark wood keeps its colour
        light_bg.inputs["Strength"].default_value = 0.3
        cam_bg = wt.nodes.new("ShaderNodeBackground")  # plain white backdrop seen by the camera
        mix = wt.nodes.new("ShaderNodeMixShader")
        ray = wt.nodes.new("ShaderNodeLightPath")
        wt.links.new(ray.outputs["Is Camera Ray"], mix.inputs["Fac"])
        wt.links.new(light_bg.outputs["Background"], mix.inputs[1])
        wt.links.new(cam_bg.outputs["Background"], mix.inputs[2])
        wt.links.new(mix.outputs["Shader"], wt.nodes["World Output"].inputs["Surface"])
        scene.world = world
        sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
        sun.data.energy = 3.5
        sun.data.angle = math.radians(8)
        sun.rotation_euler = (math.radians(40), 0, math.radians(-35))
        scene.collection.objects.link(sun)
        bpy.ops.mesh.primitive_plane_add(size=20)
        bpy.context.active_object.is_shadow_catcher = True
        cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
        scene.collection.objects.link(cam)
        scene.camera = cam
    cam = scene.camera
    cam.data.lens = lens
    cam.location = cam_loc
    look_at(cam, target)
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
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    rnd = random.Random(SEED)

    wood, metal = make_materials(*make_wood_textures(args.out))
    root = bpy.data.objects.new("WoodenRailing", None)
    bpy.context.scene.collection.objects.link(root)
    parts = [*build_rails(wood, rnd), build_posts(wood, rnd), build_balusters(wood, rnd), build_screws(metal)]
    for ob in parts:
        ob.parent = root

    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in parts)
    print(f"[railing] parts={[o.name for o in parts]} triangles={tris}")
    print(f"[railing] footprint {2 * POST_A + RAIL_W:.3f} x {DEPTH + RAIL_W:.3f} m, height {H:.2f} m")

    fbx = os.path.join(args.out, "WoodenRailing.fbx")
    export_fbx(fbx)
    print(f"[railing] exported {fbx}")

    if args.render:
        render_preview(os.path.join(args.out, "preview_front.png"), (1.25, -3.3, 1.75), (0.0, 0.1, 0.42))
        render_preview(os.path.join(args.out, "preview_back.png"), (-2.2, 2.6, 1.9), (0.0, -0.1, 0.4),
                       res=(1400, 1000), samples=64)


if __name__ == "__main__":
    main()
