import * as React from 'react';
import { Box, Flex, Loader, Typography } from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import { Link } from 'react-router-dom';

/**
 * Homepage widget: the latest entries of the custom audit trail (cms/src/poc/audit.ts). It is registered with the
 * audit-log read permission, so Strapi only shows it to users who may read the Audit Log (the Super Admin); every
 * other role never sees it and the API would refuse them anyway.
 */

const AUDIT_UID = 'api::audit-log.audit-log';
const LIST_URL = `/content-manager/collection-types/${AUDIT_UID}`;

type Entry = {
  id: number;
  sequence: number;
  occurredAt: string;
  action: string;
  outcome: 'allowed' | 'denied';
  actorEmail: string;
  contentType: string | null;
  reason: string | null;
};

const shortType = (uid: string | null) => (uid ? uid.replace(/^api::[^.]+\./, '') : '');

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export const AuditFeed = () => {
  const client = useFetchClient();
  const [rows, setRows] = React.useState<Entry[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    client
      .get(LIST_URL, { params: { page: 1, pageSize: 12, sort: 'sequence:desc' } })
      .then(({ data }: any) => !cancelled && setRows(data.results as Entry[]))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <Typography variant="omega" textColor="danger600">Could not load the audit trail.</Typography>;
  if (!rows) return <Loader small />;

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      {rows.map((r) => (
        <Box key={r.id}>
          <Typography variant="omega" fontWeight="bold" textColor={r.outcome === 'denied' ? 'danger600' : undefined}>
            {r.action}
            {r.outcome === 'denied' ? ' (denied)' : ''}
          </Typography>
          <Box>
            <Typography variant="pi" textColor="neutral600">
              {r.actorEmail} · {when(r.occurredAt)}
              {r.contentType ? ` · ${shortType(r.contentType)}` : ''}
            </Typography>
          </Box>
          {r.reason && (
            <Box>
              <Typography variant="pi" textColor="neutral600">
                {r.reason}
              </Typography>
            </Box>
          )}
        </Box>
      ))}
      <Box paddingTop={1}>
        <Link to={LIST_URL} style={{ color: 'inherit' }}>
          <Typography variant="omega">Open the full audit log</Typography>
        </Link>
      </Box>
    </Flex>
  );
};
