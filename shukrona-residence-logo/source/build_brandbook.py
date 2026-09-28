#!/usr/bin/env python3
"""
SHUKRONA RESIDENCE — brendbuk (logotip qo'llanmasi) generatori.
HTML sahifalarni yig'adi va Chromium orqali A4 (albom) PDF'ga chiqaradi.

    python3 build_logo.py        # avval logotip fayllari
    python3 build_brandbook.py   # keyin brendbuk
"""
import os
import subprocess

import build_logo as L

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "05_brandbook")
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

P = L.COLORS["petrol"]["hex"]
D = L.COLORS["deep"]["hex"]
SAND = "#C9AE85"
IVORY = "#F5F1EA"
MIST = "#DCE9E8"
INK = "#1E2629"


# ------------------------------------------------------------ SVG yordamchi --
def svg_logo(kind, fg=P, width=None, height=None, extra="", cls=""):
    layers, box = L.layout(kind)
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    size = ""
    if width:
        size = f'width="{width}"'
    elif height:
        size = f'height="{height}"'
    paths = "".join(f'<path d="{p.moved(-x0, -y0).svg()}"/>' for _, items in layers for _, p in items)
    return (f'<svg class="{cls}" {size} viewBox="0 0 {L.f(w)} {L.f(h)}" xmlns="http://www.w3.org/2000/svg">'
            f'<g fill="{fg}">{paths}</g>{extra}</svg>')


def logo_box(kind):
    _, box = L.layout(kind)
    return box[2] - box[0], box[3] - box[1]


def arch_outline():
    """Naqsh uchun ravoq konturi (belgi geometriyasidan)."""
    Lh, Rh = L._arch(0, 116, 54, 46, 32)
    return (f"M0 116V{L.f(Lh[0][1])}C{L.f(Lh[1][0])} {L.f(Lh[1][1])} {L.f(Lh[2][0])} {L.f(Lh[2][1])} "
            f"{L.f(Lh[3][0])} {L.f(Lh[3][1])}C{L.f(Rh[1][0])} {L.f(Rh[1][1])} {L.f(Rh[2][0])} {L.f(Rh[2][1])} "
            f"54 {L.f(Rh[3][1])}V116")


ARCH = arch_outline()


def pattern_svg(color, opacity, uid, w="100%", h="100%", scale=0.55):
    return (f'<svg class="pattern" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">'
            f'<defs><pattern id="{uid}" width="{80 * scale}" height="{140 * scale}" patternUnits="userSpaceOnUse">'
            f'<path d="{ARCH}" transform="translate({13 * scale} {12 * scale}) scale({scale})" fill="none" '
            f'stroke="{color}" stroke-width="{2.2}" vector-effect="non-scaling-stroke"/></pattern></defs>'
            f'<rect width="100%" height="100%" fill="url(#{uid})" opacity="{opacity}"/></svg>')


def icon_svg(fg=P, width=None, height=None):
    return svg_logo("icon", fg, width=width, height=height)


# ------------------------------------------------------------ sahifalar -----
def page(inner, cls="", num=None, section=""):
    foot = ""
    if num:
        foot = (f'<div class="foot"><span>SHUKRONA RESIDENCE · Brendbuk</span>'
                f'<span>{section}</span><span>{num:02d}</span></div>')
    return f'<section class="page {cls}">{inner}{foot}</section>'


def head(no, title, lead=""):
    lead_html = f'<p class="lead">{lead}</p>' if lead else ""
    return f'<header class="ph"><div class="kicker">{no}</div><h1>{title}</h1>{lead_html}</header>'


def cover():
    return page(f'''
      {pattern_svg("#FFFFFF", 0.07, "pc")}
      <div class="cover-in">
        {svg_logo("vertical", "#FFFFFF", width="330")}
      </div>
      <div class="cover-meta">
        <div>Logotip va brend identifikatsiyasi bo‘yicha qo‘llanma</div>
        <div>Toshkent · 2026</div>
      </div>''', "cover")


def p_task():
    values = [
        ("Shukronalik", "Nom ma’nosi — uyga, oilaga va tinch hayotga minnatdorlik. Brend iliq va samimiy ohangda gapiradi."),
        ("Ishonch", "Mustahkam qurilish va halol muloqot. Belgi — monolit, barqaror, ortiqcha detalsiz shakl."),
        ("Oila va xonadon", "Eshik — oila davrasining ostonasi, o‘zbek mehmondo‘stligining ramzi."),
        ("Premium sifat", "Bezaksiz nafislik: sokin rang, keng harf oralig‘i, aniq geometriya."),
        ("Meros va zamonaviylik", "Milliy me’morchilik kodi zamonaviy minimalizm tilida ifodalangan."),
    ]
    cards = "".join(f'<div class="val"><div class="vn">{i + 1:02d}</div><h3>{t}</h3><p>{d}</p></div>'
                    for i, (t, d) in enumerate(values))
    rows = [
        ("Nomi", "Shukrona Residence"),
        ("Asosiy nom", "SHUKRONA"),
        ("Qo‘shimcha nom", "RESIDENCE"),
        ("Asosiy rang", f'<span class="chip" style="background:{P}"></span>Petrol-firuza — #1B6A77'),
        ("Belgi", "Arxitektura motivi — juda sodda va professional"),
        ("Qo‘llanish", "Instagram reklamalari, bannerlar, xonadon kartochkalari, marketing materiallari"),
        ("Format", "Adobe Illustrator va CorelDRAW’da tahrirlanadigan vektor fayllar"),
    ]
    table = "".join(f"<tr><th>{a}</th><td>{b}</td></tr>" for a, b in rows)
    return page(f'''
      {head("01 · Vazifa", "Texnik topshiriq va brend qadriyatlari",
            "Yangi turar joy majmuasi uchun zamonaviy, premium va ishonch uyg‘otuvchi logotip.")}
      <div class="cols2">
        <table class="spec">{table}</table>
        <div class="vals">{cards}</div>
      </div>''', num=2, section="Vazifa")


