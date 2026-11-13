import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { getActor } from './actor';

/**
 * Analytics dashboard (1.1.17): page traffic overview, top content and conversion reporting for key CTAs.
 *
 * Data source: first-party, anonymous events (page view, CTA click) that the website sends to
 * POST /api/analytics/collect (see src/api/analytics-event). Nothing personal is stored: no IP address, no cookie,
 * only a random per-browser-session id used to count unique visitors.
 *
 * Definitions (shown in the dashboard too):
 *   - Page views      = number of page view events.
 *   - Visitors        = distinct session ids that viewed a page (one browser tab session ≈ one visitor; the same person
 *                       on two devices or after closing the tab counts twice).
 *   - CTA clicks      = clicks on buttons/links rendered from a CMS "CTA" (label, URL, tracking id, key-conversion flag).
 *   - CTA click rate  = sessions that clicked the CTA ÷ sessions that viewed the pages the CTA was clicked on.
 *                       A CTA that was never clicked does not appear (the site does not record impressions per CTA).
 *   - Conversion rate = sessions that clicked any CTA marked "key conversion" ÷ all visitors.
 * This is a click on the CTA, not a completed application: completion needs the target system to report back.
 *
 * Limits to record: events older than ANALYTICS_RETENTION_DAYS (default 180) are deleted daily; counts depend on
 * browsers that run JavaScript and do not send Do-Not-Track / Global Privacy Control; the ingest rate limit is
 * in-memory (one instance). For production-grade analytics use a dedicated tool (GA4, Matomo, Plausible): this is a
 * PoC substitute.
 */

const TABLE = 'analytics_events';
const MAX_DAYS = 365;

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0);
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';

