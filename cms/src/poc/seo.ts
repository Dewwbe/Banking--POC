import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { LOCALES } from './constants';
import { getActor } from './actor';
import { loadVersion } from './content-hash';
import { sourceLocale } from './translations';

/**
 * SEO management (1.1.15.1): audit and edit the meta title / meta description of every page the website renders.
 *
 *   - Page-level SEO lives in the `seo` component of Home, About, Contact, Products, News and Promotions.
 *   - Listing pages (Products, News, Promotions, Rates) and site-wide defaults live in the "SEO settings" single type.
 *   - The audit flags missing, too short / too long, duplicated and untranslated titles and descriptions.
 *   - Edits go through the normal Document Service, so they use the same draft → review → approval → publish workflow,
 *     version history and audit log as any other content change.
 *
 * Limits to record: lengths are character counts (search engines truncate by pixel width, so ~60 / ~160 is a guide);
 * the audit reads the DRAFT of each item, so it shows what will be live after the next approval and publish.
 */

export type SeoIssue = { severity: 'error' | 'warning' | 'info'; rule: string; message: string };

const SEO_TYPES: Record<string, string> = {
  'api::home.home': 'Home page',
  'api::about-us.about-us': 'About Us',
  'api::contact-us.contact-us': 'Contact Us',
  'api::product.product': 'Product',
  'api::news-article.news-article': 'News article',
  'api::promotion.promotion': 'Promotion',
};
const SETTINGS = 'api::seo-setting.seo-setting';
const TITLE_ATTRS = ['name', 'title', 'label', 'slug'];
const TITLE_MAX = 60;
const TITLE_MIN = 25;
const DESC_MAX = 160;
const DESC_MIN = 70;

/** "{title} | {siteName}": the same rule is used by the website (web/lib/seo.ts). The site name is not repeated. */
export function applyTemplate(template: string | null | undefined, title: string, siteName: string | null | undefined) {
  const t = (title ?? '').trim();
  const site = (siteName ?? '').trim();
  if (!site || !t || t.toLowerCase().includes(site.toLowerCase())) return t;
  return (template || '{title} | {siteName}').replace('{title}', t).replace('{siteName}', site);
}

type Row = {
  key: string; uid: string; typeLabel: string; documentId: string; locale: string; itemTitle: string; pageKey: string | null;
  metaTitle: string; metaDescription: string; noIndex: boolean; fullTitle: string; stage: string | null; live: boolean; issues: SeoIssue[];
};

