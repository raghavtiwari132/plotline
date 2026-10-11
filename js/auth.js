// Sign-in sheet (Google / email) and the profile menu.

import { backend } from './backend.js';
import { REGIONS } from './config.js';
import { $, esc, ICONS, relTime } from './util.js';
import { openModal, toast, avatar } from './ui.js';
import { state, updatePrefs, region } from './store.js';

const GOOGLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z"/></svg>';

const FIREBASE_ERRORS = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account with that email yet. Create one below.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'Use at least 6 characters for your password.',
  'auth/invalid-email': "That email doesn't look right.",
  'auth/operation-not-allowed': "This sign-in method isn't enabled in your Firebase project yet.",
  'auth/unauthorized-domain': 'Add this domain under Firebase → Authentication → Settings → Authorized domains.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};

export function openAuth({ reason = '', onDone } = {}) {
  const demo = backend.mode === 'demo';
  let view = 'choose';
  let pendingProvider = null;
  const { el, close } = openModal('<div class="auth-body"></div>', { label: 'Sign in' });
  const body = $('.auth-body', el);

  const done = user => {
    close();
    toast(`Welcome${user?.name ? ', ' + user.name.split(' ')[0] : ''}!`, { icon: true });
    onDone?.(user);
  };
  const fail = err => {
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
    $('.form-error', body).textContent = FIREBASE_ERRORS[err?.code] || err?.message || 'Something went wrong.';
  };

  function render() {
    if (view === 'choose' || view === 'signup') {
      const signup = view === 'signup';
      body.innerHTML = `
        <div class="auth-logo logo-mark" style="width:56px;height:56px;border-radius:18px"></div>
        <h3>${signup ? 'Create your account' : 'Sign in to Plotline'}</h3>
        <p class="lead">${esc(reason ? `Sign in ${reason}.` : 'Keep your list, ratings and reviews on every device.')}</p>
        ${demo ? `<div class="mode-banner"><b>Demo mode.</b> Sign-in is simulated in this browser. Add your Firebase config to enable real Google and email accounts.</div>` : ''}
        <button class="auth-btn auth-google" data-p="google">${GOOGLE}Continue with Google</button>
        <div class="or">or use email</div>
        <form novalidate>
          ${signup ? `<div class="field"><label for="au-name">Name</label><input class="input" id="au-name" name="name" autocomplete="name" required></div>` : ''}
          <div class="field"><label for="au-email">Email</label><input class="input" id="au-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="au-pass">Password</label><input class="input" id="au-pass" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></div>
          <div class="form-error" role="alert"></div>
          <button class="btn btn-grad" style="width:100%" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
        </form>
        <div class="auth-switch">${signup ? 'Already have an account? <button type="button" data-v="choose">Sign in</button>'
          : 'New here? <button type="button" data-v="signup">Create an account</button>'}
          ${!signup && !demo ? ' · <button type="button" data-v="reset">Forgot password?</button>' : ''}</div>
        <p class="auth-note">${demo ? 'Demo accounts never leave this browser and passwords are not stored.' : 'By continuing you agree to the Terms and Privacy Policy.'}</p>`;
      body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => social(b.dataset.p));
      body.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { view = b.dataset.v; render(); });
      $('form', body).onsubmit = e => { e.preventDefault(); emailSubmit(new FormData(e.target), signup); };
    } else if (view === 'demo-name') {
      body.innerHTML = `
        <h3>One more thing</h3>
        <p class="lead">What should we call you? (Demo Google sign-in.)</p>
        <form novalidate>
          <div class="field"><label for="au-dn">Display name</label><input class="input" id="au-dn" name="name" autocomplete="name" required></div>
          <div class="form-error" role="alert"></div>
          <button class="btn btn-grad" style="width:100%" type="submit">Continue</button>
        </form>
        <div class="auth-switch"><button type="button" data-v="choose">Back</button></div>`;
      $('[data-v]', body).onclick = () => { view = 'choose'; render(); };
      $('form', body).onsubmit = async e => {
        e.preventDefault();
        const name = new FormData(e.target).get('name').trim();
        if (!name) { $('.form-error', body).textContent = 'Please enter a name.'; return; }
        done(await backend.signIn(pendingProvider, { name }));
      };
      setTimeout(() => $('input', body).focus(), 50);
    } else if (view === 'reset') {
      body.innerHTML = `
        <h3>Reset your password</h3>
        <p class="lead">We'll email you a link to choose a new one.</p>
        <form novalidate>
          <div class="field"><label for="au-re">Email</label><input class="input" id="au-re" name="email" type="email" autocomplete="email" required></div>
          <div class="form-error" role="alert"></div>
          <button class="btn btn-grad" style="width:100%" type="submit">Send reset link</button>
        </form>
        <div class="auth-switch"><button type="button" data-v="choose">Back to sign in</button></div>`;
      $('[data-v]', body).onclick = () => { view = 'choose'; render(); };
      $('form', body).onsubmit = async e => {
        e.preventDefault();
        try {
          await backend.resetPassword(new FormData(e.target).get('email').trim());
          toast('Check your inbox for a reset link.', { icon: true });
          view = 'choose'; render();
        } catch (err) { fail(err); }
      };
    }
  }

  async function social(provider) {
    if (demo) { pendingProvider = provider; view = 'demo-name'; render(); return; }
    try { done(await backend.signIn(provider)); } catch (err) { fail(err); }
  }

  async function emailSubmit(fd, signup) {
    const email = (fd.get('email') || '').trim();
    const password = fd.get('password') || '';
    const name = (fd.get('name') || '').trim();
    const errEl = $('.form-error', body);
    if (signup && !name) return void (errEl.textContent = 'Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return void (errEl.textContent = "That email doesn't look right.");
    if (password.length < 6) return void (errEl.textContent = 'Passwords need at least 6 characters.');
    errEl.textContent = '';
    try {
      done(await backend.signIn('email', { email, password, name, create: signup }));
    } catch (err) { fail(err); }
  }

  render();
}

