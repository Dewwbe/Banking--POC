import type { StrapiApp } from '@strapi/strapi/admin';
import { ClockCounterClockwise, PuzzlePiece } from '@strapi/icons';
import { injectMicrosoftSignIn } from './sso-button';

/**
 * Admin-panel customisation (Strapi Community has no SSO and one shared homepage):
 *  - login page: adds "Sign in with Microsoft" next to the email/password form (see src/admin/sso-button.ts);
 *  - homepage: a role-aware "My work queue" widget, so a Reviewer, Approver, Publisher or Editor lands on a page
 *    showing exactly the content waiting for them (see src/admin/widgets/WorkQueue.tsx).
 */
export default {
  config: {
    locales: [],
  },

  register(app: StrapiApp) {
    app.widgets.register({
      id: 'work-queue',
      icon: PuzzlePiece,
      title: { id: 'poc.work-queue.title', defaultMessage: 'My work queue' },
      component: async () => {
        const { WorkQueue } = await import('./widgets/WorkQueue');
        return WorkQueue;
      },
    });

    // Latest audit-trail entries. The permission makes Strapi show it only to users who may read the Audit Log.
    app.widgets.register({
      id: 'audit-feed',
      icon: ClockCounterClockwise,
      title: { id: 'poc.audit-feed.title', defaultMessage: 'Recent audit activity' },
      permissions: [{ action: 'plugin::content-manager.explorer.read', subject: 'api::audit-log.audit-log' }],
      component: async () => {
        const { AuditFeed } = await import('./widgets/AuditFeed');
        return AuditFeed;
      },
    });
  },

  bootstrap() {
    injectMicrosoftSignIn();
  },
};
