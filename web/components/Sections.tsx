import Link from 'next/link';
import { Blocks } from './Blocks';
import { mediaUrl } from '@/lib/strapi';

/** Renders reusable Strapi components (Banner, Card group, FAQ group, CTA block, Rich text, Legal notice). */

export function Cta({ cta }: { cta?: any }) {
  if (!cta) return null;
  const style =
    cta.variant === 'secondary' ? 'border border-brand text-brand bg-white'
    : cta.variant === 'link' ? 'text-brand underline'
    : 'bg-accent text-brand-dark';
  return (
    <Link href={cta.url} target={cta.openInNewTab ? '_blank' : undefined} className={`inline-block rounded px-4 py-2 font-medium ${style}`}>
      {cta.label}
    </Link>
  );
}

export function Banner({ banner }: { banner: any }) {
  const img = mediaUrl(banner?.image);
  return (
    <section className={`rounded-xl p-10 ${banner?.theme === 'light' ? 'bg-white' : 'bg-brand text-white'}`}>
      {img && <img src={img} alt={banner.imageAlt ?? banner.image?.alternativeText ?? ''} className="mb-6 max-h-64 rounded object-cover" />}
      <h1 className="text-3xl font-bold">{banner?.heading}</h1>
      {banner?.subheading && <p className="mt-3 text-lg opacity-90">{banner.subheading}</p>}
      <div className="mt-6 flex gap-3">{(banner?.cta ?? []).map((c: any, i: number) => <Cta key={i} cta={c} />)}</div>
    </section>
  );
}

export function Sections({ sections }: { sections?: any[] }) {
  return (
    <>
      {(sections ?? []).map((s, i) => {
        switch (s.__component) {
          case 'shared.banner':
            return <Banner key={i} banner={s} />;
          case 'sections.card-group':
            return (
              <section key={i}>
                {s.heading && <h2 className="mb-4 text-2xl font-semibold">{s.heading}</h2>}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(s.cards ?? []).map((c: any, j: number) => (
                    <article key={j} className="rounded-lg bg-white p-5 shadow-sm">
                      {mediaUrl(c.image) && <img src={mediaUrl(c.image)!} alt={c.imageAlt ?? ''} className="mb-3 rounded" />}
                      <h3 className="font-semibold">{c.title}</h3>
                      {c.body && <p className="mt-2 text-sm text-gray-600">{c.body}</p>}
                      {c.link && <div className="mt-3"><Cta cta={{ ...c.link, variant: 'link' }} /></div>}
                    </article>
                  ))}
                </div>
              </section>
            );
          case 'sections.faq-group':
            return (
              <section key={i} className="rounded-lg bg-white p-6">
                {s.heading && <h2 className="mb-4 text-2xl font-semibold">{s.heading}</h2>}
                {(s.items ?? []).map((f: any, j: number) => (
                  <details key={j} className="border-b py-3">
                    <summary className="cursor-pointer font-medium">{f.question}</summary>
                    <div className="mt-2 text-gray-700"><Blocks content={f.answer} /></div>
                  </details>
                ))}
              </section>
            );
          case 'sections.cta-block':
            return (
              <section key={i} className="rounded-lg bg-brand-dark p-8 text-white">
                <h2 className="text-2xl font-semibold">{s.heading}</h2>
                {s.text && <p className="mt-2">{s.text}</p>}
                <div className="mt-4"><Cta cta={s.cta} /></div>
              </section>
            );
          case 'sections.rich-text':
            return <section key={i} className="rounded-lg bg-white p-6"><Blocks content={s.body} /></section>;
          case 'sections.legal-notice':
            return (
              <section key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm">
                <h2 className="mb-2 font-semibold">{s.title}</h2>
                <Blocks content={s.body} />
                {mediaUrl(s.document) && <a href={mediaUrl(s.document)!} className="mt-2 inline-block text-brand underline">Download PDF</a>}
              </section>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
