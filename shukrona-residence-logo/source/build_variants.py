#!/usr/bin/env python3
"""
SHUKRONA RESIDENCE — muqobil logotip konsepsiyalari (V2–V5).

Asosiy konsepsiya (V1 «Ostona») build_logo.py da. Bu skript qo'shimcha
yo'nalishlarni o'sha geometriya va eksport vositalari bilan yaratadi:
  V2 «Derazalar» · V3 «Ravoqlar» · V4 «Hovli» · V5 «Eshik-O» (yozuvli logotip)

    python3 build_variants.py
"""
import math
import os

import build_logo as L
from build_logo import Logo, Path, bbox_union, text_block

OUT = os.path.join(L.ROOT, "06_variants")
ICON_H = 116.0  # barcha belgilar kompozitsiyada shu balandlikka keltiriladi


# ------------------------------------------------------------ primitivlar ---
def rect(x, y, w, h):
    return Path([("M", x, y), ("L", x + w, y), ("L", x + w, y + h), ("L", x, y + h), ("Z",)])


def arch_closed(x0, yb, w, side, rise):
    Lh, Rh = L._arch(x0, yb, w, side, rise)
    return Path([("M", x0, yb), ("L", *Lh[0]), ("C", *Lh[1], *Lh[2], *Lh[3]),
                 ("C", *Rh[1], *Rh[2], *Rh[3]), ("L", x0 + w, yb), ("Z",)])


def arch_band(x0, yb, w, side, rise, t):
    """Pastdan ochiq ravoq-lenta (tashqi ravoq minus ichki), bitta kontur."""
    Lo, Ro = L._arch(x0, yb, w, side, rise)
    Li, Ri = L._arch(x0 + t, yb, w - 2 * t, side - 0.2 * t, rise - 0.8 * t)
    return Path([("M", x0, yb), ("L", *Lo[0]), ("C", *Lo[1], *Lo[2], *Lo[3]),
                 ("C", *Ro[1], *Ro[2], *Ro[3]), ("L", x0 + w, yb),
                 ("L", x0 + w - t, yb), ("L", *Ri[3]), ("C", *Ri[2], *Ri[1], *Ri[0]),
                 ("C", *Li[2], *Li[1], *Li[0]), ("L", x0 + t, yb), ("Z",)])


def compound(paths):
    cmds = []
    for p in paths:
        cmds += p.cmds
    return Path(cmds, evenodd=True)


def rotated(p, deg, cx, cy):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for c in p.cmds:
        if c[0] == "Z":
            out.append(c)
            continue
        v = list(c[1:])
        pts = []
        for i in range(0, len(v), 2):
            x, y = v[i] - cx, v[i + 1] - cy
            pts += [cx + x * ca - y * sa, cy + x * sa + y * ca]
        out.append((c[0],) + tuple(pts))
    return Path(out, p.evenodd)


def normalize(items, height=None):
    """Belgini (0,0) ga ko'chiradi va kerak bo'lsa balandlikka masshtablaydi."""
    x0, y0, x1, y1 = bbox_union(p.bbox() for _, p in items)
    s = (height / (y1 - y0)) if height else 1.0
    return [(n, p.moved(-x0 * s, -y0 * s, s)) for n, p in items], (x1 - x0) * s, (y1 - y0) * s


# ------------------------------------------------------------ belgilar -----
def icon_derazalar():
    """Fasad: monolit blok, 3×3 temuriy ravoqli derazalar; pastki o'rtada — kirish eshigi."""
    W, H = 100.0, 124.0
    ww, wh, top = 19.0, 27.0, 14.0
    gx = (W - 3 * ww) / 4
    gy = 10.0
    cuts = []
    for r in range(3):
        for c in range(3):
            x = gx + c * (ww + gx)
            yb = top + wh + r * (wh + gy)
            if r == 2 and c == 1:
                # eshik: deraza kengligida, blok tagigacha tushadi
                cuts.append(arch_closed(x, H, ww, H - (yb - wh) - wh * 0.48, wh * 0.48))
            else:
                cuts.append(arch_closed(x, yb, ww, wh * 0.52, wh * 0.48))
    # eshik blok tagini kesadi — bitta tashqi kontur sifatida quramiz
    door = cuts.pop(7)
    dx = gx + (ww + gx)
    Lh, Rh = L._arch(dx, H, ww, H - (top + 2 * (wh + gy)) - wh * 0.48, wh * 0.48)
    outer = Path([("M", 0, H), ("L", 0, 0), ("L", W, 0), ("L", W, H), ("L", dx + ww, H), ("L", *Rh[3]),
                  ("C", *Rh[2], *Rh[1], *Rh[0]), ("C", *Lh[2], *Lh[1], *Lh[0]), ("L", dx, H), ("Z",)])
    del door
    return [("fasad", compound([outer] + cuts))]


