# Strapi Community Edition PoC — Public Banking Website

Proof of concept to assess whether **self-hosted Strapi 5 Community Edition** can serve as the CMS for a public banking / corporate website, with a **Next.js** frontend consuming content through the REST API.

The repository is the base for the five-day PoC described in [`docs/00-runbook.md`](docs/00-runbook.md). It contains a working stack, a realistic banking content model, a **custom approval-workflow and audit prototype** (because Community has neither Review Workflows nor Audit Logs), automated negative tests, and the templates for the final assessment.

> **Important framing.** Everything under `cms/src/poc/` is custom code written for this PoC. It exists to measure *how much* governance can be custom-built on Community and *how risky* that is — not to imply that Community provides these capabilities natively. Keep this distinction in every finding.

## Stack (pinned)

| Component | Version | Notes |
|---|---|---|
| Strapi | 5.58.0 Community | `@strapi/strapi`, users-permissions, GraphQL (disabled by default), S3 provider (optional) |
| Node.js | 22.20.0 (alpine) | Strapi 5.58 supports Node 20–26 |
| PostgreSQL | 17.6 (alpine) | Not exposed to the host |
| Next.js | 16.4.2 (React 19.3.1) | App Router, server-side fetch, tag-based revalidation |
| Tailwind CSS | 4.3.3 | |
| nginx | 1.29.1 | Optional profile `proxy`: `/admin` allow-list, rate limits |
| MinIO | 2025-09-07 | Optional profile `minio`: S3-compatible media storage |
| k6 | 1.2.3 | Optional profile `loadtest` |

## Quick start

```bash
cp .env.example .env
./scripts/generate-secrets.sh          # paste the output over the CHANGE_ME values in .env
#   also set SEED_SUPERADMIN_PASSWORD and SEED_TEST_USER_PASSWORD
docker compose up -d --build
docker compose logs -f cms             # wait for "[poc] Governance prototype active"
```

| URL | What |
|---|---|
| http://localhost:1337/admin | Strapi admin (Super Admin + 5 test users are seeded) |
| http://localhost:3000/en | Public website (`/si`, `/ta` for Sinhala and Tamil) |
| http://localhost:1337/api/products?locale=en | Public REST API |

Seeded admin users (password = `SEED_TEST_USER_PASSWORD`):

| User | Role | Purpose |
|---|---|---|
| `admin@poc.local` (password `SEED_SUPERADMIN_PASSWORD`) | Super Admin | Configuration |
| `editor@poc.local` | Bank Editor | Create/edit drafts, submit for review |
| `news.editor@poc.local` | Bank News Editor | Same, News Articles only (content-type restriction) |
| `reviewer@poc.local` | Bank Reviewer | Stage + comment only (field-level restriction) |
| `approver@poc.local` | Bank Approver | Compliance approval |
| `publisher@poc.local` | Bank Publisher | Publish/unpublish approved content |

Then run the automated checks:

```bash
./scripts/negative-tests.sh                                  # RBAC, workflow, API exposure, login throttling
FULL_ACCESS_TOKEN=<token> ./scripts/negative-tests.sh        # + API-token publish bypass (create token in Settings → API Tokens)
docker compose exec cms npm run verify:audit                 # audit hash-chain integrity
```

## Repository layout

```
docker-compose.yml           db, cms, web (+ proxy, minio, k6 profiles)
.env.example                 every setting used by the PoC, incl. workflow feature flags
cms/                         Strapi 5 project
  config/                    server, admin (session + login rate limit), middlewares (CORS/CSP/body limits),
                             plugins (upload restrictions, S3, GraphQL limits), cron-tasks (custom scheduler)
  src/api/                   Home, About Us, Contact Us (single types); Product, News Article, Promotion
                             (collection types); Audit Log (custom, not on content API)
  src/components/            shared.{seo,cta,banner,card,faq,list-item}, sections.*, contact.branch-link
  src/poc/                   CUSTOM governance prototype:
    workflow.ts              Document Service middleware: stage transitions, separation of duties,
                             approval bound to a content hash, publish gate, content-API draft/publish blocks
    audit.ts                 append-only, hash-chained audit trail
    admin-events.ts          logins, user/role/media events → audit trail
    rbac.ts                  roles, field/locale/content-type permissions, test users, public API permissions
    scheduler.ts             custom promotion scheduling/expiry (NOT the paid Releases feature)
    seed.ts                  sample content in en / si / ta
  scripts/verify-audit-chain.mjs
web/                         Next.js site: /[locale]/{,products,products/[slug],news,news/[slug],promotions,about,contact}
  app/api/revalidate         webhook target (secret-protected) → revalidateTag
infra/nginx/nginx.conf       admin IP allow-list, rate limiting, method restrictions, security headers
scripts/                     backup / restore / content movement / takedown timer / negative tests / k6
postman/                     collection mirroring the negative tests
docs/                        runbook, test cases, permission matrix, feature matrix, security checklist,
                             risk register, report template, evidence/
```