async function collect(strapi: Core.Strapi, allowed: (uid: string) => boolean): Promise<Row[]> {
  const rows: Row[] = [];
  const src = await sourceLocale(strapi);

  // site settings per language (draft) for the title template; falls back to the source language
  const settingsDocs: any[] = allowed(SETTINGS)
    ? await (strapi.documents as any)(SETTINGS).findMany({ status: 'draft', locale: '*', populate: { listingPages: true } })
    : await (strapi.documents as any)(SETTINGS).findMany({ status: 'draft', locale: '*', populate: { listingPages: true } }).catch(() => []);
  const settings = new Map<string, any>(settingsDocs.map((d) => [d.locale, d]));
  const siteFor = (locale: string) => settings.get(locale) ?? settings.get(src) ?? null;

  const liveKeys = new Set<string>();
  const push = (r: Omit<Row, 'fullTitle' | 'issues' | 'live'>, site: any, live: boolean) => {
    rows.push({ ...r, live, fullTitle: applyTemplate(site?.titleTemplate, r.metaTitle, site?.siteName), issues: [] });
  };

  for (const uid of Object.keys(SEO_TYPES)) {
    if (!allowed(uid)) continue;
    const model: any = strapi.getModel(uid as any);
    const docs: any[] = await (strapi.documents as any)(uid).findMany({ status: 'draft', locale: '*', populate: { seo: true }, limit: 1000 });
    const live: any[] = await strapi.db.query(uid as any).findMany({ where: { publishedAt: { $notNull: true } }, select: ['documentId', 'locale'] });
    live.forEach((r) => liveKeys.add(`${uid}|${r.documentId}|${r.locale}`));
    for (const d of docs) {
      const titleAttr = TITLE_ATTRS.find((a) => model.attributes[a]);
      push({
        key: `${uid}|${d.documentId}|${d.locale}`, uid, typeLabel: SEO_TYPES[uid], documentId: d.documentId, locale: d.locale,
        itemTitle: String((titleAttr && d[titleAttr]) || d.documentId), pageKey: null,
        metaTitle: d.seo?.metaTitle ?? '', metaDescription: d.seo?.metaDescription ?? '', noIndex: Boolean(d.seo?.noIndex), stage: d.workflowStage ?? 'draft',
      }, siteFor(d.locale), liveKeys.has(`${uid}|${d.documentId}|${d.locale}`));
    }
  }

  if (allowed(SETTINGS)) {
    const live: any[] = await strapi.db.query(SETTINGS as any).findMany({ where: { publishedAt: { $notNull: true } }, select: ['documentId', 'locale'] });
    live.forEach((r) => liveKeys.add(`${SETTINGS}|${r.documentId}|${r.locale}`));
    for (const d of settingsDocs) {
      for (const p of d.listingPages ?? []) {
        push({
          key: `${SETTINGS}|${d.documentId}|${d.locale}|${p.pageKey}`, uid: SETTINGS, typeLabel: 'Listing page', documentId: d.documentId, locale: d.locale,
          itemTitle: `${p.pageKey[0].toUpperCase()}${p.pageKey.slice(1)} page`, pageKey: p.pageKey,
          metaTitle: p.metaTitle ?? '', metaDescription: p.metaDescription ?? '', noIndex: Boolean(p.noIndex), stage: d.workflowStage ?? 'draft',
        }, d, liveKeys.has(`${SETTINGS}|${d.documentId}|${d.locale}`));
      }
    }
  }

  // ---- rules ----
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const titleGroups = new Map<string, Row[]>();
  const descGroups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.metaTitle) titleGroups.set(`${r.locale}|${norm(r.metaTitle)}`, [...(titleGroups.get(`${r.locale}|${norm(r.metaTitle)}`) ?? []), r]);
    if (r.metaDescription) descGroups.set(`${r.locale}|${norm(r.metaDescription)}`, [...(descGroups.get(`${r.locale}|${norm(r.metaDescription)}`) ?? []), r]);
  }
  const srcOf = (r: Row) => rows.find((x) => x.locale === src && x.uid === r.uid && x.documentId === r.documentId && x.pageKey === r.pageKey);

  for (const r of rows) {
    const add = (severity: SeoIssue['severity'], rule: string, message: string) => r.issues.push({ severity, rule, message });
    if (!r.metaTitle.trim()) add('error', 'title-missing', 'No meta title: search engines will pick one themselves.');
    else {
      if (r.fullTitle.length > TITLE_MAX) add('warning', 'title-long', `The full title is ${r.fullTitle.length} characters (about ${TITLE_MAX} fit in search results): "${r.fullTitle}".`);
      if (r.metaTitle.trim().length < TITLE_MIN) add('warning', 'title-short', `The meta title is only ${r.metaTitle.trim().length} characters; ${TITLE_MIN}–${TITLE_MAX} is recommended.`);
    }
    if (!r.metaDescription.trim()) add('error', 'description-missing', 'No meta description: search engines will show a random snippet.');
    else {
      if (r.metaDescription.trim().length > DESC_MAX) add('warning', 'description-long', `The meta description is ${r.metaDescription.trim().length} characters; about ${DESC_MAX} are shown.`);
      if (r.metaDescription.trim().length < DESC_MIN) add('warning', 'description-short', `The meta description is only ${r.metaDescription.trim().length} characters; ${DESC_MIN}–${DESC_MAX} is recommended.`);
    }
    const dt = r.metaTitle ? titleGroups.get(`${r.locale}|${norm(r.metaTitle)}`) ?? [] : [];
    if (dt.length > 1) add('warning', 'title-duplicate', `The same meta title is used by: ${dt.filter((x) => x !== r).map((x) => x.itemTitle).slice(0, 3).join(', ')}.`);
    const dd = r.metaDescription ? descGroups.get(`${r.locale}|${norm(r.metaDescription)}`) ?? [] : [];
    if (dd.length > 1) add('warning', 'description-duplicate', `The same meta description is used by: ${dd.filter((x) => x !== r).map((x) => x.itemTitle).slice(0, 3).join(', ')}.`);
    if (r.locale !== src) {
      const s = srcOf(r);
      if (s && r.metaTitle && norm(s.metaTitle) === norm(r.metaTitle)) add('warning', 'title-untranslated', 'The meta title is identical to the source language (not translated?).');
      if (s && r.metaDescription && norm(s.metaDescription) === norm(r.metaDescription)) add('warning', 'description-untranslated', 'The meta description is identical to the source language (not translated?).');
    }
    if (r.noIndex) add('info', 'noindex', 'Marked "noindex": search engines are asked not to list this page.');
  }
  return rows;
}

