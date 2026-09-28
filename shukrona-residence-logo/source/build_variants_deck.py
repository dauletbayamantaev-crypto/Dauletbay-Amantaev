#!/usr/bin/env python3
"""
SHUKRONA RESIDENCE — muqobil variantlar taqdimoti (PDF).

    python3 build_variants.py        # avval variant fayllari
    python3 build_variants_deck.py   # keyin taqdimot
"""
import os
import subprocess

import build_brandbook as B
import build_logo as L
import build_variants as V

P, D, SAND, IVORY = B.P, B.D, B.SAND, B.IVORY


def svg_of(layers, box, fg=P, width=None, height=None):
    x0, y0, x1, y1 = box
    size = f'width="{width}"' if width else (f'height="{height}"' if height else "")
    paths = []
    for _, items in layers:
        for _, p in items:
            rule = ' fill-rule="evenodd"' if p.evenodd else ""
            paths.append(f'<path{rule} d="{p.moved(-x0, -y0).svg()}"/>')
    return (f'<svg {size} viewBox="0 0 {L.f(x1 - x0)} {L.f(y1 - y0)}" xmlns="http://www.w3.org/2000/svg">'
            f'<g fill="{fg}">{"".join(paths)}</g></svg>')


def concept_logo(cid, kind, fg=P, **kw):
    if cid == "V1":
        return svg_of(*L.layout(kind), fg=fg, **kw)
    return svg_of(*V.lockup(cid, kind), fg=fg, **kw)


ALL = [("V1", "Ostona", "Asosiy taklif"), ("V2_Derazalar", "Derazalar", ""), ("V3_Ravoqlar", "Ravoqlar", ""),
       ("V4_Hovli", "Hovli", ""), ("V5_Eshik-O", "Eshik-O", "")]

FONTS = {
    "V2_Derazalar": "Montserrat SemiBold + Montserrat Medium",
    "V3_Ravoqlar": "Cormorant Garamond SemiBold + Montserrat Medium",
    "V4_Hovli": "Jost Regular + Montserrat Medium",
    "V5_Eshik-O": "Jost Medium (maxsus «O») + Montserrat Medium",
}

SCORES = [  # o'ziga xoslik, 24 px'da o'qilishi, premium, milliy kod, qo'llash qulayligi
    ("V1", "Ostona", [4, 5, 4, 5, 5]),
    ("V2", "Derazalar", [3, 4, 3, 4, 5]),
    ("V3", "Ravoqlar", [4, 3, 5, 5, 4]),
    ("V4", "Hovli", [4, 5, 4, 3, 4]),
    ("V5", "Eshik-O", [5, 4, 4, 3, 4]),
]


def cover():
    return B.page(f'''
      <div class="cover-in" style="text-align:center">
        <div class="vk">Muqobil konsepsiyalar</div>
        <div class="vt tenor">SHUKRONA<br><span>RESIDENCE</span></div>
        <div class="vrow5">{"".join(f'<div>{concept_logo(c, "icon", "#FFFFFF", height="64")}<span>{t}</span></div>' for c, t, _ in ALL)}</div>
      </div>
      <div class="cover-meta"><div>Logotip variantlari · V1–V5</div><div>Toshkent · 2026</div></div>''', "cover")


def overview():
    rows = "".join(
        f'<div class="ov"><div class="ov-n">{c.split("_")[0]}</div><div class="ov-t">{t}{f"<em>{n}</em>" if n else ""}</div>'
        f'<div class="ov-h">{concept_logo(c, "horizontal", height="44")}</div>'
        f'<div class="ov-i">{concept_logo(c, "icon", "#FFFFFF", height="30")}</div></div>'
        for c, t, n in ALL)
    return B.page(f'''
      {B.head("Umumiy ko‘rinish", "Beshta yo‘nalish — bitta rang, bitta nom",
              "Barcha variantlar #1B6A77 petrol-firuza rangida, SHUKRONA — asosiy, RESIDENCE — yordamchi qator.")}
      <div class="ovs">{rows}</div>''', num=2, section="Umumiy ko‘rinish")


