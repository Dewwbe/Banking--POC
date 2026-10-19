import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Banner, Sections } from '@/components/Sections';
import { getHome, isLocale } from '@/lib/strapi';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const home = await getHome(locale);
  if (!home) return <p>Home page has not been published in this language yet.</p>;

  return (
    <>
      <Banner banner={home.hero} />
      {home.featuredProducts?.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2">
          {home.featuredProducts.map((p: any) => (
            <Link key={p.slug} href={`/${locale}/products/${p.slug}`} className="rounded-lg bg-white p-5 shadow-sm hover:shadow">
              <h3 className="font-semibold">{p.name}</h3>
              {p.interestRate != null && <p className="mt-1 text-2xl font-bold text-brand">{p.interestRate}% p.a.</p>}
              <p className="mt-2 text-sm text-gray-600">{p.summary}</p>
            </Link>
          ))}
        </section>
      )}
      <Sections sections={home.sections} />
    </>
  );
}
