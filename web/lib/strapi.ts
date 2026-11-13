/**
 * Server-side Strapi REST client. Runs only on the server, so the read token is never sent to browsers.
 * Every fetch is tagged so the Strapi webhook (app/api/revalidate) can invalidate exactly what changed.
 */
import 'server-only';

export const LOCALES = ['en', 'si', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (l: string): l is Locale => (LOCALES as readonly string[]).includes(l);

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1337';
const MEDIA_URL = process.env.STRAPI_PUBLIC_MEDIA_URL ?? 'http://localhost:1337';
const REVALIDATE = Number(process.env.NEXT_DEFAULT_REVALIDATE_SECONDS ?? 300);

/** Encodes nested objects into Strapi's bracket query syntax: populate[sections][on][x][populate]=* */
export function toQuery(obj: Record<string, unknown>, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => parts.push(...(typeof item === 'object' ? toQuery(item as any, `${key}[${i}]`) : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`])));
    else if (typeof v === 'object') parts.push(...toQuery(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts;
}

export type Media = { url: string; alternativeText?: string | null; mime?: string; name?: string };
export const mediaUrl = (m?: Media | null) => (m?.url ? (m.url.startsWith('http') ? m.url : `${MEDIA_URL}${m.url}`) : null);

export async function strapiGet<T>(path: string, query: Record<string, unknown>, tags: string[]): Promise<T | null> {
  const url = `${STRAPI_URL}/api/${path}?${toQuery(query).join('&')}`;
  const headers: Record<string, string> = {};
  if (process.env.STRAPI_READ_TOKEN) headers.Authorization = `Bearer ${process.env.STRAPI_READ_TOKEN}`;

  const res = await fetch(url, { headers, next: { tags: ['strapi', ...tags], revalidate: REVALIDATE } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Strapi ${res.status} for ${path}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.data as T;
}

// ------------------------------------------------------------------------------------------------
// Queries. Only PUBLISHED content is requested (Strapi 5 default status) — drafts never reach the site.
// ------------------------------------------------------------------------------------------------
const SECTIONS_POPULATE = {
  on: {
    'shared.banner': { populate: '*' },
    'sections.card-group': { populate: { cards: { populate: '*' } } },
    'sections.faq-group': { populate: '*' },
    'sections.cta-block': { populate: '*' },
    'sections.rich-text': { populate: '*' },
    'sections.legal-notice': { populate: '*' },
    'sections.campaign-hero': { populate: { image: true, cta: true } },
    'sections.offer-highlights': { populate: '*' },
    'sections.how-to-claim': { populate: '*' },
    'sections.offer-terms': { populate: '*' },
  },
};

// ------------------------------------------------------------------------------------------------
// Language fallback. A page/item that is not PUBLISHED in the requested language is served from the fallback
// language instead (Sinhala/Tamil -> English) and flagged with `_fallbackFrom`, so the page can tell visitors.
// Only published content is ever used, so drafts and unpublished items still 404 / stay hidden.
// ------------------------------------------------------------------------------------------------
export const FALLBACK: Record<Locale, Locale[]> = { en: [], si: ['en'], ta: ['en'] };
export type Fallback = { _fallbackFrom?: Locale };

async function firstAvailable<T>(locale: Locale, load: (l: Locale) => Promise<T | null>): Promise<(T & Fallback) | null> {
  const own = await load(locale);
  if (own) return own;
  for (const l of FALLBACK[locale]) {
    const alt = await load(l);
    if (alt) return { ...alt, _fallbackFrom: l };
  }
  return null;
}

/** The requested language's items plus, for items that have no published version in it, the fallback version. */
async function mergeFallback<T extends { documentId: string }>(locale: Locale, load: (l: Locale) => Promise<T[] | null>, sort?: (a: T, b: T) => number): Promise<Array<T & Fallback>> {
  const out: Array<T & Fallback> = [...((await load(locale)) ?? [])];
  const seen = new Set(out.map((x) => x.documentId));
  for (const l of FALLBACK[locale]) {
    for (const x of (await load(l)) ?? []) {
      if (seen.has(x.documentId)) continue;
      seen.add(x.documentId);
      out.push({ ...x, _fallbackFrom: l });
    }
  }
  return sort ? out.sort(sort) : out;
}

export const getHome = (locale: Locale) =>
  firstAvailable(locale, (l) => strapiGet<any>('home', {
    locale: l,
    populate: {
      hero: { populate: '*' },
      featuredProducts: { fields: ['name', 'slug', 'summary', 'interestRate'] },
      sections: SECTIONS_POPULATE,
      seo: { populate: '*' },
    },
  }, ['strapi:home', 'strapi:product']));

export const getAbout = (locale: Locale) =>
  firstAvailable(locale, (l) => strapiGet<any>('about-us', { locale: l, populate: { values: { populate: '*' }, images: true, sections: SECTIONS_POPULATE, seo: { populate: '*' } } }, ['strapi:about-us']));

export const getContact = (locale: Locale) =>
  firstAvailable(locale, (l) => strapiGet<any>('contact-us', { locale: l, populate: { branches: true, sections: SECTIONS_POPULATE, seo: { populate: '*' } } }, ['strapi:contact-us']));

export const getProducts = (locale: Locale) =>
  mergeFallback(locale,
    (l) => strapiGet<any[]>('products', { locale: l, sort: ['name:asc'], fields: ['name', 'slug', 'category', 'summary', 'interestRate', 'rateEffectiveDate'], pagination: { pageSize: 100 } }, ['strapi:product']),
    (a, b) => String(a.name).localeCompare(String(b.name)));

export const getProduct = (locale: Locale, slug: string) =>
  firstAvailable(locale, async (l) =>
    (await strapiGet<any[]>('products', { locale: l, filters: { slug: { $eq: slug } }, populate: { benefits: true, faqs: true, keyFactsDocument: true, heroImage: true, seo: { populate: '*' } } }, ['strapi:product']))?.[0] ?? null);

export const getNewsList = (locale: Locale) =>
  mergeFallback(locale,
    (l) => strapiGet<any[]>('news-articles', { locale: l, sort: ['publicationDate:desc'], fields: ['title', 'slug', 'category', 'excerpt', 'publicationDate'], pagination: { pageSize: 50 } }, ['strapi:news-article']),
    (a, b) => String(b.publicationDate).localeCompare(String(a.publicationDate)));

export const getNews = (locale: Locale, slug: string) =>
  firstAvailable(locale, async (l) =>
    (await strapiGet<any[]>('news-articles', { locale: l, filters: { slug: { $eq: slug } }, populate: { coverImage: true, seo: { populate: '*' } } }, ['strapi:news-article']))?.[0] ?? null);

/**
 * Promotions: filtered by date window on the API AND re-checked here, so an expired promotion disappears
 * at endDate even if the scheduler has not unpublished it yet (defence in depth for Workstream F test OPS-06).
 * "now" is rounded to the minute so the cache key changes at most once per minute.
 */
export const getPromotions = async (locale: Locale) => {
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const list = await mergeFallback(locale,
    (l) => strapiGet<any[]>('promotions', {
      locale: l,
      filters: { startDate: { $lte: now }, endDate: { $gt: now } },
      sort: ['startDate:desc'],
      populate: { banner: true, cta: true, sections: SECTIONS_POPULATE },
    }, ['strapi:promotion']),
    (a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const t = Date.now();
  return list.filter((p) => Date.parse(p.startDate) <= t && Date.parse(p.endDate) > t);
};

/** Banners for one placement. Date window applied on the API and re-checked here (same defence as promotions). */
export const getBanners = async (locale: Locale, placement: string) => {
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const list = await mergeFallback(locale,
    (l) => strapiGet<any[]>('banners', {
      locale: l,
      filters: {
        placement: { $eq: placement },
        $and: [
          { $or: [{ startDate: { $null: true } }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: { $null: true } }, { endDate: { $gt: now } }] },
        ],
      },
      sort: ['sortOrder:asc'],
      populate: { image: true, cta: true },
    }, ['strapi:banner']),
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const t = Date.now();
  return list
    .filter((b) => (!b.startDate || Date.parse(b.startDate) <= t) && (!b.endDate || Date.parse(b.endDate) > t))
    .map((b) => ({ ...b, cta: b.cta ? [b.cta] : [] })); // <Banner> expects a list of buttons
};

export type MenuNode = { documentId: string; label: string; url: string; openInNewTab?: boolean; children: MenuNode[] };

/** Published menu items for header/footer as a tree (one level of nesting). Items missing in this language use the fallback language's label. Empty → the layout falls back to its built-in links. */
export const getMenu = async (locale: Locale, location: 'header' | 'footer'): Promise<MenuNode[]> => {
  const list = await mergeFallback(locale,
    (l) => strapiGet<any[]>('menu-items', {
      locale: l, filters: { location: { $eq: location } }, sort: ['sortOrder:asc'], populate: { parent: { fields: ['documentId'] } }, pagination: { pageSize: 100 },
    }, ['strapi:menu-item']),
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const nodes = new Map<string, MenuNode>(list.map((i) => [i.documentId, { documentId: i.documentId, label: i.label, url: i.url, openInNewTab: i.openInNewTab, children: [] }]));
  const roots: MenuNode[] = [];
  for (const i of list) {
    const node = nodes.get(i.documentId)!;
    const parent = i.parent?.documentId ? nodes.get(i.parent.documentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
};

export const getRates = (locale: Locale) =>
  mergeFallback(locale,
    (l) => strapiGet<any[]>('rates', {
      locale: l, sort: ['sortOrder:asc', 'name:asc'], populate: { product: { fields: ['slug'] } }, pagination: { pageSize: 200 },
    }, ['strapi:rate']),
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name)));

/** Site-wide SEO settings (site name, title template, defaults, listing-page meta data), with language fallback. */
export const getSeoSettings = (locale: Locale) =>
  firstAvailable(locale, (l) => strapiGet<any>('seo-setting', { locale: l, populate: { defaultShareImage: true, listingPages: true } }, ['strapi:seo-setting']));
