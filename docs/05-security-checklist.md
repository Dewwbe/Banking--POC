# Security checklist

Complete during Day 3. "Config" = where in this repository the control lives.

| Area | Control | Config | Test ID | Status | Notes |
|---|---|---|---|---|---|
| Admin auth | Strong admin passwords | Strapi built-in rules | SEC-01 | | Record actual policy; cannot be customised without code |
| Admin auth | Session lifetime | `cms/config/admin.ts` `auth.sessions` | SEC-02 | | |
| Admin auth | Failed-login throttling | `cms/config/admin.ts` `rateLimit` + nginx `admin_login` zone | SEC-03 | Smoke ✔ | Failed logins not in audit trail — capture proxy logs |
| Admin auth | MFA | Not native (SEC-04). Infra: `oauth2-proxy` + Entra Conditional Access (`docs/08-sso-mfa-setup.md`) | SEC-04 / SEC-04b | | Native = no code path, any tier. Infra gate enforces MFA before Strapi is reached; does not add MFA to Strapi's own login form |
| Admin auth | SSO (Entra ID) | Not native (SEC-05); Growth add-on / Enterprise for true single-login SSO. Infra: `infra/nginx/nginx-sso.conf` + `oauth2-proxy` (`docs/08-sso-mfa-setup.md`) | SEC-05 / SEC-05b | | Infra gate blocks unauthenticated `/admin` access; Strapi's own login still runs after it (two logins) — not equivalent to Enterprise auto-provisioned SSO |
| Admin auth | First-run Super Admin registration | network restriction from first deploy; seed Super Admin from secrets | SEC-20 | | Anyone reaching /admin on an empty install can register |
| Network | `/admin` and admin API only from bank networks | `infra/nginx/nginx.conf` `geo $admin_allowed` | SEC-10/11 | | Admin API paths: `/admin`, `/content-manager`, `/upload`, `/i18n`, … |
| Network | DB not exposed | `docker-compose.yml` (no ports on db) | SEC-18 | | |
| Network | Edge rate limiting / WAF | nginx `public_api` zone | SEC-16 | | Production: WAF/CDN |
| Network | Content API write methods blocked at edge | nginx `limit_except GET` | — | | |
| API | Public role read-only, published only | `cms/src/poc/rbac.ts` | API-01..04 | Smoke ✔ | |
| API | Drafts not readable publicly | `workflow.ts` read guard | SEC-09 | Smoke ✔ | Record native behaviour with flag off |
| API | No publishing via content API | `workflow.ts` | SEC-08 | Smoke ✔ | |
| API | Token hygiene (read-only for Next.js, lifespan, rotation) | Settings → API Tokens | SEC-06/07 | | No full-access tokens in prod |
| API | GraphQL disabled or limited | `cms/config/plugins.ts` | SEC-17 | | depthLimit 7, amountLimit 100, no introspection in prod |
| API | Pagination cap | `cms/config/api.ts` maxLimit 100 | — | | |
| API | U&P self-registration disabled | `rbac.ts` | SEC-21 | | |
| Browser | CORS allow-list | `cms/config/middlewares.ts` | SEC-15 | | |
| Browser | CSP / HSTS / frame-deny | middlewares + nginx + `web/next.config.ts` | SEC-19 | | |
| Uploads | Size limit | `UPLOAD_MAX_FILE_SIZE_MB`, nginx `client_max_body_size` | SEC-13 | | |
| Uploads | MIME allow/deny lists | `cms/config/plugins.ts` `security` | SEC-12 | | Verify behaviour on 5.58; SVG denied |
| Uploads | Malware scanning | — | SEC-14 | | Design: upload lifecycle → ClamAV (clamd) → reject |
| Secrets | Not in Git; rotated | `.env` (gitignored); production → vault | — | | APP_KEYS, JWT secrets, ENCRYPTION_KEY, DB password |
| Webhook | Shared secret, constant-time compare, network-restricted | `web/app/api/revalidate`, nginx | — | | |
| Logging | Security events | custom audit (`event:*`) + proxy logs | AUD-09 | | Forward to SIEM |
| Supply chain | Pinned versions, `npm audit`, upgrade cadence | package.json | OPS-09 | | Strapi releases frequently; budget for upgrades |
| Containers | Non-root runtime images | `cms/Dockerfile`, `web/Dockerfile` (production targets) | — | | |