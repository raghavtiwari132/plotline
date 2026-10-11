// Accounts, community ratings, reviews and likes.
//
// • Demo mode (default): everything is stored in this browser. Sample reviews are
//   generated so the community features can be tried, and they are labelled "Sample".
// • Firebase mode: set CONFIG.firebase in js/config.js. Sign-in uses Firebase Auth
//   (Google, email) and reviews/likes live in Cloud Firestore, shared by everyone.

import { CONFIG } from './config.js';
import { storage, emit, rng, clamp } from './util.js';
import { isUpcoming } from './store.js';

const FIREBASE_VERSION = '10.12.2';
let mode = CONFIG.firebase ? 'firebase' : 'demo';
let currentUser = null;
let fb = null; // { auth, db, a: authModule, f: firestoreModule }

const setUser = u => { currentUser = u; emit('auth', u); };

// ─────────────────────────── Demo data ───────────────────────────

const DEMO_NAMES = ['Aarav K.', 'Maya R.', 'Jonas W.', 'Priya S.', 'Leo M.', 'Sofia G.', 'Kenji T.', 'Amara O.', 'Noah B.',
  'Isha P.', 'Elena V.', 'Rohan D.', 'Chloe L.', 'Mateo F.', 'Zara H.', 'Ananya I.', 'Sam C.', 'Diego A.'];

const LINES = {
  screen: {
    5: ['Absolutely gripping from the first scene. I have already made three friends watch it.',
      'One of those rare ones that stays with you for days. That ending!',
      'Rewatched it the next weekend just to catch everything I missed the first time.',
      'Every frame looks like a painting, and the performances are on another level.'],
    4: ['Really strong. A couple of slow stretches, but the payoff is worth it.',
      'Way better than I expected. Perfect pick for a weekend.',
      'Great cast and a smart script. Not perfect, but close.',
      'Loved the world-building. The middle drags a little; the finale more than makes up for it.'],
    3: ['Good, not great. Loved the premise, wanted more from the second half.',
      'Well made, it just did not connect with me as much as I hoped.',
      'Some brilliant moments surrounded by a bit of filler.'],
    2: ['Beautiful to look at, but I struggled to care about anyone.'],
    1: ['Not for me at all, unfortunately.'],
  },
  book: {
    5: ['Could not put it down. Finished it in two sittings.',
      'The kind of book you want to press into a friend\'s hands.',
      'Beautifully written. I kept stopping to reread passages.',
      'Stayed up way too late three nights in a row. Worth it.'],
    4: ['A great read with a few slow chapters in the middle.',
      'Characters I will be thinking about for a while. The ending felt a touch rushed.',
      'Smart, moving and surprisingly funny in places.'],
    3: ['Enjoyed parts of it, but it took me a long time to get into.',
      'Interesting ideas; the pacing did not quite work for me.'],
    2: ['Wanted to love it, but it never clicked for me.'],
    1: ['Could not finish it.'],
  },
};

function gaussian(r) {
  const u = Math.max(r(), 1e-6), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function anchorRating(item) {
  if (item.imdb) return clamp(item.imdb / 2 + 0.15, 2.5, 4.85);
  if (item.olRating) return clamp(item.olRating, 2.5, 4.8);
  return 3.9;
}

const sampleCache = new Map();
function sampleData(item) {
  if (isUpcoming(item)) return { votes: [0, 0, 0, 0, 0], reviews: [] };
  if (sampleCache.has(item.id)) return sampleCache.get(item.id);
  const r = rng(item.id);
  const anchor = anchorRating(item);
  const n = Math.round(18 + r() * 60 + (item.pop || 40) * 2.2);
  const votes = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) votes[clamp(Math.round(anchor + gaussian(r) * 0.85), 1, 5) - 1]++;
  const reviews = [];
  const count = 3 + Math.floor(r() * 3);
  const used = new Set();
  const medium = item.type === 'book' ? 'book' : 'screen';
  for (let i = 0; i < count; i++) {
    let name;
    do { name = DEMO_NAMES[Math.floor(r() * DEMO_NAMES.length)]; } while (used.has(name));
    used.add(name);
    const rating = clamp(Math.round(anchor + gaussian(r) * 0.8), 1, 5);
    const pool = LINES[medium][rating];
    reviews.push({
      id: `${item.id}__sample${i}`, titleId: item.id, uid: `sample-${i}`, name, rating,
      text: pool[Math.floor(r() * pool.length)], likeCount: Math.floor(r() * r() * 90),
      createdAt: Date.now() - Math.floor(r() * 180 + 2) * 86400000, sample: true,
    });
  }
  const data = { votes, reviews };
  sampleCache.set(item.id, data);
  return data;
}

