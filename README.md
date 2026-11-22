# Cassino Ev Paneli

Cassino'da oda veya ev arayan bir öğrenci için ilan paneli. Immobiliare.it, Idealista, Subito.it gibi sitelerin Gmail'e gelen ilan bildirimlerini okur. Claude ilan metninden fiyat, faturalar, eşya, cinsiyet tercihi gibi bilgileri çıkarır. Panel ilanları kullanıcının **panel içinden tanımladığı** kriterlere göre puanlar, listeler, "Kontrol et"e gönderir ya da gerekçesiyle eler. Hiçbir tercih koda gömülü değildir.

Panel bir Claude artifact'i olarak yayınlanır. `db`, `user`, `sample` ve `mcp` (Gmail) yeteneklerini kullanır.

## Geliştirme

```bash
npm install
npm test        # node:test birim testleri
npm run build   # dist/index.html (tek dosya, yayınlanan sayfa)
```

## Yapı

| Klasör | Görev |
|---|---|
| `src/core` | Uzaklık, olgu kataloğu, kriter değerlendirme, tekrar tespiti |
| `src/extract` | Claude'a giden çıkarma istemi ve yanıtın normalleştirilmesi |
| `src/sources` | Gmail'den yeni bildirimlerin okunması |
| `src/store` | Kullanıcıya özel veri deposu (`data/users/<id>/…`) |
| `src/refresh.js` | Tek bir "Yenile" çalışması |
| `src/ui` | Görünümler, stil ve uygulama bağlantıları |

Tasarım ve plan: `docs/superpowers/`.
