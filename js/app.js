// Plotline — app shell: boot, router, header.

import { $, $$, ICONS, on, reducedMotion } from './util.js';
import { state, loadCatalog, setRemoteSaver, mergeRemote } from './store.js';
import { backend } from './backend.js';
import { avatar } from './ui.js';
import { openAuth, openUserMenu, closeUserMenu } from './auth.js';
import { openSearch } from './search.js';
import { renderHome } from './views/home.js';
import { renderDetail } from './views/detail.js';
import { renderWatchlist } from './views/watchlist.js';
import { renderLanding, renderQuiz } from './views/landing.js';
import { renderShared } from './views/shared.js';

const ROUTES = [
  [/^\/?$/, (el, m, p) => renderHome(el, p)],
  [/^\/title\/(.+)$/, (el, m) => renderDetail(el, decodeURIComponent(m[1]))],
  [/^\/watchlist$/, (el, m, p) => renderWatchlist(el, p)],
  [/^\/welcome$/, el => renderLanding(el)],
  [/^\/quiz$/, el => renderQuiz(el)],
  [/^\/list$/, (el, m, p) => renderShared(el, p)],
];
const OPEN_ROUTES = ['/welcome', '/quiz', '/list'];

let cleanup = null;
let rendered = false;
let fromHistory = false;
const scrollMemory = new Map();
let lastHash = location.hash;

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(qs || '') };
}

function route() {
  const { path, params } = parseHash();
  const onboarded = Boolean(state.prefs?.completedAt);
  if (!onboarded && !OPEN_ROUTES.includes(path) && !path.startsWith('/title/')) {
    location.replace('#/welcome');
    return;
  }
  if (onboarded && path === '/welcome') { location.replace('#/'); return; }

  const match = ROUTES.map(([re, fn]) => [path.match(re), fn]).find(([m]) => m);
  const [m, handler] = match || [null, (el, _m, p) => renderHome(el, p)];

  scrollMemory.set(lastHash, scrollY);
  const restoreTo = fromHistory ? scrollMemory.get(location.hash) || 0 : 0;
  lastHash = location.hash;
  fromHistory = false;

  const main = $('#app');
  const useVT = rendered && document.startViewTransition && !reducedMotion() && !document.hidden;
  const swap = () => {
    try { cleanup?.(); } catch (err) { console.error(err); }
    cleanup = null;
    closeUserMenu();
    main.innerHTML = '';
    const view = document.createElement('div');
    view.className = useVT ? 'view-vt' : 'view';
    main.appendChild(view);
    window.scrollTo({ top: restoreTo, behavior: 'instant' });
    cleanup = handler(view, m, params) || null;
    updateNav(path, params);
    if (restoreTo) requestAnimationFrame(() => window.scrollTo({ top: restoreTo, behavior: 'instant' }));
  };
  if (useVT) {
    const vt = document.startViewTransition(swap);
    // If the browser can't capture a frame (e.g. a background tab), don't hold the page hostage.
    const guard = setTimeout(() => vt.skipTransition(), 400);
    vt.updateCallbackDone.then(() => clearTimeout(guard), () => clearTimeout(guard));
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  } else swap();
  rendered = true;
}

// ───────── Header ─────────
function updateNav(path, params) {
  const f = params.get('f');
  const key = path === '/watchlist' ? 'list' : path === '/' ? (f || 'home') : '';
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === key));
  const nav = $('.nav'), pill = $('.nav-pill'), active = $('.nav a.active');
  if (nav && pill) {
    if (active) {
      pill.style.opacity = '1';
      pill.style.left = `${active.offsetLeft}px`;
      pill.style.width = `${active.offsetWidth}px`;
    } else pill.style.opacity = '0';
  }
}

function paintUser() {
  const btn = $('[data-user]');
  btn.innerHTML = avatar(backend.user);
  btn.setAttribute('aria-label', backend.user ? `Account: ${backend.user.name}` : 'Sign in');
}

function paintCount() {
  const n = Object.values(state.watchlist).filter(e => e.status !== 'done').length;
  $$('.wl-count').forEach(c => { c.textContent = n > 99 ? '99+' : n; c.classList.toggle('show', n > 0); });
}

function wireHeader() {
  const header = $('.header');
  let lastY = 0;
  addEventListener('scroll', () => {
    const y = scrollY;
    header.classList.toggle('scrolled', y > 20);
    header.classList.toggle('hidden-nav', y > 400 && y > lastY + 4 && !$('.menu'));
    if (y < lastY - 4) header.classList.remove('hidden-nav');
    lastY = y;
  }, { passive: true });
  $('[data-user]').onclick = () => (backend.user ? openUserMenu() : openUserMenu());
  $$('[data-search]').forEach(b => b.onclick = e => { e.preventDefault(); openSearch(); });
  addEventListener('keydown', e => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      openSearch();
    }
  });
  addEventListener('resize', () => updateNav(parseHash().path, parseHash().params));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  $$('.kbd').forEach(k => { k.textContent = isMac ? '⌘K' : 'Ctrl K'; });
}

// ───────── Boot ─────────
async function boot() {
  wireHeader();
  try {
    await Promise.all([loadCatalog(), backend.init()]);
  } catch (err) {
    console.error(err);
    const fileHint = location.protocol === 'file:';
    $('#app').innerHTML = `<div class="empty" style="padding-top:180px"><div class="empty-art">${ICONS.film}</div>
      <h3>Plotline couldn't load its catalog</h3>
      <p>${fileHint ? 'Browsers block data loading from files opened directly. Start a local server in this folder: <code>python -m http.server 8000</code> and open http://localhost:8000' : 'Check that data/catalog.json exists (run <code>python tools/sync.py</code>) and refresh.'}</p></div>`;
    return;
  }

  paintUser();
  paintCount();
  on('watchlist', paintCount);
  on('auth', async user => {
    paintUser();
    if (user && backend.mode === 'firebase') {
      setRemoteSaver(data => backend.saveUserData(data).catch(err => console.warn('Sync failed', err)));
      try { mergeRemote(await backend.loadUserData()); } catch (err) { console.warn(err); }
    } else {
      setRemoteSaver(null);
    }
  });
  if (backend.user && backend.mode === 'firebase') {
    setRemoteSaver(data => backend.saveUserData(data).catch(() => {}));
    backend.loadUserData().then(mergeRemote).catch(() => {});
  }

  // Restore scroll position on back/forward (Navigation API where available).
  window.navigation?.addEventListener('navigate', e => { fromHistory = e.navigationType === 'traverse'; });
  addEventListener('hashchange', route);
  route();
}

export { openAuth };
boot();
