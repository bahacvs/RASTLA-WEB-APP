/**
 * Demo (tanıtım) kipi.
 *
 * `DEMO_MODE=1` verildiğinde site, **gerçek bir hizmet gibi davranmaz**:
 *
 *   - Bütün sayfalar `noindex` olur ve sitemap boşalır.
 *   - Her ekranın üstünde görünür bir "demo" şeridi çıkar.
 *
 * Sebebi ciddi: demo verisi uydurma işletme adları ve uydurma ilanlar içerir.
 * Bunlar arama motorlarına açık kalsaydı, var olmayan işletmeler Büyükçekmece'de
 * gerçekten hizmet veriyormuş gibi indekslenirdi; birileri rezervasyon yapmaya
 * çalışır, kimse karşılamaz. Şerit de aynı işi insan tarafında yapar.
 *
 * Kip **yalnızca sunucuda** okunur ve istemciye tek bir evet/hayır olarak
 * geçer; hangi ortam değişkeninin açık olduğu tarayıcıya sızmaz.
 */
export const IS_DEMO = process.env.DEMO_MODE === '1';
