import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { LOCALES, WORKFLOW_FIELDS, WORKFLOW_UIDS, flags } from './constants';
import { asSystem, getActor, isAuthor } from './actor';
import { writeAudit } from './audit';
import { canonicalJson, loadVersion, normalize, sha256 } from './content-hash';

/**
 * Translation workflow + cross-language consistency validation (1.1.14).
 *
 * Model: the default i18n locale (English) is the SOURCE language. Every other language is a translation of it and
 * has its own draft → review → approval → publish workflow (the stage is stored per language already).
 *
 *  - Outdated detection: when a translation is saved, the server stores `sourceHash` = hash of the source's
 *    TRANSLATABLE content (localized fields only) at that moment. If the source text later changes, the hashes differ
 *    and the translation is "outdated" until a translator edits it or confirms it is still correct.
 *  - Consistency rules compare each translation with the source field by field (see analyzeLocale()):
 *      error   outdated · numbers differ (e.g. a rate "9.5%" vs "9.75%")
 *      warning structure differs (number of cards / FAQs / sections) · field missing · text identical to the source
 *              (not translated) · non-text values (theme, button URL ...) differ
 *  - Errors BLOCK publishing that language (CONSISTENCY_BLOCK_PUBLISH=false turns the block off); warnings do not.
 *
 * Limits to record: the numeric check compares the numbers that appear in each text field, it cannot tell whether a
 * sentence is a faithful translation; "untranslated" is a heuristic (identical text of 4+ letters).
 */

export type Issue = { severity: 'error' | 'warning'; rule: string; field: string; message: string };

const SKIP_KEYS = new Set(['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy', 'locale', 'localizations']);
const VALUE_TYPES = new Set(['enumeration', 'boolean', 'integer', 'biginteger', 'float', 'decimal', 'date', 'datetime', 'time', 'email']);
const TEXT_TYPES = new Set(['string', 'text', 'richtext']);

export const sourceLocale = async (strapi: Core.Strapi): Promise<string> =>
  ((await (strapi.plugin('i18n').service('locales') as any).getDefaultLocale()) as string) ?? 'en';

const isTranslatable = (attr: any) => attr?.pluginOptions?.i18n?.localized === true;

/** Hash of the localized (translatable) content only; non-localized fields are shared between languages anyway. */
export function translatableHash(strapi: Core.Strapi, uid: string, doc: any): string | null {
  if (!doc) return null;
  const model: any = strapi.getModel(uid as any);
  const n = normalize(doc);
  return sha256(canonicalJson(Object.fromEntries(Object.entries(n).filter(([k]) => isTranslatable(model.attributes?.[k])))));
}

export async function currentSourceHash(strapi: Core.Strapi, uid: string, documentId: string): Promise<string | null> {
  const src = await loadVersion(strapi, uid, documentId, await sourceLocale(strapi), 'draft');
  return translatableHash(strapi, uid, src);
}

/* ------------------------------------------------------------------ leaf extraction */

type Leaf = { kind: 'text' | 'value'; value: any };
type Extract = { leaves: Map<string, Leaf>; shapes: Map<string, string> };

const blocksToText = (v: any): string =>
  (Array.isArray(v) ? v : []).map((b: any) => (b?.children ?? []).map((c: any) => c.text ?? (c.children ?? []).map((x: any) => x.text ?? '').join('')).join('')).join('\n');

function walkAttrs(strapi: Core.Strapi, attrs: Record<string, any>, obj: any, path: string, out: Extract, top: boolean) {
  if (!obj || typeof obj !== 'object') return;
  for (const [name, attr] of Object.entries<any>(attrs)) {
    if (WORKFLOW_FIELDS.includes(name) && top) continue;
    if (top && !isTranslatable(attr)) continue;
    const p = path ? `${path}.${name}` : name;
    walkValue(strapi, attr, name, obj[name], p, out);
  }
}