const demoReviews = () => storage.get('demo:reviews', {});   // { titleId: { uid: review } }
const demoLikes = () => storage.get('demo:likes', {});       // { uid: { reviewId: true } }
const demoExtraLikes = () => storage.get('demo:likecounts', {}); // { reviewId: +n } for local reviews

const demo = {
  async init() { setUser(storage.get('demo:user')); },
  async signIn(provider, { name, email } = {}) {
    const clean = (name || '').trim() || (email ? email.split('@')[0] : 'Reader');
    const u = { uid: 'demo-' + Math.random().toString(36).slice(2, 10), name: clean, email: email || null, provider, photo: null };
    storage.set('demo:user', u);
    setUser(u);
    return u;
  },
  async signOut() { storage.del('demo:user'); setUser(null); },
  async resetPassword() { /* nothing to reset in demo mode */ },

  async getReviews(item) {
    const s = sampleData(item);
    const mineLikes = currentUser ? (demoLikes()[currentUser.uid] || {}) : {};
    const local = Object.values(demoReviews()[item.id] || {});
    const extra = demoExtraLikes();
    const votes = [...s.votes];
    local.forEach(rv => { votes[rv.rating - 1]++; });
    const all = [...s.reviews, ...local].map(rv => {
      const liked = Boolean(mineLikes[rv.id]);
      return { ...rv, likeCount: (rv.likeCount || 0) + (extra[rv.id] || 0) + (liked ? 1 : 0), likedByMe: liked, mine: currentUser && rv.uid === currentUser.uid };
    });
    return { reviews: all.filter(r => r.text), summary: summarize(votes), sample: s.reviews.length > 0 };
  },

  async submitReview(item, { rating, text }) {
    if (!currentUser) throw new Error('Sign in to share your review.');
    const store = demoReviews();
    store[item.id] = store[item.id] || {};
    const prev = store[item.id][currentUser.uid];
    store[item.id][currentUser.uid] = {
      id: `${item.id}__${currentUser.uid}`, titleId: item.id, uid: currentUser.uid, name: currentUser.name,
      photo: currentUser.photo, rating, text: (text || '').trim(), likeCount: 0,
      createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now(),
    };
    storage.set('demo:reviews', store);
  },

  async deleteReview(item) {
    if (!currentUser) return;
    const store = demoReviews();
    if (store[item.id]) delete store[item.id][currentUser.uid];
    storage.set('demo:reviews', store);
  },

  async toggleLike(item, reviewId) {
    if (!currentUser) throw new Error('Sign in to like reviews.');
    const likes = demoLikes();
    const mine = likes[currentUser.uid] || (likes[currentUser.uid] = {});
    if (mine[reviewId]) delete mine[reviewId]; else mine[reviewId] = true;
    storage.set('demo:likes', likes);
    return Boolean(mine[reviewId]);
  },

  async communityRatings(items) {
    return items.map(it => ({ id: it.id, ...summarize(sampleData(it).votes) }));
  },

  async loadUserData() { return null; },
  async saveUserData() { /* already local */ },
};

function summarize(votes) {
  const count = votes.reduce((a, b) => a + b, 0);
  const avg = count ? votes.reduce((a, v, i) => a + v * (i + 1), 0) / count : 0;
  return { avg, count, dist: votes };
}

// ─────────────────────────── Firebase ───────────────────────────

const toUser = u => u && {
  uid: u.uid, name: u.displayName || (u.email ? u.email.split('@')[0] : 'Reader'),
  email: u.email, photo: u.photoURL, provider: u.providerData?.[0]?.providerId || 'password',
};

