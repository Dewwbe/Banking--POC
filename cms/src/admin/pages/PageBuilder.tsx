import * as React from 'react';
import { Box, Button, Field, Flex, Loader, SingleSelect, SingleSelectOption, Textarea, TextInput, Typography } from '@strapi/design-system';
import { Layouts, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Link } from 'react-router-dom';

/**
 * Drag-and-drop page builder (custom admin page — Strapi Community has no visual builder).
 *
 * Edits the `sections` dynamic zone of Home / About Us / Contact Us:
 *   palette (left)  →  drag a block onto the canvas
 *   canvas (centre) →  drag blocks to reorder, click one to select it
 *   inspector (right) → edit the selected block's text fields
 *
 * It saves through the Content Manager API (PUT /content-manager/single-types/...), i.e. exactly the same path as the
 * normal edit screen, so RBAC, the approval workflow (an edit resets the stage to Draft), and the audit log all apply.
 * Only `sections` is sent; hero, SEO and workflow fields are never touched. Images/PDFs inside blocks are preserved
 * but not editable here (use the Content Manager for media).
 */

type Field = { key: string; label: string; kind: 'text' | 'textarea' | 'blocks' | 'select'; options?: string[] };
type ListSpec = { key: string; label: string; item: string; fields: Field[]; max?: number };
type Spec = {
  uid: string;
  label: string;
  hint: string;
  fields: Field[];
  /** one nested object, e.g. the CTA of a CTA block */
  object?: { key: string; label: string; fields: Field[] };
  list?: ListSpec;
  empty: () => Record<string, any>;
};

const CTA_FIELDS: Field[] = [
  { key: 'label', label: 'Button label', kind: 'text' },
  { key: 'url', label: 'Link URL', kind: 'text' },
  { key: 'variant', label: 'Style', kind: 'select', options: ['primary', 'secondary', 'link'] },
];

const SPECS: Spec[] = [
  {
    uid: 'shared.banner',
    label: 'Banner',
    hint: 'Hero / promotional banner',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text' },
      { key: 'subheading', label: 'Subheading', kind: 'textarea' },
      { key: 'theme', label: 'Theme', kind: 'select', options: ['light', 'dark', 'brand'] },
    ],
    list: { key: 'cta', label: 'Buttons', item: 'Button', fields: CTA_FIELDS, max: 2 },
    empty: () => ({ heading: 'New banner', subheading: '', theme: 'brand', cta: [] }),
  },
  {
    uid: 'sections.card-group',
    label: 'Card group',
    hint: 'Heading and a grid of cards',
    fields: [{ key: 'heading', label: 'Heading', kind: 'text' }],
    list: {
      key: 'cards', label: 'Cards', item: 'Card', max: 6,
      fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }],
    },
    empty: () => ({ heading: 'New card group', cards: [{ title: 'Card title', body: '' }] }),
  },
  {
    uid: 'sections.faq-group',
    label: 'FAQ group',
    hint: 'Heading and questions',
    fields: [{ key: 'heading', label: 'Heading', kind: 'text' }],
    list: {
      key: 'items', label: 'Questions', item: 'Question',
      fields: [{ key: 'question', label: 'Question', kind: 'text' }, { key: 'answer', label: 'Answer', kind: 'blocks' }],
    },
    empty: () => ({ heading: 'Frequently asked questions', items: [{ question: 'New question', answer: textToBlocks('Answer') }] }),
  },
  {
    uid: 'sections.cta-block',
    label: 'CTA block',
    hint: 'Heading, text and a button',
    fields: [{ key: 'heading', label: 'Heading', kind: 'text' }, { key: 'text', label: 'Text', kind: 'textarea' }],
    object: { key: 'cta', label: 'Button', fields: CTA_FIELDS },
    empty: () => ({ heading: 'New call to action', text: '', cta: { label: 'Learn more', url: '/', variant: 'primary' } }),
  },
  {
    uid: 'sections.rich-text',
    label: 'Rich text',
    hint: 'Free text section',
    fields: [{ key: 'body', label: 'Text', kind: 'blocks' }],
    empty: () => ({ body: textToBlocks('New text section') }),
  },
  {
    uid: 'sections.legal-notice',
    label: 'Legal notice',
    hint: 'Regulatory notice',
    fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Notice text', kind: 'blocks' }],
    empty: () => ({ title: 'Regulatory notice', body: textToBlocks('Notice text') }),
  },
];

