/**
 * Same-origin collector for the anonymous analytics events sent by components/Tracker.tsx. Keeps the Strapi URL and the
 * ingest token on the server, limits the request size and rate per IP, and always answers 204 so the browser never
 * learns whether an event was stored. Switched off when ANALYTICS_INGEST_TOKEN is not set.
 */
const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1337';

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
  const token = process.env.ANALYTICS_INGEST_TOKEN;
  const quiet = new Response(null, { status: 204 });
  if (!token) return quiet;
  if (Number(req.headers.get('content-length') ?? 0) > 4_000) return quiet;
  if (/bot|crawler|spider|headless|lighthouse/i.test(req.headers.get('user-agent') ?? '')) return quiet;

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (limited(ip, 240, 60_000)) return quiet;

  const text = await req.text().catch(() => '');
  if (!text || text.length > 4_000) return quiet;
  let b: any;
  try { b = JSON.parse(text); } catch { return quiet; }
  // forward only the known fields
  const event = {
    kind: b.kind, sessionId: b.sessionId, path: b.path, pageTitle: b.pageTitle, section: b.section, language: b.language,
    ctaId: b.ctaId, ctaLabel: b.ctaLabel, ctaUrl: b.ctaUrl, keyConversion: b.keyConversion === true,
  };
  try {
    await fetch(`${STRAPI_URL}/api/analytics/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-analytics-token': token },
      body: JSON.stringify(event),
      cache: 'no-store',
    });
  } catch { /* Strapi unreachable: drop the event */ }
  return quiet;
}
