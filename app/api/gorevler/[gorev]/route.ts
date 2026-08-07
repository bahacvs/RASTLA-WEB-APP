import { getJob, isAuthorized, listJobs } from '@/lib/jobs/index.mjs';

/**
 * Zamanlanmış işlerin HTTP ucu — Vercel Cron buraya çağrı yapar.
 *
 * Yetkisiz istek 404 değil **401** alır ve gövdesinde iş adı geçmez: hangi
 * işlerin var olduğunu doğrulanmamış birine söylememek gerekiyor.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gorev: string }> }
) {
  if (!isAuthorized(request.headers.get('authorization'))) {
    return Response.json({ error: 'Yetkisiz.' }, { status: 401 });
  }

  const { gorev } = await params;
  const job = getJob(gorev);

  if (!job) {
    return Response.json(
      { error: 'Bilinmeyen görev.', mevcut: listJobs().map((j) => j.name) },
      { status: 404 }
    );
  }

  try {
    const result = await job.run();
    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    // İş çökerse zamanlayıcı bunu görebilmeli; sessizce 200 dönmek en kötüsü.
    console.error(`[gorev:${gorev}] çalıştırılamadı:`, error);
    return Response.json(
      { job: gorev, ok: false, summary: 'Görev hata verdi.', error: String(error).slice(0, 300) },
      { status: 500 }
    );
  }
}

// Vercel Cron GET kullanır; POST da kabul edilir ki elle tetiklemek kolay olsun.
export const POST = GET;
