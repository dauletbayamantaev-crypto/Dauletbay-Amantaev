"""
Judge's gavel and sound block generator for Unity / VR.

Two separate objects so the gavel can be picked up and struck on the block:
  Gavel       pivot at the grip point on the handle; local Z runs along the
              handle toward the head, local Y along the head (striking) axis.
  SoundBlock  pivot at the bottom centre.
Wood texture (grain along each part) uses the given palette: main tone
WOOD_LIGHT, grain lines WOOD_DARK. Textures are embedded in the FBX.

Run with the Blender Python module (pip install bpy==4.2.0 numpy pillow):
    python3 generate_gavel.py [--out DIR] [--render]
or inside Blender:
    blender -b -P generate_gavel.py -- [--out DIR] [--render]
"""
import argparse
import math
import os
import sys

import bpy  # must be imported before bmesh when running as a module
import bmesh
import numpy as np
from mathutils import Matrix, Vector

WOOD_LIGHT = "#4A2F2A"   # main wood tone
WOOD_DARK = "#331F19"    # grain lines
UV_M = 0.35              # metres of wood per texture tile (fine grain for a small object)
TEX_SIZE = 2048
SEED = 11

# ---------------------------------------------------------------- dimensions (m)
HEAD_BARREL_R = 0.0255
HEAD_BAND_R = 0.0284   # peak of the rounded end bands
HEAD_HALF = 0.065        # head length 130 mm
HANDLE_LEN = 0.287       # head axis -> tip of the knob
GRIP = 0.19              # grip point measured from the head axis along the handle
BLOCK = (0.17, 0.026, 0.11)   # sound block length (x), height (y), depth (z)
BLOCK_CORNER_R = 0.016
BLOCK_EDGE_R = 0.007
SEG = 40                 # segments around turned parts


# ---------------------------------------------------------------- textures
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
    p_alb = os.path.join(tdir, "Gavel_Wood_BaseColor.jpg")
    p_nrm = os.path.join(tdir, "Gavel_Wood_Normal.png")
    albedo.save(p_alb, quality=92)
    normal.save(p_nrm, optimize=True)
    return p_alb, p_nrm


def make_material(p_alb, p_nrm):
    mat = bpy.data.materials.new("Gavel_Wood")
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
    bsdf.inputs["Roughness"].default_value = 0.28          # lacquered finish
    return mat


# ---------------------------------------------------------------- geometry (Y-up local space)
def arc(p0, p1, bulge, n):
    """Points from p0 to p1 (r, h) bowed outward by `bulge` (m), excluding p0."""
    out = []
    for i in range(1, n + 1):
        s = i / n
        r = p0[0] + (p1[0] - p0[0]) * s + bulge * math.sin(math.pi * s)
        out.append((r, p0[1] + (p1[1] - p0[1]) * s))
    return out


def head_profile():
    """(r, h) along the head axis from one striking face to the other."""
    half = [(0.0, HEAD_HALF), (0.016, HEAD_HALF), (0.0172, HEAD_HALF - 0.0012),
            (0.0185, HEAD_HALF), (0.0235, HEAD_HALF - 0.0002)]                     # face with one turned ring
    half += arc((0.0235, HEAD_HALF), (0.0272, HEAD_HALF - 0.0035), 0.0012, 4)     # rounded face edge
    half += arc((0.0272, HEAD_HALF - 0.0035), (0.0272, 0.047), 0.0012, 8)          # wide end band
    half += [(0.0232, 0.0455), (0.0262, 0.044)]                                    # deep groove
    half += arc((0.0262, 0.044), (0.0262, 0.0395), 0.0010, 5)                      # thin bead
    half += [(0.0236, 0.038), (HEAD_BARREL_R, 0.0365)]                            # groove
    return [(r, -h) for r, h in half] + list(reversed(half))


