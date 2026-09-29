"""
Courtroom audio/video set for Unity / VR: conference speakerphone (360-degree
microphone array + speaker), video camera on a weighted base, NFC ID-card
reader, cable clamp and a sample ID card.

Every part that does something in court is its own object with a sensible
pivot so the Unity scripts in ./Unity/Scripts can drive it: buttons press
along their own up axis, LEDs change colour, the camera head carries a
Unity camera, the reader has a pad that detects the card.

Y up, metres, desk surface at y = 0, front of the set toward +Z.

Run with the Blender Python module (pip install bpy==4.2.0 numpy pillow):
    python3 generate_court_av.py [--out DIR] [--render]
"""
import argparse
import math
import os
import sys

import bpy  # must be imported before bmesh when running as a module
import bmesh
import numpy as np
from mathutils import Matrix, Vector

TEX = 1024
SEED = 3

# ---------------------------------------------------------------- layout (m)
SPK = Vector((0.0, 0.0, -0.07))        # speakerphone centre on the desk
CAMB = Vector((0.19, 0.0, 0.27))       # camera base centre
DOCK = Vector((-0.21, 0.0, 0.27))      # ID reader centre
CARD = Vector((-0.34, 0.0, 0.2))       # sample card lying on the desk

# colours measured from the product picture (sRGB)
COLORS = {
    "Plastic_Black": ("#1C1C1E", 0.0, 0.32),
    "Chrome": ("#D6D7DB", 1.0, 0.12),
    "Rubber": ("#141415", 0.0, 0.62),
    "Steel": ("#B9B6B2", 1.0, 0.28),
    "Fabric_Grille": ("#1F2022", 0.0, 0.9),
    "Lens_Glass": ("#07090D", 0.0, 0.04),
}
LEDS = ("LED_Speaker", "LED_Camera", "LED_Reader")


# ---------------------------------------------------------------- textures
def periodic_noise(n, sx, sy, rng):
    f = np.fft.fft2(rng.standard_normal((n, n)))
    fr = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(fr, fr)
    out = np.real(np.fft.ifft2(f * np.exp(-((fx / sx) ** 2 + (fy / sy) ** 2))))
    out -= out.mean()
    return out / (out.std() + 1e-9)


