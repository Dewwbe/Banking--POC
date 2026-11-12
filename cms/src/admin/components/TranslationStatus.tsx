import * as React from 'react';
import { Badge, Box, Button, Flex, Loader, Typography } from '@strapi/design-system';
import { useAuth, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Link } from 'react-router-dom';

/**
 * Translation status + cross-language consistency report for ONE content item (all languages vs the source language).
 * Used in the Translations screen and in the Content Manager edit screen's side panel. Server: src/poc/translations.ts.
 */

type Issue = { severity: 'error' | 'warning'; rule: string; field: string; message: string };
type Report = { locale: string; exists: boolean; stage: string | null; live: boolean; outdated: boolean; issues: Issue[] };
type Status = { sourceLocale: string; sourceExists: boolean; sourceStage: string | null; locales: Report[] };

const LANG: Record<string, string> = { en: 'English', si: 'Sinhala', ta: 'Tamil' };
const STAGE: Record<string, string> = { draft: 'Draft', in_review: 'In review', changes_requested: 'Changes requested', awaiting_approval: 'Awaiting approval', approved: 'Approved' };
const SINGLE = ['api::home.home', 'api::about-us.about-us', 'api::contact-us.contact-us', 'api::seo-setting.seo-setting'];
const AUTHOR_ROLES = ['Author', 'Promotions Administrator', 'Branch Administrator'];

export const editorPath = (uid: string, documentId: string, locale: string) =>
  `/content-manager/${SINGLE.includes(uid) ? 'single-types' : 'collection-types'}/${uid}${SINGLE.includes(uid) ? '' : `/${documentId}`}?plugins[i18n][locale]=${locale}`;

export const TranslationStatus = ({ uid, documentId, onChanged }: { uid: string; documentId: string; onChanged?: () => void }) => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();
  const user = useAuth('TranslationStatus', (s: any) => s.user);
  const roles: string[] = (user?.roles ?? []).map((r: any) => r.name);
  const isSuper = (user?.roles ?? []).some((r: any) => r.code === 'strapi-super-admin');
  const canTranslate = isSuper || roles.some((r) => AUTHOR_ROLES.includes(r));

  const [data, setData] = React.useState<Status | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const { data: d }: any = await get('/poc/translations/status', { params: { uid, documentId } });
      setData(d);
    } catch (e: any) {
      setData(null);
      setError(e?.response?.data?.error?.message ?? 'Could not load the translation status.');
    }
  }, [get, uid, documentId]);

  React.useEffect(() => { setData(null); load(); }, [load]);

  const act = async (what: 'create' | 'confirm', locale: string, ok: string) => {
    setBusy(`${what}:${locale}`);
    try {
      await post(`/poc/translations/${what}`, { uid, documentId, locale });
      toggleNotification({ type: 'success', message: ok });
      await load();
      onChanged?.();
    } catch (e: any) {
      toggleNotification({ type: 'danger', message: e?.response?.data?.error?.message ?? 'Action failed' });
    }
    setBusy(null);
  };

  if (error) return <Typography variant="pi" textColor="neutral600">{error}</Typography>;
  if (!data) return <Loader small />;
  if (!data.sourceExists) return <Typography variant="pi" textColor="neutral600">There is no {LANG[data.sourceLocale] ?? data.sourceLocale} (source) version yet.</Typography>;

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Typography variant="pi" textColor="neutral600">
        {LANG[data.sourceLocale] ?? data.sourceLocale} is the source language. Errors block publishing that language; warnings do not.
      </Typography>
      {data.locales.map((l) => {
        const errors = l.issues.filter((i) => i.severity === 'error');
        const warnings = l.issues.filter((i) => i.severity === 'warning');
        return (
          <Box key={l.locale} paddingBottom={3} style={{ borderBottom: '1px solid #eaeaef' }}>
            <Flex gap={2} wrap="wrap" alignItems="center">
              <Typography fontWeight="bold">{LANG[l.locale] ?? l.locale}</Typography>
              {!l.exists ? <Badge>Missing</Badge> : (
                <>
                  <Badge>{STAGE[l.stage ?? 'draft'] ?? l.stage}</Badge>
                  {l.live && <Badge>Live</Badge>}
                  {l.outdated && <Badge>Outdated</Badge>}
                  {errors.length === 0 && warnings.length === 0 && <Badge>Consistent</Badge>}
                </>
              )}
            </Flex>

            {!l.exists && (
              <Flex gap={2} paddingTop={2} wrap="wrap" alignItems="center">
                {canTranslate && (
                  <Button size="S" disabled={busy !== null} loading={busy === `create:${l.locale}`} onClick={() => act('create', l.locale, `${LANG[l.locale]} draft created from ${LANG[data.sourceLocale]}`)}>
                    Start translation
                  </Button>
                )}
                <Typography variant="pi" textColor="neutral600">Visitors see the {LANG[data.sourceLocale]} version (language fallback).</Typography>
              </Flex>
            )}

            {errors.map((i, n) => <Typography key={`e${n}`} variant="pi" tag="p" textColor="danger600">● {i.message}</Typography>)}
            {warnings.map((i, n) => <Typography key={`w${n}`} variant="pi" tag="p" textColor="warning600">▲ {i.message}</Typography>)}

            {l.exists && (
              <Flex gap={2} paddingTop={2} wrap="wrap">
                <Link to={editorPath(uid, documentId, l.locale)} style={{ fontSize: 12 }}>Open {LANG[l.locale]} editor</Link>
                {canTranslate && l.outdated && (
                  <Button size="S" variant="secondary" disabled={busy !== null} loading={busy === `confirm:${l.locale}`} onClick={() => act('confirm', l.locale, `${LANG[l.locale]} confirmed as still correct`)}>
                    Mark still correct
                  </Button>
                )}
              </Flex>
            )}
          </Box>
        );
      })}
    </Flex>
  );
};
