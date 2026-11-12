/**
 * Subscribers hold personal data, so NO core CRUD routes are registered: the only public surface is these three
 * write-only endpoints (no listing, no lookup). Staff manage subscribers through the admin Content Manager API
 * (RBAC-protected) via the Subscribers dashboard.
 */
export default {
  routes: [
    { method: 'POST', path: '/subscribers/subscribe', handler: 'subscriber.subscribe', config: { auth: false, policies: [], middlewares: [] } },
    { method: 'POST', path: '/subscribers/confirm', handler: 'subscriber.confirm', config: { auth: false, policies: [], middlewares: [] } },
    { method: 'POST', path: '/subscribers/unsubscribe', handler: 'subscriber.unsubscribe', config: { auth: false, policies: [], middlewares: [] } },
  ],
};
