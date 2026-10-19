# Permission matrix

Configured programmatically by `cms/src/poc/rbac.ts`; verify and screenshot each role in **Settings → Administration Panel → Roles**. All roles are restricted to locales en/si/ta (locale restriction is configurable per role).

## Content Manager (website types: Home, About Us, Contact Us, Product, News Article, Promotion)

| Capability | Super Admin | Bank Editor | Bank News Editor | Bank Reviewer | Bank Approver | Bank Publisher |
|---|---|---|---|---|---|---|
| Read | All | All 6 types | News only | All 6 | All 6 | All 6 |
| Create | All | Yes | News only | No | No | No |
| Update — content fields | All | Yes | News only | **No** | **No** | **No** |
| Update — `workflowStage` | All* | Yes (transitions limited by workflow) | Yes | Yes (limited) | Yes (limited) | Yes (no valid transitions; needed by the Publish button flow) |
| Update — `reviewComment` | All | Yes | Yes | Yes | Yes | No |
| Update — approval metadata | Server only | No | No | No | No | No |
| Delete | All | No | No | No | No | No |
| Publish / Unpublish | Native: yes; prototype: **refused unless override flag** | No | No | No | No | **Yes — approved & unchanged content only** |
| Audit Log (read) | Yes (read-only, append-only enforced) | No | No | No | No | No |

\* Super Admin stage changes and publishing bypass the workflow only with `WORKFLOW_SUPERADMIN_OVERRIDE=true`.

## Media Library

| Capability | Super Admin | Editors | Reviewer / Approver / Publisher |
|---|---|---|---|
| Read / download / copy link | Yes | Yes | Yes |
| Upload / update | Yes | Yes | No |
| Delete | Yes | No | No |
| Per-folder restriction | Not available in Community (record in matrix) | | |

## Settings / administration

Only Super Admin: users, roles, API tokens, transfer tokens, webhooks, i18n locales, Users & Permissions, Content-Type Builder (dev mode only).

## Public / content API

| Caller | Access |
|---|---|
| Public (no token) | `find` / `findOne` on the six website types, `i18n` locales; published content only; drafts blocked by prototype |
| Read-only API token | Same as public (use for server-side Next.js if public role is closed) |
| Preview token (`PREVIEW_TOKEN_NAME`) | May read drafts (`?status=draft`) — for a future preview feature |
| Full-access / custom tokens | Publishing blocked by prototype; recommend none in production |

## Granularity observed (fill in)

| Dimension | Available in Community? | Observation |
|---|---|---|
| Per content type | Yes | Smoke ✔ (RBAC-06) |
| Per action (create/read/update/delete/publish) | Yes | Smoke ✔ |
| Per field | Yes | Forbidden fields are silently dropped, not rejected (RBAC-03) |
| Per locale | Yes | |
| Per entry ownership ("Is creator") | Yes (built-in conditions) | |
| Custom conditions (e.g. by category) | Possible via code (RBAC condition provider) | |
| Workflow-stage permissions | No (Review Workflows = Enterprise) | Custom prototype |
| Media folder permissions | No | |
