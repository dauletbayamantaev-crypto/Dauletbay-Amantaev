"""
Modular steel-framed glass cage (courtroom dock / holding cell) generator for Unity / VR.

Walls and door leaves are glazed, the roof is expanded metal mesh, as on the
real enclosure. Fixes kept from the first reference picture: a door plate that
no longer overlaps the jamb, working hinges, an openable food hatch with hinge
and latch, and true rectangular geometry.

Doors, handles and hatches are separate objects whose pivots sit on their
real hinge / spindle axes, so they can be animated or grabbed in VR.

Run with the Blender Python module (pip install bpy==4.2.0):
    python3 generate_cage.py [--out DIR] [--render]
or inside Blender:
    blender -b -P generate_cage.py -- [--out DIR] [--render]
"""
import argparse
import math
import os
import sys

import bpy  # must be imported before bmesh when running as a module
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- dimensions (m)
TUBE = 0.05                 # 50x50 square tube of every panel frame
H_WALL = 2.25               # wall panels; the roof panels sit on top
ROOF_T = 0.05
FRONT_FIXED = 0.9           # fixed mesh panel left of the door
DOOR_BAY = 1.1              # door bay incl. its jamb frame
W = FRONT_FIXED + DOOR_BAY  # 2.0 m
SIDE_PANEL = 1.2
N_SIDE = 3
D = N_SIDE * SIDE_PANEL + 2 * TUBE   # 3.7 m
H_TOTAL = H_WALL + ROOF_T            # 2.3 m

LEAF_W0, LEAF_W1 = 0.005, 0.045      # door leaf depth inside the 50 mm wall
LEAF_STILE = 0.05
GAP = 0.006                          # leaf-to-jamb clearance
KICK_V0, KICK_V1 = 0.85, 1.10        # solid plate band across the leaf
HANDLE_V = 1.0
HATCH_U = 0.30                       # food / cuff hatch opening
HATCH_V0, HATCH_V1 = 0.915, 1.035
HINGE_R = 0.011
HINGE_KNUCKLE = 0.055

GLASS_T = 0.010                      # 10 mm glass, edges held inside the frame tubes
ROOF_LWD, ROOF_SWD = 0.072, 0.030    # expanded metal diamond (long / short way)
STRAND_W, STRAND_T = 0.0055, 0.0016
EDGE_BEVEL = 0.002

# colours measured from the reference picture (sRGB)
PAINT_HEX = "#A0A9B2"   # blue-grey powder coat of the frame
MESH_HEX = "#A9ACAF"    # neutral galvanised roof mesh
GLASS_HEX = "#F0F2F2"   # clear glass, no tint
GLASS_ALPHA = 0.2
STEEL_HEX = "#C8CACC"   # stainless handle / lock

