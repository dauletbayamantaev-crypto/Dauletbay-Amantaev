#!/usr/bin/env python3
"""
SHUKRONA RESIDENCE — logotip generatori.

Bitta manbadan barcha logotip fayllarini yaratadi:
  SVG, PDF, AI (PDF-asosli), EPS — RGB va CMYK;  PNG — shaffof fonda.

Matnlar shriftga bog'liq bo'lmasligi uchun konturga (curves/outlines) aylantirilgan.
Ishga tushirish:  pip install fonttools uharfbuzz cairosvg
                  python3 build_logo.py
"""
import datetime
import math
import os

import cairosvg
import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.join(HERE, "fonts")

# ---------------------------------------------------------------- ranglar ---
# CMYK qiymatlari ICC profil (SWOP Coated) orqali Lab bo'yicha eng yaqin moslik.
COLORS = {
    "petrol": {"hex": "#1B6A77", "cmyk": (88, 36, 34, 14)},
    "white": {"hex": "#FFFFFF", "cmyk": (0, 0, 0, 0)},
    "black": {"hex": "#000000", "cmyk": (0, 0, 0, 100)},
    "deep": {"hex": "#0F4A54", "cmyk": (94, 39, 34, 47)},
}

# ----------------------------------------------------------- geometriya -----
# Belgi (ikonka) birliklarda: kenglik 100, balandlik 116.
ICON_W, ICON_H = 100.0, 116.0
ARCH_W, ARCH_SIDE, ARCH_RISE = 54.0, 46.0, 32.0   # tashqi ravoq ochig'i
GAP = 6.0                                          # "nur" chizig'i qalinligi
SLOT_W, SLOT_DROP = 3.2, 8.0                       # ikki tavaqali eshik tirqishi
CLEAR = ICON_W / 2                                 # himoya maydoni (x)


def f(v):
    s = "%.3f" % v
    s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


class Path:
    """Absolyut koordinatali kontur: ('M',x,y) ('L',x,y) ('C',x1,y1,x2,y2,x,y) ('Z',)"""

    def __init__(self, cmds=None, evenodd=False):
        self.cmds = cmds or []
        self.evenodd = evenodd

    def moved(self, dx, dy, s=1.0):
        out = []
        for c in self.cmds:
            if c[0] == "Z":
                out.append(c)
            else:
                v = list(c[1:])
                out.append((c[0],) + tuple(v[i] * s + (dx if i % 2 == 0 else dy) for i in range(len(v))))
        return Path(out, self.evenodd)

    def bbox(self):
        xs, ys = [], []
        cur = None
        for c in self.cmds:
            if c[0] in "ML":
                cur = (c[1], c[2])
                xs.append(c[1]); ys.append(c[2])
            elif c[0] == "C":
                p0, p1, p2, p3 = cur, (c[1], c[2]), (c[3], c[4]), (c[5], c[6])
                for i in (0, 1):
                    for t in _cubic_extrema(p0[i], p1[i], p2[i], p3[i]):
                        pt = _cubic_at(p0, p1, p2, p3, t)
                        xs.append(pt[0]); ys.append(pt[1])
                xs.append(p3[0]); ys.append(p3[1])
                cur = p3
        return min(xs), min(ys), max(xs), max(ys)

    def svg(self):
        out = []
        for c in self.cmds:
            if c[0] == "Z":
                out.append("Z")
            else:
                out.append(c[0] + " ".join(f(v) for v in c[1:]))
        return "".join(out)


def _cubic_at(p0, p1, p2, p3, t):
    mt = 1 - t
    return tuple(mt ** 3 * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t ** 3 * d
                 for a, b, c, d in zip(p0, p1, p2, p3))


def _cubic_extrema(a, b, c, d):
    # hosila: 3[(b-a)(1-t)^2 + 2(c-b)(1-t)t + (d-c)t^2]
    A = -a + 3 * b - 3 * c + d
    B = 2 * (a - 2 * b + c)
    C = b - a
    ts = []
    if abs(A) < 1e-12:
        if abs(B) > 1e-12:
            ts.append(-C / B)
    else:
        disc = B * B - 4 * A * C
        if disc >= 0:
            r = math.sqrt(disc)
            ts += [(-B + r) / (2 * A), (-B - r) / (2 * A)]
    return [t for t in ts if 0 < t < 1]


