# Feature matrix — Community vs custom vs paid licence

**Status of this document:** pre-filled from Strapi's published plan comparison (checked 19 Oct 2026) and from the repository smoke test. The *Observed in PoC* column must be completed from the Docker/PostgreSQL run. Pricing and plan contents change — **obtain written confirmation from Strapi before the final recommendation.**

Licence tiers referenced (self-hosted CMS licence, per strapi.io/pricing-self-hosted):
* **Community** — free; no Releases, Content History, SSO, Review Workflows or Audit Logs.
* **Growth** — from USD 45/month (3 seats included); adds Live Preview, Releases, Content History (30-day retention); **SSO is a paid add-on** (USD 150/month + USD 50/seat/month).
* **Enterprise** — custom quote; adds Review Workflows, Audit Logs, SSO included, longer Content History retention (confirm exact retention with Strapi).

Legend: ✅ yes · ⚠️ partial / with caveats · ❌ no

| # | Feature | Community available? | Custom development possible? | Paid / Enterprise required? | Banking concern | Observed in PoC | Comments |
|---|---|---|---|---|---|---|---|
| 1 | Pages (single/collection types), components, dynamic zones | ✅ | — | No | Low | Smoke ✔ | Content model in `01-content-model.md` |
| 2 | Media Library (images, PDFs) | ✅ | — | No | Medium (file safety) | | No per-folder permissions; no virus scanning |
| 3 | Draft & Publish | ✅ | — | No | Low | Smoke ✔ | |
| 4 | Scheduled publishing (Releases) | ❌ | ⚠️ cron-based prototype (`scheduler.ts`) | Growth+ | Medium — promotions/rate changes at a set time | Smoke ✔ (custom) | Custom: minute precision, no UI, single instance |
| 5 | Multilingual (i18n) | ✅ | — | No | Low | Smoke ✔ | Sinhala/Tamil font check on site and admin |
| 6 | Non-technical editor usability | ⚠️ | ⚠️ (custom field UI, admin customisation) | Live Preview = Growth+ | Medium | | Static preview is in Community; live preview is not |
| 7 | Custom admin roles | ✅ | — | No | — | Smoke ✔ | |
| 8 | Field / locale / content-type permissions | ✅ | — | No | — | Smoke ✔ | Forbidden fields silently dropped (HTTP 200) |
| 9 | Editor cannot publish | ✅ | — | No | High | Smoke ✔ | Native RBAC `publish` action |
| 10 | Custom RBAC conditions (e.g. by category) | ⚠️ | ✅ code | No | Medium | | |
| 11 | Multi-stage approval (Editor → Reviewer → Approver → Publish) | ❌ | ⚠️ prototype (`workflow.ts`) | **Enterprise** (Review Workflows) | **High — separation of duties** | Smoke ✔ (custom) | Custom code must be maintained across Strapi upgrades and security-reviewed; DB-level writes bypass it |
| 12 | Approval invalidated by later change | ❌ | ⚠️ prototype (content hash) | Verify Enterprise behaviour | High (rates, legal text) | Smoke ✔ (custom) | Confirm whether Enterprise Review Workflows resets stage on edit |
| 13 | Who created / last modified | ⚠️ `createdBy`/`updatedBy` only (last editor) | — | — | High | | Not a history |
| 14 | What changed, previous values | ❌ | ⚠️ custom audit (`audit.ts`) | Content History = Growth+ | High | Smoke ✔ (custom) | |
| 15 | Who approved / published / unpublished, when | ❌ | ⚠️ custom audit | Audit Logs = **Enterprise** | High | Smoke ✔ (custom) | |
| 16 | Version history & rollback | ❌ | ⚠️ snapshots in audit; manual restore | Content History = Growth+ | High | | Custom restore not built |
| 17 | Tamper-resistant audit trail | ❌ | ⚠️ hash chain = tamper-*evident* only | Enterprise Audit Logs (retention limits apply) | **High — regulatory evidence** | Smoke ✔ (detect) | Neither option is WORM; export to SIEM recommended |
| 18 | Admin authentication, password login | ✅ | — | No | — | | |
| 19 | Login throttling | ✅ | — | No | — | Smoke ✔ | |
| 20 | Session expiry | ✅ (config) | — | No | — | | |
| 21 | MFA | ❌ | ⚠️ via reverse-proxy auth / IdP in front of `/admin` | Via SSO (Growth add-on / Enterprise) + IdP MFA | **High** | | Native Strapi MFA not offered in any tier — confirm with Strapi |
| 22 | SSO / Microsoft Entra ID | ❌ | ⚠️ proxy-level SSO (does not map identities/roles into Strapi) | Growth + SSO add-on, or Enterprise | **High** — joiner/mover/leaver | | |
| 23 | API tokens (read-only / full / custom, lifespan, regenerate) | ✅ | — | No | Medium | | Full-access tokens can publish natively (REST create publishes by default) |
| 24 | REST / GraphQL permissions, public vs authenticated | ✅ | — | No | Medium | Smoke ✔ (REST) | Draft read via `?status=draft` — record native result |
| 25 | CORS / security headers | ✅ (config) | — | No | Low | | |
| 26 | Rate limiting (API) | ⚠️ (admin login + U&P auth only) | ✅ middleware / proxy | No | Medium | Smoke ✔ (login) | Use nginx/WAF |
| 27 | Upload restrictions (size/type) | ✅ (config) | — | No | Medium | | |
| 28 | Malware scanning of uploads | ❌ | ✅ ClamAV hook | No | **High** | | |
| 29 | `/admin` network restriction | ✅ infra | — | No | High | | nginx `geo` allow-list in repo |
| 30 | PostgreSQL | ✅ | — | No | — | | |
| 31 | Backup / restore | ✅ (pg_dump + media) | — | No | Medium | | |
| 32 | S3-compatible media storage | ✅ (provider) | — | No | — | | |
| 33 | Docker deployment | ✅ | — | No | — | | |
| 34 | Dev → UAT → Prod content movement | ⚠️ `strapi export/import/transfer` (full replace) | ⚠️ selective sync scripts | No | Medium | | Schema via Git, content via transfer → two pipelines |
| 35 | Webhooks | ✅ | — | No | Medium | Smoke ✔ | No retry queue observed — verify |
| 36 | Cache invalidation / takedown | ✅ (webhook + Next.js tags) | — | No | **High** (wrong rate online) | Smoke ✔ ~0.1 s local | Add CDN purge |
| 37 | Performance | ✅ | — | No | Low | | k6 profile |
| 38 | Vendor support / SLA | Community forum only | — | Growth (basic) / Enterprise (premium) | **High** for a bank | | |

## Summary counts (complete after PoC)

| Category | Count | Items |
|---|---|---|
| Works out of the box | | |
| Missing in Community | | |
| Custom-buildable, low risk | | |
| Custom-buildable, high risk | | |
| Requires paid licence | | |
