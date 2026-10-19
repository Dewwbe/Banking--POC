import type { ReactNode } from 'react';

/** Minimal renderer for Strapi 5 "blocks" rich text (paragraph, heading, list, quote, link, bold/italic). */
type Node = { type: string; text?: string; bold?: boolean; italic?: boolean; underline?: boolean; url?: string; level?: number; format?: string; children?: Node[] };

function inline(nodes: Node[] = []): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === 'link') return <a key={i} href={n.url} className="text-brand underline">{inline(n.children)}</a>;
    let el: ReactNode = n.text ?? '';
    if (n.bold) el = <strong>{el}</strong>;
    if (n.italic) el = <em>{el}</em>;
    if (n.underline) el = <u>{el}</u>;
    return <span key={i}>{el}</span>;
  });
}

export function Blocks({ content }: { content?: Node[] | null }) {
  if (!content?.length) return null;
  return (
    <div className="space-y-3 leading-relaxed">
      {content.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const H = `h${Math.min(Math.max(b.level ?? 2, 2), 4)}` as 'h2' | 'h3' | 'h4';
            return <H key={i} className="font-semibold text-lg">{inline(b.children)}</H>;
          }
          case 'list': {
            const L = b.format === 'ordered' ? 'ol' : 'ul';
            return <L key={i} className={b.format === 'ordered' ? 'list-decimal pl-6' : 'list-disc pl-6'}>{b.children?.map((li, j) => <li key={j}>{inline(li.children)}</li>)}</L>;
          }
          case 'quote':
            return <blockquote key={i} className="border-l-4 border-brand pl-4 italic">{inline(b.children)}</blockquote>;
          default:
            return <p key={i}>{inline(b.children)}</p>;
        }
      })}
    </div>
  );
}
