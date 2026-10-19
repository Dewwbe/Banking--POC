import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

/**
 * Strapi webhook target (Workstream F). Strapi → POST /api/revalidate with header x-revalidate-secret.
 * Expires the cache tags for the changed model (plus dependants) so the next request renders fresh data.
 * Each call logs a JSON line with the delay between the Strapi event and the webhook — use it for the
 * takedown-time measurement (OPS-07) together with scripts/takedown-timer.sh.
 */

// A change to one model can affect pages that embed it.
const DEPENDANTS: Record<string, string[]> = {
  product: ['home', 'promotion'],
  'news-article': [],
  promotion: [],
  home: [],
  'about-us': [],
  'contact-us': [],
};

function validSecret(given: string | null) {
  const expected = process.env.REVALIDATE_SECRET ?? '';
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function POST(req: Request) {
  if (!validSecret(req.headers.get('x-revalidate-secret'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const model: string | undefined = body?.model;
  const entry = body?.entry ?? {};
  const receivedAt = new Date();

  const tags = model
    ? [`strapi:${model}`, ...(DEPENDANTS[model] ?? []).map((m) => `strapi:${m}`)]
    : ['strapi']; // media events or unknown → everything
  for (const tag of tags) revalidateTag(tag, { expire: 0 });

  // Only publish/update payloads carry a timestamp of the triggering change; unpublish/delete do not.
  const changedAt = body?.event === 'entry.publish' ? entry.publishedAt : body?.event === 'entry.update' ? entry.updatedAt : null;
  console.log(JSON.stringify({
    type: 'revalidate', event: body?.event, model, documentId: entry.documentId, locale: entry.locale, tags,
    receivedAt: receivedAt.toISOString(),
    webhookDelayMs: changedAt ? receivedAt.getTime() - Date.parse(changedAt) : null,
  }));

  return Response.json({ revalidated: true, tags, receivedAt });
}

export function GET() {
  return Response.json({ ok: true });
}
