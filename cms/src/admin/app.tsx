import type { StrapiApp } from '@strapi/strapi/admin';
import { ClockCounterClockwise, Layout, Mail, PuzzlePiece, Clock, Globe, Search } from '@strapi/icons';
import { injectMicrosoftSignIn } from './sso-button';
import { VersionHistory } from './components/VersionHistory';
import { TranslationStatus } from './components/TranslationStatus';

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
    // Drag-and-drop page builder for the Home / About Us / Contact Us sections (see src/admin/pages/PageBuilder.tsx).
    // No link-level permission: the page saves through the Content Manager API, so each user's own RBAC decides
    // which pages they can open and change.
    app.addMenuLink({
      to: 'page-builder',
      permissions: [],
      icon: Layout,
      intlLabel: { id: 'poc.page-builder.label', defaultMessage: 'Page Builder' },
      Component: () => import('./pages/PageBuilder').then((m) => ({ default: m.PageBuilder })),
    });

    // Workflow Center: stage actions, scheduling and rollback in one screen (src/admin/pages/WorkflowCenter.tsx).
    // Server-side rules decide what each role can actually do; the link is shown to everyone with a workflow role.
    app.addMenuLink({
      to: 'workflow-center',
      permissions: [],
      icon: Clock,
      intlLabel: { id: 'poc.workflow-center.label', defaultMessage: 'Workflow Center' },
      Component: () => import('./pages/WorkflowCenter').then((m) => ({ default: m.WorkflowCenter })),
    });

    // Translation Center: per-language status, outdated detection and consistency report (src/admin/pages/TranslationCenter.tsx).
    app.addMenuLink({
      to: 'translations',
      permissions: [],
      icon: Globe,
      intlLabel: { id: 'poc.translations.label', defaultMessage: 'Translations' },
      Component: () => import('./pages/TranslationCenter').then((m) => ({ default: m.TranslationCenter })),
    });

    // SEO manager: meta title / description audit and editing (src/admin/pages/SeoManager.tsx).
    app.addMenuLink({
      to: 'seo-manager',
      permissions: [],
      icon: Search,
      intlLabel: { id: 'poc.seo-manager.label', defaultMessage: 'SEO manager' },
      Component: () => import('./pages/SeoManager').then((m) => ({ default: m.SeoManager })),
    });

    // Subscriber management dashboard (src/admin/pages/SubscriberDashboard.tsx). Visible only to users who may read
    // subscribers; the page itself also goes through the Content Manager API, so RBAC is enforced server-side.
    app.addMenuLink({
      to: 'subscribers',
      permissions: [{ action: 'plugin::content-manager.explorer.read', subject: 'api::subscriber.subscriber' }],
      icon: Mail,
      intlLabel: { id: 'poc.subscribers.label', defaultMessage: 'Subscribers' },
      Component: () => import('./pages/SubscriberDashboard').then((m) => ({ default: m.SubscriberDashboard })),
    });

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

  bootstrap(app: StrapiApp) {
    injectMicrosoftSignIn();

    // "Version history" panel on the Content Manager edit screen of every governed content type: list of versions,
    // field-level comparison and restore (see src/admin/components/VersionHistory.tsx, src/poc/versions.ts).
    const GOVERNED = ['api::home.home', 'api::about-us.about-us', 'api::contact-us.contact-us', 'api::product.product', 'api::news-article.news-article', 'api::promotion.promotion', 'api::banner.banner', 'api::menu-item.menu-item', 'api::rate.rate', 'api::seo-setting.seo-setting'];
    (app.getPlugin('content-manager') as any)?.apis?.addEditViewSidePanel?.([
      ({ model, documentId, document }: any) => {
        if (!GOVERNED.includes(model) || !documentId || !document?.locale) return null;
        return { title: 'Version history', content: <VersionHistory uid={model} documentId={documentId} locale={document.locale} /> };
      },
      ({ model, documentId }: any) => {
        if (!GOVERNED.includes(model) || !documentId) return null;
        return { title: 'Translations & consistency', content: <TranslationStatus uid={model} documentId={documentId} /> };
      },
    ]);
  },
};
