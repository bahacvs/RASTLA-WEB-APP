/**
 * Demo (tanıtım) kipi.
 *
 * Kip AÇIKKEN site, **gerçek bir hizmet gibi davranmaz**:
 *
 *   - Bütün sayfalar `noindex` olur ve sitemap boşalır.
 *   - Her ekranın üstünde kapatılamayan bir "tanıtım sürümü" şeridi çıkar.
 *
 * Sebebi ciddi: demo verisi uydurma işletme adları ve uydurma ilanlar içerir.
 * Bunlar arama motorlarına açık kalsaydı, var olmayan işletmeler Büyükçekmece'de
 * gerçekten hizmet veriyormuş gibi indekslenirdi; birileri rezervasyon yapmaya
 * çalışır, kimse karşılamaz. Şerit de aynı işi insan tarafında yapar.
 *
 * **VARSAYILAN AÇIK.** Önce `DEMO_MODE=1` ile açılıyordu; yani değişkeni
 * tanımlamayı unutmak, uydurma ilanların gerçekmiş gibi yayınlanması demekti
 * ve unutulduğu tek yerde zarar en büyüğüydü. Şimdi tersi: kapatmak DELİBERE
 * bir eylem, `DEMO_MODE=0`. Projedeki diğer güvenlik anahtarlarıyla aynı
 * mantık — `CRON_SECRET` tanımsızken de uçlar açık değil, kapalıdır.
 *
 * Kapatmadan önce KURULUM.md'deki listenin tamamlanmış olması gerekiyor:
 * gerçek işletme kayıtları, iyzico anahtarları, ETBİS ve hukukçu onayı.
 * Şerit kaldırıldığı an site "bu gerçek bir hizmettir" demiş oluyor.
 *
 * Kip **yalnızca sunucuda** okunur ve istemciye tek bir evet/hayır olarak
 * geçer; hangi ortam değişkeninin açık olduğu tarayıcıya sızmaz.
 */
export const IS_DEMO = process.env.DEMO_MODE !== '0';
