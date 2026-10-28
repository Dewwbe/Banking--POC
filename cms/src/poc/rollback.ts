// cms/src/poc/rollback.ts
import { errors } from '@strapi/utils';
import { AUDIT_UID, WORKFLOW_UIDS } from './constants';
import { getActor, asSystem, isPublisher } from './actor';
import { writeAudit } from './audit';
import { normalize, contentHash } from './content-hash';

/**
 * Fills AUD-07 / feature-matrix #16 ("Custom restore not built").
 * Restores a document's DRAFT to a prior `publish` snapshot from the audit log.
 * Does NOT auto-republish — the restored draft re-enters the normal approval
 * workflow (workflow.ts resets stage to "draft" on write), so rollback still
 * requires review/approval/publish. This avoids turning rollback into a
 * silent bypass of separation of duties.
 *
 * Scope limit: media and relation fields are skipped. The audit snapshot only
 * stores { url, hash, alternativeText } for media and { documentId } for
 * relations (see normalize() in content-hash.ts) — not enough to safely
 * reconnect them automatically. Skipped fields are returned for manual fix-up.
 */
export function registerRollback(strapi: any) {
  strapi.server.routes([
    {
      method: 'POST',
      path: '/poc/rollback',
      handler: async (ctx: any) => {
        const actor = getActor(strapi);
        if (actor.channel !== 'admin' || !(isPublisher(actor) || actor.isSuperAdmin)) {
          throw new errors.ForbiddenError('Rollback requires "Bank Publisher" or Super Admin');
        }

        const { uid, documentId, locale, sequence } = ctx.request.body ?? {};
        if (!WORKFLOW_UIDS.includes(uid)) throw new errors.ValidationError('Unknown or non-governed content type');
        if (!documentId || !sequence) throw new errors.ValidationError('documentId and sequence are required');

        const entry: any = await strapi.db.query(AUDIT_UID).findOne({
          where: { sequence, targetDocumentId: documentId, contentType: uid, action: 'publish' },
        });
        if (!entry?.after) throw new errors.NotFoundError('No publish snapshot at that sequence for this document');

        const model: any = strapi.getModel(uid);
        const restoreData: Record<string, any> = {};
        const skipped: string[] = [];
        for (const [key, value] of Object.entries<any>(entry.after)) {
          const attr = model?.attributes?.[key];
          if (attr && attr.type !== 'media' && attr.type !== 'relation') restoreData[key] = value;
          else skipped.push(key);
        }

        const before = await (strapi.documents as any)(uid).findOne({ documentId, locale, status: 'draft' });
        const updated = await asSystem('rollback', () =>
          (strapi.documents as any)(uid).update({ documentId, locale, data: restoreData })
        );

        void writeAudit(strapi, {
          action: 'rollback', outcome: 'allowed',
          reason: `Restored to publish snapshot at sequence ${sequence}`,
          actor, contentType: uid, documentId, locale,
          workflowStageBefore: before?.workflowStage ?? null, workflowStageAfter: 'draft',
          before: normalize(before), after: normalize(updated), contentHash: contentHash(updated),
        });

        ctx.body = { restored: true, skippedFields: skipped, workflowStage: 'draft' };
      },
      config: { auth: { strategy: 'admin' } },
    },
  ]);
}