const specOf = (uid: string) => SPECS.find((s) => s.uid === uid);

const PAGES = [
  { uid: 'api::home.home', label: 'Home' },
  { uid: 'api::about-us.about-us', label: 'About Us' },
  { uid: 'api::contact-us.contact-us', label: 'Contact Us' },
];
const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'si', label: 'Sinhala' },
  { code: 'ta', label: 'Tamil' },
];

/* ---------- blocks (rich text JSON) <-> plain text ---------- */
function textToBlocks(text: string) {
  const paras = text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
  return (paras.length ? paras : ['']).map((t) => ({ type: 'paragraph', children: [{ type: 'text', text: t }] }));
}
const isPlainBlocks = (v: any) =>
  Array.isArray(v) && v.every((b) => b?.type === 'paragraph' && (b.children ?? []).every((c: any) => c.type === 'text' && !c.bold && !c.italic && !c.underline && !c.strikethrough && !c.code));
const blocksToText = (v: any) => (v ?? []).map((b: any) => (b.children ?? []).map((c: any) => c.text ?? '').join('')).join('\n\n');
function plainText(v: any): string {
  return typeof v === 'string' ? v : Array.isArray(v) ? blocksToText(v) : '';
}

/** Turn a Content Manager response into something safe to send back: media objects become ids. */
function sanitize(v: any): any {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') {
    if ('mime' in v && 'url' in v) return v.id;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)]));
  }
  return v;
}

let keySeed = 0;
const withKey = (b: any) => ({ ...b, _k: b._k ?? `k${++keySeed}` });
const stripKey = ({ _k, ...rest }: any) => rest;

/* ---------- canvas preview of a block ---------- */
const THEMES: Record<string, { bg: string; fg: string }> = {
  brand: { bg: '#4945ff', fg: '#fff' },
  dark: { bg: '#212134', fg: '#fff' },
  light: { bg: '#f6f6f9', fg: '#32324d' },
};

