"""DA logo rebrending generatori.

Ishga tushirish:  python3 gen.py [--fonts DIR] [--out DIR]
Kerak:  pip install fonttools uharfbuzz cairosvg pillow
Shriftlar (Google Fonts, OFL): Montserrat, Cinzel, Sora, Manrope, SpaceGrotesk,
Cormorant (CormorantGaramond) — o'zgaruvchan [wght] .ttf fayllari.

Natija har bir variant uchun: .ai (PDF-mos Illustrator fayli), .pdf, svg/, png/.
Barcha matnlar konturga aylantirilgan — fayl shriftsiz ham to'g'ri ochiladi.
"""
import argparse, io, json, math, os, pathlib, shutil, zipfile

import cairosvg
import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

import icons
from icons import f

ap = argparse.ArgumentParser()
ap.add_argument("--fonts", default=os.environ.get("DA_FONTS", "fonts"))
ap.add_argument("--out", default="..")
ap.add_argument("--dist", default=None, help="ZIP va taqdimot sahifasi uchun papka")
args = ap.parse_args()
FONTS = pathlib.Path(args.fonts)
OUT = pathlib.Path(args.out).resolve()
DIST = pathlib.Path(args.dist).resolve() if args.dist else OUT / "_dist"
TOOLS = pathlib.Path(__file__).resolve().parent


# ------------------------------------------------------------------ shriftlar
class Face:
    _cache = {}

    def __new__(cls, file, wght):
        key = (file, wght)
        if key not in cls._cache:
            o = super().__new__(cls)
            o._init(file, wght)
            cls._cache[key] = o
        return cls._cache[key]

    def _init(self, file, wght):
        path = str(FONTS / file)
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet(location={"wght": wght})
        self.order = self.tt.getGlyphOrder()
        self.hb = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        self.hb.set_variations({"wght": wght})
        self.upm = self.tt["head"].unitsPerEm
        self.cap = self.tt["OS/2"].sCapHeight or int(self.upm * 0.7)

    def text(self, s, x, y, cap, track=0.0):
        """Matnni konturga aylantiradi. y — tayanch chiziq. Qaytaradi (path d, kenglik)."""
        sc = cap / self.cap
        buf = hb.Buffer()
        buf.add_str(s)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, {"kern": True, "liga": True})
        pen = SVGPathPen(self.gs, ntos=f)
        cx = 0
        n = len(buf.glyph_infos)
        for i, (inf, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
            tp = TransformPen(pen, (sc, 0, 0, -sc, x + (cx + pos.x_offset) * sc, y - pos.y_offset * sc))
            self.gs[self.order[inf.codepoint]].draw(tp)
            cx += pos.x_advance + (track * self.upm if i < n - 1 else 0)
        return pen.getCommands(), cx * sc

    def glyph_centered(self, name, cx, cy, height):
        bp = BoundsPen(self.gs)
        self.gs[name].draw(bp)
        x0, y0, x1, y1 = bp.bounds
        sc = height / (y1 - y0)
        pen = SVGPathPen(self.gs, ntos=f)
        tx = cx - (x0 + x1) / 2 * sc
        ty = cy + (y0 + y1) / 2 * sc
        self.gs[name].draw(TransformPen(pen, (sc, 0, 0, -sc, tx, ty)))
        return pen.getCommands()


LABEL = ("SpaceGrotesk.ttf", 500)


# ------------------------------------------------------------------ variantlar
def cmyk(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    k = 1 - max(r, g, b)
    if k >= 1:
        return (0, 0, 0, 100)
    c, m, y = ((1 - v - k) / (1 - k) for v in (r, g, b))
    return tuple(round(v * 100) for v in (c, m, y, k))


def rgb(hexc):
    return tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))


