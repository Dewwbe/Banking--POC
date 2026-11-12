import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { AUDIT_UID, WORKFLOW_UIDS } from './constants';
import { getActor } from './actor';
import { canonicalJson, contentHash, loadVersion, normalize } from './content-hash';

/**
 * Content versioning — history and comparison (read-only). Restoring is in rollback.ts.
 *
 * Strapi Community has no content history (that is an Enterprise/Growth feature). Versions here are built from the
 * custom audit log: every create / content-changing update / publish / rollback stores a full normalized snapshot of
 * the document. Consequences worth stating in the PoC report:
 *   - history starts when the audit log started: nothing exists for content edited before that (or by raw SQL /
 *     `strapi import`, which bypass the Document Service and therefore the audit);
 *   - a version is a *content* snapshot: workflow metadata is not part of it;
 *   - media inside snapshots is reduced to url/hash/alt text, so restoring cannot re-attach images (see rollback.ts).
 */

const CREATED = new Set(['create']);
const EDITED = (a: string) => a === 'update' || a.startsWith('update+');
const KINDS = ['create', 'publish', 'rollback'];

export type Version = {
  number: number;
  /** audit sequence of the snapshot: the id used to compare and restore */
  sequence: number;
  kind: 'created' | 'edited' | 'restored';
  at: string;
  actor: string | null;
  stage: string | null;
  hash: string | null;
  published: Array<{ at: string; actor: string | null }>;
  note: string | null;
};

const humanize = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Rich-text "blocks" → plain text so a diff of an article reads like text, not JSON. */
const blocksToText = (v: any): string =>
  (Array.isArray(v) ? v : []).map((b: any) => (b?.children ?? []).map((c: any) => c.text ?? c.children?.map((x: any) => x.text).join('') ?? '').join('')).join('\n\n');

function display(model: any, key: string, value: any) {
  const type = model?.attributes?.[key]?.type;
  if (type === 'blocks') return blocksToText(value);
  return value;
}

function assertReadable(strapi: Core.Strapi, ctx: any) {
  const actor = getActor(strapi);
  if (actor.channel !== 'admin' || actor.roles.length === 0) throw new errors.ForbiddenError('Not allowed');
  return actor;
}

/** Content versions for one document + locale, oldest first. */
async function buildVersions(strapi: Core.Strapi, uid: string, documentId: string, locale: string): Promise<Version[]> {
  const rows: any[] = await strapi.db.query(AUDIT_UID).findMany({
    where: { contentType: uid, targetDocumentId: documentId, targetLocale: locale, outcome: 'allowed' },
    orderBy: { sequence: 'asc' },
    select: ['sequence', 'occurredAt', 'action', 'actorEmail', 'workflowStageAfter', 'contentHash', 'reason', 'after'],
  });
  const versions: Version[] = [];
  for (const r of rows) {
    const snapshot = r.after && (CREATED.has(r.action) || EDITED(r.action) || KINDS.includes(r.action));
    if (!snapshot) continue;
    const last = versions[versions.length - 1];
    // A publish of exactly the content already captured is not a new version: it marks that version as published.
    if (r.action === 'publish' && last && last.hash === r.contentHash) {
      last.published.push({ at: r.occurredAt, actor: r.actorEmail });
      continue;
    }
    // A restore is stored as a content update by system:rollback followed by a 'rollback' entry for the same content:
    // present them as ONE version, attributed to the person who restored it.
    if (r.action === 'rollback' && last && last.actor === 'system:rollback') {
      last.kind = 'restored';
      last.actor = r.actorEmail ?? null;
      last.note = r.reason;
      continue;
    }
    if (last && last.hash === r.contentHash && r.action !== 'rollback') continue; // no-op edit
    versions.push({
      number: versions.length + 1,
      sequence: r.sequence,
      kind: r.action === 'rollback' ? 'restored' : CREATED.has(r.action) ? 'created' : 'edited',
      at: r.occurredAt,
      actor: r.actorEmail ?? null,
      stage: r.workflowStageAfter ?? null,
      hash: r.contentHash ?? null,
      published: r.action === 'publish' ? [{ at: r.occurredAt, actor: r.actorEmail ?? null }] : [],
      note: r.action === 'rollback' ? r.reason : null,
    });
  }
  return versions;
}

type Resolved = { label: string; at: string | null; actor: string | null; snapshot: any };

