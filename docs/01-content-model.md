# Content model

All content types use **Draft & Publish** and **i18n** (locales `en` default, `si`, `ta`). Fields marked *shared* are non-localized (same value in every locale — e.g. an interest rate cannot differ between languages).

## Single types

| Type | API | Fields |
|---|---|---|
| Home | `/api/home` | title, hero (Banner), featuredProducts (→ Product, 1:n), sections (dynamic zone), seo |
| About Us | `/api/about-us` | title, introduction (blocks), mission, values (Card ×n), images (*shared*, multiple), sections, seo |
| Contact Us | `/api/contact-us` | title, hotline, email, supportHours, headOfficeAddress, branches (Branch link ×n), sections, seo |

## Collection types

| Type | API | Fields |
|---|---|---|
| Product | `/api/products` | name, slug (*shared*, UID), category (*shared*: savings / fixed_deposit / loan / card / investment), summary, description (blocks), **interestRate** (*shared*, decimal 0–100), rateEffectiveDate (*shared*), benefits (List item ×n), **disclaimer** (blocks, required), keyFactsDocument (PDF), heroImage (*shared*), faqs (FAQ ×n), seo |
| News Article | `/api/news-articles` | title, slug (*shared*), category (*shared*: press_release / announcement / notice / csr), excerpt, body (blocks), coverImage (*shared*), publicationDate (*shared*), seo |
| Promotion | `/api/promotions` | title, slug (*shared*), summary, banner (*shared*), **startDate / endDate** (*shared*, datetime), terms (blocks, required), cta, relatedProduct (→ Product), seo |
| Audit Log (PoC) | none (admin only) | sequence, occurredAt, environment, action, outcome, reason, channel, actor*, contentType, targetDocumentId, targetLocale, workflowStageBefore/After, changedFields, before, after, contentHash, prevEntryHash, entryHash, clientIp, userAgent |

## Workflow fields (custom prototype, on all six website types; localized, `private` = never on the public API)

| Field | Written by | Purpose |
|---|---|---|
| workflowStage | users (validated transitions) | draft / in_review / changes_requested / awaiting_approval / approved |
| reviewComment | reviewer / approver | reason for return or approval note |
| submittedBy, reviewedBy, approvedBy, approvedAt | server only | separation-of-duties and evidence |
| approvedHash | server only | SHA-256 of the approved content; publish requires an exact match |

## Reusable components

| Component | Fields | Used in |
|---|---|---|
| `shared.seo` | metaTitle (≤60), metaDescription (≤160), canonicalUrl, noIndex, shareImage | all six types |
| `shared.cta` | label (≤40), url, variant, openInNewTab | Banner, Card, CTA block, Promotion |
| `shared.banner` | heading, subheading, image, imageAlt, theme, cta (≤2) | Home hero, sections |
| `shared.card` | title, body, image, imageAlt, link (CTA) | Card group, About values |
| `shared.faq` | question, answer (blocks) | Product, FAQ group |
| `shared.list-item` | text | Product benefits |
| `sections.card-group` | heading, cards (≤6) | dynamic zone |
| `sections.faq-group` | heading, items | dynamic zone |
| `sections.cta-block` | heading, text, cta | dynamic zone |
| `sections.rich-text` | body | dynamic zone |
| `sections.legal-notice` | title, body, document (PDF) | dynamic zone |
| `contact.branch-link` | name, address, phone, mapUrl | Contact Us |

Dynamic zone `sections` (Home, About, Contact) accepts: Banner, Card group, FAQ group, CTA block, Rich text, Legal notice.

## Schema change process (record in report)

* Schemas are JSON files in `cms/src/api/**/schema.json` and `cms/src/components/**` → versioned in Git.
* The Content-Type Builder only works in development mode; production builds are read-only → schema changes go Dev → Git → CI → UAT → Prod, while **content** moves separately (see OPS-04).
