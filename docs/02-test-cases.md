# Test cases

**Result** values: `Pass` / `Fail` / `Partial` / `N/A (licence)` / `Not run`. **Evidence**: screenshot file, script output file, or audit sequence numbers.
"Smoke ✔" = already passed during repository build (Strapi 5.58.0 on SQLite, 19 Oct 2026) — re-run on the Docker/PostgreSQL stack.
**Native?** column: N = native Community capability, C = custom PoC code, L = requires paid licence.

## A — Content management

| ID | Test | Steps / tool | Expected | Native? | Result | Evidence |
|---|---|---|---|---|---|---|
| CM-01 | Editor creates each content type | Admin as editor: create a Product, News, Promotion; edit Home/About/Contact | All saved as drafts | N | | |
| CM-02 | Component reuse | Use Banner/Card/FAQ/CTA/SEO on Home and About; change a Card in one place | Components are per-entry copies (changing one doesn't change the other) — record whether shared/global blocks are needed | N | | |
| CM-03 | Dynamic zone ordering | Reorder Home sections by drag-and-drop | Website order follows | N | | |
| CM-04 | Required/validation | Save Product without disclaimer; metaTitle > 60 chars | Blocked with message | N | | |
| CM-05 | Slug uniqueness | Create a second product with slug `fixed-deposit` | Rejected | N | | |
| MED-01 | Upload image | Media Library upload JPG/PNG, set alt text, use in Product hero | Rendered on website with alt text | N | | |
| MED-02 | Upload PDF | Upload Key Facts PDF, attach to Product | Download link works | N | | |
| MED-03 | Replace file | Replace a used image in Media Library | URL/hash change; website updated after revalidation | N | | |
| MED-04 | Delete in-use media | Delete an image used by a published product | Record behaviour (warning? broken image?) | N | | |
| MED-05 | Folders & permissions | Create folders; check whether access can be restricted per folder | Record (expected: no per-folder permissions in Community) | N | | |
| DP-01 | Draft not public | Create product draft | Not on API or website | N | Smoke ✔ | |
| DP-02 | Publish | Publish (as Publisher after approval) | Visible on API + website | N+C | Smoke ✔ | |
| DP-03 | Edit published | Edit draft of a published product | Published version unchanged until republish | N | Smoke ✔ | |
| DP-04 | Unpublish | Unpublish | Removed from API + website | N | Smoke ✔ | |
| DP-05 | Discard draft | Edit, then "Discard changes" | Draft reverts to published version | N | | |
| SCH-01 | Native scheduled publishing | Look for Releases / scheduling in Community admin | Not available (Releases = Growth+) → screenshot of upsell | L | | |
| SCH-02 | Custom scheduled publish | Seeded `scheduled-new-year` promotion (approved, start = seed + 3 min) | Published by cron within ~1 min of start | C | Smoke ✔ | |
| SCH-03 | Custom expiry | Seeded `expired-card-offer` (published, end in past) | Unpublished by cron; website filter hides it anyway | C | Smoke ✔ | |
| SCH-04 | Scheduler respects approval | Change a scheduled promotion's text after approval | Scheduler refuses to publish (log + audit "denied") | C | | |
| I18N-01 | Locale content | View en/si/ta versions in admin and on website | Correct locale returned | N | Smoke ✔ | |
| I18N-02 | Shared fields | Change interestRate in `si` | Same rate in all locales (shared field) | N | | |
| I18N-03 | Missing translation | Create News only in `en`; open `/si/news/<slug>` | 404 (no fallback) — record if fallback is required | N | | |
| I18N-04 | Locale-restricted editor | Configure a role limited to `ta` (Settings → Roles → locales) | Cannot edit en/si | N | | |
| I18N-05 | Fonts / rendering | Sinhala & Tamil text in admin editor and website | Renders correctly (screenshot) | N | | |
| UX-01..05 | Non-technical user tasks | 1) change a promotion end date 2) add an FAQ 3) replace hero image 4) create a Tamil version of a news item 5) submit for review | Time each, note confusion points | N | | |

## B — Roles and permissions

