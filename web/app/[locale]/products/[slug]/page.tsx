import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { getProduct, isLocale, mediaUrl } from '@/lib/strapi';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const p = await getProduct(locale, slug);
  return p ? { title: p.seo?.metaTitle ?? p.name, description: p.seo?.metaDescription ?? p.summary } : {};
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const p = await getProduct(locale, slug);
  if (!p) notFound(); // unpublished / draft / wrong locale → 404 (lifecycle tests LC-01, LC-05)

  const hero = mediaUrl(p.heroImage);
  const kfd = mediaUrl(p.keyFactsDocument);
  return (
    <article className="space-y-8">
      <Link href={`/${locale}/products`} className="text-sm font-semibold text-brand hover:underline">← All products</Link>

      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac text-white">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
        <div className={`relative grid items-center gap-8 p-8 sm:p-12 ${hero ? 'md:grid-cols-2' : ''}`}>
          <div>
            {p.category && <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold capitalize">{p.category.replaceAll('_', ' ')}</span>}
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{p.name}</h1>
            {p.summary && <p className="mt-3 max-w-xl text-lg font-medium">{p.summary}</p>}
            {p.interestRate != null && (
              <p className="mt-6 text-6xl font-extrabold" data-testid="interest-rate">
                {p.interestRate}%
                <span className="ml-2 text-base font-medium text-white/90">p.a. {p.rateEffectiveDate && `(effective ${p.rateEffectiveDate})`}</span>
              </p>
            )}
          </div>
          {hero && <img src={hero} alt={p.heroImage?.alternativeText ?? ''} className="max-h-72 w-full rounded-2xl object-cover shadow-xl" />}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {p.description?.length > 0 && (
            <section className="rounded-3xl border border-line bg-white p-6 sm:p-8">
              <h2 className="mb-3 text-xl font-bold text-brand-dark">About this product</h2>
              <Blocks content={p.description} />
            </section>
          )}
          {p.faqs?.length > 0 && (
            <section className="rounded-3xl border border-line bg-white p-6 sm:p-8">
              <h2 className="mb-2 text-xl font-bold text-brand-dark">Frequently asked questions</h2>
              <div className="divide-y divide-line">
                {p.faqs.map((f: any, i: number) => (
                  <details key={i} className="py-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                      {f.question}
                      <span aria-hidden className="faq-chevron grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lilac-soft text-brand transition">⌄</span>
                    </summary>
                    <div className="mt-3 text-muted"><Blocks content={f.answer} /></div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {p.benefits?.length > 0 && (
            <section className="rounded-3xl bg-lilac-soft p-6">
              <h2 className="mb-3 text-lg font-bold text-brand-dark">Key benefits</h2>
              <ul className="space-y-2.5">
                {p.benefits.map((b: any, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-xs text-white">✓</span>
                    {b.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {kfd && (
            <a href={kfd} className="block rounded-2xl border border-line bg-white p-5 font-semibold text-brand shadow-sm hover:border-lilac hover:shadow">
              Key Facts Document (PDF) <span aria-hidden>↓</span>
            </a>
          )}
        </aside>
      </div>

      {p.disclaimer?.length > 0 && (
        <aside className="rounded-2xl border border-line bg-white p-5 text-xs leading-relaxed text-muted">
          <Blocks content={p.disclaimer} />
        </aside>
      )}
    </article>
  );
}