export async function buildReport(strapi: Core.Strapi, days: number, language: string, section: string) {
  const db = strapi.db.connection;
  const today = new Date();
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);
  const since = dayStr(from);

  const base = (kind: string) => {
    const q = db(TABLE).where('kind', kind).where('day', '>=', since);
    if (language) q.where('language', language);
    if (section) q.where('section', section);
    return q;
  };

  const [pv, clicks, keyClickers, clickers] = await Promise.all([
    base('pageview').count({ n: '*' }).countDistinct({ s: 'session_id' }).first(),
    base('cta_click').count({ n: '*' }).first(),
    base('cta_click').where('key_conversion', true).countDistinct({ s: 'session_id' }).first(),
    base('cta_click').countDistinct({ s: 'session_id' }).first(),
  ]);
  const pageviews = num((pv as any)?.n);
  const visitors = num((pv as any)?.s);

  // ---- traffic over time (every day of the range, zero-filled) ----
  const daily = new Map<string, { day: string; pageviews: number; visitors: number; clicks: number }>();
  for (let i = 0; i < days; i++) {
    const d = dayStr(new Date(from.getTime() + i * 86_400_000));
    daily.set(d, { day: d, pageviews: 0, visitors: 0, clicks: 0 });
  }
  const pvDaily: any[] = await base('pageview').select('day').count({ n: '*' }).countDistinct({ s: 'session_id' }).groupBy('day');
  pvDaily.forEach((r) => { const x = daily.get(r.day); if (x) { x.pageviews = num(r.n); x.visitors = num(r.s); } });
  const clickDaily: any[] = await base('cta_click').select('day').count({ n: '*' }).groupBy('day');
  clickDaily.forEach((r) => { const x = daily.get(r.day); if (x) x.clicks = num(r.n); });

  // ---- breakdowns ----
  const bySection: any[] = await base('pageview').select('section').count({ n: '*' }).countDistinct({ s: 'session_id' }).groupBy('section').orderBy('n', 'desc');
  const byLanguage: any[] = await base('pageview').select('language').count({ n: '*' }).countDistinct({ s: 'session_id' }).groupBy('language').orderBy('n', 'desc');

  // ---- top content ----
  const pages: any[] = await base('pageview').select('path').max({ title: 'page_title' }).max({ section: 'section' }).max({ language: 'language' })
    .count({ n: '*' }).countDistinct({ s: 'session_id' }).groupBy('path').orderBy('n', 'desc').limit(25);
  const clicksByPath: any[] = await base('cta_click').select('path').count({ n: '*' }).groupBy('path');
  const clickMap = new Map(clicksByPath.map((r) => [r.path, num(r.n)]));
  const topContent = pages.map((r) => ({
    path: r.path, title: r.title || r.path, section: r.section, language: r.language,
    pageviews: num(r.n), visitors: num(r.s), ctaClicks: clickMap.get(r.path) ?? 0, ctaClickShare: ratio(clickMap.get(r.path) ?? 0, num(r.n)),
  }));

  // ---- CTA conversions ----
  const ctaRows: any[] = await base('cta_click').select('cta_id', 'cta_label', 'cta_url', 'path', 'key_conversion')
    .count({ n: '*' }).countDistinct({ s: 'session_id' })
    .groupBy('cta_id', 'cta_label', 'cta_url', 'path', 'key_conversion');
  const viewSessions: any[] = await base('pageview').select('path').countDistinct({ s: 'session_id' }).groupBy('path');
  const viewMap = new Map(viewSessions.map((r) => [r.path, num(r.s)]));

  type Cta = { id: string; label: string; url: string; keyConversion: boolean; clicks: number; clickers: number; viewers: number; pages: Map<string, number> };
  const ctas = new Map<string, Cta>();
  for (const r of ctaRows) {
    const key = `${r.cta_id || ''}|${r.cta_label}|${r.cta_url || ''}`;
    const c = ctas.get(key) ?? { id: r.cta_id || '', label: r.cta_label, url: r.cta_url || '', keyConversion: false, clicks: 0, clickers: 0, viewers: 0, pages: new Map() };
    c.keyConversion = c.keyConversion || truthy(r.key_conversion);
    c.clicks += num(r.n);
    c.clickers += num(r.s); // sessions per page: a session clicking on two pages counts once per page
    c.viewers += viewMap.get(r.path) ?? 0;
    c.pages.set(r.path, (c.pages.get(r.path) ?? 0) + num(r.n));
    ctas.set(key, c);
  }
  const conversions = [...ctas.values()]
    .map((c) => ({
      trackingId: c.id, label: c.label, url: c.url, keyConversion: c.keyConversion, clicks: c.clicks, clickers: c.clickers,
      clickRate: ratio(c.clickers, c.viewers),
      topPages: [...c.pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([path, n]) => ({ path, clicks: n })),
    }))
    .sort((a, b) => Number(b.keyConversion) - Number(a.keyConversion) || b.clicks - a.clicks)
    .slice(0, 50);

  const lastEvent: any = await db(TABLE).max({ at: 'created_at' }).first();

  return {
    range: { days, from: since, to: dayStr(today) },
    filters: { language, section },
    lastEventAt: lastEvent?.at ?? null,
    overview: {
      pageviews, visitors, pagesPerVisitor: visitors ? Math.round((pageviews / visitors) * 10) / 10 : 0,
      ctaClicks: num((clicks as any)?.n), ctaClickers: num((clickers as any)?.s),
      keyConversions: num((keyClickers as any)?.s), conversionRate: ratio(num((keyClickers as any)?.s), visitors),
    },
    daily: [...daily.values()],
    bySection: bySection.map((r) => ({ section: r.section || 'other', pageviews: num(r.n), visitors: num(r.s) })),
    byLanguage: byLanguage.map((r) => ({ language: r.language || 'unknown', pageviews: num(r.n), visitors: num(r.s) })),
    topContent,
    conversions,
  };
}

/** Delete events older than the retention period. */
export async function purgeOldEvents(strapi: Core.Strapi) {
  const keep = Math.max(7, Number(process.env.ANALYTICS_RETENTION_DAYS) || 180);
  const cutoff = dayStr(new Date(Date.now() - keep * 86_400_000));
  const n = await strapi.db.connection(TABLE).where('day', '<', cutoff).del();
  if (n) strapi.log.info(`[poc-analytics] Deleted ${n} events older than ${keep} days`);
}

export function registerAnalyticsApi(strapi: Core.Strapi) {
  const policies = ['admin::isAuthenticatedAdmin'];
  strapi.server.routes({
    type: 'admin',
    prefix: '/poc/analytics',
    routes: [
      {
        method: 'GET', path: '/report', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          const a = getActor(strapi);
          if (a.channel !== 'admin' || a.roles.length === 0) throw new errors.ForbiddenError('Not allowed');
          const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(Number(ctx.query?.days)) || 30));
          const language = ['en', 'si', 'ta'].includes(String(ctx.query?.language)) ? String(ctx.query.language) : '';
          const section = /^[a-z]{2,20}$/.test(String(ctx.query?.section ?? '')) ? String(ctx.query.section) : '';
          ctx.body = {
            enabled: Boolean(process.env.ANALYTICS_INGEST_TOKEN),
            retentionDays: Math.max(7, Number(process.env.ANALYTICS_RETENTION_DAYS) || 180),
            ...(await buildReport(strapi, days, language, section)),
          };
        },
      },
    ],
  });
}