def p_competitors():
    residence = ["Bobur Residence", "Baku Residence", "Depo Residence", "Darxan Residence",
                 "Zilan Residence", "Stellar Residence", "Agalarov Residence"]
    others = ["Murad Buildings · Nest One", "NRG · NRG Voha", "Golden House", "Mirabad Avenue / Mirabad Square",
              "4U Tashkent", "Resim"]
    codes = [
        ("Osmono‘par siluetlari", "Bir-biriga o‘xshash «uchta minora»", "Bitta ostona — insoniy miqyos"),
        ("Uy tomi / «chevron»", "Rieltor va ommaviy segment assotsiatsiyasi", "Tom emas — milliy ravoq"),
        ("Oltin + qora «lyuks»", "Haddan tashqari ko‘p, sovuq hashamat", "Petrol-firuza — sokin, iliq premium"),
        ("Bitta harfli monogramma", "Ma’nosiz, esda qolmaydi", "Ma’noli belgi: eshik va nur"),
        ("Trajan/Cinzel uslubidagi antikva", "Eskirgan «mehmonxona» ko‘rinishi", "Nafis grotesk — Tenor Sans"),
        ("Gradient va mayda detallar", "Kichik o‘lchamda o‘qilmaydi", "Bir rang, 24 px’da ham aniq"),
    ]
    code_rows = "".join(f'<tr><td class="c1">{a}</td><td class="c2">{b}</td><td class="c3">{c}</td></tr>'
                        for a, b, c in codes)
    res_list = "".join(f"<li><b>{n.replace(' Residence', '')}</b> Residence</li>" for n in residence)
    oth_list = "".join(f"<li>{n}</li>" for n in others)
    # pozitsiyalash xaritasi
    clusters = [
        (6, 32, "Tom belgilari"), (6, 60, "Skyline / minoralar"), (22, 71, "Ko‘k korporativ uslub"),
        (8, 84, "Oltin + qora monogrammalar"), (58, 64, "Turistik «sharqona» bezak"),
    ]
    dots = "".join(f'<div class="cl" style="left:{x}%;top:{y}%"><i></i><span>{t}</span></div>' for x, y, t in clusters)
    return page(f'''
      {head("02 · Raqobatchilar tahlili", "Bozor nimani ko‘rsatmoqda — va biz qanday ajralamiz")}
      <div class="comp">
        <div class="comp-l">
          <h4>Raqobat muhiti · Toshkent, biznes va premium segment</h4>
          <div class="lists">
            <div><div class="lt">«… Residence» nomli majmualar</div><ul class="res">{res_list}</ul></div>
            <div><div class="lt">Yirik developerlar va loyihalar</div><ul>{oth_list}</ul></div>
          </div>
          <div class="insight"><b>Xulosa 1.</b> «Residence» so‘zi toifada juda keng tarqalgan va
            ajratib turmaydi. Shu sabab urg‘u <b>SHUKRONA</b> so‘ziga beriladi, RESIDENCE — kichik yordamchi qator.</div>
          <div class="map">
            <div class="ax"><span class="a-l">← Umumiy / xalqaro</span><span class="a-r">Milliy / o‘ziga xos →</span>
              <span class="a-t">↑ Iliq / insoniy</span><span class="a-b">↓ Sovuq / korporativ</span></div>
            <div class="grid-l"></div>{dots}
            <div class="cl me" style="left:66%;top:22%">{icon_svg(P, width="22")}<span>SHUKRONA</span></div>
          </div>
        </div>
        <div class="comp-r">
          <h4>Toifadagi takrorlanuvchi vizual kodlar</h4>
          <table class="codes"><tr><th>Klishe</th><th>Muammo</th><th>Shukrona yechimi</th></tr>{code_rows}</table>
          <div class="insight"><b>Xulosa 2.</b> Raqobatchilar asosan xalqaro «universal» tilda gapiradi.
            Shukrona o‘zbek me’morchiligi kodini zamonaviy minimalizm bilan birlashtirib, bo‘sh pozitsiyani egallaydi:
            <b>milliy, iliq, lekin premium</b>.</div>
          <p class="note">Tahlil ochiq manbalardagi loyihalar ro‘yxati va toifada keng tarqalgan vizual yondashuvlar
            asosida tuzilgan; alohida kompaniyalar logotiplarining tavsifi emas.</p>
        </div>
      </div>''', num=3, section="Raqobatchilar")


def p_concept():
    # belgi + izohlar
    W, H = L.ICON_W, L.ICON_H
    items = L.icon_paths()
    icon = "".join(f'<path d="{p.svg()}" fill="{P}"/>' for _, p in items)
    notes = [
        (1, "Peshtoq", "To‘g‘ri burchakli blok — Registon peshtoqlari ramkasidan. Mustahkamlik, himoya, monolit qurilish."),
        (2, "Temuriy ravoq", "Yumshoq uchli ravoq — o‘zbek me’morchiligining taniqli belgisi. Tom ham, minora ham emas — bizning madaniy kod."),
        (3, "Nur chizig‘i", "Eshik atrofidagi ingichka oq chiziq — xonadondan taralayotgan iliqlik, shukronalik nuri."),
        (4, "Ikki tavaqali eshik", "An’anaviy o‘ymakor eshiklar kabi: oila, mehmondo‘stlik, ochiq yurak."),
    ]
    marks = [(1, 88, 18), (2, 50, 30), (3, 30, 64), (4, 58, 92)]
    pins = "".join(f'<g><circle cx="{x}" cy="{y}" r="5.2" fill="{SAND}"/><text x="{x}" y="{y + 2.4}" '
                   f'text-anchor="middle" font-size="7" font-family="Montserrat" font-weight="500" fill="#fff">{n}</text></g>'
                   for n, x, y in marks)
    lst = "".join(f'<li><span class="num">{n}</span><div><h3>{t}</h3><p>{d}</p></div></li>' for n, t, d in notes)
    return page(f'''
      {head("03 · Konsepsiya", "«Ostona» — uy ostonasi shukronalik boshlanadigan joy")}
      <div class="concept">
        <div class="c-icon"><svg viewBox="-12 -12 {W + 24} {H + 24}" width="100%">{icon}{pins}</svg></div>
        <ol class="c-list">{lst}</ol>
        <div class="c-side">
          <div class="swatch-big" style="background:{P}"><span>#1B6A77</span></div>
          <h3>Nima uchun petrol-firuza</h3>
          <p>Samarqand gumbazlaridagi firuza koshinning chuqur, zamonaviy talqini. Firuza — tinchlik, suv va hayot;
          qo‘shilgan chuqurlik — ishonch va premium darajasi.</p>
          <p class="quote">Logotip qurilish kompaniyasi haqida emas, balki uyga qaytgandagi his haqida gapiradi.</p>
        </div>
      </div>''', num=4, section="Konsepsiya")


