import * as React from 'react';
import { Badge, Box, Button, Flex, Loader, SingleSelect, SingleSelectOption, Table, Tbody, Td, Th, Thead, Tr, Typography } from '@strapi/design-system';
import { Layouts, useFetchClient } from '@strapi/strapi/admin';

/**
 * Analytics dashboard: page traffic overview (1.1.17.1), top content (1.1.17.2) and conversion reporting for key CTAs
 * (1.1.17.3). The numbers are computed on the server (src/poc/analytics.ts) from anonymous events the website sends.
 */

type Daily = { day: string; pageviews: number; visitors: number; clicks: number };
type Report = {
  enabled: boolean; retentionDays: number; lastEventAt: string | null;
  range: { days: number; from: string; to: string };
  overview: { pageviews: number; visitors: number; pagesPerVisitor: number; ctaClicks: number; ctaClickers: number; keyConversions: number; conversionRate: number };
  daily: Daily[];
  bySection: { section: string; pageviews: number; visitors: number }[];
  byLanguage: { language: string; pageviews: number; visitors: number }[];
  topContent: { path: string; title: string; section: string; language: string; pageviews: number; visitors: number; ctaClicks: number; ctaClickShare: number }[];
  conversions: { trackingId: string; label: string; url: string; keyConversion: boolean; clicks: number; clickers: number; clickRate: number; topPages: { path: string; clicks: number }[] }[];
};

const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['180', 'Last 180 days']];
const SECTIONS = ['home', 'products', 'news', 'promotions', 'rates', 'about', 'contact', 'subscribe', 'other'];
const LANGS = [['en', 'English'], ['si', 'Sinhala'], ['ta', 'Tamil']];
const nf = (n: number) => n.toLocaleString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Box background="neutral0" hasRadius shadow="filterShadow" padding={4} style={{ minWidth: 170, flex: '1 1 170px' }}>
      <Typography variant="sigma" textColor="neutral600">{label}</Typography>
      <Typography variant="alpha" tag="p">{value}</Typography>
      {hint && <Typography variant="pi" textColor="neutral600">{hint}</Typography>}
    </Box>
  );
}

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <Box background="neutral0" hasRadius shadow="filterShadow" padding={5} marginBottom={5}>
    <Typography variant="delta" tag="h2">{title}</Typography>
    {sub && <Typography variant="pi" textColor="neutral600" tag="p" style={{ marginBottom: 12 }}>{sub}</Typography>}
    <Box paddingTop={sub ? 0 : 3}>{children}</Box>
  </Box>
);

/** Page views as bars, visitors as a line. Plain SVG: no chart library is loaded into the admin panel. */
function TrafficChart({ daily }: { daily: Daily[] }) {
  const W = 760, H = 220, L = 40, B = 28, T = 10, R = 8;
  const max = Math.max(1, ...daily.map((d) => d.pageviews));
  const step = (W - L - R) / Math.max(1, daily.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = daily.map((d, i) => `${i ? 'L' : 'M'}${(L + step * i + step / 2).toFixed(1)},${y(d.visitors).toFixed(1)}`).join(' ');
  const every = Math.ceil(daily.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Page views and visitors per day" style={{ width: '100%', height: 'auto', maxHeight: 260 }}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#eaeaef" />
          <text x={L - 6} y={y(max * f) + 4} fontSize="11" textAnchor="end" fill="#666687">{Math.round(max * f)}</text>
        </g>
      ))}
      {daily.map((d, i) => (
        <g key={d.day}>
          <rect x={L + step * i + step * 0.15} y={y(d.pageviews)} width={step * 0.7} height={H - B - y(d.pageviews)} fill="#9b8cff" rx={2}>
            <title>{`${d.day}: ${d.pageviews} page views, ${d.visitors} visitors, ${d.clicks} CTA clicks`}</title>
          </rect>
          {i % every === 0 && <text x={L + step * i + step / 2} y={H - 10} fontSize="10" textAnchor="middle" fill="#666687">{d.day.slice(5)}</text>}
        </g>
      ))}
      <path d={line} fill="none" stroke="#4945ff" strokeWidth={2} />
    </svg>
  );
}