def icon_ravoqlar(n=3, t=7.5, gap=6.0):
    """Ichma-ich ravoqlar: peshtoq chuqurligi, qatlamlar — oila avlodlari."""
    items = []
    x, w, side, rise = 0.0, 100.0, 64.0, 46.0
    for i in range(n):
        items.append((f"ravoq-{i + 1}", arch_band(x, 120, w, side, rise, t)))
        d = t + gap
        x, w, side, rise = x + d, w - 2 * d, side - 0.2 * d, rise - 0.8 * d
    items.append(("eshik", arch_closed(x, 120, w, side, rise)))
    return items


def icon_hovli(c=28.0, gap=4.6):
    """Reja: umumiy hovli atrofida to'rt bino (45° burilgan — koshin naqshi kabi)."""
    h, H2, s = 50 - c / 2, 50 + c / 2, gap / 2
    blocks = [rect(0, 0, H2 - s, h - s), rect(H2 + s, 0, 100 - H2 - s, H2 - s),
              rect(h + s, H2 + s, 100 - h - s, 100 - H2 - s), rect(0, h + s, h - s, 100 - h - s)]
    inner = c - 2.2 * gap
    hovuz = rect(50 - inner / 2, 50 - inner / 2, inner, inner)
    items = [(f"bino-{i + 1}", rotated(b, 45, 50, 50)) for i, b in enumerate(blocks)]
    items.append(("hovuz", rotated(hovuz, 45, 50, 50)))
    return items


def arch_ring(x0, yb, w, h, t, tb):
    """Yopiq ravoq-halqa (deraza/eshik shaklidagi «O»)."""
    outer = arch_closed(x0, yb, w, h * 0.52, h * 0.48)
    inner = arch_closed(x0 + t, yb - tb, w - 2 * t, h * 0.52 - tb - 0.2 * t, h * 0.48 - 0.8 * t)
    return compound([outer, inner])


def _stem(font, ch="I"):
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(font.gs)
    font.gs[ch].draw(bp)
    return (bp.bounds[2] - bp.bounds[0]) / font.upm / font.cap


def icon_eshik_o():
    f = L.Font("Jost-Medium.ttf")
    st = _stem(f)
    H = 120.0
    return [("eshik-o", arch_ring(0, H, H * 0.74, H, st * H * 1.02, st * H * 0.9))]


# ------------------------------------------------------------ yozuvlar -----
def wordmark(font_file, cap, tracking, arch_o=False):
    f = L.Font(font_file)
    glyphs, _ = text_block(f, "SHUKRONA", cap, tracking=tracking)
    if arch_o:
        st = _stem(f) * cap
        out = []
        for ch, p in glyphs:
            if ch == "O":
                x0, y0, x1, y1 = p.bbox()
                w = (x1 - x0) * 0.88
                xc = (x0 + x1) / 2
                p = arch_ring(xc - w / 2, 0, w, cap * 1.01, st * 1.02, st * 0.9)
            out.append((ch, p))
        glyphs = out
    return [(ch, p.moved(0, cap)) for ch, p in glyphs]


def sub_line(cap):
    mont = L.Font("Montserrat-Medium.ttf")
    g, _ = text_block(mont, "RESIDENCE", cap, tracking=0.6)
    return g