## Governance prototype — how it works

```
 Bank Editor ──▶ draft ──submit──▶ in_review ──Reviewer──▶ awaiting_approval ──Approver──▶ approved ──Publisher──▶ PUBLISHED
                   ▲                   │                         │                          │
                   └── changes_requested ◀─────────────────────────┘                          │
                   └───────────── any content change after submission resets to draft ◀──────┘
```

* **Enforcement point:** a Strapi 5 *Document Service middleware* (`strapi.documents.use`). Admin UI, admin API, bulk actions, REST, GraphQL and cron jobs all pass through it. Raw `strapi.db.query`/SQL, `strapi import/transfer` and direct database access do **not** — that is a finding, not a bug.
* **Approval is bound to content:** on approval the server stores a SHA-256 of the normalised draft (all fields, components, dynamic zones, media and relations, excluding workflow metadata). Publishing requires `stage = approved` **and** an unchanged hash, so changing an interest rate after approval forces re-approval.
* **Separation of duties** is enforced on identity (submitter ≠ reviewer ≠ approver ≠ publisher), so it holds even if one person has several roles.
* **Super Admin** cannot bypass approval unless `WORKFLOW_SUPERADMIN_OVERRIDE=true` (logged as an override).
* **Content API**: publishing (including REST `create`, which publishes by default in Strapi 5) and `?status=draft` reads are blocked unless the API token is the named preview token.
* **Observation mode:** set `WORKFLOW_ENFORCEMENT=false` / `WORKFLOW_BLOCK_CONTENT_API_DRAFTS=false` to record native Community behaviour for the comparison.

The workflow fields `workflowStage` and `reviewComment` appear as ordinary fields in the edit view (rearrange them via *Configure the view* for the usability test); approval metadata (`submittedBy`, `reviewedBy`, `approvedBy`, `approvedAt`, `approvedHash`) is server-managed. This is deliberately a *prototype* UI — compare it with Enterprise Review Workflows (stage badges, assignees, stage-change permissions) in the report.

## Smoke-test results already obtained (19 Oct 2026, Strapi 5.58.0 on SQLite, outside Docker)

These were run while building the repository; repeat them on the Docker/PostgreSQL stack and attach the evidence.

* Bootstrap: roles, permissions, 6 admin users, en/si/ta locales, sample content, webhook — all created without errors.
* `scripts/negative-tests.sh`: **24 / 24 passed** (RBAC, workflow incl. post-approval rate change, API exposure, API-token bypass, login throttling).
* Public website: published pages render in en/si/ta; draft product/news return 404.
* Takedown: unpublish via admin API → webhook → Next.js revalidation → product page returned 404 after **≈0.1 s** locally (no CDN).
* Findings already visible: REST `create` publishes immediately by default; field-level RBAC silently drops forbidden fields (HTTP 200) instead of rejecting; creating any admin user closes the first-run Super Admin registration; current Strapi uses the auth strategy names `content-api-token` / `admin-token` (admin tokens act on behalf of a user).

## Running without Docker (development)

```bash
cd cms && cp ../.env .env && npm install && npm run develop    # needs a reachable PostgreSQL (or DATABASE_CLIENT=sqlite + `npm i better-sqlite3`)
cd web && npm install && STRAPI_URL=http://localhost:1337 npm run dev
```

## Next steps

Follow [`docs/00-runbook.md`](docs/00-runbook.md) day by day, record results in [`docs/02-test-cases.md`](docs/02-test-cases.md), save screenshots under `docs/evidence/screenshots/`, and complete [`docs/04-feature-matrix.md`](docs/04-feature-matrix.md), [`docs/06-risk-register.md`](docs/06-risk-register.md) and [`docs/07-report-template.md`](docs/07-report-template.md).
