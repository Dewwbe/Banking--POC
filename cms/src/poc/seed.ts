import type { Core } from '@strapi/strapi';
import { asSystem } from './actor';
import { contentHash, loadVersion } from './content-hash';
import { LOCALES } from './constants';

/**
 * Sample banking content in English, Sinhala and Tamil (Workstream A).
 * Sinhala/Tamil strings are PLACEHOLDER translations for testing rendering, fonts and locale fallback —
 * they must be reviewed by the bank's language team before being shown to anyone.
 *
 * Seed states are chosen to exercise the lifecycle tests:
 *   products     fixed-deposit (published), premier-savings (published), personal-loan (draft only)
 *   news         2 published, 1 draft
 *   promotions   active (published), expired-but-published (scheduler must unpublish),
 *                scheduled (approved, starts in 3 minutes — scheduler must publish)
 * Media (images / PDFs) is intentionally NOT seeded: uploading through the Media Library is a test (MED-01..05).
 */

type Tri = { en: string; si: string; ta: string };
const p = (text: string) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];
const DISCLAIMER: Tri = {
  en: 'Rates are indicative and subject to change. Terms and conditions apply. [PoC sample]',
  si: 'පොලී අනුපාත වෙනස් විය හැක. නියම හා කොන්දේසි අදාළ වේ. [PoC නියැදිය]',
  ta: 'வட்டி விகிதங்கள் மாற்றத்திற்கு உட்பட்டவை. நிபந்தனைகள் பொருந்தும். [PoC மாதிரி]',
};

async function ensureLocales(strapi: Core.Strapi) {
  const svc: any = strapi.plugin('i18n').service('locales');
  const existing: any[] = await svc.find();
  for (const l of LOCALES) {
    if (!existing.some((e) => e.code === l.code)) await svc.create({ code: l.code, name: l.name, isDefault: false });
  }
}

/** Create a document in en, add si/ta versions, optionally mark approved (system seed) and publish. */
async function seedDoc(strapi: Core.Strapi, uid: string, byLocale: Record<string, any>, publish: boolean) {
  const docs: any = (strapi.documents as any)(uid);
  const created = await docs.create({ locale: 'en', data: byLocale.en });
  for (const loc of ['si', 'ta']) {
    if (byLocale[loc]) await docs.update({ documentId: created.documentId, locale: loc, data: byLocale[loc] });
  }
  for (const loc of Object.keys(byLocale)) {
    const draft = await loadVersion(strapi, uid, created.documentId, loc, 'draft');
    const approved = publish || byLocale[loc].__approve;
    if (draft && approved) {
      await strapi.db.query(uid as any).update({
        where: { id: draft.id },
        data: { workflowStage: 'approved', approvedBy: 'system:seed', approvedAt: new Date(), approvedHash: contentHash(draft), submittedBy: 'system:seed', reviewedBy: 'system:seed' },
      });
    }
  }
  if (publish) await docs.publish({ documentId: created.documentId, locale: '*' });
  return created.documentId;
}

const tri = (t: Tri, build: (s: string, l: keyof Tri) => any) => ({ en: build(t.en, 'en'), si: build(t.si, 'si'), ta: build(t.ta, 'ta') });

