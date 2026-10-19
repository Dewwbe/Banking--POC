import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNewsList, isLocale } from '@/lib/strapi';

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const items = (await getNewsList(locale)) ?? [];

  return (
    <section>
      <h1 className="mb-6 text-3xl font-bold">News</h1>
      <ul className="space-y-4">
        {items.map((n) => (
          <li key={n.slug} className="rounded-lg bg-white p-5 shadow-sm">
            <span className="text-xs text-gray-500">{n.publicationDate} · {n.category?.replace('_', ' ')}</span>
            <h2 className="mt-1 font-semibold"><Link href={`/${locale}/news/${n.slug}`} className="hover:text-brand">{n.title}</Link></h2>
            <p className="mt-1 text-sm text-gray-600">{n.excerpt}</p>
          </li>
        ))}
        {items.length === 0 && <li>No published news in this language.</li>}
      </ul>
    </section>
  );
}