function walkValue(strapi: Core.Strapi, attr: any, name: string, value: any, path: string, out: Extract) {
  switch (attr.type) {
    case 'media': case 'relation': case 'uid': return;
    case 'blocks': out.leaves.set(path, { kind: 'text', value: blocksToText(value) }); return;
    case 'component': {
      const model: any = strapi.getModel(attr.component);
      if (attr.repeatable) {
        const arr = Array.isArray(value) ? value : [];
        out.shapes.set(path, `${arr.length} item(s)`);
        arr.forEach((item, i) => walkAttrs(strapi, model.attributes, item, `${path}[${i}]`, out, false));
      } else if (value) walkAttrs(strapi, model.attributes, value, path, out, false);
      return;
    }
    case 'dynamiczone': {
      const arr = Array.isArray(value) ? value : [];
      out.shapes.set(path, arr.map((x: any) => x.__component).join(' > ') || 'empty');
      arr.forEach((item: any, i: number) => {
        const model: any = strapi.getModel(item.__component);
        if (model) walkAttrs(strapi, model.attributes, item, `${path}[${i}]`, out, false);
      });
      return;
    }
    default:
      if (TEXT_TYPES.has(attr.type)) {
        // URLs are values (they must match across languages), everything else is translatable text
        out.leaves.set(path, { kind: name === 'url' ? 'value' : 'text', value: value ?? '' });
      } else if (VALUE_TYPES.has(attr.type)) out.leaves.set(path, { kind: 'value', value: value ?? null });
  }
}

function extract(strapi: Core.Strapi, uid: string, doc: any): Extract {
  const out: Extract = { leaves: new Map(), shapes: new Map() };
  const model: any = strapi.getModel(uid as any);
  walkAttrs(strapi, model.attributes, normalize(doc) as any, '', out, true);
  return out;
}

/* ------------------------------------------------------------------ numbers */

const isDigit = (ch: string) => /\p{Nd}/u.test(ch);
function digitValue(ch: string) {
  const cp = ch.codePointAt(0)!;
  if (cp >= 48 && cp <= 57) return cp - 48;
  let base = cp;
  while (isDigit(String.fromCodePoint(base - 1))) base--;
  return (cp - base) % 10; // Sinhala / Tamil / Arabic-Indic ... digit blocks are runs of 10
}

/** The numbers appearing in a text, normalised (Sinhala/Tamil digits → Latin, "9,500" and "9500.0" equal), sorted. */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? '').matchAll(/\p{Nd}(?:[\p{Nd}.,]*\p{Nd})?/gu)) {
    const latin = [...m[0]].map((ch) => (isDigit(ch) ? String(digitValue(ch)) : ch)).join('');
    const n = Number(latin.replace(/,(?=\d{3}(\D|$))/g, '').replace(/,/g, '.'));
    out.push(Number.isFinite(n) ? String(n) : latin);
  }
  return out.sort();
}

const letters = (s: string) => (String(s).match(/\p{L}/gu) ?? []).length;
const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

/* ------------------------------------------------------------------ analysis */