def p_primary():
    return page(f'''
      {head("04 · Asosiy logotip", "Ikki asosiy kompozitsiya")}
      <div class="prim">
        <div class="prim-h">{svg_logo("horizontal", P, width="100%")}
          <p><b>Gorizontal — asosiy versiya.</b> Bannerlar, sayt sarlavhasi, hujjatlar, xonadon kartochkalari.</p></div>
        <div class="prim-v">{svg_logo("vertical", P, width="74%")}
          <p><b>Vertikal.</b> Kvadrat va tik formatlar: Instagram post va stories, afishalar, suvenirlar.</p></div>
      </div>''', num=5, section="Asosiy logotip")


def p_versions():
    variants = [
        ("Asosiy", "Oq va och fonlarda", P, "#FFFFFF", "1px solid #E4E1DA"),
        ("Inversiya", "Petrol fonda — reklama, bannerlar", "#FFFFFF", P, "none"),
        ("Monoxrom qora", "Bir rangli bosma, hujjatlar", "#000000", "#FFFFFF", "1px solid #E4E1DA"),
        ("Oq", "Foto va to‘q fonlar ustida", "#FFFFFF", D, "none"),
    ]
    tiles = "".join(f'<div class="vt"><div class="vt-box" style="background:{bg};border:{bd}">'
                    f'{svg_logo("horizontal", fg, width="78%")}</div><h4>{t}</h4><p>{d}</p></div>'
                    for t, d, fg, bg, bd in variants)
    return page(f'''
      {head("05 · Versiyalar", "Rang versiyalari va alohida elementlar")}
      <div class="vgrid">{tiles}</div>
      <div class="vrow">
        <div class="vt small"><div class="vt-box" style="background:#fff;border:1px solid #E4E1DA">{icon_svg(P, height="70%")}</div>
          <h4>Belgi</h4><p>Avatar, favicon, muhr, suvenir, qurilish to‘sig‘i</p></div>
        <div class="vt small"><div class="vt-box" style="background:{P}">{icon_svg("#FFFFFF", height="70%")}</div>
          <h4>Belgi · inversiya</h4><p>Instagram avatar, ilova ikonkasi</p></div>
        <div class="vt wide"><div class="vt-box" style="background:{IVORY}">{svg_logo("wordmark", P, width="62%")}</div>
          <h4>Yozuv (wordmark)</h4><p>Belgi sig‘maydigan tor joylar, hujjat kolontitullari</p></div>
      </div>''', num=6, section="Versiyalar")


def p_construction():
    W, H = L.ICON_W, L.ICON_H
    icon = "".join(f'<path d="{p.svg()}" fill="{P}"/>' for _, p in L.icon_paths())
    grid = "".join(f'<line x1="{x}" y1="-6" x2="{x}" y2="{H + 6}"/>' for x in range(0, 101, 10))
    grid += "".join(f'<line x1="-6" y1="{y}" x2="{W + 6}" y2="{y}"/>' for y in range(0, 117, 10))
    dims = (f'<g class="dim"><line x1="0" y1="-10" x2="100" y2="-10"/><text x="50" y="-13">100</text>'
            f'<line x1="-10" y1="0" x2="-10" y2="116"/><text x="-13" y="58" transform="rotate(-90 -13 58)">116</text>'
            f'<line x1="23" y1="124" x2="77" y2="124"/><text x="50" y="132">54</text>'
            f'<line x1="23" y1="70" x2="29" y2="70" class="acc"/><text x="18" y="84" class="acc">6</text></g>')
    hw, hh = logo_box("horizontal")
    x = L.CLEAR
    horiz = svg_logo("horizontal", P, width="100%")
    cs = (f'<svg viewBox="{-x} {-x} {hw + 2 * x} {hh + 2 * x}" width="100%">'
          f'<rect x="{-x}" y="{-x}" width="{hw + 2 * x}" height="{hh + 2 * x}" fill="{MIST}" opacity=".55"/>'
          f'<rect x="0" y="0" width="{hw}" height="{hh}" fill="#fff"/>'
          f'<g>{"".join(horiz.split(">", 1)[1].rsplit("</svg>", 1)[:1])}</g>'
          f'<rect x="{-x}" y="{-x}" width="{hw + 2 * x}" height="{hh + 2 * x}" fill="none" stroke="{P}" '
          f'stroke-dasharray="4 4" stroke-width="1"/>'
          f'<g class="xm"><rect x="{-x}" y="0" width="{x}" height="{x}" /><text x="{-x / 2}" y="{x / 2 + 5}">x</text>'
          f'<rect x="{hw}" y="{hh - x}" width="{x}" height="{x}"/><text x="{hw + x / 2}" y="{hh - x / 2 + 5}">x</text>'
          f'<rect x="0" y="{-x}" width="{x}" height="{x}"/><text x="{x / 2}" y="{-x / 2 + 5}">x</text></g></svg>')
    mins = [("Gorizontal", "35 mm · 140 px", svg_logo("horizontal", P, width="35mm")),
            ("Vertikal", "22 mm · 100 px", svg_logo("vertical", P, width="22mm")),
            ("Belgi", "7 mm · 24 px", icon_svg(P, width="7mm"))]
    minh = "".join(f'<div class="mn"><div class="mn-l">{l}</div><div class="mn-s">{s}</div><div class="mn-v">{v}</div></div>'
                   for l, s, v in mins)
    return page(f'''
      {head("06 · Konstruksiya", "Modul to‘r, himoya maydoni va minimal o‘lcham")}
      <div class="cons">
        <div class="cons-grid"><svg viewBox="-24 -24 {W + 40} {H + 48}" width="100%"><g class="gl">{grid}</g>{icon}{dims}</svg>
          <p>Belgi 100 × 116 modulda quriladi. Ravoq ochig‘i — 54, nur chizig‘i — 6 modul.
          Barcha fayllarda geometriya aniq va simmetrik.</p></div>
        <div class="cons-cs">{cs}
          <p><b>Himoya maydoni x</b> = belgi kengligining yarmi. Logotip atrofida kamida x masofada boshqa matn,
          rasm yoki chekka bo‘lmasligi kerak.</p></div>
        <div class="cons-min"><h4>Minimal o‘lcham</h4>{minh}
          <p>Bundan kichik o‘lchamlarda faqat belgidan foydalaning.</p></div>
      </div>''', num=7, section="Konstruksiya")