def bbox_union(boxes):
    boxes = list(boxes)
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


# ------------------------------------------------------------- belgi ---------
def _arch(x0, yb, w, side, rise, c1=0.55, c2=0.35, tilt=0.30):
    """Temuriylar uslubidagi yumshoq uchli ravoq (ikki kubik Bezye yarmi)."""
    ys = yb - side
    xm = x0 + w / 2
    ya = ys - rise
    hw = w / 2
    L = [(x0, ys), (x0, ys - c1 * rise), (xm - c2 * hw, ya + tilt * c2 * hw), (xm, ya)]
    R = [(xm, ya), (x0 + w - (L[2][0] - x0), L[2][1]), (x0 + w, L[1][1]), (x0 + w, ys)]
    return L, R


def icon_paths():
    W, H = ICON_W, ICON_H
    # 1) Peshtoq: to'rtburchak blok, pastdan ravoq ochig'i kesilgan (bitta kontur)
    xl = (W - ARCH_W) / 2
    L, R = _arch(xl, H, ARCH_W, ARCH_SIDE, ARCH_RISE)
    portal = Path([
        ("M", 0, H), ("L", 0, 0), ("L", W, 0), ("L", W, H),
        ("L", xl + ARCH_W, H), ("L", *R[3]),
        ("C", *R[2], *R[1], *R[0]),
        ("C", *L[2], *L[1], *L[0]),
        ("L", xl, H), ("Z",),
    ])
    # 2) Eshik: ichki ravoq, "nur" chizig'i (GAP) bilan ajratilgan, ikki tavaqali
    iw = ARCH_W - 2 * GAP
    ixl = (W - iw) / 2
    iL, iR = _arch(ixl, H, iw, ARCH_SIDE - GAP * 0.2, ARCH_RISE - GAP * 0.8)
    apex_y = iL[3][1]
    cx = W / 2
    slot_top = apex_y + SLOT_DROP
    door = Path([
        ("M", ixl, H), ("L", *iL[0]),
        ("C", *iL[1], *iL[2], *iL[3]),
        ("C", *iR[1], *iR[2], *iR[3]),
        ("L", ixl + iw, H),
        ("L", cx + SLOT_W / 2, H), ("L", cx + SLOT_W / 2, slot_top),
        ("L", cx - SLOT_W / 2, slot_top), ("L", cx - SLOT_W / 2, H),
        ("Z",),
    ])
    return [("peshtoq", portal), ("eshik", door)]


# ------------------------------------------------------------- matn ----------
class _PathPen(BasePen):
    def __init__(self, glyphset, s, dx, dy):
        super().__init__(glyphset)
        self.s, self.dx, self.dy = s, dx, dy
        self.path = Path()
        self._last = None

    def _t(self, p):
        return (p[0] * self.s + self.dx, -p[1] * self.s + self.dy)

    def _moveTo(self, p):
        self._last = p
        self.path.cmds.append(("M",) + self._t(p))

    def _lineTo(self, p):
        self._last = p
        self.path.cmds.append(("L",) + self._t(p))

    def _curveToOne(self, p1, p2, p3):
        self._last = p3
        self.path.cmds.append(("C",) + self._t(p1) + self._t(p2) + self._t(p3))

    def _qCurveToOne(self, p1, p2):
        p0 = self._last
        c1 = (p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1]))
        c2 = (p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1]))
        self._curveToOne(c1, c2, p2)

    def _closePath(self):
        self.path.cmds.append(("Z",))

    _endPath = _closePath


class Font:
    def __init__(self, filename):
        path = os.path.join(FONTS, filename)
        self.hb = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet()
        self.upm = self.tt["head"].unitsPerEm
        self.cap = self.tt["OS/2"].sCapHeight / self.upm
        self.name = self.tt["name"].getDebugName(4)

    def glyphs(self, text, cap_height, tracking):
        """Harflarni kontur sifatida qaytaradi; bazaviy chiziq y=0, chap chet x=0."""
        size = cap_height / self.cap
        s = size / self.upm
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True, "liga": False})
        order = self.tt.getGlyphOrder()
        x = 0.0
        out = []
        for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
            pen = _PathPen(self.gs, s, x + pos.x_offset * s, -pos.y_offset * s)
            self.gs[order[info.codepoint]].draw(pen)
            out.append((text[info.cluster], pen.path))
            x += pos.x_advance * s + tracking * size
        # optik tekislash: birinchi harf konturining chap cheti x=0 bo'lsin
        bb = bbox_union(p.bbox() for _, p in out)
        return [(ch, p.moved(-bb[0], 0)) for ch, p in out], size


