"""Taqdimot sahifasi (claude.ai Artifact) generatori: python3 page.py DIST_DIR"""
import json, re, sys, pathlib, shutil

DIST = pathlib.Path(sys.argv[1])
meta = json.loads((DIST / "meta.json").read_text())
grid = (DIST / "grid.svg.txt").read_text()
strip = lambda s: re.sub(r'\s(id)="[^"]*"', "", s)

INFO = {
 "V1": ("Evolyutsiya", "Asl g'oya saqlangan: A harfining ko'ndalang chizig'i D ustuniga tutashadi. Endi har bir element bitta to'rga bo'ysunadi: chiziq qalinligi bir xil, D yoyi aniq yarim aylana, ko'ndalang chiziq yoy markazidan o'tadi, A oyoqlari 1:2 qiyalikda.",
        ["D — huquqiy asos, A ni ichida ushlab turadi", "Zangori A — raqamli makon", "Brend uzviyligi: eski logoni bilganlar darhol taniydi"]),
 "V2": ("Bitta chiziq", "Butun monogramma qalamni ko'tarmasdan chizilgan bitta uzluksiz chiziq: A oyog'idan boshlanadi, ko'ndalang chiziq orqali D ga o'tadi va yoy bo'ylab aylanib chiqadi. Ikki uchidagi tugunlar — elektron sxema kontaktlari.",
        ["Uzilmaydigan himoya zanjiri", "Tugunlar — kiber infratuzilma", "Eng nafis, chiziqli (line-art) talqin"]),
 "V3": ("Himoya", "D harfining yuqori qismi saqlanadi (to'g'ri burchak va yoy), pastki yarmi esa qalqon uchiga aylanadi. Oltin A qalqon markazida, ko'ndalang chiziq qalqonning eng keng nuqtasidan o'tadi.",
        ["Qalqon — himoya va xavfsizlik", "Oltin — adolat va huquq an'anasi", "Eng mustahkam, rasmiy ko'rinish"]),
 "V4": ("Kalit teshigi", "Yaxlit D — mustahkam eshik. A harfi bo'sh fazoda kalit teshigi shaklida o'yilgan, teshikdan chapga chiqqan tirqish esa asl logodagi A chizig'ining D ustuniga tutashishini takrorlaydi. Kalit teshigi bir vaqtda inson siluetini ham eslatadi.",
        ["Kalit teshigi — kiberxavfsizlik", "Inson silueti — himoyalangan shaxs, kiberzo'ravonlikka qarshi", "Yaxlit siluet: 16 px da ham aniq"]),
 "V5": ("Code is Law", "D ning ustuni ajralib, matn kursoriga aylangan. \"Code is Law\" — Lawrence Lessig (1999) tezisi, kiberhuquqning asosiy g'oyalaridan biri: raqamli makonda qoidalarni kod belgilaydi.",
        ["Kursor — qonun raqamli makonda yoziladi", "Kiberhuquqqa aniq ishora", "Eng texnologik, zamonaviy talqin"]),
 "V6": ("Raqamli iz", "Ichma-ich D konturlari barmoq izi va signal to'lqinini eslatadi: internetdagi har bir harakat iz qoldiradi. Markazdagi A — chizig'i D ga tutashgan uzluksiz chiziq.",
        ["Barmoq izi — raqamli shaxs va dalil", "Kiberjinoyat tergovi va raqamli ekspertiza", "Ritmik, analitik xarakter"]),
}
RATING = {"V1": 4, "V2": 3, "V3": 4, "V4": 5, "V5": 4, "V6": 3}


def box(b, pad):
    x, y, w, h = b
    p = h * pad
    return (x - p, y - p, w + 2 * p, h + 2 * p)


def use(sym, b, cls, style="", label=""):
    x, y, w, h = b
    lab = f' role="img" aria-label="{label}"' if label else ' aria-hidden="true"'
    return (f'<svg class="{cls}" viewBox="{x:.1f} {y:.1f} {w:.1f} {h:.1f}" style="{style}"{lab}>'
            f'<use href="#{sym}" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}"/></svg>')


