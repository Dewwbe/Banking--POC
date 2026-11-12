import * as React from 'react';
import { Badge, Box, Button, Flex, Loader, SingleSelect, SingleSelectOption, Table, Tbody, Td, Textarea, Th, Thead, TextInput, Tr, Typography } from '@strapi/design-system';
import { Layouts, useAuth, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Link } from 'react-router-dom';
import { VersionHistory } from '../components/VersionHistory';

/**
 * Workflow Center — one screen for the whole publishing life-cycle of website content:
 *   Draft → In review → Awaiting approval → Approved → Published, plus scheduling and rollback.
 *
 * It only calls APIs that enforce the rules on the SERVER (workflow middleware, role checks, separation of duties,
 * approval hash). The buttons shown are a convenience based on the user's role names; a button that is shown but not
 * allowed simply returns the server's refusal message.
 */

type Stage = 'draft' | 'in_review' | 'changes_requested' | 'awaiting_approval' | 'approved';
const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft', in_review: 'In review', changes_requested: 'Changes requested', awaiting_approval: 'Awaiting approval', approved: 'Approved',
};

const TYPES = [
  { uid: 'api::home.home', label: 'Home page', single: true },
  { uid: 'api::about-us.about-us', label: 'About Us', single: true },
  { uid: 'api::contact-us.contact-us', label: 'Contact Us', single: true },
  { uid: 'api::product.product', label: 'Product' },
  { uid: 'api::news-article.news-article', label: 'News article' },
  { uid: 'api::promotion.promotion', label: 'Promotion' },
  { uid: 'api::banner.banner', label: 'Banner' },
  { uid: 'api::menu-item.menu-item', label: 'Menu item' },
  { uid: 'api::rate.rate', label: 'Rate' },
  { uid: 'api::seo-setting.seo-setting', label: 'SEO settings', single: true },
] as const;
const LOCALES = ['en', 'si', 'ta'];

type Item = { key: string; uid: string; typeLabel: string; single: boolean; documentId: string; locale: string; title: string; stage: Stage; status: string; updatedAt: string };
type Entry = { sequence: number; occurredAt: string; action: string; outcome: string; actor: string; from: string | null; to: string | null; reason: string | null; restorable: boolean };
type Detail = { stage: Stage; reviewComment: string | null; live: boolean; publishedAt: string | null; schedulable: boolean; scheduledPublishAt: string | null; scheduledUnpublishAt: string | null; entries: Entry[] };

const AUTHOR_ROLES = ['Author', 'Promotions Administrator', 'Branch Administrator'];
const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
/** ISO → value for <input type="datetime-local"> (local time). */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const msg = (e: any, fallback: string) => e?.response?.data?.error?.message ?? fallback;

const path = (i: Pick<Item, 'uid' | 'single' | 'documentId'>) =>
  i.single ? `/content-manager/single-types/${i.uid}` : `/content-manager/collection-types/${i.uid}/${i.documentId}`;