def handle_profile():
    """(r, h) along the handle from inside the head (h = 0 on the head axis) to the knob tip."""
    p = [(0.0, 0.004), (0.0110, 0.005), (0.0110, 0.0262), (0.0128, 0.0264), (0.0128, 0.030)]
    p += arc((0.0128, 0.030), (0.0150, 0.0325), 0.0006, 3)
    p += arc((0.0150, 0.0325), (0.0150, 0.047), 0.0018, 7)                         # collar at the head
    p += [(0.0118, 0.0485), (0.0124, 0.0505)]
    p += [(0.0124, 0.092), (0.0114, 0.0935), (0.0132, 0.095)]
    p += arc((0.0132, 0.095), (0.0132, 0.109), 0.0018, 6)                          # middle ring
    p += [(0.0114, 0.1105), (0.0124, 0.112)]
    p += [(0.0122, 0.180), (0.0120, 0.255), (0.0104, 0.2565), (0.0112, 0.258)]     # shaft, groove
    c, r = 0.2715, 0.0155                                                          # ball knob
    start = math.asin(max(-1.0, min(1.0, (0.258 - c) / r)))
    for i in range(1, 11):
        a = start + (math.pi / 2 - start) * i / 10
        p.append((r * math.cos(a) if i < 10 else 0.0, c + r * math.sin(a)))
    return p


def lathe(bm, uvl, base, axis, ref, prof, seg, uv_r, uv_off):
    axis, ref = axis.normalized(), ref.normalized()
    n2 = axis.cross(ref)
    rings = []
    for r, h in prof:
        c = base + axis * h
        if r < 1e-9:
            rings.append([bm.verts.new(c)] * seg)
        else:
            rings.append([bm.verts.new(c + ref * (r * math.cos(2 * math.pi * i / seg))
                                        + n2 * (r * math.sin(2 * math.pi * i / seg))) for i in range(seg)])
    for k, (ra, rb) in enumerate(zip(rings[:-1], rings[1:])):
        for i in range(seg):
            j = (i + 1) % seg
            quad = [(ra[i], i, k), (ra[j], i + 1, k), (rb[j], i + 1, k + 1), (rb[i], i, k + 1)]
            uniq = [q for n, q in enumerate(quad) if q[0] not in [p[0] for p in quad[:n]]]
            f = bm.faces.new([q[0] for q in uniq])
            f.smooth = True
            f.normal_update()
            end_face = abs(f.normal.dot(axis)) > 0.7
            for lp, (_, col, row) in zip(f.loops, uniq):
                if end_face:            # planar mapping on the faces across the axis
                    d = lp.vert.co - base
                    u, v = d.dot(ref), d.dot(n2)
                else:                   # cylindrical mapping, grain along the axis
                    u, v = 2 * math.pi * uv_r * col / seg, prof[row][1]
                lp[uvl].uv = ((u + uv_off[0]) / UV_M, (v + uv_off[1]) / UV_M)


