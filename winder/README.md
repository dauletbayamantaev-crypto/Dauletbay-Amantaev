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
| **Umumiy panel** | Bugungi fokus (5 ta eng muhim ish), yangi / jarayondagi / topshirilgan / yutilgan tenderlar soni, 14 kunlik muddatlar taqvimi, zakalat holati, voronka, platformalar, yangiliklar. Shaxsiy daromad bu yerda ko‘rinmaydi |
| **Tenderlar** | Qidiruv; holat, platforma, yo‘nalish, xarid turi, hudud, muddat va moslik bo‘yicha filtr; saralash; ro‘yxat yoki Kanban (sudrab o‘tkazish); CSV eksport; qo‘lda tender qo‘shish |
| **Tender varag‘i** | Lot ma’lumotlari, 7 ta holat (Yangi → Ko‘rib chiqilmoqda → Tayyorlanmoqda → Topshirildi → Yutildi / Yutqazildi / O‘tkazib yuborildi), topshirish checklisti, zakalat hisoblagichi, natija va raqobatchilar narxi, Google Calendar’ga qo‘shish, Telegramga jo‘natish, zarur hujjatlar, AI tahlil, izohlar, tarix |
| **Natijalar** | Bizning natijalar: g‘alaba ulushi, platforma va yo‘nalish bo‘yicha, oylik grafik, narx tahlili (boshlang‘ich narxdan va g‘olibdan farq) |
| **Raqobatchilar** | Tenderlardagi g‘oliblar va ishtirokchilar: necha marta uchragan, yutgan, o‘rtacha narx pasaytirishi, izohlar |
| **AI yordamchi** | Barcha tenderlar, hujjatlar, moliya va yangiliklarni biladigan chat |
| **Hujjatlar** | Guvohnoma, soliq ma’lumotnomasi, ERI, IT Park, ISO va boshqalar: holat, amal qilish muddati, qaysi tenderlarda so‘ralgani |
| **Yangiliklar** | Qonunchilik va soha yangiliklari, manba havolasi va "Sizga ta’siri" izohi bilan |
| **Moliya** | Shaxsiy daromad faqat shu yerda: fiks oylik, topshirilgan va yutilgan tenderlar bonusi alohida; 6 oylik grafik, prognoz, maqsad, hisob-kitob jadvali |
| **Sozlamalar** | Profil, yo‘nalishlar, kalit va istisno so‘zlar, platformalar ro‘yxati, moliya stavkalari, ko‘rinish (yorug‘ / qorong‘i / avtomatik, 5 xil aksent rang), zaxira nusxa |

Dizayn Apple Liquid Glass uslubida: shishasimon plitalar, suzuvchi navigatsiya, bo‘limlar orasida silliq o‘tish. Kunduzgi va tungi rejim tizim sozlamasiga qarab almashadi yoki Sozlamalarda qo‘lda tanlanadi. Har tenderda platforma belgisi (UX, ET, XT, KP, QV, EB) bor. Logo — [`logo.svg`](logo.svg).

**Namuna ma’lumotlar haqida.** Tenderlar va hujjatlar platformalardagi haqiqiy lot tuzilmasi asosida tayyorlangan **namuna**dir (har birida `sample: true`). Yangiliklar esa haqiqiy, manba havolalari bilan. Namunalarni Sozlamalar → Ma’lumotlar bo‘limida bir tugma bilan o‘chirish mumkin.

### Moliya qoidasi

```
Oylik daromad = fiks oylik (2 000 000)
              + topshirilgan tenderlar soni × 100 000
              + yutilgan tenderlar soni   × 1 000 000
```

Tender "Topshirildi" holatiga o‘tgan oyda topshirish bonusi, "Yutildi" holatiga o‘tgan oyda yutish bonusi hisoblanadi. Holat orqaga qaytarilsa, bonus ham olib tashlanadi. Stavkalar Sozlamalarda o‘zgaradi.

### Zakalat qoidasi

Zakalat boshlang‘ich narxdan avtomatik hisoblanadi:

| Xarid turi | Foiz |
|---|---|
| Tender, elektron tender | 5% |
| Tanlov, tanlash, eng yaxshi taklif, taklif(lar) so‘rovi, autsorsing | 3% |
| Auksion, mahalliy auksion, elektron / milliy do‘kon | 3% |
| Boshqalar | 0% |

