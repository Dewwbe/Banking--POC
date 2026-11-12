import type { Core } from '@strapi/strapi';
import { asSystem } from './actor';
import { seedDoc } from './seed';

/**
 * Sample Banners, Menu items and Rates (en / si / ta). Sinhala/Tamil strings are PLACEHOLDER translations for
 * testing rendering — the bank's language team must review them. Runs once per database (guarded by a count),
 * separately from seedSampleContent so that an existing database also receives these types.
 */

type Tri = { en: string; si: string; ta: string };
const LOC = ['en', 'si', 'ta'] as const;
const per = <T>(build: (l: (typeof LOC)[number]) => T) => ({ en: build('en'), si: build('si'), ta: build('ta') });

const NAV: Record<string, Tri> = {
  products: { en: 'Products', si: 'නිෂ්පාදන', ta: 'தயாரிப்புகள்' },
  rates: { en: 'Rates', si: 'පොලී අනුපාත', ta: 'வட்டி விகிதங்கள்' },
  news: { en: 'News', si: 'පුවත්', ta: 'செய்திகள்' },
  promotions: { en: 'Promotions', si: 'ප්‍රවර්ධන', ta: 'சலுகைகள்' },
  about: { en: 'About Us', si: 'අප ගැන', ta: 'எங்களைப் பற்றி' },
  contact: { en: 'Contact Us', si: 'අප අමතන්න', ta: 'தொடர்பு' },
};

