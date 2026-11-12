import * as React from 'react';
import { Badge, Box, Button, Flex, Loader, SingleSelect, SingleSelectOption, Table, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { Layouts, useFetchClient } from '@strapi/strapi/admin';
import { TranslationStatus } from '../components/TranslationStatus';

/**
 * Translation Center — every governed item × language at a glance (missing / stage / live / outdated), with the
 * consistency report of the selected item on the right. Each language keeps its own draft → review → approval →
 * publish workflow (see Workflow Center); this screen shows where translation work is needed.
 */

type Cell = { exists: boolean; stage?: string; live?: boolean; outdated?: boolean };
type Row = { documentId: string; title: string; cells: Record<string, Cell> };
type Overview = { sourceLocale: string; locales: string[]; types: Array<{ uid: string; label: string; items: Row[] }> };

const STAGE_SHORT: Record<string, string> = { draft: 'Draft', in_review: 'Review', changes_requested: 'Changes', awaiting_approval: 'Approval', approved: 'Approved' };
const needsWork = (r: Row, source: string) => Object.entries(r.cells).some(([l, c]) => l !== source && (!c.exists || c.outdated));

function CellView({ c }: { c: Cell }) {
  if (!c.exists) return <Badge>Missing</Badge>;
  return (
    <Flex gap={1} wrap="wrap">
      <Badge>{STAGE_SHORT[c.stage ?? 'draft'] ?? c.stage}</Badge>
      {c.live && <Badge>Live</Badge>}
      {c.outdated && <Badge>Outdated</Badge>}
    </Flex>
  );
}

export const TranslationCenter = () => {
  const { get } = useFetchClient();
  const [data, setData] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [type, setType] = React.useState('');
  const [onlyWork, setOnlyWork] = React.useState(false);
  const [sel, setSel] = React.useState<{ uid: string; row: Row; label: string } | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const { data: d }: any = await get('/poc/translations/overview');
      setData(d);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Could not load the translation overview.');
    }
  }, [get]);

  React.useEffect(() => { load(); }, [load]);

  const total = data?.types.flatMap((t) => t.items) ?? [];
  const missing = total.reduce((n, r) => n + Object.entries(r.cells).filter(([l, c]) => l !== data?.sourceLocale && !c.exists).length, 0);
  const outdated = total.reduce((n, r) => n + Object.values(r.cells).filter((c) => c.outdated).length, 0);

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Translation Center"
        subtitle="Where each language stands. English is the source; Sinhala and Tamil follow it, each with its own review and approval. Visitors see English wherever a translation is not published (language fallback)."
        primaryAction={<Button variant="tertiary" onClick={load}>Refresh</Button>}
      />
      <Layouts.Content>
        {error && <Typography textColor="danger600">{error}</Typography>}
        {!data && !error && <Loader small />}
        {data && (
          <>
            <Flex gap={4} wrap="wrap" paddingBottom={4}>
              <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} style={{ minWidth: 160 }}><Typography variant="sigma" textColor="neutral600">Items</Typography><Typography variant="alpha" tag="p">{total.length}</Typography></Box>
              <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} style={{ minWidth: 160 }}><Typography variant="sigma" textColor="neutral600">Missing translations</Typography><Typography variant="alpha" tag="p">{missing}</Typography></Box>
              <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} style={{ minWidth: 160 }}><Typography variant="sigma" textColor="neutral600">Outdated translations</Typography><Typography variant="alpha" tag="p">{outdated}</Typography></Box>
            </Flex>
            <Flex gap={3} alignItems="center" paddingBottom={4} wrap="wrap">
              <Box width="240px">
                <SingleSelect aria-label="Content type" placeholder="All content types" value={type || undefined} onChange={(v: any) => setType(String(v ?? ''))} onClear={() => setType('')}>
                  {data.types.map((t) => <SingleSelectOption key={t.uid} value={t.uid}>{t.label}</SingleSelectOption>)}
                </SingleSelect>
              </Box>
              <Button variant={onlyWork ? 'default' : 'secondary'} size="S" onClick={() => setOnlyWork(!onlyWork)}>Only items needing translation work</Button>
            </Flex>

            <Flex alignItems="flex-start" gap={5}>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {data.types.filter((t) => !type || t.uid === type).map((t) => {
                  const rows = t.items.filter((r) => !onlyWork || needsWork(r, data.sourceLocale));
                  if (!rows.length) return null;
                  return (
                    <Box key={t.uid} paddingBottom={6}>
                      <Box paddingBottom={2}><Typography variant="delta" tag="h2">{t.label}</Typography></Box>
                      <Table colCount={1 + data.locales.length} rowCount={rows.length}>
                        <Thead>
                          <Tr>
                            <Th><Typography variant="sigma">Title</Typography></Th>
                            {data.locales.map((l) => <Th key={l}><Typography variant="sigma">{l.toUpperCase()}{l === data.sourceLocale ? ' (source)' : ''}</Typography></Th>)}
                          </Tr>
                        </Thead>
                        <Tbody>
                          {rows.map((r) => (
                            <Tr key={r.documentId} onClick={() => setSel({ uid: t.uid, row: r, label: t.label })} style={{ cursor: 'pointer', background: sel?.row.documentId === r.documentId ? '#f0f0ff' : undefined }}>
                              <Td><Typography fontWeight={sel?.row.documentId === r.documentId ? 'bold' : undefined}>{r.title}</Typography></Td>
                              {data.locales.map((l) => <Td key={l}><CellView c={r.cells[l] ?? { exists: false }} /></Td>)}
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </Box>
                  );
                })}
              </Box>

              <Box background="neutral0" hasRadius shadow="filterShadow" padding={5} width="420px" style={{ flexShrink: 0 }}>
                {!sel ? <Typography textColor="neutral600">Select an item to see its consistency report and translation actions.</Typography> : (
                  <>
                    <Typography variant="delta" tag="h2">{sel.row.title}</Typography>
                    <Box paddingBottom={3}><Typography variant="pi" textColor="neutral600">{sel.label}</Typography></Box>
                    <TranslationStatus key={sel.row.documentId} uid={sel.uid} documentId={sel.row.documentId} onChanged={load} />
                  </>
                )}
              </Box>
            </Flex>
          </>
        )}
      </Layouts.Content>
    </Layouts.Root>
  );
};