const firebase = {
  async init() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [app, a, f] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
    ]);
    const instance = app.initializeApp(CONFIG.firebase);
    fb = { auth: a.getAuth(instance), db: f.getFirestore(instance), a, f };
    await new Promise(resolve => {
      let first = true;
      a.onAuthStateChanged(fb.auth, u => {
        setUser(toUser(u));
        if (first) { first = false; resolve(); }
      });
    });
  },
  async signIn(provider, { email, password, name, create } = {}) {
    const { a, auth } = fb;
    let cred;
    if (provider === 'google') cred = await a.signInWithPopup(auth, new a.GoogleAuthProvider());
    else if (create) {
      cred = await a.createUserWithEmailAndPassword(auth, email, password);
      if (name) await a.updateProfile(cred.user, { displayName: name });
    } else {
      cred = await a.signInWithEmailAndPassword(auth, email, password);
    }
    const u = toUser(cred.user);
    if (create && name) u.name = name;
    setUser(u);
    return u;
  },
  async signOut() { await fb.a.signOut(fb.auth); },
  async resetPassword(email) { await fb.a.sendPasswordResetEmail(fb.auth, email); },

  async getReviews(item) {
    const { f, db } = fb;
    const reviewsQ = f.query(f.collection(db, 'reviews'), f.where('titleId', '==', item.id), f.orderBy('likeCount', 'desc'), f.limit(60));
    const base = f.query(f.collection(db, 'reviews'), f.where('titleId', '==', item.id));
    const [snap, ...counts] = await Promise.all([
      f.getDocs(reviewsQ),
      ...[1, 2, 3, 4, 5].map(n => f.getCountFromServer(f.query(base, f.where('rating', '==', n)))),
    ]);
    const votes = counts.map(c => c.data().count);
    let reviews = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || Date.now() }));
    if (currentUser) {
      const liked = await Promise.all(reviews.map(r => f.getDoc(f.doc(db, 'reviews', r.id, 'likes', currentUser.uid))));
      reviews = reviews.map((r, i) => ({ ...r, likedByMe: liked[i].exists(), mine: r.uid === currentUser.uid }));
    }
    return { reviews: reviews.filter(r => r.text), summary: summarize(votes), sample: false };
  },

  async submitReview(item, { rating, text }) {
    if (!currentUser) throw new Error('Sign in to share your review.');
    const { f, db } = fb;
    const ref = f.doc(db, 'reviews', `${item.id}__${currentUser.uid}`);
    await f.runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const common = { rating, text: (text || '').trim(), name: currentUser.name, photo: currentUser.photo || null, updatedAt: f.serverTimestamp() };
      if (snap.exists()) tx.update(ref, common);
      else tx.set(ref, { ...common, titleId: item.id, uid: currentUser.uid, likeCount: 0, createdAt: f.serverTimestamp() });
    });
  },

  async deleteReview(item) {
    if (!currentUser) return;
    await fb.f.deleteDoc(fb.f.doc(fb.db, 'reviews', `${item.id}__${currentUser.uid}`));
  },

  async toggleLike(item, reviewId) {
    if (!currentUser) throw new Error('Sign in to like reviews.');
    const { f, db } = fb;
    const reviewRef = f.doc(db, 'reviews', reviewId);
    const likeRef = f.doc(db, 'reviews', reviewId, 'likes', currentUser.uid);
    return f.runTransaction(db, async tx => {
      const [like, review] = [await tx.get(likeRef), await tx.get(reviewRef)];
      const count = review.data()?.likeCount || 0;
      if (like.exists()) {
        tx.delete(likeRef);
        tx.update(reviewRef, { likeCount: Math.max(0, count - 1) });
        return false;
      }
      tx.set(likeRef, { createdAt: f.serverTimestamp() });
      tx.update(reviewRef, { likeCount: count + 1 });
      return true;
    });
  },

  async communityRatings(items) {
    // Aggregate the most recent reviews client-side (fine for a young community).
    const { f, db } = fb;
    const snap = await f.getDocs(f.query(f.collection(db, 'reviews'), f.orderBy('createdAt', 'desc'), f.limit(500)));
    const by = {};
    snap.forEach(d => {
      const r = d.data();
      (by[r.titleId] = by[r.titleId] || [0, 0, 0, 0, 0])[r.rating - 1]++;
    });
    const ids = new Set(items.map(i => i.id));
    return Object.entries(by).filter(([id]) => ids.has(id)).map(([id, votes]) => ({ id, ...summarize(votes) }));
  },

  async loadUserData() {
    if (!currentUser) return null;
    const snap = await fb.f.getDoc(fb.f.doc(fb.db, 'users', currentUser.uid));
    return snap.exists() ? snap.data() : null;
  },
  async saveUserData(data) {
    if (!currentUser) return;
    await fb.f.setDoc(fb.f.doc(fb.db, 'users', currentUser.uid), { ...JSON.parse(JSON.stringify(data)), updatedAt: fb.f.serverTimestamp() }, { merge: true });
  },
};

// ─────────────────────────── Public API ───────────────────────────

let impl = mode === 'firebase' ? firebase : demo;

export const backend = {
  get mode() { return mode; },
  get user() { return currentUser; },
  async init() {
    try {
      await impl.init();
    } catch (err) {
      console.error('Firebase failed to start; falling back to demo mode.', err);
      mode = 'demo';
      impl = demo;
      await impl.init();
    }
  },
  signIn: (provider, opts) => impl.signIn(provider, opts),
  signOut: () => impl.signOut(),
  resetPassword: email => impl.resetPassword(email),
  getReviews: item => impl.getReviews(item),
  submitReview: (item, data) => impl.submitReview(item, data),
  deleteReview: item => impl.deleteReview(item),
  toggleLike: (item, reviewId) => impl.toggleLike(item, reviewId),
  communityRatings: items => impl.communityRatings(items),
  loadUserData: () => impl.loadUserData(),
  saveUserData: data => impl.saveUserData(data),
};