Aniq foiz tender hujjatida ko‘rsatiladi, shuning uchun varaqda foizni qo‘lda o‘zgartirish mumkin. Holatlar: to‘lanadi → to‘landi → qaytarildi. "Zakalat to‘landi" checklistdagi band bilan bog‘langan.

### Klaviatura

| Tugma | Amal |
|---|---|
| Ctrl/⌘ + K yoki `/` | Buyruqlar paneli: tender, bo‘lim yoki amalni qidirish |
| N | Yangi tender qo‘shish |
| 1–7 | Ochiq varaqda holatni o‘zgartirish |
| E | Ochiq tenderni tahrirlash |
| T | Ochiq tenderni Telegramga jo‘natish |
| Esc | Yopish |

Telefonda: tender qatorini o‘ngga surish uni keyingi bosqichga o‘tkazadi, varaqni pastga tortish uni yopadi.

### Telegramga jo‘natish

Tender varag‘ida **Platformada ochish** yonidagi **Telegramga jo‘natish** tugmasi tenderning barcha ma’lumotlarini tayyor xabarga aylantiradi: nom, buyurtmachi, platforma, lot, narx, zakalat, muddat, hudud, yo‘nalish, holat, tavsif, checklist, zarur hujjatlar, natija, AI tahlil, izoh va havola. Qaysi bo‘limlar kirishini tugmachalar bilan tanlaysiz, matnni jo‘natishdan oldin tahrirlash mumkin.

- **Telegramga jo‘natish** — Telegram ochiladi, chat, guruh yoki kanalni tanlab jo‘natasiz. Bot yoki token kerak emas.
- **Uzun xabar** — t.me juda uzun havolani "400 Bad Request" bilan rad etadi. Shuning uchun matn taxminan 3000 belgilik havolaga sig‘masa, bo‘limlar bo‘yicha qismlarga bo‘linadi: "1-qismni jo‘natish", "2-qismni jo‘natish" va hokazo. Jo‘natilgan qism belgilanadi.
- **Nusxalash** — butun matn buferga olinadi.
- **Ulashish** — telefonda tizimning ulashish oynasi (brauzer ruxsat bergan joyda).

Joriy filtrdagi tenderlar ro‘yxatini Ctrl/⌘ + K → "Tenderlar ro‘yxatini Telegramga jo‘natish" orqali yuborasiz (30 tagacha tender).

### Brauzerda lokal ochish

`index.html` faylini brauzerda oching. Claude'dan tashqarida u **lokal rejim**da ishlaydi: ma’lumotlar brauzer xotirasida saqlanadi, AI o‘chiq bo‘ladi. "Namuna ma’lumotlarni yuklash" tugmasi orqali [`namuna-malumotlar.json`](namuna-malumotlar.json) faylini tanlang.

## Ma’lumot kiritish

Tenderlarni o‘zingiz kiritasiz: **Tender qo‘shish** tugmasi (Umumiy panel yoki Tenderlar sahifasida). Formada nom, platforma, xarid turi, lot raqami, boshlang‘ich narx va valyuta, buyurtmachi, hudud, tugash sanasi, yo‘nalish, moliyalashtirish, hujjatlar tili, takliflar soni, moslik va havola bor. Moslik bo‘sh qolsa, Sozlamalardagi kalit so‘zlar bo‘yicha hisoblanadi.

Formaning yuqorisida **avto to‘ldirish** bor: lot matnini yoki skrinshotini qo‘ysangiz, AI maydonlarni to‘ldiradi, siz tekshirib saqlaysiz. Bu faqat Winder Claude ichida ochilganda ishlaydi.

Kiritilgan tenderni varaqdagi **Tahrirlash** tugmasi bilan o‘zgartirasiz; holat, izoh va AI tahlil saqlanib qoladi. Hujjatlar sahifasida yangi hujjat qo‘shiladi, Sozlamalar → Ma’lumotlar bo‘limida zaxira nusxa olinadi va tiklanadi.

## Fayllar

| Fayl | Nima |
|---|---|
| [`index.html`](index.html) | Butun ilova: bitta fayl, kutubxonasiz |
| [`namuna-malumotlar.json`](namuna-malumotlar.json) | Namuna tenderlar, hujjatlar, yangiliklar va sozlamalar |
| [`logo.svg`](logo.svg) | Winder logotipi |
