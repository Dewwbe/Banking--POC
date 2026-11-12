import 'server-only';
import type { Metadata } from 'next';
import { getSeoSettings, LOCALES, mediaUrl, type Locale, type Media } from './strapi';

/**
 * Builds the <head> metadata of every page from what editors manage in the CMS:
 *   - page-level `seo` (meta title, meta description, canonical URL, noindex, share image) of each item, and
 *   - "SEO settings": site name, title template, default description / share image and the meta data of the listing pages.
 * Missing values fall back to the item's own title/summary, then to the site defaults, so no page is left without a
 * title and description. Titles use the same template rule as the CMS audit (cms/src/poc/seo.ts).
 */

export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** "{title} | {siteName}"; the site name is not repeated when the title already contains it. */
export function applyTemplate(template: string | null | undefined, title: string, siteName: string | null | undefined) {
  const t = (title ?? '').trim();
  const site = (siteName ?? '').trim();
  if (!site || !t || t.toLowerCase().includes(site.toLowerCase())) return t;
  return (template || '{title} | {siteName}').replace('{title}', t).replace('{siteName}', site);
}

type Opts = {
  locale: Locale;
  /** path without the language prefix, e.g. "/products/fixed-deposit" ("" for the home page) */
  path: string;
  /** the item's own title, used when it has no meta title */
  title?: string | null;
  /** the item's own summary, used when it has no meta description */
  description?: string | null;
  /** the `seo` component of the item */
  seo?: { metaTitle?: string; metaDescription?: string; canonicalUrl?: string | null; noIndex?: boolean; shareImage?: Media | null } | null;
  image?: Media | null;
  /** for listing pages: "products" | "news" | "promotions" | "rates" (their SEO lives in SEO settings) */
  listing?: 'products' | 'news' | 'promotions' | 'rates';
  type?: 'website' | 'article';
  /** set when the page is showing another language's content (language fallback): its canonical URL points at that language */
  fallbackFrom?: Locale;
};

const abs = (u: string | null) => (u ? (u.startsWith('http') ? u : `${SITE_URL}${u}`) : null);

export async function buildMetadata(o: Opts): Promise<Metadata> {
  const settings: any = await getSeoSettings(o.locale).catch(() => null);
  const listing = o.listing ? (settings?.listingPages ?? []).find((p: any) => p.pageKey === o.listing) : null;
  const seo = listing ?? o.seo ?? {};

  const baseTitle = (seo.metaTitle || o.title || settings?.siteName || '').trim();
  const fullTitle = applyTemplate(settings?.titleTemplate, baseTitle, settings?.siteName) || settings?.siteName || 'PoC Bank';
  const description = (seo.metaDescription || o.description || settings?.defaultDescription || '').trim() || undefined;
  const canonical = (o.seo?.canonicalUrl as string | null | undefined) || `${SITE_URL}/${o.fallbackFrom ?? o.locale}${o.path}`;
  const image = abs(mediaUrl(o.seo?.shareImage ?? o.image ?? settings?.defaultShareImage));

  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical,
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${o.path}`])), 'x-default': `${SITE_URL}/en${o.path}` },
    },
    robots: seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: o.type ?? 'website', title: fullTitle, description, url: canonical, siteName: settings?.siteName, locale: o.locale,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: fullTitle, description, ...(image ? { images: [image] } : {}) },
  };
}
