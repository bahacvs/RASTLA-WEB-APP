import { translate } from '../../lib/db/index.mjs';

/**
 * Neon'un HTTPS SQL ucu üzerinden konuşan istemci.
 *
 * Var olma sebebi dar ve geçici: bazı ağlarda (CI kutuları, kısıtlı geliştirme
 * ortamları) Postgres'in 5432 portu kapalıdır ve yalnızca HTTPS çıkışı vardır.
 * Şemayı kurup demo verisini yüklemek için o durumda tek yol budur.
 *
 * **Uygulama bunu kullanmaz.** Vercel'de çalışan sunucu normal TCP havuzuyla
 * bağlanır (`lib/db/index.mjs`); bu dosya yalnızca kurulum betikleri için.
 * Uygulamaya sokmak, her isteği HTTP'ye çevirmek ve işlem (transaction)
 * desteğini kaybetmek olurdu.
 *
 * Arayüz `lib/db/index.mjs` içindeki `Client` ile aynı: `get`, `all`, `run`,
 * `close`. Böylece aynı betikler iki yoldan da çalışabiliyor.
 */
export function neonHttpClient(connectionString) {
  const host = new URL(connectionString.replace(/^postgres(ql)?:/, 'https:')).host;
  const endpoint = `https://${host}/sql`;

  /**
   * @param {string} sql
   * @param {unknown[]} params
   */
  async function query(sql, params) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'neon-connection-string': connectionString,
      },
      body: JSON.stringify({ query: sql, params }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Neon HTTP ${response.status}: ${detail.slice(0, 400)}\nSQL: ${sql.slice(0, 200)}`);
    }

    return response.json();
  }

  return {
    /**
     * Ham SQL — birden çok ifade içerebilir.
     *
     * Neon'un HTTPS ucu hazırlanmış ifade (prepared statement) kullanıyor ve
     * **tek çağrıda yalnızca bir komut** kabul ediyor; şema dosyası ise
     * onlarca `CREATE TABLE` içeriyor. Bu yüzden noktalı virgülden bölünüp
     * sırayla gönderiliyor.
     *
     * Bölme güvenli: önce `--` yorumları atılıyor ve şemada dizgi sabitinin
     * içinde noktalı virgül yok (kontrol edildi). Genel amaçlı bir SQL
     * ayrıştırıcısı değil — yalnızca bu şema için.
     */
    async exec(sql) {
      const statements = sql
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const statement of statements) await query(statement, []);
    },

    async get(sql, params) {
      const result = await query(...translate(sql, params));
      return result.rows[0];
    },

    async all(sql, params) {
      const result = await query(...translate(sql, params));
      return result.rows;
    },

    async run(sql, params) {
      const result = await query(...translate(sql, params));
      return { changes: result.rowCount ?? 0 };
    },

    async close() {
      // HTTP; açık bağlantı yok.
    },
  };
}
