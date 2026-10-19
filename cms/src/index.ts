import type { Core } from '@strapi/strapi';
import { registerWorkflow } from './poc/workflow';
import { registerAdminEvents } from './poc/admin-events';
import { ensurePublicPermissions, ensureRoles, ensureTestUsers } from './poc/rbac';
import { ensureRevalidateWebhook } from './poc/webhooks';
import { seedSampleContent } from './poc/seed';
import { asSystem } from './poc/actor';

export default {
  /**
   * register() runs before the app is initialised: install the Document Service middleware here so that it
   * wraps every document operation, including those triggered during bootstrap.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    registerWorkflow(strapi);
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    registerAdminEvents(strapi);
    // Everything below runs as an attributed system task, so audit entries say "system:bootstrap".
    await asSystem('bootstrap', () => setup(strapi));
  },
};

async function setup(strapi: Core.Strapi) {
  {
    await ensurePublicPermissions(strapi);

    const roleIds = await ensureRoles(strapi);
    if (process.env.SEED_TEST_USERS === 'true') await ensureTestUsers(strapi, roleIds);
    if (process.env.SEED_SAMPLE_CONTENT === 'true') {
      await seedSampleContent(strapi).catch((e) => strapi.log.error(`[poc-seed] ${e.stack ?? e.message}`));
    }
    await ensureRevalidateWebhook(strapi);

    strapi.log.info(
      `[poc] Governance prototype active — enforcement=${process.env.WORKFLOW_ENFORCEMENT !== 'false'}, ` +
        `superAdminOverride=${process.env.WORKFLOW_SUPERADMIN_OVERRIDE === 'true'}, ` +
        `blockContentApiDrafts=${process.env.WORKFLOW_BLOCK_CONTENT_API_DRAFTS !== 'false'}`
    );
  }
}
