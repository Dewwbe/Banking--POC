import { AsyncLocalStorage } from 'node:async_hooks';
import type { Core } from '@strapi/strapi';
import { flags, ROLES, SUPER_ADMIN_CODE } from './constants';

/**
 * Resolves WHO is performing a document-service action, for both enforcement and audit.
 *
 *  - admin        → logged-in CMS user (admin panel / admin API), with role names
 *  - content-api  → REST/GraphQL caller: public, API token, or users-permissions user
 *  - system       → server-side jobs (seed, scheduler) wrapped in asSystem()
 */
export type Actor = {
  channel: 'admin' | 'content-api' | 'system';
  id: string;
  email: string;
  roles: string[];
  isSuperAdmin: boolean;
  isPreviewToken: boolean;
  systemReason?: string;
  ip?: string;
  userAgent?: string;
};

const systemContext = new AsyncLocalStorage<{ reason: string }>();

/** Run fn as a server-side system task. Async-safe: concurrent HTTP requests never inherit this context. */
export const asSystem = <T>(reason: string, fn: () => Promise<T>): Promise<T> =>
  systemContext.run({ reason }, fn);

export function getActor(strapi: Core.Strapi): Actor {
  const sys = systemContext.getStore();
  if (sys) {
    return {
      channel: 'system',
      id: 'system',
      email: `system:${sys.reason}`,
      roles: ['system'],
      isSuperAdmin: false,
      isPreviewToken: false,
      systemReason: sys.reason,
    };
  }

  const ctx: any = strapi.requestContext.get();
  if (!ctx) {
    // A document-service call outside any request and outside asSystem(): treat as unattributed and deny writes.
    return { channel: 'system', id: 'unattributed', email: 'unattributed', roles: [], isSuperAdmin: false, isPreviewToken: false };
  }

  const ip = ctx.request?.ip;
  const userAgent = ctx.request?.headers?.['user-agent'];
  const strategy = ctx.state?.auth?.strategy?.name;
  const user = ctx.state?.user;

  // 'admin' = admin panel session; 'admin-token' = admin API token acting on behalf of a user (automation).
  if ((strategy === 'admin' || strategy === 'admin-token') && user) {
    const roles = (user.roles ?? []) as Array<{ name: string; code: string }>;
    const viaToken = strategy === 'admin-token' ? ` via admin-token:${ctx.state.auth.credentials?.name ?? '?'}` : '';
    return {
      channel: 'admin',
      id: `admin:${user.id}${viaToken}`,
      email: user.email,
      roles: roles.map((r) => r.name),
      isSuperAdmin: roles.some((r) => r.code === SUPER_ADMIN_CODE),
      isPreviewToken: false,
      ip,
      userAgent,
    };
  }

  // Strategy is 'content-api-token' in current Strapi 5 releases ('api-token' in earlier ones).
  if (strategy === 'content-api-token' || strategy === 'api-token') {
    const name = ctx.state.auth.credentials?.name ?? 'unknown';
    return {
      channel: 'content-api',
      id: `api-token:${ctx.state.auth.credentials?.id ?? '?'}`,
      email: `api-token:${name}`,
      roles: [`api-token:${ctx.state.auth.credentials?.type ?? '?'}`],
      isSuperAdmin: false,
      isPreviewToken: name === flags.previewTokenName(),
      ip,
      userAgent,
    };
  }

  if (strategy === 'users-permissions' && user) {
    return {
      channel: 'content-api',
      id: `up-user:${user.id}`,
      email: user.email,
      roles: [user.role?.name ?? 'authenticated'],
      isSuperAdmin: false,
      isPreviewToken: false,
      ip,
      userAgent,
    };
  }

  return { channel: 'content-api', id: 'public', email: 'public', roles: ['public'], isSuperAdmin: false, isPreviewToken: false, ip, userAgent };
}

export const hasRole = (actor: Actor, ...names: string[]) => names.some((n) => actor.roles.includes(n));
export const isEditor = (a: Actor) => hasRole(a, ROLES.editor, ROLES.newsEditor);
export const isReviewer = (a: Actor) => hasRole(a, ROLES.reviewer);
export const isApprover = (a: Actor) => hasRole(a, ROLES.approver);
export const isPublisher = (a: Actor) => hasRole(a, ROLES.publisher);
