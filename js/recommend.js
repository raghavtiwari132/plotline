// Content-based recommendations: genres, moods, people and what you loved,
// nudged by your ratings, services, language and era preferences.

import { state, isUpcoming, isRecent } from './store.js';
import { GENRES, MOODS, PROVIDERS, serviceKeys } from './config.js';

const ERA = { classic: [0, 1999], modern: [2000, 2019], new: [2020, 9999] };

function features(item) {
  const f = new Map();
  (item.genres || []).forEach(g => f.set('g:' + g, 1));
  (item.moods || []).forEach(m => f.set('m:' + m, 0.8));
  (item.creators || []).forEach(c => f.set('c:' + c, 1.4));
  (item.cast || []).slice(0, 3).forEach(c => f.set('a:' + c, 0.6));
  return f;
}

const featureCache = new WeakMap();
const feats = item => {
  if (!featureCache.has(item)) featureCache.set(item, features(item));
  return featureCache.get(item);
};

/** Weighted Jaccard similarity between two titles (0…~1.5). */
export function similarity(a, b) {
  const fa = feats(a), fb = feats(b);
  let inter = 0, union = 0;
  for (const k of new Set([...fa.keys(), ...fb.keys()])) {
    const x = fa.get(k) || 0, y = fb.get(k) || 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  let s = union ? inter / union : 0;
  if (a.type === b.type) s += 0.05;
  if (a.pair === b.id || b.pair === a.id) s += 0.5;
  return s;
}

export function mediumAllows(item, prefs = state.prefs) {
  const m = prefs?.medium || 'both';
  if (m === 'screen') return item.type !== 'book';
  if (m === 'book') return item.type === 'book';
  return true;
}

/** What the user has told us: onboarding picks + finished-and-rated watchlist items. */
export function tasteSignals(prefs = state.prefs, watchlist = state.watchlist) {
  const loved = [], liked = [], disliked = [], seen = new Set();
  for (const [id, v] of Object.entries(prefs?.seen || {})) {
    const it = state.byId.get(id);
    if (!it) continue;
    seen.add(id);
    (v === 'loved' ? loved : liked).push(it);
  }
  for (const [id, e] of Object.entries(watchlist || {})) {
    const it = state.byId.get(id);
    if (!it || e.status !== 'done') continue;
    seen.add(id);
    if (e.rating >= 4) loved.push(it);
    else if (e.rating && e.rating <= 2) disliked.push(it);
    else liked.push(it);
  }
  return { loved, liked, disliked, seen };
}

function scoreItem(item, prefs, sig) {
  let score = 0;
  const genres = new Set(prefs.genres || []);
  const moods = new Set(prefs.moods || []);
  const gHits = (item.genres || []).filter(g => genres.has(g));
  const mHits = (item.moods || []).filter(m => moods.has(m));
  score += gHits.length * 1.6 + (gHits.length ? 1 : 0);
  score += mHits.length * 1.3;

  let best = null, bestSim = 0;
  for (const l of sig.loved) {
    const s = similarity(item, l);
    if (s > bestSim) { bestSim = s; best = l; }
  }
  score += bestSim * 9;
  for (const l of sig.liked) score += similarity(item, l) * 1.2;
  for (const d of sig.disliked) score -= similarity(item, d) * 6;

  if (item.type === 'movie' && prefs.format === 'series') score -= 2.5;
  if (item.type === 'show' && prefs.format === 'movies') score -= 2.5;
  if (item.type === 'book' && item.pages) {
    if (prefs.bookLength === 'short') score += item.pages <= 320 ? 0.6 : item.pages > 420 ? -1.5 : 0;
    if (prefs.bookLength === 'long') score += item.pages >= 500 ? 0.8 : item.pages < 350 ? -1 : 0;
  }
  if (prefs.eras?.length && !prefs.eras.includes('any')) {
    const y = item.year || 2000;
    score += prefs.eras.some(e => ERA[e] && y >= ERA[e][0] && y <= ERA[e][1]) ? 0.8 : -1.2;
  }
  if (prefs.intl === false && item.lang && item.lang !== 'en') score -= 3;

  const onMine = serviceKeys(item, prefs.region || 'US').find(k => prefs.services?.includes(k));
  if (onMine) score += 1.1;

  if (item.imdb) score += (item.imdb - 7) * 0.7;
  if (item.olRating) score += (item.olRating - 3.8) * 1.2;
  score += ((item.pop || 40) / 100) * 1.2;
  if (isRecent(item, 120)) score += 0.6;

  let reason;
  if (best && bestSim > 0.22) reason = `Because you loved ${best.title}`;
  else if (gHits.length && mHits.length) reason = `${GENRES[gHits[0]]?.[0]} · ${MOODS[mHits[0]]?.[0]}`;
  else if (gHits.length) reason = `Matches your love of ${gHits.slice(0, 2).map(g => GENRES[g]?.[0]).join(' & ')}`;
  else if (mHits.length) reason = `For when you want ${MOODS[mHits[0]][0].toLowerCase()}`;
  else if ((item.pop || 0) > 80) reason = 'Trending right now';
  else reason = 'Highly rated';
  if (onMine && !reason.startsWith('Because')) reason += ` · on ${PROVIDERS[onMine].name}`;
  return { item, score, reason, onMine, because: bestSim > 0.22 ? best : null };
}

/** Ranked picks for the current user. */
export function recommend({ limit = 20, type = null, includeUpcoming = false, exclude = new Set(), includeSeen = false } = {}) {
  const prefs = state.prefs || {};
  const sig = tasteSignals();
  const ranked = state.items
    .filter(it => mediumAllows(it, prefs) && (!type || it.type === type) && (includeSeen || !sig.seen.has(it.id))
      && !exclude.has(it.id) && (includeUpcoming || !isUpcoming(it)))
    .map(it => scoreItem(it, prefs, sig))
    .sort((a, b) => b.score - a.score);
  return diversify(ranked, limit);
}

/** Greedy re-rank so one favorite or one format doesn't dominate the top of the list. */
function diversify(ranked, limit) {
  const out = [], seedCount = new Map(), typeCount = new Map();
  const pool = ranked.slice(0, limit * 3);
  while (out.length < limit && pool.length) {
    let bestIdx = 0, bestVal = -Infinity;
    pool.forEach((r, i) => {
      const s = seedCount.get(r.because?.id) || 0;
      const t = typeCount.get(r.item.type) || 0;
      const val = r.score - (r.because ? s * 3.5 + (s >= 2 ? 6 : 0) : 0) - t * 0.4;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    });
    const [r] = pool.splice(bestIdx, 1);
    if (r.because) seedCount.set(r.because.id, (seedCount.get(r.because.id) || 0) + 1);
    typeCount.set(r.item.type, (typeCount.get(r.item.type) || 0) + 1);
    out.push(r);
  }
  return out;
}

/** Score a single item (used for "matches your taste" on new arrivals). */
export function matchScore(item) {
  return scoreItem(item, state.prefs || {}, tasteSignals()).score;
}

export function similarTo(item, n = 16) {
  return state.items
    .filter(i => i.id !== item.id && !isUpcoming(i))
    .map(i => ({ i, s: similarity(item, i) + (i.pop || 0) / 1000 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(x => x.i);
}

export function becauseYouLoved(maxRows = 2) {
  const prefs = state.prefs || {};
  const sig = tasteSignals();
  return sig.loved.slice(-maxRows * 2).reverse()
    .map(seed => ({
      seed,
      items: state.items
        .filter(i => i.id !== seed.id && !sig.seen.has(i.id) && mediumAllows(i, prefs) && !isUpcoming(i))
        .map(i => ({ i, s: similarity(seed, i) }))
        .filter(x => x.s > 0.12)
        .sort((a, b) => b.s - a.s)
        .slice(0, 14)
        .map(x => x.i),
    }))
    .filter(r => r.items.length >= 4)
    .slice(0, maxRows);
}