| ID | Test | Steps / tool | Expected | Native? | Result | Evidence |
|---|---|---|---|---|---|---|
| RBAC-01 | Editor cannot publish | UI (no Publish button) + `negative-tests.sh` | 403 | N | Smoke ✔ | |
| RBAC-02 | Editor cannot unpublish | same | 403 | N | Smoke ✔ | |
| RBAC-03 | Field-level restriction | Reviewer edits interestRate via API | Field ignored (Strapi drops it silently, HTTP 200) | N | Smoke ✔ | |
| RBAC-04 | Audit log hidden | Editor opens Audit Log | 403 / not in menu | N | Smoke ✔ | |
| RBAC-05 | Admin features restricted | Editor → /admin/users, Settings | 403 | N | Smoke ✔ | |
| RBAC-06 | Content-type restriction | News editor reads Products | 403 | N | Smoke ✔ | |
| RBAC-07 | "Is creator" condition | Restrict Editor update to own entries (Settings → Roles → condition) | Other users' entries read-only | N | | |
| RBAC-08 | Custom conditions | Assess need (e.g. "only Products of category loan") — requires custom RBAC condition code | Record effort | C | | |
| RBAC-09 | Role changes audited | Super Admin edits a role | `event:role.update` / `permission.*` in audit | C | | |

## C — Approval workflow

| ID | Test | Steps / tool | Expected | Native? | Result | Evidence |
|---|---|---|---|---|---|---|
| WF-01 | Editor self-approval | Editor sets draft → approved | 400 | C | Smoke ✔ | |
| WF-02 | Submit | Editor edits rate + stage in_review | 200, submittedBy recorded | C | Smoke ✔ | |
| WF-03 | Publish before approval | Publisher publishes in_review | 400 | C | Smoke ✔ | |
| WF-04 | Review | Reviewer → awaiting_approval | 200 | C | Smoke ✔ | |
| WF-05 | SoD reviewer/approver | Reviewer tries approve | 403 | C | Smoke ✔ | |
| WF-06 | Approve + publish | Approver approves; Publisher publishes | Live rate updated | C | Smoke ✔ | |
| WF-07/08 | **Rate change after approval** | Editor changes rate after approval | Stage reset to draft, approval cleared | C | Smoke ✔ | |
| WF-09/10 | Publish changed content | Publisher publishes | 400; old approved rate stays live | C | Smoke ✔ | |
| WF-11 | Return for correction | Reviewer → changes_requested with comment; editor resubmits | Works; comment visible to editor | C | | |
| WF-12 | Bulk publish path | List view → select several → Publish | Unapproved entries refused | C | | |
| WF-13 | Super Admin bypass | Super Admin publishes unapproved | Refused unless override flag; override logged | C | Smoke ✔ (refused) | |
| WF-14 | Locale independence | Approve `en` only, publish all locales | `si`/`ta` refused | C | | |
| WF-15 | Native behaviour | `WORKFLOW_ENFORCEMENT=false`: repeat WF-03, WF-09 | Record: Community publishes anything the role allows | N | | |
| WF-16 | Enterprise comparison | Review Workflows docs / trial: stages, assignees, stage permissions, required stage before publish | Comparison table in report | L | | |

## D — Audit and compliance

| ID | Test | Steps / tool | Expected | Native? | Result | Evidence |
|---|---|---|---|---|---|---|
| AUD-01 | Native fields only | Inspect entry: createdBy/updatedBy/createdAt/updatedAt | Only last editor + timestamps; no history | N | | |
| AUD-02 | Who created | Audit Log entry `create` | actor, role, time, locale | C | Smoke ✔ | |
| AUD-03 | What changed | `update` entry | changedFields + before/after snapshot | C | Smoke ✔ | |
| AUD-04 | Who approved | `update+stage:awaiting_approval->approved` | approver + contentHash | C | Smoke ✔ | |
| AUD-05 | Who published/unpublished | `publish` / `unpublish` entries | actor, time, full published snapshot | C | Smoke ✔ | |
| AUD-06 | Denied attempts | Negative tests | `outcome=denied` with reason | C | Smoke ✔ | |
| AUD-07 | Version history & rollback | Native: none in Community (Content History = Growth+). Custom: restore rate from a `publish` snapshot manually | Record effort & limitations | L / C | | |
| AUD-08 | Tamper evidence | Edit a row in SQL, run `npm run verify:audit` | Break detected at that sequence | C | | |
| AUD-09 | Admin logins / user & role changes | Log in, create user, change role | `event:*` entries; failed logins NOT captured | C | Smoke ✔ (login) | |
| AUD-10 | Reconstruction | From audit only: who changed the FD rate, old/new value, who approved, when live | Complete narrative in report | C | | |
| AUD-11 | Retention / export | Assess export to SIEM/WORM | Design note | C | | |

## E — Security