export function analyzeLocale(strapi: Core.Strapi, uid: string, source: any, target: any, locale: string, srcLocale: string): Issue[] {
  const issues: Issue[] = [];
  const L = locale.toUpperCase();
  const S = srcLocale.toUpperCase();
  const add = (severity: Issue['severity'], rule: string, field: string, message: string) => issues.push({ severity, rule, field, message });

  const srcHash = translatableHash(strapi, uid, source);
  if (!target.sourceHash) add('warning', 'unverified', '', `${L} was never checked against the ${S} text. Save it or confirm it is still correct.`);
  else if (target.sourceHash !== srcHash) add('error', 'outdated', '', `The ${S} text changed after this ${L} translation was last saved — re-translate it or confirm it is still correct.`);

  const a = extract(strapi, uid, source);
  const b = extract(strapi, uid, target);

  for (const [path, shape] of a.shapes) {
    const other = b.shapes.get(path);
    if (other !== undefined && other !== shape) add('warning', 'structure', path, `Structure differs at "${path}": ${S} has ${shape}, ${L} has ${other}.`);
  }
  for (const [path, s] of a.leaves) {
    const t = b.leaves.get(path);
    if (!t) continue; // the other side has no such item (reported as a structure difference)
    if (s.kind === 'value') {
      if (JSON.stringify(s.value ?? null) !== JSON.stringify(t.value ?? null)) add('warning', 'value', path, `"${path}" differs: ${S}=${clip(String(s.value))} vs ${L}=${clip(String(t.value))}.`);
      continue;
    }
    const sv = String(s.value ?? '').trim();
    const tv = String(t.value ?? '').trim();
    if (sv && !tv) { add('warning', 'missing', path, `"${path}" has text in ${S} but is empty in ${L}.`); continue; }
    if (!sv) continue;
    const sn = numbersIn(sv);
    const tn = numbersIn(tv);
    if (JSON.stringify(sn) !== JSON.stringify(tn)) add('error', 'numbers', path, `Numbers differ in "${path}": ${S} has [${sn.join(', ')}], ${L} has [${tn.join(', ')}].`);
    if (sv === tv && letters(sv) >= 4) add('warning', 'untranslated', path, `"${path}" is identical to ${S} (not translated yet?): "${clip(sv)}".`);
  }
  return issues;
}

export type LocaleReport = { locale: string; exists: boolean; stage: string | null; live: boolean; outdated: boolean; issues: Issue[] };

export async function analyzeDocument(strapi: Core.Strapi, uid: string, documentId: string) {
  const src = await sourceLocale(strapi);
  const source = await loadVersion(strapi, uid, documentId, src, 'draft');
  const locales: LocaleReport[] = [];
  for (const { code } of LOCALES) {
    if (code === src) continue;
    const target: any = await loadVersion(strapi, uid, documentId, code, 'draft');
    const live = Boolean(await strapi.db.query(uid as any).findOne({ where: { documentId, locale: code, publishedAt: { $notNull: true } }, select: ['id'] }));
    if (!target) { locales.push({ locale: code, exists: false, stage: null, live: false, outdated: false, issues: [] }); continue; }
    const issues = source ? analyzeLocale(strapi, uid, source, target, code, src) : [];
    locales.push({ locale: code, exists: true, stage: target.workflowStage ?? 'draft', live, outdated: issues.some((i) => i.rule === 'outdated'), issues });
  }
  return { sourceLocale: src, sourceExists: Boolean(source), sourceStage: (source as any)?.workflowStage ?? null, locales };
}

/** Error messages that must stop `locale` of this document from being published (empty = OK). */
export async function translationBlockers(strapi: Core.Strapi, uid: string, documentId: string, locale: string): Promise<string[]> {
  if (!flags.consistencyBlocking()) return [];
  const src = await sourceLocale(strapi);
  if (locale === src) return [];
  const [source, target] = await Promise.all([loadVersion(strapi, uid, documentId, src, 'draft'), loadVersion(strapi, uid, documentId, locale, 'draft')]);
  if (!source || !target) return [];
  return analyzeLocale(strapi, uid, source, target, locale, src).filter((i) => i.severity === 'error').map((i) => i.message);
}

/* ------------------------------------------------------------------ helpers for the API */

const TITLE_ATTRS = ['name', 'title', 'label', 'heading', 'slug'];
const TYPE_LABEL: Record<string, string> = {
  'api::home.home': 'Home page', 'api::about-us.about-us': 'About Us', 'api::contact-us.contact-us': 'Contact Us', 'api::product.product': 'Product',
  'api::news-article.news-article': 'News article', 'api::promotion.promotion': 'Promotion', 'api::banner.banner': 'Banner', 'api::menu-item.menu-item': 'Menu item', 'api::rate.rate': 'Rate', 'api::seo-setting.seo-setting': 'SEO settings',
};

