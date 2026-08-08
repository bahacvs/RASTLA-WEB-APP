/**
 * Hak edişin işletmenin hesabına ne zaman geçtiği.
 *
 * **Bu takvim henüz belirlenmedi** ve uydurulmuyor. "Her salı aktarılır" gibi
 * bir cümle yazmak, işletmeye tutamayacağımız bir söz vermek olurdu; ekranda
 * yanlış bir tarih görmek, hiç tarih görmemekten kötüdür.
 *
 * Ödeme altyapısıyla aktarım periyodu netleştiğinde `PAYOUT_SCHEDULE` ortam
 * değişkenine yazılır ve ekranda o cümle görünür. Tek yerde durmasının sebebi:
 * aynı metin hem hak ediş ekranında hem de işletme sözleşmesinde geçiyor.
 */
export const TRANSFER_SCHEDULE_TEXT =
  process.env.PAYOUT_SCHEDULE ??
  'Aktarım takvimi henüz belirlenmedi. Hak edilen tutarlar sağlayıcıda ' +
    'işletmeniz adına tutuluyor; aktarım periyodu netleştiğinde burada yazacak.';
