import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { AUDIT_UID, flags, Stage, SYSTEM_WORKFLOW_FIELDS, WORKFLOW_UIDS } from './constants';
import { Actor, getActor, isApprover, isEditor, isPublisher, isReviewer } from './actor';
import { changedFields, contentHash, loadVersion, normalize } from './content-hash';
import { writeAudit } from './audit';

/**
 * CUSTOM approval workflow prototype (Workstream C) — a stand-in for Enterprise Review Workflows.
 *
 * Enforcement point: a Strapi 5 Document Service middleware. Every write path that goes through the
 * Document Service — admin panel, admin API, bulk actions, REST, GraphQL, cron jobs — passes through here.
 * Paths that DO NOT (and therefore must be tested/controlled separately): raw strapi.db.query / knex calls in
 * custom code or plugins, direct SQL on PostgreSQL, `strapi import` / `strapi transfer`.
 *
 * Stages:  draft → in_review → awaiting_approval → approved → (publish)
 *                    ↘ changes_requested ↙        ↘ changes_requested
 * Any change to business content after submission resets the stage to draft and voids the approval.
 */

const READ_ACTIONS = new Set(['findOne', 'findFirst', 'findMany', 'count']);

type Transition = { roles: (a: Actor) => boolean; label: string };
const TRANSITIONS: Record<string, Transition> = {
  'draft>in_review': { roles: isEditor, label: 'Bank Editor' },
  'changes_requested>in_review': { roles: isEditor, label: 'Bank Editor' },
  'approved>in_review': { roles: isEditor, label: 'Bank Editor' }, // resubmission of a changed, previously approved item
  'in_review>awaiting_approval': { roles: isReviewer, label: 'Bank Reviewer' },
  'in_review>changes_requested': { roles: isReviewer, label: 'Bank Reviewer' },
  'awaiting_approval>approved': { roles: isApprover, label: 'Bank Approver' },
  'awaiting_approval>changes_requested': { roles: isApprover, label: 'Bank Approver' },
};

class Denied extends Error {
  constructor(public status: 400 | 403, message: string) {
    super(message);
  }
}

function checkTransition(actor: Actor, current: any, from: Stage, to: Stage) {
  if (actor.channel === 'system') return;
  if (actor.channel === 'content-api') throw new Denied(403, 'Workflow stages cannot be changed through the content API');
  if (actor.isSuperAdmin && flags.superAdminOverride()) return;

  if (to === 'draft') {
    // Withdrawing / resetting is allowed for any workflow participant.
    if (isEditor(actor) || isReviewer(actor) || isApprover(actor)) return;
    throw new Denied(403, 'Only workflow participants can move content back to draft');
  }
  const rule = TRANSITIONS[`${from}>${to}`];
  if (!rule) throw new Denied(400, `Transition ${from} → ${to} is not allowed`);
  if (!rule.roles(actor)) throw new Denied(403, `Transition ${from} → ${to} requires role "${rule.label}"`);

  // Separation of duties — enforced on identity, so it also holds when one user has several roles.
  if (to === 'awaiting_approval' || (from === 'in_review' && to === 'changes_requested')) {
    if (current?.submittedBy === actor.email) throw new Denied(403, 'Separation of duties: you cannot review content you submitted');
  }
  if (from === 'awaiting_approval') {
    if (current?.submittedBy === actor.email || current?.reviewedBy === actor.email) {
      throw new Denied(403, 'Separation of duties: the approver must differ from the submitter and the reviewer');
    }
  }
}

async function defaultLocale(strapi: Core.Strapi): Promise<string> {
  return (await (strapi.plugin('i18n').service('locales') as any).getDefaultLocale()) ?? 'en';
}

async function resolveLocales(strapi: Core.Strapi, uid: string, documentId: string, locale: any): Promise<string[]> {
  if (Array.isArray(locale)) return locale;
  if (typeof locale === 'string' && locale !== '*') return [locale];
  if (locale === '*') {
    const rows = await strapi.db.query(uid as any).findMany({ where: { documentId, publishedAt: null }, select: ['locale'] });
    return [...new Set(rows.map((r: any) => r.locale))] as string[];
  }
  return [await defaultLocale(strapi)];
}

const toError = (d: Denied) => (d.status === 403 ? new errors.ForbiddenError(d.message) : new errors.ApplicationError(d.message));

