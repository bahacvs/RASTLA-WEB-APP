/**
 * Rol → yetenek eşlemesi.
 *
 * Bu dosya bilinçli olarak **saf veri**: sunucu modülü içe aktarmıyor, böylece
 * hem sunucu eylemleri hem de menüyü çizen istemci bileşenleri aynı tablodan
 * okuyabiliyor. Menünün gösterdiği ile sunucunun izin verdiği ayrı yerlerde
 * tanımlansaydı, ikisi er geç ayrışırdı — ve o ayrışmanın görünen yüzü
 * "düğme var ama basınca yetkiniz yok" olurdu.
 *
 * DİKKAT — buradaki liste **arayüzü değil yetkiyi** tanımlar. Menüyü daraltmak
 * bir kolaylık; asıl engel her sunucu eyleminin başındaki `requireCapability`
 * çağrısıdır. Arayüzden bir düğmeyi kaldırmak, o işlemi yapılamaz kılmaz.
 */

export type OperatorRole = 'owner' | 'manager' | 'staff';

export type Capability =
  /** Bugün ekranı ve günün rezervasyon akışı. */
  | 'bugun.goruntule'
  /** Takvimi görmek — seansları, doluluğu. */
  | 'takvim.goruntule'
  /** Kural eklemek, seans açmak/kapatmak, kapasite değiştirmek. */
  | 'takvim.yonet'
  /** Aktivite oluşturmak, düzenlemek, yayınlamak, görsel yüklemek. */
  | 'aktivite.yonet'
  | 'rezervasyon.goruntule'
  /** İptal, erteleme, saat değişikliği. */
  | 'rezervasyon.yonet'
  /** Telefondan/WhatsApp'tan gelen müşteriyi elle eklemek. */
  | 'rezervasyon.manuel'
  /** QR okutmak, geldi/gelmedi işaretlemek. */
  | 'checkin.yap'
  | 'musteri.goruntule'
  /** Müşteri listesini toplu indirmek. */
  | 'musteri.disaAktar'
  /** Ciro, hak ediş, mutabakat. */
  | 'finans.goruntule'
  /** Banka bilgisi, alt üye işyeri, komisyon ayarları. */
  | 'odeme.yonet'
  | 'ekip.yonet'
  | 'gunluk.goruntule'
  | 'uyari.kapat';

/**
 * Saha personeli: telefonu elinde, sahilde çalışıyor.
 *
 * Yalnızca günü görür ve bilet okutur. Müşteri listesini toplu indirememesi
 * bilinçli: platform dışına müşteri kaçırmanın en kolay yolu o listedir ve
 * ayrılan bir çalışanın elinde kalmamalı.
 */
const STAFF: Capability[] = [
  'bugun.goruntule',
  'takvim.goruntule',
  'rezervasyon.goruntule',
  'checkin.yap',
];

/**
 * Yönetici: operasyonu yürütür.
 *
 * Finansa ve banka bilgisine erişemez. Sebep sadece gizlilik değil görev
 * ayrılığı: rezervasyonu oluşturan ile parayı yönlendiren aynı kişi olmamalı.
 */
const MANAGER: Capability[] = [
  ...STAFF,
  'takvim.yonet',
  'aktivite.yonet',
  'rezervasyon.yonet',
  'rezervasyon.manuel',
  'musteri.goruntule',
  'gunluk.goruntule',
];

/** Sahip: her şey. */
const OWNER: Capability[] = [
  ...MANAGER,
  'musteri.disaAktar',
  'finans.goruntule',
  'odeme.yonet',
  'ekip.yonet',
  'uyari.kapat',
];

const BY_ROLE: Record<OperatorRole, readonly Capability[]> = {
  owner: OWNER,
  manager: MANAGER,
  staff: STAFF,
};

export const OPERATOR_ROLES: OperatorRole[] = ['owner', 'manager', 'staff'];

export const ROLE_LABELS: Record<OperatorRole, string> = {
  owner: 'Sahip',
  manager: 'Yönetici',
  staff: 'Saha personeli',
};

/** Dışarıdan gelen dizginin gerçekten bir rol olup olmadığı. */
export function isOperatorRole(value: string): value is OperatorRole {
  return (OPERATOR_ROLES as string[]).includes(value);
}

export function roleCan(role: OperatorRole, capability: Capability): boolean {
  return BY_ROLE[role].includes(capability);
}

export function capabilitiesOf(role: OperatorRole): readonly Capability[] {
  return BY_ROLE[role];
}