def normal_from_height(h, strength):
    du = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2
    dv = -(np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
    n = np.dstack([-strength * du, -strength * dv, np.ones_like(du)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).round().astype(np.uint8)


def make_textures(outdir):
    from PIL import Image, ImageDraw, ImageFont
    rng = np.random.default_rng(SEED)
    tdir = os.path.join(outdir, "Textures")
    os.makedirs(tdir, exist_ok=True)
    paths = {}

    # fibrous textured shell (dark graphite, fine directional grain like the picture)
    n = TEX
    fib = periodic_noise(n, 260.0, 12.0, rng) * 0.7 + periodic_noise(n, 700.0, 40.0, rng) * 0.3
    blot = periodic_noise(n, 4.0, 4.0, rng)
    v = 35 + 5 * fib + 1.5 * blot
    alb = np.dstack([v, v + 1.5, v + 3.5])
    Image.fromarray(np.clip(alb, 0, 255).astype(np.uint8)).save(os.path.join(tdir, "Shell_BaseColor.png"))
    Image.fromarray(normal_from_height(fib, 0.1)).save(os.path.join(tdir, "Shell_Normal.png"))
    paths["shell"] = ("Shell_BaseColor.png", "Shell_Normal.png")

    # perforated speaker grille: holes laid out on a golden-angle spiral
    n2, ss = 2048, 2
    img = Image.new("L", (n2 * ss, n2 * ss), 72)
    d = ImageDraw.Draw(img)
    count, rmax = 2600, 0.47
    for i in range(count):
        r = rmax * math.sqrt((i + 0.5) / count)
        a = i * math.radians(137.508)
        x, y = 0.5 + r * math.cos(a), 0.5 + r * math.sin(a)
        hr = 0.0056 * (0.8 + 0.2 * r / rmax)
        d.ellipse([(x - hr) * n2 * ss, (y - hr) * n2 * ss, (x + hr) * n2 * ss, (y + hr) * n2 * ss], fill=10)
    grille = np.asarray(img.resize((n2, n2), Image.LANCZOS)).astype(float)
    tone = np.dstack([grille, grille + 1, grille + 3])
    Image.fromarray(np.clip(tone, 0, 255).astype(np.uint8)).save(os.path.join(tdir, "Grille_BaseColor.png"))
    Image.fromarray(normal_from_height(grille / 60.0, 1.2)).save(os.path.join(tdir, "Grille_Normal.png"))
    paths["grille"] = ("Grille_BaseColor.png", "Grille_Normal.png")

    # button icon atlas: 4 x 2 cells of 256 px, satin grey keys with dark icons
    cell = 256
    atlas = Image.new("RGB", (cell * 4, cell * 2), (152, 152, 155))
    d = ImageDraw.Draw(atlas)
    ink, w = (48, 48, 52), 16

    def c(ix, iy):
        return ix * cell + cell // 2, iy * cell + cell // 2

    x, y = c(0, 0)                                              # 0: volume down
    d.line([x - 50, y, x + 50, y], fill=ink, width=w)
    x, y = c(1, 0)                                              # 1: microphone (mute)
    d.rounded_rectangle([x - 20, y - 62, x + 20, y + 10], radius=20, outline=ink, width=12)
    d.arc([x - 38, y - 30, x + 38, y + 34], 0, 180, fill=ink, width=12)
    d.line([x, y + 34, x, y + 56], fill=ink, width=12)
    d.line([x - 56, y + 56, x + 56, y - 64], fill=ink, width=12)
    x, y = c(2, 0)                                              # 2: volume up
    d.line([x - 50, y, x + 50, y], fill=ink, width=w)
    d.line([x, y - 50, x, y + 50], fill=ink, width=w)
    x, y = c(3, 0)                                              # 3: power
    d.arc([x - 52, y - 52, x + 52, y + 52], 300, 240, fill=ink, width=14)
    d.line([x, y - 66, x, y - 6], fill=ink, width=14)
    x, y = c(0, 1)                                              # 4: call / videoconference
    d.arc([x - 60, y - 30, x + 60, y + 70], 200, 340, fill=ink, width=18)
    d.rounded_rectangle([x - 70, y - 4, x - 36, y + 26], radius=8, fill=ink)
    d.rounded_rectangle([x + 36, y - 4, x + 70, y + 26], radius=8, fill=ink)
    x, y = c(1, 1)                                              # 5: card / confirm
    d.rounded_rectangle([x - 62, y - 40, x + 62, y + 40], radius=10, outline=ink, width=12)
    d.line([x - 40, y - 8, x - 8, y + 20], fill=ink, width=12)
    d.line([x - 8, y + 20, x + 44, y - 26], fill=ink, width=12)
    x, y = c(2, 1)                                              # 6: clear (x)
    d.line([x - 44, y - 44, x + 44, y + 44], fill=ink, width=w)
    d.line([x - 44, y + 44, x + 44, y - 44], fill=ink, width=w)
    atlas.save(os.path.join(tdir, "Buttons_Icons.png"))
    paths["buttons"] = ("Buttons_Icons.png", None)

    # NFC pad: glossy black plate with the contactless symbol
    pad = Image.new("RGB", (512, 512), (22, 22, 24))
    d = ImageDraw.Draw(pad)
    d.rounded_rectangle([40, 40, 472, 472], radius=46, outline=(40, 40, 43), width=6)
    cx, cy = 256, 236
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], outline=(138, 138, 142), width=10)
    for r in (52, 84, 116):
        d.arc([cx - r, cy - r, cx + r, cy + r], -48, 48, fill=(138, 138, 142), width=10)
        d.arc([cx - r, cy - r, cx + r, cy + r], 132, 228, fill=(138, 138, 142), width=10)
    pad.save(os.path.join(tdir, "NFC_Pad.png"))
    paths["pad"] = ("NFC_Pad.png", None)

    # sample ID card (generic, clearly marked as a sample)
    card = Image.new("RGB", (1024, 648), (236, 240, 238))
    d = ImageDraw.Draw(card)
    d.rectangle([0, 0, 1024, 120], fill=(34, 104, 118))
    font_b = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font_r = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    try:
        big, mid = ImageFont.truetype(font_b, 58), ImageFont.truetype(font_r, 40)
    except OSError:
        big = mid = ImageFont.load_default()
    d.text((40, 30), "ID KARTA  ·  NAMUNA", fill=(255, 255, 255), font=big)
    d.rounded_rectangle([40, 170, 300, 520], radius=14, fill=(196, 204, 206))
    d.ellipse([110, 220, 230, 340], fill=(160, 170, 172))
    d.rounded_rectangle([80, 350, 260, 500], radius=40, fill=(160, 170, 172))
    for i, (label, value) in enumerate((("F.I.Sh.", "Namuna Shaxs"), ("Roli", "Guvoh"), ("Hujjat", "AA0000000"))):
        d.text((340, 180 + i * 110), label, fill=(98, 110, 114), font=mid)
        d.text((340, 226 + i * 110), value, fill=(28, 34, 36), font=big)
    d.rectangle([860, 520, 990, 610], fill=(200, 170, 90))      # contact chip
    card.save(os.path.join(tdir, "IdCard.png"))
    paths["card"] = ("IdCard.png", None)
    return tdir, paths