def p_colors():
    sw = [
        ("Petrol-firuza", "Asosiy rang", P, "27 · 106 · 119", "88 · 36 · 34 · 14", "#fff", 2),
        ("Chuqur petrol", "Fon, sarlavhalar", D, "15 · 74 · 84", "94 · 39 · 34 · 47", "#fff", 1),
        ("Qum", "Aksent, ikonkalar, chiziqlar", SAND, "201 · 174 · 133", "22 · 30 · 52 · 0", INK, 1),
        ("Fil suyagi", "Iliq fon", IVORY, "245 · 241 · 234", "2 · 4 · 7 · 0", INK, 1),
        ("Tuman", "Yordamchi och fon", MIST, "220 · 233 · 232", "12 · 3 · 8 · 0", INK, 1),
    ]
    cards = "".join(f'<div class="sw" style="flex:{fl}"><div class="sw-c" style="background:{c};color:{tc}">'
                    f'<b>{n}</b><span>{r}</span></div><dl><dt>HEX</dt><dd>{c}</dd><dt>RGB</dt><dd>{rgb}</dd>'
                    f'<dt>CMYK</dt><dd>{cmyk}</dd></dl></div>'
                    for n, r, c, rgb, cmyk, tc, fl in sw)
    return page(f'''
      {head("07 · Ranglar", "Rang palitrasi", "Logotip har doim bitta rangda: petrol-firuza, qora yoki oq. Qolgan ranglar — marketing materiallari uchun.")}
      <div class="swatches">{cards}</div>
      <div class="ratio"><div style="flex:55;background:{IVORY}">Fil suyagi / oq · 55%</div>
        <div style="flex:25;background:{P};color:#fff">Petrol · 25%</div>
        <div style="flex:12;background:{D};color:#fff">Chuqur · 12%</div>
        <div style="flex:8;background:{SAND}">Qum · 8%</div></div>
      <p class="note">CMYK qiymatlari ICC profil (Coated) orqali Lab bo‘yicha eng yaqin moslik sifatida hisoblangan.
        Bosmadan oldin bosmaxonada sinov nusxasi (proof) bilan tasdiqlang. Pantone kerak bo‘lsa, fizik Pantone katalogi
        bo‘yicha #1B6A77 ga eng yaqin rangni tanlang.</p>''', num=8, section="Ranglar")


def p_type():
    return page(f'''
      {head("08 · Tipografiya", "Shriftlar")}
      <div class="typo">
        <div class="tf">
          <div class="tf-aa tenor">Aa</div>
          <div><h3 class="tenor">Tenor Sans</h3><p class="role">SHUKRONA · sarlavhalar</p>
          <p class="tenor alpha">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 — o‘ g‘ sh ch</p>
          <p>Nafis gumanistik grotesk: klassik proporsiyalar, lekin zamonaviy va yengil. Logotipda harf oralig‘i +140.</p></div>
        </div>
        <div class="tf">
          <div class="tf-aa mont">Aa</div>
          <div><h3 class="mont m5">Montserrat</h3><p class="role">RESIDENCE · matn va raqamlar</p>
          <p class="mont alpha">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 — o‘ g‘ sh ch</p>
          <p>Aniq geometrik grotesk. Logotipda Medium, faqat bosh harflar, harf oralig‘i +600. Matn uchun Regular.</p></div>
        </div>
      </div>
      <div class="typo-sample">
        <div class="ts-h tenor">Har kuni shukr qilgulik uy</div>
        <div class="ts-s mont m5">3 XONALI XONADONLAR · 86,4 M² · SOTUV BOSHLANDI</div>
        <p class="mont">Ikkala shrift ham bepul (SIL Open Font License) — Google Fonts’dan yuklab olinadi va
        <code>source/fonts</code> papkasida mavjud. Logotip fayllarida matn konturga aylantirilgan, shrift o‘rnatish shart emas.</p>
      </div>''', num=9, section="Tipografiya")


