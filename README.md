# RASTLA Web App

RASTLA, Türkiye'deki su sporları ve yerel turistik aktiviteleri tek platformda keşfetme, karşılaştırma ve rezervasyon yapma vizyonuyla geliştirilen bir deneyim pazaryeridir.

## Pilot kapsam

- Bölge: İstanbul, Büyükçekmece Sahili
- İlk kategoriler: elektrikli SUP, SUPMARAN, jet ski ve kano
- Hedef kullanıcı: yerli ve yabancı turist
- Temel değer: açık fiyat, doğrulanmış işletme ve kolay rezervasyon

## Bu repoda ne var?

Stitch tarafından üretilen dört statik ekran, tek bir prototip giriş sayfası altında düzenlenmiştir:

- Ana sayfa
- Arama ve harita
- Aktivite detay sayfası
- Rezervasyon adımları
- Marka dosyaları
- Tasarım sistemi dokümanı

## Yerelde çalıştırma

Ek bağımlılık gerekmez.

```bash
python3 -m http.server 8080
```

Ardından `http://localhost:8080` adresini açın.

## Yayınlama

Statik yapı Vercel veya GitHub Pages ile yayınlanabilir. Vercel için framework seçmeden repo kökünü yayınlamak yeterlidir.

## Gerçekçi teknik durum

Bu çalışma üretim uygulaması değildir. Arayüz prototipidir ve bazı görseller Google'ın geçici Stitch kaynaklarına bağlıdır. Üretime geçmeden önce:

1. Tasarım React/Next.js bileşenlerine ayrılmalı.
2. Görseller lisanslı ve kalıcı dosyalarla değiştirilmelidir.
3. Kimlik doğrulama, ödeme, rezervasyon ve işletme yönetimi geliştirilmelidir.
4. Harita sağlayıcısı ve konum altyapısı seçilmelidir.
5. KVKK, mesafeli satış, iptal/iade ve işletme sözleşmeleri hazırlanmalıdır.

## Marka renkleri

| Rol | Renk |
| --- | --- |
| Ana mavi | `#0754B8` |
| Koyu lacivert | `#102334` |
| Mercan vurgu | `#FF5A4F` |
| Kırık beyaz | `#FAF8F5` |
| Metin gri | `#667085` |

## Sonraki geliştirme hedefi

İlk gerçek MVP, tüketici tarafında arama → aktivite detayı → rezervasyon talebi akışını ve işletme tarafında müsaitlik yönetimini kapsamalıdır. Online ödeme ikinci kontrollü fazda eklenebilir.