def hex_linear(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def make_materials(tdir, paths):
    mats = {}

    def principled(name):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        return m, m.node_tree, m.node_tree.nodes["Principled BSDF"]

    for name, (hx, metal, rough) in COLORS.items():
        m, nt, b = principled(name)
        b.inputs["Base Color"].default_value = hex_linear(hx)
        b.inputs["Metallic"].default_value = metal
        b.inputs["Roughness"].default_value = rough
        mats[name] = m

    # the bump strength is baked into the normal maps, so Unity (bump scale 1) shows what Blender shows
    def textured(name, key, rough, nstrength=1.0):
        m, nt, b = principled(name)
        b.inputs["Base Color"].default_value = (1, 1, 1, 1)
        alb, nrm = paths[key]
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(tdir, alb))
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if nrm:
            tn = nt.nodes.new("ShaderNodeTexImage")
            tn.image = bpy.data.images.load(os.path.join(tdir, nrm))
            tn.image.colorspace_settings.name = "Non-Color"
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = nstrength
            nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Roughness"].default_value = rough
        mats[name] = m

    textured("Shell_Textured", "shell", 0.58)
    textured("Speaker_Grille", "grille", 0.45)
    textured("Button_Keys", "buttons", 0.35)
    textured("NFC_Pad", "pad", 0.12)
    textured("IdCard_Print", "card", 0.4)
    for name in LEDS:                         # dark until the Unity scripts light them
        m, nt, b = principled(name)
        b.inputs["Base Color"].default_value = hex_linear("#202022")
        b.inputs["Roughness"].default_value = 0.2
        b.inputs["Emission Color"].default_value = (0, 0, 0, 1)
        mats[name] = m
    return mats


# ---------------------------------------------------------------- mesh building
class Geo:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mat_names = []

    def mat(self, name):
        if name not in self.mat_names:
            self.mat_names.append(name)
        return self.mat_names.index(name)

    def verts(self, pts):
        return [self.bm.verts.new(p) for p in pts]

    def loft(self, rings, mat, uvf, closed=True):
        faces = []
        mi = self.mat(mat)
        for ra, rb in zip(rings[:-1], rings[1:]):
            n = len(ra)
            for i in range(n if closed else n - 1):
                j = (i + 1) % n
                quad = [ra[i], ra[j], rb[j], rb[i]]
                uniq = [v for k, v in enumerate(quad) if v not in quad[:k]]
                f = self.bm.faces.new(uniq)
                f.material_index = mi
                faces.append(f)
        self.set_uv(faces, uvf)
        return faces

    def cap(self, ring, mat, uvf):
        f = self.bm.faces.new(ring)
        f.material_index = self.mat(mat)
        self.set_uv([f], uvf)
        return [f]

    def set_uv(self, faces, uvf):
        for f in faces:
            for lp in f.loops:
                lp[self.uv].uv = uvf(lp.vert.co)

    def orient(self, faces, ref):
        """Flip a consistently wound part so it faces away from `ref`."""
        s = 0.0
        for f in faces:
            f.normal_update()
            s += f.normal.dot(f.calc_center_median() - ref) * f.calc_area()
        if s < 0:
            bmesh.ops.reverse_faces(self.bm, faces=faces)

    def finish_caps(self, faces):
        big = [f for f in faces if f.is_valid and len(f.verts) > 4]
        if big:
            bmesh.ops.triangulate(self.bm, faces=big)


def lathe_rings(g, center, prof, seg, axis=Vector((0, 1, 0)), ref=Vector((1, 0, 0))):
    """prof: [(r, h)] -> rings of verts around `axis` through `center`."""
    axis, ref = axis.normalized(), ref.normalized()
    n2 = axis.cross(ref)
    rings = []
    for r, h in prof:
        c = center + axis * h
        if r < 1e-9:
            rings.append([g.bm.verts.new(c)] * seg)
        else:
            rings.append(g.verts([c + ref * (r * math.cos(2 * math.pi * i / seg)) + n2 * (r * math.sin(2 * math.pi * i / seg))
                                  for i in range(seg)]))
    return rings


