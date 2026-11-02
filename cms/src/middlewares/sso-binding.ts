import type { Core } from '@strapi/strapi';
import { writeAudit } from '../poc/audit';
import type { Actor } from '../poc/actor';

/**
 * Binds the Entra ID identity that passed the oauth2-proxy gate to the Strapi admin account in use.
 *
 * Without this, any Entra user who clears the gate can type ANY Strapi admin's password, and the audit log
 * would attribute the action to that Strapi user. With it:
 *   - POST /admin/login is refused unless the Entra email (X-Forwarded-Email, set by nginx) is allowed to use
 *     the Strapi email in the request body;
 *   - every later admin API call carrying an admin Bearer token is refused unless the token's user is allowed
 *     for the Entra email on THAT request (a stolen admin token is useless from another Entra session).
 *
 * Allowed means: Strapi email == Entra email (case-insensitive), or listed in SSO_IDENTITY_MAP
 * (`entra@x=strapi1@y|strapi2@y;entra2@x=strapi3@y`). Fail closed: no Entra header → refused.
 *
 * Only safe if the CMS port is NOT reachable except through nginx (docker-compose.sso.yml), because the
 * headers are plain HTTP headers a direct caller could forge.
 */

const enforced = () => process.env.SSO_BINDING_ENFORCED === 'true';

export function parseMap(raw: string | undefined): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const entry of (raw ?? '').split(';')) {
    const [entra, targets] = entry.split('=');
    if (!entra?.trim() || !targets?.trim()) continue;
    map.set(entra.trim().toLowerCase(), new Set(targets.split('|').map((t) => t.trim().toLowerCase()).filter(Boolean)));
  }
  return map;
}

export function isBound(entraEmail: string, strapiEmail: string, map: Map<string, Set<string>>): boolean {
  const e = entraEmail.trim().toLowerCase();
  const s = strapiEmail.trim().toLowerCase();
  return e === s || (map.get(e)?.has(s) ?? false);
}

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  const emailById = new Map<string, { email: string; expires: number }>();

  async function strapiEmailForToken(token: string): Promise<string | null> {
    const manager: any = (strapi as any).sessionManager;
    const result = manager?.('admin')?.validateAccessToken?.(token);
    if (!result?.isValid) return null; // not an admin token (API token, anonymous, expired) — other layers decide
    const userId = String(result.payload.userId);
    const hit = emailById.get(userId);
    if (hit && hit.expires > Date.now()) return hit.email;
    const numeric = Number(userId);
    const user = await strapi.db.query('admin::user').findOne({
      where: { id: Number.isFinite(numeric) && String(numeric) === userId ? numeric : userId },
      select: ['email'],
    });
    if (!user) return null;
    emailById.set(userId, { email: user.email, expires: Date.now() + 30_000 });
    return user.email;
  }

  async function deny(ctx: any, attempted: string, entra: string | undefined, why: string) {
    const actor: Actor = {
      channel: 'admin',
      id: 'sso-binding',
      email: attempted || 'unknown',
      roles: [],
      isSuperAdmin: false,
      isPreviewToken: false,
      ip: ctx.request?.ip,
      userAgent: ctx.request?.headers?.['user-agent'],
    };
    void writeAudit(strapi, {
      action: 'sso:identity-binding',
      outcome: 'denied',
      reason: why,
      actor,
      after: { entraEmail: entra ?? null, strapiEmail: attempted || null, path: ctx.path },
    }).catch(() => undefined);
    ctx.status = 403;
    ctx.body = { data: null, error: { status: 403, name: 'ForbiddenError', message: 'Your Microsoft identity is not authorised for this CMS account', details: {} } };
  }

  return async (ctx: any, next: () => Promise<void>) => {
    if (!enforced()) return next();

    const isLogin = ctx.method === 'POST' && ctx.path === '/admin/login';
    const authz: string | undefined = ctx.request.headers?.authorization;
    const bearer = authz && /^bearer\s+\S+$/i.test(authz) ? authz.split(/\s+/)[1] : null;
    if (!isLogin && !bearer) return next();

    const entra = (ctx.request.headers['x-forwarded-email'] as string | undefined)?.trim();
    const map = parseMap(process.env.SSO_IDENTITY_MAP);

    let strapiEmail: string | null;
    if (isLogin) strapiEmail = typeof ctx.request.body?.email === 'string' ? ctx.request.body.email : '';
    else strapiEmail = await strapiEmailForToken(bearer as string);
    if (strapiEmail === null) return next(); // bearer is not an admin session token

    if (!entra) return deny(ctx, strapiEmail, entra, 'no Entra identity on the request (request did not come through the SSO gate)');
    if (!isBound(entra, strapiEmail, map)) return deny(ctx, strapiEmail, entra, `Entra identity ${entra} is not bound to Strapi account ${strapiEmail}`);
    return next();
  };
};
