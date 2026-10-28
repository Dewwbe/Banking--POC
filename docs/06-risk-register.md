# Risk register

Likelihood / Impact: L / M / H. Pre-filled with risks identified while building the PoC; add findings from the run.

| ID | Risk | Area | L | I | Mitigation | Residual | Owner |
|---|---|---|---|---|---|---|---|
| R-01 | Approval rules in custom code are bypassed by a path outside the Document Service (raw DB queries in a plugin, SQL, `strapi import/transfer`) | Workflow | M | H | Code review gate for plugins; DB access restricted; transfer tokens disabled in prod; periodic reconciliation of `publishedAt` vs audit `publish` entries | M | |
| R-02 | Custom workflow breaks on a Strapi minor upgrade (Document Service middleware, admin API, strategy names changed — observed: `content-api-token`, `admin-token`) | Workflow | M | H | Automated negative test suite in CI on every upgrade; pin versions | M | |
| R-03 | Audit entries are written outside the transaction and not awaited → fail-open; an "allowed" entry may describe a rolled-back change | Audit | M | M | Monitor audit write errors; consider outbox table + worker; document semantics for auditors | M | |
| R-04 | Audit trail is tamper-evident, not tamper-proof (DB admin can rebuild chain) | Audit | L | H | Stream entries to SIEM / WORM storage; periodic external anchoring of latest hash | L | |
| R-05 | Audit chain serialisation is per-process; multiple Strapi replicas would fork the chain | Audit / Ops | M | M | Single CMS instance, or DB advisory lock / sequence | L | |
| R-06 | No native MFA/SSO in Community → leaver accounts and password-only admin access | Security | M | H | Implemented: `oauth2-proxy` + Entra ID Conditional Access gate in front of `/admin` (`docs/08-sso-mfa-setup.md`), no licence needed. Residual: gate ≠ true SSO (two logins — Entra then Strapi), admin accounts not auto-deprovisioned from Entra leaver events, so still pair with quarterly Strapi-side access reviews | L | |
| R-07 | First-run admin registration open on an unprotected new environment | Security | L | H | Network-restrict /admin before first boot; seed Super Admin from secrets | L | |
| R-08 | REST `create` publishes by default; any full-access/custom token with create permission publishes unapproved content natively | Security / Workflow | M | H | Prototype blocks it; no write tokens in prod; edge blocks non-GET | L | |
| R-09 | Field-level RBAC silently drops forbidden fields (HTTP 200) — users/integrations believe a change was saved | Usability / Integrity | M | M | Training; UI hides fields; integration tests check values | M | |
| R-10 | Webhook delivery failure leaves stale (possibly wrong) rates cached until revalidate interval | Takedown | M | H | Short revalidate interval for rate pages; monitor webhook failures; manual purge runbook | M | |
| R-11 | Custom scheduler misses/duplicates runs (restart, multiple instances) | Scheduling | M | M | Website date filter as second line; single instance; alerting | L | |
| R-12 | No malware scanning on uploads (PDFs served from bank domain) | Security | M | H | ClamAV integration; restrict types; serve media from separate domain | L | |
| R-13 | Community support only — no vendor SLA for security issues | Support | M | H | Internal expertise or partner; Enterprise licence | — | |
| R-14 | Content movement replaces whole dataset (no selective promotion); risk of overwriting production content | Ops | M | H | Content authored in production with workflow; only schema promoted via CI | L | |
| R-15 | Placeholder Sinhala/Tamil translations shown publicly | Content | L | M | Language-team review gate | L | |
| R-16 | Total cost of custom governance (build + test + upgrade maintenance) exceeds licence cost | Commercial | ? | M | Estimate effort in report vs Enterprise quote | — | |