J = ("Jost.ttf", "Jost")
V = [
    dict(key="V1", slug="asl", name="Asl", icon=icons.v1,
         p=("#0B1E3F", "Ishonch ko'ki"), a=("#13B5EA", "Kiber zangori")),
    dict(key="V2", slug="uzluksiz", name="Uzluksiz", icon=icons.v2,
         p=("#15171C", "Grafit"), a=("#16C784", "Signal yashili")),
    dict(key="V3", slug="qalqon", name="Qalqon", icon=icons.v3,
         p=("#0E1A2B", "Tun ko'ki"), a=("#C9A45C", "Adolat oltini")),
    dict(key="V4", slug="kalit", name="Kalit", icon=icons.v4,
         p=("#5B1728", "Bordo"), a=("#94A3B8", "Po'lat kulrang")),
    dict(key="V5", slug="kursor", name="Kursor", icon=icons.v5,
         p=("#1F1A5A", "Chuqur indigo"), a=("#7C5CFF", "Kursor binafshasi")),
    dict(key="V6", slug="iz", name="Iz", icon=icons.v6,
         p=("#123C8C", "Qirollik ko'ki"), a=("#F2A93B", "Signal kahrabosi")),
]
for _v in V:
    _v.update(font=J, w=(500, 400), tr=(0.16, 0.32))
TAGLINE = "INTERNATIONAL LAW · CYBERSECURITY"
WHITE, BLACK = "#FFFFFF", "#000000"


def build_icon(v):
    d = v["icon"]()
    # siyoh chegaralarini rastr orqali topib, ikonkani 240 maydon markaziga joylaymiz
    body = icons.render_els(d["els"], {"p": BLACK, "a": BLACK})
    png = cairosvg.svg2png(bytestring=f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 240 240">{body}</svg>'.encode())
    x0, y0, x1, y1 = Image.open(io.BytesIO(png)).getchannel("A").getbbox()
    x0, y0, x1, y1 = x0 / 2, y0 / 2, x1 / 2, y1 / 2
    tx, ty = round(120 - (x0 + x1) / 2), round(120 - (y0 + y1) / 2)
    d["t"] = (tx, ty)
    d["ink"] = (x0 + tx, y0 + ty, x1 + tx, y1 + ty)
    v["ic"] = d


def icon_g(v, cmap, style=False):
    """Ikonka guruhi. style=True bo'lsa ranglar CSS o'zgaruvchilari orqali (HTML uchun)."""
    d = v["ic"]
    tx, ty = d["t"]
    if style:
        body = icons.render_els(d["els"], {"p": "var(--lp)", "a": "var(--la)"}, css=True)
    else:
        body = icons.render_els(d["els"], cmap)
    return f'<g id="ikonka" transform="translate({tx},{ty})">\n{body}\n</g>'


def guides_g(v, color="#FF2D8A"):
    d = v["ic"]
    tx, ty = d["t"]
    out = []
    for g in d["guides"]:
        if g[0] == "line":
            out.append(f'<line x1="{f(g[1])}" y1="{f(g[2])}" x2="{f(g[3])}" y2="{f(g[4])}"/>')
        else:
            out.append(f'<circle cx="{f(g[1])}" cy="{f(g[2])}" r="{f(g[3])}"/>')
    return (f'<g id="yordamchi-chiziqlar" transform="translate({tx},{ty})" fill="none" stroke="{color}" '
            f'stroke-width="0.75" stroke-dasharray="3 2">' + "".join(out) + "</g>")


def grid_g(color="#94A3B8"):
    lines = []
    for i in range(0, 241, 10):
        sw = "0.6" if i % 60 == 0 else "0.3"
        lines.append(f'<line x1="{i}" y1="0" x2="{i}" y2="240" stroke-width="{sw}"/><line x1="0" y1="{i}" x2="240" y2="{i}" stroke-width="{sw}"/>')
    return f'<g id="modul-tori" stroke="{color}" opacity="0.7">' + "".join(lines) + "</g>"


def wordmarks(v):
    ff = v["font"][0]
    x0, y0, x1, y1 = v["ic"]["ink"]
    ih = y1 - y0
    fn, ft = Face(ff, v["w"][0]), Face(ff, v["w"][1])
    # gorizontal: ikonka | ism (bir qator) + shior
    cap, tag, gap = round(ih * 0.15), round(ih * 0.05), round(ih * 0.1)
    tx = x1 + round(ih * 0.2)
    top = (y0 + y1) / 2 - (cap + gap + tag) / 2
    dn, wn = fn.text("DAULETBAY AMANTAEV", tx, top + cap, cap, v["tr"][0])
    dt, wt = ft.text(TAGLINE, tx, top + cap + gap + tag, tag, v["tr"][1])
    v["H"] = dict(d=dn, tag=dt, box=(x0, y0, tx + max(wn, wt) - x0, ih))
    # vertikal: ikonka ustida, ostida ism va shior (markazlangan)
    capv, tagv = round(ih * 0.13), round(ih * 0.045)
    by = y1 + round(ih * 0.2) + capv
    ty = by + round(ih * 0.1) + tagv
    cx = (x0 + x1) / 2
    wn = fn.text("DAULETBAY AMANTAEV", 0, 0, capv, v["tr"][0])[1]
    wt = ft.text(TAGLINE, 0, 0, tagv, v["tr"][1])[1]
    dn, _ = fn.text("DAULETBAY AMANTAEV", cx - wn / 2, by, capv, v["tr"][0])
    dt, _ = ft.text(TAGLINE, cx - wt / 2, ty, tagv, v["tr"][1])
    W = max(wn, wt, x1 - x0)
    v["V"] = dict(d=dn, tag=dt, box=(cx - W / 2, y0, W, ty - y0))


def svg_doc(box, inner, title, pad=0):
    x, y, w, h = box
    x, y, w, h = x - pad, y - pad, w + 2 * pad, h + 2 * pad
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(x)} {f(y)} {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}">\n'
            f'<title>{title}</title>\n{inner}\n</svg>\n')


