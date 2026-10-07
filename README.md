# 🧭 Hayot Kompasi

Shaxsiy hayotni boshqarish tizimi: strategiya, maqsad va loyihalar, ularning bosqichlari va **real natijalarini AI bilan tekshirib baholash**, moliya, odatlar, sog'liq, kundalik, o'rganish va AI murabbiy — barchasi bitta ilovada.

## Imkoniyatlar

| Bo'lim | Nima qiladi |
|---|---|
| **Bosh sahifa** | Bugungi vazifalar, odatlar, maqsadlar progressi, yaqin bosqichlar, aqlli tavsiyalar, kunlik AI tavsiya, kayfiyat |
| **Strategiya** | Missiya, vizyon, qadriyatlar; hayot g'ildiragi (8 soha, 1–10 ball, tarix bilan); uzoq muddatli strategiyalar + AI baholash |
| **Maqsadlar** | SMART maqsadlar, o'lchanadigan kalit natijalar (boshlang'ich → hozir → maqsad), vaqt va progress solishtiruvi, "AI bilan SMART qilish", AI baholash |
| **Loyihalar** | Loyiha → bosqichlar (kutilgan natija bilan). Bosqich tugagach **real natija, raqamli dalil, havola va rasmlar** kiritiladi — AI kutilgan natija bilan solishtirib 0–100 ball, xulosa, kamchilik va keyingi qadamni beradi. "AI bilan reja" bosqichlarni avtomatik tuzadi |
| **Vazifalar** | Bugun / kelgusi / muddatsiz ro'yxatlar, loyihaga bog'lash, Pomodoro fokus taymeri |
| **Moliya** | Hisoblar (naqd, karta, bank), daromad/xarajat/o'tkazma, toifalar, 6 oylik grafik, 50/30/20 qoidasi, oylik byudjet, jamg'arma maqsadlari, qarzlar, AI moliyaviy tahlil |
| **Odatlar** | Hafta kunlari bo'yicha odatlar, streak, 30 kunlik foiz, 21 kunlik tarix |
| **Sog'liq** | Uyqu, vazn, suv, qadam, sport, kayfiyat, energiya; 30 kunlik grafiklar; AI tahlil |
| **Kundalik** | Kunlik yozuv (minnatdorchilik, yutuq, saboq) + AI mulohaza; **haftalik tahlil** — AI barcha bo'limlardan haftani jamlaydi |
| **O'rganish** | Kitoblar, kurslar, ko'nikmalar; progress, baho, asosiy fikrlar |
| **AI murabbiy** | Barcha ma'lumotlaringizni biladigan chat-murabbiy |
| **Sozlamalar** | AI provayderi (Gemini yoki Claude) va modeli, API kalitlar, valyuta, JSON eksport/import |

**Aqlli tavsiyalar** AI kalitisiz ham ishlaydi — ular ma'lumotlaringizdan qoidalar asosida hisoblanadi (muddati o'tgan bosqichlar, ortda qolayotgan maqsadlar, byudjet oshishi, xavfsizlik yostig'i, kam uyqu, haftasiga 150 daqiqadan kam faollik va h.k.).

## Claude ichida ishlatish (Artifact)

Ilova claude.ai Artifact sifatida ochilganda o'zi buni aniqlaydi va hech qanday sozlashsiz ishlaydi:

- **Login** — claude.ai hisobingiz orqali (alohida parol kerak emas);
- **Saqlash** — Artifact xotirasida, `data/users/<id>/` ostida: faqat sizga ko'rinadi, barcha qurilmalarda bir xil;
- **AI** — Claude hisobingiz orqali (`sample` imkoniyati), API kalit kerak emas; birinchi so'rovda ruxsat so'raladi;
- **Eksport** — platformaning `downloads` imkoniyati orqali.

Artifact'ni yangilash uchun `npx vite build --base=./` natijasini (`index.html` o'rniga faqat `<title>`, CSS/JS havolalari va `<div id="root">` dan iborat sahifa bilan) `db`, `user`, `sample`, `downloads` imkoniyatlari bilan chop etiladi.

## Ishga tushirish

**Talab:** Node.js 20+

```bash
npm install
cp .env.example .env.local   # Firebase qiymatlarini kiriting (pastga qarang)
npm run dev                  # http://localhost:3000
```

Firebase sozlanmagan bo'lsa, ilova **mahalliy rejimda** ochiladi: login so'ralmaydi, ma'lumotlar faqat shu brauzerda saqlanadi. Sinab ko'rish uchun qulay.

## Bulut va login (Firebase) sozlash