CONCEPTS = {
    "V2_Derazalar": dict(
        title="Derazalar", icon=icon_derazalar, font="Montserrat-SemiBold.ttf", cap=36.0, tracking=0.16,
        idea="Monolit fasad va temuriy ravoqli derazalar. Har bir deraza ortida — shukrona qilayotgan oila; "
             "pastki o'rtadagi eshik — xonadonga kirish.",
        values="Ishonch · oila · zamonaviy qurilish"),
    "V3_Ravoqlar": dict(
        title="Ravoqlar", icon=icon_ravoqlar, font="CormorantGaramond-SemiBold.ttf", cap=42.0, tracking=0.12,
        idea="Ichma-ich ravoqlar — peshtoqning chuqurligi va avlodlar davomiyligi. Nafis chiziqli belgi va "
             "klassik antikva premium, «butik» ohang beradi.",
        values="Premium · meros · nafislik"),
    "V4_Hovli": dict(
        title="Hovli", icon=icon_hovli, font="Jost-Regular.ttf", cap=38.0, tracking=0.22,
        idea="Yuqoridan qaralgan reja: umumiy hovli atrofida to'rt bino, markazda hovuz. 45° burilgan shakl "
             "koshin naqshini eslatadi. Mahalla, qo'shnichilik, xavfsiz hovli.",
        values="Jamoa · osoyishtalik · geometrik zamonaviylik"),
    "V5_Eshik-O": dict(
        title="Eshik-O", icon=icon_eshik_o, font="Jost-Medium.ttf", cap=40.0, tracking=0.16, arch_o=True,
        wordmark_only=True,
        idea="Yozuvli logotip: SHUKRONA so'zidagi «O» harfi temuriy ravoqli eshikka aylangan. Alohida belgi "
             "kerak emas — nomning o'zi eslab qolinadi; «O»ning o'zi avatar va favicon bo'ladi.",
        values="Soddalik · eslab qolinish · zamonaviylik"),
}


# ------------------------------------------------------------ kompozitsiya -
def lockup(cid, kind):
    c = CONCEPTS[cid]
    icon, iw, ih = normalize(c["icon"](), ICON_H)
    main = wordmark(c["font"], c["cap"], c["tracking"], c.get("arch_o", False))
    mw = bbox_union(p.bbox() for _, p in main)[2]
    if kind == "icon":
        layers = [("Belgi", icon)]
    elif kind == "horizontal" and c.get("wordmark_only"):
        sub_cap, gap_sub = 12.0, 16.0
        sub = sub_line(sub_cap)
        sw = bbox_union(p.bbox() for _, p in sub)[2]
        layers = [("SHUKRONA", main),
                  ("RESIDENCE", L._place(sub, (mw - sw) / 2, c["cap"] + gap_sub + sub_cap))]
    elif kind == "horizontal":
        sub_cap, gap_sub, gap = 12.0, 16.0, 32.0
        sub = sub_line(sub_cap)
        th = c["cap"] + gap_sub + sub_cap
        ty = (ih - th) / 2
        tx = iw + gap
        layers = [("Belgi", icon), ("SHUKRONA", L._place(main, tx, ty)),
                  ("RESIDENCE", L._place(sub, tx, ty + c["cap"] + gap_sub + sub_cap))]
    elif kind == "vertical":
        k = 1.2 if not c.get("wordmark_only") else 1.0
        sub_cap, gap_sub, gap = 10.5, 15.0, 36.0
        scale = 34.0 / c["cap"]
        main_v = [(n, p.moved(0, 0, scale)) for n, p in main]
        mwv = mw * scale
        sub = sub_line(sub_cap)
        sw = bbox_union(p.bbox() for _, p in sub)[2]
        icon_v = [(n, p.moved((mwv - iw * k) / 2, 0, k)) for n, p in icon]
        ty = ih * k + gap
        layers = [("Belgi", icon_v), ("SHUKRONA", L._place(main_v, 0, ty)),
                  ("RESIDENCE", L._place(sub, (mwv - sw) / 2, ty + 34.0 + gap_sub + sub_cap))]
    else:
        raise ValueError(kind)
    box = bbox_union(p.bbox() for _, items in layers for _, p in items)
    return layers, box


def make(cid, kind, variant):
    layers, box = lockup(cid, kind)
    fg, bg = L.VARIANTS[variant]
    if bg:
        pad = L.CLEAR
        box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    return Logo(f"shukrona_{cid.split('_')[0]}_{kind}_{variant}", [(n, fg, it) for n, it in layers], box, bg)


