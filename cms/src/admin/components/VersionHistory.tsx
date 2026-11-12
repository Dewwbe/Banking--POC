import * as React from 'react';
import { Badge, Box, Button, Flex, Loader, Modal, Typography } from '@strapi/design-system';
import { useAuth, useFetchClient, useNotification } from '@strapi/strapi/admin';

/**
 * Version history, comparison and restore for ONE content item + language. Used in the Content Manager edit screen's
 * side panel and in the Workflow Center. Talks to GET /poc/versions, GET /poc/versions/compare and POST /poc/rollback
 * (cms/src/poc/versions.ts, rollback.ts), which enforce all permissions on the server.
 *
 * Restoring only replaces the DRAFT with an earlier version; it then goes through review and approval again.
 */

type Version = { number: number; sequence: number; kind: 'created' | 'edited' | 'restored'; at: string; actor: string | null; stage: string | null; published: Array<{ at: string; actor: string | null }>; note: string | null };
type VersionsResponse = {
  versions: Version[];
  current: { stage: string; versionNumber: number | null };
  live: { versionNumber: number | null; differsFromDraft: boolean } | null;
};
type FieldDiff = { field: string; label: string; type: string; change: 'changed' | 'added' | 'removed'; before: any; after: any };
type Compare = { from: { label: string; at: string | null; actor: string | null }; to: { label: string; at: string | null; actor: string | null }; identical: boolean; unchanged: number; fields: FieldDiff[] };

const KIND_LABEL = { created: 'Created', edited: 'Edited', restored: 'Restored' } as const;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
const AUTHOR_ROLES = ['Author', 'Promotions Administrator', 'Branch Administrator'];

/* ---------------- tiny diff (longest common subsequence) ---------------- */
type Op = { t: 'same' | 'del' | 'add'; v: string };
function diffTokens(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length;
  if (n * m > 400_000) return [...a.map((v) => ({ t: 'del' as const, v })), ...b.map((v) => ({ t: 'add' as const, v }))]; // too large: show as replaced
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Op[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'same', v: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', v: a[i++] });
    else out.push({ t: 'add', v: b[j++] });
  }
  while (i < n) out.push({ t: 'del', v: a[i++] });
  while (j < m) out.push({ t: 'add', v: b[j++] });
  return out;
}

const isText = (v: any) => typeof v === 'string';
const asLines = (v: any) => (v === null || v === undefined ? [] : isText(v) ? v.split('\n') : JSON.stringify(v, null, 2).split('\n'));

const COLORS = { del: { background: '#fcecea', color: '#b72b1a' }, add: { background: '#eafbe7', color: '#2f6846' } };

/** One side of the comparison with removed/added parts highlighted. */
function Side({ ops, side }: { ops: Op[]; side: 'before' | 'after' }) {
  const hide = side === 'before' ? 'add' : 'del';
  return (
    <div style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {ops.filter((o) => o.t !== hide).map((o, i) =>
        o.t === 'same' ? <span key={i}>{o.v}</span> : <span key={i} style={{ ...COLORS[o.t], textDecoration: o.t === 'del' ? 'line-through' : undefined, borderRadius: 2 }}>{o.v}</span>
      )}
    </div>
  );
}

