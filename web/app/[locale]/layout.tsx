import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildMetadata } from '@/lib/seo';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SubscribeForm } from '@/components/SubscribeForm';
import { Tracker } from '@/components/Tracker';
import { getMenu, isLocale, LOCALES, type MenuNode } from '@/lib/strapi';
import '../globals.css';

const NAV: Record<string, Record<string, string>> = {
  en: { products: 'Products', rates: 'Rates', news: 'News', promotions: 'Promotions', about: 'About Us', contact: 'Contact Us' },
  si: { products: 'නිෂ්පාදන', rates: 'පොලී අනුපාත', news: 'පුවත්', promotions: 'ප්‍රවර්ධන', about: 'අප ගැන', contact: 'අප අමතන්න' },
  ta: { products: 'தயாரிப்புகள்', rates: 'வட்டி விகிதங்கள்', news: 'செய்திகள்', promotions: 'சலுகைகள்', about: 'எங்களைப் பற்றி', contact: 'தொடர்பு' },
};

/** Menu URLs are stored locale-agnostic ("/products"); external links are kept as-is. */
const hrefFor = (locale: string, url: string) => (/^https?:\/\//.test(url) ? url : `/${locale}${url.startsWith('/') ? url : `/${url}`}`);

/** Built-in links, used until a menu has been published in the CMS (Menu items). */
const fallbackMenu = (t: Record<string, string>, keys: string[]): MenuNode[] =>
  keys.map((k) => ({ documentId: k, label: t[k], url: `/${k}`, children: [] }));

/** Default metadata for every page under /[locale]; pages override it with their own CMS-managed meta data. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? buildMetadata({ locale, path: '' }) : {};
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = NAV[locale];
  const { contact } = t;
  const [header, footer] = await Promise.all([getMenu(locale, 'header').catch(() => []), getMenu(locale, 'footer').catch(() => [])]);
  const headerMenu = header.length ? header : fallbackMenu(t, ['products', 'rates', 'news', 'promotions', 'about']);
  const footerMenu = footer.length ? footer : fallbackMenu(t, ['products', 'rates', 'news', 'promotions', 'about', 'contact']);

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <div className="bg-lilac-soft px-4 py-1 text-center text-[11px] text-muted">
          PoC — Strapi Community Edition headless test site · rendered {new Date().toISOString()} (cached pages keep this timestamp until revalidated)
        </div>

        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
            <Link href={`/${locale}`} className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-lg font-bold text-white">P</span>
              <span className="text-xl font-bold tracking-tight text-brand-dark">PoC Bank</span>
            </Link>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {headerMenu.map((m) => (
                <div key={m.documentId} className="group relative">
                  <Link href={hrefFor(locale, m.url)} target={m.openInNewTab ? '_blank' : undefined} className="text-sm font-medium text-ink hover:text-brand">
                    {m.label}{m.children.length > 0 && <span aria-hidden className="ml-1 text-xs">▾</span>}
                  </Link>
                  {m.children.length > 0 && (
                    <div className="invisible absolute left-0 top-full z-30 min-w-44 rounded-xl border border-line bg-white py-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                      {m.children.map((c) => (
                        <Link key={c.documentId} href={hrefFor(locale, c.url)} target={c.openInNewTab ? '_blank' : undefined} className="block px-4 py-2 text-sm text-ink hover:bg-lilac-soft hover:text-brand">{c.label}</Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-4">
              <span className="flex rounded-full bg-lilac-soft p-1 text-xs font-semibold">
                {LOCALES.map((l) => (
                  <Link key={l} href={`/${l}`} className={`rounded-full px-3 py-1 ${l === locale ? 'bg-brand text-white' : 'text-brand hover:bg-white'}`}>{l.toUpperCase()}</Link>
                ))}
              </span>
              <Link href={`/${locale}/contact`} className="hidden rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark sm:inline-block">{contact}</Link>
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-12 px-4 py-10">{children}</main>

        <Tracker />

        <footer className="mt-8 bg-brand-dark text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
            <div>
              <p className="text-lg font-bold">PoC Bank</p>
              <p className="mt-2 text-sm text-white/80">A proof-of-concept website powered by Strapi Community Edition and Next.js.</p>
            </div>
            <div className="text-sm">
              <p className="mb-2 font-semibold">Explore</p>
              <ul className="space-y-1.5 text-white/80">
                {footerMenu.map((m) => (
                  <li key={m.documentId}><Link href={hrefFor(locale, m.url)} target={m.openInNewTab ? '_blank' : undefined} className="hover:text-white">{m.label}</Link></li>
                ))}
              </ul>
            </div>
            <div className="text-sm text-white/80">
              <p className="mb-2 font-semibold text-white">Important</p>
              <p>Rates and offers are indicative, subject to change and to the product terms. This site is for demonstration only and is not a real bank.</p>
            </div>
          </div>
          <div className="mx-auto max-w-6xl border-t border-white/15 px-4 py-8">
            <SubscribeForm locale={locale} />
          </div>
        </footer>
      </body>
    </html>
  );
}