def text_block(font, text, cap_height, tracking=None, width=None):
    """tracking (em) yoki aniq kenglik (width) bo'yicha harflar oralig'ini tanlaydi."""
    if width is not None:
        g0, size = font.glyphs(text, cap_height, 0)
        w0 = bbox_union(p.bbox() for _, p in g0)[2]
        tracking = (width - w0) / (len(text) - 1) / size
    g, size = font.glyphs(text, cap_height, tracking)
    return g, tracking


# ------------------------------------------------------------ kompozitsiya ---
TENOR = MONT = None


def _fonts():
    global TENOR, MONT
    if TENOR is None:
        TENOR = Font("TenorSans-Regular.ttf")
        MONT = Font("Montserrat-Medium.ttf")
    return TENOR, MONT


class Logo:
    """Qatlamlar: [(qatlam_nomi, rang_kaliti, [(obyekt_nomi, Path), ...]), ...]"""

    def __init__(self, name, layers, box, bg=None):
        self.name, self.layers, self.box, self.bg = name, layers, box, bg

    @property
    def w(self):
        return self.box[2] - self.box[0]

    @property
    def h(self):
        return self.box[3] - self.box[1]


def _place(items, dx, dy):
    return [(n, p.moved(dx, dy)) for n, p in items]


def _wordmark(cap_main, cap_sub, gap_sub, align="left"):
    tenor, mont = _fonts()
    main, _ = text_block(tenor, "SHUKRONA", cap_main, tracking=0.14)
    mw = bbox_union(p.bbox() for _, p in main)[2]
    sub, _ = text_block(mont, "RESIDENCE", cap_sub, tracking=0.6)
    sw = bbox_union(p.bbox() for _, p in sub)[2]
    dx = (mw - sw) / 2 if align == "center" else 0
    # SHUKRONA bazaviy chizig'i y=cap_main; RESIDENCE bosh harf tepasi = cap_main+gap_sub
    main = _place(main, 0, cap_main)
    sub = _place(sub, dx, cap_main + gap_sub + cap_sub)
    return main, sub, mw, cap_main + gap_sub + cap_sub


def layout(kind):
    icon = icon_paths()
    if kind == "horizontal":
        cap_main, cap_sub, gap_sub, gap = 40.0, 12.0, 16.0, 32.0
        main, sub, mw, th = _wordmark(cap_main, cap_sub, gap_sub)
        ty = (ICON_H - th) / 2
        tx = ICON_W + gap
        layers = [("Belgi", icon), ("SHUKRONA", _place(main, tx, ty)), ("RESIDENCE", _place(sub, tx, ty))]
    elif kind == "vertical":
        cap_main, cap_sub, gap_sub, gap, k = 34.0, 10.5, 15.0, 36.0, 1.2
        main, sub, mw, th = _wordmark(cap_main, cap_sub, gap_sub, align="center")
        ix = (mw - ICON_W * k) / 2
        ty = ICON_H * k + gap
        layers = [("Belgi", [(n, p.moved(ix, 0, k)) for n, p in icon]),
                  ("SHUKRONA", _place(main, 0, ty)), ("RESIDENCE", _place(sub, 0, ty))]
    elif kind == "icon":
        layers = [("Belgi", icon)]
    elif kind == "wordmark":
        main, sub, mw, th = _wordmark(40.0, 12.0, 16.0, align="center")
        layers = [("SHUKRONA", main), ("RESIDENCE", sub)]
    else:
        raise ValueError(kind)
    box = bbox_union(p.bbox() for _, items in layers for _, p in items)
    # belgi to'rtburchagi aniq chegara bo'lishi uchun yaxlitlash
    box = tuple(round(v, 3) for v in box)
    return layers, box


VARIANTS = {
    # nom: (logotip rangi, fon rangi yoki None)
    "petrol": ("petrol", None),
    "inverse": ("white", "petrol"),
    "black": ("black", None),
    "white": ("white", None),
}


def make_logo(kind, variant):
    layers, box = layout(kind)
    fg, bg = VARIANTS[variant]
    colored = [(n, fg, items) for n, items in layers]
    if bg:
        pad = CLEAR
        box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    return Logo(f"shukrona_{kind}_{variant}", colored, box, bg)