def rounded_rect(hx, hz, rc, y, seg=10):
    pts = []
    for cx, cz, a0 in ((hx - rc, hz - rc, 0), (-hx + rc, hz - rc, 90), (-hx + rc, -hz + rc, 180), (hx - rc, -hz + rc, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append(Vector((cx + rc * math.cos(a), y, cz + rc * math.sin(a))))
    return pts


def build_block(bm, uvl, off):
    L, H, Dp = BLOCK
    rows = [(0.0015, 0.0), (0.0, 0.0015), (0.0, H - BLOCK_EDGE_R)]
    for i in range(1, 8):
        a = math.radians(90 * i / 7)
        rows.append((BLOCK_EDGE_R * (1 - math.cos(a)), H - BLOCK_EDGE_R + BLOCK_EDGE_R * math.sin(a)))
    rings = [[bm.verts.new(p) for p in rounded_rect(L / 2 - d, Dp / 2 - d, BLOCK_CORNER_R - d, y)] for d, y in rows]
    n = len(rings[0])
    for ra, rb in zip(rings[:-1], rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ra[i], ra[j], rb[j], rb[i])).smooth = True
    caps = [bm.faces.new(rings[0][::-1]), bm.faces.new(rings[-1])]
    for f in caps:
        f.smooth = True
    bmesh.ops.triangulate(bm, faces=caps)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # closed shell: make every face point outward
    for f in bm.faces:              # box projection, grain along the block's length (x)
        f.normal_update()
        nx, ny, nz = (abs(c) for c in f.normal)
        for lp in f.loops:
            c = lp.vert.co
            if ny >= max(nx, nz):
                u, v = c.z, c.x
            elif nz >= nx:
                u, v = c.y, c.x
            else:
                u, v = c.z, c.y
            lp[uvl].uv = ((u + off[0]) / UV_M, (v + off[1]) / UV_M)


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = ob.name
    bpy.data.meshes.remove(old)


def to_object(bm, name, mat, parent):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    me.set_sharp_from_angle(angle=math.radians(40))
    mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.keep_sharp = True
    bake_modifiers(ob)
    return ob


def set_pose(ob, x_axis, y_axis, z_axis, loc):
    m = Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()
    m.translation = loc
    ob.matrix_basis = m


def rest_pose():
    """Gavel lying on the block like in the picture: head across the block, knob on the table."""
    head_c = Vector((0.0, BLOCK[1] + HEAD_BAND_R + 0.0004, -0.012))
    drop = head_c.y - 0.0155                       # knob centre rests on the table
    s = drop / 0.2715
    c = math.sqrt(1 - s * s)
    z_axis = Vector((0.0, s, -c))                  # grip -> head
    y_axis = Vector((1.0, 0.0, 0.0))               # head axis
    x_axis = y_axis.cross(z_axis)
    return x_axis, y_axis, z_axis, head_c - z_axis * GRIP


def strike_pose(lift=0.0):
    """Head upright over the block, lower face touching it (lift raises it)."""
    head_c = Vector((0.0, BLOCK[1] + HEAD_HALF + lift, -0.012))
    z_axis = Vector((0.0, 0.0, -1.0))
    y_axis = Vector((0.0, -1.0, 0.0))
    return y_axis.cross(z_axis), y_axis, z_axis, head_c - z_axis * GRIP


def build(mat):
    root = bpy.data.objects.new("JudgeGavelSet", None)
    bpy.context.scene.collection.objects.link(root)

    # gavel in its own frame: pivot = grip, +Z toward the head, head axis = Y
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    head_c = Vector((0, 0, GRIP))
    lathe(bm, uvl, head_c, Vector((0, 1, 0)), Vector((1, 0, 0)), head_profile(), SEG, HEAD_BAND_R, (0.13, 0.41))
    lathe(bm, uvl, head_c, Vector((0, 0, -1)), Vector((1, 0, 0)), handle_profile(), 32, 0.0125, (0.57, 0.08))
    gavel = to_object(bm, "Gavel", mat, root)

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    build_block(bm, uvl, (0.21, 0.66))
    block = to_object(bm, "SoundBlock", mat, root)

    set_pose(gavel, *rest_pose())
    root.rotation_euler = (math.pi / 2, 0, 0)      # children are stored Y-up; FBX export cancels this tilt
    return root, [gavel, block]


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
    key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "AREA"))
    key.data.energy = 16
    key.data.size = 0.6
    key.location = (-0.5, -0.6, 0.9)
    look_at(key, (0, 0, 0.03))
    scene.collection.objects.link(key)
    rim = bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "AREA"))
    rim.data.energy = 7
    rim.data.size = 0.5
    rim.location = (0.6, 0.5, 0.6)
    look_at(rim, (0, 0, 0.03))
    scene.collection.objects.link(rim)
    bpy.ops.mesh.primitive_plane_add(size=6)
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
    root, parts = build(mat)
    tris = sum(len(p.vertices) - 2 for ob in parts for p in ob.data.polygons)
    print(f"[gavel] parts={[o.name for o in parts]} triangles={tris}")
    fbx = os.path.join(args.out, "JudgeGavel.fbx")
    export_fbx(fbx)
    print(f"[gavel] exported {fbx}")

    if args.render:
        setup_preview_scene()
        render_preview(os.path.join(args.out, "preview_rest.jpg"), (-0.48, -0.36, 0.30), (0.02, -0.12, 0.03),
                       43, (1400, 1000), 128)
        set_pose(bpy.data.objects["Gavel"], *strike_pose(lift=0.05))
        render_preview(os.path.join(args.out, "preview_strike.jpg"), (-0.42, -0.62, 0.30), (0.06, 0.02, 0.10),
                       50, (1100, 1100), 128)


if __name__ == "__main__":
    main()
