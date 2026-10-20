import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { SectionHeading, Sections } from '@/components/Sections';
import { getAbout, isLocale, mediaUrl } from '@/lib/strapi';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const a = await getAbout(locale);
  if (!a) notFound();

  return (
    <>
      <header className="rounded-3xl bg-gradient-to-br from-[#4f2c85] via-brand to-lilac p-8 text-white sm:p-12">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{a.title}</h1>
        {a.mission && <p className="mt-4 max-w-2xl text-xl font-medium">{a.mission}</p>}
      </header>

      {a.introduction?.length > 0 && (
        <section className="rounded-3xl border border-line bg-white p-6 text-lg sm:p-10"><Blocks content={a.introduction} /></section>
      )}

      {a.values?.length > 0 && (
        <section>
          <SectionHeading>What we stand for</SectionHeading>
          <div className="grid gap-5 sm:grid-cols-3">
            {a.values.map((v: any, i: number) => (
              <div key={i} className="rounded-2xl bg-lilac-soft p-6">
                <h3 className="font-bold text-brand-dark">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink">{v.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {a.images?.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {a.images.map((m: any, i: number) => <img key={i} src={mediaUrl(m)!} alt={m.alternativeText ?? ''} className="h-56 w-full rounded-2xl object-cover" />)}
        </div>
      )}
      <Sections sections={a.sections} />
    </>
  );
}
