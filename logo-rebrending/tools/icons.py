"""DA monogrammasi — umumiy geometrik skelet va 6 ta talqin.

Maydon 240x240 birlik, modul 10 (24x24 to'r). Barcha variantlar bitta skeletga quriladi:
  * chiziq qalinligi T = 20 (2 modul); chiziqli variantlarda 12
  * D ustuni: x = 20..40;  yuqori/pastki chiziq: y = 20..40 / 200..220
  * D yoyi: markaz (130, 120), tashqi r = 100, ichki r = 80 — aniq yarim aylana
  * ko'ndalang chiziq: y = 110..130 — yoy markazi chizig'ida
  * A oyoqlari qiyaligi 1:2 (gorizontal:vertikal), uchi y = 50
Element: (teg, atributlar, rol, rejim) — rol 'p' asosiy rang, 'a' aksent.
"""
import math

T = 20
K = 0.5  # A oyoqlari qiyaligi dx/dy


def f(n):
    s = ("%.2f" % n).rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def poly(points):
    return "M" + " L".join(f"{f(x)},{f(y)}" for x, y in points) + " Z"


def a_shape(ax, ay, base_r, base_l, t=T, k=K):
    """A shevroni: tashqi uchi (ax, ay); o'ng oyoq y=base_r gacha, chap oyoq y=base_l gacha."""
    al = math.atan(k)
    w = t / math.cos(al)
    iy = ay + t / math.sin(al)
    rx = ax + k * (base_r - ay)
    lx = ax - k * (base_l - ay)
    return [(lx, base_l), (ax, ay), (rx, base_r), (rx - w, base_r), (ax, iy), (lx + w, base_l)]


def fill(d, role, evenodd=False):
    return ("path", {"d": d, **({"fill-rule": "evenodd"} if evenodd else {})}, role, "fill")


def stroke(d, role, width=T):
    return ("path", {"d": d, "stroke-linejoin": "miter"}, role, ("stroke", width))


def circle(cx, cy, r, role):
    return ("circle", {"cx": f(cx), "cy": f(cy), "r": f(r)}, role, "fill")


# Umumiy D ramkasi: ustunning yuqori yarmi + yuqori chiziq + yoy + pastki chiziq + ko'ndalang chiziq
D_FRAME = ("M20,20 H130 A100,100 0 0 1 130,220 H20 V200 H130 A80,80 0 0 0 130,40 "
           "H40 V110 H145 V130 H20 Z")
BASE_GUIDES = [("circle", 130, 120, 100), ("circle", 130, 120, 80), ("line", 0, 120, 240, 120),
               ("line", 30, 0, 30, 240), ("line", 130, 0, 130, 240),
               ("line", 120, 50, 175, 160), ("line", 120, 50, 55, 180)]


def v1():
    """ASL — asl g'oya (A ning chizig'i D ga tutashadi), mukammal geometriya."""
    return {"els": [fill(D_FRAME, "p"), fill(poly(a_shape(120, 50, 130, 160)), "a")],
            "guides": BASE_GUIDES}


def v2():
    """UZLUKSIZ — butun DA bitta uzluksiz chiziq; uchlari — elektron sxema tugunlari."""
    t = 12
    yc = 50 + (t / 2) / math.sin(math.atan(K))   # o'q chizig'idagi uch (mitra uchi y=50 da)
    rx = 120 + K * (120 - yc)
    lx = 120 - K * (160 - yc)
    d = f"M{f(lx)},160 L120,{f(yc)} L{f(rx)},120 L30,120 V30 H130 A90,90 0 0 1 130,210 H30"
    return {"els": [stroke(d, "p", t), circle(lx, 160, 12, "a"), circle(30, 210, 12, "a")],
            "guides": BASE_GUIDES + [("circle", lx, 160, 12), ("circle", 30, 210, 12)]}


