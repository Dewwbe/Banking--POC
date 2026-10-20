import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNewsList, isLocale } from '@/lib/strapi';

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const items = (await getNewsList(locale)) ?? [];

  return (
    <div className="space-y-8">
      <header className="rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac p-8 text-white sm:p-12">
        <h1 className="text-4xl font-extrabold tracking-tight">News</h1>
        <p className="mt-3 max-w-2xl text-lg font-medium">The latest announcements and updates from PoC Bank.</p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {items.map((n) => (
          <Link key={n.slug} href={`/${locale}/news/${n.slug}`}
            className="group rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-lilac hover:shadow-lg">
            <div className="flex items-center gap-3 text-xs">
              {n.category && <span className="rounded-full bg-lilac-soft px-3 py-1 font-semibold capitalize text-brand-dark">{n.category.replaceAll('_', ' ')}</span>}
              <time className="text-muted">{n.publicationDate}</time>
            </div>
            <h2 className="mt-3 text-lg font-bold group-hover:text-brand">{n.title}</h2>
            {n.excerpt && <p className="mt-2 text-sm leading-relaxed text-muted">{n.excerpt}</p>}
            <span className="mt-4 inline-block text-sm font-semibold text-brand">Read more →</span>
          </Link>
        ))}
        {items.length === 0 && <p className="text-muted">No published news in this language.</p>}
      </div>
    </div>
  );
}