function Preview({ block }: { block: any }) {
  const uid = block.__component;
  if (uid === 'shared.banner') {
    const t = THEMES[block.theme] ?? THEMES.brand;
    return (
      <div style={{ background: t.bg, color: t.fg, padding: 24, borderRadius: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{block.heading || 'Banner'}</div>
        {block.subheading && <div style={{ opacity: 0.85, marginTop: 6 }}>{block.subheading}</div>}
        <div style={{ marginTop: 10 }}>{(block.cta ?? []).map((c: any, i: number) => <span key={i} style={{ border: '1px solid currentColor', borderRadius: 20, padding: '2px 12px', marginRight: 8, fontSize: 13 }}>{c.label}</span>)}</div>
      </div>
    );
  }
  if (uid === 'sections.card-group') {
    return (
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{block.heading}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
          {(block.cards ?? []).map((c: any, i: number) => (
            <div key={i} style={{ border: '1px solid #dcdce4', borderRadius: 4, padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{c.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (uid === 'sections.faq-group') {
    return (
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{block.heading}</div>
        {(block.items ?? []).map((q: any, i: number) => <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #eaeaef' }}>▸ {q.question}</div>)}
      </div>
    );
  }
  if (uid === 'sections.cta-block') {
    return (
      <div style={{ background: '#f0f0ff', padding: 20, borderRadius: 4, textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>{block.heading}</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>{block.text}</div>
        <span style={{ display: 'inline-block', marginTop: 8, background: '#4945ff', color: '#fff', borderRadius: 20, padding: '3px 14px', fontSize: 13 }}>{block.cta?.label}</span>
      </div>
    );
  }
  if (uid === 'sections.legal-notice') {
    return (
      <div style={{ border: '1px dashed #a5a5ba', padding: 12, borderRadius: 4 }}>
        <div style={{ fontWeight: 700 }}>{block.title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{plainText(block.body).slice(0, 160)}</div>
      </div>
    );
  }
  return <div>{plainText(block.body).slice(0, 240)}</div>;
}

/* ---------- inspector field ---------- */
const Labeled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Field.Root>
    <Field.Label>{label}</Field.Label>
    {children}
  </Field.Root>
);

function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  if (field.kind === 'select') {
    return (
      <Labeled label={field.label}>
        <SingleSelect value={value ?? field.options?.[0]} onChange={(v: any) => onChange(v)}>
          {field.options!.map((o) => <SingleSelectOption key={o} value={o}>{o}</SingleSelectOption>)}
        </SingleSelect>
      </Labeled>
    );
  }
  if (field.kind === 'blocks') {
    if (!isPlainBlocks(value)) {
      return <Typography variant="pi" textColor="neutral600">{field.label}: contains rich formatting (links, lists, bold…). Edit it in the Content Manager to keep the formatting.</Typography>;
    }
    return <Labeled label={field.label}><Textarea value={blocksToText(value)} onChange={(e: any) => onChange(textToBlocks(e.target.value))} /></Labeled>;
  }
  if (field.kind === 'textarea') return <Labeled label={field.label}><Textarea value={value ?? ''} onChange={(e: any) => onChange(e.target.value)} /></Labeled>;
  return <Labeled label={field.label}><TextInput value={value ?? ''} onChange={(e: any) => onChange(e.target.value)} /></Labeled>;
}

const DND = 'application/x-page-builder';

export const PageBuilder = () => {
  const { get, put } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [page, setPage] = React.useState(PAGES[0].uid);
  const [locale, setLocale] = React.useState('en');
  const [blocks, setBlocks] = React.useState<any[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data }: any = await get(`/content-manager/single-types/${page}`, { params: { locale } });
      setBlocks((data?.data?.sections ?? []).map(withKey));
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) setBlocks([]); // this locale has no version yet — saving creates it
      else { setBlocks([]); setError(status === 403 ? 'You do not have permission to open this page.' : 'Could not load the page.'); }
    }
    setSelected(null);
    setDirty(false);
    setLoading(false);
  }, [get, page, locale]);

  React.useEffect(() => {
    load();
  }, [load]);

  const guard = (fn: () => void) => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    fn();
  };

  const edit = (next: any[]) => { setBlocks(next); setDirty(true); };
  const insertAt = (index: number, uid: string) => {
    const spec = specOf(uid)!;
    const b = withKey({ __component: uid, ...spec.empty() });
    const next = [...blocks];
    next.splice(index, 0, b);
    edit(next);
    setSelected(b._k);
  };
  const move = (from: number, to: number) => {
    if (from === to || from + 1 === to) return;
    const next = [...blocks];
    const [b] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, b);
    edit(next);
  };
  const update = (k: string, patch: Record<string, any>) => edit(blocks.map((b) => (b._k === k ? { ...b, ...patch } : b)));
  const remove = (k: string) => { edit(blocks.filter((b) => b._k !== k)); if (selected === k) setSelected(null); };
  const duplicate = (i: number) => {
    const { id, ...copy } = blocks[i];
    const b = withKey({ ...copy, _k: undefined });
    const next = [...blocks];
    next.splice(i + 1, 0, b);
    edit(next);
    setSelected(b._k);
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(null);
    const raw = e.dataTransfer.getData(DND);
    if (!raw) return;
    const { type, value } = JSON.parse(raw);
    if (type === 'new') insertAt(index, value);
    else if (type === 'move') move(blocks.findIndex((b) => b._k === value), index);
  };

  const save = async () => {
    setSaving(true);
    try {
      await put(`/content-manager/single-types/${page}`, { sections: blocks.map((b) => sanitize(stripKey(b))) }, { params: { locale } });
      toggleNotification({ type: 'success', message: 'Page saved as a draft. Submit it for review from the Content Manager.' });
      await load();
    } catch (e: any) {
      toggleNotification({ type: 'danger', message: e?.response?.data?.error?.message ?? 'Saving failed' });
    }
    setSaving(false);
  };

  const sel = blocks.find((b) => b._k === selected);
  const selSpec = sel && specOf(sel.__component);
  const dropZone = (index: number) => (
    <div
      onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
      onDragLeave={() => setOverIndex((o) => (o === index ? null : o))}
      onDrop={(e) => onDrop(e, index)}
      style={{ height: overIndex === index ? 36 : 10, margin: '2px 0', borderRadius: 4, transition: 'height .1s', background: overIndex === index ? '#d9d8ff' : 'transparent', border: overIndex === index ? '2px dashed #4945ff' : '2px dashed transparent' }}
    />
  );

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Page Builder"
        subtitle="Drag blocks onto the page, drag to reorder, click a block to edit it. Saving creates a draft; the approval workflow still applies."
        primaryAction={<Button onClick={save} loading={saving} disabled={!dirty || loading}>Save draft</Button>}
        secondaryAction={
          <Link to={`/content-manager/single-types/${page}?plugins[i18n][locale]=${locale}`} style={{ color: 'inherit' }}>
            <Typography variant="omega">Open in Content Manager (submit for review)</Typography>
          </Link>
        }
      />
      <Layouts.Content>
        <Flex gap={4} paddingBottom={4}>
          <Box width="220px">
            <Labeled label="Page">
              <SingleSelect value={page} onChange={(v: any) => guard(() => setPage(String(v)))}>
                {PAGES.map((p) => <SingleSelectOption key={p.uid} value={p.uid}>{p.label}</SingleSelectOption>)}
              </SingleSelect>
            </Labeled>
          </Box>
          <Box width="220px">
            <Labeled label="Language">
              <SingleSelect value={locale} onChange={(v: any) => guard(() => setLocale(String(v)))}>
                {LOCALES.map((l) => <SingleSelectOption key={l.code} value={l.code}>{l.label}</SingleSelectOption>)}
              </SingleSelect>
            </Labeled>
          </Box>
          {dirty && <Typography variant="pi" textColor="warning600">Unsaved changes</Typography>}
        </Flex>

        <Flex alignItems="flex-start" gap={4}>
          {/* palette */}
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} width="220px" style={{ flexShrink: 0 }}>
            <Typography variant="delta" tag="h2">Blocks</Typography>
            <Box paddingTop={1} paddingBottom={3}><Typography variant="pi" textColor="neutral600">Drag onto the page, or click to add at the end.</Typography></Box>
            {SPECS.map((s) => (
              <div
                key={s.uid}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DND, JSON.stringify({ type: 'new', value: s.uid })); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => insertAt(blocks.length, s.uid)}
                style={{ cursor: 'grab', border: '1px solid #dcdce4', borderRadius: 4, padding: '8px 10px', marginBottom: 8, background: '#fff' }}
              >
                <div style={{ fontWeight: 600 }}>⠿ {s.label}</div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>{s.hint}</div>
              </div>
            ))}
          </Box>

          {/* canvas */}
          <Box background="neutral100" hasRadius padding={4} style={{ flex: 1, minHeight: 400 }}>
            {loading ? <Loader small /> : error ? <Typography textColor="danger600">{error}</Typography> : (
              <>
                {blocks.length === 0 && <Typography textColor="neutral600">This page has no blocks yet. Drag one here.</Typography>}
                {dropZone(0)}
                {blocks.map((b, i) => {
                  const spec = specOf(b.__component);
                  return (
                    <React.Fragment key={b._k}>
                      <div
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData(DND, JSON.stringify({ type: 'move', value: b._k })); e.dataTransfer.effectAllowed = 'move'; }}
                        onClick={() => setSelected(b._k)}
                        style={{ background: '#fff', borderRadius: 4, padding: 12, border: selected === b._k ? '2px solid #4945ff' : '2px solid transparent', boxShadow: '0 1px 4px rgba(33,33,52,.1)', cursor: 'grab' }}
                      >
                        <Flex justifyContent="space-between" paddingBottom={2}>
                          <Typography variant="sigma" textColor="neutral600">⠿ {spec?.label ?? b.__component}</Typography>
                          <Flex gap={1}>
                            <Button size="S" variant="tertiary" disabled={i === 0} onClick={(e: any) => { e.stopPropagation(); move(i, i - 1); }}>↑</Button>
                            <Button size="S" variant="tertiary" disabled={i === blocks.length - 1} onClick={(e: any) => { e.stopPropagation(); move(i, i + 2); }}>↓</Button>
                            <Button size="S" variant="tertiary" onClick={(e: any) => { e.stopPropagation(); duplicate(i); }}>Duplicate</Button>
                            <Button size="S" variant="danger-light" onClick={(e: any) => { e.stopPropagation(); remove(b._k); }}>Delete</Button>
                          </Flex>
                        </Flex>
                        <Preview block={b} />
                      </div>
                      {dropZone(i + 1)}
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </Box>

          {/* inspector */}
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} width="300px" style={{ flexShrink: 0 }}>
            <Typography variant="delta" tag="h2">{selSpec ? selSpec.label : 'Properties'}</Typography>
            {!sel || !selSpec ? (
              <Box paddingTop={2}><Typography variant="pi" textColor="neutral600">Select a block on the page to edit it.</Typography></Box>
            ) : (
              <Flex direction="column" alignItems="stretch" gap={3} paddingTop={3}>
                {selSpec.fields.map((f: Field) => (
                  <FieldInput key={f.key} field={f} value={sel[f.key]} onChange={(v) => update(sel._k, { [f.key]: v })} />
                ))}
                {selSpec.object && (
                  <>
                    <Typography variant="sigma" textColor="neutral600">{selSpec.object.label}</Typography>
                    {selSpec.object.fields.map((f: Field) => (
                      <FieldInput key={f.key} field={f} value={sel[selSpec.object!.key]?.[f.key]} onChange={(v) => update(sel._k, { [selSpec.object!.key]: { ...(sel[selSpec.object!.key] ?? {}), [f.key]: v } })} />
                    ))}
                  </>
                )}
                {selSpec.list && (
                  <>
                    <Typography variant="sigma" textColor="neutral600">{selSpec.list.label}</Typography>
                    {(sel[selSpec.list.key] ?? []).map((item: any, idx: number) => (
                      <Box key={idx} padding={2} hasRadius background="neutral100">
                        <Flex direction="column" alignItems="stretch" gap={2}>
                          {selSpec.list!.fields.map((f: Field) => (
                            <FieldInput
                              key={f.key} field={f} value={item[f.key]}
                              onChange={(v) => update(sel._k, { [selSpec.list!.key]: sel[selSpec.list!.key].map((it: any, n: number) => (n === idx ? { ...it, [f.key]: v } : it)) })}
                            />
                          ))}
                          <Button size="S" variant="danger-light" onClick={() => update(sel._k, { [selSpec.list!.key]: sel[selSpec.list!.key].filter((_: any, n: number) => n !== idx) })}>
                            Remove {selSpec.list!.item.toLowerCase()}
                          </Button>
                        </Flex>
                      </Box>
                    ))}
                    {(!selSpec.list.max || (sel[selSpec.list.key] ?? []).length < selSpec.list.max) && (
                      <Button
                        size="S" variant="secondary"
                        onClick={() => update(sel._k, { [selSpec.list!.key]: [...(sel[selSpec.list!.key] ?? []), Object.fromEntries(selSpec.list!.fields.map((f: Field) => [f.key, f.kind === 'blocks' ? textToBlocks('') : f.kind === 'select' ? f.options![0] : '']))] })}
                      >
                        + Add {selSpec.list.item.toLowerCase()}
                      </Button>
                    )}
                  </>
                )}
              </Flex>
            )}
          </Box>
        </Flex>
      </Layouts.Content>
    </Layouts.Root>
  );
};
