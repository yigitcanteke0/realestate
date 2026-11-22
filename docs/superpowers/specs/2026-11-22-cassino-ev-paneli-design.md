# Cassino Ev Paneli — Tasarım Dokümanı

Tarih: 2026-11-22 · Durum: Onaylandı (2026-11-22)

## 1. Amaç ve neden

Kullanıcı Università di Cassino'da yüksek lisans öğrencisi. Şu an tek başına kaldığı bir Double Room için fazla ödüyor. Hedefi, kendi önceliklerine uyan en iyi seçeneği en uygun fiyata, en kısa sürede bulmak.

Arka plan işini ilan sitelerinin **e-posta bildirimleri** yapar. Kullanıcı Immobiliare.it, Idealista, Subito.it gibi sitelerde kayıtlı aramalar kurar, ilanlar Gmail'ine düşer. Panel bu e-postaların üzerinde çalışan **bir arayüz ve filtreleme katmanıdır**. İlanları toplar, yapılandırılmış bilgiye çevirir ve kullanıcının panel içinden belirlediği kurallara göre puanlar, sıralar ve eler.

Kullanıcının ana ilkesi: **hiçbir tercih koda gömülmez.** Hangi kriterin önemli olduğu, hangi durumun ilanı eleyeceği, hedef değerler, hepsi panelin içinden seçilir ve değiştirilir. Panel mobilde ve masaüstünde aynı linkle çalışır.

## 2. Hedefler / hedef olmayanlar / anti-hedefler

**Hedefler**
- "Yenile" ile Gmail'deki ilan bildirimlerini okumak. Yalnızca son yenilemeden sonra gelen e-postalar işlenir.
- Her ilandan bilgileri çıkarmak: fiyat, tip, faturalar, eşya, tarih, adres/mahalle, ev arkadaşı sayısı, sözleşme, **cinsiyet tercihi belirtilmiş mi** vb.
- Puanlamanın, eleme kurallarının ve kriterlerin tamamen panel içinden yönetilmesi (modüler yapı, bkz. 5).
- Eksik bilgilerin "**! İlanda belirtilmemiş / bilgi alınamadı**" işaretiyle gösterilmesi. Karta tıklayınca orijinal ilan açılır.
- Elenenler sekmesinde her ilan için **hangi kural yüzünden** elendiğinin yazılması ve "Geri al" düğmesi.
- İnsan kontrolü: belirsiz durumlar "Kontrol et" kutusuna düşer, son karar kullanıcıdadır.

**Hedef olmayanlar (şimdilik)**
- Facebook grupları. Kullanıcı isterse ileride eklenir.
- Siteleri doğrudan tarama, web araması, kullanıcının tarayıcısı üzerinden gezinme.
- Zamanlanmış arka plan görevi. Arka plan işini e-posta bildirimleri görür.
- Ev sahibine mesaj gönderme. Birden fazla kullanıcı.

**Anti-hedefler**
- Bir ilanın sessizce kaybolması. Her ilan Liste, Kontrol et veya Elenenler sekmelerinden birinde görünür.
- Aynı ilanın birden fazla kez görünmesi.
- Kodda sabit bir tercih ya da eleme kuralı bulunması.
- Puanın nereden geldiğinin görülememesi.

## 3. Kısıtlar

- Panel, Claude'da yayınlanan bir web sayfasıdır (artifact). Kullandığı yetenekler:
  - `mcp` → kullanıcının Gmail bağlayıcısı (`search_threads`, `get_thread`, `get_message`)
  - `sample` → İtalyanca metinden bilgi çıkarmak için Claude
  - `db` + `user` → kullanıcıya özel kalıcı veri (`data/users/<id>/…`), telefon ve bilgisayarda aynı veri
- Bildirim e-postaları çoğu zaman yalnızca başlık, fiyat, bölge ve link içerir. Pek çok alan bu yüzden "!" olarak kalacaktır. Bu bilinçli olarak kabul edildi.
- Her yenileme Claude kullanım hakkı harcar, bu yüzden yalnızca yeni e-postalar işlenir.

## 4. Yaklaşımlar

| | Yaklaşım | Durum |
|---|---|---|
| A | Panel + her sabah zamanlanmış görev (web araması, ilan sayfası okuma) | Değerlendirildi, seçilmedi |
| **B** | **Panel + "Yenile" ile Gmail okuma, e-posta bildirimleri arka plan işini görür** | **Seçildi** |
| C | Kendi sunucu + site tarayıcı | Kırılgan ve kullanım koşullarına aykırı, elendi |

Kullanıcı B'yi seçti. Gerekçesi: bildirimler zaten arka planda çalışıyor, panelin işi bunları süzmek. Veri modeli ileride başka kaynak eklemeyi (Facebook, zamanlanmış görev) engellememelidir.

## 5. Modüler yapı (kullanıcının kararı: hiçbir şey koda gömülmez)

Sistem birbirinden bağımsız dört katmandan oluşur:

1. **Kaynaklar.** Şimdilik tek kaynak var: Gmail. Hangi gönderen adreslerinin "ilan bildirimi" sayıldığı panelde düzenlenebilir bir listedir. Kaynak arayüzü, ileride Facebook ya da elle ekleme gibi kaynaklar takılabilecek şekilde tasarlanır.
2. **Çıkarıcı.** Her ilandan standart **olgular** (facts) üretir. Her olgu `değer | bilinmiyor` olur ve kaynak cümlesini saklar. Örneğin `cinsiyet_tercihi: sadece_kız | sadece_erkek | yok | belirsiz | bilinmiyor`. Çıkarıcı karar vermez, sadece ne yazdığını raporlar.
3. **Kriterler.** Panelde tanımlanan, düzenlenen ve silinen kayıtlardır. Her kriter bir olguya bağlanır ve şunları taşır:
   - ağırlık (0–5),
   - hedef değer veya kabul edilen değerler,
   - davranış: **puanla** / **olmazsa olmaz (değilse ele)** / **bu değerse ele** / **bu değerse Kontrol et'e gönder**,
   - bilinmiyorsa ne yapılacağı: nötr say / Kontrol et'e gönder / ele.

   Kullanıcı ayrıca **serbest kelime kriterleri** ekleyebilir: "metinde X geçiyorsa ±puan / ele / Kontrol et".
4. **Görünüm.** Puan = Σ(uygunluk × ağırlık) / Σ(ağırlık), 0–100 arası. Her kartta puan dökümü açılabilir. Ayar değişince tüm ilanlar yeniden değerlendirilir. Bunun için Claude'a tekrar sorulmaz, olgular saklı durur.

Kullanıcı kararları kalıcıdır. "Geri al" denen ilan bir daha otomatik elenmez. "Kontrol et"te verilen karar da saklanır.

**Başlangıç durumu (kullanıcının kararı): tamamen boş.** İlk açılışta hiçbir kriter, kelime kuralı veya eleme kuralı yoktur. Kullanıcı hepsini Önceliklerim ekranından kendisi ekler. Kriter eklerken, çıkarıcının ürettiği olgular arasından seçim yapılır (bkz. katman 2).

**Referans noktaları ve uzaklık (kullanıcının kararı):** Uzaklık, kullanıcının panelde girdiği bir **koordinata** (enlem, boylam) göre hesaplanır. Kullanıcı bunun için merkezde bir nokta belirleyecek. Referans noktası bir ayardır ve koda gömülmez. Modüler yapı gereği birden fazla nokta tanımlanabilir. Her nokta, "X'e uzaklık" adıyla kriterlerde seçilebilen bir olgu olur.

## 6. Görünümler
- **Liste:** puana, fiyata veya tarihe göre sıralı kartlar. Kartlarda fiyat, tip, tasarruf (isteğe bağlı "şu anki kiram" ayarı doluysa), "!" işaretli eksik alanlar, kaynak ve orijinal ilana link bulunur.
- **Kontrol et:** kullanıcı kararı bekleyenler.
- **Elenenler:** eleyen kural ve ilgili alıntı, "Geri al" düğmesi.
- **Önceliklerim:** kriterlerin, kelime kurallarının ve gönderen listesinin düzenlenmesi.
- **Kaynaklar:** Gmail durumu, son yenileme zamanı, sitelerde bildirim kurma rehberi.

## 7. Yapıcıya bırakılanlar
- db yol yapısı, tekrar tespiti (normalleştirilmiş URL, yoksa fiyat + başlık/adres benzerliği).
- Gmail sorgusu (gönderen listesi + son yenileme tarihi). Bir e-postada birden çok ilan olabilir.
- `sample.json` çıkarma istemi ve şeması.
- Uzaklık olgusu: ilanın adresi/mahallesi koordinata çevrilir ve referans noktasına kuş uçuşu mesafe hesaplanır. Yanında yaklaşık yürüme süresi gösterilir ve "tahmini" etiketi bulunur. Koordinata çevirme için sayfa erişebiliyorsa bir coğrafi kodlama (geocoding) servisi (ör. OpenStreetMap Nominatim) kullanılır, erişemiyorsa Claude tahmini kullanılır. Hangisinin kullanıldığı kartta belirtilir. Adres yoksa olgu "! bilinmiyor" olur. Koordinatlar ilan başına saklanır, referans noktası değişince yeniden hesaplanır ve bunun için Claude'a tekrar sorulmaz.
- Hata durumları (Gmail bağlı değil, izin yok, kota) için anlaşılır mesajlar.
- Görsel tasarım: mobil öncelikli, sade, okunaklı.

## 8. Sprintler
- **Sprint 1:** iskelet + db, modüler kriter motoru ve Önceliklerim ekranı, Gmail ile yenileme, Liste / Kontrol et / Elenenler, "!" işaretleri.
- **Sprint 2:** favoriler, notlar, ilan durumu (aradım / gördüm / reddettim), tekrar tespiti iyileştirmeleri.
- **Sonra (istenirse):** Facebook, zamanlanmış görev, harita uzaklığı.

## 9. Kullanıcının yapacakları
- Sitelerde Cassino için kayıtlı arama + e-posta bildirimi kurmak (panel rehber gösterir).
- İlk açılışta Gmail ve Claude izinlerini onaylamak.
