import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { AUDIT_UID, SCHEDULABLE_UIDS } from './constants';
import { asSystem, getActor, isPublisher, type Actor } from './actor';
import { writeAudit } from './audit';
import { contentHash, loadVersion } from './content-hash';

/**
 * Scheduled publish / unpublish for every governed content type except Promotions (their startDate/endDate are
 * already their schedule — see scheduler.ts).
 *
 * Rules that keep scheduling from becoming an approval bypass:
 *  - Only a Publisher (or Super Admin) can set a schedule, through POST /poc/schedule. The two schedule fields are
 *    server-only (SYSTEM_WORKFLOW_FIELDS): they are stripped from every Content Manager / REST payload.
 *  - A publish time can only be set on content that is currently APPROVED with an intact approval hash.
 *  - When the time arrives the scheduler publishes through the normal Document Service, so the workflow middleware
 *    re-checks approval + hash. If the content was edited meanwhile (stage reset to draft) the schedule is cancelled
 *    and audited instead of publishing unapproved content.
 *  - Every action is attributed in the audit log (system:scheduler:publish / :unpublish / :cancel).
 * Limits to record: minute-level precision, runs inside the CMS process (single instance), no catch-up guarantee
 * beyond the next tick after a restart.
 */

const FIELDS = ['scheduledPublishAt', 'scheduledUnpublishAt'] as const;
const ROLE_OK = (a: Actor) => a.channel === 'admin' && (isPublisher(a) || a.isSuperAdmin);

function parseDate(v: unknown, label: string): Date | null {
  if (v === null || v === '' || v === undefined) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new errors.ValidationError(`${label} is not a valid date/time`);
  return d;
}

async function clearFields(strapi: Core.Strapi, uid: string, documentId: string, locale: string, which: Array<(typeof FIELDS)[number]>) {
  await strapi.db.query(uid as any).updateMany({ where: { documentId, locale }, data: Object.fromEntries(which.map((f) => [f, null])) });
}

export function registerScheduleApi(strapi: Core.Strapi) {
  const policies = ['admin::isAuthenticatedAdmin'];

  strapi.server.routes({
    type: 'admin',
    prefix: '/poc',
    routes: [
      {
        method: 'POST',
        path: '/schedule',
        info: { pluginName: 'poc' },
        config: { policies },
        handler: async (ctx: any) => {
          const actor = getActor(strapi);
          if (!ROLE_OK(actor)) throw new errors.ForbiddenError('Scheduling requires the "Publisher" role (or Super Admin)');

          const { uid, documentId, locale } = ctx.request.body ?? {};
          if (!SCHEDULABLE_UIDS.includes(uid)) throw new errors.ValidationError('This content type does not support scheduling');
          if (typeof documentId !== 'string' || typeof locale !== 'string') throw new errors.ValidationError('documentId and locale are required');

          const body = ctx.request.body;
          const draft: any = await loadVersion(strapi, uid, documentId, locale, 'draft');
          if (!draft) throw new errors.NotFoundError('Content not found');
          const published = await loadVersion(strapi, uid, documentId, locale, 'published');

          const pub = 'publishAt' in body ? parseDate(body.publishAt, 'Publish time') : parseDate(draft.scheduledPublishAt, 'Publish time');
          const unpub = 'unpublishAt' in body ? parseDate(body.unpublishAt, 'Unpublish time') : parseDate(draft.scheduledUnpublishAt, 'Unpublish time');
          const now = Date.now();

          if (pub && 'publishAt' in body) {
            if (pub.getTime() < now - 60_000) throw new errors.ValidationError('The publish time must be in the future');
            if (draft.workflowStage !== 'approved') throw new errors.ValidationError(`Only approved content can be scheduled (stage is "${draft.workflowStage}")`);
            if (contentHash(draft) !== draft.approvedHash) throw new errors.ValidationError('Content changed after approval — re-approval is required before scheduling');
            if (draft.approvedBy === actor.email) throw new errors.ForbiddenError('Separation of duties: the approver cannot schedule the publication');
          }
          if (unpub && 'unpublishAt' in body) {
            if (unpub.getTime() < now - 60_000) throw new errors.ValidationError('The unpublish time must be in the future');
            if (pub && unpub <= pub) throw new errors.ValidationError('The unpublish time must be after the publish time');
            if (!pub && !published) throw new errors.ValidationError('Nothing is live and no publish time is set');
          }

          await strapi.db.query(uid as any).updateMany({ where: { documentId, locale }, data: { scheduledPublishAt: pub, scheduledUnpublishAt: unpub } });
          void writeAudit(strapi, {
            action: 'schedule', outcome: 'allowed', actor, contentType: uid, documentId, locale,
            reason: `publishAt=${pub?.toISOString() ?? 'none'} unpublishAt=${unpub?.toISOString() ?? 'none'}`,
            workflowStageBefore: draft.workflowStage, workflowStageAfter: draft.workflowStage, contentHash: contentHash(draft),
          });
          ctx.body = { scheduledPublishAt: pub?.toISOString() ?? null, scheduledUnpublishAt: unpub?.toISOString() ?? null };
        },
      },
      {
        // State + schedule + version history for one document/locale. Metadata only: no content snapshots are returned.
        method: 'GET',
        path: '/history',
        info: { pluginName: 'poc' },
        config: { policies },
        handler: async (ctx: any) => {
          const actor = getActor(strapi);
          if (actor.channel !== 'admin' || actor.roles.length === 0) throw new errors.ForbiddenError('Not allowed');
          const { uid, documentId, locale } = ctx.query ?? {};
          if (typeof uid !== 'string' || typeof documentId !== 'string' || typeof locale !== 'string') throw new errors.ValidationError('uid, documentId and locale are required');

          const draft: any = await strapi.db.query(uid as any).findOne({ where: { documentId, locale, publishedAt: null } });
          const live: any = await strapi.db.query(uid as any).findOne({ where: { documentId, locale, publishedAt: { $notNull: true } }, select: ['publishedAt', 'scheduledUnpublishAt'] });
          if (!draft) throw new errors.NotFoundError('Content not found');

          const rows: any[] = await strapi.db.query(AUDIT_UID).findMany({
            where: { contentType: uid, targetDocumentId: documentId, $or: [{ targetLocale: locale }, { targetLocale: null }] },
            orderBy: { sequence: 'desc' },
            limit: 40,
          });
          ctx.body = {
            stage: draft.workflowStage,
            reviewComment: draft.reviewComment ?? null,
            live: Boolean(live),
            publishedAt: live?.publishedAt ?? null,
            schedulable: SCHEDULABLE_UIDS.includes(uid as any),
            scheduledPublishAt: draft.scheduledPublishAt ?? null,
            scheduledUnpublishAt: draft.scheduledUnpublishAt ?? live?.scheduledUnpublishAt ?? null,
            entries: rows.map((r) => ({
              sequence: r.sequence, occurredAt: r.occurredAt, action: r.action, outcome: r.outcome, actor: r.actorEmail,
              from: r.workflowStageBefore, to: r.workflowStageAfter, reason: r.reason,
              restorable: r.action === 'publish' && r.outcome === 'allowed' && Boolean(r.after),
            })),
          };
        },
      },
    ],
  });
}

