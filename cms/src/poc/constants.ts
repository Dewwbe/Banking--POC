/**
 * Shared constants for the PoC governance prototype (Workstreams B, C, D).
 * Everything under src/poc is CUSTOM code — none of it is a native Strapi Community feature.
 */

export const WORKFLOW_UIDS = [
  'api::home.home',
  'api::about-us.about-us',
  'api::contact-us.contact-us',
  'api::product.product',
  'api::news-article.news-article',
  'api::promotion.promotion',
] as const;

export const SINGLE_TYPES = ['api::home.home', 'api::about-us.about-us', 'api::contact-us.contact-us'];

export const AUDIT_UID = 'api::audit-log.audit-log';

/** Custom admin roles created by bootstrap (src/poc/rbac.ts). Names are the contract with the workflow rules. */
export const ROLES = {
  editor: 'Bank Editor',
  newsEditor: 'Bank News Editor',
  reviewer: 'Bank Reviewer',
  approver: 'Bank Approver',
  publisher: 'Bank Publisher',
} as const;

export const SUPER_ADMIN_CODE = 'strapi-super-admin';

export type Stage = 'draft' | 'in_review' | 'changes_requested' | 'awaiting_approval' | 'approved';

/** Workflow fields that only the server may write (stripped from any incoming payload). */
export const SYSTEM_WORKFLOW_FIELDS = ['submittedBy', 'reviewedBy', 'approvedBy', 'approvedAt', 'approvedHash'];

/** All workflow fields — excluded from the content hash so that approval metadata never changes the hash. */
export const WORKFLOW_FIELDS = ['workflowStage', 'reviewComment', ...SYSTEM_WORKFLOW_FIELDS];

export const LOCALES = [
  { code: 'en', name: 'English (en)' },
  { code: 'si', name: 'Sinhala (si)' },
  { code: 'ta', name: 'Tamil (ta)' },
];

export const flags = {
  enforcement: () => process.env.WORKFLOW_ENFORCEMENT !== 'false',
  superAdminOverride: () => process.env.WORKFLOW_SUPERADMIN_OVERRIDE === 'true',
  blockContentApiDrafts: () => process.env.WORKFLOW_BLOCK_CONTENT_API_DRAFTS !== 'false',
  previewTokenName: () => process.env.PREVIEW_TOKEN_NAME || 'nextjs-preview',
};