def rrect(hx, hz, rc, y, seg=6, cx=0.0, cz=0.0):
    rc = max(1e-4, min(rc, hx, hz))
    pts = []
    for ox, oz, a0 in ((hx - rc, hz - rc, 0), (-hx + rc, hz - rc, 90), (-hx + rc, -hz + rc, 180), (hx - rc, -hz + rc, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append(Vector((cx + ox + rc * math.cos(a), y, cz + oz + rc * math.sin(a))))
    return pts


def rounded_block(g, center, hx, hz, rc, profile, mat, uvf, top=True, bottom=True, seg=6):
    """Rounded-rectangle solid from rows [(inset, y)] (y relative to center.y)."""
    rings = [g.verts(rrect(hx - d, hz - d, rc - d, center.y + y, seg, center.x, center.z)) for d, y in profile]
    faces = g.loft(rings, mat, uvf)
    if bottom:
        faces += g.cap(rings[0][::-1], mat, uvf)
    if top:
        faces += g.cap(rings[-1], mat, uvf)
    g.orient(faces, center + Vector((0, (profile[0][1] + profile[-1][1]) / 2, 0)))
    g.finish_caps(faces)
    return faces


def set_uv_polar(g, faces, center, scale):
    """Fibres run radially over the top and straight down the skirt, like the picture."""
    for f in faces:
        ths = []
        for lp in f.loops:
            d = lp.vert.co - center
            ths.append(math.atan2(d.z, d.x))
        if max(ths) - min(ths) > math.pi:                      # face straddles the seam
            ths = [t + 2 * math.pi if t < 0 else t for t in ths]
        for lp, th in zip(f.loops, ths):
            d = lp.vert.co - center
            r = math.hypot(d.x, d.z)
            lp[g.uv].uv = (th * 0.14 * scale, (r + (0.075 - d.y)) * scale)


def planar_xz(scale, origin=Vector(), off=(0.0, 0.0)):
    return lambda co: ((co.x - origin.x) * scale + off[0], (co.z - origin.z) * scale + off[1])


# ---------------------------------------------------------------- speakerphone
def lobe(theta):
    h = ((1 - math.cos(4 * theta)) / 2) ** 2.2        # 0 on a lobe, 1 in a notch
    return 0.166 - 0.036 * h, 0.014 + 0.022 * h         # outer radius, skirt bottom height


SHELL_ROWS = [  # (radius fraction 0..1 between the chrome ring and the outer edge, y) ; None = skirt rows
    (0.0, 0.0705), (0.2, 0.0700), (0.45, 0.0680), (0.68, 0.0640), (0.85, 0.0585),
    (0.95, 0.0530), (0.995, 0.0495), (1.0, 0.0460), (0.985, 0.0440)]
R_IN = 0.1035


def shell_point(theta, frac, y):
    ro, _ = lobe(theta)
    r = R_IN + (ro - R_IN) * frac
    return Vector((r * math.cos(theta), y, r * math.sin(theta)))


def build_speakerphone():
    seg = 176
    body, grille, ring, led = Geo(), Geo(), Geo(), Geo()
    uv_shell = planar_xz(3.0, SPK)

    # base puck with the side-firing speaker fabric, rubber feet
    prof = [(0, 0.003), (0.122, 0.003), (0.127, 0.007), (0.127, 0.046), (0.0, 0.046)]
    rings = lathe_rings(body, SPK, prof, 96)
    f = body.loft(rings, "Fabric_Grille", planar_xz(4.0, SPK))
    body.orient(f, SPK + Vector((0, 0.02, 0)))
    for a in range(4):
        t = math.radians(45 + 90 * a)
        c = SPK + Vector((0.09 * math.cos(t), 0, 0.09 * math.sin(t)))
        fr = lathe_rings(body, c, [(0, 0), (0.011, 0), (0.011, 0.003), (0, 0.003)], 16)
        ff = body.loft(fr, "Rubber", planar_xz(4.0))
        body.orient(ff, c + Vector((0, 0.0015, 0)))

    # lobed shell: round at the chrome ring, four lobes outward, skirt lower on the lobes
    rows = []
    for frac, y in SHELL_ROWS:
        rows.append([SPK + shell_point(2 * math.pi * i / seg, frac, y) for i in range(seg)])
    skirt = []
    for s, frac in ((0.45, 0.99), (0.9, 1.005), (1.0, 1.01)):
        pts = []
        for i in range(seg):
            th = 2 * math.pi * i / seg
            _, yb = lobe(th)
            pts.append(SPK + shell_point(th, frac, 0.044 + (yb + 0.0025 - 0.044) * s))
        skirt.append(pts)
    bottom = []
    for i in range(seg):
        th = 2 * math.pi * i / seg
        _, yb = lobe(th)
        bottom.append(SPK + shell_point(th, 1.008, yb))
    shell_rings = [body.verts(r) for r in rows + skirt]
    trim_top = shell_rings[-1]
    fshell = body.loft(shell_rings, "Shell_Textured", uv_shell)
    set_uv_polar(body, fshell, SPK, 3.0)
    ftrim = body.loft([trim_top, body.verts(bottom)], "Chrome", uv_shell)   # silver edge line
    body.orient(fshell + ftrim, SPK + Vector((0, 0.03, 0)))

    # top: perforated dome, LED ring, chrome ring
    gprof = [(0.0, 0.0786)] + [(0.093 * i / 10, 0.0725 + 0.0061 * (1 - (i / 10) ** 2)) for i in range(1, 11)]
    gr = lathe_rings(grille, SPK, gprof, 96)
    fg = grille.loft(gr, "Speaker_Grille", lambda co: (0.5 + (co.x - SPK.x) / 0.2, 0.5 + (co.z - SPK.z) / 0.2))
    grille.orient(fg, SPK)
    lr = lathe_rings(led, SPK, [(0.093, 0.0724), (0.0957, 0.0724), (0.0957, 0.0712)], 96)
    fl = led.loft(lr, "LED_Speaker", planar_xz(4.0, SPK))
    led.orient(fl, SPK)
    rr = lathe_rings(ring, SPK, [(0.0957, 0.0705), (0.0957, 0.0735), (0.0985, 0.0752), (0.1015, 0.0748),
                                 (0.1040, 0.0728), (0.1045, 0.0700)], 128)
    fr = ring.loft(rr, "Chrome", planar_xz(4.0, SPK))
    ring.orient(fr, SPK)

    # buttons: three keys on the grille, power and call on the shell
    keys = []
    for name, dx, icon in (("Btn_VolumeDown", -0.026, 0), ("Btn_Mute", 0.0, 1), ("Btn_VolumeUp", 0.026, 2)):
        r = math.hypot(dx, 0.004)
        y = 0.0725 + 0.0061 * (1 - (r / 0.093) ** 2)
        keys.append((name, SPK + Vector((dx, y - 0.0005, 0.004)), Vector((0, 1, 0)), icon, "pill"))
    for name, deg, icon in (("Btn_Power", 160, 3), ("Btn_Call", 20, 4)):
        th = math.radians(deg)
        p0, p1 = shell_point(th, 0.45, 0.0680), shell_point(th, 0.68, 0.0640)
        mid = shell_point(th, 0.56, 0.0662)
        tangent = (p1 - p0).normalized()
        side = Vector((-math.sin(th), 0, math.cos(th)))
        normal = side.cross(tangent).normalized()
        if normal.y < 0:
            normal = -normal
        keys.append((name, SPK + mid - normal * 0.0004, normal, icon, "round"))
    return body, grille, ring, led, keys


def build_key(kind, icon):
    """Key mesh in its own frame: base at the origin, pressing along -Y."""
    g = Geo()
    col, row = icon % 4, icon // 4
    u0, v0 = col / 4, 1 - (row + 1) / 2

    def uvf(co):
        if kind == "pill":
            return (u0 + (0.5 + co.x / 0.028) / 4, v0 + (0.5 - co.z / 0.028) / 2)
        return (u0 + (0.5 + co.x / 0.018) / 4, v0 + (0.5 - co.z / 0.018) / 2)

    if kind == "pill":
        prof = [(0.0008, 0.0), (0.0, 0.0008), (0.0, 0.0022), (0.0006, 0.0031), (0.0016, 0.0036)]
        rounded_block(g, Vector(), 0.0105, 0.0065, 0.0065, prof, "Button_Keys", uvf)
    else:
        prof = [(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.0018), (0.0058, 0.0027), (0.0035, 0.0032), (0.0, 0.0033)]
        rings = lathe_rings(g, Vector(), prof, 32)
        f = g.loft(rings, "Button_Keys", uvf)
        g.orient(f, Vector((0, 0.001, 0)))
    return g


# ---------------------------------------------------------------- camera on base
def build_camera():
    base, head, recled = Geo(), Geo(), Geo()
    prof = [(0.001, 0.0), (0.0, 0.001), (0.0, 0.0085), (0.0012, 0.0102), (0.0025, 0.0108),
            (0.018, 0.0235), (0.019, 0.0240)]
    uvb = planar_xz(6.0, CAMB)
    faces = rounded_block(base, CAMB, 0.046, 0.046, 0.006, prof, "Plastic_Black", uvb)
    # chrome chamfer along the base edge
    for f in faces:
        if f.is_valid and 0.0085 < f.calc_center_median().y - CAMB.y < 0.0109:
            f.material_index = base.mat("Chrome")
    # joint post and tightening knob
    joint = CAMB + Vector((0.016, 0.024, -0.014))
    pr = lathe_rings(base, joint, [(0, -0.001), (0.0075, -0.001), (0.0075, 0.011), (0.0055, 0.013), (0, 0.013)], 24)
    base.orient(base.loft(pr, "Plastic_Black", uvb), joint + Vector((0, 0.006, 0)))
    knob_c = joint + Vector((0.0085, 0.009, 0))
    kr = lathe_rings(base, knob_c, [(0, 0), (0.005, 0), (0.0055, 0.002), (0.0055, 0.009), (0.005, 0.011), (0, 0.011)], 12,
                     axis=Vector((1, 0, 0)), ref=Vector((0, 1, 0)))
    base.orient(base.loft(kr, "Plastic_Black", uvb), knob_c + Vector((0.0055, 0, 0)))

    # head: local frame, lens along +Z, pivot at the joint top
    L = 0.052
    c0 = Vector((0, 0.019, 0))
    hp = [(0.0, -L / 2), (0.0145, -L / 2), (0.017, -L / 2 + 0.003), (0.017, L / 2 - 0.004)]
    rings = lathe_rings(head, c0, hp, 48, axis=Vector((0, 0, 1)), ref=Vector((1, 0, 0)))
    uvh = lambda co: (co.x * 8 + 0.5, co.z * 8 + 0.5)
    fh = head.loft(rings, "Plastic_Black", uvh)
    bz = lathe_rings(head, c0, [(0.017, L / 2 - 0.004), (0.0176, L / 2 - 0.0035), (0.0176, L / 2), (0.0165, L / 2 + 0.0012),
                                (0.0125, L / 2 + 0.0012), (0.0122, L / 2 - 0.001)], 48, axis=Vector((0, 0, 1)), ref=Vector((1, 0, 0)))
    fb = head.loft(bz, "Chrome", uvh)
    ln = lathe_rings(head, c0, [(0.0122, L / 2 - 0.001), (0.006, L / 2 - 0.0005), (0.0, L / 2 - 0.0003)], 48,
                     axis=Vector((0, 0, 1)), ref=Vector((1, 0, 0)))
    fln = head.loft(ln, "Lens_Glass", uvh)
    head.orient(fh + fb + fln, c0)
    # ribbed strain relief at the back where the cable enters
    rib = [(0.0, -L / 2 - 0.028)]
    for i in range(8):
        z = -L / 2 - 0.028 + i * 0.0035
        rib += [(0.0078, z), (0.0086, z + 0.0012), (0.0086, z + 0.0023), (0.0078, z + 0.0035)]
    rib += [(0.009, -L / 2), (0.0, -L / 2 + 0.0005)]
    rr = lathe_rings(head, c0, rib, 20, axis=Vector((0, 0, 1)), ref=Vector((1, 0, 0)))
    head.orient(head.loft(rr, "Rubber", uvh), c0 + Vector((0, 0, -L / 2 - 0.014)))
    # recording LED on top of the head
    lr = lathe_rings(recled, c0 + Vector((0, 0.0168, L / 2 - 0.012)), [(0, 0), (0.0022, 0), (0.0022, 0.0012), (0, 0.0016)], 16)
    recled.orient(recled.loft(lr, "LED_Camera", uvh), c0 + Vector((0, 0.0168, L / 2 - 0.012)))

    aim = Vector((0.33, 0.10, 1.0)).normalized()
    x = Vector((0, 1, 0)).cross(aim).normalized()
    y = aim.cross(x)
    rot = Matrix((x, y, aim)).transposed()
    back_local = c0 + Vector((0, 0, -L / 2 - 0.028))
    return base, head, recled, joint + Vector((0, 0.013, 0)), rot, back_local


# ---------------------------------------------------------------- ID card reader
def build_reader():
    body, pad, led, card = Geo(), Geo(), Geo(), Geo()
    uvd = planar_xz(6.0, DOCK)
    prof = [(0.0045, 0.0), (0.0045, 0.0028), (0.0015, 0.0034), (0.0, 0.005), (0.0, 0.0292), (0.0015, 0.0322),
            (0.004, 0.0336), (0.0075, 0.034)]
    rounded_block(body, DOCK, 0.053, 0.049, 0.012, prof, "Plastic_Black", uvd)
    # silver trim band and the raised top panel
    tr = [body.verts(rrect(0.0445, 0.0405, 0.007, DOCK.y + y, 6, DOCK.x, DOCK.z)) for y in (0.0338, 0.0356)]
    f = body.loft(tr, "Chrome", uvd)
    body.orient(f, DOCK + Vector((0, 0.03, 0)))
    tprof = [(0.0, 0.0356), (0.0012, 0.0372), (0.0035, 0.0381)]
    rounded_block(body, DOCK + Vector((0, 0, 0)), 0.0442, 0.0402, 0.0068, tprof, "Plastic_Black", uvd, bottom=False)
    # card rest at the back
    zb = DOCK.z - 0.036
    out = [(zb, 0.0375), (zb + 0.006, 0.0375), (zb + 0.0005, 0.066), (zb - 0.0055, 0.066)]
    rest_c = DOCK + Vector((0, 0.05, -0.036))
    v0 = body.verts([Vector((DOCK.x - 0.038, y, z)) for z, y in out])
    v1 = body.verts([Vector((DOCK.x + 0.038, y, z)) for z, y in out])
    fs = [body.bm.faces.new(v0), body.bm.faces.new(v1[::-1])]
    for i in range(4):
        j = (i + 1) % 4
        fs.append(body.bm.faces.new((v0[i], v1[i], v1[j], v0[j])))
    for fc in fs:
        fc.material_index = body.mat("Plastic_Black")
    body.set_uv(fs, uvd)
    body.orient(fs, rest_c)

    # NFC pad (its own object: the card trigger lives here)
    pc = DOCK + Vector((0, 0.0381, 0.006))
    rounded_block(pad, pc, 0.026, 0.026, 0.005, [(0.0, 0.0), (0.0, 0.0006), (0.0006, 0.0010)], "NFC_Pad",
                  lambda co: (0.5 + (co.x - pc.x) / 0.052, 0.5 - (co.z - pc.z) / 0.052), bottom=False)
    # status LED
    lc = DOCK + Vector((0.034, 0.0381, 0.03))
    lr = lathe_rings(led, lc, [(0, 0), (0.0022, 0), (0.0022, 0.0008), (0, 0.0011)], 16)
    led.orient(led.loft(lr, "LED_Reader", uvd), lc)

    # sample ID card (credit-card size, 0.76 mm)
    cw, ch = 0.0856 / 2, 0.054 / 2
    rounded_block(card, Vector(), cw, ch, 0.003, [(0.0, 0.0), (0.0, 0.00076)], "IdCard_Print",
                  lambda co: (0.5 + co.x / (2 * cw), 0.5 - co.z / (2 * ch)), seg=4)
    keys = [("Btn_ReaderConfirm", pc + Vector((0, 0.001, 0.019)), Vector((0, 1, 0)), 5, "pill_small"),
            ("Btn_ReaderClear", DOCK + Vector((-0.03, 0.019, 0.049)), Vector((0, 0, 1)), 6, "pill_small")]
    return body, pad, led, card, keys


# ---------------------------------------------------------------- cables and clamp
def bezier_tube(name, pts, radius):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = 20
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    ob = bpy.data.objects.new(name + "_curve", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


def build_clamp(p, tangent):
    g = Geo()
    t = Vector((tangent.x, 0, tangent.z)).normalized()
    up = Vector((0, 1, 0))
    b = t.cross(up).normalized()          # horizontal, across the cable
    frame = Matrix((t, up, b)).transposed()

    def P(x, y, z):
        return p + frame @ Vector((x, y, z))

    def box(lo, hi, mat):
        corners = [P(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
        vs = g.verts(corners)
        idx = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        fs = [g.bm.faces.new([vs[i] for i in q]) for q in idx]
        for f in fs:
            f.material_index = g.mat(mat)
        g.set_uv(fs, lambda co: (co.x * 20, co.y * 20 + co.z * 20))
        g.orient(fs, P((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2))

    box((-0.019, -0.004, 0.0065), (0.019, 0.016, 0.0085), "Steel")        # bracket plate with ears
    box((-0.008, -0.0055, -0.0115), (0.008, 0.0095, 0.0065), "Steel")      # saddle around the cable
    for dx in (-0.005, 0.005):                                              # two locating pins behind the cable
        c = P(dx, -0.0055, -0.0088)
        rings = lathe_rings(g, c, [(0, 0), (0.0026, 0), (0.0026, 0.05), (0.0018, 0.0508), (0, 0.0508)], 16)
        g.orient(g.loft(rings, "Steel", lambda co: (co.x * 20, co.y * 20)), c + Vector((0, 0.025, 0)))
    for dx in (-0.0145, 0.0, 0.0145):                                       # three screw heads
        c = P(dx, 0.006, 0.0085)
        rings = lathe_rings(g, c, [(0, 0), (0.0028, 0), (0.0026, 0.0009), (0.0015, 0.0015), (0, 0.0017)], 16,
                            axis=b, ref=up)
        g.orient(g.loft(rings, "Steel", lambda co: (co.x * 20, co.y * 20)), c)
    return g


# ---------------------------------------------------------------- objects
def to_object(g, name, mats, pivot=Vector(), parent=None, rot=None, parent_pivot=Vector(), parent_rot=None):
    bm = g.bm
    bmesh.ops.translate(bm, verts=bm.verts, vec=-pivot)
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mname in g.mat_names:
        me.materials.append(mats[mname])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.set_sharp_from_angle(angle=math.radians(38))
    mod = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    mod.mode = "FACE_AREA"
    mod.keep_sharp = True
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = baked
    baked.name = name
    bpy.data.meshes.remove(me)
    ob.parent = parent
    local = pivot - parent_pivot
    if parent_rot is not None:
        local = parent_rot.inverted() @ local
    m = (rot.to_4x4() if rot is not None else Matrix.Identity(4))
    m.translation = local
    ob.matrix_basis = m
    return ob


def key_object(name, pos, normal, icon, kind, mats, parent, parent_pivot, parent_rot=None):
    k = build_key("pill" if kind.startswith("pill") else "round", icon)
    if kind == "pill_small":
        for v in k.bm.verts:
            v.co.x *= 0.72
            v.co.z *= 0.72
    up = normal.normalized()
    ref = Vector((1, 0, 0)) if abs(up.x) < 0.9 else Vector((0, 0, 1))
    z = ref.cross(up).normalized()
    x = up.cross(z)
    rot = Matrix((x, up, z)).transposed()
    if abs(up.z) > 0.9:                  # key on a vertical face: keep its long side horizontal
        rot = Matrix((Vector((1, 0, 0)), up, Vector((0, -1, 0)))).transposed()
    k_obj = to_object(k, name, mats, Vector(), parent)
    local = pos - parent_pivot
    if parent_rot is not None:
        local = parent_rot.inverted() @ local
    m = rot.to_4x4()
    m.translation = local
    k_obj.matrix_basis = m
    return k_obj


def build(mats):
    root = bpy.data.objects.new("CourtAVSystem", None)
    bpy.context.scene.collection.objects.link(root)
    parts = []

    body, grille, ring, led, keys = build_speakerphone()
    spk = to_object(body, "Speakerphone", mats, SPK, root)
    parts += [spk, to_object(grille, "Speakerphone_Grille", mats, SPK, spk, parent_pivot=SPK),
              to_object(ring, "Speakerphone_ChromeRing", mats, SPK, spk, parent_pivot=SPK),
              to_object(led, "Speakerphone_LEDRing", mats, SPK, spk, parent_pivot=SPK)]
    for name, pos, normal, icon, kind in keys:
        parts.append(key_object(name, pos, normal, icon, kind, mats, spk, SPK))

    base, head, recled, joint, rot, back_local = build_camera()
    camb = to_object(base, "CameraBase", mats, CAMB, root)
    headob = to_object(head, "Camera_Head", mats, Vector(), camb, rot, CAMB - joint)
    ledob = to_object(recled, "Camera_RecLED", mats, Vector(), headob)
    parts += [camb, headob, ledob]
    head_back = joint + rot @ back_local

    dbody, dpad, dled, dcard, dkeys = build_reader()
    dock = to_object(dbody, "IdReader", mats, DOCK, root)
    pc = DOCK + Vector((0, 0.0381, 0.006))
    parts += [dock, to_object(dpad, "IdReader_Pad", mats, pc, dock, parent_pivot=DOCK),
              to_object(dled, "IdReader_LED", mats, DOCK + Vector((0.034, 0.0381, 0.03)), dock, parent_pivot=DOCK)]
    for name, pos, normal, icon, kind in dkeys:
        parts.append(key_object(name, pos, normal, icon, kind, mats, dock, DOCK))
    card_rot = Matrix.Rotation(math.radians(-18), 3, "Y")
    parts.append(to_object(dcard, "IdCard", mats, Vector(), root, card_rot, -CARD))

    # cables: A loops round the left and runs through the clamp into the camera base, B feeds the camera head
    r = 0.0055
    a_pts = [SPK + Vector((-0.105, 0.022, -0.06)), SPK + Vector((-0.2, 0.011, -0.09)), Vector((-0.275, r, -0.03)),
             Vector((-0.2, r, 0.13)), Vector((-0.05, r, 0.2)), Vector((0.07, r, 0.255)), CAMB + Vector((-0.047, 0.006, 0.0))]
    head_dir = (rot @ Vector((0, 0, 1))).normalized()
    b_pts = [SPK + Vector((0.125, 0.024, 0.02)), Vector((0.21, 0.011, 0.02)), Vector((0.265, 0.012, 0.13)),
             head_back - head_dir * 0.045 + Vector((0, 0.004, 0)), head_back + head_dir * 0.004]
    for name, pts in (("Cable_A", a_pts), ("Cable_B", b_pts)):
        bm = bezier_tube(name, pts, r)
        g = Geo()
        g.bm.free()
        g.bm = bm
        g.uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
        g.mat("Rubber")
        g.set_uv(list(bm.faces), lambda co: (co.x * 10 + co.y * 10, co.z * 10))
        parts.append(to_object(g, name, mats, Vector(), root))
    clamp_at = Vector((-0.05, r, 0.2))
    parts.append(to_object(build_clamp(clamp_at, Vector((0.12, 0, 0.05))), "CableClamp", mats, clamp_at, root))

    root.rotation_euler = (math.pi / 2, 0, 0)    # children are stored Y-up; FBX export cancels this tilt
    return root, parts


# ---------------------------------------------------------------- export / preview
def export_fbx(path):
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=False, object_types={"EMPTY", "MESH"},
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", axis_forward="-Z", axis_up="Y",
        bake_space_transform=False, use_mesh_modifiers=True, mesh_smooth_type="OFF", use_triangles=True,
        add_leaf_bones=False, bake_anim=False, path_mode="COPY", embed_textures=True)


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
    fill.inputs["Strength"].default_value = 0.25
    backdrop = wt.nodes.new("ShaderNodeBackground")
    backdrop.inputs["Color"].default_value = (1, 1, 1, 1)
    mix = wt.nodes.new("ShaderNodeMixShader")
    ray = wt.nodes.new("ShaderNodeLightPath")
    wt.links.new(ray.outputs["Is Camera Ray"], mix.inputs["Fac"])
    wt.links.new(fill.outputs["Background"], mix.inputs[1])
    wt.links.new(backdrop.outputs["Background"], mix.inputs[2])
    wt.links.new(mix.outputs["Shader"], wt.nodes["World Output"].inputs["Surface"])
    scene.world = world
    for name, loc, energy, size in (("Key", (-0.6, -0.8, 1.0), 32, 0.8), ("Rim", (0.7, 0.6, 0.7), 14, 0.6)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
        light.data.energy = energy
        light.data.size = size
        light.location = loc
        look_at(light, (0, 0, 0.03))
        scene.collection.objects.link(light)
    bpy.ops.mesh.primitive_plane_add(size=6)
    bpy.context.active_object.is_shadow_catcher = True
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(cam)
    scene.camera = cam


def light_leds(mats, speaker=None, camera=None, reader=None):
    for name, col in (("LED_Speaker", speaker), ("LED_Camera", camera), ("LED_Reader", reader)):
        b = mats[name].node_tree.nodes["Principled BSDF"]
        b.inputs["Emission Color"].default_value = col + (1,) if col else (0, 0, 0, 1)
        b.inputs["Emission Strength"].default_value = 6.0 if col else 0.0


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
    mats = make_materials(*make_textures(args.out))
    root, parts = build(mats)
    tris = sum(len(p.vertices) - 2 for ob in parts for p in ob.data.polygons)
    print(f"[courtav] objects={len(parts)} triangles={tris}")
    fbx = os.path.join(args.out, "CourtAVSystem.fbx")
    export_fbx(fbx)
    print(f"[courtav] exported {fbx}")

    if args.render:
        setup_preview_scene()
        render_preview(os.path.join(args.out, "preview_off.jpg"), (0.02, -1.0, 0.66), (-0.085, -0.045, 0.0), 50, (1400, 1000), 128)
        light_leds(mats, speaker=(0.1, 1.0, 0.35), camera=(1.0, 0.05, 0.05), reader=(0.1, 1.0, 0.35))
        render_preview(os.path.join(args.out, "preview_on.jpg"), (-0.66, -0.78, 0.56), (-0.03, -0.04, 0.0), 47, (1400, 1000), 128)


if __name__ == "__main__":
    main()
