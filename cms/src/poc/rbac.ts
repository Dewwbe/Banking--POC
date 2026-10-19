import type { Core } from '@strapi/strapi';
import { LOCALES, ROLES, SYSTEM_WORKFLOW_FIELDS, WORKFLOW_UIDS } from './constants';

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

export async function ensureRoles(strapi: Core.Strapi): Promise<Record<string, number>> {
  const roleService: any = strapi.service('admin::role');
  const ids: Record<string, number> = {};

  const definitions: Array<{ name: string; description: string; permissions: () => Perm[] }> = [
    {
      name: ROLES.editor,
      description: 'PoC: create and edit drafts, submit for review. Cannot publish, delete or edit approval metadata.',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['create', 'read', 'update'], notSystemField),
        ...UPLOAD_EDIT.map((action) => ({ action, subject: null, properties: {}, conditions: [] }))],
    },
    {
      name: ROLES.newsEditor,
      description: 'PoC: like Bank Editor but restricted to News Articles only (content-type restriction test).',
      permissions: () => [...cmPerms(strapi, ['api::news-article.news-article'], ['create', 'read', 'update'], notSystemField),
        ...UPLOAD_EDIT.map((action) => ({ action, subject: null, properties: {}, conditions: [] }))],
    },
    {
      name: ROLES.reviewer,
      description: 'PoC: read everything, change only workflow stage + review comment (field-level permission test).',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['read', 'update'], onlyWorkflowDecision),
        ...UPLOAD_READ.map((action) => ({ action, subject: null, properties: {}, conditions: [] }))],
    },
    {
      name: ROLES.approver,
      description: 'PoC: compliance approval — read everything, change only workflow stage + comment.',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['read', 'update'], onlyWorkflowDecision),
        ...UPLOAD_READ.map((action) => ({ action, subject: null, properties: {}, conditions: [] }))],
    },
    {
      name: ROLES.publisher,
      description: 'PoC: publish / unpublish approved content. Update limited to workflow stage (required by the Publish button flow).',
      permissions: () => [...cmPerms(strapi, WORKFLOW_UIDS, ['read', 'update', 'publish'], onlyStage),
        ...UPLOAD_READ.map((action) => ({ action, subject: null, properties: {}, conditions: [] }))],
    },
  ];

  for (const def of definitions) {
    let role = await strapi.db.query('admin::role').findOne({ where: { name: def.name } });
    if (!role) {
      role = await roleService.create({ name: def.name, description: def.description });
      try {
        await roleService.assignPermissions(role.id, def.permissions());
        strapi.log.info(`[poc-rbac] Created role "${def.name}" with ${def.permissions().length} permissions`);
      } catch (err) {
        strapi.log.warn(`[poc-rbac] Role "${def.name}" created but permissions could not be assigned automatically: ${(err as Error).message}. Configure it manually from docs/03-permission-matrix.md.`);
      }
    }
    ids[def.name] = role.id;
  }
  return ids;
}

export async function ensureTestUsers(strapi: Core.Strapi, roleIds: Record<string, number>) {
  const password = process.env.SEED_TEST_USER_PASSWORD;
  if (!password || password.startsWith('CHANGE_ME')) {
    strapi.log.warn('[poc-rbac] SEED_TEST_USER_PASSWORD not set — test users not created');
    return;
  }
  const users = [
    { email: 'editor@poc.local', firstname: 'Erin', lastname: 'Editor', role: ROLES.editor },
    { email: 'news.editor@poc.local', firstname: 'Nimal', lastname: 'NewsEditor', role: ROLES.newsEditor },
    { email: 'reviewer@poc.local', firstname: 'Rehana', lastname: 'Reviewer', role: ROLES.reviewer },
    { email: 'approver@poc.local', firstname: 'Arjun', lastname: 'Approver', role: ROLES.approver },
    { email: 'publisher@poc.local', firstname: 'Priya', lastname: 'Publisher', role: ROLES.publisher },
  ];
  const userService: any = strapi.service('admin::user');

  // Creating ANY admin user closes Strapi's first-run "register super admin" screen, so make sure a
  // Super Admin exists first (finding: the first-run registration form is open to anyone who reaches /admin
  // until an admin exists — protect /admin at the network level from the very first deployment).
  const superAdmins = await strapi.db.query('admin::user').count({ where: { roles: { code: 'strapi-super-admin' } } });
  if (superAdmins === 0) {
    const email = process.env.SEED_SUPERADMIN_EMAIL;
    const saPassword = process.env.SEED_SUPERADMIN_PASSWORD;
    if (!email || !saPassword || saPassword.startsWith('CHANGE_ME')) {
      strapi.log.warn('[poc-rbac] No Super Admin yet and SEED_SUPERADMIN_EMAIL/PASSWORD not set — register one at /admin, then restart to create test users');
      return;
    }
    const superRole = await (strapi.service('admin::role') as any).getSuperAdmin();
    await userService.create({ email, firstname: 'PoC', lastname: 'SuperAdmin', password: saPassword, roles: [superRole.id], isActive: true, registrationToken: null });
    strapi.log.info(`[poc-rbac] Created Super Admin ${email}`);
  }

  for (const u of users) {
    const exists = await strapi.db.query('admin::user').findOne({ where: { email: u.email } });
    if (exists) continue;
    await userService.create({
      email: u.email, firstname: u.firstname, lastname: u.lastname, password,
      roles: [roleIds[u.role]], isActive: true, registrationToken: null,
    });
    strapi.log.info(`[poc-rbac] Created test user ${u.email} (${u.role})`);
  }
}

/** Public (unauthenticated) content-API permissions: read-only, published content only. */
export async function ensurePublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  if (!publicRole) return;
  const actions: string[] = [];
  for (const uid of WORKFLOW_UIDS) {
    actions.push(`${uid}.find`);
    if (!['api::home.home', 'api::about-us.about-us', 'api::contact-us.contact-us'].includes(uid)) actions.push(`${uid}.findOne`);
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