export function registerWorkflow(strapi: Core.Strapi) {
  const uids = new Set<string>(WORKFLOW_UIDS);

  strapi.documents.use(async (context: any, next: () => Promise<any>) => {
    const { uid, action } = context;
    const params = context.params ?? {};

    // ---------- Audit log is append-only from every API path ----------
    if (uid === AUDIT_UID) {
      if (READ_ACTIONS.has(action)) {
        const actor = getActor(strapi);
        if (actor.channel === 'content-api') throw new errors.ForbiddenError('Audit log is not available on the content API');
        return next();
      }
      const actor = getActor(strapi);
      void writeAudit(strapi, { action: `audit-log.${action}`, outcome: 'denied', reason: 'Audit log is append-only', actor, contentType: uid, documentId: params.documentId });
      throw new errors.ForbiddenError('The audit log is append-only');
    }

    if (!uids.has(uid)) return next();
    const actor = getActor(strapi);

    // ---------- Reads: stop drafts leaking through the public content API ----------
    if (READ_ACTIONS.has(action)) {
      if (flags.blockContentApiDrafts() && actor.channel === 'content-api' && params.status === 'draft' && !actor.isPreviewToken) {
        void writeAudit(strapi, { action: `${action}:draft`, outcome: 'denied', reason: 'Draft read via content API', actor, contentType: uid });
        throw new errors.ForbiddenError('Draft content is not available on the public API');
      }
      return next();
    }

    const deny = async (d: Denied, extra: Partial<Parameters<typeof writeAudit>[1]> = {}) => {
      void writeAudit(strapi, { action, outcome: 'denied', reason: d.message, actor, contentType: uid, documentId: params.documentId, locale: params.locale, ...extra });
      throw toError(d);
    };

    // Observation mode: log everything, enforce nothing (to record native Community behaviour).
    if (!flags.enforcement()) {
      const result = await next();
      void writeAudit(strapi, { action, outcome: 'allowed', reason: 'enforcement disabled', actor, contentType: uid, documentId: params.documentId ?? result?.documentId, locale: params.locale });
      return result;
    }

    if (actor.channel === 'system' && actor.id === 'unattributed') {
      return deny(new Denied(403, 'Unattributed server-side write — wrap system tasks in asSystem()'));
    }

    try {
      switch (action) {
        case 'create':
          return await handleCreate();
        case 'update':
          return await handleUpdate();
        case 'publish':
          return await handlePublish();
        case 'unpublish':
        case 'delete':
        case 'discardDraft':
          return await handleOther();
        default:
          return await next();
      }
    } catch (e) {
      if (e instanceof Denied) return deny(e);
      throw e;
    }

    // ---------------------------------------------------------------------------------
    async function handleCreate() {
      if (actor.channel === 'content-api') {
        if (params.status === 'published') throw new Denied(403, 'Publishing through the content API is not permitted');
      } else if (params.status === 'published' && actor.channel !== 'system') {
        throw new Denied(403, 'Create-and-publish bypasses approval');
      }
      const data = { ...(params.data ?? {}) };
      const requested: Stage = data.workflowStage ?? 'draft';
      if (actor.channel !== 'system') {
        for (const f of SYSTEM_WORKFLOW_FIELDS) delete data[f];
        if (requested !== 'draft') checkTransition(actor, null, 'draft', requested);
        data.workflowStage = requested;
        if (requested === 'in_review') data.submittedBy = actor.email;
      }
      context.params = { ...params, data };
      const result = await next();
      const locale = result?.locale ?? params.locale;
      void writeAudit(strapi, {
        action: 'create', outcome: 'allowed', actor, contentType: uid, documentId: result?.documentId, locale,
        workflowStageAfter: data.workflowStage ?? null, after: normalize(result), contentHash: contentHash(result),
      });
      return result;
    }

    // ---------------------------------------------------------------------------------
    async function handleUpdate() {
      if (actor.channel === 'content-api' && params.status === 'published') {
        throw new Denied(403, 'Publishing through the content API is not permitted');
      }
      const locale = params.locale ?? (await defaultLocale(strapi));
      const before = await loadVersion(strapi, uid, params.documentId, locale, 'draft');
      const beforeHash = contentHash(before);
      const current: Stage = before?.workflowStage ?? 'draft';

      const data = { ...(params.data ?? {}) };
      if (actor.channel !== 'system') for (const f of SYSTEM_WORKFLOW_FIELDS) delete data[f];
      const requested: Stage = data.workflowStage ?? current;
      if (requested !== current) checkTransition(actor, before, current, requested);
      delete data.workflowStage; // the final stage is decided after the write
      context.params = { ...params, data };

      const result = await next();
      const after = await loadVersion(strapi, uid, params.documentId, locale, 'draft');
      const afterHash = contentHash(after);
      const contentChanged = beforeHash !== afterHash;

      let finalStage: Stage = requested;
      let reason: string | null = null;
      if (contentChanged && current !== 'draft' && !(requested === 'in_review' && current !== 'in_review')) {
        finalStage = 'draft';
        reason = `Content changed while in "${current}" — approval/review invalidated`;
      } else if (contentChanged && requested !== 'in_review' && requested !== 'draft') {
        finalStage = 'draft';
        reason = 'Content changed together with a review/approval decision — reset to draft';
      }

      const patch: Record<string, any> = { workflowStage: finalStage };
      if (finalStage === 'draft' || finalStage === 'in_review') Object.assign(patch, { reviewedBy: null, approvedBy: null, approvedAt: null, approvedHash: null });
      if (finalStage === 'in_review' && current !== 'in_review') patch.submittedBy = actor.email;
      if (finalStage === 'awaiting_approval') patch.reviewedBy = actor.email;
      if (finalStage === 'approved' && current !== 'approved') Object.assign(patch, { approvedBy: actor.email, approvedAt: new Date(), approvedHash: afterHash });
      if (after?.id) await strapi.db.query(uid as any).update({ where: { id: after.id }, data: patch });

      void writeAudit(strapi, {
        action: finalStage !== current ? `update+stage:${current}->${finalStage}` : 'update',
        outcome: 'allowed', reason, actor, contentType: uid, documentId: params.documentId, locale,
        workflowStageBefore: current, workflowStageAfter: finalStage,
        changedFields: changedFields(before, after),
        before: contentChanged ? normalize(before) : null,
        after: contentChanged ? normalize(after) : null,
        contentHash: afterHash,
      });
      return result;
    }

    // ---------------------------------------------------------------------------------
    async function handlePublish() {
      const locales = await resolveLocales(strapi, uid, params.documentId, params.locale);
      const isSeed = actor.channel === 'system' && actor.systemReason === 'seed';

      if (!isSeed) {
        if (actor.channel === 'content-api') throw new Denied(403, 'Publishing through the content API is not permitted');
        const override = actor.isSuperAdmin && flags.superAdminOverride();
        if (actor.channel === 'admin' && !isPublisher(actor) && !override) {
          throw new Denied(403, 'Only users with the "Bank Publisher" role may publish');
        }
        for (const l of locales) {
          const draft = await loadVersion(strapi, uid, params.documentId, l, 'draft');
          if (!draft) continue;
          if (override) continue;
          if (draft.workflowStage !== 'approved') throw new Denied(400, `[${l}] cannot be published: stage is "${draft.workflowStage}", approval required`);
          if (contentHash(draft) !== draft.approvedHash) throw new Denied(400, `[${l}] content changed after approval — re-approval required`);
          if (actor.channel === 'admin' && draft.approvedBy === actor.email) throw new Denied(403, `[${l}] Separation of duties: the approver cannot publish`);
        }
      }

      const result = await next();
      for (const l of locales) {
        const published = await loadVersion(strapi, uid, params.documentId, l, 'published');
        void writeAudit(strapi, {
          action: 'publish', outcome: 'allowed',
          reason: actor.isSuperAdmin && flags.superAdminOverride() ? 'SUPER ADMIN OVERRIDE' : null,
          actor, contentType: uid, documentId: params.documentId, locale: l,
          workflowStageBefore: 'approved', workflowStageAfter: 'approved',
          after: normalize(published), contentHash: contentHash(published), // full published snapshot = version history
        });
      }
      return result;
    }

    // ---------------------------------------------------------------------------------
    async function handleOther() {
      if (actor.channel === 'content-api') throw new Denied(403, `"${action}" through the content API is not permitted`);
      if (action === 'unpublish' && actor.channel === 'admin' && !isPublisher(actor) && !actor.isSuperAdmin) {
        throw new Denied(403, 'Only "Bank Publisher" (or Super Admin for emergency takedown) may unpublish');
      }
      const locale = typeof params.locale === 'string' ? params.locale : undefined;
      const snapshot = params.documentId
        ? await loadVersion(strapi, uid, params.documentId, locale, action === 'discardDraft' ? 'draft' : 'published')
        : null;
      const result = await next();
      void writeAudit(strapi, {
        action, outcome: 'allowed', actor, contentType: uid, documentId: params.documentId,
        locale: Array.isArray(params.locale) ? params.locale.join(',') : params.locale ?? null,
        before: normalize(snapshot), contentHash: contentHash(snapshot),
      });
      return result;
    }
  });
}
