import Link from 'next/link';
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { LangTag } from '@/components/FallbackNotice';
import { getRates, isLocale } from '@/lib/strapi';

const TITLES: Record<string, { title: string; intro: string; cols: string[]; note: string; groups: Record<string, string> }> = {
  en: { title: 'Interest rates', intro: 'Current indicative rates. Each rate shows the date it took effect.', cols: ['Product', 'Tenure', 'Rate (p.a.)', 'Effective from'], note: 'Rates are indicative, subject to change and to the product terms.',
    groups: { savings: 'Savings', fixed_deposit: 'Fixed deposits', loan: 'Loans', card: 'Cards', other: 'Other' } },
  si: { title: 'පොලී අනුපාත', intro: 'වත්මන් දර්ශක අනුපාත. සෑම අනුපාතයක්ම බලපැවැත්වෙන දිනය පෙන්වයි.', cols: ['නිෂ්පාදනය', 'කාලය', 'අනුපාතය (වසරකට)', 'බලපැවැත්වෙන දිනය'], note: 'අනුපාත දර්ශකයන් වන අතර වෙනස් විය හැක.',
    groups: { savings: 'ඉතුරුම්', fixed_deposit: 'ස්ථාවර තැන්පතු', loan: 'ණය', card: 'කාඩ්පත්', other: 'වෙනත්' } },
  ta: { title: 'வட்டி விகிதங்கள்', intro: 'தற்போதைய குறிப்பு விகிதங்கள். ஒவ்வொரு விகிதமும் அமலுக்கு வந்த தேதியைக் காட்டும்.', cols: ['தயாரிப்பு', 'காலம்', 'விகிதம் (ஆண்டுக்கு)', 'அமலுக்கு வரும் தேதி'], note: 'விகிதங்கள் குறிப்பிற்கானவை, மாற்றத்திற்கு உட்பட்டவை.',
    groups: { savings: 'சேமிப்பு', fixed_deposit: 'நிலையான வைப்பு', loan: 'கடன்கள்', card: 'அட்டைகள்', other: 'மற்றவை' } },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? buildMetadata({ locale, path: '/rates', listing: 'rates' }) : {};
}

export default async function RatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = TITLES[locale];
  const rates = (await getRates(locale)) ?? [];

  const groups = new Map<string, any[]>();
  for (const r of rates) groups.set(r.category ?? 'other', [...(groups.get(r.category ?? 'other') ?? []), r]);

  return (
    <div className="space-y-10">
      <header className="rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac p-8 text-white sm:p-12">
        <h1 className="text-4xl font-extrabold tracking-tight">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-lg font-medium">{t.intro}</p>
      </header>

      {[...groups.entries()].map(([category, items]) => (
        <section key={category} data-testid={`rates-${category}`}>
          <h2 className="mb-4 text-xl font-bold text-brand-dark">{t.groups[category] ?? category}</h2>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-lilac-soft text-brand-dark">
                <tr>{t.cols.map((c) => <th key={c} className="px-4 py-3 font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((r) => (
                  <tr key={r.documentId}>
                    <td className="px-4 py-3 font-medium">
                      {r.product?.slug ? <Link href={`/${locale}/products/${r.product.slug}`} className="text-brand hover:underline">{r.name}</Link> : r.name}
                      {r.notes && <div className="text-xs font-normal text-muted">{r.notes}</div>}
                      {r._fallbackFrom && <div className="mt-1"><LangTag locale={locale} from={r._fallbackFrom} /></div>}
                    </td>
                    <td className="px-4 py-3">{r.tenure ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold">{Number(r.ratePercent).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-muted">{r.effectiveDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {rates.length === 0 && <p className="text-muted">No rates have been published yet.</p>}
      <p className="text-xs text-muted">{t.note}</p>
    </div>
  );
}
