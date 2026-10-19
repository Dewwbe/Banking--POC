import type { Core } from '@strapi/strapi';
import { asSystem } from './actor';

/**
 * CUSTOM promotion scheduler (Workstream A) — NOT the native Releases feature (Growth/Enterprise).
 * Runs as a Strapi cron task (config/cron-tasks.ts):
 *   1. Auto-publish: approved, unpublished promotion locales whose startDate has arrived (approval hash still enforced).
 *   2. Auto-expire: published promotion locales whose endDate has passed are unpublished.
 *
 * Known limitations to record: minute-level precision, runs inside the CMS process (no HA / missed-run
 * catch-up guarantees across restarts beyond the next tick), no editor UI for schedules, single-instance only.
 */
const UID = 'api::promotion.promotion';

export async function runPromotionScheduler(strapi: Core.Strapi) {
  const now = new Date();
  const db = strapi.db.query(UID as any);
  const docs: any = (strapi.documents as any)(UID);

  // 1. Expire
  const expired = await db.findMany({
    where: { publishedAt: { $notNull: true }, endDate: { $lt: now } },
    select: ['documentId', 'locale'],
  });
  for (const row of expired) {
    await asSystem('scheduler:expire', () => docs.unpublish({ documentId: row.documentId, locale: row.locale }))
      .then(() => strapi.log.info(`[poc-scheduler] Expired promotion ${row.documentId} [${row.locale}]`))
      .catch((e: Error) => strapi.log.error(`[poc-scheduler] Expire failed ${row.documentId}: ${e.message}`));
  }

  // 2. Scheduled publish
  const due = await db.findMany({
    where: { publishedAt: null, workflowStage: 'approved', startDate: { $lte: now }, endDate: { $gt: now } },
    select: ['documentId', 'locale'],
  });
  for (const row of due) {
    const live = await db.findOne({ where: { documentId: row.documentId, locale: row.locale, publishedAt: { $notNull: true } }, select: ['id'] });
    if (live) continue; // already live; changes to live promotions still go through a normal Publish
    await asSystem('scheduler:publish', () => docs.publish({ documentId: row.documentId, locale: row.locale }))
      .then(() => strapi.log.info(`[poc-scheduler] Published scheduled promotion ${row.documentId} [${row.locale}]`))
      .catch((e: Error) => strapi.log.warn(`[poc-scheduler] Scheduled publish refused ${row.documentId} [${row.locale}]: ${e.message}`));
  }
}