def concept_page(cid, num):
    c = V.CONCEPTS[cid]
    no = cid.split("_")[0]
    return B.page(f'''
      {B.head(f"{no} · Konsepsiya", f"«{c['title']}»")}
      <div class="cp">
        <div class="cp-l">
          <div class="cp-main">{concept_logo(cid, "horizontal", width="82%")}</div>
          <div class="cp-row">
            <div class="cp-v">{concept_logo(cid, "vertical", height="78%")}</div>
            <div class="cp-inv">{concept_logo(cid, "vertical", "#FFFFFF", height="78%")}</div>
            <div class="cp-av"><div class="circ">{concept_logo(cid, "icon", "#FFFFFF", height="46%")}</div>
              <span>Instagram avatar</span></div>
          </div>
        </div>
        <div class="cp-r">
          <h3>G‘oya</h3><p>{c["idea"]}</p>
          <h3>Qadriyatlar</h3><p>{c["values"]}</p>
          <h3>Shriftlar</h3><p>{FONTS[cid]}</p>
          <h3>Fayllar</h3><p><code>06_variants/{cid}/</code><br>AI (RGB, CMYK) · EPS · SVG · PNG,<br>
            master fayl — barcha versiyalar bitta artbordda.</p>
        </div>
      </div>''', num=num, section=f"{no} {c['title']}")


def compare():
    crit = ["O‘ziga xoslik", "24 px’da o‘qilishi", "Premium hissi", "Milliy kod", "Qo‘llash qulayligi"]
    head = "".join(f"<th>{x}</th>" for x in crit)

    def dots(n):
        return "".join(f'<i class="{"on" if i < n else ""}"></i>' for i in range(5))
    body = "".join(
        f'<tr><td class="cn"><b>{no}</b> {t}</td>{"".join(f"<td>{dots(s)}</td>" for s in sc)}</tr>'
        for no, t, sc in SCORES)
    return B.page(f'''
      {B.head("Taqqoslash", "Qaysi biri qachon kuchli",
              "Baholar — dizayner fikri; yakuniy tanlovni brendning ohangi va mijozning didi hal qiladi.")}
      <table class="cmp"><tr><th></th>{head}</tr>{body}</table>
      <div class="recs">
        <div><h3>V1 «Ostona»</h3><p>Eng muvozanatli: ma’no, kichik o‘lchamda o‘qilishi va premium ko‘rinish. Asosiy tavsiya.</p></div>
        <div><h3>V3 «Ravoqlar»</h3><p>Eng nafis va «butik» ohangli. Yuqori segment va katta formatlar uchun kuchli.</p></div>
        <div><h3>V2 «Derazalar»</h3><p>Eng tushunarli — birinchi qarashda «turar joy». Keng auditoriya uchun.</p></div>
        <div><h3>V4 · V5</h3><p>Eng zamonaviy va abstrakt. Yosh, shahar auditoriyasi va raqamli kanallar uchun.</p></div>
      </div>
      <p class="note">Tanlangan variant uchun to‘liq to‘plam (qora/oq versiyalar, brendbuk, maketlar) V1 bilan bir xil
        generator orqali tayyorlanadi.</p>''', num=len(V.CONCEPTS) + 3, section="Taqqoslash")