/** Copy of the source's translatable fields to start a translation from (text still in the source language). */
function cloneTranslatable(strapi: Core.Strapi, uid: string, src: any) {
  const model: any = strapi.getModel(uid as any);
  const clean = (v: any): any => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      if ('mime' in v && 'url' in v) return v.id;
      return Object.fromEntries(Object.entries(v).filter(([k]) => !SKIP_KEYS.has(k) || k === '__component').map(([k, x]) => [k, clean(x)]));
    }
    return v;
  };
  const data: Record<string, any> = {};
  for (const [k, attr] of Object.entries<any>(model.attributes)) {
    if (!isTranslatable(attr) || WORKFLOW_FIELDS.includes(k) || ['media', 'relation'].includes(attr.type)) continue;
    if (src[k] === undefined || src[k] === null) continue;
    data[k] = clean(src[k]);
  }
  return data;
}

/** One-off: translations saved before this feature existed are assumed to match the current source. */
export async function backfillSourceHash(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'poc-translations', key: 'backfill-v1' });
  if (await store.get({})) return;
  const src = await sourceLocale(strapi);
  let n = 0;
  for (const uid of WORKFLOW_UIDS) {
    const rows: any[] = await strapi.db.query(uid as any).findMany({ where: { sourceHash: null, locale: { $ne: src } }, select: ['id', 'documentId'] });
    const cache = new Map<string, string | null>();
    for (const r of rows) {
      if (!cache.has(r.documentId)) cache.set(r.documentId, await currentSourceHash(strapi, uid, r.documentId));
      const h = cache.get(r.documentId);
      if (h) { await strapi.db.query(uid as any).update({ where: { id: r.id }, data: { sourceHash: h } }); n++; }
    }
  }
  await store.set({ value: true });
  if (n) strapi.log.info(`[poc-translations] Recorded the source-language baseline for ${n} existing translation(s)`);
}

