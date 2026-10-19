import type { Core } from '@strapi/strapi';
import { getActor } from './actor';
import { writeAudit } from './audit';

/**
 * Workstream D/E — capture administrative events (logins, user/role changes, media changes) from Strapi's
 * internal event hub into the custom audit log. Content entry events are already captured by the workflow
 * middleware with richer detail, so entry.* is skipped here.
 *
 * PoC finding to record: which of these events Community actually emits (the hub feeds the Enterprise Audit
 * Logs feature). Failed admin logins are NOT emitted — they are only visible in HTTP/proxy logs.
 */
const INTERESTING = /^(admin\.(auth|logout)|user\.|role\.|permission\.|media\.|api-token\.|transfer-token\.|webhook\.|content-type\.|component\.)/;

const pick = (o: any) =>
  o && typeof o === 'object'
    ? Object.fromEntries(
        Object.entries(o).filter(([k]) => ['id', 'documentId', 'email', 'name', 'code', 'hash', 'mime', 'size', 'url', 'provider', 'isActive', 'type', 'uid'].includes(k))
      )
    : o;

export function registerAdminEvents(strapi: Core.Strapi) {
  const hub: any = strapi.eventHub;
  if (!hub?.subscribe) {
    strapi.log.warn('[poc-audit] eventHub.subscribe not available — admin events not captured');
    return;
  }
  hub.subscribe(async (name: string, ...args: any[]) => {
    if (!INTERESTING.test(name)) return;
    const payload = args[0] ?? {};
    const subject = payload.user ?? payload.role ?? payload.media ?? payload.apiToken ?? payload.webhook ?? payload;
    const actor = getActor(strapi);
    // admin.auth.success happens before ctx.state.user is set: attribute it to the logged-in user.
    if (name === 'admin.auth.success' && payload.user) {
      actor.channel = 'admin';
      actor.id = `admin:${payload.user.id}`;
      actor.email = payload.user.email;
    }
    void writeAudit(strapi, {
      action: `event:${name}`,
      outcome: 'allowed',
      actor,
      contentType: null,
      documentId: subject?.documentId ?? (subject?.id != null ? String(subject.id) : null),
      after: pick(subject),
    });
  });
}
