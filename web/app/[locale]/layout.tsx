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

  return (
    <html lang={locale}>
      <body className="min-h-screen font-sans">
        <div className="bg-amber-200 px-4 py-1 text-center text-xs">
          PoC — Strapi Community Edition headless test site. Rendered at {new Date().toISOString()} (cached pages keep this timestamp until revalidated).
        </div>
        <header className="bg-white shadow-sm">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-4 py-4">
            <Link href={`/${locale}`} className="text-xl font-bold text-brand">PoC Bank</Link>
            {Object.entries(t).map(([k, label]) => (
              <Link key={k} href={`/${locale}/${k}`} className="text-sm hover:text-brand">{label}</Link>
            ))}
            <span className="ml-auto flex gap-2 text-sm">
              {LOCALES.map((l) => (
                <Link key={l} href={`/${l}`} className={l === locale ? 'font-bold text-brand' : 'text-gray-500'}>{l.toUpperCase()}</Link>
              ))}
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