# ------------------------------------------------------------ yozuvchilar ----
TITLE = "Shukrona Residence — logotip"
CREATOR = "Shukrona Residence brand kit"


def _hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def _xml_id(name):
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in name)


def write_svg(logo, path, scale=1.0):
    x0, y0 = logo.box[0], logo.box[1]
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{f(logo.w * scale)}" height="{f(logo.h * scale)}" '
        f'viewBox="0 0 {f(logo.w)} {f(logo.h)}">',
        f"<title>{TITLE}</title>",
    ]
    if logo.bg:
        parts.append(f'<rect id="Fon" x="0" y="0" width="{f(logo.w)}" height="{f(logo.h)}" '
                     f'fill="{COLORS[logo.bg]["hex"]}"/>')
    for lname, color, items in logo.layers:
        parts.append(f'<g id="{_xml_id(lname)}" fill="{COLORS[color]["hex"]}">')
        for item in items:
            oname, p = item[0], item[1]
            q = p.moved(-x0, -y0)
            rule = ' fill-rule="evenodd"' if p.evenodd else ""
            if len(item) > 2:
                rule += f' fill="{COLORS[item[2]]["hex"]}"'
            ident = f' id="{_xml_id(lname)}-{oname}"' if lname == "Belgi" or len(item) > 2 else ""
            parts.append(f'<path{ident}{rule} d="{q.svg()}"/>')
        parts.append("</g>")
    parts.append("</svg>")
    data = "\n".join(parts) + "\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(data)
    return data


PT = 72 / 25.4  # 1 mm = 2.8346 pt


def _unit_to_pt(logo):
    # 1 birlik = 0.35 mm  -> belgi kengligi 35 mm
    return 0.35 * PT


def _color_op(color, mode, stroke=False):
    if mode == "CMYK":
        c, m, y, k = (v / 100 for v in COLORS[color]["cmyk"])
        return f"{f(c)} {f(m)} {f(y)} {f(k)} {'K' if stroke else 'k'}"
    r, g, b = _hex_rgb(COLORS[color]["hex"])
    return f"{f(r)} {f(g)} {f(b)} {'RG' if stroke else 'rg'}"


def _path_ops(p, x0, y0, s, H, ps=False):
    ops = []
    for c in p.cmds:
        if c[0] == "Z":
            ops.append("h" if not ps else "cp")
            continue
        pts = []
        v = c[1:]
        for i in range(0, len(v), 2):
            pts.append(f((v[i] - x0) * s))
            pts.append(f(H - (v[i + 1] - y0) * s))
        op = {"M": "m", "L": "l", "C": "c"}[c[0]]
        ops.append(" ".join(pts) + " " + op)
    return "\n".join(ops)


def pdf_bytes(logo, mode="RGB"):
    s = _unit_to_pt(logo)
    W, H = logo.w * s, logo.h * s
    x0, y0 = logo.box[0], logo.box[1]
    layer_names = (["Fon"] if logo.bg else []) + [n for n, _, _ in logo.layers]
    content = []
    if logo.bg:
        content.append(f"/OC /L0 BDC\n{_color_op(logo.bg, mode)}\n0 0 {f(W)} {f(H)} re\nf\nEMC")
    for i, (lname, color, items) in enumerate(logo.layers):
        idx = i + (1 if logo.bg else 0)
        body = [f"/OC /L{idx} BDC", _color_op(color, mode)]
        cur = color
        for item in items:
            p = item[1]
            want = item[2] if len(item) > 2 else color
            if want != cur:
                body.append(_color_op(want, mode))
                cur = want
            body.append(_path_ops(p, x0, y0, s, H))
            body.append("f*" if p.evenodd else "f")
        body.append("EMC")
        content.append("\n".join(body))
    stream = ("\n".join(content) + "\n").encode("latin-1")

    objs = []
    n_layers = len(layer_names)
    first_ocg = 6
    ocg_refs = " ".join(f"{first_ocg + i} 0 R" for i in range(n_layers))
    props = " ".join(f"/L{i} {first_ocg + i} 0 R" for i in range(n_layers))
    objs.append(f"<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [{ocg_refs}] "
                f"/D << /Order [{ocg_refs}] /ON [{ocg_refs}] >> >> >>")
    objs.append("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    box = f"[0 0 {f(W)} {f(H)}]"
    objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox {box} /TrimBox {box} /ArtBox {box} "
                f"/Resources << /Properties << {props} >> >> /Contents 4 0 R >>")
    objs.append(None)  # 4: kontent oqimi
    now = datetime.datetime(2026, 9, 28).strftime("D:%Y%m%d000000")
    objs.append(f"<< /Title ({logo.name} - Shukrona Residence) /Creator ({CREATOR}) "
                f"/Producer ({CREATOR}) /CreationDate ({now}) >>")
    for n in layer_names:
        objs.append(f"<< /Type /OCG /Name ({n}) >>")

    out = bytearray(b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        if o is None:
            out += f"{i} 0 obj\n<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"endstream\nendobj\n"
        else:
            out += f"{i} 0 obj\n{o}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R /Info 5 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n").encode()
    return bytes(out)


