import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProducts, isLocale } from '@/lib/strapi';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const products = (await getProducts(locale)) ?? [];

  return (
    <section>
      <h1 className="mb-6 text-3xl font-bold">Products</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Link key={p.slug} href={`/${locale}/products/${p.slug}`} className="rounded-lg bg-white p-5 shadow-sm hover:shadow">
            <span className="text-xs uppercase text-gray-500">{p.category?.replace('_', ' ')}</span>
            <h2 className="mt-1 font-semibold">{p.name}</h2>
            {p.interestRate != null && <p className="mt-1 text-xl font-bold text-brand">{p.interestRate}% p.a.</p>}
            <p className="mt-2 text-sm text-gray-600">{p.summary}</p>
          </Link>
        ))}
        {products.length === 0 && <p>No published products in this language.</p>}
      </div>
    </section>
  );
}