/** Horizontal share bars for section / language breakdowns. */
function Breakdown({ rows }: { rows: { label: string; value: number }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  if (!rows.length) return <Typography textColor="neutral600">No data in this period.</Typography>;
  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      {rows.map((r) => (
        <div key={r.label}>
          <Flex justifyContent="space-between"><Typography variant="omega">{r.label}</Typography><Typography variant="omega" textColor="neutral600">{nf(r.value)} · {Math.round((r.value / total) * 100)}%</Typography></Flex>
          <div style={{ background: '#eaeaef', borderRadius: 4, height: 8 }}><div style={{ width: `${(r.value / total) * 100}%`, background: '#4945ff', height: 8, borderRadius: 4 }} /></div>
        </div>
      ))}
    </Flex>
  );
}

export const AnalyticsDashboard = () => {
  const { get } = useFetchClient();
  const [data, setData] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState('30');
  const [language, setLanguage] = React.useState('');
  const [section, setSection] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data: d }: any = await get('/poc/analytics/report', { params: { days, language, section } });
      setData(d);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Could not load the analytics report.');
    }
    setLoading(false);
  }, [get, days, language, section]);
  React.useEffect(() => { load(); }, [load]);

  const o = data?.overview;
  const key = (data?.conversions ?? []).filter((c) => c.keyConversion);
  const other = (data?.conversions ?? []).filter((c) => !c.keyConversion);

  const ConversionTable = ({ rows }: { rows: Report['conversions'] }) => (
    <Table colCount={5} rowCount={rows.length}>
      <Thead><Tr><Th>CTA</Th><Th>Clicks</Th><Th>Visitors who clicked</Th><Th>Click rate</Th><Th>Clicked most on</Th></Tr></Thead>
      <Tbody>
        {rows.map((c) => (
          <Tr key={`${c.trackingId}|${c.label}|${c.url}`}>
            <Td>
              <Typography fontWeight="bold">{c.label}</Typography>{' '}
              {c.keyConversion && <Badge>Key</Badge>}
              <Typography variant="pi" textColor="neutral600" tag="p">{c.trackingId ? `${c.trackingId} → ` : ''}{c.url}</Typography>
            </Td>
            <Td>{nf(c.clicks)}</Td><Td>{nf(c.clickers)}</Td><Td>{c.clickRate}%</Td>
            <Td>{c.topPages.map((p) => `${p.path} (${p.clicks})`).join(', ')}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Analytics"
        subtitle="Anonymous traffic and call-to-action activity on the public website. No IP address, cookie or personal data is stored."
        primaryAction={<Button variant="tertiary" onClick={load} loading={loading}>Refresh</Button>}
      />
      <Layouts.Content>
        {error && <Typography textColor="danger600">{error}</Typography>}
        {!data && !error && <Loader small />}
        {data && o && (
          <>
            <Flex gap={3} wrap="wrap" paddingBottom={5} alignItems="center">
              <Box width="180px"><SingleSelect aria-label="Period" value={days} onChange={(v: any) => setDays(String(v))}>{RANGES.map(([v, l]) => <SingleSelectOption key={v} value={v}>{l}</SingleSelectOption>)}</SingleSelect></Box>
              <Box width="180px"><SingleSelect aria-label="Language" placeholder="All languages" value={language || undefined} onChange={(v: any) => setLanguage(String(v ?? ''))} onClear={() => setLanguage('')}>{LANGS.map(([v, l]) => <SingleSelectOption key={v} value={v}>{l}</SingleSelectOption>)}</SingleSelect></Box>
              <Box width="180px"><SingleSelect aria-label="Section" placeholder="All sections" value={section || undefined} onChange={(v: any) => setSection(String(v ?? ''))} onClear={() => setSection('')}>{SECTIONS.map((v) => <SingleSelectOption key={v} value={v}>{cap(v)}</SingleSelectOption>)}</SingleSelect></Box>
              <Typography variant="pi" textColor="neutral600">{data.range.from} → {data.range.to}{data.lastEventAt ? ` · last event ${new Date(data.lastEventAt).toLocaleString()}` : ''}</Typography>
            </Flex>

            {!data.enabled && (
              <Box background="warning100" hasRadius padding={4} marginBottom={5}>
                <Typography>Tracking is switched off: set <b>ANALYTICS_INGEST_TOKEN</b> on the CMS and the website (same value) to start collecting data.</Typography>
              </Box>
            )}
            {data.enabled && o.pageviews === 0 && (
              <Box background="neutral100" hasRadius padding={4} marginBottom={5}><Typography>No traffic recorded for this selection yet. Browse the website, then refresh.</Typography></Box>
            )}

            <Flex gap={4} wrap="wrap" paddingBottom={5}>
              <Stat label="Page views" value={nf(o.pageviews)} />
              <Stat label="Visitors" value={nf(o.visitors)} hint={`${o.pagesPerVisitor} pages per visitor`} />
              <Stat label="CTA clicks" value={nf(o.ctaClicks)} hint={`${nf(o.ctaClickers)} visitors clicked`} />
              <Stat label="Key conversions" value={nf(o.keyConversions)} hint={`${o.conversionRate}% of visitors`} />
            </Flex>

            <Card title="Page traffic" sub="Bars: page views per day. Line: visitors per day. Hover a bar for the numbers.">
              <TrafficChart daily={data.daily} />
              <Flex gap={8} wrap="wrap" paddingTop={5} alignItems="flex-start">
                <Box style={{ flex: '1 1 280px' }}>
                  <Typography variant="sigma" textColor="neutral600">PAGE VIEWS BY SECTION</Typography>
                  <Box paddingTop={2}><Breakdown rows={data.bySection.map((r) => ({ label: cap(r.section), value: r.pageviews }))} /></Box>
                </Box>
                <Box style={{ flex: '1 1 280px' }}>
                  <Typography variant="sigma" textColor="neutral600">PAGE VIEWS BY LANGUAGE</Typography>
                  <Box paddingTop={2}><Breakdown rows={data.byLanguage.map((r) => ({ label: r.language.toUpperCase(), value: r.pageviews }))} /></Box>
                </Box>
              </Flex>
            </Card>

            <Card title="Top content" sub="The most viewed pages in this period, with the CTA clicks they produced.">
              {data.topContent.length === 0 ? <Typography textColor="neutral600">No page views in this period.</Typography> : (
                <Table colCount={6} rowCount={data.topContent.length}>
                  <Thead><Tr><Th>Page</Th><Th>Section</Th><Th>Page views</Th><Th>Visitors</Th><Th>CTA clicks</Th><Th>Clicks per view</Th></Tr></Thead>
                  <Tbody>
                    {data.topContent.map((p) => (
                      <Tr key={p.path}>
                        <Td><Typography fontWeight="bold">{p.title}</Typography><Typography variant="pi" textColor="neutral600" tag="p">{p.path}</Typography></Td>
                        <Td>{cap(p.section)}</Td><Td>{nf(p.pageviews)}</Td><Td>{nf(p.visitors)}</Td><Td>{nf(p.ctaClicks)}</Td><Td>{p.ctaClickShare}%</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Card>

            <Card title="Key CTA conversions" sub="CTAs marked “Key conversion” in the CMS. A conversion here is a click on the button, not a completed application.">
              {key.length === 0
                ? <Typography textColor="neutral600">No key-conversion clicks yet. Tick “Key conversion” (and give a tracking id) on a CTA in the Content Manager.</Typography>
                : <ConversionTable rows={key} />}
            </Card>

            <Card title="All other CTA clicks" sub="Click rate = visitors who clicked ÷ visitors who viewed the pages where it was clicked. A CTA nobody clicked does not appear.">
              {other.length === 0 ? <Typography textColor="neutral600">No other CTA clicks in this period.</Typography> : <ConversionTable rows={other} />}
            </Card>

            <Typography variant="pi" textColor="neutral600" tag="p">
              Visitors are counted per browser session, so one person on two devices counts twice. Visitors who send Do Not Track / Global Privacy Control are not counted. Events are kept {data.retentionDays} days.
            </Typography>
          </>
        )}
      </Layouts.Content>
    </Layouts.Root>
  );
};
