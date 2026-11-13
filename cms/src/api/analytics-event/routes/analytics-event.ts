/**
 * No core CRUD routes: events are write-only from outside. The single public endpoint is protected by a shared
 * token (ANALYTICS_INGEST_TOKEN) that only the Next.js server holds (web/app/api/track). Reports are read through the
 * admin API in src/poc/analytics.ts.
 */
export default {
  routes: [
    { method: 'POST', path: '/analytics/collect', handler: 'analytics-event.collect', config: { auth: false, policies: [], middlewares: [] } },
  ],
};
