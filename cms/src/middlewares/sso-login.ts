import { randomUUID } from 'node:crypto';
import type { Core } from '@strapi/strapi';
import { writeAudit } from '../poc/audit';
import type { Actor } from '../poc/actor';
import { parseMap } from './sso-binding';

/**
 * "Sign in with Microsoft" for the Strapi admin panel (Community has no native SSO).
 *
 *   GET /sso/entra  — nginx (infra/nginx/nginx-sso.conf) puts this behind the oauth2-proxy auth_request, so a request only
 *                     reaches Strapi once Entra ID (and Conditional-Access MFA) has authenticated the browser, and sets
 *                     X-Forwarded-Email from the verified session. This middleware then:
 *                       1. finds the ACTIVE Strapi admin user whose email equals that Entra email (or its SSO_IDENTITY_MAP entry);
 *                       2. creates a normal Strapi admin session (same refresh-token cookie the password login sets);
 *                       3. redirects to /admin, where the panel picks the session up and shows the role's homepage.
 *
 * Security properties:
 *  - Only existing, active, non-blocked admin users can sign in. Nothing is auto-created: the Super Admin invites users
 *    and assigns their role in Settings → Administration Panel → Users, so the Strapi role (Reviewer, Approver, …) is
 *    always the one an admin chose, never something derived from Entra.
 *  - The X-Forwarded-Email header is trusted ONLY because Strapi is reachable solely through nginx
 *    (docker-compose.sso.yml unpublishes :1337) and nginx overwrites the header on this one route. Never enable this
 *    flag while port 1337 is exposed: anyone could then send the header themselves and log in as any admin.
 *  - Disabled unless SSO_LOGIN_ENABLED=true. Every success and refusal is written to the audit trail.
 *
 * Email matching: the `email` claim in Entra is not guaranteed to be verified for every account type, so keep the
 * Entra app single-tenant and consider an SSO_IDENTITY_MAP entry for accounts whose Entra email differs.
 */

const enabled = () => process.env.SSO_LOGIN_ENABLED === 'true';

const LOGIN_PAGE = '/admin/auth/login';
const REFRESH_COOKIE = 'strapi_admin_refresh';

type Reason = 'no_identity' | 'not_registered' | 'not_active' | 'blocked' | 'ambiguous' | 'session_error';

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  const actorFor = (ctx: any, id: string, email: string, roles: string[]): Actor => ({
    channel: 'admin',
    id,
    email,
    roles,
    isSuperAdmin: false,
    isPreviewToken: false,
    ip: ctx.request?.ip,
    userAgent: ctx.request?.headers?.['user-agent'],
  });

  function refuse(ctx: any, entraEmail: string | undefined, reason: Reason, detail: string) {
    void writeAudit(strapi, {
      action: 'sso:login',
      outcome: 'denied',
      reason: detail,
      actor: actorFor(ctx, 'sso-login', entraEmail || 'unknown', []),
      after: { entraEmail: entraEmail ?? null, reason },
    }).catch(() => undefined);
    ctx.redirect(`${LOGIN_PAGE}?sso_error=${reason}`);
  }

  /** Same cookie the password login sets (see @strapi/admin authentication controller), session-lifetime. */
  function refreshCookieOptions(ctx: any) {
    const cfg = (key: string) => strapi.config.get(`admin.auth.cookie.${key}`) as any;
    const configuredSecure = cfg('secure');
    const secure = typeof configuredSecure === 'boolean' ? configuredSecure : process.env.NODE_ENV === 'production' && !!ctx.request.secure;
    return {
      httpOnly: true,
      secure,
      overwrite: true,
      domain: cfg('domain') || undefined,
      path: cfg('path') || '/admin',
      sameSite: (cfg('sameSite') ?? 'lax') as 'lax' | 'strict' | 'none',
      maxAge: undefined as number | undefined,
    };
  }

  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.path !== '/sso/entra' || !enabled()) return next();

    const entra = (ctx.request.headers['x-forwarded-email'] as string | undefined)?.trim().toLowerCase();
    if (!entra) return refuse(ctx, entra, 'no_identity', 'no Entra identity on the request (did not come through the SSO gate)');

    // Entra email → Strapi email: identical, or a single SSO_IDENTITY_MAP target.
    const mapped = parseMap(process.env.SSO_IDENTITY_MAP).get(entra);
    if (mapped && mapped.size > 1) return refuse(ctx, entra, 'ambiguous', `SSO_IDENTITY_MAP lists several Strapi accounts for ${entra}`);
    const strapiEmail = mapped ? [...mapped][0] : entra;

    const user: any = await strapi.db.query('admin::user').findOne({ where: { email: strapiEmail }, populate: ['roles'] });
    if (!user) return refuse(ctx, entra, 'not_registered', `no Strapi admin user with email ${strapiEmail}`);
    const roleNames: string[] = (user.roles ?? []).map((r: any) => r.name);
    if (user.blocked) return refuse(ctx, entra, 'blocked', `Strapi user ${strapiEmail} is blocked`);
    if (!user.isActive) return refuse(ctx, entra, 'not_active', `Strapi user ${strapiEmail} has not completed registration`);

    try {
      const manager: any = (strapi as any).sessionManager;
      const { token: refreshToken } = await manager('admin').generateRefreshToken(String(user.id), randomUUID(), {
        type: 'session',
        metadata: { userAgent: ctx.request.headers['user-agent'] },
      });
      ctx.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions(ctx));
    } catch (err: any) {
      strapi.log.error(`[sso-login] could not create admin session for ${strapiEmail}: ${err?.stack ?? err}`);
      return refuse(ctx, entra, 'session_error', 'session creation failed');
    }

    // Feeds the existing admin-events listener, so the login lands in the audit trail like a password login does.
    strapi.eventHub.emit('admin.auth.success', {
      user: { id: user.id, email: user.email, firstname: user.firstname, lastname: user.lastname },
      provider: 'entra',
    });
    void writeAudit(strapi, {
      action: 'sso:login',
      outcome: 'allowed',
      actor: actorFor(ctx, String(user.id), user.email, roleNames),
      after: { entraEmail: entra, strapiEmail: user.email, roles: roleNames },
    }).catch(() => undefined);

    ctx.redirect('/admin');
  };
};
