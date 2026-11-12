import * as React from 'react';
import { Badge, Box, Button, Flex, Loader, SingleSelect, SingleSelectOption, Table, Tbody, Td, Th, Thead, TextInput, Tr, Typography } from '@strapi/design-system';
import { Layouts, useFetchClient, useNotification } from '@strapi/strapi/admin';

/**
 * Subscriber management dashboard. Reads and writes through the admin Content Manager API, so every action is
 * limited by the signed-in user's own permissions (a role without "delete" gets an error, not a silent success).
 *
 * Subscribers are personal data. This screen never loads or shows anything beyond the fields below, and the CSV
 * export is limited to what the user can already read here. Exports are NOT recorded in the PoC audit log
 * (the audit trail covers governed website content) — see docs for the gap.
 */

const UID = 'api::subscriber.subscriber';
const API = `/content-manager/collection-types/${UID}`;
const PAGE_SIZE = 25;

type Status = 'pending' | 'active' | 'unsubscribed';
type Sub = {
  documentId: string;
  email: string;
  subscriptionStatus: Status;
  language?: string;
  source?: string;
  createdAt: string;
  confirmedAt?: string | null;
  unsubscribedAt?: string | null;
};

const TONE: Record<Status, string> = { active: 'success', pending: 'warning', unsubscribed: 'neutral' };
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

/** Spreadsheet formula-injection guard + CSV quoting. */
const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};

function buildFilters(status: string, language: string, q: string) {
  const and: any[] = [];
  if (status) and.push({ subscriptionStatus: { $eq: status } });
  if (language) and.push({ language: { $eq: language } });
  if (q.trim()) and.push({ email: { $containsi: q.trim() } });
  return and.length ? { $and: and } : undefined;
}

const Tile = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} style={{ flex: 1, minWidth: 150 }}>
    <Typography variant="sigma" textColor="neutral600">{label}</Typography>
    <Box paddingTop={1}><Typography variant="alpha" tag="p">{value}</Typography></Box>
    {hint && <Typography variant="pi" textColor="neutral600">{hint}</Typography>}
  </Box>
);

