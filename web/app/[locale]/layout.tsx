import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, LOCALES } from '@/lib/strapi';
import '../globals.css';

const NAV: Record<string, Record<string, string>> = {
  en: { products: 'Products', news: 'News', promotions: 'Promotions', about: 'About Us', contact: 'Contact Us' },
  si: { products: 'නිෂ්පාදන', news: 'පුවත්', promotions: 'ප්‍රවර්ධන', about: 'අප ගැන', contact: 'අප අමතන්න' },
  ta: { products: 'தயாரிப்புகள்', news: 'செய்திகள்', promotions: 'சலுகைகள்', about: 'எங்களைப் பற்றி', contact: 'தொடர்பு' },
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = NAV[locale];
  const { contact, ...mainNav } = t;

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
              {Object.entries(mainNav).map(([k, label]) => (
                <Link key={k} href={`/${locale}/${k}`} className="text-sm font-medium text-ink hover:text-brand">{label}</Link>
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

        <footer className="mt-8 bg-brand-dark text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
            <div>
              <p className="text-lg font-bold">PoC Bank</p>
              <p className="mt-2 text-sm text-white/80">A proof-of-concept website powered by Strapi Community Edition and Next.js.</p>
            </div>
            <div className="text-sm">
              <p className="mb-2 font-semibold">Explore</p>
              <ul className="space-y-1.5 text-white/80">
                {Object.entries(t).map(([k, label]) => (
                  <li key={k}><Link href={`/${locale}/${k}`} className="hover:text-white">{label}</Link></li>
                ))}
              </ul>
            </div>
            <div className="text-sm text-white/80">
              <p className="mb-2 font-semibold text-white">Important</p>
              <p>Rates and offers are indicative, subject to change and to the product terms. This site is for demonstration only and is not a real bank.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
