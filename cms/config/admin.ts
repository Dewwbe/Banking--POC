export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    // Workstream E — session expiry. Verify the effective behaviour in the PoC (SEC-02):
    // log in, wait / shorten these values, and confirm the admin is forced to re-authenticate.
    sessions: {
      maxSessionLifespan: env.int('ADMIN_SESSION_MAX_LIFESPAN_SECONDS', 28800),
      maxRefreshTokenLifespan: env.int('ADMIN_REFRESH_MAX_LIFESPAN_SECONDS', 86400),
    },
  },
  // Workstream E — failed-login throttling on /admin/login (SEC-03).
  rateLimit: {
    enabled: true,
    interval: { ms: env.int('ADMIN_LOGIN_RATE_LIMIT_INTERVAL_MS', 60000) },
    max: env.int('ADMIN_LOGIN_RATE_LIMIT_MAX', 5),
  },
  apiToken: { salt: env('API_TOKEN_SALT') },
  transfer: { token: { salt: env('TRANSFER_TOKEN_SALT') } },
  secrets: { encryptionKey: env('ENCRYPTION_KEY') },
  flags: {
    nps: false,
    promoteEE: true, // keep the Enterprise upsell markers visible — useful evidence for the licence matrix
  },
});