export async function seedBannerMenuRates(strapi: Core.Strapi) {
  await asSystem('seed', async () => {
    // ---------------- Menu ----------------
    if ((await strapi.db.query('api::menu-item.menu-item').count()) === 0) {
      strapi.log.info('[poc-seed] Seeding menu items …');
      const item = (key: string, location: 'header' | 'footer', sortOrder: number, parent?: string) =>
        seedDoc(strapi, 'api::menu-item.menu-item', per((l) => ({ label: NAV[key][l], url: `/${key}`, location, sortOrder, ...(parent ? { parent } : {}) })), true);

      const products = await item('products', 'header', 10);
      await item('rates', 'header', 11, products); // nested example: Products → Rates
      await item('news', 'header', 20);
      await item('promotions', 'header', 30);
      await item('about', 'header', 40);
      await item('contact', 'header', 50);
      let n = 0;
      for (const key of ['products', 'rates', 'news', 'promotions', 'about', 'contact']) await item(key, 'footer', (n += 10));
    }

    // ---------------- Rates ----------------
    if ((await strapi.db.query('api::rate.rate').count()) === 0) {
      strapi.log.info('[poc-seed] Seeding rates …');
      const rate = (name: Tri, category: string, rateType: 'deposit' | 'lending', tenure: Tri, ratePercent: number, sortOrder: number) =>
        seedDoc(strapi, 'api::rate.rate', per((l) => ({
          name: name[l], category, rateType, tenure: tenure[l], ratePercent, effectiveDate: '2026-10-01', sortOrder,
          notes: { en: 'Indicative rate [PoC sample]', si: 'දර්ශක අනුපාතයකි [PoC නියැදිය]', ta: 'குறிப்பு விகிதம் [PoC மாதிரி]' }[l],
        })), true);
      const months = (m: number): Tri => ({ en: `${m} months`, si: `මාස ${m}`, ta: `${m} மாதங்கள்` });
      await rate({ en: 'Fixed Deposit', si: 'ස්ථාවර තැන්පතු', ta: 'நிலையான வைப்பு' }, 'fixed_deposit', 'deposit', months(6), 8.75, 10);
      await rate({ en: 'Fixed Deposit', si: 'ස්ථාවර තැන්පතු', ta: 'நிலையான வைப்பு' }, 'fixed_deposit', 'deposit', months(12), 9.5, 11);
      await rate({ en: 'Fixed Deposit', si: 'ස්ථාවර තැන්පතු', ta: 'நிலையான வைப்பு' }, 'fixed_deposit', 'deposit', months(24), 10.0, 12);
      await rate({ en: 'Premier Savings Account', si: 'ප්‍රිමියර් ඉතුරුම් ගිණුම', ta: 'பிரீமியர் சேமிப்புக் கணக்கு' }, 'savings', 'deposit', { en: 'Any balance', si: 'ඕනෑම ශේෂයක්', ta: 'எந்த இருப்பும்' }, 4.25, 20);
      await rate({ en: 'Personal Loan', si: 'පුද්ගලික ණය', ta: 'தனிநபர் கடன்' }, 'loan', 'lending', months(36), 14.0, 30);
    }

    // ---------------- Banners ----------------
    if ((await strapi.db.query('api::banner.banner').count()) === 0) {
      strapi.log.info('[poc-seed] Seeding banners …');
      const day = 86_400_000;
      const now = Date.now();
      const banner = (name: string, placement: string, theme: string, heading: Tri, subheading: Tri, cta: { url: string; label: Tri }, sortOrder: number, window?: [number, number]) =>
        seedDoc(strapi, 'api::banner.banner', per((l) => ({
          name, placement, theme, sortOrder, heading: heading[l], subheading: subheading[l],
          cta: { label: cta.label[l], url: cta.url, variant: 'primary' },
          ...(window ? { startDate: new Date(window[0]).toISOString(), endDate: new Date(window[1]).toISOString() } : {}),
        })), true);
      await banner('Home – savings drive', 'home_secondary', 'light',
        { en: 'Start saving today', si: 'අදම ඉතුරු කිරීම ආරම්භ කරන්න', ta: 'இன்றே சேமிக்கத் தொடங்குங்கள்' },
        { en: 'See our latest deposit rates.', si: 'අපගේ නවතම තැන්පතු අනුපාත බලන්න.', ta: 'எங்கள் சமீபத்திய வைப்பு விகிதங்களைப் பாருங்கள்.' },
        { url: '/rates', label: { en: 'View rates', si: 'අනුපාත බලන්න', ta: 'விகிதங்களைப் பார்க்க' } }, 10, [now - day, now + 60 * day]);
      await banner('Expired banner (must not show)', 'home_top', 'dark',
        { en: 'Expired campaign', si: 'කල් ඉකුත් වූ ව්‍යාපාරය', ta: 'காலாவதியான பிரச்சாரம்' },
        { en: 'This banner ended yesterday and must not appear on the site.', si: 'කල් ඉකුත් වී ඇත.', ta: 'காலாவதியானது.' },
        { url: '/promotions', label: { en: 'Promotions', si: 'ප්‍රවර්ධන', ta: 'சலுகைகள்' } }, 5, [now - 30 * day, now - day]);
      await banner('Promotions page banner', 'promotions_top', 'brand',
        { en: 'This season\'s offers', si: 'මෙම කාලයේ දීමනා', ta: 'இந்த பருவ சலுகைகள்' },
        { en: 'Offers are live only between their start and end dates.', si: 'දීමනා වලංගු වන්නේ නියමිත දිනයන් අතර පමණි.', ta: 'சலுகைகள் குறிப்பிட்ட தேதிகளுக்குள் மட்டுமே.' },
        { url: '/products', label: { en: 'Browse products', si: 'නිෂ්පාදන බලන්න', ta: 'தயாரிப்புகளைப் பார்க்க' } }, 10);
    }

    // ---------------- Subscribers (obviously fake addresses on a reserved domain) ----------------
    if ((await strapi.db.query('api::subscriber.subscriber').count()) === 0) {
      strapi.log.info('[poc-seed] Seeding sample subscribers …');
      const day = 86_400_000;
      const ago = (d: number) => new Date(Date.now() - d * day);
      const docs: any = (strapi.documents as any)('api::subscriber.subscriber');
      const rows: Array<[string, string, string, number]> = [
        ['active', 'en', 'amal', 40], ['active', 'si', 'kamal', 21], ['active', 'ta', 'priya', 12], ['active', 'en', 'nimali', 5],
        ['active', 'en', 'saman', 2], ['pending', 'en', 'waiting', 1], ['pending', 'si', 'new', 0], ['unsubscribed', 'en', 'left', 30],
      ];
      for (const [status, language, name, daysAgo] of rows) {
        await docs.create({
          data: {
            email: `${name}@example.invalid`, subscriptionStatus: status, language, source: 'website', consentAt: ago(daysAgo),
            ...(status !== 'pending' ? { confirmedAt: ago(daysAgo) } : {}), ...(status === 'unsubscribed' ? { unsubscribedAt: ago(daysAgo - 5) } : {}),
          },
        });
      }
    }

    // ---------------- Translation demo content ----------------
    if ((await strapi.db.query('api::news-article.news-article').count({ where: { slug: 'english-only-notice' } })) === 0) {
      strapi.log.info('[poc-seed] Seeding translation demo content …');
      const para = (text: string) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];
      const news = (slug: string, title: string, excerpt: string, body: string) => ({
        title, slug, category: 'notice', publicationDate: '2026-11-01', excerpt, body: para(body),
        seo: { metaTitle: title.slice(0, 60), metaDescription: excerpt.slice(0, 160) },
      });
      // 1) Published in English only: Sinhala/Tamil visitors get the English article through language fallback.
      await seedDoc(strapi, 'api::news-article.news-article', {
        en: news('english-only-notice', 'Branch holiday hours', 'Selected branches close at 1 pm on 24 December.', 'Selected branches close at 1 pm on 24 December. Online banking is unaffected.'),
      }, true);
      // 2) Draft with a deliberate numeric inconsistency: Sinhala says 9.75%, English and Tamil say 9.5%.
      const doc = await seedDoc(strapi, 'api::news-article.news-article', {
        en: news('rate-change-notice', 'Fixed deposit rate update', 'The 12-month fixed deposit rate is now 9.5% per annum.', 'From 1 December the 12-month fixed deposit rate is 9.5% per annum.'),
        si: news('rate-change-notice', 'ස්ථාවර තැන්පතු අනුපාත යාවත්කාලීනය', '12 මාසික ස්ථාවර තැන්පතු අනුපාතය දැන් වසරකට 9.75% කි.', 'දෙසැම්බර් 1 සිට 12 මාසික ස්ථාවර තැන්පතු අනුපාතය වසරකට 9.75% කි.'),
        ta: news('rate-change-notice', 'நிலையான வைப்பு விகித புதுப்பிப்பு', '12 மாத நிலையான வைப்பு விகிதம் இப்போது ஆண்டுக்கு 9.5% ஆகும்.', 'டிசம்பர் 1 முதல் 12 மாத நிலையான வைப்பு விகிதம் ஆண்டுக்கு 9.5% ஆகும்.'),
      }, false);
      // 3) English text edited after the translations were made: Sinhala and Tamil become "outdated".
      await (strapi.documents as any)('api::news-article.news-article').update({ documentId: doc, locale: 'en', data: { excerpt: 'The 12-month fixed deposit rate is now 9.5% per annum (previously 9.0%).' } });
    }

    // ---------------- SEO settings (site-wide defaults + listing-page meta data) ----------------
    if ((await strapi.db.query('api::seo-setting.seo-setting').count()) === 0) {
      strapi.log.info('[poc-seed] Seeding SEO settings …');
      const pages = (l: 'en' | 'si' | 'ta') => {
        const t: Record<string, Record<string, [string, string]>> = {
          products: {
            en: ['Banking products: savings, deposits, loans', 'Compare our savings accounts, fixed deposits and loans, with current interest rates and terms.'],
            si: ['බැංකු නිෂ්පාදන: ඉතුරුම්, තැන්පතු, ණය', 'අපගේ ඉතුරුම් ගිණුම්, ස්ථාවර තැන්පතු සහ ණය, වත්මන් පොලී අනුපාත සහ නියමයන් සමඟ සසඳන්න.'],
            ta: ['வங்கி தயாரிப்புகள்: சேமிப்பு, வைப்பு, கடன்', 'எங்கள் சேமிப்புக் கணக்குகள், நிலையான வைப்புகள் மற்றும் கடன்களை தற்போதைய வட்டி விகிதங்களுடன் ஒப்பிடுங்கள்.'],
          },
          news: {
            en: ['News and announcements', 'The latest announcements, press releases and service notices from PoC Bank.'],
            si: ['පුවත් සහ නිවේදන', 'PoC බැංකුවෙන් නවතම නිවේදන, මාධ්‍ය නිවේදන සහ සේවා දැනුම්දීම්.'],
            ta: ['செய்திகள் மற்றும் அறிவிப்புகள்', 'PoC வங்கியின் சமீபத்திய அறிவிப்புகள், செய்திக்குறிப்புகள் மற்றும் சேவை அறிவிப்புகள்.'],
          },
          promotions: {
            en: ['Current promotions and offers', 'Limited-time offers on deposits and everyday banking. See the dates each offer is valid.'],
            si: ['වත්මන් ප්‍රවර්ධන සහ දීමනා', 'තැන්පතු සහ එදිනෙදා බැංකුකරණය සඳහා කාල-සීමිත දීමනා. සෑම දීමනාවක්ම වලංගු දින බලන්න.'],
            ta: ['தற்போதைய சலுகைகள்', 'வைப்புகள் மற்றும் அன்றாட வங்கிக்கான கால வரம்பு சலுகைகள். ஒவ்வொரு சலுகையும் செல்லுபடியாகும் தேதிகளைப் பாருங்கள்.'],
          },
          rates: {
            en: ['Interest rates', 'Current deposit and lending interest rates, with the date each rate took effect.'],
            si: ['පොලී අනුපාත', 'වත්මන් තැන්පතු සහ ණය පොලී අනුපාත, සෑම අනුපාතයක්ම බලපැවැත්වෙන දිනය සමඟ.'],
            ta: ['வட்டி விகிதங்கள்', 'தற்போதைய வைப்பு மற்றும் கடன் வட்டி விகிதங்கள், ஒவ்வொன்றும் அமலுக்கு வந்த தேதியுடன்.'],
          },
        };
        return Object.entries(t).map(([pageKey, v]) => ({ pageKey, metaTitle: v[l][0], metaDescription: v[l][1], noIndex: false }));
      };
      const desc = {
        en: 'PoC Bank: savings, fixed deposits, loans and everyday banking. A demonstration site built with Strapi and Next.js.',
        si: 'PoC බැංකුව: ඉතුරුම්, ස්ථාවර තැන්පතු, ණය සහ එදිනෙදා බැංකුකරණය. Strapi සහ Next.js ආශ්‍රයෙන් සාදන ලද නිරූපණ අඩවියකි.',
        ta: 'PoC வங்கி: சேமிப்பு, நிலையான வைப்பு, கடன் மற்றும் அன்றாட வங்கி. Strapi மற்றும் Next.js மூலம் உருவாக்கப்பட்ட டெமோ தளம்.',
      };
      await seedDoc(strapi, 'api::seo-setting.seo-setting', per((l) => ({
        siteName: 'PoC Bank', titleTemplate: '{title} | {siteName}', defaultDescription: desc[l], listingPages: pages(l),
      })), true);
    }
  });
}
