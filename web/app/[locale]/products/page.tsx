import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/Sections';
import { getProducts, isLocale } from '@/lib/strapi';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const products = (await getProducts(locale)) ?? [];

  // Group by category, keeping the API's name order inside each group.
  const groups = new Map<string, any[]>();
  for (const p of products) {
    const key = p.category ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  return (
    <div className="space-y-10">
      <header className="rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac p-8 text-white sm:p-12">
        <h1 className="text-4xl font-extrabold tracking-tight">Products</h1>
        <p className="mt-3 max-w-2xl text-lg font-medium">Savings, deposits and everyday banking designed around you.</p>
      </header>

      {[...groups.entries()].map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-4 text-xl font-bold capitalize text-brand-dark">{category.replaceAll('_', ' ')}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => <ProductCard key={p.slug} p={p} locale={locale} />)}
          </div>
        </section>
      ))}
      {products.length === 0 && <p className="text-muted">No published products in this language.</p>}
    </div>
  );
}