export async function seedSampleContent(strapi: Core.Strapi) {
  await ensureLocales(strapi);
  const already = await strapi.db.query('api::product.product').count();
  if (already > 0) return;

  await asSystem('seed', async () => {
    strapi.log.info('[poc-seed] Seeding sample banking content (en / si / ta) …');

    // ---------------- Products ----------------
    const product = (slug: string, category: string, rate: number, name: Tri, summary: Tri, benefits: Tri[]) =>
      tri(name, (n, l) => ({
        name: n, slug, category, interestRate: rate, rateEffectiveDate: '2026-10-01',
        summary: summary[l], description: p(summary[l]),
        benefits: benefits.map((b) => ({ text: b[l] })),
        disclaimer: p(DISCLAIMER[l]),
        faqs: [{ question: { en: 'Who can apply?', si: 'අයදුම් කළ හැක්කේ කාටද?', ta: 'யார் விண்ணப்பிக்கலாம்?' }[l],
                 answer: p({ en: 'Sri Lankan residents aged 18 and above.', si: 'වයස 18 ඉක්මවූ ශ්‍රී ලංකා පදිංචිකරුවන්.', ta: '18 வயதுக்கு மேற்பட்ட இலங்கை வதிவாளர்கள்.' }[l]) }],
        seo: { metaTitle: n.slice(0, 60), metaDescription: summary[l].slice(0, 160) },
      }));

    const fd = await seedDoc(strapi, 'api::product.product', product('fixed-deposit', 'fixed_deposit', 9.5,
      { en: 'Fixed Deposit', si: 'ස්ථාවර තැන්පතු', ta: 'நிலையான வைப்பு' },
      { en: 'Grow your savings with a guaranteed return for 1 to 60 months.', si: 'මාස 1 සිට 60 දක්වා සහතික ප්‍රතිලාභයක් සමඟ ඔබේ ඉතුරුම් වර්ධනය කරන්න.', ta: '1 முதல் 60 மாதங்களுக்கு உத்தரவாத வருமானத்துடன் உங்கள் சேமிப்பை வளர்க்கவும்.' },
      [{ en: 'Flexible tenures', si: 'නම්‍යශීලී කාල සීමා', ta: 'நெகிழ்வான காலங்கள்' }, { en: 'Loan facility against deposit', si: 'තැන්පතුව මත ණය පහසුකම', ta: 'வைப்புக்கு எதிரான கடன் வசதி' }]), true);

    const sv = await seedDoc(strapi, 'api::product.product', product('premier-savings', 'savings', 4.25,
      { en: 'Premier Savings Account', si: 'ප්‍රිමියර් ඉතුරුම් ගිණුම', ta: 'பிரீமியர் சேமிப்புக் கணக்கு' },
      { en: 'A savings account with tiered interest and free digital banking.', si: 'ස්ථර පොලිය සහ නොමිලේ ඩිජිටල් බැංකුකරණය සහිත ඉතුරුම් ගිණුමක්.', ta: 'அடுக்கு வட்டி மற்றும் இலவச டிஜிட்டல் வங்கியுடன் கூடிய சேமிப்புக் கணக்கு.' },
      [{ en: 'Tiered interest', si: 'ස්ථර පොලිය', ta: 'அடுக்கு வட்டி' }]), true);

    await seedDoc(strapi, 'api::product.product', product('personal-loan', 'loan', 14.0,
      { en: 'Personal Loan', si: 'පුද්ගලික ණය', ta: 'தனிநபர் கடன்' },
      { en: 'Draft product — must never appear on the public website until approved and published.', si: 'කෙටුම්පත් නිෂ්පාදනය.', ta: 'வரைவு தயாரிப்பு.' },
      []), false);

    // ---------------- News ----------------
    const news = (slug: string, category: string, date: string, title: Tri, body: Tri) =>
      tri(title, (t, l) => ({ title: t, slug, category, publicationDate: date, excerpt: body[l], body: p(body[l]), seo: { metaTitle: t.slice(0, 60), metaDescription: body[l].slice(0, 160) } }));

    await seedDoc(strapi, 'api::news-article.news-article', news('q3-results', 'press_release', '2026-10-10',
      { en: 'Bank announces Q3 results', si: 'බැංකුව තුන්වන කාර්තු ප්‍රතිඵල නිවේදනය කරයි', ta: 'வங்கி மூன்றாம் காலாண்டு முடிவுகளை அறிவிக்கிறது' },
      { en: 'Sample press release for the PoC.', si: 'PoC සඳහා නියැදි මාධ්‍ය නිවේදනයකි.', ta: 'PoC க்கான மாதிரி செய்திக்குறிப்பு.' }), true);
    await seedDoc(strapi, 'api::news-article.news-article', news('system-maintenance', 'notice', '2026-10-15',
      { en: 'Scheduled system maintenance', si: 'සැලසුම් කළ පද්ධති නඩත්තුව', ta: 'திட்டமிட்ட கணினி பராமரிப்பு' },
      { en: 'Online banking will be unavailable on Sunday from 1am to 3am.', si: 'ඉරිදා පෙ.ව. 1 සිට 3 දක්වා ඔන්ලයින් බැංකුකරණය ලබා ගත නොහැක.', ta: 'ஞாயிறு அதிகாலை 1 முதல் 3 வரை இணைய வங்கி கிடைக்காது.' }), true);
    await seedDoc(strapi, 'api::news-article.news-article', news('unannounced-merger', 'announcement', '2026-11-01',
      { en: 'DRAFT: confidential announcement', si: 'කෙටුම්පත', ta: 'வரைவு' },
      { en: 'This draft must never be visible on the public API.', si: 'කෙටුම්පත.', ta: 'வரைவு.' }), false);

    // ---------------- Promotions ----------------
    const day = 86_400_000;
    const now = Date.now();
    const promo = (slug: string, start: number, end: number, title: Tri, approve = false) =>
      tri(title, (t, l) => ({
        title: t, slug, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(),
        summary: t, terms: p(DISCLAIMER[l]), cta: { label: { en: 'Learn more', si: 'තව දැනගන්න', ta: 'மேலும் அறிய' }[l], url: `/${l}/products/fixed-deposit` },
        seo: { metaTitle: t.slice(0, 60), metaDescription: t.slice(0, 160) }, __approve: approve,
      }));
    const strip = (o: any) => Object.fromEntries(Object.entries(o).map(([l, d]: any) => { const { __approve, ...rest } = d; return [l, rest]; }));

    await seedDoc(strapi, 'api::promotion.promotion', strip(promo('festive-fd-bonus', now - day, now + 30 * day,
      { en: 'Festive FD bonus: +0.5% p.a.', si: 'උත්සව FD ප්‍රසාද: +0.5%', ta: 'பண்டிகை FD போனஸ்: +0.5%' })), true);
    await seedDoc(strapi, 'api::promotion.promotion', strip(promo('expired-card-offer', now - 30 * day, now - day,
      { en: 'Expired card cashback offer', si: 'කල් ඉකුත් වූ කාඩ්පත් දීමනාව', ta: 'காலாவதியான அட்டை சலுகை' })), true);
    const scheduled = promo('scheduled-new-year', now + 3 * 60_000, now + 10 * day,
      { en: 'Scheduled: New Year savings drive', si: 'සැලසුම්: නව වසර ඉතුරුම්', ta: 'திட்டமிடப்பட்டது: புத்தாண்டு சேமிப்பு' }, true);
    // keep the __approve marker for seedDoc, but strip it from the data written to Strapi
    const schedDocs: any = (strapi.documents as any)('api::promotion.promotion');
    const s = strip(scheduled);
    const created = await schedDocs.create({ locale: 'en', data: s.en });
    for (const l of ['si', 'ta']) await schedDocs.update({ documentId: created.documentId, locale: l, data: s[l] });
    for (const l of ['en', 'si', 'ta']) {
      const d = await loadVersion(strapi, 'api::promotion.promotion', created.documentId, l, 'draft');
      await strapi.db.query('api::promotion.promotion').update({ where: { id: d.id }, data: { workflowStage: 'approved', approvedBy: 'system:seed', approvedAt: new Date(), approvedHash: contentHash(d) } });
    }

    // ---------------- Single types ----------------
    const sections = (l: keyof Tri) => [
      { __component: 'sections.card-group', heading: { en: 'Why bank with us', si: 'අප සමඟ බැංකු කරන්නේ ඇයි', ta: 'ஏன் எங்களுடன்' }[l],
        cards: [{ title: { en: 'Digital first', si: 'ඩිජිටල් ප්‍රමුඛ', ta: 'டிஜிட்டல் முதன்மை' }[l], body: 'PoC' }, { title: { en: '200+ branches', si: 'ශාඛා 200+', ta: '200+ கிளைகள்' }[l], body: 'PoC' }] },
      { __component: 'sections.faq-group', heading: 'FAQ', items: [{ question: { en: 'How do I open an account?', si: 'ගිණුමක් විවෘත කරන්නේ කෙසේද?', ta: 'கணக்கை எவ்வாறு திறப்பது?' }[l], answer: p('PoC sample answer.') }] },
      { __component: 'sections.legal-notice', title: { en: 'Regulatory notice', si: 'නියාමන දැනුම්දීම', ta: 'ஒழுங்குமுறை அறிவிப்பு' }[l], body: p(DISCLAIMER[l]) },
    ];
    const home = (l: keyof Tri) => ({
      title: { en: 'Home', si: 'මුල් පිටුව', ta: 'முகப்பு' }[l],
      hero: { heading: { en: 'Banking that grows with you', si: 'ඔබ සමඟ වැඩෙන බැංකුකරණය', ta: 'உங்களுடன் வளரும் வங்கி' }[l], subheading: 'PoC', theme: 'brand',
        cta: [{ label: { en: 'View products', si: 'නිෂ්පාදන බලන්න', ta: 'தயாரிப்புகள்' }[l], url: `/${l}/products`, variant: 'primary' }] },
      featuredProducts: [fd, sv],
      sections: sections(l),
      seo: { metaTitle: 'PoC Bank', metaDescription: 'Strapi Community Edition PoC — sample banking website' },
    });
    await seedDoc(strapi, 'api::home.home', { en: home('en'), si: home('si'), ta: home('ta') }, true);

    const about = (l: keyof Tri) => ({
      title: { en: 'About Us', si: 'අප ගැන', ta: 'எங்களைப் பற்றி' }[l],
      introduction: p({ en: 'A sample bank used to evaluate Strapi Community Edition.', si: 'Strapi ඇගයීම සඳහා නියැදි බැංකුවකි.', ta: 'Strapi மதிப்பீட்டிற்கான மாதிரி வங்கி.' }[l]),
      mission: 'PoC', values: [{ title: { en: 'Integrity', si: 'අවංකභාවය', ta: 'நேர்மை' }[l], body: 'PoC' }],
      seo: { metaTitle: 'About Us', metaDescription: 'About the PoC bank' },
    });
    await seedDoc(strapi, 'api::about-us.about-us', { en: about('en'), si: about('si'), ta: about('ta') }, true);

    const contact = (l: keyof Tri) => ({
      title: { en: 'Contact Us', si: 'අප අමතන්න', ta: 'எங்களை தொடர்பு கொள்ள' }[l],
      hotline: '+94 11 000 0000', email: 'contact@example.com',
      supportHours: { en: '24/7 hotline; branches Mon–Fri 9am–3pm', si: 'පැය 24 දුරකථන සේවාව', ta: '24/7 தொலைபேசி சேவை' }[l],
      headOfficeAddress: 'PoC Head Office, Colombo',
      branches: [{ name: 'Colombo Fort', address: 'Sample address', phone: '+94 11 000 0001' }, { name: 'Kandy', address: 'Sample address' }],
      seo: { metaTitle: 'Contact Us', metaDescription: 'Contact the PoC bank' },
    });
    await seedDoc(strapi, 'api::contact-us.contact-us', { en: contact('en'), si: contact('si'), ta: contact('ta') }, true);

    strapi.log.info('[poc-seed] Done. The "scheduled-new-year" promotion should auto-publish in ~3 minutes; "expired-card-offer" should auto-unpublish within a minute.');
  });
}