// ───────── Profile menu ─────────
let openMenuEl = null;

export function closeUserMenu() {
  openMenuEl?.remove();
  openMenuEl = null;
}

export function openUserMenu() {
  if (openMenuEl) return closeUserMenu();
  const u = backend.user;
  const providerName = { google: 'Google', 'google.com': 'Google', email: 'Email', password: 'Email' }[u?.provider] || '';
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <div class="menu-head">${avatar(u)}<div><b>${esc(u?.name || 'Guest')}</b><span>${esc(u ? (u.email || providerName + ' account') : 'Not signed in')}</span></div></div>
    <a href="#/watchlist" role="menuitem">${ICONS.list}My list</a>
    <a href="#/quiz" role="menuitem">${ICONS.sparkle}Retake taste quiz</a>
    <label class="mi-select">${ICONS.globe}Region
      <select aria-label="Region">${Object.entries(REGIONS).map(([k, v]) => `<option value="${k}" ${k === region() ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
    </label>
    ${u ? `<button class="mi" data-out role="menuitem">${ICONS.logout}Sign out</button>` : `<button class="mi" data-in role="menuitem">${ICONS.user}Sign in or create account</button>`}
    <div class="dim" style="font-size:11.5px;padding:10px 12px 4px;border-top:1px solid var(--line);margin-top:6px">
      ${backend.mode === 'demo' ? 'Demo mode · data stays in this browser' : 'Connected · reviews are shared'}<br>
      ${state.generatedAt ? `Catalog updated ${relTime(Date.parse(state.generatedAt))}` : ''}
    </div>`;
  document.body.appendChild(menu);
  openMenuEl = menu;
  menu.querySelector('select').onchange = e => { updatePrefs({ region: e.target.value }); toast(`Region set to ${REGIONS[e.target.value]}`); };
  menu.querySelector('[data-out]')?.addEventListener('click', async () => { closeUserMenu(); await backend.signOut(); toast('Signed out'); });
  menu.querySelector('[data-in]')?.addEventListener('click', () => { closeUserMenu(); openAuth(); });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeUserMenu));
  setTimeout(() => {
    const away = e => {
      if (!menu.contains(e.target) && !e.target.closest('[data-user]')) { closeUserMenu(); document.removeEventListener('pointerdown', away); }
    };
    document.addEventListener('pointerdown', away);
  });
}