def eps_text(logo, mode="CMYK"):
    s = _unit_to_pt(logo)
    W, H = logo.w * s, logo.h * s
    x0, y0 = logo.box[0], logo.box[1]

    def col(c):
        if mode == "CMYK":
            return " ".join(f(v / 100) for v in COLORS[c]["cmyk"]) + " setcmykcolor"
        return " ".join(f(v) for v in _hex_rgb(COLORS[c]["hex"])) + " setrgbcolor"

    lines = [
        "%!PS-Adobe-3.0 EPSF-3.0",
        f"%%BoundingBox: 0 0 {math.ceil(W)} {math.ceil(H)}",
        f"%%HiResBoundingBox: 0 0 {f(W)} {f(H)}",
        f"%%Title: {logo.name} - Shukrona Residence",
        f"%%Creator: {CREATOR}",
        "%%CreationDate: 2026-09-28",
        "%%DocumentData: Clean7Bit",
        "%%LanguageLevel: 2",
        "%%Pages: 1",
        "%%EndComments",
        "%%BeginProlog",
        "/m {moveto} bind def /l {lineto} bind def /c {curveto} bind def",
        "/cp {closepath} bind def /f {fill} bind def /f* {eofill} bind def",
        "%%EndProlog",
        "%%Page: 1 1",
        "gsave",
    ]
    if logo.bg:
        lines += ["% Fon", col(logo.bg), f"0 0 m {f(W)} 0 l {f(W)} {f(H)} l 0 {f(H)} l cp f"]
    for lname, color, items in logo.layers:
        lines += [f"% {lname}", col(color)]
        cur = color
        for item in items:
            p = item[1]
            want = item[2] if len(item) > 2 else color
            if want != cur:
                lines.append(col(want))
                cur = want
            lines.append(_path_ops(p, x0, y0, s, H, ps=True))
            lines.append("f*" if p.evenodd else "f")
    lines += ["grestore", "showpage", "%%EOF", ""]
    return "\n".join(lines)


def write_png(svg_data, path, width, background=None):
    cairosvg.svg2png(bytestring=svg_data.encode("utf-8"), write_to=path,
                     output_width=width, background_color=background)


# ------------------------------------------------------------ master varaq ---
def master_sheet():
    """Barcha versiyalar bitta artbordda (Illustrator/CorelDraw uchun asosiy fayl).
    Har bir versiya — alohida qatlam (fon + belgi + matn)."""
    rows = [("petrol", None), ("inverse", "petrol"), ("black", None), ("white", "deep")]
    kinds = ["horizontal", "vertical", "icon", "wordmark"]
    margin, col_gap, row_gap = 60.0, 90.0, 90.0
    built = {k: layout(k) for k in kinds}
    cell_h = max(b[1][3] - b[1][1] for b in built.values()) + 2 * CLEAR
    layers = []
    y = margin
    max_x = 0
    for variant, bg in rows:
        x = margin
        fg = VARIANTS[variant][0]
        for k in kinds:
            lay, box = built[k]
            bw, bh = box[2] - box[0], box[3] - box[1]
            cell_w = bw + 2 * CLEAR
            dx = x + CLEAR - box[0]
            dy = y + (cell_h - bh) / 2 - box[1]
            items = []
            if bg:
                rect = Path([("M", x, y), ("L", x + cell_w, y), ("L", x + cell_w, y + cell_h),
                             ("L", x, y + cell_h), ("Z",)])
                items.append(("fon", rect, bg))
            for lname, its in lay:
                items += [(f"{lname}-{n}", p) for n, p in _place(its, dx, dy)]
            label = variant if variant != "white" else "white-on-dark"
            layers.append((f"{k} - {label}", fg, items))
            x += cell_w + col_gap
        max_x = max(max_x, x - col_gap)
        y += cell_h + row_gap
    box = (0, 0, max_x + margin, y - row_gap + margin)
    return Logo("shukrona_master", layers, box)