def bg(box, color, pad):
    x, y, w, h = box
    return f'<rect id="fon" x="{f(x-pad)}" y="{f(y-pad)}" width="{f(w+2*pad)}" height="{f(h+2*pad)}" fill="{color}"/>'


def lockup_inner(v, kind, cp, ca, ct, style=False):
    fl = 'style="fill:var(--lt)"' if style else f'fill="{ct}"'
    text = f'<g id="yozuv"><path id="ism" d="{v[kind]["d"]}" {fl}/><path id="shior" d="{v[kind]["tag"]}" {fl}/></g>'
    return icon_g(v, {"p": cp, "a": ca}, style) + "\n" + text


# ------------------------------------------------------------------ fayllar
def write_variant(v):
    k, slug = v["key"], v["slug"]
    P, A = v["p"][0], v["a"][0]
    base = f"DA-{k}-{v['name'].replace(' ', '')}"
    root = OUT / f"{k}-{slug}"
    (root / "svg").mkdir(parents=True, exist_ok=True)
    (root / "png").mkdir(parents=True, exist_ok=True)
    icbox = (0, 0, 240, 240)
    ttl = f"Dauletbay Amantaev — {k} {v['name']}"
    pad = 24
    files = {
        "ikonka": svg_doc(icbox, icon_g(v, {"p": P, "a": A}), ttl),
        "ikonka-oq": svg_doc(icbox, icon_g(v, {"p": WHITE, "a": A}), ttl),
        "ikonka-mono": svg_doc(icbox, icon_g(v, {"p": BLACK, "a": BLACK}), ttl),
        "gorizontal": svg_doc(v["H"]["box"], lockup_inner(v, "H", P, A, P), ttl, pad),
        "gorizontal-invers": svg_doc(v["H"]["box"], bg(v["H"]["box"], P, pad) + lockup_inner(v, "H", WHITE, A, WHITE), ttl, pad),
        "gorizontal-mono": svg_doc(v["H"]["box"], lockup_inner(v, "H", BLACK, BLACK, BLACK), ttl, pad),
        "vertikal": svg_doc(v["V"]["box"], lockup_inner(v, "V", P, A, P), ttl, pad),
        "vertikal-invers": svg_doc(v["V"]["box"], bg(v["V"]["box"], P, pad) + lockup_inner(v, "V", WHITE, A, WHITE), ttl, pad),
        "qurilish-tori": svg_doc(icbox, '<rect id="fon" width="240" height="240" fill="#FFFFFF"/>' + grid_g()
                                 + icon_g(v, {"p": P, "a": A}) + guides_g(v), ttl + " — qurilish to'ri"),
    }
    for name, s in files.items():
        (root / "svg" / f"{base}-{name}.svg").write_text(s)

    # PNG
    def png(svg, width, path, bgc=None):
        data = cairosvg.svg2png(bytestring=svg.encode(), output_width=width, background_color=bgc)
        (root / "png" / path).write_bytes(data)

    png(files["ikonka"], 1024, "ikonka-1024.png")
    png(files["gorizontal"], 2400, "gorizontal-2400.png")
    png(files["gorizontal-invers"], 2400, "gorizontal-invers-2400.png")
    png(files["vertikal"], 1600, "vertikal-1600.png")
    app = svg_doc((0, 0, 240, 240), f'<rect width="240" height="240" fill="{P}"/><g transform="translate(120,120) scale(0.66) translate(-120,-120)">'
                  + icon_g(v, {"p": WHITE, "a": A}) + "</g>", ttl)
    png(app, 1024, "ilova-ikonka-1024.png")
    ava = svg_doc((0, 0, 240, 240), '<rect width="240" height="240" fill="#FFFFFF"/><g transform="translate(120,120) scale(0.62) translate(-120,-120)">'
                  + icon_g(v, {"p": P, "a": A}) + "</g>", ttl)
    png(ava, 1024, "avatar-1024.png")
    big = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=files["ikonka"].encode(), output_width=256)))
    big.save(root / "png" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    # Illustrator uchun taqdimot varag'i (bitta artboard)
    sheet = build_sheet(v, files)
    pdf = cairosvg.svg2pdf(bytestring=sheet.encode())
    (root / f"{base}.pdf").write_bytes(pdf)
    (root / f"{base}.ai").write_bytes(pdf)  # PDF-mos .ai: Illustrator to'g'ridan-to'g'ri ochadi
    v["base"], v["root"] = base, root
    v["files"] = files


def place(svg_file_str, x, y, scale):
    """Tayyor SVG faylni varaq ichiga joylash (ichki viewBox bilan)."""
    head, rest = svg_file_str.split("<svg ", 1)
    attrs, body = rest.split(">", 1)
    vb = attrs.split('viewBox="')[1].split('"')[0]
    vx, vy, vw, vh = map(float, vb.split())
    body = body.rsplit("</svg>", 1)[0]
    body = body.split("</title>", 1)[1] if "</title>" in body else body
    return (f'<g transform="translate({f(x)},{f(y)}) scale({f(scale)}) translate({f(-vx)},{f(-vy)})">{body}</g>',
            vw * scale, vh * scale)


def build_sheet(v, files):
    lf = Face(*LABEL)
    parts, M = [], 80
    muted = "#6B7280"

    def label(s, x, y):
        d, _ = lf.text(s.upper(), x, y, 10, 0.16)
        parts.append(f'<path d="{d}" fill="{muted}"/>')

    t, _ = lf.text(f"DAULETBAY AMANTAEV  /  {v['key']} {v['name'].upper()}", M, 92, 22, 0.1)
    parts.append(f'<path d="{t}" fill="{v["p"][0]}"/>')
    t, _ = lf.text("LOGO REBRENDING  ·  INTERNATIONAL LAW & CYBERSECURITY", M, 122, 11, 0.18)
    parts.append(f'<path d="{t}" fill="{muted}"/>')

    y = 180
    label("Qurilish to'ri", M, y - 14)
    g, w, h = place(files["qurilish-tori"], M, y, 1)
    parts.append(g)
    label("Ikonka", M + 280, y - 14)
    g, w, h = place(files["ikonka"], M + 280, y, 1)
    parts.append(g)
    label("Gorizontal", M + 560, y - 14)
    g, hw, hh = place(files["gorizontal"], M + 560, y + (240 - (v["H"]["box"][3] + 48)) / 2, 1)
    parts.append(g)
    right = M + 560 + hw

    y = 490
    label("Invers (to'q fon)", M, y - 14)
    g, iw, ih = place(files["gorizontal-invers"], M, y, 1)
    parts.append(g)
    sc = 300 / (v["V"]["box"][3] + 48)
    label("Vertikal", M + iw + 60, y - 14)
    g, vw, vh = place(files["vertikal"], M + iw + 60, y, sc)
    parts.append(g)
    g, vw2, vh2 = place(files["vertikal-invers"], M + iw + 60 + vw + 40, y, sc)
    parts.append(g)
    right = max(right, M + iw + 60 + vw + 40 + vw2)

    y = max(490 + ih, 490 + vh) + 70
    label("Monoxrom", M, y - 14)
    g, w, h = place(files["ikonka-mono"], M, y, 0.8)
    parts.append(g)
    g, mw, mh = place(files["gorizontal-mono"], M + 220, y + (192 - (v["H"]["box"][3] + 48) * 0.8) / 2, 0.8)
    parts.append(g)
    sx = M + 220 + mw + 60
    label("Ranglar", sx, y - 14)
    for i, (hexc, nm) in enumerate((v["p"], v["a"])):
        x = sx + i * 190
        parts.append(f'<rect x="{f(x)}" y="{f(y)}" width="170" height="110" fill="{hexc}"/>')
        c = cmyk(hexc)
        for j, line in enumerate((nm, f"HEX {hexc}", "RGB " + " ".join(map(str, rgb(hexc))), "CMYK " + " ".join(map(str, c)))):
            d, _ = lf.text(line.upper(), x, y + 134 + j * 18, 9, 0.08)
            parts.append(f'<path d="{d}" fill="{"#111827" if j == 0 else muted}"/>')
    right = max(right, sx + 360)
    W = right + M
    H = y + 230
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(W)} {f(H)}" '
            f'width="{f(W)}" height="{f(H)}"><rect width="{f(W)}" height="{f(H)}" fill="#FFFFFF"/>' + "".join(parts) + "</svg>")