function FieldView({ f }: { f: FieldDiff }) {
  const textual = (isText(f.before) || f.before == null) && (isText(f.after) || f.after == null);
  // text fields: word-level; structured values (components, dynamic zones, lists): pretty JSON, line-level
  const ops = React.useMemo(() => {
    if (textual) {
      const split = (s: any) => (s ? String(s).split(/(\s+)/).filter((x) => x !== '') : []);
      return diffTokens(split(f.before), split(f.after));
    }
    const a = asLines(f.before), b = asLines(f.after);
    return diffTokens(a, b).map((o) => ({ ...o, v: `${o.v}\n` }));
  }, [f, textual]);
  const tone = f.change === 'added' ? 'success' : f.change === 'removed' ? 'danger' : 'secondary';
  return (
    <Box paddingBottom={4}>
      <Flex gap={2} alignItems="center" paddingBottom={1}>
        <Typography fontWeight="bold">{f.label}</Typography>
        <Badge>{f.change}</Badge>
      </Flex>
      <Flex gap={3} alignItems="flex-start">
        <Box style={{ flex: 1, minWidth: 0, borderLeft: '3px solid #f5c0b8', paddingLeft: 8 }} data-tone={tone}><Side ops={ops} side="before" /></Box>
        <Box style={{ flex: 1, minWidth: 0, borderLeft: '3px solid #c6f0c2', paddingLeft: 8 }}><Side ops={ops} side="after" /></Box>
      </Flex>
    </Box>
  );
}

