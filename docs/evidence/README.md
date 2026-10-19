# Evidence

* `negative-tests-<timestamp>.txt` — written automatically by `scripts/negative-tests.sh`.
* `screenshots/` — name files `D<day>-<test-id>-<short-name>.png`.

Minimum screenshot set for the report:

| Test | Screenshot |
|---|---|
| CM-01 | Content-Type Builder: Product and Home schemas |
| MED-01/02 | Media Library with image + PDF; product page showing both |
| I18N-01/05 | Same product in en / si / ta (admin + website) |
| RBAC-01 | Editor edit view without Publish button |
| RBAC-03 | Reviewer edit view: content fields read-only |
| Roles | Settings → Roles for each Bank role |
| WF-03/09 | Error toast when publishing unapproved/changed content |
| WF-07/08 | Stage reset to draft after rate change |
| AUD-03/05 | Audit Log list + one `update` entry with before/after |
| AUD-08 | `verify:audit` output before and after tampering |
| SCH-01 | Community admin showing Releases unavailable / upsell |
| LC-01..05 | Website before/after each lifecycle step with "Rendered at" banner |
| SEC-11 | 403 from nginx for /admin from a disallowed network |
| OPS-07 | takedown-timer output |
