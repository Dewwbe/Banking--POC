# SSO / MFA setup — Entra ID gate in front of `/admin` (Workstream E)

Implements the two open rows from `docs/05-security-checklist.md` (SEC-04 MFA, SEC-05 Entra ID SSO) and
risk register item R-06, using the infra-level pattern: an OIDC reverse-proxy (`oauth2-proxy`) sits in
front of `/admin` and authenticates against Microsoft Entra ID before any request reaches Strapi. MFA is
enforced by an Entra ID **Conditional Access** policy on the app registration, not by any code in this
repository. Strapi itself is not modified — no licence, no patched admin auth files.

**Read this before demoing it:** the gate adds a login, it does not replace Strapi's. A user still goes
through two steps — Microsoft sign-in (+ MFA) first, then Strapi's own admin email/password form second.
That second step is unavoidable on Community: true single-login SSO (the IdP login *is* the Strapi login,
with auto-provisioned accounts) is the Enterprise SSO feature. Call this out explicitly in the PoC report;
it is the main behavioural gap between this workaround and the licensed feature.

## 1. Register the app in Entra ID

In the Azure Portal, under the bank's tenant:

1. **Entra ID → App registrations → New registration**
   - Name: `Strapi Banking CMS — Admin Gate (PoC)`
   - Supported account types: *Accounts in this organizational directory only* (single tenant)
   - Redirect URI: **Web** → `http://localhost:8081/oauth2/callback` (swap the host for the real one outside a local demo; must match `OAUTH2_PROXY_REDIRECT_URL` exactly, including scheme and path)
2. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
3. **Certificates & secrets → New client secret** — copy the secret *value* immediately (shown once).
4. **Token configuration** — the default `openid`, `profile`, `email` scopes are enough; oauth2-proxy doesn't need Graph API permissions for this gate-only pattern.
5. **Enterprise applications → (this app) → Conditional Access** (or *Security → Conditional Access* at the tenant level) — create or extend a policy that targets this app and requires **multifactor authentication**. This is what actually enforces MFA; nothing in this repo does.
6. Scope who can sign in: either restrict assignment to a security group of CMS admins (**Enterprise applications → this app → Properties → Assignment required = Yes**, then assign the group), or leave it open to the tenant and rely on `OAUTH2_PROXY_EMAIL_DOMAINS` as a coarser filter. For a banking PoC, prefer the group restriction — document which you used.

## 2. Configure the repo

In `.env` (see the new block at the bottom of `.env.example`):

```bash
AZURE_TENANT_ID=<Directory (tenant) ID>
AZURE_CLIENT_ID=<Application (client) ID>
AZURE_CLIENT_SECRET=<client secret value>
OAUTH2_PROXY_COOKIE_SECRET=$(python3 -c "import secrets,base64;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())")
OAUTH2_PROXY_REDIRECT_URL=http://localhost:8081/oauth2/callback
OAUTH2_PROXY_EMAIL_DOMAINS=*          # or your tenant's domain, e.g. bank.lk
```

## 3. Run it

```bash
docker compose --profile sso up -d --build
docker compose logs -f proxy-sso oauth2-proxy
```

This starts `proxy-sso` (nginx with the Entra gate, `infra/nginx/nginx-sso.conf`) and `oauth2-proxy` on
ports 8080/8081, instead of the plain `proxy` service — **do not run `--profile proxy` and `--profile sso`
at the same time**, they both bind 8080/8081.

## 4. Demo / test script

| Step | Action | Expected |
|---|---|---|
| SSO-01 | Visit `http://localhost:8081/admin` in a private browser window | Redirected to `login.microsoftonline.com` before anything Strapi-branded appears |
| SSO-02 | Sign in with an account the Conditional Access policy covers | Prompted for the second factor (Authenticator app / SMS / etc., per the policy) |
| SSO-03 | Complete MFA | Redirected back to `http://localhost:8081/admin` — **now shows Strapi's own login form** (expected — see the caveat above) |
| SSO-04 | Log in to Strapi with a seeded test user (`editor@poc.local`, etc.) | Normal admin panel access, same as without the gate |
| SSO-05 | Sign in with an account NOT covered by the Conditional Access policy / not assigned to the app | Access denied at the Microsoft stage, before reaching Strapi at all |
| SSO-06 | Clear cookies / open a fresh private window, `curl -i http://localhost:8081/admin` with no session | `302` to `/oauth2/sign_in`, never reaches `cms:1337` — confirms the gate, not just the browser flow |
| SSO-07 | Repeat SEC-10/11 (IP allow-list) against port 8081 | Still enforced — the gate is additive to the existing `geo $admin_allowed` check, not a replacement |

Record results in `docs/02-test-cases.md` (rows added below) and screenshot SSO-01–SSO-03 for
`docs/evidence/screenshots/` (`D3-SSO-01-entra-redirect.png`, etc.).

## 5. What this does and doesn't prove

**Shown by this setup:**
- `/admin` cannot be reached at all without a valid, Conditional-Access-compliant Entra ID session — a real, working MFA + SSO *gate*, achievable on Community Edition with no Strapi licence.
- The admin API routes (`content-manager`, `upload`, `i18n`, `users-permissions`, etc.) are covered by the same gate, not just the login page.

**Not shown / genuine residual gap vs. Strapi Enterprise SSO:**
- No auto-provisioning — an Entra sign-in does not create or map to a Strapi admin account. You still manage Strapi users/roles separately (as today).
- Two logins, not one — document the UX cost; for a small admin team this is usually acceptable, for a large one it's friction worth costing against a Growth/Enterprise licence (see R-16).
- `admin.auth.success` / `admin.auth.error` events captured by `cms/src/poc/admin-events.ts` reflect the **Strapi** login only — a failed Microsoft/MFA attempt is visible in the Entra ID sign-in logs, not in this repo's audit trail. If the bank needs one unified login audit trail, that's additional integration work (forward Entra sign-in logs to the same SIEM destination as the custom audit log), not something this PoC's audit code does today.
- The Conditional Access policy is doing the actual enforcement; a tenant-wide MFA policy change made outside this repo changes this PoC's behaviour with zero code change — call that out in the report as expected, not a bug.