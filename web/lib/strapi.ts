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
  },
};

export const getHome = (locale: Locale) =>
  strapiGet<any>('home', {
    locale,
    populate: {
      hero: { populate: '*' },
      featuredProducts: { fields: ['name', 'slug', 'summary', 'interestRate'] },
      sections: SECTIONS_POPULATE,
      seo: { populate: '*' },
    },
  }, ['strapi:home', 'strapi:product']);

export const getAbout = (locale: Locale) =>
  strapiGet<any>('about-us', { locale, populate: { values: { populate: '*' }, images: true, sections: SECTIONS_POPULATE, seo: { populate: '*' } } }, ['strapi:about-us']);

export const getContact = (locale: Locale) =>
  strapiGet<any>('contact-us', { locale, populate: { branches: true, sections: SECTIONS_POPULATE, seo: { populate: '*' } } }, ['strapi:contact-us']);

export const getProducts = (locale: Locale) =>
  strapiGet<any[]>('products', { locale, sort: ['name:asc'], fields: ['name', 'slug', 'category', 'summary', 'interestRate', 'rateEffectiveDate'], pagination: { pageSize: 100 } }, ['strapi:product']);

export const getProduct = async (locale: Locale, slug: string) =>
  (await strapiGet<any[]>('products', { locale, filters: { slug: { $eq: slug } }, populate: { benefits: true, faqs: true, keyFactsDocument: true, heroImage: true, seo: { populate: '*' } } }, ['strapi:product']))?.[0] ?? null;

export const getNewsList = (locale: Locale) =>
  strapiGet<any[]>('news-articles', { locale, sort: ['publicationDate:desc'], fields: ['title', 'slug', 'category', 'excerpt', 'publicationDate'], pagination: { pageSize: 50 } }, ['strapi:news-article']);

export const getNews = async (locale: Locale, slug: string) =>
  (await strapiGet<any[]>('news-articles', { locale, filters: { slug: { $eq: slug } }, populate: { coverImage: true, seo: { populate: '*' } } }, ['strapi:news-article']))?.[0] ?? null;

/**
 * Promotions: filtered by date window on the API AND re-checked here, so an expired promotion disappears
 * at endDate even if the scheduler has not unpublished it yet (defence in depth for Workstream F test OPS-06).
 * "now" is rounded to the minute so the cache key changes at most once per minute.
 */
export const getPromotions = async (locale: Locale) => {
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const list = await strapiGet<any[]>('promotions', {
    locale,
    filters: { startDate: { $lte: now }, endDate: { $gt: now } },
    sort: ['startDate:desc'],
    populate: { banner: true, cta: true },
  }, ['strapi:promotion']);
  const t = Date.now();
  return (list ?? []).filter((p) => Date.parse(p.startDate) <= t && Date.parse(p.endDate) > t);
};
