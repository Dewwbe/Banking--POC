import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { Blocks } from '@/components/Blocks';
import { FallbackNotice } from '@/components/FallbackNotice';
import { getNews, isLocale, mediaUrl } from '@/lib/strapi';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const n = await getNews(locale, slug);
  if (!n) return {};
  return buildMetadata({ locale, path: `/news/${slug}`, title: n.title, description: n.excerpt, seo: n.seo, image: n.coverImage, type: 'article', fallbackFrom: n._fallbackFrom });
}

export default async function NewsArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const n = await getNews(locale, slug);
  if (!n) notFound();
  const cover = mediaUrl(n.coverImage);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <FallbackNotice locale={locale} from={n._fallbackFrom} />
      <Link href={`/${locale}/news`} className="text-sm font-semibold text-brand hover:underline">← All news</Link>
      <div className="rounded-3xl border border-line bg-white p-6 sm:p-10">
        <time className="text-sm text-muted">{n.publicationDate}</time>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-dark sm:text-4xl">{n.title}</h1>
        {cover && <img src={cover} alt={n.coverImage?.alternativeText ?? ''} className="mt-6 w-full rounded-2xl" />}
        <div className="mt-6"><Blocks content={n.body} /></div>
      </div>
    </article>
  );
}
