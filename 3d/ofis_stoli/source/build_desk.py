"""
Ofis (rahbar) stolining 3D modelini yaratadi va Unity VR uchun FBX qilib eksport qiladi.

Old tomon (mehmon tomoni) - berilgan rasm asosida:
  * ikki qavatli stoleshnitsa (orasida "soya chizig'i" bilan),
  * ikki qavatli, yivli yon oyoqlar,
  * old panel ustida ikkita bo'rtma (fasetli) panel va alyuminiy planka.
Orqa tomon (o'tiruvchi tomoni) - rasmda yo'q, shu skriptda loyihalangan:
  * ikki yonda ochiq tokchali tumbalar (tortma va eshiksiz, har birida 3 ta bo'lim),
  * o'rtada oyoq uchun keng bo'sh joy.

Koordinatalar (Blender): Z - yuqori, -Y - old (mehmon) tomon, +Y - o'tiruvchi tomoni.
O'lchov: metr. Pivot - stol markazi, pol sathida.

Ishga tushirish (Blender 4.x yoki `pip install bpy`):
  blender -b -P build_desk.py            yoki     python build_desk.py
  qo'shimcha:  --no-render   (preview rasmlarsiz)
               --quick       (tez, past sifatli preview)
"""
import math
import os
import random
import sys

import bpy  # noqa: I001  (pip-bpy da bmesh faqat bpy dan keyin yuklanadi)
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
TEX_DIR = os.path.join(ROOT, "Textures")
PREVIEW_DIR = os.path.join(ROOT, "preview")
FBX_PATH = os.path.join(ROOT, "OfisStoli.fbx")
BLEND_PATH = os.path.join(ROOT, "source", "OfisStoli.blend")

TEX_SIZE_M = 2.0          # bitta tekstura necha metrni qoplaydi
RENDER = "--no-render" not in sys.argv
random.seed(7)

# ---------------------------------------------------------------- sahna
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0


# ---------------------------------------------------------------- materiallar
def load_image(name, non_color=False):
    img = bpy.data.images.load(os.path.join(TEX_DIR, name))
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def make_wood():
    m = bpy.data.materials.new("Yogoch_4A2F2A")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    base = nt.nodes.new("ShaderNodeTexImage")
    base.image = load_image("Wood_BaseColor.jpg")
    base.location = (-600, 300)
    rough = nt.nodes.new("ShaderNodeTexImage")
    rough.image = load_image("Wood_Roughness.png", True)
    rough.location = (-600, 0)
    nrm_tex = nt.nodes.new("ShaderNodeTexImage")
    nrm_tex.image = load_image("Wood_Normal.png", True)
    nrm_tex.location = (-600, -300)
    nrm = nt.nodes.new("ShaderNodeNormalMap")
    nrm.inputs["Strength"].default_value = 0.6
    nrm.location = (-250, -300)
    nt.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(nrm_tex.outputs["Color"], nrm.inputs["Color"])
    nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
    m.diffuse_color = (0x4A / 255, 0x2F / 255, 0x2A / 255, 1)
    return m


def make_simple(name, color, metallic, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (*color, 1)
    m.metallic = metallic
    m.roughness = roughness
    return m


MATS = [
    make_wood(),
    make_simple("Metall_Alyuminiy", (0.80, 0.80, 0.82), 1.0, 0.28),
]
WOOD, METAL = 0, 1
AXIS = {"X": 0, "Y": 1, "Z": 2}

# ---------------------------------------------------------------- geometriya yordamchilari
PARTS = []   # har bir qism: dict(group, verts, faces, normals, uvs, mats)


def add_hull(points, group, mat=WOOD, grain="X", bevel=0.0015, segs=2):
    """Qavariq (convex) qismni yaratadi, qirralarini bevel qiladi, UV va normallarni hisoblaydi."""
    me = bpy.data.meshes.new("tmp")
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5),
                             verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.set_sharp_from_angle(angle=math.radians(20))
    obj = bpy.data.objects.new("tmp", me)
    scene.collection.objects.link(obj)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(20)
        mod.harden_normals = True
    tri = obj.modifiers.new("Tri", "TRIANGULATE")   # faqat n-gonlar: tangent eksporti uchun
    tri.min_vertices = 5
    dg = bpy.context.evaluated_depsgraph_get()
    em = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True,
                                         depsgraph=dg)

    verts = [v.co.copy() for v in em.vertices]
    lo = Vector((min(v[i] for v in verts) for i in range(3)))
    hi = Vector((max(v[i] for v in verts) for i in range(3)))
    dims = hi - lo
    g = AXIS[grain]
    off = (random.random(), random.random())
    faces, normals, uvs = [], [], []
    for poly in em.polygons:
        n = poly.normal
        a = max(range(3), key=lambda i: abs(n[i]))
        plane = [i for i in range(3) if i != a]
        if g in plane:                       # tola yuzada bo'ylama yo'nalgan
            u_ax = g
            v_ax = plane[0] if plane[1] == g else plane[1]
        else:                                # kesim (torets) - uzun tomon bo'ylab
            u_ax = max(plane, key=lambda i: dims[i])
            v_ax = plane[0] if plane[1] == u_ax else plane[1]
        face = []
        for li in poly.loop_indices:
            vi = em.loops[li].vertex_index
            face.append(vi)
            normals.append(em.corner_normals[li].vector.copy())
            co = verts[vi]
            uvs.append((co[u_ax] / TEX_SIZE_M + off[0], co[v_ax] / TEX_SIZE_M + off[1]))
        faces.append(face)
    PARTS.append(dict(group=group, verts=verts, faces=faces, normals=normals, uvs=uvs,
                      mats=[mat] * len(faces)))
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(me)
    bpy.data.meshes.remove(em)