/** Cron entry: runs the generic scheduled publish / unpublish. Called from config/cron-tasks.ts. */
export async function runScheduledPublishing(strapi: Core.Strapi) {
  const now = new Date();
  for (const uid of SCHEDULABLE_UIDS) {
    const db = strapi.db.query(uid as any);
    const docs: any = (strapi.documents as any)(uid);

    // ---- scheduled publish (draft rows carry the schedule) ----
    const due: any[] = await db.findMany({ where: { publishedAt: null, scheduledPublishAt: { $lte: now } }, select: ['documentId', 'locale', 'workflowStage'] });
    for (const row of due) {
      const cancel = async (why: string) => {
        await clearFields(strapi, uid, row.documentId, row.locale, ['scheduledPublishAt']);
        strapi.log.warn(`[poc-schedule] Cancelled scheduled publish of ${uid} ${row.documentId} [${row.locale}]: ${why}`);
        await asSystem('scheduler:cancel', async () =>
          writeAudit(strapi, { action: 'schedule-cancelled', outcome: 'denied', reason: why, actor: getActor(strapi), contentType: uid, documentId: row.documentId, locale: row.locale }));
      };
      if (row.workflowStage !== 'approved') { await cancel(`stage is "${row.workflowStage}" (content changed or approval withdrawn after scheduling)`); continue; }
      try {
        await asSystem('scheduler:publish', () => docs.publish({ documentId: row.documentId, locale: row.locale }));
        await clearFields(strapi, uid, row.documentId, row.locale, ['scheduledPublishAt']);
        strapi.log.info(`[poc-schedule] Published ${uid} ${row.documentId} [${row.locale}]`);
      } catch (e) {
        await cancel(`publish refused: ${(e as Error).message}`);
      }
    }

    // ---- scheduled unpublish (published rows carry the copied schedule) ----
    const expired: any[] = await db.findMany({ where: { publishedAt: { $notNull: true }, scheduledUnpublishAt: { $lte: now } }, select: ['documentId', 'locale'] });
    for (const row of expired) {
      try {
        await asSystem('scheduler:unpublish', () => docs.unpublish({ documentId: row.documentId, locale: row.locale }));
        await clearFields(strapi, uid, row.documentId, row.locale, ['scheduledUnpublishAt']);
        strapi.log.info(`[poc-schedule] Unpublished ${uid} ${row.documentId} [${row.locale}]`);
      } catch (e) {
        strapi.log.error(`[poc-schedule] Unpublish failed ${uid} ${row.documentId}: ${(e as Error).message}`);
      }
    }
  }
}