export const WorkflowCenter = () => {
  const client = useFetchClient();
  const { toggleNotification } = useNotification();
  const user = useAuth('WorkflowCenter', (s: any) => s.user);
  const roleNames: string[] = (user?.roles ?? []).map((r: any) => r.name);
  const isSuper = (user?.roles ?? []).some((r: any) => r.code === 'strapi-super-admin');
  const has = (...names: string[]) => isSuper || names.some((n) => roleNames.includes(n));

  const [items, setItems] = React.useState<Item[] | null>(null);
  const [failed, setFailed] = React.useState(0);
  const [stageFilter, setStageFilter] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [sel, setSel] = React.useState<Item | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [pubAt, setPubAt] = React.useState('');
  const [unpubAt, setUnpubAt] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  /* ---------- list ---------- */
  const loadItems = React.useCallback(async () => {
    let bad = 0;
    const out: Item[] = [];
    await Promise.all(
      TYPES.flatMap((t) => {
        const base = { uid: t.uid, typeLabel: t.label, single: Boolean((t as any).single) };
        const toItem = (r: any): Item => ({
          ...base, key: `${t.uid}|${r.documentId}|${r.locale}`, documentId: r.documentId, locale: r.locale,
          title: r.name ?? r.title ?? r.label ?? r.slug ?? t.label, stage: r.workflowStage ?? 'draft', status: r.status ?? '', updatedAt: r.updatedAt,
        });
        if ((t as any).single) {
          return LOCALES.map(async (locale) => {
            try {
              const { data }: any = await client.get(`/content-manager/single-types/${t.uid}`, { params: { locale } });
              if (data?.data) out.push(toItem({ ...data.data, locale: data.data.locale ?? locale, status: data.meta?.availableStatus?.length ? 'published' : '' }));
            } catch (e: any) { if (e?.response?.status !== 404) bad++; }
          });
        }
        return [(async () => {
          try {
            const { data }: any = await client.get(`/content-manager/collection-types/${t.uid}`, { params: { locale: '*', page: 1, pageSize: 100, sort: 'updatedAt:desc' } });
            (data.results ?? []).forEach((r: any) => out.push(toItem(r)));
          } catch { bad++; }
        })()];
      })
    );
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setItems(out);
    setFailed(bad);
  }, [client]);

  React.useEffect(() => { if (user) loadItems(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- detail ---------- */
  const loadDetail = React.useCallback(async (i: Item) => {
    setDetailLoading(true);
    try {
      const { data }: any = await client.get('/poc/history', { params: { uid: i.uid, documentId: i.documentId, locale: i.locale } });
      setDetail(data);
      setPubAt(toLocalInput(data.scheduledPublishAt));
      setUnpubAt(toLocalInput(data.scheduledUnpublishAt));
    } catch (e: any) {
      setDetail(null);
      toggleNotification({ type: 'danger', message: msg(e, 'Could not load the details') });
    }
    setDetailLoading(false);
  }, [client, toggleNotification]);

  const select = (i: Item) => { setSel(i); setComment(''); setDetail(null); loadDetail(i); };
  const refreshAll = async () => { await loadItems(); if (sel) await loadDetail(sel); };

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(true);
    try {
      const res = await fn();
      toggleNotification({ type: 'success', message: label });
      await refreshAll();
      return res;
    } catch (e: any) {
      toggleNotification({ type: 'danger', message: msg(e, `${label} failed`) });
    } finally {
      setBusy(false);
    }
  };

  const setStage = (to: Stage, label: string) =>
    run(label, () => client.put(path(sel!), { workflowStage: to, ...(comment.trim() ? { reviewComment: comment.trim() } : {}) }, { params: { locale: sel!.locale } }));
  const publish = () => run('Published', () => client.post(`${path(sel!)}/actions/publish`, {}, { params: { locale: sel!.locale } }));
  const unpublish = () => {
    if (!window.confirm('Take this content off the public website now?')) return;
    return run('Unpublished', () => client.post(`${path(sel!)}/actions/unpublish`, { discardDraft: false }, { params: { locale: sel!.locale } }));
  };
  const saveSchedule = (payload: Record<string, string | null>) =>
    run('Schedule saved', () => client.post('/poc/schedule', { uid: sel!.uid, documentId: sel!.documentId, locale: sel!.locale, ...payload }));
  /* ---------- derived ---------- */
  const shown = (items ?? []).filter((i) => (!stageFilter || i.stage === stageFilter) && (!typeFilter || i.uid === typeFilter) && (!search || i.title.toLowerCase().includes(search.toLowerCase())));
  const counts = (items ?? []).reduce<Record<string, number>>((a, i) => ({ ...a, [i.stage]: (a[i.stage] ?? 0) + 1 }), {});
  const stage = detail?.stage;
  const publisher = has('Publisher');

  const actions: Array<{ label: string; variant: 'default' | 'secondary' | 'danger-light'; onClick: () => void; hint?: string }> = [];
  if (stage && has(...AUTHOR_ROLES) && ['draft', 'changes_requested', 'approved'].includes(stage)) actions.push({ label: stage === 'approved' ? 'Withdraw to review' : 'Submit for review', variant: 'default', onClick: () => setStage('in_review', 'Submitted for review') });
  if (stage === 'in_review' && has('Editor')) {
    actions.push({ label: 'Send to compliance', variant: 'default', onClick: () => setStage('awaiting_approval', 'Sent to compliance') });
    actions.push({ label: 'Request changes', variant: 'danger-light', onClick: () => setStage('changes_requested', 'Changes requested') });
  }
  if (stage === 'awaiting_approval' && has('Compliance Reviewer')) {
    actions.push({ label: 'Approve', variant: 'default', onClick: () => setStage('approved', 'Approved') });
    actions.push({ label: 'Request changes', variant: 'danger-light', onClick: () => setStage('changes_requested', 'Changes requested') });
  }
  if (stage === 'approved' && publisher) actions.push({ label: detail?.live ? 'Publish changes now' : 'Publish now', variant: 'default', onClick: publish });
  if (detail?.live && publisher) actions.push({ label: 'Unpublish', variant: 'danger-light', onClick: unpublish });

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Workflow Center"
        subtitle="Draft → review → approval → publish, with scheduling and rollback. The server enforces who may do what."
        primaryAction={<Button variant="tertiary" onClick={loadItems}>Refresh</Button>}
      />
      <Layouts.Content>
        <Flex gap={2} wrap="wrap" paddingBottom={4}>
          {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
            <Button key={s} size="S" variant={stageFilter === s ? 'default' : 'secondary'} onClick={() => setStageFilter(stageFilter === s ? '' : s)}>
              {STAGE_LABEL[s]} ({counts[s] ?? 0})
            </Button>
          ))}
        </Flex>
        <Flex gap={3} wrap="wrap" paddingBottom={4}>
          <Box width="260px"><TextInput aria-label="Search" placeholder="Search by title…" value={search} onChange={(e: any) => setSearch(e.target.value)} /></Box>
          <Box width="220px">
            <SingleSelect aria-label="Type" placeholder="All content types" value={typeFilter || undefined} onChange={(v: any) => setTypeFilter(String(v ?? ''))} onClear={() => setTypeFilter('')}>
              {TYPES.map((t) => <SingleSelectOption key={t.uid} value={t.uid}>{t.label}</SingleSelectOption>)}
            </SingleSelect>
          </Box>
        </Flex>
        {failed > 0 && <Box paddingBottom={3}><Typography variant="pi" textColor="warning600">Some content types could not be loaded (your role may not be allowed to read them).</Typography></Box>}

        <Flex alignItems="flex-start" gap={5}>
          {/* ---- list ---- */}
          <Box style={{ flex: 1, minWidth: 0 }}>
            {!items ? <Loader small /> : (
              <Table colCount={4} rowCount={shown.length}>
                <Thead><Tr>
                  <Th><Typography variant="sigma">Title</Typography></Th>
                  <Th><Typography variant="sigma">Type</Typography></Th>
                  <Th><Typography variant="sigma">Language</Typography></Th>
                  <Th><Typography variant="sigma">Stage</Typography></Th>
                </Tr></Thead>
                <Tbody>
                  {shown.map((i) => (
                    <Tr key={i.key} onClick={() => select(i)} style={{ cursor: 'pointer', background: sel?.key === i.key ? '#f0f0ff' : undefined }}>
                      <Td><Typography fontWeight={sel?.key === i.key ? 'bold' : undefined}>{i.title}</Typography></Td>
                      <Td><Typography>{i.typeLabel}</Typography></Td>
                      <Td><Typography>{i.locale.toUpperCase()}</Typography></Td>
                      <Td><Badge>{STAGE_LABEL[i.stage] ?? i.stage}</Badge></Td>
                    </Tr>
                  ))}
                  {shown.length === 0 && <Tr><Td colSpan={4}><Typography textColor="neutral600">Nothing matches.</Typography></Td></Tr>}
                </Tbody>
              </Table>
            )}
          </Box>

          {/* ---- detail ---- */}
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={5} width="420px" style={{ flexShrink: 0 }}>
            {!sel ? <Typography textColor="neutral600">Select an item to see its status, actions, schedule and history.</Typography> : (
              <Flex direction="column" alignItems="stretch" gap={4}>
                <Box>
                  <Typography variant="delta" tag="h2">{sel.title}</Typography>
                  <Typography variant="pi" textColor="neutral600">{sel.typeLabel} · {sel.locale.toUpperCase()}</Typography>
                  {' '}
                  <Link to={`/content-manager/${sel.single ? 'single-types' : 'collection-types'}/${sel.uid}${sel.single ? '' : `/${sel.documentId}`}?plugins[i18n][locale]=${sel.locale}`} style={{ fontSize: 12 }}>Open editor</Link>
                </Box>
                {detailLoading || !detail ? <Loader small /> : (
                  <>
                    <Flex gap={2} wrap="wrap" alignItems="center">
                      <Badge>{STAGE_LABEL[detail.stage] ?? detail.stage}</Badge>
                      <Badge>{detail.live ? 'Live on website' : 'Not live'}</Badge>
                      {detail.live && <Typography variant="pi" textColor="neutral600">since {fmtDT(detail.publishedAt)}</Typography>}
                    </Flex>
                    {detail.reviewComment && <Typography variant="pi" textColor="neutral600">Last comment: “{detail.reviewComment}”</Typography>}

                    <Box>
                      <Typography variant="sigma" textColor="neutral600">Actions</Typography>
                      <Box paddingTop={2}>
                        <Textarea aria-label="Comment" placeholder="Comment for the next person (optional)" value={comment} onChange={(e: any) => setComment(e.target.value)} />
                      </Box>
                      <Flex gap={2} wrap="wrap" paddingTop={2}>
                        {actions.map((a) => <Button key={a.label} size="S" variant={a.variant} disabled={busy} onClick={a.onClick}>{a.label}</Button>)}
                        {actions.length === 0 && <Typography variant="pi" textColor="neutral600">Nothing for your role to do at this stage.</Typography>}
                      </Flex>
                    </Box>

                    {detail.schedulable && (
                      <Box>
                        <Typography variant="sigma" textColor="neutral600">Schedule</Typography>
                        {detail.scheduledPublishAt && <Typography variant="pi" tag="p">Will publish: <b>{fmtDT(detail.scheduledPublishAt)}</b></Typography>}
                        {detail.scheduledUnpublishAt && <Typography variant="pi" tag="p">Will unpublish: <b>{fmtDT(detail.scheduledUnpublishAt)}</b></Typography>}
                        {publisher ? (
                          <Flex direction="column" alignItems="stretch" gap={2} paddingTop={2}>
                            <label style={{ fontSize: 12 }}>Publish at {detail.stage !== 'approved' && '(needs Approved stage)'}
                              <input type="datetime-local" value={pubAt} onChange={(e) => setPubAt(e.target.value)} style={{ display: 'block', width: '100%', padding: 6 }} disabled={detail.stage !== 'approved'} />
                            </label>
                            <label style={{ fontSize: 12 }}>Unpublish at
                              <input type="datetime-local" value={unpubAt} onChange={(e) => setUnpubAt(e.target.value)} style={{ display: 'block', width: '100%', padding: 6 }} />
                            </label>
                            <Flex gap={2}>
                              <Button size="S" disabled={busy || (!pubAt && !unpubAt)} onClick={() => saveSchedule({
                                ...(pubAt && pubAt !== toLocalInput(detail.scheduledPublishAt) ? { publishAt: new Date(pubAt).toISOString() } : {}),
                                ...(unpubAt && unpubAt !== toLocalInput(detail.scheduledUnpublishAt) ? { unpublishAt: new Date(unpubAt).toISOString() } : {}),
                              })}>Save schedule</Button>
                              {(detail.scheduledPublishAt || detail.scheduledUnpublishAt) && (
                                <Button size="S" variant="danger-light" disabled={busy} onClick={() => saveSchedule({ publishAt: null, unpublishAt: null })}>Clear</Button>
                              )}
                            </Flex>
                            <Typography variant="pi" textColor="neutral600">Checked every minute. If the content is edited before then, the schedule is cancelled instead of publishing unapproved content.</Typography>
                          </Flex>
                        ) : <Typography variant="pi" textColor="neutral600">Only a Publisher can set a schedule.</Typography>}
                      </Box>
                    )}
                    {!detail.schedulable && <Typography variant="pi" textColor="neutral600">Promotions are scheduled by their start and end dates (edit them in the editor).</Typography>}

                    <Box>
                      <Typography variant="sigma" textColor="neutral600">Versions</Typography>
                      <Box paddingTop={2}>
                        <VersionHistory key={`${sel.key}|${detail.entries[0]?.sequence ?? 0}`} uid={sel.uid} documentId={sel.documentId} locale={sel.locale} onChanged={refreshAll} />
                      </Box>
                    </Box>

                    <Box>
                      <Typography variant="sigma" textColor="neutral600">Activity</Typography>
                      <Box paddingTop={2}>
                        {detail.entries.length === 0 && <Typography variant="pi" textColor="neutral600">No activity yet.</Typography>}
                        {detail.entries.map((e) => (
                          <Box key={e.sequence} paddingBottom={2} style={{ borderBottom: '1px solid #eaeaef' }}>
                            <Typography variant="pi" fontWeight="bold">{e.action}{e.outcome === 'denied' ? ' (denied)' : ''}</Typography>
                            <Typography variant="pi" tag="p" textColor="neutral600">{fmtDT(e.occurredAt)} · {e.actor ?? '—'}</Typography>
                            {e.from && e.to && e.from !== e.to && <Typography variant="pi" tag="p" textColor="neutral600">{e.from} → {e.to}</Typography>}
                            {e.reason && <Typography variant="pi" tag="p" textColor="neutral600">{e.reason}</Typography>}
                          </Box>
                        ))}
                      </Box>
                    </Box>
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
