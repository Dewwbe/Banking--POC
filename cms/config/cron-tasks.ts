import { runPromotionScheduler } from '../src/poc/scheduler';
import { runScheduledPublishing } from '../src/poc/schedule';

export default {
  pocPromotionScheduler: {
    task: async ({ strapi }) => {
      await runPromotionScheduler(strapi);
      await runScheduledPublishing(strapi); // publish/unpublish times set by a Publisher on all other governed types
    },
    options: { rule: process.env.CUSTOM_SCHEDULER_CRON || '*/1 * * * *' },
  },
};
