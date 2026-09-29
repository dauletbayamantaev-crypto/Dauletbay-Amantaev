# Ikki o‘rinli skameyka — 3D model

Uch rakursdan olingan fotosuratlar asosida qayta tiklangan skameyka modeli.

| Fayl | Nima |
| --- | --- |
| `index.html` | Interaktiv 3D ko‘ruvchi (Three.js). Brauzerda oching: aylantirish, yaqinlashtirish, tayyor rakurslar (old, yon, orqa, fotosuratlardagi 1–3 rakurs) va o‘lcham chiziqlari. |
| `skameyka.glb` | Model bitta glTF 2.0 faylida: Blender, 3ds Max, SketchUp, Windows 3D Viewer yoki AR ilovalarida ochiladi. Birlik: metr. |
| `unity/Skameyka.fbx` | Unity uchun, yuqori sifat (~250 ming uchburchak): yaqin planlar va vizualizatsiya uchun. |
| `unity/Skameyka_lite.fbx` | Unity uchun, o‘yinga mos (~28 ming uchburchak). Shnur eshilishi teksturada saqlangan. |
| `unity/Textures/` | Teksturalar alohida PNG ko‘rinishida (FBX ichiga ham joylangan). |

Taxminiy o‘lchamlar (fotosuratlardagi nisbatlardan olingan): eni 115 sm, chuqurligi 57 sm,
balandligi 99 sm, o‘rindiq balandligi 46 sm.

Model tarkibi: qizg‘ish-jigarrang lakli yog‘och karkas (qilich shaklidagi old oyoqlar, orqaga
egilgan suyanchiq ustunlari, yon va orqa tirgaklar, tsargalar), mato qoplamali to‘rtta yostiqcha
va ularning chetidagi tillarang eshilgan shnur.

## Unity’ga import qilish

1. `unity` papkasini to‘liq (FBX va `Textures`) loyihadagi `Assets` ichiga torting.
2. Masshtab: 1 birlik = 1 metr, Scale Factor = 1. Pivot polda, skameyka markazida; old tomoni +Z ga qaragan.
3. Teksturalar FBX ichida, materiallar avtomatik bog‘lanadi. Ularni tahrirlash uchun FBX’ni tanlang,
   Inspector → **Materials** → **Extract Materials…** tugmasini bosing.
4. Tavsiya etilgan material qiymatlari (Standard yoki URP/Lit):
   - `Yogoch_lak`: Metallic 0, Smoothness ≈ 0.55. Xohlasangiz Metallic Map’ga
     `Yogoch_MetallicSmoothness.png` qo‘ying (Smoothness Source: Metallic Alpha).
   - `Mato`: Smoothness ≈ 0.05, Normal Map: `Mato_Normal.png` (Texture Type: Normal map).
   - `Shnur`: Metallic ≈ 0.55, Smoothness ≈ 0.65.
5. URP loyihasida materiallar pushti (magenta) ko‘rinsa:
   Window → Rendering → Render Pipeline Converter → Material Upgrade.