# ------------------------------------------------------------ asosiy ---------
def main():
    out = ROOT
    dirs = {
        "svg": os.path.join(out, "02_vector_RGB", "SVG"),
        "pdf": os.path.join(out, "02_vector_RGB", "PDF"),
        "ai": os.path.join(out, "02_vector_RGB", "AI"),
        "eps": os.path.join(out, "02_vector_RGB", "EPS"),
        "cpdf": os.path.join(out, "03_vector_CMYK_print", "PDF"),
        "cai": os.path.join(out, "03_vector_CMYK_print", "AI"),
        "ceps": os.path.join(out, "03_vector_CMYK_print", "EPS"),
        "png": os.path.join(out, "04_PNG"),
        "master": os.path.join(out, "01_MASTER"),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    count = 0
    for kind in ["horizontal", "vertical", "icon", "wordmark"]:
        for variant in VARIANTS:
            logo = make_logo(kind, variant)
            n = logo.name
            svg = write_svg(logo, os.path.join(dirs["svg"], n + ".svg"))
            rgb_pdf = pdf_bytes(logo, "RGB")
            cmyk_pdf = pdf_bytes(logo, "CMYK")
            for d, data in (("pdf", rgb_pdf), ("ai", rgb_pdf), ("cpdf", cmyk_pdf), ("cai", cmyk_pdf)):
                ext = ".ai" if d.endswith("ai") else ".pdf"
                suffix = "_CMYK" if d.startswith("c") else "_RGB"
                with open(os.path.join(dirs[d], n + suffix + ext), "wb") as fh:
                    fh.write(data)
            with open(os.path.join(dirs["eps"], n + "_RGB.eps"), "w") as fh:
                fh.write(eps_text(logo, "RGB"))
            with open(os.path.join(dirs["ceps"], n + "_CMYK.eps"), "w") as fh:
                fh.write(eps_text(logo, "CMYK"))
            # PNG: shaffof fon (inverse — petrol fon bilan)
            base = 1200 if kind in ("icon",) else 2400
            write_png(svg, os.path.join(dirs["png"], n + f"_{base}px.png"), base)
            count += 1

    # Instagram avatar va ijtimoiy tarmoq belgisi (1080x1080)
    icon_layers, box = layout("icon")
    for variant, fg, bg in (("petrol-bg", "white", "petrol"), ("white-bg", "petrol", "white")):
        side = 1080.0
        s = 500 / ICON_H
        dx = (side - ICON_W * s) / 2
        dy = (side - ICON_H * s) / 2
        items = [(n, p.moved(dx, dy, s)) for n, p in icon_layers[0][1]]
        logo = Logo(f"shukrona_instagram-avatar_{variant}", [("Belgi", fg, items)], (0, 0, side, side), bg)
        svg = write_svg(logo, os.path.join(dirs["svg"], logo.name + ".svg"))
        write_png(svg, os.path.join(dirs["png"], logo.name + "_1080px.png"), 1080)

    m = master_sheet()
    svg = write_svg(m, os.path.join(dirs["master"], "Shukrona_Residence_Logo_MASTER.svg"))
    for mode in ("RGB", "CMYK"):
        data = pdf_bytes(m, mode)
        for ext in (".ai", ".pdf"):
            with open(os.path.join(dirs["master"], f"Shukrona_Residence_Logo_MASTER_{mode}{ext}"), "wb") as fh:
                fh.write(data)
        with open(os.path.join(dirs["master"], f"Shukrona_Residence_Logo_MASTER_{mode}.eps"), "w") as fh:
            fh.write(eps_text(m, mode))
    write_png(svg, os.path.join(dirs["master"], "Shukrona_Residence_Logo_MASTER_preview.png"), 2400, "#FFFFFF")
    tenor, mont = _fonts()
    print(f"{count} ta versiya tayyor. Shriftlar: {tenor.name}, {mont.name}")


if __name__ == "__main__":
    main()
