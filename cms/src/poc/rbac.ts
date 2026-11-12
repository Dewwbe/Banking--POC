import type { Core } from '@strapi/strapi';
import { AUDIT_UID, LOCALES, ROLES, SINGLE_TYPES, SUPER_ADMIN_CODE, SYSTEM_WORKFLOW_FIELDS, WORKFLOW_UIDS } from './constants';

/**
 * Workstream B — creates the PoC admin roles with field-, locale- and content-type-level permissions using
 * Strapi Community RBAC (custom roles ARE available in Community; "conditions" beyond the built-in
 * "Is creator" / "Has same role as creator" are not).
 *
 * The configuration is applied programmatically so it is reproducible, but every role remains editable in
 * Settings → Administration Panel → Roles. Screenshot that screen as evidence (docs/03-permission-matrix.md).
 * If assignPermissions changes signature in a future 5.x release, configure the roles manually from the matrix.
 */

const CM = 'plugin::content-manager.explorer';
const UPLOAD_EDIT = ['plugin::upload.read', 'plugin::upload.assets.create', 'plugin::upload.assets.update',
  'plugin::upload.assets.download', 'plugin::upload.assets.copy-link', 'plugin::upload.configure-view'];
const UPLOAD_READ = ['plugin::upload.read', 'plugin::upload.assets.download', 'plugin::upload.assets.copy-link'];