def box(x0, x1, y0, y1, z0, z1, group, mat=WOOD, grain="X", bevel=0.0015, segs=2):
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))
    pts = [Vector((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    add_hull(pts, group, mat, grain, bevel, segs)


# ---------------------------------------------------------------- o'lchamlar (metr)
H = 0.760                     # umumiy balandlik
TOP_T, GAP_T, SUB_T = 0.028, 0.008, 0.026
Z_TOP0 = H - TOP_T            # 0.732 - yuqori plita osti
Z_GAP0 = Z_TOP0 - GAP_T       # 0.724 - soya chizig'i osti
Z_SUB0 = Z_GAP0 - SUB_T       # 0.698 - pastki plita osti (korpus shipi)

LEG_OUT, LEG_IN = 0.880, 0.822          # yon oyoq tashqi / ichki X
LEG_Y = 0.425                           # oyoqlar chuqurligi (±)
FRONT_Y0, FRONT_Y1 = -0.395, -0.370     # old panel (mehmon tomoni)
FRONT_Z0 = 0.072
PED_IN = 0.400                          # tumba ichki devori (|x|)
PED_SIDE_T = 0.018
PED_Y1 = LEG_Y - 0.005                  # tumba old qirrasi (o'tiruvchi tomoni)
SHELVES = ((0.290, 0.308), (0.522, 0.540))   # har bir tumbada 2 ta tokcha -> 3 ta bo'lim
BODY = "Stol_Korpus"

# ---------------------------------------------------------------- stoleshnitsa (3 qatlam)
box(-0.900, 0.900, -0.450, 0.450, Z_TOP0, H, BODY, grain="X", bevel=0.0025, segs=3)
box(-0.875, 0.875, -0.425, 0.425, Z_GAP0, Z_TOP0, BODY, grain="X", bevel=0)
box(-0.930, 0.930, -0.465, 0.465, Z_SUB0, Z_GAP0, BODY, grain="X", bevel=0.002, segs=3)

# ---------------------------------------------------------------- yon oyoqlar (2 qatlam + yiv)
for s in (-1, 1):
    box(s * 0.860, s * LEG_OUT, -LEG_Y, LEG_Y, 0, Z_SUB0, BODY, grain="Z", bevel=0.002)
    box(s * 0.852, s * 0.860, -LEG_Y + 0.020, LEG_Y - 0.020, 0.004, Z_SUB0, BODY, grain="Z", bevel=0)
    box(s * LEG_IN, s * 0.852, -LEG_Y, LEG_Y, 0, Z_SUB0, BODY, grain="Z", bevel=0.002)

# ---------------------------------------------------------------- old panel + bo'rtma panellar
box(-LEG_IN, LEG_IN, FRONT_Y0, FRONT_Y1, FRONT_Z0, Z_SUB0, BODY, grain="X")
box(-LEG_IN, LEG_IN, FRONT_Y1 + 0.010, FRONT_Y1 + 0.028, 0, FRONT_Z0 + 0.01, BODY, grain="X",
    bevel=0.001)   # old panel ostidagi ichkariga kirgan sokol
for s in (-1, 1):
    x0, x1 = sorted((s * 0.105, s * 0.615))
    zb, zt = 0.192, 0.610
    yb, yl, yf = FRONT_Y0 + 0.0005, FRONT_Y0 - 0.004, FRONT_Y0 - 0.014
    side_c, top_c = 0.015, 0.025
    back = [(x, yb, z) for x in (x0, x1) for z in (zb, zt)]
    lip = [(x, yl, z) for x in (x0, x1) for z in (zb, zt)]
    front = [(x, yf, z) for x in (x0 + side_c, x1 - side_c) for z in (zb + side_c, zt - top_c)]
    add_hull([Vector(p) for p in back + lip + front], BODY, WOOD, "X", 0.0012, 2)
    # yuqori faska ustidagi alyuminiy planka (rasmdagi kumush chiziq)
    n = Vector((0, -(top_c), (yl - yf))).normalized()   # faska normali: oldinga-yuqoriga
    quad = [Vector((x0, yl, zt)), Vector((x1, yl, zt)),
            Vector((x0 + side_c, yf, zt - top_c)), Vector((x1 - side_c, yf, zt - top_c))]
    add_hull([q + n * 0.0012 for q in quad] + [q - n * 0.002 for q in quad],
             BODY, METAL, "X", 0.0005, 1)

# ---------------------------------------------------------------- tumbalar (ochiq tokchalar)
for s in (-1, 1):
    box(s * (PED_IN - PED_SIDE_T), s * PED_IN, FRONT_Y1, PED_Y1, 0, Z_SUB0, BODY, grain="Z")
    box(s * PED_IN, s * LEG_IN, FRONT_Y1, PED_Y1, 0.058, 0.076, BODY, grain="X", bevel=0.0015)
    box(s * PED_IN, s * LEG_IN, 0.330, 0.348, 0, 0.058, BODY, grain="X", bevel=0.001)   # sokol
    for z0, z1 in SHELVES:
        box(s * PED_IN, s * LEG_IN, FRONT_Y1, PED_Y1, z0, z1, BODY, grain="X", bevel=0.0015)

GROUPS = {BODY: Vector((0, 0, 0))}   # nom -> pivot (Blender koordinatalarida)


# ---------------------------------------------------------------- guruhlarni obyektga yig'ish
def build_group(name, parent):
    origin = GROUPS[name]
    parts = [p for p in PARTS if p["group"] == name]
    verts, faces, normals, uvs, mats = [], [], [], [], []
    for p in parts:
        base = len(verts)
        verts += [v - origin for v in p["verts"]]
        faces += [[base + i for i in f] for f in p["faces"]]
        normals += p["normals"]
        uvs += p["uvs"]
        mats += p["mats"]
    used = sorted(set(mats))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    for m in used:
        me.materials.append(MATS[m])
    me.polygons.foreach_set("material_index", [used.index(m) for m in mats])
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [c for t in uvs for c in t])
    me.shade_smooth()
    me.normals_split_custom_set([tuple(n) for n in normals])
    me.update()
    obj = bpy.data.objects.new(name, me)
    obj.location = origin
    obj.parent = parent
    scene.collection.objects.link(obj)
    return obj


root = bpy.data.objects.new("OfisStoli", None)
root.empty_display_size = 0.3
scene.collection.objects.link(root)
objs = {name: build_group(name, root) for name in GROUPS}

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs.values())
print("Obyektlar:", ", ".join(objs))
print("Uchburchaklar soni:", tris)

# ---------------------------------------------------------------- saqlash va FBX eksport
for img in bpy.data.images:
    img.filepath = bpy.path.relpath(img.filepath_raw, start=os.path.dirname(BLEND_PATH))
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, relative_remap=True)

bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.fbx(
    filepath=FBX_PATH,
    use_selection=False,
    object_types={"EMPTY", "MESH"},
    apply_unit_scale=True,
    apply_scale_options="FBX_SCALE_ALL",   # Unity: Scale = 1
    axis_forward="-Z",
    axis_up="Y",
    bake_space_transform=True,             # Unity: Rotation = 0
    use_mesh_modifiers=True,
    mesh_smooth_type="OFF",                # custom normallar saqlanadi
    use_tspace=True,
    use_custom_props=False,
    add_leaf_bones=False,
    bake_anim=False,
    path_mode="COPY",
    embed_textures=True,
)
print("FBX:", FBX_PATH)

# ---------------------------------------------------------------- preview renderlar
if RENDER:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
    if "--quick" in sys.argv:
        scene.render.resolution_percentage = 40
        scene.cycles.samples = 16
    scene.view_settings.view_transform = "Standard"   # rang #4A2F2A ga sodiq qolsin

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.82, 0.84, 0.88, 1)
    bg.inputs["Strength"].default_value = 0.12
    scene.world = world

    floor_mat = make_simple("Pol", (0.2, 0.2, 0.21), 0.0, 0.6)
    bpy.ops.mesh.primitive_plane_add(size=30)
    bpy.context.object.data.materials.append(floor_mat)

    def light(name, loc, energy, size):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        d = Vector((0, 0, 0.4)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)

    # chiroqlar baland: yaltiroq stoleshnitsada katta oq aks bermasligi uchun
    light("Key", (-1.6, -2.0, 4.0), 900, 1.6)
    light("Back", (1.6, 2.2, 4.0), 750, 1.6)
    light("SideL", (-3.4, 0.6, 1.2), 160, 1.2)
    light("SideR", (3.4, -0.6, 1.2), 160, 1.2)

    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shot(fname, loc, target, lens=50):
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam_data.lens = lens
        scene.render.filepath = os.path.join(PREVIEW_DIR, fname)
        bpy.ops.render.render(write_still=True)
        print("Render:", fname)

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    shot("01_old_tomon.png", (0, -3.6, 1.75), (0, 0, 0.42))
    shot("02_orqa_tomon.png", (0, 3.5, 1.3), (0, 0, 0.38))
    shot("03_old_3x4.png", (-2.3, -2.9, 1.55), (0, 0, 0.36))
    shot("04_orqa_3x4.png", (1.9, 2.9, 1.55), (0, 0.1, 0.36))
