import { createHash } from 'node:crypto';
import type { Core } from '@strapi/strapi';
import { WORKFLOW_FIELDS } from './constants';

/**
 * Content hashing used to bind an approval to the exact content that was approved (Workstream C).
 * If ANY business field (including nested components, dynamic zones, media and relations) changes
 * after approval, the hash changes and the approval is no longer valid.
 */

const META_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy', 'locale', 'localizations']);

/** Deep populate object for a content type or component, built from the schema (dynamic zones use `on`). */
export function buildPopulate(strapi: Core.Strapi, uid: string, depth = 0): Record<string, any> {
  const model: any = strapi.getModel(uid as any);
  const out: Record<string, any> = {};
  if (!model || depth > 5) return out;

  for (const [name, attr] of Object.entries<any>(model.attributes)) {
    if (attr.type === 'component') {
      const nested = buildPopulate(strapi, attr.component, depth + 1);
      out[name] = Object.keys(nested).length ? { populate: nested } : true;
    } else if (attr.type === 'dynamiczone') {
      out[name] = {
        on: Object.fromEntries(
          attr.components.map((c: string) => {
            const nested = buildPopulate(strapi, c, depth + 1);
            return [c, { populate: Object.keys(nested).length ? nested : '*' }];
          })
        ),
      };
    } else if (attr.type === 'media') {
      out[name] = true;
    } else if (attr.type === 'relation' && name !== 'localizations' && !String(attr.target ?? '').startsWith('admin::')) {
      out[name] = { fields: ['documentId'] };
    }
  }
  return out;
}

const isMedia = (v: any) => v && typeof v === 'object' && 'mime' in v && 'url' in v;

/** Strips volatile/meta keys, reduces media to identity fields, sorts keys → stable, comparable snapshot. */
export function normalize(value: any, depth = 0): any {
  if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1));
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value;
  if (isMedia(value)) return { url: value.url, hash: value.hash ?? null, alternativeText: value.alternativeText ?? null };

  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    if (META_KEYS.has(key)) continue;
    if (depth === 0 && (key === 'documentId' || WORKFLOW_FIELDS.includes(key))) continue;
    out[key] = normalize(value[key], depth + 1);
  }
  return out;
}

export function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const contentHash = (doc: any) => (doc ? sha256(canonicalJson(normalize(doc))) : null);

/** Top-level fields whose normalized value differs between two snapshots. */
export function changedFields(before: any, after: any): string[] {
  const a = normalize(before ?? {});
  const b = normalize(after ?? {});
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => canonicalJson(a[k]) !== canonicalJson(b[k])).sort();
}

/** Loads one locale version of a document with everything that matters for hashing and audit snapshots. */
export async function loadVersion(
  strapi: Core.Strapi,
  uid: string,
  documentId: string,
  locale: string | undefined,
  status: 'draft' | 'published' = 'draft'
) {
  if (!documentId) return null;
  return (strapi.documents as any)(uid).findOne({
    documentId,
    locale,
    status,
    populate: buildPopulate(strapi, uid),
  });
}