def v3():
    """QALQON — D ning pastki yarmi qalqon uchiga aylanadi; A qalqon markazida."""
    shield = ("M30,120 V30 H130 A90,90 0 0 1 220,120 C220,172 160,198 125,222 "
              "C90,198 30,172 30,120 Z")
    return {"els": [stroke(shield, "p"), fill("M30,110 H150 V130 H30 Z", "p"),
                    fill(poly(a_shape(125, 50, 130, 130)), "a")],
            "guides": [("circle", 130, 120, 90), ("line", 125, 0, 125, 240), ("line", 0, 120, 240, 120),
                       ("line", 30, 0, 30, 240), ("line", 220, 0, 220, 240),
                       ("line", 125, 50, 180, 160), ("line", 125, 50, 70, 160)]}


def v4():
    """KALIT — yaxlit D; A harfi kalit teshigi sifatida bo'sh fazoda, ko'ndalang tirqish D chetiga chiqadi."""
    cx, cy, r = 125, 88, 20
    s = (-6 + math.sqrt(36 + 4 * 1.25 * 364)) / 2.5   # trapetsiya yoni bilan aylana kesishuvi
    ix, iy = 6 + 0.5 * s, cy + s
    side = lambda y: 10 + K * (y - 96)               # trapetsiya yarim kengligi (qiyalik 1:2)
    hole = (f"M{f(cx+ix)},{f(iy)} L{f(cx+side(172))},172 L{f(cx-side(172))},172 L{f(cx-side(140))},140 "
            f"L20,140 L20,128 L{f(cx-side(128))},128 L{f(cx-ix)},{f(iy)} A{r},{r} 0 1 1 {f(cx+ix)},{f(iy)} Z")
    solid = "M20,20 H130 A100,100 0 0 1 130,220 H20 Z"
    return {"els": [fill(f"{solid} {hole}", "p", evenodd=True)],
            "guides": [("circle", 130, 120, 100), ("circle", cx, cy, r), ("line", 0, 134, 240, 134),
                       ("line", cx, 0, cx, 240), ("line", cx + 10, 96, cx + 48, 172),
                       ("line", cx - 10, 96, cx - 48, 172)]}


def v5():
    """KURSOR — "Code is Law": D ustuni matn kursoriga aylangan."""
    frame = ("M50,20 H130 A100,100 0 0 1 130,220 H50 V200 H130 A80,80 0 0 0 130,40 H50 Z "
             "M50,110 H145 V130 H50 Z")
    return {"els": [fill("M20,20 H40 V220 H20 Z", "a"), fill(frame, "p"),
                    fill(poly(a_shape(120, 50, 130, 160)), "p")],
            "guides": BASE_GUIDES + [("line", 50, 0, 50, 240)]}


def v6():
    """IZ — raqamli iz (barmoq izi): ikki ichma-ich D konturi, markazda uzluksiz A."""
    t = 12
    els = [stroke(f"M{126-r},{120-r} H126 A{r},{r} 0 0 1 126,{120+r} H{126-r} Z", "p", t) for r in (94, 66)]
    yc = 74 + (t / 2) / math.sin(math.atan(K))
    rx, lx = 118 + K * (130 - yc), 118 - K * (160 - yc)
    els.append(stroke(f"M{f(lx)},160 L118,{f(yc)} L{f(rx)},130 L60,130", "a", t))
    return {"els": els, "guides": [("circle", 126, 120, 94), ("circle", 126, 120, 66), ("line", 0, 130, 240, 130),
                                   ("line", 118, 74, 163, 164), ("line", 118, 74, 73, 164)]}


def render_els(els, colors, css=False):
    out = []
    for tag, attrs, role, mode in els:
        c = colors[role]
        a = " ".join(f'{k}="{v}"' for k, v in attrs.items())
        if mode == "fill":
            paint = f'style="fill:{c}"' if css else f'fill="{c}"'
        else:
            w = mode[1]
            paint = (f'style="fill:none;stroke:{c}" stroke-width="{w}" stroke-miterlimit="10"' if css
                     else f'fill="none" stroke="{c}" stroke-width="{w}" stroke-miterlimit="10"')
        out.append(f"<{tag} {a} {paint}/>")
    return "\n".join(out)
