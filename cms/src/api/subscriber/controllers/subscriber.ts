import { factories } from '@strapi/strapi';
import { makeToken, verifyToken } from '../../../poc/subscriber-tokens';

const UID = 'api::subscriber.subscriber';
const LANGS = ['en', 'si', 'ta'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const OK = { data: { ok: true } };

/** Tiny in-memory sliding-window limiter (single-instance PoC; use a shared store behind several instances). */
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 10_000) hits.clear();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

const MAIL: Record<string, { subject: string; intro: string; ignore: string }> = {
  en: { subject: 'Please confirm your subscription', intro: 'Thanks for subscribing. Please confirm your email address:', ignore: 'If you did not ask for this, ignore this email.' },
  si: { subject: 'කරුණාකර ඔබේ දායකත්වය තහවුරු කරන්න', intro: 'දායක වීමට ස්තූතියි. කරුණාකර ඔබේ ඊමේල් ලිපිනය තහවුරු කරන්න:', ignore: 'ඔබ මෙය ඉල්ලා නොමැති නම් මෙම ඊමේලය නොසලකන්න.' },
  ta: { subject: 'உங்கள் சந்தாவை உறுதிப்படுத்தவும்', intro: 'சந்தா செய்ததற்கு நன்றி. உங்கள் மின்னஞ்சலை உறுதிப்படுத்தவும்:', ignore: 'நீங்கள் கேட்கவில்லை எனில் இதைப் புறக்கணிக்கவும்.' },
};

async function sendConfirmation(strapi: any, sub: any) {
  const base = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = `${base}/${sub.language ?? 'en'}/subscribe/confirm?token=${encodeURIComponent(makeToken('confirm', sub.documentId))}`;
  const m = MAIL[sub.language] ?? MAIL.en;
  const email = strapi.plugin('email')?.service('email');
  if (!email) throw new Error('email plugin not installed');
  await email.send({
    to: sub.email,
    subject: m.subject,
    text: `${m.intro}\n${link}\n\n${m.ignore}`,
    html: `<p>${m.intro}</p><p><a href="${link}">${link}</a></p><p>${m.ignore}</p>`,
  });
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  /** Public. Always answers the same way for valid input, so it cannot be used to discover who is subscribed. */
  async subscribe(ctx) {
    const body: any = ctx.request.body ?? {};
    if (body.website) {
      ctx.body = OK; // honeypot field: real users never fill it
      return;
    }
    const email = String(body.email ?? '').trim().toLowerCase();
    const language = LANGS.includes(body.language) ? body.language : 'en';
    if (email.length > 254 || !EMAIL_RE.test(email)) return ctx.badRequest('Please enter a valid email address.');
    if (limited('all', 300, 3_600_000) || limited(`email:${email}`, 3, 3_600_000)) return ctx.tooManyRequests('Too many requests. Please try again later.');

    const docs: any = strapi.documents(UID as any);
    const existing = (await docs.findMany({ filters: { email: { $eq: email } }, limit: 1 }))[0];
    const doubleOptIn = process.env.SUBSCRIBER_DOUBLE_OPT_IN !== 'false';
    const now = new Date();
    let sub = existing;

    if (!existing) {
      sub = await docs.create({
        data: { email, language, source: 'website', consentAt: now, subscriptionStatus: doubleOptIn ? 'pending' : 'active', confirmedAt: doubleOptIn ? null : now },
      });
    } else if (existing.subscriptionStatus === 'unsubscribed') {
      sub = await docs.update({
        documentId: existing.documentId,
        data: { language, consentAt: now, unsubscribedAt: null, subscriptionStatus: doubleOptIn ? 'pending' : 'active', confirmedAt: doubleOptIn ? null : now },
      });
    } else if (existing.subscriptionStatus === 'active') {
      ctx.body = OK;
      return;
    }

    if (sub.subscriptionStatus === 'pending') {
      await sendConfirmation(strapi, sub).catch((e: Error) =>
        strapi.log.warn(`[subscribers] Confirmation email could not be sent (${e.message}). Configure an email provider (config/plugins.ts) or confirm manually in the Subscribers dashboard.`)
      );
    }
    ctx.body = OK;
  },

  async confirm(ctx) {
    const documentId = verifyToken('confirm', (ctx.request.body as any)?.token);
    if (!documentId) return ctx.badRequest('This link is invalid.');
    const docs: any = strapi.documents(UID as any);
    const sub = await docs.findOne({ documentId });
    if (!sub) return ctx.badRequest('This link is invalid.');
    if (sub.subscriptionStatus === 'pending') await docs.update({ documentId, data: { subscriptionStatus: 'active', confirmedAt: new Date() } });
    ctx.body = { data: { ok: true, status: sub.subscriptionStatus === 'unsubscribed' ? 'unsubscribed' : 'active' } };
  },

  async unsubscribe(ctx) {
    const documentId = verifyToken('unsubscribe', (ctx.request.body as any)?.token);
    if (!documentId) return ctx.badRequest('This link is invalid.');
    const docs: any = strapi.documents(UID as any);
    const sub = await docs.findOne({ documentId });
    if (!sub) return ctx.badRequest('This link is invalid.');
    if (sub.subscriptionStatus !== 'unsubscribed') await docs.update({ documentId, data: { subscriptionStatus: 'unsubscribed', unsubscribedAt: new Date() } });
    ctx.body = OK;
  },
}));
