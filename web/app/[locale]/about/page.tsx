import { notFound } from 'next/navigation';
import { Blocks } from '@/components/Blocks';
import { Sections } from '@/components/Sections';
import { getAbout, isLocale, mediaUrl } from '@/lib/strapi';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const a = await getAbout(locale);
  if (!a) notFound();

  return (
    <>
      <article className="space-y-4 rounded-xl bg-white p-8">
        <h1 className="text-3xl font-bold">{a.title}</h1>
        <Blocks content={a.introduction} />
        {a.mission && <p className="text-lg italic">{a.mission}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          {(a.values ?? []).map((v: any, i: number) => (
            <div key={i} className="rounded bg-gray-50 p-4"><h3 className="font-semibold">{v.title}</h3><p className="text-sm">{v.body}</p></div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(a.images ?? []).map((m: any, i: number) => <img key={i} src={mediaUrl(m)!} alt={m.alternativeText ?? ''} className="rounded" />)}
        </div>
      </article>
      <Sections sections={a.sections} />
    </>
  );
}