export function registerTranslationApi(strapi: Core.Strapi) {
  const policies = ['admin::isAuthenticatedAdmin'];
  const adminOnly = () => {
    const a = getActor(strapi);
    if (a.channel !== 'admin' || a.roles.length === 0) throw new errors.ForbiddenError('Not allowed');
    return a;
  };
  const readCheck = (ctx: any, uid: unknown) => {
    if (typeof uid !== 'string' || !(WORKFLOW_UIDS as readonly string[]).includes(uid)) throw new errors.ValidationError('Unknown content type');
    if (ctx.state?.userAbility && !ctx.state.userAbility.can('plugin::content-manager.explorer.read', uid)) throw new errors.ForbiddenError('You may not read this content type');
    return uid;
  };
  const writeCheck = (ctx: any, uid: string) => {
    const actor = adminOnly();
    const mayEdit = ctx.state?.userAbility?.can('plugin::content-manager.explorer.update', uid) ?? false;
    if (!(actor.isSuperAdmin || (isAuthor(actor) && mayEdit))) throw new errors.ForbiddenError('Translating requires an authoring role that can edit this content type');
    return actor;
  };

  strapi.server.routes({
    type: 'admin',
    prefix: '/poc/translations',
    routes: [
      {
        // Matrix of every governed item × language, with the stage of each translation and whether it is outdated.
        method: 'GET', path: '/overview', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          adminOnly();
          const src = await sourceLocale(strapi);
          const types: any[] = [];
          for (const uid of WORKFLOW_UIDS) {
            if (ctx.state?.userAbility && !ctx.state.userAbility.can('plugin::content-manager.explorer.read', uid)) continue;
            const model: any = strapi.getModel(uid as any);
            const titleAttrs = TITLE_ATTRS.filter((t) => model.attributes[t]);
            const drafts: any[] = await strapi.db.query(uid as any).findMany({ where: { publishedAt: null }, select: ['documentId', 'locale', 'workflowStage', 'sourceHash', 'updatedAt', ...titleAttrs] });
            const live: any[] = await strapi.db.query(uid as any).findMany({ where: { publishedAt: { $notNull: true } }, select: ['documentId', 'locale'] });
            const liveSet = new Set(live.map((r) => `${r.documentId}|${r.locale}`));
            const byDoc = new Map<string, any[]>();
            for (const r of drafts) byDoc.set(r.documentId, [...(byDoc.get(r.documentId) ?? []), r]);
            const items: any[] = [];
            for (const [documentId, rows] of byDoc) {
              const sourceRow = rows.find((r) => r.locale === src);
              const first = sourceRow ?? rows[0];
              const title = titleAttrs.map((t) => first[t]).find(Boolean) ?? documentId;
              let srcHash: string | null | undefined;
              const cells: Record<string, any> = {};
              for (const { code } of LOCALES) {
                const r = rows.find((x) => x.locale === code);
                if (!r) { cells[code] = { exists: false }; continue; }
                let outdated = false;
                if (code !== src && r.sourceHash && sourceRow) {
                  srcHash ??= translatableHash(strapi, uid, await loadVersion(strapi, uid, documentId, src, 'draft'));
                  outdated = r.sourceHash !== srcHash;
                }
                cells[code] = { exists: true, stage: r.workflowStage ?? 'draft', live: liveSet.has(`${documentId}|${code}`), outdated };
              }
              items.push({ documentId, title, cells });
            }
            items.sort((a, b) => String(a.title).localeCompare(String(b.title)));
            if (items.length) types.push({ uid, label: TYPE_LABEL[uid] ?? uid, items });
          }
          ctx.body = { sourceLocale: src, locales: LOCALES.map((l) => l.code), types };
        },
      },
      {
        // Consistency report for one item (all translations vs the source language).
        method: 'GET', path: '/status', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          adminOnly();
          const uid = readCheck(ctx, ctx.query?.uid);
          const { documentId } = ctx.query ?? {};
          if (typeof documentId !== 'string') throw new errors.ValidationError('documentId is required');
          ctx.body = await analyzeDocument(strapi, uid, documentId);
        },
      },
      {
        // Start a translation: copies the source text into the new language as a draft for the translator to edit.
        method: 'POST', path: '/create', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          const { uid, documentId, locale } = ctx.request.body ?? {};
          readCheck(ctx, uid);
          const actor = writeCheck(ctx, uid);
          const src = await sourceLocale(strapi);
          if (typeof documentId !== 'string' || !LOCALES.some((l) => l.code === locale) || locale === src) throw new errors.ValidationError('Choose a non-source language');
          const source = await loadVersion(strapi, uid, documentId, src, 'draft');
          if (!source) throw new errors.NotFoundError('The source-language content does not exist');
          if (await loadVersion(strapi, uid, documentId, locale, 'draft')) throw new errors.ValidationError(`A ${String(locale).toUpperCase()} version already exists`);
          await asSystem('translation:create', () => (strapi.documents as any)(uid).update({ documentId, locale, data: cloneTranslatable(strapi, uid, source) }));
          void writeAudit(strapi, { action: 'translation-create', outcome: 'allowed', reason: `Started ${locale} translation from ${src}`, actor, contentType: uid, documentId, locale, workflowStageAfter: 'draft' });
          ctx.body = { created: true };
        },
      },
      {
        // The translation was checked and is still correct although the source text changed.
        method: 'POST', path: '/confirm', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          const { uid, documentId, locale } = ctx.request.body ?? {};
          readCheck(ctx, uid);
          const actor = writeCheck(ctx, uid);
          const src = await sourceLocale(strapi);
          if (typeof documentId !== 'string' || typeof locale !== 'string' || locale === src) throw new errors.ValidationError('documentId and a non-source locale are required');
          const hash = await currentSourceHash(strapi, uid, documentId);
          if (!hash) throw new errors.NotFoundError('The source-language content does not exist');
          const n = await strapi.db.query(uid as any).updateMany({ where: { documentId, locale }, data: { sourceHash: hash } });
          if (!n?.count) throw new errors.NotFoundError('Translation not found');
          void writeAudit(strapi, { action: 'translation-confirm', outcome: 'allowed', reason: `${locale} confirmed as still correct against the current ${src} text`, actor, contentType: uid, documentId, locale });
          ctx.body = { confirmed: true };
        },
      },
    ],
  });
}
