import cronTasks from './cron-tasks';

export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  url: env('PUBLIC_URL', ''),
  // true when running behind the nginx proxy (infra/nginx) so client IPs / HTTPS are taken from X-Forwarded-*
  proxy: { koa: env.bool('IS_PROXIED', false) },
  app: { keys: env.array('APP_KEYS') },
  cron: {
    enabled: env.bool('CUSTOM_SCHEDULER_ENABLED', true),
    tasks: cronTasks,
  },
});