syms = [f'<symbol id="grid" viewBox="0 0 240 240">{strip(grid)}</symbol>']
for m in meta:
    k = m["key"].lower()
    hb, vb = m["H"]["box"], m["V"]["box"]
    syms.append(f'<symbol id="{k}-i" viewBox="0 0 240 240">{strip(m["icon"])}</symbol>')
    syms.append(f'<symbol id="{k}-g" viewBox="0 0 240 240">{strip(m["guides"])}</symbol>')
    syms.append(f'<symbol id="{k}-h" viewBox="{hb[0]} {hb[1]} {hb[2]} {hb[3]}">{strip(m["Hsym"])}</symbol>')
    syms.append(f'<symbol id="{k}-v" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}">{strip(m["Vsym"])}</symbol>')

ICB = (0, 0, 240, 240)
over, secs, rows = [], [], []
for m in meta:
    k, K = m["key"].lower(), m["key"]
    P, A = m["p"][0], m["a"][0]
    lt = f"--lp:{P};--la:{A};--lt:{P}"
    dk = f"--lp:#fff;--la:{A};--lt:#fff"
    title, text, pts = INFO[K]
    hb, vb = box(m["H"]["box"], 0.18), box(m["V"]["box"], 0.1)
    over.append(f'<a class="ov" href="#{k}" style="{lt}">{use(k+"-i", ICB, "ov-i", label=K+" "+m["name"])}'
                f'<span class="ov-k">{K}</span><span class="ov-n">{m["name"]}</span><span class="ov-t">{title}</span></a>')
    chips = "".join(
        f'<div class="chip"><span class="sw" style="background:{c[0]}"></span><div><b>{c[1]}</b>'
        f'<code>{c[0]}</code><code>RGB {" ".join(map(str, rgbv))}</code><code>CMYK {" ".join(map(str, cm))}</code></div></div>'
        for c, rgbv, cm in ((m["p"], m["p_rgb"], m["p_cmyk"]), (m["a"], m["a_rgb"], m["a_cmyk"])))
    lis = "".join(f"<li>{p}</li>" for p in pts)
    secs.append(f'''
<section class="var" id="{k}" style="{lt};--vp:{P};--va:{A}">
  <header class="var-h"><span class="var-k">{K}</span><h2>{m["name"]}</h2><span class="var-t">{title}</span></header>
  <div class="var-main">
    <figure class="stage" id="st-{k}">
      <svg class="stage-svg" viewBox="0 0 240 240" role="img" aria-label="{K} {m["name"]} ikonka">
        <use class="gl" href="#grid" width="240" height="240"/><use href="#{k}-i" width="240" height="240"/><use class="gl" href="#{k}-g" width="240" height="240"/>
      </svg>
      <label class="tg"><input type="checkbox" id="tg-{k}" data-t="st-{k}"> Qurilish to'rini ko'rsatish</label>
    </figure>
    <div class="var-info">
      <p class="lede">{text}</p>
      <ul class="pts">{lis}</ul>
      <div class="chips">{chips}</div>
      <p class="font">Shrift: <b>Jost</b> Medium 500 (ism) · Regular 400 (shior) — konturga aylantirilgan</p>
      <div class="dl"><button class="btn" data-z="{k}" data-n="{m["base"]}.zip">Isxodniklarni yuklab olish (ZIP)</button>
      <span class="dl-note">.ai · .pdf · 8 ta .svg · .png · favicon.ico</span></div>
    </div>
  </div>
  <div class="lock">
    <figure class="tile light">{use(k+"-h", hb, "lk", lt, "Gorizontal logo")}<figcaption>Gorizontal</figcaption></figure>
    <figure class="tile" style="background:{P}">{use(k+"-h", hb, "lk", dk, "Gorizontal invers")}<figcaption>Invers</figcaption></figure>
    <figure class="tile light vt">{use(k+"-v", vb, "lkv", lt, "Vertikal logo")}<figcaption>Vertikal</figcaption></figure>
  </div>
  <div class="apps">
    <figure class="app"><div class="ava">{use(k+"-i", ICB, "ai", lt)}</div><div class="ava sm">{use(k+"-i", ICB, "ai", lt)}</div><figcaption>Avatar</figcaption></figure>
    <figure class="app"><div class="ios" style="background:{P}">{use(k+"-i", ICB, "ai", dk)}</div><figcaption>Ilova ikonkasi</figcaption></figure>
    <figure class="app"><div class="tab"><span class="fav">{use(k+"-i", ICB, "f16", lt)}</span><span>Dauletbay Amantaev</span></div>
      <div class="fav-row">{use(k+"-i", ICB, "f16", lt)}{use(k+"-i", ICB, "f24", lt)}{use(k+"-i", ICB, "f32", lt)}{use(k+"-i", ICB, "f48", lt)}</div><figcaption>Favicon 16 · 24 · 32 · 48 px</figcaption></figure>
    <figure class="app cardw"><div class="card">{use(k+"-v", vb, "cv", lt)}</div><div class="card" style="background:{P}">{use(k+"-i", ICB, "ci", dk)}</div><figcaption>Vizitka (90×50 mm)</figcaption></figure>
  </div>
</section>''')
    r = RATING[K]
    rows.append(f'<tr><td><a href="#{k}">{K} {m["name"]}</a></td><td>{title}</td>'
                f'<td><span class="bar" style="--r:{r}"></span> {r}/5</td><td style="{lt}">{use(k+"-i", ICB, "f24", lt)}{use(k+"-i", ICB, "f16", lt)}</td></tr>')

