# PoC Runbook — five working days

Each day ends with a named deliverable and evidence saved under `docs/evidence/`. Record every test result in `02-test-cases.md` (Result + Evidence columns). Screenshot naming: `D<day>-<test-id>-<short-name>.png` (e.g. `D2-RBAC-01-editor-no-publish-button.png`).

## Before Day 1 — decisions to obtain from the bank (blockers if missing)

| # | Decision needed | Why it matters | Owner |
|---|---|---|---|
| 1 | Maximum acceptable takedown time for an incorrect rate / legal notice (API, website, CDN) | OPS-07 cannot pass or fail without a target | Business / Compliance |
| 2 | Is multi-stage approval (Editor → Reviewer → Approver → Publisher) mandatory, and must it be system-enforced? | Determines whether Community is viable at all (go/no-go rule) | Compliance |
| 3 | Audit retention period and evidence standard (who/what/when, tamper resistance, export to SIEM?) | Custom audit vs Enterprise Audit Logs vs SIEM | Compliance / InfoSec |
| 4 | Is Microsoft Entra ID SSO + MFA mandatory for CMS users? | SSO is not in Community | InfoSec |
| 5 | Hosting model (on-prem / cloud), CDN, WAF, malware scanning service | Security & operations tests | Infrastructure |
| 6 | Number of CMS users (seats) | Growth/Enterprise cost estimate | Business |

## Day 1 — Setup and content modelling

1. Pin versions (already pinned in `docker-compose.yml`, `cms/package.json`, `web/package.json`). Record `docker compose version`, host OS.
2. `cp .env.example .env`, generate secrets, `docker compose up -d --build`.
3. Confirm bootstrap log lines: roles created, test users, seed done, webhook registered.
4. Review the content model in the Content-Type Builder (screenshots of each type + components) — compare with `01-content-model.md`.
5. Upload sample images and PDFs (MED tests) — attach them to Home hero, a product (`heroImage`, `keyFactsDocument`) and a legal notice.
6. Check the website in en/si/ta; confirm Sinhala/Tamil glyphs render (font fallback).

**Deliverable:** running stack, screenshots of content types/components, `01-content-model.md` confirmed.

## Day 2 — Editorial and role testing

1. Log in as each test user (separate browser profiles). Screenshot what each role sees (menu, buttons, fields).
2. Run CM-*, MED-*, I18N-*, DP-* tests in the admin UI.
3. **Usability session:** ask one non-technical person (ideally from the bank's content team) to complete the five tasks in `02-test-cases.md` §UX without help. Time each task and record confusion points verbatim.
4. Run RBAC-* tests in the UI, then `./scripts/negative-tests.sh` for the API-level proof.
5. Document permission granularity in `03-permission-matrix.md` (screenshot Settings → Roles for each role).

**Deliverable:** editorial test results, UX notes, permission matrix with screenshots.

## Day 3 — Governance and security

1. Workflow: run WF-* in the UI (edit view) **and** via `negative-tests.sh` / Postman folder C. Include bulk publish from the list view (WF-12) and Super Admin attempts (WF-13).
2. Observation mode: set `WORKFLOW_ENFORCEMENT=false` and `WORKFLOW_BLOCK_CONTENT_API_DRAFTS=false`, restart cms, repeat WF-03/WF-09/API-03 to record **native Community behaviour**. Restore afterwards.
3. Audit: run AUD-* — reconstruct one change end-to-end from the audit table only (who changed the rate, from what to what, who approved, when it went live). Run the tamper test (AUD-08).
4. Security: run SEC-* (proxy profile for network restriction and rate limiting). For SSO/MFA, document what Community offers (nothing native) and what Growth+SSO add-on / Enterprise offer; if possible obtain a Growth trial licence and test Entra ID SSO.
5. Fill `05-security-checklist.md`.

**Deliverable:** workflow prototype results, audit reconstruction example, security findings.

## Day 4 — Next.js integration and operations

1. Lifecycle tests LC-01..07 — keep two browser windows (admin + website) and screenshot each state; capture the `Rendered at` banner timestamp.
2. Takedown measurement (OPS-07): `./scripts/takedown-timer.sh fixed-deposit en` — repeat 5×, record min/median/max; repeat with webhook disabled to show the fallback (revalidate interval).
3. Backup/restore (OPS-01/02): `./scripts/backup.sh`, change content, `./scripts/restore.sh backups/<ts>`; time it; verify users, roles, API tokens, media.
4. Content movement (OPS-04): `./scripts/content-movement.sh export` and import into a second stack (`docker compose -p strapi-uat ...` with another `.env`). Record what is and isn't moved.
5. Media storage (OPS-03): `UPLOAD_PROVIDER=s3`, `docker compose --profile minio up -d`, create bucket `strapi-media` (public read) in the MinIO console, upload a file, confirm URL.
6. Performance (OPS-08): `docker compose --profile loadtest run --rm k6`.
7. Production build (OPS-05): `CMS_BUILD_TARGET=production docker compose up -d --build cms` — confirm the Content-Type Builder is read-only in production mode.

**Deliverable:** lifecycle evidence, takedown timings, backup/restore and movement notes, load-test summary.

## Day 5 — Gap analysis and recommendation

1. Complete `04-feature-matrix.md` (Observed column + Comments) from the evidence.
2. Complete `06-risk-register.md`; estimate effort to harden the custom workflow/audit to production quality vs. licence cost.
3. Write the report using `07-report-template.md`; answer the go/no-go gates explicitly.
4. Confirm current licence pricing/features with Strapi sales in writing (pricing pages change).

**Deliverable:** PoC report, feature matrix, risk register, recommendation.
