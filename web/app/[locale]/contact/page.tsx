import { notFound } from 'next/navigation';
import { Sections } from '@/components/Sections';
import { getContact, isLocale } from '@/lib/strapi';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const c = await getContact(locale);
  if (!c) notFound();

  return (
    <>
      <article className="space-y-3 rounded-xl bg-white p-8">
        <h1 className="text-3xl font-bold">{c.title}</h1>
        <p><strong>Hotline:</strong> {c.hotline}</p>
        {c.email && <p><strong>Email:</strong> {c.email}</p>}
        {c.supportHours && <p className="whitespace-pre-line">{c.supportHours}</p>}
        {c.headOfficeAddress && <p className="whitespace-pre-line">{c.headOfficeAddress}</p>}
        <h2 className="pt-4 text-xl font-semibold">Branches</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {(c.branches ?? []).map((b: any, i: number) => (
            <li key={i} className="rounded bg-gray-50 p-4">
              <strong>{b.name}</strong>
              {b.address && <p className="text-sm">{b.address}</p>}
              {b.phone && <p className="text-sm">{b.phone}</p>}
              {b.mapUrl && <a href={b.mapUrl} className="text-sm text-brand underline">Map</a>}
            </li>
          ))}
        </ul>
      </article>
      <Sections sections={c.sections} />
    </>
  );
}