tpl = (pathlib.Path(__file__).parent / "page_template.html").read_text()
html = (tpl.replace("{{SYMBOLS}}", "\n".join(syms)).replace("{{OVERVIEW}}", "\n".join(over))
        .replace("{{SECTIONS}}", "\n".join(secs)).replace("{{ROWS}}", "\n".join(rows))
        .replace("{{BASE}}", use("v1-i", ICB, "base-i", "--lp:#0B1E3F;--la:#13B5EA;--lt:#0B1E3F")))
(DIST / "index.html").write_text(html)
files = DIST / "files"
shutil.rmtree(files, ignore_errors=True)
for z in DIST.glob("*.zip"):
    z.unlink()
root = DIST.parent if False else pathlib.Path(__file__).resolve().parent.parent
mani, pub = {}, []
for m in meta:
    k = m["key"].lower()
    src = next(root.glob(f'{m["key"]}-*'))
    lst = []
    for fp in sorted(src.rglob("*")):
        if not fp.is_file() or fp.suffix == ".ai":
            continue
        rel = fp.relative_to(src).as_posix()
        dst = files / src.name / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(fp, dst)
        url = f"files/{src.name}/{rel}"
        pub.append(url)
        lst.append([url, f'{m["base"]}/{rel}'])
        if fp.suffix == ".pdf":   # .ai = PDF-mos Illustrator fayli, ZIP ichida .ai nomi bilan
            lst.append([url, f'{m["base"]}/{m["base"]}.ai'])
    mani[k] = lst
shutil.copy2(root / "README.md", files / "README.md")
pub.append("files/README.md")
mani["all"] = [[u, "DA-logo-rebrending/" + a] for k in list(mani) for u, a in mani[k]] + [["files/README.md", "DA-logo-rebrending/README.md"]]
html = html.replace("{{MANIFEST}}", json.dumps(mani, ensure_ascii=False))
(DIST / "index.html").write_text(html)
(DIST / "publish-files.json").write_text(json.dumps(pub))
print("index.html:", len(html) // 1024, "KB")
