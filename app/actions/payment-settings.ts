'use server';

import { revalidatePath } from 'next/cache';
import { currentOperator } from '@/lib/auth';
import { record } from '@/lib/db/audit';
import { requestContext } from '@/lib/request-context';
import {
  getOperator,
  getPaymentProfile,
  setPaymentProfile,
  setSubmerchantKey,
  type LegalType,
} from '@/lib/db/operators';
import { paymentProvider } from '@/lib/payments';

/**
 * Alt üye işyeri (pazaryeri) ayarları.
 *
 * Bu ekranda işlenen veriler — vergi numarası, TCKN, IBAN — projede yeni bir
 * veri kategorisi. İki sonucu var ve ikisi de kabul ediliyor:
 *   1. İşletme sözleşmesi ve veri envanteri bu kalemleri saymak zorunda.
 *   2. Yalnızca **sahip** rolü erişebilir; personelin bu ekrana işi yok.
 *
 * Sunucu tarafındaki rol kontrolü menüyü gizlemekten bağımsızdır: menüyü
 * gizlemek yetkilendirme değildir.
 */

export type PaymentSettingsState = { error?: string; message?: string };

const LEGAL_TYPES: LegalType[] = ['personal', 'private', 'limited'];

/** Boşlukları ve ayırıcıları atar; IBAN her yerde aynı biçimde saklansın. */
function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * TR IBAN'ı 26 karakter ve 'TR' ile başlar. Burada yalnızca biçim sınanıyor;
 * hesabın gerçekten var olduğunu ancak sağlayıcı söyleyebilir.
 */
function looksLikeIban(value: string): boolean {
  return /^TR\d{24}$/.test(value);
}

export async function savePaymentProfileAction(
  _prev: PaymentSettingsState,
  formData: FormData
): Promise<PaymentSettingsState> {
  const session = await currentOperator();
  if (!session) return { error: 'Oturum sona ermiş.' };
  if (session.user.role !== 'owner') return { error: 'Bu işlem için yetkiniz yok.' };

  const legalTypeRaw = String(formData.get('legalType') ?? '');
  const legalType = LEGAL_TYPES.includes(legalTypeRaw as LegalType)
    ? (legalTypeRaw as LegalType)
    : null;
  if (!legalType) return { error: 'İşletme türünü seçin.' };

  const legalName = String(formData.get('legalName') ?? '').trim();
  const iban = normalizeIban(String(formData.get('iban') ?? ''));
  const legalAddress = String(formData.get('legalAddress') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '')
    .trim()
    .toLowerCase();
  const taxNumber = String(formData.get('taxNumber') ?? '').trim();
  const taxOffice = String(formData.get('taxOffice') ?? '').trim();
  const identityNumber = String(formData.get('identityNumber') ?? '').trim();

  if (legalName.length < 2) return { error: 'Unvan ya da ad soyad girin.' };
  if (!looksLikeIban(iban)) return { error: 'IBAN geçersiz. TR ile başlayan 26 karakter olmalı.' };
  if (legalAddress.length < 10) return { error: 'Açık adres girin.' };
  if (!contactEmail.includes('@')) return { error: 'Geçerli bir e-posta girin.' };

  // Gerçek kişi ve şahıs şirketinde TCKN, sermaye şirketinde vergi numarası
  // zorunlu — sağlayıcının başvuru alanları da böyle ayrışıyor.
  if (legalType === 'limited' && taxNumber.length < 10) {
    return { error: 'Sermaye şirketi için vergi numarası zorunlu.' };
  }
  if (legalType !== 'limited' && !/^\d{11}$/.test(identityNumber)) {
    return { error: 'T.C. kimlik numarası 11 hane olmalı.' };
  }

  await setPaymentProfile(session.operator.id, {
    legalType,
    legalName,
    taxNumber: taxNumber || null,
    taxOffice: taxOffice || null,
    identityNumber: identityNumber || null,
    iban,
    legalAddress,
    contactEmail,
  });

  // Günlüğe alanların KENDİSİ yazılmaz; vergi numarası ve IBAN'ı ikinci bir
  // yere kopyalamak, ihlal hâlinde kapsamı boş yere büyütürdü. Kaydın
  // değiştiği bilgisi yeterli.
  await record({
    action: 'operator.submerchant_created',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: session.operator.id,
    targetType: 'operator',
    targetId: session.operator.id,
    ...(await requestContext()),
    meta: { stage: 'profile_saved', legalType },
  });

  revalidatePath('/isletme/odeme-ayarlari');
  return { message: 'Bilgiler kaydedildi. Şimdi ödeme sağlayıcısına gönderebilirsiniz.' };
}

