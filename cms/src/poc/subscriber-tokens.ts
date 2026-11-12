import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless confirm / unsubscribe tokens: "<documentId>.<hmac>". Nothing secret is stored in the database, and a
 * token only works for its own purpose (a confirm link cannot be used to unsubscribe, and vice versa).
 * Tokens do not expire; a confirm link only acts on a *pending* subscriber, so a stale link cannot re-subscribe
 * someone who has since unsubscribed.
 */
export type TokenPurpose = 'confirm' | 'unsubscribe';

function secret() {
  const s = process.env.ENCRYPTION_KEY || process.env.ADMIN_JWT_SECRET;
  if (!s) throw new Error('ENCRYPTION_KEY / ADMIN_JWT_SECRET is not set');
  return s;
}

const mac = (purpose: TokenPurpose, documentId: string) =>
  createHmac('sha256', secret()).update(`${purpose}:${documentId}`).digest('hex').slice(0, 40);

export const makeToken = (purpose: TokenPurpose, documentId: string) => `${documentId}.${mac(purpose, documentId)}`;

/** Returns the documentId when the token is valid for that purpose, otherwise null. */
export function verifyToken(purpose: TokenPurpose, token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const documentId = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(purpose, documentId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? documentId : null;
}
