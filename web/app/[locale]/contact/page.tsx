import { notFound } from 'next/navigation';
import { SectionHeading, Sections } from '@/components/Sections';
import { getContact, isLocale } from '@/lib/strapi';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const c = await getContact(locale);
  if (!c) notFound();

  return (
    <>
      <header className="rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac p-8 text-white sm:p-12">
        <h1 className="text-4xl font-extrabold tracking-tight">{c.title}</h1>
        <p className="mt-3 text-lg font-medium">We are here to help.</p>
      </header>

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hotline</p>
          <p className="mt-1 text-2xl font-extrabold text-brand">{c.hotline}</p>
          {c.email && <p className="mt-3 text-sm"><a href={`mailto:${c.email}`} className="font-semibold text-brand hover:underline">{c.email}</a></p>}
        </div>
        {c.supportHours && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Support hours</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{c.supportHours}</p>
          </div>
        )}
        {c.headOfficeAddress && (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Head office</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{c.headOfficeAddress}</p>
          </div>
        )}
      </section>

      {c.branches?.length > 0 && (
        <section>
          <SectionHeading>Branches</SectionHeading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.branches.map((b: any, i: number) => (
              <li key={i} className="rounded-2xl bg-lilac-soft p-5">
                <strong className="text-brand-dark">{b.name}</strong>
                {b.address && <p className="mt-1 text-sm">{b.address}</p>}
                {b.phone && <p className="text-sm">{b.phone}</p>}
                {b.mapUrl && <a href={b.mapUrl} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">View map →</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Sections sections={c.sections} />
    </>
  );
}
