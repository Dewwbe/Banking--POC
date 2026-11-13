import { runPromotionScheduler } from '../src/poc/scheduler';
import { runScheduledPublishing } from '../src/poc/schedule';
import { purgeOldEvents } from '../src/poc/analytics';

export default {
  pocPromotionScheduler: {
    task: async ({ strapi }) => {
      await runPromotionScheduler(strapi);
      await runScheduledPublishing(strapi); // publish/unpublish times set by a Publisher on all other governed types
    },
    options: { rule: process.env.CUSTOM_SCHEDULER_CRON || '*/1 * * * *' },
  },
  // Analytics events older than ANALYTICS_RETENTION_DAYS (default 180) are deleted every night.
  pocAnalyticsRetention: {
    task: async ({ strapi }) => {
      await purgeOldEvents(strapi);
    },
    options: { rule: '30 3 * * *' },
  },
};
