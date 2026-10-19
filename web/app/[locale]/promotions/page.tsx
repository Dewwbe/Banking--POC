import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { Cta } from '@/components/Sections';
import { getPromotions, isLocale, mediaUrl } from '@/lib/strapi';

export default async function PromotionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const promos = await getPromotions(locale);

  return (
    <section>
      <h1 className="mb-6 text-3xl font-bold">Promotions</h1>
      <div className="grid gap-6 md:grid-cols-2">
        {promos.map((p) => (
          <article key={p.slug} className="rounded-xl bg-white p-6 shadow-sm" data-testid={`promo-${p.slug}`}>
            {mediaUrl(p.banner) && <img src={mediaUrl(p.banner)!} alt={p.banner?.alternativeText ?? ''} className="mb-4 rounded" />}
            <h2 className="text-xl font-semibold">{p.title}</h2>
            <p className="mt-1 text-xs text-gray-500">Valid {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}</p>
            <p className="mt-3">{p.summary}</p>
            <div className="mt-3 text-xs text-gray-600"><Blocks content={p.terms} /></div>
            <div className="mt-4"><Cta cta={p.cta} /></div>
          </article>
        ))}
        {promos.length === 0 && <p>No active promotions.</p>}
      </div>
    </section>
  );
}