CSS = B.CSS + f"""
.vk {{ font-size: 8pt; letter-spacing: .3em; text-transform: uppercase; color: {SAND}; margin-bottom: 7mm; }}
.vt {{ font-size: 40pt; letter-spacing: .14em; line-height: 1.1; }}
.vt span {{ font-family: 'Montserrat'; font-weight: 500; font-size: 11pt; letter-spacing: .6em; }}
.vrow5 {{ display: flex; gap: 12mm; justify-content: center; margin-top: 16mm; }}
.vrow5 div {{ display: flex; flex-direction: column; align-items: center; gap: 3mm; }}
.vrow5 svg {{ height: 17mm; width: auto; }}
.vrow5 span {{ font-size: 7pt; letter-spacing: .16em; text-transform: uppercase; opacity: .85; }}
.ovs {{ display: grid; grid-template-rows: repeat(5, 1fr); gap: 2.6mm; }}
.ov {{ display: grid; grid-template-columns: 12mm 38mm 1fr 20mm; align-items: center; gap: 5mm; padding: 2.4mm 4mm;
  background: {IVORY}; border-radius: 1.2mm; height: 22mm; }}
.ov-n {{ font-size: 8pt; letter-spacing: .14em; color: {P}; font-weight: 500; }}
.ov-t {{ font-family: 'Tenor Sans'; font-size: 13pt; color: {D}; }}
.ov-t em {{ display: block; font-style: normal; font-family: 'Montserrat'; font-size: 6.8pt; letter-spacing: .12em;
  text-transform: uppercase; color: {SAND}; }}
.ov-h svg {{ height: 13mm; width: auto; max-width: 100%; }}
.ov-i {{ background: {P}; height: 17mm; border-radius: 1mm; display: flex; align-items: center; justify-content: center; }}
.ov-i svg {{ height: 10mm; width: auto; }}
.cp {{ display: grid; grid-template-columns: 1.65fr 1fr; gap: 11mm; }}
.cp-main {{ background: {IVORY}; border-radius: 1.2mm; height: 62mm; display: flex; align-items: center; justify-content: center; }}
.cp-row {{ display: grid; grid-template-columns: 1fr 1fr 0.8fr; gap: 4mm; margin-top: 4mm; }}
.cp-row > div {{ height: 50mm; border-radius: 1.2mm; display: flex; align-items: center; justify-content: center; }}
.cp-v {{ border: 1px solid #E4E1DA; }} .cp-inv {{ background: {P}; }}
.cp-v svg, .cp-inv svg {{ max-width: 84%; }}
.cp-av {{ flex-direction: column; gap: 3mm; border: 1px solid #E4E1DA; }}
.circ {{ width: 28mm; height: 28mm; border-radius: 50%; background: {P}; display: flex; align-items: center; justify-content: center; }}
.circ svg {{ max-width: 60%; }}
.cp-av span {{ font-size: 7pt; color: #7B868A; }}
.cp-r h3 {{ font-size: 11pt; margin-top: 4.5mm; }} .cp-r h3:first-child {{ margin-top: 0; }}
.cp-r p {{ font-size: 8.8pt; color: #4A555C; margin-top: 1.4mm; }}
.cmp {{ width: 100%; border-collapse: collapse; }}
.cmp th {{ font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; color: #8A9396; font-weight: 500; text-align: left;
  padding: 0 0 2.5mm; border-bottom: 1px solid {P}; }}
.cmp td {{ padding: 3.2mm 0; border-bottom: 1px solid #E4E1DA; }}
.cmp .cn {{ font-family: 'Tenor Sans'; font-size: 12pt; color: {D}; width: 48mm; }}
.cmp .cn b {{ font-family: 'Montserrat'; font-weight: 500; font-size: 8pt; color: {P}; margin-right: 2mm; }}
.cmp i {{ display: inline-block; width: 3mm; height: 3mm; border-radius: 50%; background: #E4E1DA; margin-right: 1.4mm; }}
.cmp i.on {{ background: {P}; }}
.recs {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin-top: 7mm; }}
.recs div {{ background: {IVORY}; padding: 4mm 4.5mm; border-radius: 1.2mm; }}
.recs div:first-child {{ background: {P}; color: #fff; }} .recs div:first-child h3 {{ color: #fff; }}
.recs p {{ font-size: 8.2pt; margin-top: 1.4mm; }}
"""


def main():
    out_dir = V.OUT
    pages = [cover(), overview()] + [concept_page(cid, i + 3) for i, cid in enumerate(V.CONCEPTS)] + [compare()]
    html = (f'<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Shukrona Residence — variantlar</title>'
            f'<style>{CSS}</style></head><body>{"".join(pages)}</body></html>')
    html = html.replace("SHUKRONA RESIDENCE · Brendbuk", "SHUKRONA RESIDENCE · Variantlar")
    src = os.path.join(out_dir, "variants.html")
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(html)
    pdf = os.path.join(out_dir, "Shukrona_Residence_Variantlar.pdf")
    subprocess.run([B.CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=4000",
                    f"--print-to-pdf={pdf}", "file://" + src], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("Taqdimot:", pdf)


if __name__ == "__main__":
    main()