/* ---------------- component ---------------- */
export const VersionHistory = ({ uid, documentId, locale, onChanged }: { uid: string; documentId: string; locale: string; onChanged?: () => void }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const user = useAuth('VersionHistory', (s: any) => s.user);
  const roles: string[] = (user?.roles ?? []).map((r: any) => r.name);
  const isSuper = (user?.roles ?? []).some((r: any) => r.code === 'strapi-super-admin');
  const mayRestore = isSuper || roles.includes('Publisher') || roles.some((r) => AUTHOR_ROLES.includes(r));

  const [data, setData] = React.useState<VersionsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<number[]>([]);
  const [cmp, setCmp] = React.useState<Compare | null>(null);
  const [cmpLoading, setCmpLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const { data: d }: any = await get('/poc/versions', { params: { uid, documentId, locale } });
      setData(d);
    } catch (e: any) {
      setData(null);
      setError(e?.response?.status === 404 ? 'No history yet.' : e?.response?.data?.error?.message ?? 'Could not load the version history.');
    }
  }, [get, uid, documentId, locale]);

  React.useEffect(() => { setPicked([]); load(); }, [load]);

  const compare = async (from: string | number, to: string | number) => {
    setCmpLoading(true);
    setCmp(null);
    try {
      const { data: d }: any = await get('/poc/versions/compare', { params: { uid, documentId, locale, from, to } });
      setCmp(d);
    } catch (e: any) {
      toggleNotification({ type: 'danger', message: e?.response?.data?.error?.message ?? 'Comparison failed' });
    }
    setCmpLoading(false);
  };

  const restore = async (v: Version) => {
    if (!window.confirm(`Restore version ${v.number} into the draft? It will have to be reviewed, approved and published again. The current draft is kept in the history.`)) return;
    setBusy(true);
    try {
      const { data: d }: any = await post('/poc/rollback', { uid, documentId, locale, sequence: v.sequence });
      toggleNotification({ type: 'success', message: `Version ${v.number} restored to the draft — it now needs approval again.` });
      if (d?.skippedFields?.length) toggleNotification({ type: 'warning', message: `Not restored (re-add by hand): ${d.skippedFields.join(', ')}` });
      await load();
      onChanged?.();
    } catch (e: any) {
      toggleNotification({ type: 'danger', message: e?.response?.data?.error?.message ?? 'Restore failed' });
    }
    setBusy(false);
  };

  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p.slice(-1), n]));
  const bySeq = (n: number) => data?.versions.find((v) => v.number === n);

  if (error) return <Typography variant="pi" textColor="neutral600">{error}</Typography>;
  if (!data) return <Loader small />;

  const curNo = data.current.versionNumber;
  const liveNo = data.live?.versionNumber ?? null;

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Typography variant="pi" textColor="neutral600">
        {curNo ? `The current draft is identical to version ${curNo}.` : 'The current draft has changes that are not in the history yet.'}
        {data.live ? (data.live.differsFromDraft ? ' The live page differs from the draft.' : ' The live page matches the draft.') : ' Not published.'}
      </Typography>

      <Flex gap={2} wrap="wrap">
        {data.live && <Button size="S" variant="secondary" onClick={() => compare('live', 'current')}>Live vs draft</Button>}
        <Button size="S" variant="secondary" disabled={picked.length !== 2} onClick={() => { const [a, b] = [...picked].sort((x, y) => x - y); compare(bySeq(a)!.sequence, bySeq(b)!.sequence); }}>
          Compare selected ({picked.length}/2)
        </Button>
      </Flex>

      <Box>
        {data.versions.length === 0 && <Typography variant="pi" textColor="neutral600">No versions recorded yet.</Typography>}
        {data.versions.map((v) => (
          <Box key={v.sequence} paddingTop={2} paddingBottom={2} style={{ borderBottom: '1px solid #eaeaef' }}>
            <Flex gap={2} alignItems="flex-start">
              <input type="checkbox" aria-label={`Select version ${v.number}`} checked={picked.includes(v.number)} onChange={() => toggle(v.number)} style={{ marginTop: 4 }} />
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Flex gap={1} wrap="wrap" alignItems="center">
                  <Typography fontWeight="bold">Version {v.number}</Typography>
                  <Typography variant="pi" textColor="neutral600">{KIND_LABEL[v.kind]}</Typography>
                  {v.number === curNo && <Badge>Current draft</Badge>}
                  {v.number === liveNo && <Badge>Live</Badge>}
                  {v.published.length > 0 && v.number !== liveNo && <Badge>Published</Badge>}
                </Flex>
                <Typography variant="pi" tag="p" textColor="neutral600">{fmt(v.at)} · {v.actor ?? 'system'}</Typography>
                {v.note && <Typography variant="pi" tag="p" textColor="neutral600">{v.note}</Typography>}
                <Flex gap={1} paddingTop={1}>
                  <Button size="S" variant="tertiary" onClick={() => compare(v.sequence, 'current')}>vs current</Button>
                  {mayRestore && v.number !== curNo && <Button size="S" variant="tertiary" disabled={busy} onClick={() => restore(v)}>Restore</Button>}
                </Flex>
              </Box>
            </Flex>
          </Box>
        ))}
      </Box>

      <Modal.Root open={cmpLoading || cmp !== null} onOpenChange={(o: boolean) => { if (!o) { setCmp(null); setCmpLoading(false); } }}>
        <Modal.Content>
          <Modal.Header><Modal.Title>Compare versions</Modal.Title></Modal.Header>
          <Modal.Body>
            {cmpLoading || !cmp ? <Loader small /> : (
              <>
                <Flex gap={3} paddingBottom={4}>
                  <Box style={{ flex: 1 }}><Typography fontWeight="bold" tag="p">{cmp.from.label}</Typography><Typography variant="pi" textColor="neutral600">{fmt(cmp.from.at)} {cmp.from.actor ? `· ${cmp.from.actor}` : ''}</Typography></Box>
                  <Box style={{ flex: 1 }}><Typography fontWeight="bold" tag="p">{cmp.to.label}</Typography><Typography variant="pi" textColor="neutral600">{fmt(cmp.to.at)} {cmp.to.actor ? `· ${cmp.to.actor}` : ''}</Typography></Box>
                </Flex>
                {cmp.identical ? <Typography>These two versions have identical content.</Typography> : (
                  <>
                    <Box paddingBottom={3}><Typography variant="pi" textColor="neutral600">{cmp.fields.length} field{cmp.fields.length === 1 ? '' : 's'} changed, {cmp.unchanged} unchanged. Left = older, right = newer; removed text is struck through in red, added text is green.</Typography></Box>
                    {cmp.fields.map((f) => <FieldView key={f.field} f={f} />)}
                  </>
                )}
              </>
            )}
          </Modal.Body>
          <Modal.Footer><Modal.Close><Button variant="tertiary">Close</Button></Modal.Close></Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </Flex>
  );
};