/**
 * Bilgileri sağlayıcıya gönderip alt üye işyeri açar.
 *
 * Dönen anahtar `submerchant_key IS NULL` koşuluyla yazılır: iki eşzamanlı
 * başvurudan ikincisi mevcut anahtarın üzerine yazamaz. Yazabilseydi, ilk
 * anahtarla başlamış ödemelerin parası artık takip edilmeyen bir üye işyerine
 * giderdi.
 */
export async function createSubmerchantAction(
  _prev: PaymentSettingsState,
  formData: FormData
): Promise<PaymentSettingsState> {
  const session = await currentOperator();
  if (!session) return { error: 'Oturum sona ermiş.' };
  if (session.user.role !== 'owner') return { error: 'Bu işlem için yetkiniz yok.' };

  // Vergi numarası, TCKN ve IBAN bu adımda ÜÇÜNCÜ BİR TARAFA gidiyor. Aktarımın
  // sessizce olmaması gerekir: onay kutusu, işletmenin bunu bilerek yaptığının
  // kaydı. Kontrol sunucuda, çünkü istemcideki `required` atlanabilir.
  if (formData.get('onay') !== 'evet') {
    return { error: 'Bilgilerin sağlayıcıya aktarılmasını onaylamanız gerekiyor.' };
  }

  const provider = paymentProvider();
  if (!provider) return { error: 'Ödeme sağlayıcısı henüz yapılandırılmamış.' };

  const operator = await getOperator(session.operator.id);
  if (!operator) return { error: 'İşletme bulunamadı.' };
  if (operator.submerchantKey) return { message: 'Bu işletme zaten ödemeye açık.' };

  const profile = await getPaymentProfile(session.operator.id);
  if (!profile?.legalType || !profile.iban || !profile.legalName) {
    return { error: 'Önce ticari bilgileri kaydedin.' };
  }

  const result = await provider.createSubmerchant({
    operatorId: operator.id,
    name: operator.name,
    legalType: profile.legalType,
    legalName: profile.legalName,
    address: profile.legalAddress ?? '',
    iban: profile.iban,
    email: profile.contactEmail ?? '',
    phone: session.user.phone ?? '',
    taxNumber: profile.taxNumber ?? undefined,
    taxOffice: profile.taxOffice ?? undefined,
    identityNumber: profile.identityNumber ?? undefined,
  });

  if (!result.ok) {
    await record({
      action: 'operator.submerchant_created',
      actorType: 'operator',
      actorId: session.user.id,
      operatorId: operator.id,
      targetType: 'operator',
      targetId: operator.id,
      outcome: 'failure',
      ...(await requestContext()),
      meta: { stage: 'provider_rejected' },
    });
    // Sağlayıcının mesajı doğrudan gösteriliyor: "hangi alan eksik" bilgisini
    // veren tek kaynak o ve bu ekranı gören kişi zaten işletmenin sahibi.
    return { error: `Sağlayıcı reddetti: ${result.error}` };
  }

  const stored = await setSubmerchantKey(operator.id, result.submerchantKey);

  await record({
    action: 'operator.submerchant_created',
    actorType: 'operator',
    actorId: session.user.id,
    operatorId: operator.id,
    targetType: 'operator',
    targetId: operator.id,
    ...(await requestContext()),
    meta: { stage: stored ? 'stored' : 'already_had_key', provider: provider.name },
  });

  revalidatePath('/isletme/odeme-ayarlari');
  return { message: 'İşletmeniz online ödemeye açıldı.' };
}