def sheet(rows, name, margin=60.0, col_gap=90.0, row_gap=90.0):
    """rows: [[(label, layers, box, fg, bg), ...], ...] -> bitta artbord, har biri alohida qatlam."""
    layers = []
    cell_h = max(b[3] - b[1] for row in rows for _, _, b, _, _ in row) + 2 * L.CLEAR
    y = margin
    max_x = 0
    for row in rows:
        x = margin
        for label, lay, box, fg, bg in row:
            bw, bh = box[2] - box[0], box[3] - box[1]
            cw = bw + 2 * L.CLEAR
            dx, dy = x + L.CLEAR - box[0], y + (cell_h - bh) / 2 - box[1]
            items = []
            if bg:
                items.append(("fon", rect(x, y, cw, cell_h), bg))
            for lname, its in lay:
                items += [(f"{lname}-{n}", p) for n, p in L._place(its, dx, dy)]
            layers.append((label, fg, items))
            x += cw + col_gap
        max_x = max(max_x, x - col_gap)
        y += cell_h + row_gap
    return Logo(name, layers, (0, 0, max_x + margin, y - row_gap + margin))


# ------------------------------------------------------------ eksport ------
def export(logo, folder, png_width):
    os.makedirs(folder, exist_ok=True)
    sub = {k: os.path.join(folder, k) for k in ("AI", "EPS", "SVG", "PNG")}
    for d in sub.values():
        os.makedirs(d, exist_ok=True)
    svg = L.write_svg(logo, os.path.join(sub["SVG"], logo.name + ".svg"))
    for mode in ("RGB", "CMYK"):
        with open(os.path.join(sub["AI"], f"{logo.name}_{mode}.ai"), "wb") as fh:
            fh.write(L.pdf_bytes(logo, mode))
    with open(os.path.join(sub["EPS"], f"{logo.name}_CMYK.eps"), "w") as fh:
        fh.write(L.eps_text(logo, "CMYK"))
    L.write_png(svg, os.path.join(sub["PNG"], f"{logo.name}.png"), png_width)
    return svg


def main():
    os.makedirs(OUT, exist_ok=True)
    for cid in CONCEPTS:
        folder = os.path.join(OUT, cid)
        for kind in ("horizontal", "vertical", "icon"):
            for variant in ("petrol", "inverse"):
                export(make(cid, kind, variant), folder, 1200 if kind == "icon" else 2400)
        rows = []
        for variant in ("petrol", "inverse"):
            fg, bg = L.VARIANTS[variant]
            rows.append([(f"{k} - {variant}", *lockup(cid, k), fg, bg) for k in ("horizontal", "vertical", "icon")])
        m = sheet(rows, f"Shukrona_{cid}_MASTER")
        svg = L.write_svg(m, os.path.join(folder, m.name + ".svg"))
        for mode in ("RGB", "CMYK"):
            with open(os.path.join(folder, f"{m.name}_{mode}.ai"), "wb") as fh:
                fh.write(L.pdf_bytes(m, mode))
        L.write_png(svg, os.path.join(folder, m.name + "_preview.png"), 2400, "#FFFFFF")

    # Umumiy taqqoslash varag'i: V1 + V2–V5
    rows = [[("V1 Ostona", *L.layout("horizontal"), "petrol", None),
             ("V1 Ostona - belgi", *L.layout("icon"), "petrol", None)]]
    for cid in CONCEPTS:
        rows.append([(f"{cid} ", *lockup(cid, "horizontal"), "petrol", None),
                     (f"{cid} - belgi", *lockup(cid, "icon"), "petrol", None)])
    m = sheet(rows, "Shukrona_barcha_variantlar", row_gap=70.0)
    svg = L.write_svg(m, os.path.join(OUT, m.name + ".svg"))
    for mode in ("RGB", "CMYK"):
        with open(os.path.join(OUT, f"{m.name}_{mode}.ai"), "wb") as fh:
            fh.write(L.pdf_bytes(m, mode))
    L.write_png(svg, os.path.join(OUT, m.name + "_preview.png"), 2400, "#FFFFFF")
    print("Variantlar tayyor:", ", ".join(CONCEPTS))


if __name__ == "__main__":
    main()
