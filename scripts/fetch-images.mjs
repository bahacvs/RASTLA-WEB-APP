/**
 * Stitch'in geçici CDN'inde barınan prototip görsellerini repoya indirir.
 *
 * Bu betik bir kez çalıştırılır ve çıktısı (public/images/) commit edilir.
 * Kaynak URL'ler geçicidir; süreleri dolduğunda betik artık çalışmaz — bu yüzden
 * indirilen dosyalar repoda tutulur ve betik yalnızca kaynak kaydı olarak kalır.
 *
 * Kullanım: node scripts/fetch-images.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'images');

/** Kaynak URL -> repo içi dosya adı ve alt metni. */
const IMAGES = [
  // Not: Prototipte header logosu da Stitch'ten geliyordu (beyaz zeminli, yazılı bir
  // kilit). Repoda zaten şeffaf zeminli gerçek marka sembolü bulunduğu için
  // (public/brand/rastla-symbol.png) o görsel indirilmiyor.
  {
    name: 'jetski-hero',
    alt: 'Parlak mavi deniz üzerinde hızla ilerleyen bir jet ski',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAUFmRyiCtbpvZGgS64t9HLjVQt6owsDBrH3bHSuwPVHD3mLJeMO0uv4CHNYWPAeM7GaKFYHJmDH8pnkiH9eAhIEtQOV5jmXFiF9Rtlfxxb3Cb5sBzT5gWgo-3AkN3DqSgiDTB19nHA0eggugV0nZDvHza7dKDhoBFKXlO9sLw9A2xZUFSQoMQhdxJwJ1Z_567CitJ74y9ylxuv5c0Xztilp08RQ31moKHsxa9pSHiFOXSIzi3c71vr1A',
  },
  {
    name: 'sup-sunset',
    alt: 'Gün batımında sakin sularda kürek süren bir kişi',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCEVK4u4HioNcV-T1MZKJIwVYUutegjHFqvW1L6AmrpSvMDuLRfw7Q2GZ96ADCVcG15AhkEIoD9ASiqXZnqk29UJGvhksxnq7z1HtOzwvhnwE6vWV_7YUUGYHrTHtgW_Bh7UhoqGrvBAR_F9bIfH7fTboJwX7mUEy403iENo7O2KWGMBVUHJcdQKsNK9MS3VKqnErnMAPWh84wFKJEFn49ir4lzk8Io6vSsTAy-Ci3rSY9zltUbtNTi3Q',
  },
  {
    name: 'kayaks-beach',
    alt: 'Kumsalda duran renkli kanolar ve arkada berrak deniz',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD_qtwB8pSyZZExkMW8_IwiyC_YgNgc8yJQIx9bkG4_BvM77kQTxHwOEzFM-XrAyNrdiEuxFO1c0z1inmlQO1uiCPf0hZjYwflCJMnCqREHVWDAfIDjeYw-UdLmVDGakwlU0-WmgKAzy2Iq6QBfJKnezdmQFXveLxt4IzD8JcrA8TxYIFnAZKLVBnX0XCtZYLpXXmurK4KeirC5HJmZTXVOEc9gS92GoBlabXz00eBflG7K0TtMGTjn6Q',
  },
  {
    name: 'boat-aerial',
    alt: 'Kıyı boyunca ilerleyen küçük beyaz teknenin havadan görüntüsü',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAafRTMsJcIJ4o7aOTOUlrzrr_w4Pj5L7zLQ34X-qemwt12IPjZ_sodUTQFRXGLYxMQN001RvWcQGfLX190l31ys4-znehOT5oyThGD148v1yjTDgOxknaBgwIit-mQ7sgA-58FvDEHVEdrba8NsyztlmL9U_TXuiT23ttoJDadmSRKDTfB1hwSV4vL0Xx9Whq7E6wDj_q2wJpkMRyzP-i9GlYuoTuGTIEU0bhCnF9eW4Ado95NZASjiQ',
  },
  {
    name: 'sup-coastline',
    alt: 'Güneşli bir kıyı yakınında sakin mavi sularda kürek süren bir kişi',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD4xctitEDywAAbPCTmJ84e5d-zV8gV-47zJj1O_sG7bRGSBGp1texRD8kalBWlClBK6di98eIy6eNy6cM_nTL58Vk_y8cRiG3g-QCMcd5I4uYmOFDZ197MEwDRJRgcuJhhS9qhqujk8KkZ7IIF0BkpEtq6k2JUw3_H0njWHzrQ4bY_8ddqYOPtdbnl0OqzmJ3kkD5kwTyAZWyhp0EKezHStVXzCKnFeZtZnzufxEFUpmLHJ34BJHXCcw',
  },
  {
    name: 'windsurf-action',
    alt: 'Öğleden sonra dalgalar üzerinde ilerleyen bir rüzgâr sörfçüsü',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZDxbusV1KodfYuNXaYUErC3ZgZ_V1M0V-aIomEguru5E-tMFCKq7LDF-uMwuSdxfi2lSFew3uhzFCygh9vngPAE1nd4QlWGx6LLYeT-QsmagP25NkOq2Q7tvl2qQE2q8iXk8N3lKZetibT57F3qT6-NxQi4ZW3G7UKrOV2fCptDzvfFECZPmpkLnxgDy_IhLwz2L0C28qQaMiYluWgCIRCH8kRWAZsiPACuO192kQD-zREkeqcdWhWg',
  },
  {
    name: 'map-search-view',
    alt: 'Büyükçekmece kıyı şeridini gösteren sade, açık temalı dijital harita görünümü',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC3YMfJgIZ0gNmaMBK9wIDe-yUTdX7mjuRwsYgCWC4_FFJhl8JhpzQzOtqSyWwD4KQRXr6OYWwGN_DbFEEl9iDJY2R-9_SXAdMFrdIYE162zbPvCp41Ez4tEFz7_vYhKj_Q7qH1QcFuQp_X4evfY4FLnNsrXO1FosdU1_sx_B3Pol6hCCwK_SHc_aBhmVBp2mqLT-mOPdA4xr0PUgUItSh29euj01HFbYt01t1HMedq3yEyf_6sr6la_g',
  },
  {
    name: 'esup-action',
    alt: 'Berrak sular üzerinde elektrikli SUP kullanan bir kişi',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCeMmFZTge4Ew3ZL4ztZFP0CAurx2ZzHPlhsI4VOS7D0ETxIn0TgNWEy263OIqm3lbLS5fSbcjsFb8k1R2uPNFCrS5GivBrONt7jy8d5I5JfZWJLTuRgmWu_kt2XFkaAQgxKRsgnr6P6qpcHxX8s6iNkJGh6LUKa40EDoLFP5Fenvz6ZLT-gDI3UG3bCySUKbFnqVk33It0rvO40HVKlyDGoKvo_0qBF--2E7yHIXN1pGjSh3-F7ElpAQ',
  },
  {
    name: 'esup-motor-detail',
    alt: 'Modern bir elektrikli SUP’un motor detayının yakın çekimi',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCwSltjlNBh-rGfxFXWCPoxBx9kF9faVsbLkXc9CJWuOAKOJtaDXwRMy33Y8vW_5ligYcw9eoqw7LiqyUy-7htrhQ5_ZFfWpVc0cYFdE3KDYszznzGS1gs-DNgjBrDqQvLzsneLWAjVI5JAhYfS532u5yqpgNdzg7vA5XwAaa_CNtiXwdBzQjjtHWNG4ELKtDubenvj0gySzMIipfpDGZycElA544RjsydQRCMHq4_O9Ms30PEao1Afbg',
  },
  {
    name: 'esup-group-sunset',
    alt: 'Gün batımında elektrikli SUP ile eğlenen bir arkadaş grubu',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAirnMPY_Lk4bi_nzD83tSLPJdWjHe_5I1lOWO4sTo_p3FQlgkfrCWZ8o0bmIgexvld0qsFr5WEyV01DfzArb7k1qeRcwUN-D27qYSrm_fTKlzjrPLq4bTKYe3-nPRA93xGook2CHyZOVJSWbTHOnB1pHwltBEHZFt8lHiblA_GKTcl9qVNf7lLC0dd_dJj61ZkR84nvZeaf1kpFHzTZhOsYawFLxad6Wz0ZnambdatDtHTuFJ-9FlvSA',
  },
  {
    name: 'map-meeting-point',
    alt: 'Büyükçekmece kıyı bölgesini gösteren sade, açık temalı harita kesiti',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuChj3UfeRq1VxE15Uq_Ei0bcgXwtKKDKhQ0_MCM_InN7PIoEmPQx5j9cEo6VxHO9dIOTOHfu3becKtMCf5ek0Dkpqc9t60U6Rf-Fwy9w-WZsF_bVHOIq2msEqU72TloxQm0n_HyXvU1wcP2aVxXFxDBF_DBLfQY3wQvkYr4BGe5vremWHdFelinPYnfyT_67bV94IzofOn6I250rVND7ZzytAd9eK3CKNZWLXuq8RE70jlxLFFZWgdmvQ',
  },
];

/** Content-Type -> dosya uzantısı. */
const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function fetchImage({ name, url, alt }) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${name}: HTTP ${res.status} — kaynak URL büyük olasılıkla süresi dolmuş`);
  }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const ext = EXT[type];
  if (!ext) throw new Error(`${name}: beklenmeyen içerik tipi ${type}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const file = `${name}.${ext}`;
  await writeFile(join(OUT_DIR, file), buf);
  return { name, file, alt, bytes: buf.length };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const results = await Promise.all(IMAGES.map(fetchImage));

  for (const r of results) {
    console.log(`${r.file.padEnd(28)} ${String(r.bytes).padStart(7)} bayt`);
  }
  console.log(`\n${results.length} görsel indirildi -> public/images/`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
