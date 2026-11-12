import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { AUDIT_UID, WORKFLOW_UIDS } from './constants';
import { asSystem, getActor, isAuthor, isPublisher } from './actor';
import { writeAudit } from './audit';
import { contentHash, loadVersion, normalize } from './content-hash';

/**
 * Restore a previous version — POST /poc/rollback { uid, documentId, locale, sequence }.
 *
 * `sequence` is the audit sequence of ANY stored content snapshot (create / edit / publish / earlier restore), as
 * listed by GET /poc/versions. Restores the document's DRAFT to that snapshot. It does NOT republish: the restored
 * draft re-enters the normal approval workflow (the workflow middleware resets the stage to "draft" because the
 * content changed), so a rollback still needs review, approval and publishing. That keeps rollback from becoming a
 * silent bypass of separation of duties.
 *
 * Scope limits (returned to the caller as `skippedFields` so nothing is lost silently):
 *  - top-level media and relation fields are not restored (the snapshot holds only a url/hash or documentId);
 *  - media nested inside components / dynamic zones is dropped for the same reason and reported as "<field> (media)".
 * Fields that existed in the snapshot but no longer exist in the schema are ignored.
 */

const isMediaSnapshot = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && 'url' in v && 'alternativeText' in v && 'hash' in v;

/** Removes media snapshots nested in a value; returns the cleaned value and whether anything was dropped. */
function stripNestedMedia(value: any): { value: any; dropped: boolean } {
  if (Array.isArray(value)) {
    let dropped = false;
    const out = value.map((v) => {
      const r = stripNestedMedia(v);
      dropped ||= r.dropped;
      return r.value;
    });
    return { value: out, dropped };
  }
  if (value && typeof value === 'object') {
    if (isMediaSnapshot(value)) return { value: null, dropped: true };
    let dropped = false;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = stripNestedMedia(v);
      dropped ||= r.dropped;
      out[k] = r.value;
    }
    return { value: out, dropped };
  }
  return { value, dropped: false };
}

export function registerRollback(strapi: Core.Strapi) {
  strapi.server.routes({
    type: 'admin',
    prefix: '/poc',
    routes: [
      {
        method: 'POST',
        path: '/rollback',
        info: { pluginName: 'poc' },
        config: { policies: ['admin::isAuthenticatedAdmin'] },
        handler: async (ctx: any) => {
          const actor = getActor(strapi);
          // Who may restore: Publisher / Super Admin, or an authoring role that can edit this content type.
          // Editors and Compliance Reviewers (review-only roles) cannot change content, so they cannot restore either.
          const mayEdit = (uid: string) => ctx.state?.userAbility?.can('plugin::content-manager.explorer.update', uid) ?? false;
          if (actor.channel !== 'admin') throw new errors.ForbiddenError('Not allowed');

          const { uid, documentId, locale, sequence } = ctx.request.body ?? {};
          if (!WORKFLOW_UIDS.includes(uid)) throw new errors.ValidationError('Unknown or non-governed content type');
          if (!(actor.isSuperAdmin || isPublisher(actor) || (isAuthor(actor) && mayEdit(uid)))) {
            throw new errors.ForbiddenError('Restoring a version requires the Publisher role or an authoring role that can edit this content type');
          }
          if (!documentId || !locale || sequence === undefined || sequence === null) throw new errors.ValidationError('documentId, locale and sequence are required');

          const entry: any = await strapi.db.query(AUDIT_UID).findOne({
            where: { sequence, targetDocumentId: documentId, contentType: uid, targetLocale: locale, outcome: 'allowed' },
          });
          if (!entry?.after) throw new errors.NotFoundError('No stored version at that sequence for this document and language');

          const model: any = strapi.getModel(uid as any);
          const restoreData: Record<string, any> = {};
          const skipped: string[] = [];
          for (const [key, value] of Object.entries<any>(entry.after)) {
            const attr = model?.attributes?.[key];
            if (!attr) continue;
            if (attr.type === 'media' || attr.type === 'relation') { skipped.push(key); continue; }
            const cleaned = stripNestedMedia(value);
            if (cleaned.dropped) skipped.push(`${key} (media)`);
            restoreData[key] = cleaned.value;
          }

          const docs: any = (strapi.documents as any)(uid);
          const before = await loadVersion(strapi, uid, documentId, locale, 'draft');
          if (!before) throw new errors.NotFoundError('Content not found');
          const updated = await asSystem('rollback', () => docs.update({ documentId, locale, data: restoreData }));

          void writeAudit(strapi, {
            action: 'rollback', outcome: 'allowed',
            reason: `Restored the version stored at audit sequence ${sequence} (by ${actor.email})${skipped.length ? `; not restored: ${skipped.join(', ')}` : ''}`,
            actor, contentType: uid, documentId, locale,
            workflowStageBefore: (before as any)?.workflowStage ?? null, workflowStageAfter: 'draft',
            before: normalize(before), after: normalize(updated), contentHash: contentHash(updated),
          });

          ctx.body = { restored: true, skippedFields: skipped, workflowStage: 'draft' };
        },
      },
    ],
  });
}
