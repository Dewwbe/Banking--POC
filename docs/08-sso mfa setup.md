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

Also set `PUBLIC_URL=http://localhost:8081` and `IS_PROXIED=true` — the admin UI calls its API at `PUBLIC_URL`,
so leaving it on `:1337` sends admin traffic around the gate.

## 3. Run it

Use the override file so the CMS port (1337) is not published on the host. **Without it, `http://localhost:1337/admin`
shows Strapi's login with no Entra step at all.** Always browse `http://localhost:8081/admin`.

```bash
docker compose -f docker-compose.yml -f docker-compose.sso.yml --profile sso up -d --build --force-recreate
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

## 6. Entra identity -> Strapi account binding

Closes the main gap of the gate-only pattern: without it, anyone who clears Entra/MFA can type *any* Strapi admin's
password, and the audit log would blame that Strapi user. `cms/src/middlewares/sso-binding.ts` (enabled with
`SSO_BINDING_ENFORCED=true`) refuses:

- `POST /admin/login` unless the Entra email (header `X-Forwarded-Email`, set by nginx from oauth2-proxy) may use the
  Strapi email in the request body;
- **every later admin API call** unless the Bearer token's user may be used by the Entra email on *that* request,
  so a stolen admin token is useless from another Entra session.

A Strapi email is allowed if it equals the Entra email (case-insensitive) or is listed in `SSO_IDENTITY_MAP`
(`entra@x=strapi1@y|strapi2@y;entra2@x=strapi3@y`). It fails closed: no Entra header means refused. Every refusal is
written to the audit log as `sso:identity-binding` (outcome `denied`) with the Entra and Strapi emails.

**Production:** give each person one Strapi account whose email equals their Entra email and leave the map empty.
The demo map in `.env` lets one tester use all role accounts, which defeats separation of duties between *people*,
so do not carry it into UAT/prod.

**Trust boundary:** the headers are ordinary HTTP headers. This is only sound while the CMS port is not reachable except
through nginx (`docker-compose.sso.yml`). The flag defaults to `false`, so the plain `--profile proxy` stack is unchanged.

| Step | Action | Expected |
|---|---|---|
| SSO-08 | Sign in via Entra, then log in to Strapi as an account mapped to you | Normal access |
| SSO-09 | Same session, log in as an unmapped account | `403 Your Microsoft identity is not authorised for this CMS account` + `sso:identity-binding` denied row in the audit log |
| SSO-10 | Reuse a valid admin token from a different Entra session | `403`, audit row |

## 7. Combined login: email/password **or** "Sign in with Microsoft"

`infra/nginx/nginx-sso.conf` now serves **both** sign-in methods on the Strapi login page (`/admin`). The previous
"whole `/admin` behind Entra, then Strapi's form" layout is kept as `infra/nginx/nginx-sso-gate-only.conf`; mount that
file in `docker-compose.yml` (`proxy-sso`) to go back to it.

| Path | What happens |
|---|---|
| Email + password | Unchanged Strapi login. nginx only applies the IP allow-list and the login rate limit. **No Entra/MFA on this path.** |
| Sign in with Microsoft | The button links to `/sso/entra`. nginx runs the oauth2-proxy `auth_request`, so the browser is sent to Entra (Conditional Access / MFA applies) and back. Strapi (`cms/src/middlewares/sso-login.ts`, flag `SSO_LOGIN_ENABLED=true`) then opens a normal admin session for the **active** Strapi user whose email equals the Entra email, and redirects to `/admin`. |

Rules: nobody is created automatically; an Entra user with no matching Strapi account, an unfinished invitation, or a
blocked account is returned to the login page with an explanation. Success and refusal are audited as `sso:login`.
`SSO_IDENTITY_MAP` (section 6) may map one Entra email to **one** Strapi account. Because the password path now exists, leave
`SSO_BINDING_ENFORCED=false` (that middleware requires an Entra header on every admin login).

**Trust boundary (important):** Strapi trusts `X-Forwarded-Email` on `/sso/entra`. nginx overwrites it from the verified
session on that route and blanks it everywhere else, but the CMS must still not be reachable except through nginx
(`docker-compose.sso.yml` unpublishes :1337). With :1337 exposed, anyone could send that header and log in as any admin.

**Security trade-off:** because the password path no longer goes through Entra, a leaked password is enough to sign
in. To enforce MFA for everyone, use `nginx-sso-gate-only.conf`, or remove password logins for admins.

### Adding users and assigning roles

Super Admin only: **Settings → Administration Panel → Users → Invite new user**. Enter name, email and role (Bank Editor,
Bank Reviewer, Bank Approver, Bank Publisher, ...). Strapi shows an invitation link (it is emailed only if an email
provider is configured); the user opens it and sets a password. After that they can use either sign-in method. The
Microsoft email must match the invited email. To change a role later: Users → edit → Roles.

### Role dashboards

After login every user lands on the admin homepage, which now has a **My work queue** widget (`cms/src/admin/widgets/WorkQueue.tsx`)
that lists the Product, News article and Promotion items waiting for the user's role, each linking to the item:

| Role | Queue |
|---|---|
| Bank Editor / News Editor | Changes requested, Drafts |
| Bank Reviewer | Waiting for review |
| Bank Approver | Waiting for approval |
| Bank Publisher | Approved, ready to publish (not yet live) |
| Super Admin | All five stages |

Single types (Home, About Us, Contact Us) are not listed in the queue. Content is read through the Content Manager API,
so each user only sees what their own permissions allow.

| Step | Action | Expected |
|---|---|---|
| SSO-11 | Open `http://localhost:8081/admin` signed out | Strapi login form **with** a "Sign in with Microsoft" button |
| SSO-12 | Click it, finish Entra sign-in as an Entra user that has an invited, active Strapi account | Lands on the homepage as that user, with the queue for their role |
| SSO-13 | Same, with an Entra user that has no Strapi account | Back on the login page: "Your Microsoft account is not registered..." + `sso:login` denied row |
| SSO-14 | Log in with email + password | Works as before |
| SSO-15 | `curl -H "X-Forwarded-Email: admin@poc.local" http://localhost:8081/sso/entra` | Redirects to Entra sign-in, **not** logged in (nginx ignores the forged header) |

### Audit trail coverage

Everything below lands in the append-only, hash-chained audit log (`cms/src/poc/audit.ts`; Super Admin reads it under
Content Manager -> Audit Log, and the latest 12 entries appear in the **Recent audit activity** homepage widget):

| What | Audit action | Notes |
|---|---|---|
| Sign-in (password or Microsoft), sign-out | `event:admin.auth.success`, `event:admin.logout` | `after.loginMethod` is `password` or `microsoft`; Microsoft sign-ins also write `sso:login` with the role names |
| Failed sign-in | `event:admin.auth.error` (outcome **denied**) | Actor = the email that was tried; `reason` says why. Entra sign-ins that are refused write `sso:login` denied |
| Create / edit / delete / publish / unpublish / discard draft of Product, Promotion, News, Home, About, Contact | `create`, `update`, `delete`, `publish`, ... | Actor, roles, stage before/after, changed fields, before/after content, content hash; refused attempts are logged as denied |
| Approval steps | `update+stage:in_review->awaiting_approval`, ... | |
| Users, roles, permissions, API tokens, webhooks, media | `event:user.create`, `event:role.update`, ... | Which of these Community emits is a PoC finding |

Changes made by raw SQL or `strapi import/transfer` bypass Strapi and are NOT audited (see `docs/05-security-checklist.md`).
