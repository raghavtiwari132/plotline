// App state: catalog, taste preferences and the watchlist.
// Saved locally for guests; mirrored to the backend when signed in.

import { CONFIG } from './config.js';
import { storage, emit, todayISO, daysFromToday, debounce } from './util.js';

export const state = {
  items: [],
  byId: new Map(),
  generatedAt: null,
  prefs: storage.get('prefs'),
  watchlist: storage.get('watchlist', {}),
  prevVisit: null,
};

let remoteSaver = null;
const pushRemote = debounce(() => remoteSaver?.({ prefs: state.prefs, watchlist: state.watchlist }), 800);
export const setRemoteSaver = fn => { remoteSaver = fn; };

export async function loadCatalog() {
  const res = await fetch(CONFIG.catalogUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Catalog failed to load (${res.status})`);
  const data = await res.json();
  state.items = data.items.filter(i => i.title && i.type);
  state.generatedAt = data.generatedAt;
  state.byId = new Map(state.items.map(i => [i.id, i]));

  // "New since your last visit" compares against the previous session's date.
  state.prevVisit = storage.get('lastVisit');
  storage.set('lastVisit', todayISO());
}

export const getItem = id => state.byId.get(id);

// ───── Dates ─────
export const releaseISO = item => item.released || (item.year ? `${item.year}-01-01` : null);
export const isUpcoming = item => { const d = daysFromToday(item.released); return d != null && d > 0; };
export const isRecent = (item, days = 200) => {
  const d = daysFromToday(releaseISO(item));
  return d != null && d <= 0 && d >= -days && Boolean(item.released);
};
export const isFreshlyAdded = (item, days = 21) =>
  item.source === 'auto' && item.added && daysFromToday(item.added) >= -days;
export const addedSinceLastVisit = item =>
  item.source === 'auto' && item.added && state.prevVisit && item.added > state.prevVisit;

// ───── Images ─────
// Shows/movies without a poster fall back to their trailer still (cropped to portrait).
export const posterOf = item => (item.type === 'book' ? item.cover || item.poster : item.poster || item.backdrop) || null;
export const seasonSoon = (item, days = 120) => {
  const d = item.nextSeason ? daysFromToday(item.nextSeason.date) : null;
  return d != null && d > 0 && d <= days;
};
export const backdropOf = item => item.backdrop || null;

// ───── Preferences ─────
export function savePrefs(prefs) {
  state.prefs = { ...prefs, updatedAt: Date.now() };
  storage.set('prefs', state.prefs);
  emit('prefs', state.prefs);
  pushRemote();
}

export function updatePrefs(patch) {
  savePrefs({ ...(state.prefs || {}), ...patch });
}

export const region = () => state.prefs?.region || 'US';

// ───── Watchlist ─────
function persist(detail) {
  storage.set('watchlist', state.watchlist);
  emit('watchlist', detail);
  pushRemote();
}

export const wl = id => state.watchlist[id];
export const inWatchlist = id => Boolean(state.watchlist[id]);
export const isDone = id => state.watchlist[id]?.status === 'done';

export function addToWatchlist(id) {
  if (state.watchlist[id]) return;
  state.watchlist[id] = { status: 'want', addedAt: Date.now(), updatedAt: Date.now() };
  persist({ id, action: 'add' });
}

export function removeFromWatchlist(id) {
  if (!state.watchlist[id]) return;
  delete state.watchlist[id];
  persist({ id, action: 'remove' });
}

export function toggleWatchlist(id) {
  if (inWatchlist(id)) { removeFromWatchlist(id); return false; }
  addToWatchlist(id);
  return true;
}

export function markDone(id, { rating, review } = {}) {
  const prev = state.watchlist[id] || { addedAt: Date.now() };
  state.watchlist[id] = {
    ...prev, status: 'done', finishedAt: prev.finishedAt || Date.now(), updatedAt: Date.now(),
    rating: rating ?? prev.rating ?? null, review: review ?? prev.review ?? '',
  };
  persist({ id, action: 'done' });
}

export function markWant(id) {
  const prev = state.watchlist[id];
  if (!prev) return addToWatchlist(id);
  state.watchlist[id] = { ...prev, status: 'want', updatedAt: Date.now() };
  persist({ id, action: 'want' });
}

/** Merge account data from the backend into local state (newest entry wins). */
export function mergeRemote(remote) {
  if (!remote) { pushRemote(); return; }
  const merged = { ...state.watchlist };
  for (const [id, entry] of Object.entries(remote.watchlist || {})) {
    if (!merged[id] || (entry.updatedAt || 0) > (merged[id].updatedAt || 0)) merged[id] = entry;
  }
  state.watchlist = merged;
  storage.set('watchlist', merged);
  if (remote.prefs && (!state.prefs || (remote.prefs.updatedAt || 0) > (state.prefs.updatedAt || 0))) {
    state.prefs = remote.prefs;
    storage.set('prefs', remote.prefs);
    emit('prefs', remote.prefs);
  }
  emit('watchlist', { action: 'sync' });
  pushRemote();
}