| ID | Test | Steps / tool | Expected | Native? | Result | Evidence |
|---|---|---|---|---|---|---|
| SEC-01 | Password policy | Try weak passwords for a new admin | Record Strapi's built-in rules (min length/complexity) | N | | |
| SEC-02 | Session expiry | Lower ADMIN_SESSION_* values, wait | Forced re-login | N | | |
| SEC-03 | Login throttling | 8 failed logins | 429 | N | Smoke ✔ | |
| SEC-04 | MFA | Look for MFA in admin | Not available natively (any tier) → via SSO IdP | L | | |
| SEC-05 | Entra ID SSO | Community: not available. Growth + SSO add-on / Enterprise: test if trial licence obtained | Document | L | | |
| SEC-06 | API token types | Create read-only, full-access, custom tokens; test scope | Read-only cannot write | N | | |
| SEC-07 | Token lifespan & rotation | Create 7-day token; regenerate; old token rejected | Works | N | | |
| SEC-08 | API-token publish bypass | Full-access token `POST /api/products` | Native: publishes; with prototype: 403 | N/C | Smoke ✔ (403) | |
| SEC-09 | Public draft leakage | `GET /api/products?status=draft` (public) | 403 with prototype; record native result | N/C | Smoke ✔ (403) | |
| SEC-10 | /admin from allowed network | via proxy :8081 | 200 | Infra | | |
| SEC-11 | /admin from disallowed network | Remove Docker range from nginx `geo`, reload | 403 | Infra | | |
| SEC-12 | Upload type restriction | Upload `.html`, `.svg` with script, `.exe` renamed `.png` | Rejected (record exact behaviour of `security` option) | N | | |
| SEC-13 | Upload size limit | Upload > 10 MB | Rejected | N | | |
| SEC-14 | Malware scanning | No native scanning → design ClamAV hook (upload lifecycle) | Design note | C | | |
| SEC-15 | CORS | `curl -H "Origin: https://evil.example" -I /api/products` | No `Access-Control-Allow-Origin` for evil origin | N | | |
| SEC-16 | Rate limiting public API | `ab`/k6 > 20 r/s through proxy | 429 at the proxy | Infra | | |
| SEC-17 | GraphQL permissions | `GRAPHQL_ENABLED=true`; query drafts, introspection, depth | Same permissions as REST; limits enforced | N | | |
| SEC-18 | DB isolation | `nc localhost 5432` from host | Not reachable | Infra | | |
| SEC-19 | Security headers | Inspect admin + site responses | CSP, HSTS, X-Frame-Options | N | | |
| SEC-20 | First-run registration | Fresh install: /admin open to register Super Admin | Exposure window — must be network-protected | N | | |
| SEC-21 | Users & Permissions registration | `POST /api/auth/local/register` | Disabled | N | | |

## F — Next.js integration and operations

| ID | Test | Expected | Native? | Result | Evidence |
|---|---|---|---|---|---|
| LC-01 | Create draft | No public display (404) | N | Smoke ✔ | |
| LC-02 | Publish | Page available | N | Smoke ✔ | |
| LC-03 | Update draft | Published page unchanged | N | | |
| LC-04 | Publish update | New version visible (after webhook) | N | Smoke ✔ | |
| LC-05 | Unpublish | Page removed (404) | N | Smoke ✔ | |
| LC-06 | Expire promotion | Not displayed after endDate | C | Smoke ✔ | |
| LC-07 | Webhook failure | Stop `web`, publish, start `web` | Stale until revalidate interval → record; Strapi has no webhook retry queue | N | | |
| OPS-01 | Backup | `scripts/backup.sh` | Dump + media archive + checksums | N | | |
| OPS-02 | Restore | `scripts/restore.sh` | Content, users, roles, tokens, media restored; duration recorded | N | | |
| OPS-03 | S3/MinIO media | `UPLOAD_PROVIDER=s3` | Files stored in bucket, URLs work | N | | |
| OPS-04 | Dev→UAT→Prod content | `scripts/content-movement.sh` | Full replace only; record what isn't moved | N | | |
| OPS-05 | Production build | `CMS_BUILD_TARGET=production` | CTB read-only; app starts | N | | |
| OPS-06 | Environment config | Same image, different `.env` per environment | Works without rebuild (except web build-time vars) | N | | |
| OPS-07 | **Takedown time** | `scripts/takedown-timer.sh` ×5 | Within agreed target (API / site / CDN) | N | Smoke ✔ (~0.1 s local) | |
| OPS-08 | Load | k6 profile | p95 API < 500 ms, site < 800 ms, errors < 1% | N | | |
| OPS-09 | Upgrade path | `npx @strapi/upgrade minor --dry` | Record effort/breaking changes | N | | |
