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

Server acilinca terminalde `localhost` ve yerel ag (`192.168.x.x`) adresleri yazdirilir.
Telefondan oynamak icin ayni Wi-Fi aginda su adrese gir:
`http://<bilgisayar-ip>:3000/client/index.html`

## Ortam Degiskenleri

- `PORT`: server portu (default: `3000`)
- `HOST`: bind hostu (default: `0.0.0.0`)
- `DATABASE_URL`: Postgres baglanti dizesi (verilmezse in-memory fallback)
- `DATABASE_SSL`: `false` verilirse SSL kapanir
- `CORS_ORIGINS`: virgulle ayrilmis origin listesi (default: `*`)

## Test

```bash
npm test
```

## Lokal Backend (Bu Bilgisayar)

1. `.env.example` dosyasini `.env` olarak kopyala ve gerekirse duzenle.
2. `npm run start` ile serveri calistir.
3. Windows Firewall sorarsa Node icin `Private network` izni ver.
4. Telefonlar ayni agda bu adrese girsin:
   `http://<bilgisayar-ip>:3000/client/index.html`

Notlar:
- Backend bu bilgisayarda calistigi surece oyun erisilebilir olur.
- Bilgisayar kapanirsa veya server durursa oyun kapanir.
- Internetten erisim gerekiyorsa port-forward/tunnel gerekir.

## Frontend Ayri Host Edilecekse

`client/index.html` URL'ine backend parametresi eklenebilir:

`?server=http://<bilgisayar-ip>:3000`

Ornek:
`https://<kullanici>.github.io/<repo>/client/index.html?server=http://192.168.1.50:3000`