PAINT, MESH, STEEL, GLASS = 0, 1, 2, 3


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_linear(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


# ---------------------------------------------------------------- geometry
def perpendicular(axis):
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    return axis.cross(ref).normalized()


class Builder:
    """Collects geometry in world space; faces carry a global material index."""

    def __init__(self):
        self.bm = bmesh.new()

    def box(self, lo, hi, mat=PAINT, bevel=EDGE_BEVEL):
        lo, hi = Vector(lo), Vector(hi)
        c, s = (lo + hi) / 2, hi - lo
        verts = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        for v in verts:
            v.co = Vector((c.x + v.co.x * s.x, c.y + v.co.y * s.y, c.z + v.co.z * s.z))
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = mat
        if bevel > 0 and min(s) > 2.5 * bevel:
            edges = list({e for v in verts for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=1, profile=0.5,
                            affect="EDGES", clamp_overlap=True)

    def ring_tube(self, a, b, n1, n2, mat):
        """Open tube between point a and b; n1, n2 are the half-axes of the cross-section
        and must satisfy n1 x n2 ~ (b - a) so faces point outward."""
        corners = self._section
        ra = [self.bm.verts.new(a + n1 * x + n2 * y) for x, y in corners]
        rb = [self.bm.verts.new(b + n1 * x + n2 * y) for x, y in corners]
        k = len(corners)
        for i in range(k):
            j = (i + 1) % k
            self.bm.faces.new((ra[i], ra[j], rb[j], rb[i])).material_index = mat

    def strip(self, a, b, normal, width, thick, tilt, mat=MESH):
        d = (b - a).normalized()
        across = d.cross(normal).normalized()
        wdir = across * math.cos(tilt) + normal * math.sin(tilt)
        tdir = d.cross(wdir)
        hw, ht = width / 2, thick / 2
        self._section = [(hw, ht), (-hw, ht), (-hw, -ht), (hw, -ht)]
        self.ring_tube(a, b, wdir, tdir, mat)

    def lathe(self, base, axis, prof, seg, mat):
        """Surface of revolution; prof = [(r, h)] from one pole to the other along axis."""
        axis = axis.normalized()
        n1 = perpendicular(axis)
        n2 = axis.cross(n1)
        rings = []
        for r, h in prof:
            c = base + axis * h
            if r < 1e-9:
                rings.append([self.bm.verts.new(c)] * seg)
            else:
                rings.append([self.bm.verts.new(c + n1 * (r * math.cos(2 * math.pi * i / seg))
                                                + n2 * (r * math.sin(2 * math.pi * i / seg)))
                              for i in range(seg)])
        for ra, rb in zip(rings[:-1], rings[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                quad = [ra[i], ra[j], rb[j], rb[i]]
                verts = [v for n, v in enumerate(quad) if v not in quad[:n]]
                self.bm.faces.new(verts).material_index = mat

    def cylinder(self, base, axis, r, length, seg=16, mat=PAINT, bevel=0.0):
        e = min(bevel, r * 0.4, length * 0.4)
        prof = [(0, 0), (r - e, 0)] + ([(r, e), (r, length - e)] if e else [(r, 0), (r, length)])
        prof += [(r - e, length), (0, length)] if e else [(0, length)]
        self.lathe(base, axis, prof, seg, mat)

    def dome(self, base, axis, r, h, seg=12, mat=PAINT):
        prof = [(0, 0), (r, 0)] + [(r * math.cos(a), h * math.sin(a))
                                   for a in (math.radians(x) for x in (25, 50, 70))] + [(0, h)]
        self.lathe(base, axis, prof, seg, mat)


def diamond_lines(ua, ub, va, vb, slope, pitch):
    """Segments of the lines v = +-slope*u + c (c every `pitch`) clipped to a rectangle."""
    segs = []
    for sgn in (1, -1):
        k = sgn * slope
        cs = [va - k * ua, va - k * ub, vb - k * ua, vb - k * ub]
        c = math.floor(min(cs) / pitch) * pitch
        while c <= max(cs):
            u0, u1 = sorted(((va - c) / k, (vb - c) / k))
            lo, hi = max(ua, u0), min(ub, u1)
            if hi - lo > 0.004:
                segs.append((sgn, (lo, k * lo + c), (hi, k * hi + c)))
            c += pitch
    return segs


class Frame:
    """Local panel frame: P(u, v, w) with u along, v up, w outward (w = 0 inner face)."""

    def __init__(self, origin, u_axis, v_axis, w_axis):
        self.o, self.u, self.v, self.w = Vector(origin), Vector(u_axis), Vector(v_axis), Vector(w_axis)

    def p(self, u, v, w):
        return self.o + self.u * u + self.v * v + self.w * w

    def shifted(self, du):
        return Frame(self.p(du, 0, 0), self.u, self.v, self.w)

    def box(self, b, us, vs, ws, mat=PAINT, bevel=EDGE_BEVEL):
        a, c = self.p(us[0], vs[0], ws[0]), self.p(us[1], vs[1], ws[1])
        b.box([min(a[i], c[i]) for i in range(3)], [max(a[i], c[i]) for i in range(3)], mat, bevel)


def fill(b, fr, us, vs, wc, kind):
    """Fill a frame opening with glass or expanded metal; edges run into the tubes."""
    ext = 0.012
    ua, ub, va, vb = us[0] - ext, us[1] + ext, vs[0] - ext, vs[1] + ext
    if kind == "glass":
        fr.box(b, (ua, ub), (va, vb), (wc - GLASS_T / 2, wc + GLASS_T / 2), mat=GLASS, bevel=0)
    else:
        for sgn, (u0, v0), (u1, v1) in diamond_lines(ua, ub, va, vb, ROOF_SWD / ROOF_LWD, ROOF_SWD):
            w = wc + sgn * STRAND_T * 0.4
            b.strip(fr.p(u0, v0, w), fr.p(u1, v1, w), fr.w, STRAND_W, STRAND_T, math.radians(28 * sgn))


def panel(frame_b, fill_b, fr, width, height, kind="glass", bolts=True):
    t = TUBE
    fr.box(frame_b, (0, t), (0, height), (0, t))
    fr.box(frame_b, (width - t, width), (0, height), (0, t))
    fr.box(frame_b, (t, width - t), (0, t), (0, t))
    fr.box(frame_b, (t, width - t), (height - t, height), (0, t))
    if kind:
        fill(fill_b, fr, (t, width - t), (t, height - t), t / 2, kind)
    if bolts:
        for u in (t / 2, width - t / 2):
            for v in (t / 2, height - t / 2):
                frame_b.dome(fr.p(u, v, t), fr.w, 0.0065, 0.0035)


def door_bay(frame_b, fr, width, height):
    """Jamb frame + leaf. Returns builders and pivots of the leaf, its glass, handle and hatch."""
    panel(frame_b, None, fr, width, height, kind=None)
    leaf, glass, handle, hatch = Builder(), Builder(), Builder(), Builder()
    u0, u1 = TUBE + GAP, width - TUBE - GAP
    v0, v1 = TUBE + GAP, height - TUBE - GAP
    ws, s = (LEAF_W0, LEAF_W1), LEAF_STILE
    wc = (LEAF_W0 + LEAF_W1) / 2

    # leaf frame
    fr.box(leaf, (u0, u0 + s), (v0, v1), ws)
    fr.box(leaf, (u1 - s, u1), (v0, v1), ws)
    fr.box(leaf, (u0 + s, u1 - s), (v0, v0 + s), ws)
    fr.box(leaf, (u0 + s, u1 - s), (v1 - s, v1), ws)

    # solid plate band with the hatch opening
    hc = (u0 + u1) / 2 + 0.10
    ha, hb = hc - HATCH_U / 2, hc + HATCH_U / 2
    fr.box(leaf, (u0 + s, ha), (KICK_V0, KICK_V1), ws)
    fr.box(leaf, (hb, u1 - s), (KICK_V0, KICK_V1), ws)
    fr.box(leaf, (ha, hb), (KICK_V0, HATCH_V0), ws)
    fr.box(leaf, (ha, hb), (HATCH_V1, KICK_V1), ws)
    fill(glass, fr, (u0 + s, u1 - s), (KICK_V1, v1 - s), wc, "glass")
    fill(glass, fr, (u0 + s, u1 - s), (v0 + s, KICK_V0), wc, "glass")

    # hatch: recessed plate hinged along its bottom edge, two fixing screws, latch
    fr.box(hatch, (ha + 0.003, hb - 0.003), (HATCH_V0 + 0.002, HATCH_V1 - 0.002), (LEAF_W1 - 0.012, LEAF_W1 - 0.002))
    for du in (-0.1, 0.1):
        hatch.dome(fr.p(hc + du, (HATCH_V0 + HATCH_V1) / 2, LEAF_W1 - 0.002), fr.w, 0.005, 0.0025, mat=STEEL)
    fr.box(hatch, (hc - 0.012, hc + 0.012), (HATCH_V1 - 0.03, HATCH_V1 - 0.012), (LEAF_W1 - 0.002, LEAF_W1 + 0.008))
    leaf.cylinder(fr.p(ha + 0.02, HATCH_V0 + 0.004, LEAF_W1 + 0.002), fr.u, 0.004, HATCH_U - 0.04, 12)
    fr.box(leaf, (hc - 0.03, hc + 0.03), (HATCH_V1 + 0.006, HATCH_V1 + 0.024), (LEAF_W1, LEAF_W1 + 0.01))

    # three barrel hinges: lower knuckle on the jamb, upper knuckle on the leaf
    u_ax, w_ax = width - TUBE - GAP / 2, TUBE + HINGE_R
    for hv in (v0 + 0.25, (v0 + v1) / 2, v1 - 0.25):
        k = HINGE_KNUCKLE
        frame_b.cylinder(fr.p(u_ax, hv - k, w_ax), fr.v, HINGE_R, k - 0.001, 16, bevel=0.002)
        fr.box(frame_b, (u_ax, u_ax + 0.042), (hv - k, hv - 0.001), (TUBE - 0.001, TUBE + 0.005), bevel=0)
        frame_b.dome(fr.p(u_ax, hv - k, w_ax), -fr.v, HINGE_R * 0.8, 0.006, 16)
        leaf.cylinder(fr.p(u_ax, hv, w_ax), fr.v, HINGE_R, k, 16, bevel=0.002)
        fr.box(leaf, (u_ax - 0.045, u_ax), (hv, hv + k), (LEAF_W1 - 0.001, LEAF_W1 + 0.006), bevel=0)
        leaf.dome(fr.p(u_ax, hv + k, w_ax), fr.v, HINGE_R * 0.8, 0.006, 16)

    # strike box on the lock jamb, level with the plate band
    fr.box(frame_b, (0.004, TUBE), (KICK_V0, KICK_V1), (TUBE, TUBE + 0.008))

    # lever handle (outside only) and key cylinder
    uh = u0 + s / 2
    handle.cylinder(fr.p(uh, HANDLE_V, LEAF_W1), fr.w, 0.026, 0.008, 24, mat=STEEL, bevel=0.002)
    handle.cylinder(fr.p(uh, HANDLE_V, LEAF_W1 + 0.006), fr.w, 0.0095, 0.048, 16, mat=STEEL)
    lever_w = LEAF_W1 + 0.045
    handle.cylinder(fr.p(uh, HANDLE_V, lever_w), fr.u, 0.0095, 0.125, 16, mat=STEEL)
    handle.dome(fr.p(uh + 0.125, HANDLE_V, lever_w), fr.u, 0.0095, 0.008, 16, mat=STEEL)
    handle.dome(fr.p(uh, HANDLE_V, lever_w), -fr.u, 0.0095, 0.009, 16, mat=STEEL)
    kv = HANDLE_V - 0.075
    leaf.cylinder(fr.p(uh, kv, LEAF_W1), fr.w, 0.018, 0.010, 24, mat=STEEL, bevel=0.002)
    leaf.cylinder(fr.p(uh, kv, LEAF_W1 + 0.009), fr.w, 0.0115, 0.003, 20, mat=STEEL)
    fr.box(leaf, (uh - 0.0012, uh + 0.0012), (kv - 0.006, kv + 0.006), (LEAF_W1 + 0.011, LEAF_W1 + 0.0125),
           mat=STEEL, bevel=0)

    return (leaf, glass, fr.p(u_ax, 0, w_ax), handle, fr.p(uh, HANDLE_V, LEAF_W1),
            hatch, fr.p(hc, HATCH_V0, LEAF_W1))


# ---------------------------------------------------------------- objects / materials
def make_materials():
    out = []
    for name, hx, metal, rough in (("Cage_Paint_BlueGrey", PAINT_HEX, 0.0, 0.45),
                                   ("Cage_Mesh_Galvanized", MESH_HEX, 0.0, 0.40),
                                   ("Cage_Steel_Stainless", STEEL_HEX, 1.0, 0.25)):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = hex_linear(hx)
        b.inputs["Metallic"].default_value = metal
        b.inputs["Roughness"].default_value = rough
        m.diffuse_color = hex_linear(hx)
        out.append(m)
    glass = bpy.data.materials.new("Cage_Glass_Clear")
    glass.use_nodes = True
    b = glass.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hex_linear(GLASS_HEX)
    b.inputs["Roughness"].default_value = 0.02
    b.inputs["IOR"].default_value = 1.52
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Alpha"].default_value = GLASS_ALPHA          # exported as FBX opacity for Unity
    glass.diffuse_color = hex_linear(GLASS_HEX)[:3] + (GLASS_ALPHA,)
    out.append(glass)
    return out


def bake_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    me.name = ob.name
    bpy.data.meshes.remove(old)


def to_object(b, name, mats, pivot=Vector(), parent=None):
    bm = b.bm
    bmesh.ops.translate(bm, verts=bm.verts, vec=-pivot)
    used = sorted({f.material_index for f in bm.faces})
    remap = {g: i for i, g in enumerate(used)}
    for f in bm.faces:
        f.material_index = remap[f.material_index]
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for g in used:
        me.materials.append(mats[g])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = pivot - (parent.location if parent else Vector())   # parents sit at world offsets

    me.set_sharp_from_angle(angle=math.radians(65))
    uv = me.uv_layers.new(name="UVMap")          # box projection, 1 UV = 1 m
    for p in me.polygons:
        n = [abs(c) for c in p.normal]
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if n[2] >= max(n[0], n[1]):
                uv.data[li].uv = (co.x, co.y)
            elif n[0] >= n[1]:
                uv.data[li].uv = (co.y, co.z)
            else:
                uv.data[li].uv = (co.x, co.z)
    mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.keep_sharp = True
    bake_modifiers(ob)
    return ob


def build(mats):
    root = bpy.data.objects.new("SecurityCage", None)
    bpy.context.scene.collection.objects.link(root)
    frame_b, glass_b, roof_b = Builder(), Builder(), Builder()
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

    front = Frame((-W / 2, -D / 2 + TUBE, 0), X, Z, -Y)
    back = Frame((-W / 2, D / 2 - TUBE, 0), X, Z, Y)
    right = Frame((W / 2 - TUBE, -D / 2 + TUBE, 0), Y, Z, X)
    left = Frame((-W / 2 + TUBE, -D / 2 + TUBE, 0), Y, Z, -X)

    doors = []
    for fr, name in ((front, "Door_Front"), (back, "Door_Back")):
        panel(frame_b, glass_b, fr, FRONT_FIXED, H_WALL)
        doors.append((name, door_bay(frame_b, fr.shifted(FRONT_FIXED), DOOR_BAY, H_WALL)))
    for fr in (right, left):
        for i in range(N_SIDE):
            panel(frame_b, glass_b, fr.shifted(i * SIDE_PANEL), SIDE_PANEL, H_WALL)
    for i in range(N_SIDE):
        roof = Frame((-W / 2, -D / 2 + i * D / N_SIDE, H_WALL), X, Y, Z)
        panel(frame_b, roof_b, roof, W, D / N_SIDE, kind="expanded")

    parts = [to_object(frame_b, "Cage_Frame", mats), to_object(glass_b, "Cage_Glass", mats),
             to_object(roof_b, "Cage_RoofMesh", mats)]
    for ob in parts:
        ob.parent = root
    # glass stays a separate child so Unity sorts the transparent panes on their own
    for name, (leaf, glass, p_leaf, handle, p_handle, hatch, p_hatch) in doors:
        door = to_object(leaf, name, mats, p_leaf, root)
        parts += [door, to_object(glass, name + "_Glass", mats, p_leaf, door),
                  to_object(handle, name + "_Handle", mats, p_handle, door),
                  to_object(hatch, name + "_Hatch", mats, p_hatch, door)]

    # Store everything below the root in Y-up space and tilt only the root by +90 deg X.
    # The FBX axis conversion then cancels the root tilt, so Unity gets identity rotations
    # on every object while doors/handles/hatches keep their hinge pivots.
    to_y_up = Matrix.Rotation(-math.pi / 2, 4, "X")
    for ob in parts:
        ob.data.transform(to_y_up)
        ob.location = to_y_up @ ob.location
    root.rotation_euler = (math.pi / 2, 0, 0)
    return root, parts


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
        bake_space_transform=False,            # root tilt (see build) already cancels the conversion
        use_mesh_modifiers=True,
        mesh_smooth_type="OFF",                # export split normals
        use_triangles=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="AUTO",
    )


def look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()


def setup_preview_scene():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "Standard"   # keep the measured colours unshifted
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    wt = world.node_tree
    fill = wt.nodes["Background"]                     # neutral white fill light
    fill.inputs["Color"].default_value = (1, 1, 1, 1)
    fill.inputs["Strength"].default_value = 0.45
    backdrop = wt.nodes.new("ShaderNodeBackground")   # white backdrop, like the reference
    backdrop.inputs["Color"].default_value = (1, 1, 1, 1)
    mix = wt.nodes.new("ShaderNodeMixShader")
    ray = wt.nodes.new("ShaderNodeLightPath")
    wt.links.new(ray.outputs["Is Camera Ray"], mix.inputs["Fac"])
    wt.links.new(fill.outputs["Background"], mix.inputs[1])
    wt.links.new(backdrop.outputs["Background"], mix.inputs[2])
    wt.links.new(mix.outputs["Shader"], wt.nodes["World Output"].inputs["Surface"])
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 2.5
    sun.data.color = (1, 1, 1)
    sun.data.angle = math.radians(12)
    sun.rotation_euler = (math.radians(35), 0, math.radians(30))
    scene.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=30)
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
    bpy.context.scene.unit_settings.system = "METRIC"
    mats = make_materials()
    root, parts = build(mats)

    tris = sum(len(p.vertices) - 2 for ob in parts for p in ob.data.polygons)
    print(f"[cage] parts={[o.name for o in parts]}")
    print(f"[cage] triangles={tris} size {W:.2f} x {D:.2f} x {H_TOTAL:.2f} m")
    fbx = os.path.join(args.out, "SecurityCage.fbx")
    export_fbx(fbx)
    print(f"[cage] exported {fbx}")

    if args.render:
        setup_preview_scene()
        render_preview(os.path.join(args.out, "preview_front.jpg"),
                       (2.35, -3.45, 1.2), (0.0, -0.05, 1.1), 20, (1400, 1200), 128)
        door, hatch = bpy.data.objects["Door_Front"], bpy.data.objects["Door_Front_Hatch"]
        door.rotation_euler.y = math.radians(75)
        hatch.rotation_euler.x = math.radians(80)
        render_preview(os.path.join(args.out, "preview_open.jpg"),
                       (3.1, -4.3, 1.45), (0.25, -1.4, 1.05), 26, (1400, 1100), 128)


if __name__ == "__main__":
    main()