export function registerSeoApi(strapi: Core.Strapi) {
  const policies = ['admin::isAuthenticatedAdmin'];
  const actor = () => {
    const a = getActor(strapi);
    if (a.channel !== 'admin' || a.roles.length === 0) throw new errors.ForbiddenError('Not allowed');
    return a;
  };

  strapi.server.routes({
    type: 'admin',
    prefix: '/poc/seo',
    routes: [
      {
        method: 'GET', path: '/audit', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          actor();
          const ability = ctx.state?.userAbility;
          const rows = await collect(strapi, (uid) => (ability ? ability.can('plugin::content-manager.explorer.read', uid) : true));
          const count = (sev: string) => rows.filter((r) => r.issues.some((i) => i.severity === sev)).length;
          ctx.body = {
            locales: LOCALES.map((l) => l.code),
            limits: { titleMax: TITLE_MAX, titleMin: TITLE_MIN, descMax: DESC_MAX, descMin: DESC_MIN },
            summary: { total: rows.length, withErrors: count('error'), withWarnings: count('warning') },
            rows: rows.sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.itemTitle.localeCompare(b.itemTitle) || a.locale.localeCompare(b.locale)),
          };
        },
      },
      {
        // Change the meta title / description / noindex of one item or listing page. Goes through the workflow
        // (an edit moves the item back to Draft), the version history and the audit log like any content change.
        method: 'POST', path: '/update', info: { pluginName: 'poc' }, config: { policies },
        handler: async (ctx: any) => {
          actor();
          const { uid, documentId, locale, pageKey, metaTitle, metaDescription, noIndex } = ctx.request.body ?? {};
          if (typeof documentId !== 'string' || typeof locale !== 'string') throw new errors.ValidationError('documentId and locale are required');
          const isSettings = uid === SETTINGS;
          if (!isSettings && !SEO_TYPES[uid]) throw new errors.ValidationError('This content type has no SEO fields');
          if (isSettings && typeof pageKey !== 'string') throw new errors.ValidationError('pageKey is required for listing pages');
          const field = isSettings ? 'listingPages' : 'seo';
          const ability = ctx.state?.userAbility;
          // Content Manager field permissions are stored per leaf ("seo.metaTitle"), not per component.
          const may = (leaf: string) => ability.can('plugin::content-manager.explorer.update', uid, `${field}.${leaf}`);
          if (ability && !(ability.can('plugin::content-manager.explorer.update', uid) && may('metaTitle') && may('metaDescription'))) {
            throw new errors.ForbiddenError('You may not edit the SEO fields of this content type');
          }
          const title = metaTitle === undefined ? undefined : String(metaTitle).trim();
          const desc = metaDescription === undefined ? undefined : String(metaDescription).trim();
          if (title !== undefined && (!title || title.length > TITLE_MAX)) throw new errors.ValidationError(`The meta title is required and may have at most ${TITLE_MAX} characters`);
          if (desc !== undefined && (!desc || desc.length > DESC_MAX)) throw new errors.ValidationError(`The meta description is required and may have at most ${DESC_MAX} characters`);

          const current: any = await loadVersion(strapi, uid, documentId, locale, 'draft');
          if (!current) throw new errors.NotFoundError('Content not found');
          let data: Record<string, any>;
          if (isSettings) {
            const items: any[] = current.listingPages ?? [];
            if (!items.some((p) => p.pageKey === pageKey)) throw new errors.NotFoundError('Listing page not found');
            data = {
              listingPages: items.map((p) => {
                const base = { pageKey: p.pageKey, metaTitle: p.metaTitle, metaDescription: p.metaDescription, noIndex: Boolean(p.noIndex) };
                return p.pageKey !== pageKey ? base : { ...base, ...(title !== undefined ? { metaTitle: title } : {}), ...(desc !== undefined ? { metaDescription: desc } : {}), ...(noIndex !== undefined ? { noIndex: Boolean(noIndex) } : {}) };
              }),
            };
          } else {
            const s = current.seo ?? {};
            data = {
              seo: {
                metaTitle: title ?? s.metaTitle, metaDescription: desc ?? s.metaDescription, canonicalUrl: s.canonicalUrl ?? null,
                noIndex: noIndex !== undefined ? Boolean(noIndex) : Boolean(s.noIndex), shareImage: s.shareImage?.id ?? null,
              },
            };
          }
          await (strapi.documents as any)(uid).update({ documentId, locale, data });
          ctx.body = { updated: true };
        },
      },
    ],
  });
}