async function resolveRef(strapi: Core.Strapi, uid: string, documentId: string, locale: string, ref: string): Promise<Resolved> {
  if (ref === 'current' || ref === 'live') {
    const doc = await loadVersion(strapi, uid, documentId, locale, ref === 'live' ? 'published' : 'draft');
    if (!doc) throw new errors.NotFoundError(ref === 'live' ? 'This content is not published' : 'Content not found');
    return { label: ref === 'live' ? 'Live (published)' : 'Current draft', at: (doc as any).updatedAt ?? null, actor: null, snapshot: normalize(doc) };
  }
  const sequence = Number(ref);
  if (!Number.isInteger(sequence)) throw new errors.ValidationError('Invalid version reference');
  const entry: any = await strapi.db.query(AUDIT_UID).findOne({
    where: { sequence, contentType: uid, targetDocumentId: documentId, targetLocale: locale, outcome: 'allowed' },
  });
  if (!entry?.after) throw new errors.NotFoundError('That version no longer has a stored snapshot');
  const versions = await buildVersions(strapi, uid, documentId, locale);
  const v = versions.find((x) => x.sequence === sequence) ?? versions.find((x) => x.hash === entry.contentHash);
  return { label: v ? `Version ${v.number}` : `Snapshot #${sequence}`, at: entry.occurredAt, actor: entry.actorEmail ?? null, snapshot: entry.after };
}

export function registerVersionApi(strapi: Core.Strapi) {
  const policies = ['admin::isAuthenticatedAdmin'];
  const check = (ctx: any) => {
    const { uid, documentId, locale } = ctx.query ?? {};
    if (typeof uid !== 'string' || typeof documentId !== 'string' || typeof locale !== 'string') throw new errors.ValidationError('uid, documentId and locale are required');
    if (!(WORKFLOW_UIDS as readonly string[]).includes(uid)) throw new errors.ValidationError('This content type has no version history');
    // The caller must be allowed to READ this content type in the Content Manager.
    const ability = ctx.state?.userAbility;
    if (ability && !ability.can('plugin::content-manager.explorer.read', uid)) throw new errors.ForbiddenError('You may not read this content type');
    return { uid, documentId, locale } as { uid: string; documentId: string; locale: string };
  };

  strapi.server.routes({
    type: 'admin',
    prefix: '/poc',
    routes: [
      {
        method: 'GET',
        path: '/versions',
        info: { pluginName: 'poc' },
        config: { policies },
        handler: async (ctx: any) => {
          assertReadable(strapi, ctx);
          const { uid, documentId, locale } = check(ctx);
          const [versions, draft, live] = await Promise.all([
            buildVersions(strapi, uid, documentId, locale),
            loadVersion(strapi, uid, documentId, locale, 'draft'),
            loadVersion(strapi, uid, documentId, locale, 'published'),
          ]);
          if (!draft) throw new errors.NotFoundError('Content not found');
          const draftHash = contentHash(draft);
          const liveHash = live ? contentHash(live) : null;
          const match = (h: string | null) => (h ? [...versions].reverse().find((v) => v.hash === h)?.number ?? null : null);
          ctx.body = {
            versions: [...versions].reverse(), // newest first
            current: { stage: (draft as any).workflowStage, hash: draftHash, versionNumber: match(draftHash) },
            live: live ? { hash: liveHash, versionNumber: match(liveHash), differsFromDraft: liveHash !== draftHash } : null,
          };
        },
      },
      {
        // Field-level comparison. from/to: an audit sequence number, "current" (draft) or "live" (published).
        method: 'GET',
        path: '/versions/compare',
        info: { pluginName: 'poc' },
        config: { policies },
        handler: async (ctx: any) => {
          assertReadable(strapi, ctx);
          const { uid, documentId, locale } = check(ctx);
          const { from, to } = ctx.query;
          if (typeof from !== 'string' || typeof to !== 'string') throw new errors.ValidationError('from and to are required');
          const [a, b] = await Promise.all([resolveRef(strapi, uid, documentId, locale, from), resolveRef(strapi, uid, documentId, locale, to)]);
          const model: any = strapi.getModel(uid as any);

          const keys = [...new Set([...Object.keys(a.snapshot ?? {}), ...Object.keys(b.snapshot ?? {})])].sort();
          const fields = [] as Array<{ field: string; label: string; type: string; change: 'changed' | 'added' | 'removed'; before: any; after: any }>;
          let unchanged = 0;
          for (const k of keys) {
            if (!model?.attributes?.[k]) continue; // dropped from the schema since
            const x = a.snapshot?.[k];
            const y = b.snapshot?.[k];
            if (canonicalJson(x) === canonicalJson(y)) { unchanged++; continue; }
            const empty = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
            fields.push({
              field: k, label: humanize(k), type: model.attributes[k].type,
              change: empty(x) ? 'added' : empty(y) ? 'removed' : 'changed',
              before: display(model, k, x), after: display(model, k, y),
            });
          }
          ctx.body = {
            from: { ref: from, label: a.label, at: a.at, actor: a.actor },
            to: { ref: to, label: b.label, at: b.at, actor: b.actor },
            identical: fields.length === 0,
            unchanged,
            fields,
          };
        },
      },
    ],
  });
}
