/**
 * Adds a "Sign in with Microsoft" button under the Strapi login form. The login page is rendered by the admin
 * app and (in Community) has no extension point, so the button is added to the DOM when that route appears.
 *
 * The button is a plain link to /sso/entra: nginx sends the browser through Entra ID (oauth2-proxy), then the CMS
 * opens a normal admin session for the Strapi user with the same email and redirects back to /admin.
 */

const MESSAGES: Record<string, string> = {
  not_registered: 'Your Microsoft account is not registered in this CMS. Ask a Super Admin to invite you and assign a role.',
  not_active: 'Your invitation has not been completed yet. Open the invitation link you were sent and set a password first.',
  blocked: 'This CMS account is blocked. Contact a Super Admin.',
  no_identity: 'Microsoft sign-in did not return an email address.',
  ambiguous: 'Your Microsoft account maps to several CMS accounts. Contact a Super Admin.',
  session_error: 'Could not start a CMS session. Please try again.',
};

const MS_LOGO =
  '<svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/>' +
  '<rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>' +
  '<rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';

const WRAPPER_ID = 'poc-entra-signin';

function mount() {
  if (!window.location.pathname.endsWith('/auth/login')) return;
  if (document.getElementById(WRAPPER_ID)) return;
  const form = document.querySelector('form');
  if (!form) return;

  const wrapper = document.createElement('div');
  wrapper.id = WRAPPER_ID;
  wrapper.style.cssText = 'margin-top:20px;display:flex;flex-direction:column;gap:12px;align-items:stretch;text-align:center';

  const error = new URLSearchParams(window.location.search).get('sso_error');
  if (error) {
    const note = document.createElement('div');
    note.setAttribute('role', 'alert');
    note.textContent = MESSAGES[error] ?? 'Microsoft sign-in failed.';
    note.style.cssText = 'padding:10px 12px;border-radius:4px;background:#fcecea;color:#b72b1a;font-size:14px;text-align:left';
    wrapper.appendChild(note);
  }

  const or = document.createElement('div');
  or.textContent = 'or';
  or.style.cssText = 'font-size:14px;opacity:.7';
  wrapper.appendChild(or);

  const button = document.createElement('a');
  button.href = '/sso/entra';
  button.innerHTML = `${MS_LOGO}<span>Sign in with Microsoft</span>`;
  button.style.cssText =
    'display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 16px;border:1px solid #8e8ea9;' +
    'border-radius:4px;color:inherit;text-decoration:none;font-size:14px;font-weight:600;cursor:pointer';
  wrapper.appendChild(button);

  form.insertAdjacentElement('afterend', wrapper);
}

export function injectMicrosoftSignIn() {
  mount();
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
}