export const SubscriberDashboard = () => {
  const { get, put, del } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [status, setStatus] = React.useState('');
  const [language, setLanguage] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<Sub[]>([]);
  const [total, setTotal] = React.useState(0);
  const [counts, setCounts] = React.useState<Record<string, number | null>>({});
  const [recent, setRecent] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const count = React.useCallback(
    async (filters?: any) => {
      const { data }: any = await get(API, { params: { page: 1, pageSize: 1, filters } });
      return (data?.pagination?.total ?? 0) as number;
    },
    [get]
  );

  const loadStats = React.useCallback(async () => {
    try {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [all, active, pending, unsub, last30] = await Promise.all([
        count(),
        count({ subscriptionStatus: { $eq: 'active' } }),
        count({ subscriptionStatus: { $eq: 'pending' } }),
        count({ subscriptionStatus: { $eq: 'unsubscribed' } }),
        count({ createdAt: { $gte: since } }),
      ]);
      setCounts({ all, active, pending, unsubscribed: unsub });
      setRecent(last30);
    } catch {
      setCounts({});
    }
  }, [count]);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data }: any = await get(API, { params: { page, pageSize: PAGE_SIZE, sort: 'createdAt:desc', filters: buildFilters(status, language, search) } });
      setRows(data?.results ?? []);
      setTotal(data?.pagination?.total ?? 0);
    } catch (e: any) {
      setRows([]);
      setError(e?.response?.status === 403 ? 'Your role does not have permission to view subscribers.' : 'Could not load subscribers.');
    }
    setLoading(false);
  }, [get, page, status, language, search]);

  React.useEffect(() => { loadStats(); }, [loadStats]);
  React.useEffect(() => { loadRows(); }, [loadRows]);

  const refresh = () => Promise.all([loadRows(), loadStats()]);
  const fail = (e: any, fallback: string) => toggleNotification({ type: 'danger', message: e?.response?.data?.error?.message ?? fallback });

  const setSubStatus = async (s: Sub, next: Status) => {
    setBusy(s.documentId);
    try {
      const now = new Date().toISOString();
      await put(`${API}/${s.documentId}`, {
        subscriptionStatus: next,
        ...(next === 'active' ? { confirmedAt: now, unsubscribedAt: null } : {}),
        ...(next === 'unsubscribed' ? { unsubscribedAt: now } : {}),
      });
      await refresh();
    } catch (e) { fail(e, 'Update failed'); }
    setBusy(null);
  };

  const remove = async (s: Sub) => {
    if (!window.confirm(`Permanently delete ${s.email}? This cannot be undone.`)) return;
    setBusy(s.documentId);
    try {
      await del(`${API}/${s.documentId}`);
      toggleNotification({ type: 'success', message: 'Subscriber deleted' });
      await refresh();
    } catch (e) { fail(e, 'Delete failed'); }
    setBusy(null);
  };

  const exportCsv = async () => {
    setBusy('export');
    try {
      const filters = buildFilters(status, language, search);
      const all: Sub[] = [];
      for (let p = 1; p <= 200; p++) {
        const { data }: any = await get(API, { params: { page: p, pageSize: 100, sort: 'createdAt:asc', filters } });
        all.push(...(data?.results ?? []));
        if (p >= (data?.pagination?.pageCount ?? 1)) break;
      }
      const head = ['email', 'status', 'language', 'source', 'subscribed', 'confirmed', 'unsubscribed'];
      const lines = [head.join(',')].concat(
        all.map((r) => [r.email, r.subscriptionStatus, r.language, r.source, r.createdAt, r.confirmedAt, r.unsubscribedAt].map(csvCell).join(','))
      );
      const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toggleNotification({ type: 'success', message: `Exported ${all.length} subscribers` });
    } catch (e) { fail(e, 'Export failed'); }
    setBusy(null);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const num = (k: string) => (counts[k] == null ? '…' : counts[k]!.toLocaleString());
  const rate = counts.all ? Math.round(((counts.active ?? 0) / counts.all) * 100) : null;

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Subscribers"
        subtitle="People who signed up for updates on the website. Personal data — handle and export with care."
        primaryAction={<Button variant="secondary" onClick={exportCsv} loading={busy === 'export'} disabled={!total}>Export CSV</Button>}
      />
      <Layouts.Content>
        <Flex gap={4} wrap="wrap" paddingBottom={6} alignItems="stretch">
          <Tile label="Total" value={num('all')} />
          <Tile label="Active" value={num('active')} hint={rate == null ? undefined : `${rate}% of all sign-ups`} />
          <Tile label="Awaiting confirmation" value={num('pending')} hint="Have not clicked the email link" />
          <Tile label="Unsubscribed" value={num('unsubscribed')} />
          <Tile label="New in last 30 days" value={recent == null ? '…' : recent.toLocaleString()} />
        </Flex>

        <Flex gap={3} alignItems="flex-end" wrap="wrap" paddingBottom={4}>
          <Box width="260px">
            <TextInput
              aria-label="Search email"
              placeholder="Search email…"
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              onKeyDown={(e: any) => { if (e.key === 'Enter') { setPage(1); setSearch(query); } }}
            />
          </Box>
          <Box width="200px">
            <SingleSelect aria-label="Status" placeholder="All statuses" value={status || undefined} onChange={(v: any) => { setStatus(String(v ?? '')); setPage(1); }} onClear={() => { setStatus(''); setPage(1); }}>
              <SingleSelectOption value="active">Active</SingleSelectOption>
              <SingleSelectOption value="pending">Awaiting confirmation</SingleSelectOption>
              <SingleSelectOption value="unsubscribed">Unsubscribed</SingleSelectOption>
            </SingleSelect>
          </Box>
          <Box width="200px">
            <SingleSelect aria-label="Language" placeholder="All languages" value={language || undefined} onChange={(v: any) => { setLanguage(String(v ?? '')); setPage(1); }} onClear={() => { setLanguage(''); setPage(1); }}>
              <SingleSelectOption value="en">English</SingleSelectOption>
              <SingleSelectOption value="si">Sinhala</SingleSelectOption>
              <SingleSelectOption value="ta">Tamil</SingleSelectOption>
            </SingleSelect>
          </Box>
          <Button variant="tertiary" onClick={() => { setPage(1); setSearch(query); }}>Search</Button>
        </Flex>

        {loading ? (
          <Loader small />
        ) : error ? (
          <Typography textColor="danger600">{error}</Typography>
        ) : (
          <Table colCount={6} rowCount={rows.length}>
            <Thead>
              <Tr>
                <Th><Typography variant="sigma">Email</Typography></Th>
                <Th><Typography variant="sigma">Status</Typography></Th>
                <Th><Typography variant="sigma">Language</Typography></Th>
                <Th><Typography variant="sigma">Subscribed</Typography></Th>
                <Th><Typography variant="sigma">Source</Typography></Th>
                <Th><Typography variant="sigma">Actions</Typography></Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((s) => (
                <Tr key={s.documentId}>
                  <Td><Typography>{s.email}</Typography></Td>
                  <Td><Badge>{s.subscriptionStatus}</Badge></Td>
                  <Td><Typography>{(s.language ?? '').toUpperCase() || '—'}</Typography></Td>
                  <Td><Typography>{fmt(s.createdAt)}</Typography></Td>
                  <Td><Typography>{s.source ?? '—'}</Typography></Td>
                  <Td>
                    <Flex gap={1}>
                      {s.subscriptionStatus === 'pending' && <Button size="S" variant="secondary" disabled={busy === s.documentId} onClick={() => setSubStatus(s, 'active')}>Mark confirmed</Button>}
                      {s.subscriptionStatus === 'active' && <Button size="S" variant="tertiary" disabled={busy === s.documentId} onClick={() => setSubStatus(s, 'unsubscribed')}>Unsubscribe</Button>}
                      {s.subscriptionStatus === 'unsubscribed' && <Button size="S" variant="tertiary" disabled={busy === s.documentId} onClick={() => setSubStatus(s, 'active')}>Re-activate</Button>}
                      <Button size="S" variant="danger-light" disabled={busy === s.documentId} onClick={() => remove(s)}>Delete</Button>
                    </Flex>
                  </Td>
                </Tr>
              ))}
              {rows.length === 0 && (
                <Tr><Td colSpan={6}><Typography textColor="neutral600">No subscribers match.</Typography></Td></Tr>
              )}
            </Tbody>
          </Table>
        )}

        <Flex justifyContent="space-between" paddingTop={4}>
          <Typography variant="pi" textColor="neutral600">{total.toLocaleString()} subscriber{total === 1 ? '' : 's'}</Typography>
          <Flex gap={2} alignItems="center">
            <Button size="S" variant="tertiary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Typography variant="pi">Page {page} of {pages}</Typography>
            <Button size="S" variant="tertiary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </Flex>
        </Flex>
      </Layouts.Content>
    </Layouts.Root>
  );
};
