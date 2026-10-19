import { runPromotionScheduler } from '../src/poc/scheduler';

export default {
  pocPromotionScheduler: {
    task: async ({ strapi }) => runPromotionScheduler(strapi),
    options: { rule: process.env.CUSTOM_SCHEDULER_CRON || '*/1 * * * *' },
  },
};
