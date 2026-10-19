import type { Core } from '@strapi/strapi';

/**
 * Workstream F — registers (once) the webhook that tells Next.js to revalidate cached pages.
 * Webhooks are a Community feature; this just makes the PoC reproducible. It stays editable in
 * Settings → Webhooks (screenshot it as evidence; use "Trigger" to test delivery).
 */
export async function ensureRevalidateWebhook(strapi: Core.Strapi) {
  const url = process.env.NEXT_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret || secret.startsWith('CHANGE_ME')) {
    strapi.log.warn('[poc-webhook] NEXT_REVALIDATE_URL / REVALIDATE_SECRET not set — webhook not registered');
    return;
  }
  try {
    const store: any = strapi.get('webhookStore');
    const existing = (await store.findWebhooks()).find((w: any) => w.name === 'Next.js revalidate');
    if (existing) return;
    const webhook = await store.createWebhook({
      name: 'Next.js revalidate',
      url,
      headers: { 'x-revalidate-secret': secret },
      events: ['entry.create', 'entry.update', 'entry.delete', 'entry.publish', 'entry.unpublish', 'media.update', 'media.delete'],
      isEnabled: true,
    });
    strapi.get('webhookRunner').add(webhook);
    strapi.log.info(`[poc-webhook] Registered revalidation webhook → ${url}`);
  } catch (err) {
    strapi.log.warn(`[poc-webhook] Could not register webhook automatically (${(err as Error).message}). Create it in Settings → Webhooks.`);
  }
}
