import * as React from 'react';
import { Box, Flex, Loader, Typography } from '@strapi/design-system';
import { useAuth, useFetchClient } from '@strapi/strapi/admin';
import { Link } from 'react-router-dom';

/**
 * Role-aware homepage widget. The Strapi homepage is the same for everyone, so this is the "dashboard" each approval
 * role lands on after login: it lists the content that is waiting for THAT role, taken from the approval workflow's
 * `workflowStage` field (cms/src/poc/workflow.ts). It only reads through the Content Manager API, so what a user
 * sees is limited by their own permissions.
 */

type Stage = 'draft' | 'in_review' | 'changes_requested' | 'awaiting_approval' | 'approved';

type Queue = { stage: Stage; title: string; hint: string };

const STAGE_TITLES: Record<Stage, string> = {
  draft: 'Drafts',
  in_review: 'Waiting for review',
  changes_requested: 'Changes requested',
  awaiting_approval: 'Waiting for approval',
  approved: 'Approved, ready to publish',
};

const queue = (stage: Stage, hint: string): Queue => ({ stage, title: STAGE_TITLES[stage], hint });

/** Role name → what that role works on. Names are stable; role codes carry a random suffix per environment. */
const QUEUES_BY_ROLE: Record<string, { label: string; queues: Queue[] }> = {
  Author: { label: 'Author', queues: [queue('changes_requested', 'Fix these and submit them for review again.'), queue('draft', 'Finish and submit for review.')], },
  'Promotions Administrator': { label: 'Promotions Administrator', queues: [queue('changes_requested', 'Fix these and submit them for review again.'), queue('draft', 'Finish and submit for review.')], },
  'Branch Administrator': { label: 'Branch Administrator', queues: [queue('changes_requested', 'Fix these and submit them for review again.'), queue('draft', 'Finish and submit for review.')], },
  Editor: { label: 'Editor', queues: [queue('in_review', 'Check the content, then pass it to compliance or request changes.')] },
  'Compliance Reviewer': { label: 'Compliance Reviewer', queues: [queue('awaiting_approval', 'Compliance check: approve or request changes.')] },
  Publisher: { label: 'Publisher', queues: [queue('approved', 'Open the item and press Publish.')] },
};

const ALL_STAGES: Queue[] = (Object.keys(STAGE_TITLES) as Stage[]).map((s) => queue(s, ''));

const TYPES = [
  { uid: 'api::product.product', label: 'Product' },
  { uid: 'api::news-article.news-article', label: 'News article' },
  { uid: 'api::promotion.promotion', label: 'Promotion' },
];

type Item = { documentId: string; locale: string; label: string; type: string; uid: string; updatedAt: string };
type Result = { queue: Queue; items: Item[]; failed: boolean };

async function loadQueue(client: ReturnType<typeof useFetchClient>, q: Queue): Promise<Result> {
  const settled = await Promise.allSettled(
    TYPES.map(async (t) => {
      const { data } = await client.get(`/content-manager/collection-types/${t.uid}`, {
        params: { locale: '*', page: 1, pageSize: 50, sort: 'updatedAt:desc', filters: { $and: [{ workflowStage: { $eq: q.stage } }] } },
      });
      return (data.results as any[])
        // an approved item that is already live has nothing left for the publisher to do
        .filter((r) => !(q.stage === 'approved' && r.status === 'published'))
        .map<Item>((r) => ({
          documentId: r.documentId,
          locale: r.locale,
          label: r.name ?? r.title ?? r.slug ?? r.documentId,
          type: t.label,
          uid: t.uid,
          updatedAt: r.updatedAt,
        }));
    })
  );
  return {
    queue: q,
    failed: settled.some((s) => s.status === 'rejected'),
    items: settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : [])).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export const WorkQueue = () => {
  const client = useFetchClient();
  const user = useAuth('WorkQueue', (s: any) => s.user);
  const roleNames: string[] = (user?.roles ?? []).map((r: any) => r.name);
  const isSuper = (user?.roles ?? []).some((r: any) => r.code === 'strapi-super-admin');

  const matched = roleNames.map((n) => QUEUES_BY_ROLE[n]).filter(Boolean);
  const heading = matched.length ? matched.map((m) => m.label).join(' + ') : isSuper ? 'Super Admin overview' : null;
  const queues = matched.length ? matched.flatMap((m) => m.queues) : isSuper ? ALL_STAGES : [];

  const [results, setResults] = React.useState<Result[] | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all(queues.map((q) => loadQueue(client, q))).then((r) => !cancelled && setResults(r));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return <Loader small />;
  if (!heading) {
    return <Typography variant="omega">Your role has no approval queue. Use the Content Manager from the left menu.</Typography>;
  }
  if (!results) return <Loader small />;

  return (
    <Flex direction="column" alignItems="stretch" gap={5}>
      <Typography variant="omega" textColor="neutral600">
        Signed in as {heading}
      </Typography>
      {results.map(({ queue: q, items, failed }) => (
        <Box key={q.stage}>
          <Typography variant="delta" tag="h3">
            {q.title} ({items.length})
          </Typography>
          {q.hint && (
            <Box paddingTop={1}>
              <Typography variant="pi" textColor="neutral600">
                {q.hint}
              </Typography>
            </Box>
          )}
          <Box paddingTop={2}>
            {failed && (
              <Typography variant="pi" textColor="danger600">
                Some content types could not be loaded.
              </Typography>
            )}
            {!items.length && !failed && (
              <Typography variant="omega" textColor="neutral600">
                Nothing here.
              </Typography>
            )}
            {items.slice(0, 8).map((i) => (
              <Box key={`${i.uid}-${i.documentId}-${i.locale}`} paddingTop={1}>
                <Link
                  to={`/content-manager/collection-types/${i.uid}/${i.documentId}?plugins[i18n][locale]=${i.locale}`}
                  style={{ color: 'inherit' }}
                >
                  <Typography variant="omega">
                    {i.label} <span style={{ opacity: 0.6 }}>· {i.type} · {i.locale}</span>
                  </Typography>
                </Link>
              </Box>
            ))}
            {items.length > 8 && (
              <Box paddingTop={1}>
                <Typography variant="pi" textColor="neutral600">
                  + {items.length - 8} more
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      ))}
    </Flex>
  );
};
