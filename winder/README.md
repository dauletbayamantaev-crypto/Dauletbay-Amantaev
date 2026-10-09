# Winder

**Win** (yutish) + **(Ten)der** — tenderlarda qatnashish uchun shaxsiy platforma.

Agent har kuni 6 ta xarid platformasini tekshiradi, kompaniya faoliyatiga (veb-sayt, mobil ilova, dasturiy ta’minot, raqamli marketing, video production, dizayn va brending) mos lotlarni topadi va Winder'ga real vaqtda joylaydi. AI har bir tender uchun zarur hujjatlar, ko‘nikmalar va yutish imkoniyatini oshirish bo‘yicha tavsiya beradi.

| Platforma | Manzil | Nima olinadi |
|---|---|---|
| UZEX Xarid | xarid.uzex.uz | Auksion, mahalliy auksion, e-do‘kon, milliy do‘kon, eng yaxshi taklif, elektron tender, taklif so‘rovi |
| UZEX E-tender | etender.uzex.uz | Tender, tanlov, autsorsing xizmatlari |
| XT-Xarid | xt-xarid.uz | Yirik korxonalar: tender, tanlash, takliflar so‘rovi |
| Kooperatsiya portali | new.cooperation.uz | Lot va ofertalar |
| Qurilish vazirligi | tender.mc.uz | Qurilish-pudrat, loyiha-qidiruv |
| E-Birja | ebirja.uz | Birja savdolari |

## Hozirgi bosqich: namuna (prototip)

Namuna Claude Artifact sifatida ishlaydi: <https://claude.ai/artifact/RDNzzkqidXfVhartPcZMYD>

| Bo‘lim | Imkoniyatlar |
|---|---|
| **Umumiy panel** | Oylik daromad, yangi va jarayondagi tenderlar, yaqin muddatlar (jonli taymer), agent holati (har platforma bo‘yicha), voronka, yangiliklar |
| **Tenderlar** | Qidiruv; holat, platforma, yo‘nalish, xarid turi, hudud, muddat va moslik bo‘yicha filtr; saralash; ro‘yxat yoki Kanban (sudrab o‘tkazish); CSV eksport; qo‘lda tender qo‘shish |
| **Tender varag‘i** | Lot ma’lumotlari, 7 ta holat (Yangi → Ko‘rib chiqilmoqda → Tayyorlanmoqda → Topshirildi → Yutildi / Yutqazildi / O‘tkazib yuborildi), zarur hujjatlar tayyorligi, AI tahlil, izohlar, tarix |
| **AI yordamchi** | Barcha tenderlar, hujjatlar, moliya va yangiliklarni biladigan chat |
| **Hujjatlar** | Guvohnoma, soliq ma’lumotnomasi, ERI, IT Park, ISO va boshqalar: holat, amal qilish muddati, qaysi tenderlarda so‘ralgani |
| **Yangiliklar** | Qonunchilik va soha yangiliklari, manba havolasi va "Sizga ta’siri" izohi bilan |
| **Moliya** | Fiks oylik, topshirilgan va yutilgan tenderlar bonusi alohida; 6 oylik grafik, prognoz, maqsad, hisob-kitob jadvali |
| **Sozlamalar** | Kalit va istisno so‘zlar, yo‘nalishlar, manbalar, tekshiruv vaqti, moliya stavkalari, zaxira nusxa |

Dizayn Apple.com uslubida: kunduzgi (oq) va tungi (qorong‘i) rejim tizim sozlamasiga qarab avtomatik almashadi. Logo — [`logo.svg`](logo.svg).

**Namuna ma’lumotlar haqida.** Tenderlar, hujjatlar va agent yozuvlari platformalardagi haqiqiy lot tuzilmasi asosida tayyorlangan **namuna**dir (har birida `sample: true`). Yangiliklar esa haqiqiy, manba havolalari bilan. Namunalarni Sozlamalar → Ma’lumotlar bo‘limida bir tugma bilan o‘chirish mumkin.

### Moliya qoidasi

```
Oylik daromad = fiks oylik (2 000 000)
              + topshirilgan tenderlar soni × 100 000
              + yutilgan tenderlar soni   × 1 000 000
```

Tender "Topshirildi" holatiga o‘tgan oyda topshirish bonusi, "Yutildi" holatiga o‘tgan oyda yutish bonusi hisoblanadi. Holat orqaga qaytarilsa, bonus ham olib tashlanadi. Stavkalar Sozlamalarda o‘zgaradi.

### Brauzerda lokal ochish

`index.html` faylini brauzerda oching. Claude'dan tashqarida u **lokal rejim**da ishlaydi: ma’lumotlar brauzer xotirasida saqlanadi, AI o‘chiq bo‘ladi. "Namuna ma’lumotlarni yuklash" tugmasi orqali [`namuna-malumotlar.json`](namuna-malumotlar.json) faylini tanlang.

## Keyingi bosqich: kompyuterda ishlaydigan to‘liq versiya

Tender saytlariga O‘zbekistondan kirish kerak, shuning uchun platformalarni yig‘uvchi agent kompyuteringizda ishlaydi.

```
┌──────────────── Sizning kompyuteringiz ────────────────┐
│  Rejalashtiruvchi (har kuni 09:00)                     │
│     │                                                  │
│     ▼                                                  │
│  6 ta yig‘uvchi (Playwright) ──► Moslik bahosi         │
│  xarid · etender · xt · coop · mc · ebirja   (kalit    │
│                                   so‘zlar + Claude API)│
│     │                                                  │
│     ▼                                                  │
│  SQLite baza ◄──► Lokal server (Node.js) ──► Winder UI │
│                        │   real vaqt: SSE              │
│                        ├──► Telegram bot (eslatmalar)  │
│                        └──► Claude API (AI tahlil)     │
└────────────────────────────────────────────────────────┘
```

1. **Lokal server** — Node.js, SQLite, shu UI (`index.html`) server API bilan ishlaydi; yangi tender topilganda brauzerga darhol yuboriladi.
2. **Yig‘uvchilar** — har platforma uchun alohida modul: faol lotlar ro‘yxati, lot raqami, narx, muddat, buyurtmachi, hudud, takliflar soni, hujjat tili.
3. **AI** — Claude API: lotlarni yo‘nalishlarga moslik bo‘yicha baholash, tender hujjatlarini o‘qib zarur hujjatlar ro‘yxatini chiqarish, tavsiyalar.
4. **Yangiliklar agenti** — lex.uz, norma.uz, uzex.uz, it-park.uz va boshqa ishonchli manbalardan kunlik yig‘ish.
5. **Telegram bot** — yangi mos tender, yaqinlashayotgan muddat va kunlik xulosa.
6. **Keyin** — veb-sayt va mobil ilova (PWA) sifatida joylash.

## Fayllar

| Fayl | Nima |
|---|---|
| [`index.html`](index.html) | Butun ilova: bitta fayl, kutubxonasiz |
| [`namuna-malumotlar.json`](namuna-malumotlar.json) | Namuna tenderlar, hujjatlar, yangiliklar, agent yozuvlari va sozlamalar |
| [`logo.svg`](logo.svg) | Winder logotipi |
