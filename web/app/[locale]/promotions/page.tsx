import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { CtaSolid } from '@/components/Sections';
import { getPromotions, isLocale, mediaUrl } from '@/lib/strapi';

export default async function PromotionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const promos = await getPromotions(locale);

  return (
    <div className="space-y-8">
      <header className="rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac p-8 text-white sm:p-12">
        <h1 className="text-4xl font-extrabold tracking-tight">Promotions</h1>
        <p className="mt-3 max-w-2xl text-lg font-medium">Limited-time offers. Each one is live only between its start and end dates.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {promos.map((p) => (
          <article key={p.slug} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm" data-testid={`promo-${p.slug}`}>
            {mediaUrl(p.banner) && <img src={mediaUrl(p.banner)!} alt={p.banner?.alternativeText ?? ''} className="h-48 w-full object-cover" />}
            <div className="flex flex-1 flex-col p-6">
              <span className="w-fit rounded-full bg-lilac-soft px-3 py-1 text-xs font-semibold text-brand-dark">
                Valid {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}
              </span>
              <h2 className="mt-3 text-xl font-bold">{p.title}</h2>
              <p className="mt-2 text-muted">{p.summary}</p>
              <div className="mt-4 text-xs text-muted"><Blocks content={p.terms} /></div>
              <div className="mt-auto pt-5"><CtaSolid cta={p.cta} /></div>
            </div>
          </article>
        ))}
        {promos.length === 0 && <p className="text-muted">No active promotions.</p>}
      </div>
    </div>
  );
}