/** Leaf field paths of a content type, as the admin RBAC expects them (components → dotted paths). */
function fieldPaths(strapi: Core.Strapi, uid: string, prefix = '', depth = 0): string[] {
  const model: any = strapi.getModel(uid as any);
  const out: string[] = [];
  for (const [name, attr] of Object.entries<any>(model.attributes)) {
    if (['createdAt', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy', 'localizations', 'locale', 'documentId', 'id'].includes(name)) continue;
    const path = prefix ? `${prefix}.${name}` : name;
    if (attr.type === 'component' && depth < 4) out.push(...fieldPaths(strapi, attr.component, path, depth + 1));
    else out.push(path);
  }
  return out;
}

type Perm = { action: string; subject?: string | null; properties?: Record<string, any>; conditions?: string[] };

function cmPerms(strapi: Core.Strapi, uids: readonly string[], actions: string[], fieldFilter?: (f: string) => boolean): Perm[] {
  const perms: Perm[] = [];
  for (const uid of uids) {
    const all = fieldPaths(strapi, uid);
    for (const a of actions) {
      const properties: Record<string, any> = { locales: LOCALES.map((l) => l.code) };
      if (['create', 'read', 'update'].includes(a)) properties.fields = fieldFilter && a !== 'read' ? all.filter(fieldFilter) : all;
      perms.push({ action: `${CM}.${a}`, subject: uid, properties, conditions: [] });
    }
  }
  return perms;
}

const notSystemField = (f: string) => !SYSTEM_WORKFLOW_FIELDS.includes(f);
const onlyWorkflowDecision = (f: string) => f === 'workflowStage' || f === 'reviewComment';
const onlyStage = (f: string) => f === 'workflowStage';

const perm = (action: string): Perm => ({ action, subject: null, properties: {}, conditions: [] });
const PROMOTION = ['api::promotion.promotion', 'api::banner.banner'] as const;
const CONTACT = ['api::contact-us.contact-us'] as const;
const AUTHOR_TYPES = WORKFLOW_UIDS.filter((u) => !(PROMOTION as readonly string[]).includes(u) && u !== CONTACT[0]);

/**
 * One-time migration for databases created before Banner / Menu item / Rate existed: roles are only built when
 * missing (so manual edits in the admin are never overwritten), which would leave existing roles without access to
 * the new content types. This adds ONLY the permissions for those types, once per role.
 */
const SUBSCRIBER = 'api::subscriber.subscriber';
/** Subscribers are personal data: not localized, no draft/publish, no workflow. Field list is explicit. */
function subscriberPerms(actions: string[]): Perm[] {
  const fields = ['email', 'subscriptionStatus', 'language', 'source', 'consentAt', 'confirmedAt', 'unsubscribedAt', 'notes'];
  return actions.map((a) => ({ action: `${CM}.${a}`, subject: SUBSCRIBER, properties: ['create', 'read', 'update'].includes(a) ? { fields } : {}, conditions: [] }));
}
const NEW_TYPES = ['api::banner.banner', 'api::menu-item.menu-item', 'api::rate.rate'];
async function migrateNewTypes(strapi: Core.Strapi, roleService: any, roleId: number, def: { name: string; permissions: () => Perm[] }, key: string, types: string[]) {
  const store = strapi.store({ type: 'plugin', name: 'poc-rbac', key: `${key}:${def.name}` });
  if (await store.get({})) return;
  try {
    const wanted = def.permissions().filter((p) => p.subject && types.includes(p.subject));
    if (wanted.length) await roleService.addPermissions(roleId, wanted);
    await store.set({ value: true });
    if (wanted.length) strapi.log.info(`[poc-rbac] Added ${wanted.length} ${key} permissions to existing role "${def.name}"`);
  } catch (err) {
    strapi.log.warn(`[poc-rbac] Could not add ${key} permissions to "${def.name}": ${(err as Error).message}. Edit the role in Settings → Roles.`);
  }
}

const BUILTIN_CODES = ['strapi-editor', 'strapi-author'];
async function takeOverBuiltinRole(strapi: Core.Strapi, roleService: any, role: any, def: { name: string; description: string; permissions: () => Perm[] }) {
  const store = strapi.store({ type: 'plugin', name: 'poc-rbac', key: `builtin-takeover:${def.name}` });
  if (await store.get({})) return;
  try {
    await roleService.assignPermissions(role.id, def.permissions());
    await strapi.db.query('admin::role').update({ where: { id: role.id }, data: { description: def.description } });
    await store.set({ value: true });
    for (const key of ['banner-menu-rate', 'subscribers', 'seo-settings']) await strapi.store({ type: 'plugin', name: 'poc-rbac', key: `${key}:${def.name}` }).set({ value: true });
    strapi.log.info(`[poc-rbac] Replaced the built-in "${def.name}" role's default permissions with the PoC permission set`);
  } catch (err) {
    strapi.log.error(`[poc-rbac] Could not take over the built-in "${def.name}" role: ${(err as Error).message}. Its default permissions are STILL ACTIVE — configure it in Settings → Roles.`);
  }
}

export async function ensureRoles(strapi: Core.Strapi): Promise<Record<string, number>> {
  const roleService: any = strapi.service('admin::role');
  const ids: Record<string, number> = {};

  const definitions: Array<{ name: string; description: string; permissions: () => Perm[] }> = [
    {
      name: ROLES.author,
      description: 'Create and edit drafts of products, rates, menu, news and page content; submit for review. Cannot publish, delete or edit approval metadata.',
      permissions: () => [...cmPerms(strapi, AUTHOR_TYPES, ['create', 'read', 'update'], notSystemField), ...UPLOAD_EDIT.map(perm)],
    },
    {
      name: ROLES.editor,
      description: 'Editorial review: read everything; change only workflow stage + review comment (pass to compliance or request changes).',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['read', 'update'], onlyWorkflowDecision), ...UPLOAD_READ.map(perm)],
    },
    {
      name: ROLES.complianceReviewer,
      description: 'Compliance approval: read everything; change only workflow stage + review comment (approve or request changes).',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['read', 'update'], onlyWorkflowDecision), ...UPLOAD_READ.map(perm)],
    },
    {
      name: ROLES.publisher,
      description: 'Publish / unpublish approved content. Update limited to workflow stage (required by the Publish button flow).',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['read', 'update', 'publish'], onlyStage), ...UPLOAD_READ.map(perm)],
    },
    {
      name: ROLES.promotionsAdmin,
      description: 'Owns promotions and banners (create/edit and submit for review) and manages subscribers. Read-only on other content.',
      permissions: () => [
        ...cmPerms(strapi, PROMOTION, ['create', 'read', 'update'], notSystemField),
        ...cmPerms(strapi, WORKFLOW_UIDS.filter((u) => !(PROMOTION as readonly string[]).includes(u)), ['read']),
        ...subscriberPerms(['create', 'read', 'update', 'delete']),
        ...UPLOAD_EDIT.map(perm),
      ],
    },
    {
      name: ROLES.branchAdmin,
      description: 'Owns branch / contact information (Contact Us): edit and submit for review. Read-only on other content.',
      permissions: () => [
        ...cmPerms(strapi, CONTACT, ['create', 'read', 'update'], notSystemField),
        ...cmPerms(strapi, WORKFLOW_UIDS.filter((u) => u !== CONTACT[0]), ['read']),
        ...UPLOAD_EDIT.map(perm),
      ],
    },
    {
      name: ROLES.systemAdmin,
      description: 'Invites, activates and deactivates CMS users and assigns roles; reads/erases subscribers. No content permissions (separation of duties).',
      permissions: () => [
        ...['admin::users.create', 'admin::users.read', 'admin::users.update', 'admin::users.delete', 'admin::roles.read'].map(perm),
        ...(strapi.getModel(AUDIT_UID as any) ? cmPerms(strapi, [AUDIT_UID], ['read']) : []),
        ...subscriberPerms(['read', 'delete']), // read for support, delete for data-erasure requests
      ],
    },
  ];

  for (const def of definitions) {
    let role = await strapi.db.query('admin::role').findOne({ where: { name: def.name } });
    // Strapi ships its OWN roles named "Editor" and "Author" (codes strapi-editor / strapi-author) with broad
    // default permissions (e.g. audit-log access, "is creator" conditions). Looking roles up by name would silently
    // adopt those instead of ours, so take them over once: replace the defaults with this PoC's permission set.
    if (role && BUILTIN_CODES.includes(role.code)) await takeOverBuiltinRole(strapi, roleService, role, def);
    if (role) {
      await migrateNewTypes(strapi, roleService, role.id, def, 'banner-menu-rate', NEW_TYPES);
      await migrateNewTypes(strapi, roleService, role.id, def, 'subscribers', [SUBSCRIBER]);
      await migrateNewTypes(strapi, roleService, role.id, def, 'seo-settings', ['api::seo-setting.seo-setting']);
    }
    if (!role) {
      role = await roleService.create({ name: def.name, description: def.description });
      try {
        await roleService.assignPermissions(role.id, def.permissions());
        for (const key of ['banner-menu-rate', 'subscribers', 'seo-settings']) await strapi.store({ type: 'plugin', name: 'poc-rbac', key: `${key}:${def.name}` }).set({ value: true });
        strapi.log.info(`[poc-rbac] Created role "${def.name}" with ${def.permissions().length} permissions`);
      } catch (err) {
        strapi.log.warn(`[poc-rbac] Role "${def.name}" created but permissions could not be assigned automatically: ${(err as Error).message}. Configure it manually from docs/03-permission-matrix.md.`);
      }
    }
    ids[def.name] = role.id;
  }
  return ids;
}

