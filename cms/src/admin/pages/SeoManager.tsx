import * as React from 'react';
import { Badge, Box, Button, Field, Flex, Loader, SingleSelect, SingleSelectOption, Table, Tbody, Td, Textarea, TextInput, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { Layouts, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Link } from 'react-router-dom';
import { editorPath } from '../components/TranslationStatus';

/**
 * SEO manager: audit and edit the meta title / meta description of every page, in every language.
 * The audit is computed on the server (src/poc/seo.ts). Saving changes the DRAFT through the normal workflow, so a
 * changed title or description still has to be reviewed, approved and published before it reaches search engines.
 */

type Issue = { severity: 'error' | 'warning' | 'info'; rule: string; message: string };
type Row = {
  key: string; uid: string; typeLabel: string; documentId: string; locale: string; itemTitle: string; pageKey: string | null;
  metaTitle: string; metaDescription: string; noIndex: boolean; fullTitle: string; stage: string | null; live: boolean; issues: Issue[];
};
type Audit = { locales: string[]; limits: { titleMax: number; titleMin: number; descMax: number; descMin: number }; summary: { total: number; withErrors: number; withWarnings: number }; rows: Row[] };

const STAGE: Record<string, string> = { draft: 'Draft', in_review: 'In review', changes_requested: 'Changes requested', awaiting_approval: 'Awaiting approval', approved: 'Approved' };
const COLOR = { error: '#b72b1a', warning: '#a56a00', info: '#4a4a6a' } as const;
const worst = (r: Row) => (r.issues.some((i) => i.severity === 'error') ? 'error' : r.issues.some((i) => i.severity === 'warning') ? 'warning' : 'ok');

/** Colour of a length counter: green inside the recommended range, amber outside it, red over the hard limit. */
function Counter({ n, min, max }: { n: number; min: number; max: number }) {
  const color = n === 0 || n > max ? '#b72b1a' : n < min ? '#a56a00' : '#2f6846';
  return <span style={{ fontSize: 12, color }}>{n} / {max} characters (recommended {min}–{max})</span>;
}

export const SeoManager = () => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const [data, setData] = React.useState<Audit | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [locale, setLocale] = React.useState('');
  const [type, setType] = React.useState('');
  const [onlyIssues, setOnlyIssues] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [selKey, setSelKey] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [noIndex, setNoIndex] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const { data: d }: any = await get('/poc/seo/audit');
      setData(d);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Could not load the SEO audit.');
    }
  }, [get]);
  React.useEffect(() => { load(); }, [load]);

  const sel = data?.rows.find((r) => r.key === selKey) ?? null;
  React.useEffect(() => {
    if (sel) { setTitle(sel.metaTitle); setDesc(sel.metaDescription); setNoIndex(sel.noIndex); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const lim = data?.limits ?? { titleMax: 60, titleMin: 25, descMax: 160, descMin: 70 };
  const types = [...new Set((data?.rows ?? []).map((r) => r.typeLabel))];
  const shown = (data?.rows ?? []).filter((r) =>
    (!locale || r.locale === locale) && (!type || r.typeLabel === type) && (!onlyIssues || worst(r) !== 'ok') &&
    (!search || `${r.itemTitle} ${r.metaTitle} ${r.metaDescription}`.toLowerCase().includes(search.toLowerCase())));

  const dirty = !!sel && (title !== sel.metaTitle || desc !== sel.metaDescription || noIndex !== sel.noIndex);
  // live preview of the full title: keep whatever the site template puts around the title
  let prefix = '', suffix = '';
  if (sel && sel.metaTitle && sel.fullTitle.includes(sel.metaTitle)) {
    const i = sel.fullTitle.indexOf(sel.metaTitle);
    prefix = sel.fullTitle.slice(0, i);
    suffix = sel.fullTitle.slice(i + sel.metaTitle.length);
  }
  const preview = title.trim() ? `${prefix}${title.trim()}${suffix}` : '(no title)';

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      await post('/poc/seo/update', {
        uid: sel.uid, documentId: sel.documentId, locale: sel.locale, ...(sel.pageKey ? { pageKey: sel.pageKey } : {}),
        metaTitle: title, metaDescription: desc, noIndex,
      });
      toggleNotification({ type: 'success', message: 'Saved as a draft. It goes live after review, approval and publishing.' });
      await load();
    } catch (e: any) {
      toggleNotification({ type: 'danger', message: e?.response?.data?.error?.message ?? 'Saving failed' });
    }
    setSaving(false);
  };

  return (
    <Layouts.Root>
      <Layouts.Header
        title="SEO manager"
        subtitle="Meta titles and descriptions for every page and language. Search engines show these in results, so they are audited for missing, too short / too long, duplicated and untranslated text."
        primaryAction={<Button variant="tertiary" onClick={load}>Refresh</Button>}
      />
      <Layouts.Content>
        {error && <Typography textColor="danger600">{error}</Typography>}
        {!data && !error && <Loader small />}
        {data && (
          <>
            <Flex gap={4} wrap="wrap" paddingBottom={4}>
              {[['Pages audited', data.summary.total], ['With errors', data.summary.withErrors], ['With warnings', data.summary.withWarnings]].map(([l, v]) => (
                <Box key={String(l)} background="neutral0" hasRadius shadow="filterShadow" padding={4} style={{ minWidth: 160 }}>
                  <Typography variant="sigma" textColor="neutral600">{l}</Typography>
                  <Typography variant="alpha" tag="p">{v}</Typography>
                </Box>
              ))}
            </Flex>

            <Flex gap={3} wrap="wrap" alignItems="center" paddingBottom={4}>
              <Box width="240px"><TextInput aria-label="Search" placeholder="Search title or text…" value={search} onChange={(e: any) => setSearch(e.target.value)} /></Box>
              <Box width="180px">
                <SingleSelect aria-label="Language" placeholder="All languages" value={locale || undefined} onChange={(v: any) => setLocale(String(v ?? ''))} onClear={() => setLocale('')}>
                  {data.locales.map((l) => <SingleSelectOption key={l} value={l}>{l.toUpperCase()}</SingleSelectOption>)}
                </SingleSelect>
              </Box>
              <Box width="200px">
                <SingleSelect aria-label="Type" placeholder="All types" value={type || undefined} onChange={(v: any) => setType(String(v ?? ''))} onClear={() => setType('')}>
                  {types.map((t) => <SingleSelectOption key={t} value={t}>{t}</SingleSelectOption>)}
                </SingleSelect>
              </Box>
              <Button size="S" variant={onlyIssues ? 'default' : 'secondary'} onClick={() => setOnlyIssues(!onlyIssues)}>Only pages with issues</Button>
            </Flex>

            <Flex alignItems="flex-start" gap={5}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Table colCount={5} rowCount={shown.length}>
                  <Thead>
                    <Tr>
                      <Th><Typography variant="sigma">Page</Typography></Th>
                      <Th><Typography variant="sigma">Lang</Typography></Th>
                      <Th><Typography variant="sigma">Meta title</Typography></Th>
                      <Th><Typography variant="sigma">Description</Typography></Th>
                      <Th><Typography variant="sigma">Status</Typography></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {shown.map((r) => {
                      const w = worst(r);
                      return (
                        <Tr key={r.key} onClick={() => setSelKey(r.key)} style={{ cursor: 'pointer', background: selKey === r.key ? '#f0f0ff' : undefined }}>
                          <Td><Typography fontWeight={selKey === r.key ? 'bold' : undefined}>{r.itemTitle}</Typography><br /><Typography variant="pi" textColor="neutral600">{r.typeLabel}</Typography></Td>
                          <Td><Typography>{r.locale.toUpperCase()}</Typography></Td>
                          <Td><Typography variant="pi" style={{ color: r.metaTitle ? undefined : COLOR.error }}>{r.metaTitle || 'missing'}</Typography><br /><Typography variant="pi" textColor="neutral600">{r.metaTitle.length} chars</Typography></Td>
                          <Td><Typography variant="pi" style={{ color: r.metaDescription ? undefined : COLOR.error }}>{r.metaDescription ? `${r.metaDescription.slice(0, 60)}${r.metaDescription.length > 60 ? '…' : ''}` : 'missing'}</Typography><br /><Typography variant="pi" textColor="neutral600">{r.metaDescription.length} chars</Typography></Td>
                          <Td>
                            <Flex gap={1} wrap="wrap">
                              <Badge>{w === 'ok' ? 'OK' : `${r.issues.filter((i) => i.severity !== 'info').length} issue${r.issues.filter((i) => i.severity !== 'info').length === 1 ? '' : 's'}`}</Badge>
                              <Badge>{STAGE[r.stage ?? 'draft'] ?? r.stage}</Badge>
                              {r.live && <Badge>Live</Badge>}
                            </Flex>
                          </Td>
                        </Tr>
                      );
                    })}
                    {shown.length === 0 && <Tr><Td colSpan={5}><Typography textColor="neutral600">Nothing matches.</Typography></Td></Tr>}
                  </Tbody>
                </Table>
              </Box>

              <Box background="neutral0" hasRadius shadow="filterShadow" padding={5} width="440px" style={{ flexShrink: 0 }}>
                {!sel ? <Typography textColor="neutral600">Select a page to edit its meta title and description.</Typography> : (
                  <Flex direction="column" alignItems="stretch" gap={4}>
                    <Box>
                      <Typography variant="delta" tag="h2">{sel.itemTitle}</Typography>
                      <Typography variant="pi" textColor="neutral600">{sel.typeLabel} · {sel.locale.toUpperCase()} · {STAGE[sel.stage ?? 'draft']}{sel.live ? ' · live' : ''}</Typography>{' '}
                      <Link to={editorPath(sel.uid, sel.documentId, sel.locale)} style={{ fontSize: 12 }}>Open editor</Link>
                    </Box>

                    <Box style={{ border: '1px solid #eaeaef', borderRadius: 6, padding: 12, background: '#fff' }} aria-label="Search result preview">
                      <div style={{ fontSize: 12, color: '#4d5156' }}>yoursite.com › {sel.locale}</div>
                      <div style={{ fontSize: 18, color: '#1a0dab', lineHeight: 1.3, wordBreak: 'break-word' }}>{preview.length > lim.titleMax ? `${preview.slice(0, lim.titleMax - 1)}…` : preview}</div>
                      <div style={{ fontSize: 13, color: '#4d5156', lineHeight: 1.4, wordBreak: 'break-word' }}>{desc.trim() ? (desc.length > lim.descMax ? `${desc.slice(0, lim.descMax - 1)}…` : desc) : '(no description)'}</div>
                    </Box>

                    <Field.Root>
                      <Field.Label>Meta title</Field.Label>
                      <TextInput value={title} onChange={(e: any) => setTitle(e.target.value)} />
                      <Counter n={title.trim().length} min={lim.titleMin} max={lim.titleMax} />
                    </Field.Root>
                    <Field.Root>
                      <Field.Label>Meta description</Field.Label>
                      <Textarea value={desc} onChange={(e: any) => setDesc(e.target.value)} />
                      <Counter n={desc.trim().length} min={lim.descMin} max={lim.descMax} />
                    </Field.Root>
                    <label style={{ fontSize: 13 }}><input type="checkbox" checked={noIndex} onChange={(e) => setNoIndex(e.target.checked)} /> Ask search engines not to list this page (noindex)</label>

                    <Flex gap={2} alignItems="center">
                      <Button onClick={save} loading={saving} disabled={!dirty || !title.trim() || !desc.trim() || title.trim().length > lim.titleMax || desc.trim().length > lim.descMax}>Save as draft</Button>
                      {dirty && <Button variant="tertiary" onClick={() => { setTitle(sel.metaTitle); setDesc(sel.metaDescription); setNoIndex(sel.noIndex); }}>Reset</Button>}
                    </Flex>
                    <Typography variant="pi" textColor="neutral600">Saving moves the page back to Draft. Submit it for review from the Workflow Center; it goes live only after approval and publishing.</Typography>

                    <Box>
                      <Typography variant="sigma" textColor="neutral600">Checks</Typography>
                      {sel.issues.length === 0 && <Typography variant="pi" tag="p" textColor="success600">No problems found.</Typography>}
                      {sel.issues.map((i, n) => (
                        <Typography key={n} variant="pi" tag="p" style={{ color: COLOR[i.severity] }}>{i.severity === 'error' ? '●' : i.severity === 'warning' ? '▲' : 'ℹ'} {i.message}</Typography>
                      ))}
                    </Box>
                  </Flex>
                )}
              </Box>
            </Flex>
          </>
        )}
      </Layouts.Content>
    </Layouts.Root>
  );
};
