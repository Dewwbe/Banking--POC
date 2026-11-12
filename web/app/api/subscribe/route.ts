/**
 * Same-origin proxy for the public subscribe / confirm / unsubscribe calls, so the browser never talks to Strapi
 * directly and no Strapi URL or token reaches the client. Adds a per-IP limit in front of Strapi's own limits.
 * Never echoes Strapi's error text back to the visitor.
 */
const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1337';
const ACTIONS = new Set(['subscribe', 'confirm', 'unsubscribe']);

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 5_000) hits.clear();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!body || !ACTIONS.has(action)) return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (limited(`${action}:${ip}`, 10, 10 * 60_000)) return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  const payload =
    action === 'subscribe'
      ? { email: body.email, language: body.language, website: body.website }
      : { token: body.token };

  try {
    const res = await fetch(`${STRAPI_URL}/api/subscribers/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      return Response.json({ ok: true, status: json?.data?.status ?? null });
    }
    return Response.json({ ok: false, error: res.status === 429 ? 'rate_limited' : 'invalid' }, { status: res.status === 429 ? 429 : 400 });
  } catch {
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
}