def p_mockups():
    ig = (f'<div class="ig">{pattern_svg("#FFFFFF", 0.08, "pig", scale=0.42)}'
          f'<div class="ig-in">{svg_logo("vertical", "#FFFFFF", width="46%")}'
          f'<div class="ig-t tenor">Har kuni shukr<br>qilgulik uy</div>'
          f'<div class="ig-b mont">SOTUV BOSHLANDI · 1–4 XONALI</div></div></div>')
    avatar = (f'<div class="av"><div class="av-c">{icon_svg("#FFFFFF", height="44%")}</div>'
              f'<div class="av-t"><b>shukrona.residence</b><span>Turar joy majmuasi</span></div></div>')
    bb = (f'<div class="bb">{pattern_svg("#FFFFFF", 0.07, "pbb", scale=0.5)}<div class="bb-in">'
          f'<div class="bb-l">{svg_logo("horizontal", "#FFFFFF", width="96%")}</div>'
          f'<div class="bb-r"><div class="tenor">Har kuni shukr<br>qilgulik uy</div>'
          f'<span class="mont">+998 (XX) XXX-XX-XX</span></div></div></div>')
    plan = ('<svg viewBox="0 0 120 80" class="plan"><g fill="none" stroke="#1E2629" stroke-width="1.6">'
            '<rect x="2" y="2" width="116" height="76"/><line x1="52" y1="2" x2="52" y2="50"/>'
            '<line x1="2" y1="50" x2="84" y2="50"/><line x1="84" y1="2" x2="84" y2="78"/>'
            '<line x1="30" y1="50" x2="30" y2="78"/></g><g font-size="3.9" font-family="Montserrat" fill="#6B7478">'
            '<text x="27" y="27" text-anchor="middle">Yotoqxona</text><text x="68" y="27" text-anchor="middle">Mehmonxona</text>'
            '<text x="101" y="41" text-anchor="middle">Oshxona</text>'
            '<text x="16" y="65" text-anchor="middle">Hammom</text><text x="57" y="65" text-anchor="middle">Dahliz</text></g></svg>')
    card = (f'<div class="card"><div class="card-h">{svg_logo("horizontal", P, width="54%")}</div>'
            f'<div class="card-b"><div><div class="k">B blok · 7-qavat</div><div class="tenor big">3 xonali xonadon</div>'
            f'<div class="mont area">86,4 m²</div></div>{plan}</div>'
            f'<div class="card-f"><span>Narxi: so‘rov bo‘yicha</span><span>+998 (XX) XXX-XX-XX</span></div></div>')
    return page(f'''
      {head("09 · Qo‘llash", "Namunalar: Instagram, banner, xonadon kartochkasi")}
      <div class="mock">
        <div class="m1">{ig}<p>Instagram post · 4:5</p></div>
        <div class="m2">{avatar}<p>Instagram avatar — belgi aylana ichida xavfsiz</p>
          {bb}<p>Banner · 3:1 (masalan, 6 × 2 m)</p></div>
        <div class="m3">{card}<p>Xonadon kartochkasi</p></div>
      </div>
      <p class="note">Maketlardagi matn, raqam va telefon — namuna uchun.</p>''', num=10, section="Qo‘llash")


def p_donts():
    base = svg_logo("horizontal", P, width="100%")
    donts = [
        ("Cho‘zmang va siqmang", f'<div style="transform:scaleX(1.25) scaleY(.75)">{svg_logo("horizontal", P, width="80%")}</div>'),
        ("Burmang", f'<div style="transform:rotate(-12deg)">{base}</div>'),
        ("Rangini o‘zgartirmang", svg_logo("horizontal", "#C0392B", width="100%")),
        ("Soya va effekt qo‘shmang", f'<div style="filter:drop-shadow(3px 4px 2px rgba(0,0,0,.45))">'
                                     f'{svg_logo("horizontal", "#2B8FA0", width="100%")}</div>'),
        ("Tartibsiz fonga qo‘ymang", f'<div class="busy">{base}</div>'),
        ("Shriftni almashtirmang", f'<div class="fakefont">{icon_svg(P, height="46")}'
                                   f'<div><div style="font-family:DejaVu Serif;font-size:22px;letter-spacing:1px">Shukrona</div>'
                                   f'<div style="font-family:DejaVu Sans;font-size:10px;font-style:italic">residence</div></div></div>'),
    ]
    tiles = "".join(f'<div class="dt"><div class="dt-box">{v}</div><div class="dt-l"><span>✕</span>{t}</div></div>'
                    for t, v in donts)
    return page(f'''
      {head("10 · Cheklovlar", "Logotipni noto‘g‘ri qo‘llash", "Logotip faqat tayyor fayllardan olinadi va proporsiyalari saqlangan holda masshtablanadi.")}
      <div class="donts">{tiles}</div>''', num=11, section="Cheklovlar")


def p_files():
    rows = [
        ("01_MASTER", "Barcha versiyalar bitta artbordda: .ai, .eps, .pdf, .svg (RGB va CMYK). Har bir versiya — alohida qatlam."),
        ("02_vector_RGB", "Ekran uchun: Instagram, sayt, taqdimot. SVG · AI · EPS · PDF."),
        ("03_vector_CMYK_print", "Bosma uchun: banner, kartochka, buklet. AI · EPS · PDF (CMYK)."),
        ("04_PNG", "Shaffof fonli PNG (2400 px) va Instagram avatar (1080 × 1080)."),
        ("05_brandbook", "Ushbu qo‘llanma (PDF)."),
        ("source", "Generator skriptlari va shriftlar (Tenor Sans, Montserrat — SIL OFL)."),
    ]
    tr = "".join(f"<tr><td class='fd'>{a}/</td><td>{b}</td></tr>" for a, b in rows)
    names = [("horizontal", "gorizontal"), ("vertical", "vertikal"), ("icon", "belgi"), ("wordmark", "yozuv")]
    cols = [("petrol", "asosiy"), ("inverse", "petrol fonda oq"), ("black", "qora"), ("white", "oq, shaffof")]
    nm = "".join(f"<li><code>{a}</code> — {b}</li>" for a, b in names)
    cl = "".join(f"<li><code>{a}</code> — {b}</li>" for a, b in cols)
    return page(f'''
      {head("11 · Fayllar", "Fayllar tarkibi va ochish")}
      <div class="files">
        <table class="ft">{tr}</table>
        <div class="fr">
          <h4>Fayl nomlari</h4><p><code>shukrona_[kompozitsiya]_[rang]</code></p>
          <div class="two"><ul>{nm}</ul><ul>{cl}</ul></div>
          <h4>Adobe Illustrator</h4><p><b>.ai</b> fayllar PDF asosida (Illustrator CS va yangiroq versiyalar bilan mos) — to‘g‘ridan-to‘g‘ri
          ochiladi, konturlar va qatlamlar tahrirlanadi. Kerak bo‘lsa, File → Save As bilan zamonaviy .ai sifatida saqlang.</p>
          <h4>CorelDRAW</h4><p>File → Import (Ctrl+I) orqali <b>.ai</b>, <b>.eps</b>, <b>.pdf</b> yoki <b>.svg</b> ni
          oching. EPS uchun «PostScript Interpreted» rejimini tanlang — barcha shakllar egri chiziq (curves) sifatida tahrirlanadi.</p>
          <h4>Matn</h4><p>Barcha yozuvlar konturga aylantirilgan — kompyuterda shrift bo‘lmasa ham logotip buzilmaydi.</p>
        </div>
      </div>''', num=12, section="Fayllar")