# ------------------------------------------------------------------ asosiy
def main():
    for v in V:
        build_icon(v)
        wordmarks(v)
        write_variant(v)
        print(v["key"], "tayyor:", v["root"].name)
    DIST.mkdir(parents=True, exist_ok=True)
    # ZIP to'plamlari
    allz = zipfile.ZipFile(DIST / "DA-logo-rebrending-hammasi.zip", "w", zipfile.ZIP_DEFLATED)
    for v in V:
        z = zipfile.ZipFile(DIST / f"{v['base']}.zip", "w", zipfile.ZIP_DEFLATED)
        for p in sorted(v["root"].rglob("*")):
            if p.is_file():
                arc = f"{v['base']}/{p.relative_to(v['root'])}"
                z.write(p, arc)
                allz.write(p, f"DA-logo-rebrending/{arc}")
        z.close()
    readme = OUT / "README.md"
    if readme.exists():
        allz.write(readme, "DA-logo-rebrending/README.md")
    allz.close()
    # taqdimot sahifasi uchun ma'lumot
    meta = []
    for v in V:
        meta.append(dict(
            key=v["key"], slug=v["slug"], name=v["name"], base=v["base"],
            p=v["p"], a=v["a"], font=v["font"][1],
            p_rgb=rgb(v["p"][0]), a_rgb=rgb(v["a"][0]), p_cmyk=cmyk(v["p"][0]), a_cmyk=cmyk(v["a"][0]),
            icon=icon_g(v, None, style=True), guides=guides_g(v), H=v["H"], V=v["V"],
            Hsym=lockup_inner(v, "H", None, None, None, style=True),
            Vsym=lockup_inner(v, "V", None, None, None, style=True),
        ))
    (DIST / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    (DIST / "grid.svg.txt").write_text(grid_g())
    print("dist:", DIST)


if __name__ == "__main__":
    main()
