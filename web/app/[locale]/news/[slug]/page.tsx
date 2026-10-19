import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { getNews, isLocale, mediaUrl } from '@/lib/strapi';

export default async function NewsArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const n = await getNews(locale, slug);
  if (!n) notFound();
  const cover = mediaUrl(n.coverImage);

  return (
    <article className="space-y-4 rounded-xl bg-white p-8">
      <span className="text-xs text-gray-500">{n.publicationDate}</span>
      <h1 className="text-3xl font-bold">{n.title}</h1>
      {cover && <img src={cover} alt={n.coverImage?.alternativeText ?? ''} className="rounded" />}
      <Blocks content={n.body} />
    </article>
  );
}
