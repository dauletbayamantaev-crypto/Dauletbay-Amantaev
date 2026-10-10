# Winder

**Win** (yutish) + **(Ten)der** — tenderlarda qatnashish uchun shaxsiy platforma.

Tenderlarni bir joyda kuzatish, holat berish, AI tahlil, hujjatlar tayyorligi, yangiliklar va moliya.

| Platforma | Manzil | Xarid turlari |
|---|---|---|
| UZEX Xarid | xarid.uzex.uz | Auksion, mahalliy auksion, e-do‘kon, milliy do‘kon, eng yaxshi taklif, elektron tender, taklif so‘rovi |
| UZEX E-tender | etender.uzex.uz | Tender, tanlov, autsorsing xizmatlari |
| XT-Xarid | xt-xarid.uz | Yirik korxonalar: tender, tanlash, takliflar so‘rovi |
| Kooperatsiya portali | new.cooperation.uz | Lot va ofertalar |
| Qurilish vazirligi | tender.mc.uz | Qurilish-pudrat, loyiha-qidiruv |
| E-Birja | ebirja.uz | Birja savdolari |

## Hozirgi holat

Namuna Claude Artifact sifatida ishlaydi: <https://claude.ai/artifact/RDNzzkqidXfVhartPcZMYD>

| Bo‘lim | Imkoniyatlar |
|---|---|
| **Umumiy panel** | Oylik daromad, yangi va jarayondagi tenderlar, yaqin muddatlar (jonli taymer), platformalar bo‘yicha faol tenderlar, voronka, yangiliklar |
| **Tenderlar** | Qidiruv; holat, platforma, yo‘nalish, xarid turi, hudud, muddat va moslik bo‘yicha filtr; saralash; ro‘yxat yoki Kanban (sudrab o‘tkazish); CSV eksport; qo‘lda tender qo‘shish |
| **Tender varag‘i** | Lot ma’lumotlari, 7 ta holat (Yangi → Ko‘rib chiqilmoqda → Tayyorlanmoqda → Topshirildi → Yutildi / Yutqazildi / O‘tkazib yuborildi), zarur hujjatlar tayyorligi, AI tahlil, izohlar, tarix |
| **AI yordamchi** | Barcha tenderlar, hujjatlar, moliya va yangiliklarni biladigan chat |
| **Hujjatlar** | Guvohnoma, soliq ma’lumotnomasi, ERI, IT Park, ISO va boshqalar: holat, amal qilish muddati, qaysi tenderlarda so‘ralgani |
| **Yangiliklar** | Qonunchilik va soha yangiliklari, manba havolasi va "Sizga ta’siri" izohi bilan |
| **Moliya** | Fiks oylik, topshirilgan va yutilgan tenderlar bonusi alohida; 6 oylik grafik, prognoz, maqsad, hisob-kitob jadvali |
| **Sozlamalar** | Profil, yo‘nalishlar, kalit va istisno so‘zlar, platformalar ro‘yxati, moliya stavkalari, zaxira nusxa |

Dizayn Apple Liquid Glass uslubida: shishasimon plitalar, suzuvchi navigatsiya; kunduzgi va tungi rejim tizim sozlamasiga qarab almashadi. Logo — [`logo.svg`](logo.svg).

**Namuna ma’lumotlar haqida.** Tenderlar va hujjatlar platformalardagi haqiqiy lot tuzilmasi asosida tayyorlangan **namuna**dir (har birida `sample: true`). Yangiliklar esa haqiqiy, manba havolalari bilan. Namunalarni Sozlamalar → Ma’lumotlar bo‘limida bir tugma bilan o‘chirish mumkin.

### Moliya qoidasi

```
Oylik daromad = fiks oylik (2 000 000)
              + topshirilgan tenderlar soni × 100 000
              + yutilgan tenderlar soni   × 1 000 000
```

Tender "Topshirildi" holatiga o‘tgan oyda topshirish bonusi, "Yutildi" holatiga o‘tgan oyda yutish bonusi hisoblanadi. Holat orqaga qaytarilsa, bonus ham olib tashlanadi. Stavkalar Sozlamalarda o‘zgaradi.

### Brauzerda lokal ochish

`index.html` faylini brauzerda oching. Claude'dan tashqarida u **lokal rejim**da ishlaydi: ma’lumotlar brauzer xotirasida saqlanadi, AI o‘chiq bo‘ladi. "Namuna ma’lumotlarni yuklash" tugmasi orqali [`namuna-malumotlar.json`](namuna-malumotlar.json) faylini tanlang.

## Ma’lumot kiritish

Tenderlarni o‘zingiz kiritasiz: **Tender qo‘shish** tugmasi (Umumiy panel yoki Tenderlar sahifasida). Formada nom, platforma, xarid turi, lot raqami, boshlang‘ich narx va valyuta, buyurtmachi, hudud, tugash sanasi, yo‘nalish, moliyalashtirish, hujjatlar tili, takliflar soni, moslik va havola bor. Moslik bo‘sh qolsa, Sozlamalardagi kalit so‘zlar bo‘yicha hisoblanadi.

Kiritilgan tenderni varaqdagi **Tahrirlash** tugmasi bilan o‘zgartirasiz; holat, izoh va AI tahlil saqlanib qoladi. Hujjatlar sahifasida yangi hujjat qo‘shiladi, Sozlamalar → Ma’lumotlar bo‘limida zaxira nusxa olinadi va tiklanadi.

## Fayllar

| Fayl | Nima |
|---|---|
| [`index.html`](index.html) | Butun ilova: bitta fayl, kutubxonasiz |
| [`namuna-malumotlar.json`](namuna-malumotlar.json) | Namuna tenderlar, hujjatlar, yangiliklar va sozlamalar |
| [`logo.svg`](logo.svg) | Winder logotipi |
