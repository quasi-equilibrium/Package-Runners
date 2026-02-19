# Package Runners v1

Three.js + Socket.IO tabanli, mobil yatay oynanan, gercek zamanli 4 kisilik runner oyunu.

## Ozellikler

- Tek global lobi, lider secimi ve manuel mac baslatma
- 1-4 oyuncu: eksik slotlari bot doldurur
- 3 level: Buz, Col, Gece Neon
- 3 power-up: El, Havai Fisek, Yag
- Server-authoritative fizik (30Hz tick, 20Hz snapshot)
- 20 sn reconnect penceresi
- Kalici skor tablosu (1.=5, 2.=3, 3.=1)

## Kurulum

```bash
npm install
npm run start
```

Varsayilan adres: `http://localhost:3000/client/index.html`

## Ortam Degiskenleri

- `PORT`: server portu (default: `3000`)
- `DATABASE_URL`: Postgres baglanti dizesi (verilmezse in-memory fallback)
- `DATABASE_SSL`: `false` verilirse SSL kapanir
- `CORS_ORIGINS`: virgulle ayrilmis origin listesi (default: `*`)

## Test

```bash
npm test
```

## Deploy

### Backend (Render Free)

1. Repo bagla
2. `render.yaml` kullanarak web service olustur
3. `DATABASE_URL` icin Render Postgres bagla
4. `CORS_ORIGINS` degerine GitHub Pages domainini ekle

### Frontend (GitHub Pages)

`client/` klasorunu Pages kaynagi olarak yayinla.
Gerekirse backend adresi icin URL parametresi kullan:

`https://<kullanici>.github.io/<repo>/client/index.html?server=https://<render-servisi>.onrender.com`
