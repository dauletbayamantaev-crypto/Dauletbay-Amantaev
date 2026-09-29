"""
Ofis stoli uchun choksiz (tileable) PBR yog'och teksturalarini yaratadi.

Ranglar:
  #4A2F2A - yog'ochning asosiy rangi
  #331F19 - to'qroq tola (grain) chiziqlari

Tekstura 2 x 2 metr yuzani qoplaydi (2048 px => ~1 px/mm).
Tolalar tekstura bo'ylab gorizontal (U o'qi) yo'nalgan.

Ishga tushirish:
  python generate_textures.py [chiqish_papkasi]
"""
import os
import sys

import numpy as np
from PIL import Image

N = 2048
SEED = 20260929

BASE = np.array([0x4A, 0x2F, 0x2A], dtype=np.float64)   # asosiy rang
GRAIN = np.array([0x33, 0x1F, 0x19], dtype=np.float64)  # to'q tola chiziqlari
LIGHT = BASE * 1.22                                      # yorug' tolali joylar

rng = np.random.default_rng(SEED)

fu = np.fft.fftfreq(N)[None, :]  # U (gorizontal) chastota
fv = np.fft.fftfreq(N)[:, None]  # V (vertikal) chastota


def streaks(len_u, len_v, seed):
    """Anizotrop, davriy (choksiz) shovqin: U bo'ylab uzun, V bo'ylab ingichka."""
    r = np.random.default_rng(seed)
    white = r.standard_normal((N, N))
    filt = np.exp(-((fu * len_u) ** 2) - ((fv * len_v) ** 2))
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt))
    out -= out.mean()
    return out / out.std()


def warp_v(field, amount, seed):
    """Tolalarni V bo'ylab biroz egiltiradi (tabiiy to'lqinlanish), choksizlik saqlanadi."""
    w = streaks(700, 90, seed) * amount
    rows = np.arange(N)[:, None] + w
    r0 = np.floor(rows).astype(int)
    f = rows - r0
    cols = np.arange(N)[None, :]
    return field[r0 % N, cols] * (1 - f) + field[(r0 + 1) % N, cols] * f


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# --- 1. Shpon polosalari (veneer bands) - rasmdagidek gorizontal tasmalar
widths = rng.uniform(90, 250, 40)
widths = widths[: np.searchsorted(np.cumsum(widths), N) + 1]
widths = np.round(widths / widths.sum() * N).astype(int)
widths[-1] += N - widths.sum()
band_id = np.repeat(np.arange(len(widths)), widths)[:, None] * np.ones((1, N), int)
band_tone = rng.normal(0.0, 0.17, len(widths))
band_field = rng.integers(0, 4, len(widths))

# Har bir polosa o'z tola naqshiga ega (4 xil variant)
thin = np.stack([streaks(420, 2.2, SEED + i) for i in range(4)])
medium = np.stack([streaks(900, 14, SEED + 10 + i) for i in range(4)])
thin = np.take_along_axis(thin, band_field[band_id][None], 0)[0]
medium = np.take_along_axis(medium, band_field[band_id][None], 0)[0]
thin = warp_v(thin, 4.0, SEED + 30)
medium = warp_v(medium, 6.0, SEED + 31)

fibre = streaks(70, 1.0, SEED + 20)          # mayda tolalar
pores = streaks(10, 1.0, SEED + 21)          # g'ovaklar (pores)
wave = streaks(1500, 60, SEED + 22)          # yirik ohangdagi o'zgarish

# --- 2. Tola intensivligi
grain_lines = smoothstep(0.6, 2.0, thin)                 # aniq to'q chiziqlar
pore_mask = smoothstep(2.3, 3.4, pores)                  # siyrak to'q nuqtalar

t = (
    0.28 * medium
    + 0.95 * grain_lines
    + 0.12 * fibre
    + 0.55 * pore_mask
    + 0.18 * wave
    + band_tone[band_id]
)
t -= np.median(t) + 0.12   # o'rtacha rang #4A2F2A atrofida qolsin

# --- 3. Rang: t>0 -> #331F19 tomon, t<0 -> yorug'roq
pos = np.clip(t, 0, 1)[..., None]
neg = np.clip(-t, 0, 1)[..., None]
color = BASE + pos * (GRAIN - BASE) + neg * (LIGHT - BASE)
color = np.clip(color, 0, 255)

# --- 4. Normal xarita (OpenGL, Y+) - lak ostidagi yengil tola relyefi
height = -(0.6 * grain_lines + 1.0 * pore_mask + 0.15 * fibre)
strength = 1.4
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5
nx, ny, nz = -dx * strength, dy * strength, np.ones_like(height)
ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
normal = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5

# --- 5. Roughness: laklangan yarim yaltiroq yuza, tolalar biroz g'adir
rough = 0.30 + 0.10 * grain_lines + 0.18 * pore_mask + 0.02 * fibre
rough = np.clip(rough, 0.2, 0.7)


def save(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(color.round().astype(np.uint8)).save(
        os.path.join(out_dir, "Wood_BaseColor.jpg"), quality=93, subsampling=0)
    Image.fromarray((normal * 255).round().astype(np.uint8)).resize(
        (1024, 1024), Image.LANCZOS).save(os.path.join(out_dir, "Wood_Normal.png"), optimize=True)
    r8 = (rough * 255).round().astype(np.uint8)
    Image.fromarray(r8).resize((1024, 1024), Image.LANCZOS).save(
        os.path.join(out_dir, "Wood_Roughness.png"), optimize=True)
    # Unity Standard / URP Lit: R = Metallic (0), A = Smoothness (1 - roughness)
    sm = Image.fromarray(255 - r8).resize((1024, 1024), Image.LANCZOS)
    zero = Image.new("L", (1024, 1024), 0)
    Image.merge("RGBA", (zero, zero, zero, sm)).save(
        os.path.join(out_dir, "Wood_MetallicSmoothness.png"), optimize=True)
    mean = color.reshape(-1, 3).mean(0)
    print("Teksturalar saqlandi:", out_dir)
    print("O'rtacha rang: #%02X%02X%02X" % tuple(int(round(c)) for c in mean))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    save(sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "..", "Textures"))
