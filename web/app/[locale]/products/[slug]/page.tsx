import type { Metadata } from 'next';
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
    <article className="space-y-6 rounded-xl bg-white p-8">
      {hero && <img src={hero} alt={p.heroImage?.alternativeText ?? ''} className="max-h-72 w-full rounded object-cover" />}
      <h1 className="text-3xl font-bold">{p.name}</h1>
      {p.interestRate != null && (
        <p className="text-4xl font-bold text-brand" data-testid="interest-rate">
          {p.interestRate}% <span className="text-base font-normal text-gray-600">p.a. {p.rateEffectiveDate && `(effective ${p.rateEffectiveDate})`}</span>
        </p>
      )}
      <Blocks content={p.description} />
      {p.benefits?.length > 0 && (
        <ul className="list-disc pl-6">{p.benefits.map((b: any, i: number) => <li key={i}>{b.text}</li>)}</ul>
      )}
      {p.faqs?.map((f: any, i: number) => (
        <details key={i} className="border-b py-2">
          <summary className="cursor-pointer font-medium">{f.question}</summary>
          <Blocks content={f.answer} />
        </details>
      ))}
      {kfd && <a href={kfd} className="inline-block text-brand underline">Key Facts Document (PDF)</a>}
      <aside className="rounded border border-amber-300 bg-amber-50 p-4 text-sm"><Blocks content={p.disclaimer} /></aside>
    </article>
  );
}