1. [console.firebase.google.com](https://console.firebase.google.com) da yangi loyiha yarating.
2. **Build → Authentication → Sign-in method**: *Google* va *Email/Password* ni yoqing.
3. **Build → Firestore Database** → *Create database* (production mode).
4. **Firestore → Rules** bo'limiga shu repodagi [`firestore.rules`](firestore.rules) mazmunini joylang va *Publish* bosing. Bu qoidalar har bir foydalanuvchiga faqat o'z ma'lumotlarini ko'rish imkonini beradi.
5. **Project settings → Your apps → Web (`</>`)** — ilova qo'shing va chiqqan `firebaseConfig` qiymatlarini `.env.local` fayliga `VITE_FIREBASE_*` sifatida yozing.
6. Ilovani boshqa domenda joylashtirsangiz, **Authentication → Settings → Authorized domains** ga o'sha domenni qo'shing.

Ma'lumotlar Firestore'da `users/{uid}/{bo'lim}/{id}` ko'rinishida saqlanadi va oflayn keshlanadi.

## AI sozlash

Ilova ichida **Sozlamalar** bo'limida provayderni tanlang va kalitni kiriting:

- **Gemini** — kalitni [aistudio.google.com/apikey](https://aistudio.google.com/apikey) dan oling. Standart model: `gemini-3.8-flash`.
- **Claude** — kalitni [console.anthropic.com](https://console.anthropic.com) → *API Keys* dan oling. Standart model: `claude-opus-5-5` (Sonnet 5.5 va Haiku 4.5 ham tanlash mumkin).

API kalitlar **bulutga saqlanmaydi** — faqat shu brauzerning `localStorage`'ida turadi va so'rovlar brauzerdan to'g'ridan-to'g'ri provayderga yuboriladi. Har bir qurilmada kalitni alohida kiritasiz. Google AI Studio ichida ishga tushirilganda `GEMINI_API_KEY` avtomatik ishlatiladi.

Bosqichni baholashda AI'ga faqat shu bosqich, uning loyihasi, maqsadi va strategiyasi haqidagi ma'lumotlar (va biriktirilgan rasmlar) yuboriladi.

## Claude Code'da Gemini va ChatGPT (MCP)

Repoda [`.mcp.json`](.mcp.json) bor: Claude Code shu papkada ochilganda `gemini` va `chatgpt` MCP serverlari avtomatik ulanadi ([`.claude/settings.json`](.claude/settings.json) ularni oldindan tasdiqlaydi). Har biri bitta `ask` vositasini beradi — Claude Gemini yoki ChatGPT'dan ikkinchi fikr so'rashi, javoblarni solishtirishi mumkin.

Server — [`mcp/ai-bridge.mjs`](mcp/ai-bridge.mjs): paket o'rnatishni talab qilmaydi (Node 18+), API'larni to'g'ridan-to'g'ri chaqiradi, kalitlarni faqat muhit o'zgaruvchilaridan o'qiydi.

| O'zgaruvchi | Kerakmi | Qayerdan |
|---|---|---|
| `GEMINI_API_KEY` | Gemini uchun | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `OPENAI_API_KEY` | ChatGPT uchun | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `GEMINI_MODEL` | ixtiyoriy (standart `gemini-3.8-flash`) | |
| `OPENAI_MODEL` | ixtiyoriy (standart `gpt-5.5`) | |

- **O'z kompyuteringizda:** `export GEMINI_API_KEY=...` va `export OPENAI_API_KEY=...` qilib, so'ng `claude` ni ishga tushiring. Tekshirish: `claude mcp list`.
- **claude.ai/code (bulut sessiyasi):** environment sozlamalarida (sessiya sarlavhasidagi muhit menyusi → *Edit*) kalitlarni muhit o'zgaruvchisi sifatida qo'shing. ChatGPT uchun *Network access* ro'yxatiga `api.openai.com` domenini qo'shing. Yangi sessiyada kuchga kiradi.

Kalitlarni hech qachon `.mcp.json` yoki boshqa repo fayliga yozmang.

## Buyruqlar

```bash
npm run dev      # ishlab chiqish serveri
npm run build    # production build (dist/)
npm run lint     # TypeScript tekshiruvi
```

Firebase Hosting'ga joylash: `npm run build && npx firebase-tools deploy` (`firebase.json` tayyor).

## Texnologiyalar

React 19, TypeScript, Vite, Tailwind CSS 4, Firebase (Auth + Firestore), `@google/genai`, `@anthropic-ai/sdk`, lucide-react, motion.