CSS = f"""
@font-face {{ font-family: 'Tenor Sans'; src: url('../source/fonts/TenorSans-Regular.ttf'); }}
@font-face {{ font-family: 'Montserrat'; font-weight: 400; src: url('../source/fonts/Montserrat-Regular.ttf'); }}
@font-face {{ font-family: 'Montserrat'; font-weight: 500; src: url('../source/fonts/Montserrat-Medium.ttf'); }}
@page {{ size: 297mm 210mm; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ background: #fff; color: {INK}; font-family: 'Montserrat', sans-serif; font-size: 9.2pt; line-height: 1.5;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.tenor {{ font-family: 'Tenor Sans', serif; }}
.mont {{ font-family: 'Montserrat', sans-serif; }} .m5 {{ font-weight: 500; }}
.page {{ width: 297mm; height: 210mm; padding: 16mm 18mm 14mm; position: relative; overflow: hidden; page-break-after: always; }}
.page:last-child {{ page-break-after: auto; }}
.foot {{ position: absolute; left: 18mm; right: 18mm; bottom: 8mm; display: flex; justify-content: space-between;
  font-size: 6.8pt; letter-spacing: .14em; text-transform: uppercase; color: #8A9396; }}
.ph {{ margin-bottom: 9mm; }}
.kicker {{ font-size: 7.4pt; letter-spacing: .22em; text-transform: uppercase; color: {P}; font-weight: 500; margin-bottom: 2.5mm; }}
.ph h1 {{ font-family: 'Tenor Sans'; font-weight: 400; font-size: 23pt; line-height: 1.15; color: {D}; letter-spacing: .01em; }}
.ph .lead {{ margin-top: 2.5mm; font-size: 10pt; color: #56616A; max-width: 200mm; }}
h3 {{ font-family: 'Tenor Sans'; font-weight: 400; font-size: 12.5pt; color: {D}; }}
h4 {{ font-size: 7.4pt; letter-spacing: .16em; text-transform: uppercase; color: {P}; font-weight: 500; margin-bottom: 3mm; }}
.note {{ font-size: 7.4pt; color: #7B868A; margin-top: 4mm; max-width: 230mm; }}
code {{ font-family: 'DejaVu Sans Mono', monospace; font-size: .9em; color: {D}; background: {MIST}; padding: 0 1.2mm; border-radius: 1mm; }}
svg.pattern {{ position: absolute; inset: 0; }}

.cover {{ background: {P}; color: #fff; display: flex; align-items: center; justify-content: center; }}
.cover-in {{ position: relative; margin-top: -8mm; }}
.cover-meta {{ position: absolute; left: 18mm; right: 18mm; bottom: 12mm; display: flex; justify-content: space-between;
  font-size: 7.6pt; letter-spacing: .18em; text-transform: uppercase; opacity: .85; }}

.cols2 {{ display: grid; grid-template-columns: 1fr 1.25fr; gap: 12mm; }}
.spec {{ width: 100%; border-collapse: collapse; align-self: start; }}
.spec th, .spec td {{ text-align: left; padding: 3.1mm 0; border-bottom: 1px solid #E4E1DA; vertical-align: top; }}
.spec th {{ width: 36mm; font-weight: 500; color: #6B7478; font-size: 8pt; }}
.chip {{ display: inline-block; width: 3.4mm; height: 3.4mm; border-radius: 50%; margin-right: 2mm; vertical-align: -0.5mm; }}
.vals {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }}
.val {{ background: {IVORY}; padding: 4.5mm 5mm; border-radius: 1.2mm; }}
.val:first-child {{ grid-column: span 2; background: {P}; color: #fff; }}
.val:first-child h3 {{ color: #fff; }}
.val .vn {{ font-size: 7pt; letter-spacing: .15em; color: {SAND}; font-weight: 500; margin-bottom: 1.2mm; }}
.val p {{ margin-top: 1.4mm; font-size: 8.4pt; }}

.comp {{ display: grid; grid-template-columns: 1fr 1.12fr; gap: 11mm; }}
.lists {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; font-size: 8.3pt; }}
.lt {{ font-weight: 500; font-size: 7.6pt; color: #6B7478; margin-bottom: 1.4mm; }}
.lists ul {{ list-style: none; }} .lists li {{ padding: .6mm 0; border-bottom: 1px dotted #DDD8CF; }}
.res li b {{ font-weight: 500; }} .res li {{ color: #9AA3A6; }} .res li b {{ color: {INK}; }}
.insight {{ margin-top: 4.5mm; padding: 3.5mm 4.5mm; background: {MIST}; border-left: 1.2mm solid {P}; font-size: 8.4pt; }}
.map {{ position: relative; height: 50mm; margin-top: 5mm; border: 1px solid #E4E1DA; background: #FCFBF8; }}
.grid-l {{ position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px dashed #D6D1C7; }}
.grid-l::after {{ content: ''; position: absolute; top: 50%; left: -150mm; width: 300mm; border-top: 1px dashed #D6D1C7; }}
.map {{ overflow: hidden; }}
.ax span {{ position: absolute; font-size: 6.4pt; color: #8A9396; letter-spacing: .06em; text-transform: uppercase; }}
.ax .a-l {{ left: 2mm; top: calc(50% - 4mm); }} .ax .a-r {{ right: 2mm; top: calc(50% - 4mm); }}
.ax .a-t {{ left: calc(50% + 2mm); top: 1.5mm; }} .ax .a-b {{ left: calc(50% + 2mm); bottom: 1.5mm; }}
.cl {{ position: absolute; transform: translate(0, -50%); display: flex; align-items: center; gap: 1.4mm;
  font-size: 6.8pt; color: #6B7478; white-space: nowrap; }}
.cl i {{ width: 3mm; height: 3mm; border-radius: 50%; background: #C4C9CB; display: block; }}
.cl.me {{ color: {P}; font-weight: 500; font-size: 8pt; letter-spacing: .12em; }}
.codes {{ width: 100%; border-collapse: collapse; font-size: 8.1pt; }}
.codes th {{ text-align: left; font-size: 6.8pt; letter-spacing: .12em; text-transform: uppercase; color: #8A9396; font-weight: 500;
  padding: 0 2mm 2mm 0; border-bottom: 1px solid {P}; }}
.codes td {{ padding: 2.3mm 2mm 2.3mm 0; border-bottom: 1px solid #E4E1DA; vertical-align: top; }}
.codes .c1 {{ font-weight: 500; width: 34%; }} .codes .c2 {{ color: #7B868A; width: 33%; }} .codes .c3 {{ color: {P}; font-weight: 500; }}

.concept {{ display: grid; grid-template-columns: 70mm 1fr 66mm; gap: 11mm; align-items: start; }}
.c-icon {{ padding-top: 2mm; }}
.c-list {{ list-style: none; }}
.c-list li {{ display: flex; gap: 4mm; padding: 3.6mm 0; border-bottom: 1px solid #E4E1DA; }}
.c-list .num {{ flex: none; width: 7mm; height: 7mm; border-radius: 50%; background: {SAND}; color: #fff; font-weight: 500;
  display: flex; align-items: center; justify-content: center; font-size: 8pt; }}
.c-list p {{ margin-top: 1mm; font-size: 8.5pt; color: #4A555C; }}
.swatch-big {{ height: 34mm; border-radius: 1.2mm; display: flex; align-items: flex-end; padding: 3mm; color: #fff;
  font-size: 8pt; letter-spacing: .12em; margin-bottom: 4mm; }}
.c-side p {{ margin-top: 2mm; font-size: 8.5pt; color: #4A555C; }}
.quote {{ font-family: 'Tenor Sans'; font-size: 11.5pt !important; color: {P} !important; line-height: 1.4; margin-top: 5mm !important; }}

.prim {{ display: grid; grid-template-columns: 1.55fr 1fr; gap: 12mm; align-items: stretch; height: 128mm; }}
.prim > div {{ background: {IVORY}; border-radius: 1.2mm; padding: 10mm 12mm 8mm; display: flex; flex-direction: column;
  align-items: center; }}
.prim > div > svg {{ margin: auto 0; }}
.prim p {{ font-size: 8.4pt; color: #4A555C; align-self: flex-start; }}

.vgrid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }}
.vrow {{ display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 5mm; margin-top: 6mm; }}
.vt-box {{ height: 34mm; border-radius: 1.2mm; display: flex; align-items: center; justify-content: center; }}
.vt.small .vt-box, .vt.wide .vt-box {{ height: 42mm; }}
.vt h4 {{ margin: 2.6mm 0 .6mm; }} .vt p {{ font-size: 8pt; color: #6B7478; }}

.cons {{ display: grid; grid-template-columns: 62mm 1.35fr 0.9fr; gap: 10mm; align-items: start; }}
.cons p {{ font-size: 8.2pt; color: #4A555C; margin-top: 3mm; }}
.gl line {{ stroke: #D9E5E4; stroke-width: .4; }}
.dim line {{ stroke: {SAND}; stroke-width: .6; }} .dim text {{ font-size: 5.5px; fill: #8A7550; text-anchor: middle; font-family: Montserrat; }}
.dim .acc {{ stroke: #C0392B; fill: #C0392B; }}
.xm rect {{ fill: {SAND}; opacity: .35; }} .xm text {{ font-size: 14px; fill: #8A7550; text-anchor: middle; font-family: 'Tenor Sans'; }}
.mn {{ display: grid; grid-template-columns: 1fr auto; row-gap: 1mm; padding: 3mm 0; border-bottom: 1px solid #E4E1DA; }}
.mn-l {{ font-weight: 500; }} .mn-s {{ color: #7B868A; font-size: 8pt; }} .mn-v {{ grid-column: span 2; padding-top: 1.5mm; }}

.swatches {{ display: flex; gap: 4mm; }}
.sw-c {{ height: 58mm; border-radius: 1.2mm; padding: 4mm; display: flex; flex-direction: column; justify-content: flex-end; }}
.sw-c b {{ font-family: 'Tenor Sans'; font-weight: 400; font-size: 13pt; }} .sw-c span {{ font-size: 7.6pt; opacity: .85; }}
.sw-c {{ border: 1px solid rgba(0,0,0,.06); }}
.sw dl {{ display: grid; grid-template-columns: 11mm 1fr; margin-top: 3mm; font-size: 8pt; row-gap: .8mm; }}
.sw dt {{ color: #8A9396; font-size: 7pt; letter-spacing: .08em; }}
.ratio {{ display: flex; height: 11mm; margin-top: 8mm; border-radius: 1.2mm; overflow: hidden; font-size: 7pt; border: 1px solid #E4E1DA; }}
.ratio div {{ display: flex; align-items: center; padding-left: 3mm; white-space: nowrap; overflow: hidden; }}

.typo {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; }}
.tf {{ display: grid; grid-template-columns: 34mm 1fr; gap: 6mm; }}
.tf-aa {{ font-size: 64pt; line-height: 1; color: {P}; }}
.tf-aa.mont {{ font-weight: 500; }}
.role {{ font-size: 7.4pt; letter-spacing: .14em; text-transform: uppercase; color: #8A9396; margin: 1mm 0 3mm; }}
.alpha {{ font-size: 10.5pt; line-height: 1.55; color: {D}; margin-bottom: 3mm; }}
.tf p:last-child {{ font-size: 8.4pt; color: #4A555C; }}
.typo-sample {{ margin-top: 10mm; background: {IVORY}; padding: 9mm 10mm; border-radius: 1.2mm; }}
.ts-h {{ font-size: 28pt; color: {D}; line-height: 1.1; }}
.ts-s {{ font-size: 8.6pt; letter-spacing: .32em; color: {P}; margin: 4mm 0 5mm; }}
.typo-sample p {{ font-size: 8.2pt; color: #4A555C; max-width: 190mm; }}

.mock {{ display: grid; grid-template-columns: 84mm 1fr 80mm; gap: 8mm; align-items: start; }}
.mock p {{ font-size: 7.6pt; color: #7B868A; margin-top: 2mm; }}
.ig {{ position: relative; width: 84mm; height: 105mm; background: {D}; border-radius: 1.2mm; overflow: hidden; }}
.ig-in {{ position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }}
.ig-t {{ font-size: 15pt; text-align: center; line-height: 1.2; margin-top: 8mm; }}
.ig-b {{ font-size: 6.2pt; letter-spacing: .24em; margin-top: 5mm; color: {SAND}; font-weight: 500; }}
.av {{ display: flex; align-items: center; gap: 5mm; padding: 4mm; border: 1px solid #E4E1DA; border-radius: 1.2mm; }}
.av-c {{ width: 24mm; height: 24mm; border-radius: 50%; background: {P}; display: flex; align-items: center; justify-content: center; }}
.av-t b {{ display: block; font-weight: 500; font-size: 10pt; }} .av-t span {{ color: #7B868A; font-size: 8pt; }}
.bb {{ position: relative; margin-top: 7mm; aspect-ratio: 3 / 1; background: {P}; border-radius: 1.2mm; overflow: hidden; }}
.bb-in {{ position: absolute; inset: 0; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6mm; padding: 0 7mm; color: #fff; }}
.bb-r {{ border-left: 1px solid {SAND}; padding-left: 5mm; white-space: nowrap; }}
.bb-r div {{ font-size: 10.5pt; line-height: 1.25; }} .bb-r span {{ display: block; margin-top: 2mm; font-size: 6.4pt; letter-spacing: .1em; color: {SAND}; }}
.card {{ border: 1px solid #E4E1DA; border-radius: 1.2mm; overflow: hidden; background: #fff; }}
.card-h {{ padding: 6mm 6mm 4mm; border-bottom: 1px solid #EFECE6; }}
.card-b {{ padding: 5mm 6mm; }}
.card-b .k {{ font-size: 6.8pt; letter-spacing: .16em; text-transform: uppercase; color: #8A9396; }}
.card-b .big {{ font-size: 16pt; color: {D}; margin-top: 1mm; }} .card-b .area {{ font-size: 11pt; color: {P}; font-weight: 500; }}
.plan {{ width: 100%; margin-top: 4mm; }}
.card-f {{ display: flex; justify-content: space-between; background: {P}; color: #fff; padding: 3.5mm 6mm; font-size: 7.6pt; }}

.donts {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 7mm 8mm; }}
.dt-box {{ height: 42mm; background: {IVORY}; border-radius: 1.2mm; display: flex; align-items: center; justify-content: center;
  padding: 0 11mm; overflow: hidden; position: relative; }}
.dt-box > div, .dt-box > svg {{ width: 100%; }}
.dt-l {{ margin-top: 2.4mm; font-weight: 500; display: flex; gap: 2mm; align-items: center; }}
.dt-l span {{ width: 5mm; height: 5mm; border-radius: 50%; background: #C0392B; color: #fff; font-size: 7pt;
  display: inline-flex; align-items: center; justify-content: center; }}
.busy {{ background: repeating-linear-gradient(45deg, #E8A33D 0 6mm, #7FB3D5 6mm 12mm, #F4D03F 12mm 18mm); padding: 6mm; margin: 0 -11mm; }}
.fakefont {{ display: flex !important; align-items: center; gap: 4mm; color: {P}; justify-content: center; }}
.fakefont svg {{ width: auto; }}

.files {{ display: grid; grid-template-columns: 1fr 1.1fr; gap: 12mm; }}
.ft {{ width: 100%; border-collapse: collapse; align-self: start; }}
.ft td {{ padding: 3.4mm 0; border-bottom: 1px solid #E4E1DA; vertical-align: top; font-size: 8.5pt; }}
.ft .fd {{ font-weight: 500; color: {P}; width: 52mm; font-family: 'DejaVu Sans Mono', monospace; font-size: 8pt; }}
.fr h4 {{ margin-top: 4mm; margin-bottom: 1.4mm; }} .fr h4:first-child {{ margin-top: 0; }}
.fr p {{ font-size: 8.4pt; color: #4A555C; }}
.two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; font-size: 8.2pt; margin-top: 2mm; }}
.two ul {{ list-style: none; }} .two li {{ padding: .5mm 0; }}
"""


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pages = [cover(), p_task(), p_competitors(), p_concept(), p_primary(), p_versions(),
             p_construction(), p_colors(), p_type(), p_mockups(), p_donts(), p_files()]
    html = (f'<!doctype html><html lang="uz"><head><meta charset="utf-8">'
            f'<title>Shukrona Residence — Brendbuk</title><style>{CSS}</style></head>'
            f'<body>{"".join(pages)}</body></html>')
    src = os.path.join(OUT_DIR, "brandbook.html")
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(html)
    pdf = os.path.join(OUT_DIR, "Shukrona_Residence_Brandbook.pdf")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=4000",
                    f"--print-to-pdf={pdf}", "file://" + src], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("Brendbuk:", pdf)


if __name__ == "__main__":
    main()
