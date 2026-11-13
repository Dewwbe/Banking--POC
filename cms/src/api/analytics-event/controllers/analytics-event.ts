import { timingSafeEqual } from 'node:crypto';
import { factories } from '@strapi/strapi';

const UID = 'api::analytics-event.analytics-event';
const LANGS = ['en', 'si', 'ta'];
const SECTIONS = ['home', 'products', 'news', 'promotions', 'rates', 'about', 'contact', 'subscribe', 'other'];
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isToken = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Sliding-window limiter per session (single-instance PoC). */
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 20_000) hits.clear();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  /**
   * Public, token-protected. Accepts one page view or CTA click. Answers 204 whatever was stored, so the endpoint
   * leaks nothing; malformed events are dropped.
   */
  async collect(ctx) {
    const expected = process.env.ANALYTICS_INGEST_TOKEN;
    if (!expected) return ctx.notFound(); // analytics switched off
    const given = String(ctx.request.headers['x-analytics-token'] ?? '');
    if (!given || !isToken(given, expected)) return ctx.unauthorized();

    const b: any = ctx.request.body ?? {};
    const kind = b.kind === 'pageview' || b.kind === 'cta_click' ? b.kind : null;
    const path = clip(b.path, 300);
    const sessionId = clip(b.sessionId, 64);
    if (!kind || !path.startsWith('/') || !/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) { ctx.status = 204; return; }
    if (limited(sessionId, 120, 60_000)) { ctx.status = 429; return; }

    const language = LANGS.includes(b.language) ? b.language : '';
    const section = SECTIONS.includes(b.section) ? b.section : 'other';
    const data: Record<string, unknown> = {
      kind, day: new Date().toISOString().slice(0, 10), path: path.split('?')[0].split('#')[0], pageTitle: clip(b.pageTitle, 200),
      section, language, sessionId,
    };
    if (kind === 'cta_click') {
      const label = clip(b.ctaLabel, 80);
      if (!label) { ctx.status = 204; return; }
      Object.assign(data, { ctaId: clip(b.ctaId, 60), ctaLabel: label, ctaUrl: clip(b.ctaUrl, 300), keyConversion: b.keyConversion === true });
    }
    await strapi.db.query(UID).create({ data });
    ctx.status = 204;
  },
}));