/**
 * Creates ONLY the first Super Admin (so /admin's open first-run registration form is closed), from
 * SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD. No other user is ever created with a known password:
 * the System Administrator invites everyone else from Settings > Administration Panel > Users > Invite new user;
 * each invitee sets their own password through the one-time registration link.
 */
export async function ensureBootstrapAdmin(strapi: Core.Strapi) {
  const superAdmins = await strapi.db.query('admin::user').count({ where: { roles: { code: SUPER_ADMIN_CODE } } });
  if (superAdmins > 0) return;
  const email = process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!email || !password || password.startsWith('CHANGE_ME')) {
    strapi.log.warn('[poc-rbac] No Super Admin yet and SEED_SUPERADMIN_EMAIL/PASSWORD not set — register one at /admin');
    return;
  }
  const superRole = await (strapi.service('admin::role') as any).getSuperAdmin();
  await (strapi.service('admin::user') as any).create({
    email, firstname: 'Bootstrap', lastname: 'Admin', password, roles: [superRole.id], isActive: true, registrationToken: null,
  });
  strapi.log.info(`[poc-rbac] Created bootstrap Super Admin ${email}. Use it once to invite a System Administrator, then store the credentials offline.`);
}

/** Public (unauthenticated) content-API permissions: read-only, published content only. */
export async function ensurePublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  if (!publicRole) return;
  const actions: string[] = [];
  for (const uid of WORKFLOW_UIDS) {
    actions.push(`${uid}.find`);
    if (!SINGLE_TYPES.includes(uid)) actions.push(`${uid}.findOne`);
  }
  actions.push('plugin::i18n.locales.listLocales');
  for (const action of actions) {
    const exists = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: publicRole.id } });
    if (!exists) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: publicRole.id } });
  }

  // The public site has no end-user accounts: make sure self-registration is off.
  const store = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'advanced' });
  const advanced: any = (await store.get()) ?? {};
  if (advanced.allow_register !== false) await store.set({ value: { ...advanced, allow_register: false } });
}
