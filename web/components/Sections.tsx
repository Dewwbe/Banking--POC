import Link from 'next/link';
import { Blocks } from './Blocks';
import { mediaUrl } from '@/lib/strapi';

/** Renders reusable Strapi components (Banner, Card group, FAQ group, CTA block, Rich text, Legal notice). */

export function Cta({ cta }: { cta?: any }) {
  if (!cta) return null;
  const style =
    cta.variant === 'secondary' ? 'border-2 border-white/80 text-white hover:bg-white/15'
    : cta.variant === 'link' ? 'px-0 text-brand hover:underline'
    : 'bg-white text-brand-dark hover:bg-lilac-soft';
  const link = cta.variant === 'link';
  return (
    <Link href={cta.url} target={cta.openInNewTab ? '_blank' : undefined}
      className={`inline-flex items-center gap-1 font-semibold transition ${link ? '' : 'rounded-full px-6 py-2.5'} ${style}`}>
      {cta.label}{link && <span aria-hidden>→</span>}
    </Link>
  );
}

/** Solid button for use on white backgrounds (promotion cards, product pages). */
export function CtaSolid({ cta }: { cta?: any }) {
  if (!cta) return null;
  return (
    <Link href={cta.url} target={cta.openInNewTab ? '_blank' : undefined}
      className="inline-flex items-center rounded-full bg-brand px-6 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
      {cta.label}
    </Link>
  );
}

export function SectionHeading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold tracking-tight text-brand-dark sm:text-3xl">{children}</h2>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </div>
  );
}

export function Banner({ banner }: { banner: any }) {
  const img = mediaUrl(banner?.image);
  const light = banner?.theme === 'light';
  return (
    <section className={`relative overflow-hidden rounded-3xl ${light ? 'border border-line bg-white text-ink' : 'bg-gradient-to-br from-[#4f2c85] via-brand to-lilac text-white'}`}>
      {!light && (
        <>
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-32 right-32 h-72 w-72 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-black/10" />
        </>
      )}
      <div className={`relative grid items-center gap-8 p-8 sm:p-12 ${img ? 'md:grid-cols-2' : ''}`}>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{banner?.heading}</h1>
          {banner?.subheading && <p className={`mt-4 max-w-xl text-lg font-medium ${light ? 'text-muted' : 'text-white'}`}>{banner.subheading}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            {(banner?.cta ?? []).map((c: any, i: number) => (light ? <CtaSolid key={i} cta={c} /> : <Cta key={i} cta={c} />))}
          </div>
        </div>
        {img && (
          <img src={img} alt={banner.imageAlt ?? banner.image?.alternativeText ?? ''}
            className="max-h-80 w-full rounded-2xl object-cover shadow-xl" />
        )}
      </div>
    </section>
  );
}

export function ProductCard({ p, locale }: { p: any; locale: string }) {
  return (
    <Link href={`/${locale}/products/${p.slug}`}
      className="group flex flex-col rounded-2xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-lilac hover:shadow-lg">
      {p.category && (
        <span className="mb-3 w-fit rounded-full bg-lilac-soft px-3 py-1 text-xs font-semibold capitalize text-brand-dark">
          {p.category.replaceAll('_', ' ')}
        </span>
      )}
      <h3 className="text-lg font-bold text-ink">{p.name}</h3>
      {p.interestRate != null && (
        <p className="mt-2 text-3xl font-extrabold text-brand">
          {p.interestRate}%<span className="ml-1 text-sm font-medium text-muted">p.a.</span>
        </p>
      )}
      {p.summary && <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.summary}</p>}
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        Learn more <span aria-hidden className="transition group-hover:translate-x-1">→</span>
      </span>
    </Link>
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
                {s.heading && <SectionHeading>{s.heading}</SectionHeading>}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {(s.cards ?? []).map((c: any, j: number) => (
                    <article key={j} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                      {mediaUrl(c.image) && <img src={mediaUrl(c.image)!} alt={c.imageAlt ?? ''} className="h-44 w-full object-cover" />}
                      <div className="p-6">
                        <h3 className="text-lg font-bold">{c.title}</h3>
                        {c.body && <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>}
                        {c.link && <div className="mt-4"><Cta cta={{ ...c.link, variant: 'link' }} /></div>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          case 'sections.faq-group':
            return (
              <section key={i} className="rounded-3xl border border-line bg-white p-6 sm:p-10">
                {s.heading && <SectionHeading>{s.heading}</SectionHeading>}
                <div className="divide-y divide-line">
                  {(s.items ?? []).map((f: any, j: number) => (
                    <details key={j} className="py-4">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                        {f.question}
                        <span aria-hidden className="faq-chevron grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lilac-soft text-brand transition">⌄</span>
                      </summary>
                      <div className="mt-3 text-muted"><Blocks content={f.answer} /></div>
                    </details>
                  ))}
                </div>
              </section>
            );
          case 'sections.cta-block':
            return (
              <section key={i} className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-dark to-brand p-8 text-white sm:p-12">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
                <h2 className="relative text-2xl font-bold sm:text-3xl">{s.heading}</h2>
                {s.text && <p className="relative mt-2 max-w-2xl text-white/90">{s.text}</p>}
                <div className="relative mt-6"><Cta cta={s.cta} /></div>
              </section>
            );
          case 'sections.rich-text':
            return <section key={i} className="rounded-3xl border border-line bg-white p-6 sm:p-10"><Blocks content={s.body} /></section>;
          case 'sections.legal-notice':
            return (
              <section key={i} className="rounded-2xl border border-line bg-lilac-soft/60 p-6 text-sm text-ink">
                <h2 className="mb-2 font-semibold text-brand-dark">{s.title}</h2>
                <Blocks content={s.body} />
                {mediaUrl(s.document) && <a href={mediaUrl(s.document)!} className="mt-3 inline-block font-semibold text-brand hover:underline">Download PDF</a>}
              </section>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
