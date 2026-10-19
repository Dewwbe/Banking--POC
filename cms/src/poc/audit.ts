import { randomBytes } from 'node:crypto';
import type { Core } from '@strapi/strapi';
import { AUDIT_UID } from './constants';
import { canonicalJson, sha256 } from './content-hash';
import type { Actor } from './actor';

/**
 * CUSTOM audit trail (Workstream D) — Strapi Community has no Audit Logs feature.
 *
 * Design choices to evaluate in the PoC report:
 *  - Entries are written with the ROOT knex connection, i.e. OUTSIDE any document-service transaction,
 *    so a denied action (which rolls the transaction back) is still recorded.
 *    Trade-off: an "allowed" entry can describe a change that a later step in the same request rolled back
 *    (e.g. admin "Publish" = save + publish; if publish is denied, the save is rolled back). The following
 *    "denied" entry makes this reconstructable, but it must be explained to auditors.
 *  - Each entry stores prevEntryHash and entryHash = sha256(prevEntryHash + canonical(entry)), so edits or
 *    deletions in the table are DETECTABLE (scripts/verify-audit-chain.mjs) — not PREVENTED. A DB administrator
 *    can still rewrite the whole chain. Real tamper resistance needs export to WORM / SIEM storage.
 *  - Writes are queued and NOT awaited by the request (callers use `void writeAudit(...)`): awaiting them inside a
 *    Document Service transaction can deadlock when the connection pool is small (always with SQLite). Consequence:
 *    the business action can complete even if the audit insert later fails (fail-open) — a risk-register item.
 *  - Serialisation uses an in-process queue: correct for ONE Strapi instance only. Multiple replicas would
 *    need a DB sequence + advisory lock or an external log pipeline.
 */

export type AuditInput = {
  action: string;
  outcome: 'allowed' | 'denied';
  reason?: string | null;
  actor: Actor;
  contentType?: string | null;
  documentId?: string | null;
  locale?: string | null;
  workflowStageBefore?: string | null;
  workflowStageAfter?: string | null;
  changedFields?: string[] | null;
  before?: any;
  after?: any;
  contentHash?: string | null;
};

/** The exact field list that is hashed. MUST stay identical to scripts/verify-audit-chain.mjs. */
export const HASHED_FIELDS = [
  'sequence', 'occurredAt', 'environment', 'action', 'outcome', 'reason', 'channel', 'actorId', 'actorEmail',
  'actorRoles', 'contentType', 'targetDocumentId', 'targetLocale', 'workflowStageBefore', 'workflowStageAfter',
  'changedFields', 'before', 'after', 'contentHash', 'prevEntryHash',
] as const;

const JSON_FIELDS = new Set(['actorRoles', 'changedFields', 'before', 'after']);

let queue: Promise<unknown> = Promise.resolve();
let columns: { table: string; map: Record<string, string>; present: Set<string> } | null = null;

async function resolveColumns(strapi: Core.Strapi) {
  if (columns) return columns;
  const meta: any = strapi.db.metadata.get(AUDIT_UID);
  const map: Record<string, string> = {};
  const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  for (const [name, attr] of Object.entries<any>(meta.attributes)) {
    if (attr.type === 'relation') continue;
    map[name] = attr.columnName ?? snake(name);
  }
  const info = await strapi.db.connection(meta.tableName).columnInfo();
  columns = { table: meta.tableName, map, present: new Set(Object.keys(info)) };
  return columns;
}

export function entryHash(entry: Record<string, any>): string {
  const payload: Record<string, any> = {};
  for (const f of HASHED_FIELDS) payload[f] = entry[f] ?? null;
  payload.sequence = String(payload.sequence);
  return sha256(`${entry.prevEntryHash ?? 'GENESIS'}|${canonicalJson(payload)}`);
}

export function writeAudit(strapi: Core.Strapi, input: AuditInput): Promise<void> {
  const job = queue.then(async () => {
    try {
      const { table, map, present } = await resolveColumns(strapi);
      const seqCol = map.sequence;
      const hashCol = map.entryHash;
      const last = await strapi.db.connection(table).select(seqCol, hashCol).orderBy(seqCol, 'desc').first();

      const now = new Date().toISOString();
      const entry: Record<string, any> = {
        sequence: last ? Number(last[seqCol]) + 1 : 1,
        occurredAt: now,
        environment: process.env.POC_ENVIRONMENT ?? 'dev',
        action: input.action,
        outcome: input.outcome,
        reason: input.reason ?? null,
        channel: input.actor.channel,
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        actorRoles: input.actor.roles,
        contentType: input.contentType ?? null,
        targetDocumentId: input.documentId ?? null,
        targetLocale: input.locale ?? null,
        workflowStageBefore: input.workflowStageBefore ?? null,
        workflowStageAfter: input.workflowStageAfter ?? null,
        changedFields: input.changedFields ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        contentHash: input.contentHash ?? null,
        prevEntryHash: last ? last[hashCol] : null,
        clientIp: input.actor.ip ?? null,
        userAgent: input.actor.userAgent ?? null,
      };
      entry.entryHash = entryHash(entry);

      const row: Record<string, any> = {};
      for (const [attr, value] of Object.entries(entry)) {
        const col = map[attr];
        if (!col || !present.has(col)) continue;
        row[col] = JSON_FIELDS.has(attr) && value !== null ? JSON.stringify(value) : value;
      }
      // Strapi 5 system columns
      if (present.has('document_id')) row.document_id = randomBytes(12).toString('hex');
      if (present.has('created_at')) row.created_at = now;
      if (present.has('updated_at')) row.updated_at = now;
      if (present.has('published_at')) row.published_at = now;

      await strapi.db.connection(table).insert(row);
    } catch (err) {
      // Fail-open for the PoC, but loudly. Record in the risk register whether the bank needs fail-closed auditing.
      strapi.log.error(`[poc-audit] FAILED to write audit entry for ${input.action}: ${(err as Error).message}`);
    }
  });
  queue = job.catch(() => undefined);
  return job as Promise<void>;
}
