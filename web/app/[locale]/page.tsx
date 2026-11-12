import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Banner, ProductCard, SectionHeading, Sections } from '@/components/Sections';
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { Banners } from '@/components/Banners';
import { FallbackNotice } from '@/components/FallbackNotice';
import { getHome, isLocale } from '@/lib/strapi';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const h = await getHome(locale);
  return buildMetadata({ locale, path: '', title: h?.title, seo: h?.seo, fallbackFrom: h?._fallbackFrom });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const home = await getHome(locale);
  if (!home) return <p>Home page has not been published in this language yet.</p>;

  return (
    <>
      <FallbackNotice locale={locale} from={home._fallbackFrom} />
      <Banners locale={locale} placement="home_top" />
      <Banner banner={home.hero} />
      {home.featuredProducts?.length > 0 && (
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <SectionHeading>Featured products</SectionHeading>
            <Link href={`/${locale}/products`} className="mb-6 text-sm font-semibold text-brand hover:underline">View all →</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {home.featuredProducts.map((p: any) => <ProductCard key={p.slug} p={p} locale={locale} />)}
          </div>
        </section>
      )}
      <Banners locale={locale} placement="home_secondary" />
      <Sections sections={home.sections} />
    </>
  );
}
