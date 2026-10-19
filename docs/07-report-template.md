# Strapi Community Edition PoC — Assessment Report

**Prepared by:** · **Date:** · **Strapi version:** 5.58.0 Community (self-hosted) · **Environment:** Docker Compose, PostgreSQL 17.6, Next.js 16.4.2

## 1. Executive summary
*One paragraph: can self-hosted Community Edition safely be used for the bank's public website CMS? State the recommendation and the 2–3 decisive reasons.*

## 2. Scope and method
* What was built (content model, roles, custom workflow/audit prototype, Next.js site).
* What was tested (reference `02-test-cases.md`; number of tests passed/failed/not run).
* What was not tested and why (e.g. SSO without licence, CDN).

## 3. Results by area
For each: what works out of the box · what is missing · what was custom-built · evidence (screenshots).
3.1 Content management · 3.2 Users, roles & permissions · 3.3 Approval workflow · 3.4 Audit & compliance · 3.5 Security · 3.6 Headless integration · 3.7 Operations

Include the **reconstruction example** (AUD-10): the full story of one interest-rate change from audit evidence only.

## 4. Feature matrix
*Paste the completed table from `04-feature-matrix.md`.*

## 5. Assessment
| Question | Answer |
|---|---|
| What works out of the box | |
| What is missing | |
| What we can custom-build (low risk) | |
| What would be difficult / risky to custom-build | |
| What requires a paid Strapi licence | |
| Security / compliance concerns | |

## 6. Decision gates
| Gate | Required outcome | Result | Evidence |
|---|---|---|---|
| Content management | All required page types and components work | | |
| Public API | Only intended published content is exposed | | |
| Separation of duties | Editors cannot bypass required approval | | |
| Auditability | Required actions can be reconstructed with reliable evidence | | |
| Security | No critical unresolved findings in the tested configuration | | |
| Operations | Backup restoration and content takedown within agreed targets | | |
| Licensing | Required governance and identity features fit the budget | | |

**Go/no-go rule:** if the bank requires enforced multi-stage approval, dependable audit evidence and centralised identity controls, Community Edition is not approved for production merely because the content and frontend tests pass; those requirements must be met through supported Enterprise capabilities or a formally reviewed custom solution.

## 7. Options and cost
| Option | Licence | Custom effort (build + annual maintenance) | Residual risk |
|---|---|---|---|
| A. Community + custom governance (this prototype hardened) | 0 | | |
| B. Growth + SSO add-on (+ custom approval/audit) | | | |
| C. Enterprise | quote | | |
| D. Alternative CMS (if gates fail) | | | |

## 8. Recommendation and next steps

## Appendices
A. Risk register · B. Security checklist · C. Permission matrix · D. Negative-test outputs (`docs/evidence/`) · E. Load-test summary
