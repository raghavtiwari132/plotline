// ─────────────────────────────────────────────────────────────
// Plotline configuration
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  siteName: 'Plotline',

  // Paste your Firebase web-app config here to switch from demo mode to real
  // accounts (Google / email) and shared community ratings & reviews.
  // Firebase console → Project settings → Your apps → Web app → SDK setup.
  // Example:
  // firebase: {
  //   apiKey: 'AIza…',
  //   authDomain: 'your-project.firebaseapp.com',
  //   projectId: 'your-project',
  //   appId: '1:123:web:abc',
  // },
  firebase: {
    apiKey: 'AIzaSyB5r5-BbVBW_Oq7Gtpym-vTKw7d2mwvZV4',
    authDomain: 'plotline-96cbd.firebaseapp.com',
    projectId: 'plotline-96cbd',
    storageBucket: 'plotline-96cbd.firebasestorage.app',
    messagingSenderId: '668161039284',
    appId: '1:668161039284:web:5aec1f2f90d6ef402f70e1',
  },

  // Where the catalog comes from (written by tools/sync.py).
  catalogUrl: 'data/catalog.json',
};

// key: [label, color, applies-to ('all' | 'screen' | 'book')]
export const GENRES = {
  scifi: ['Sci-Fi', '#4fb3ff', 'all'],
  fantasy: ['Fantasy', '#8b7cff', 'all'],
  thriller: ['Thriller', '#ff6b5e', 'all'],
  mystery: ['Mystery', '#a78bfa', 'all'],
  horror: ['Horror', '#f43f5e', 'all'],
  romance: ['Romance', '#ff5fa2', 'all'],
  comedy: ['Comedy', '#ffb547', 'all'],
  drama: ['Drama', '#fb923c', 'screen'],
  crime: ['Crime', '#ef4444', 'all'],
  action: ['Action', '#f97316', 'screen'],
  adventure: ['Adventure', '#2dd4bf', 'all'],
  historical: ['Historical', '#d4a373', 'all'],
  animation: ['Animation', '#a3e635', 'screen'],
  family: ['Family', '#34d399', 'all'],
  musical: ['Musical', '#f472b6', 'screen'],
  documentary: ['Documentary', '#94a3b8', 'screen'],
  literary: ['Literary Fiction', '#c4b5fd', 'book'],
  ya: ['Young Adult', '#f9a8d4', 'book'],
  classic: ['Classics', '#fcd34d', 'book'],
  nonfiction: ['Non-fiction', '#7dd3fc', 'book'],
  memoir: ['Memoir', '#fdba74', 'book'],
  selfhelp: ['Self-help', '#86efac', 'book'],
};

// key: [label, hint, gradient-from, gradient-to]
export const MOODS = {
  feelgood: ['Feel-good', 'Leave with a smile', '#ffb547', '#ff6b5e'],
  funny: ['Laugh out loud', 'Comedy that actually lands', '#fde047', '#fb923c'],
  cozy: ['Cozy', 'Blanket-and-chai energy', '#fdba74', '#f472b6'],
  emotional: ['Emotional', 'Bring tissues', '#ff5fa2', '#8b7cff'],
  thrilling: ['Edge of your seat', 'Pulse-racing tension', '#ff6b5e', '#f43f5e'],
  dark: ['Dark & gritty', 'Morally messy and intense', '#6366f1', '#312e81'],
  mindbending: ['Mind-bending', 'Twists you keep thinking about', '#4fb3ff', '#8b7cff'],
  epic: ['Epic', 'Big worlds, bigger stakes', '#2dd4bf', '#4fb3ff'],
};

export const TYPES = {
  movie: { label: 'Movie', plural: 'Movies', color: 'var(--movie)', verb: 'watched' },
  show: { label: 'Series', plural: 'Shows', color: 'var(--show)', verb: 'watched' },
  book: { label: 'Book', plural: 'Books', color: 'var(--book)', verb: 'read' },
};

export const LANGS = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', kn: 'Kannada', ko: 'Korean', ja: 'Japanese', de: 'German', es: 'Spanish', fr: 'French', pt: 'Portuguese', it: 'Italian', zh: 'Chinese' };

export const REGIONS = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', OTHER: 'Somewhere else',
};

const enc = encodeURIComponent;

// Streaming services. `short` is the little logo glyph; `ink` is the text color on top of `color`.
export const PROVIDERS = {
  netflix: { name: 'Netflix', short: 'N', color: '#e50914', url: q => `https://www.netflix.com/search?q=${enc(q)}` },
  prime: { name: 'Prime Video', short: 'P', color: '#1a98ff', url: q => `https://www.primevideo.com/search/ref=atv_nb_sug?phrase=${enc(q)}` },
  apple: { name: 'Apple TV', short: 'tv', color: '#1d1d1f', url: q => `https://tv.apple.com/search?term=${enc(q)}` },
  hbomax: { name: 'HBO Max', short: 'H', color: '#4b2cff', url: () => 'https://www.hbomax.com/' },
  jiohotstar: { name: 'JioHotstar', short: 'JH', color: '#1f80e0', url: () => 'https://www.hotstar.com/in' },
  disneyplus: { name: 'Disney+', short: 'D+', color: '#113ccf', url: q => `https://www.disneyplus.com/search?q=${enc(q)}` },
  hulu: { name: 'Hulu', short: 'h', color: '#1ce783', ink: '#062b15', url: q => `https://www.hulu.com/search?q=${enc(q)}` },
  peacock: { name: 'Peacock', short: 'P', color: '#2a2a2a', url: () => 'https://www.peacocktv.com/' },
  paramountplus: { name: 'Paramount+', short: 'P+', color: '#0064ff', url: () => 'https://www.paramountplus.com/' },
  sonyliv: { name: 'SonyLIV', short: 'S', color: '#d9a03f', ink: '#1a1200', url: () => 'https://www.sonyliv.com/' },
  zee5: { name: 'ZEE5', short: 'Z5', color: '#8230c6', url: () => 'https://www.zee5.com/' },
  crunchyroll: { name: 'Crunchyroll', short: 'C', color: '#f47521', url: q => `https://www.crunchyroll.com/search?q=${enc(q)}` },
  iplayer: { name: 'BBC iPlayer', short: 'BBC', color: '#f54997', url: q => `https://www.bbc.co.uk/iplayer/search?q=${enc(q)}` },
  now: { name: 'NOW', short: 'NOW', color: '#00818a', url: () => 'https://www.nowtv.com/' },
};

// Services offered in the onboarding per region.
export const REGION_SERVICES = {
  IN: ['netflix', 'prime', 'jiohotstar', 'apple', 'sonyliv', 'zee5', 'crunchyroll'],
  US: ['netflix', 'prime', 'hbomax', 'disneyplus', 'hulu', 'apple', 'peacock', 'paramountplus', 'crunchyroll'],
  GB: ['netflix', 'prime', 'disneyplus', 'apple', 'iplayer', 'now', 'crunchyroll'],
  CA: ['netflix', 'prime', 'disneyplus', 'apple', 'paramountplus', 'crunchyroll'],
  AU: ['netflix', 'prime', 'disneyplus', 'apple', 'hbomax', 'paramountplus'],
  OTHER: ['netflix', 'prime', 'disneyplus', 'apple', 'hbomax'],
};

// A title's "home network" resolves to a different service depending on region.
const NETWORKS = {
  hbo: { US: 'hbomax', IN: 'jiohotstar', GB: 'now', default: 'hbomax' },
  disney: { IN: 'jiohotstar', default: 'disneyplus' },
  fx: { US: 'hulu', IN: 'jiohotstar', default: 'disneyplus' },
  ghibli: { US: 'hbomax', default: 'netflix' },
  universal: { US: 'peacock', IN: 'jiohotstar', default: 'rent' },
  paramount: { US: 'paramountplus', IN: 'jiohotstar', default: 'paramountplus' },
  jiohotstar: { IN: 'jiohotstar', default: 'rent' },
  sonyliv: { default: 'sonyliv' },
  bbc: { GB: 'iplayer', default: 'rent' },
};

const JW_REGION = { IN: 'in', US: 'us', GB: 'uk', CA: 'ca', AU: 'au', OTHER: 'us' };
const AMAZON = { IN: 'amazon.in', US: 'amazon.com', GB: 'amazon.co.uk', CA: 'amazon.ca', AU: 'amazon.com.au', OTHER: 'amazon.com' };
const AUDIBLE = { IN: 'audible.in', US: 'audible.com', GB: 'audible.co.uk', CA: 'audible.ca', AU: 'audible.com.au', OTHER: 'audible.com' };

export function guessRegion() {
  const lang = (navigator.languages?.[0] || navigator.language || 'en-US').toUpperCase();
  const cc = lang.split('-')[1];
  return REGIONS[cc] && cc !== 'OTHER' ? cc : (lang.startsWith('HI') ? 'IN' : 'US');
}

export const justWatchUrl = (title, region) =>
  `https://www.justwatch.com/${JW_REGION[region] || 'us'}/search?q=${enc(title)}`;

function matchProviderName(name) {
  const n = name.toLowerCase();
  if (n.includes('netflix')) return 'netflix';
  if (n.includes('prime') || n.includes('amazon')) return 'prime';
  if (n.includes('apple')) return 'apple';
  if (n.includes('hbo') || n === 'max') return 'hbomax';
  if (n.includes('hotstar') || n.includes('jio')) return 'jiohotstar';
  if (n.includes('disney')) return 'disneyplus';
  if (n.includes('hulu')) return 'hulu';
  if (n.includes('peacock')) return 'peacock';
  if (n.includes('paramount')) return 'paramountplus';
  if (n.includes('sony')) return 'sonyliv';
  if (n.includes('zee5')) return 'zee5';
  if (n.includes('crunchyroll')) return 'crunchyroll';
  if (n.includes('iplayer') || n.includes('bbc')) return 'iplayer';
  if (n === 'now' || n.includes('now tv')) return 'now';
  return null;
}

/** Streaming keys a title is on in a region (used for "Where to watch" grouping). */
export function serviceKeys(item, region) {
  if (item.type === 'book') return [];
  const live = item.liveProviders?.[region];
  if (live) return [...new Set(live.stream.map(matchProviderName).filter(Boolean))];
  const keys = (item.providers || []).map(k => (NETWORKS[k] ? (NETWORKS[k][region] ?? NETWORKS[k].default) : k));
  return [...new Set(keys)].filter(k => k && k !== 'rent' && PROVIDERS[k]);
}

/** Tiles for the "Where to watch / read" section. */
export function whereTo(item, region, prefs = {}) {
  const q = item.title;
  const tiles = [];
  if (item.type === 'book') {
    const order = prefs.bookFormats?.length ? prefs.bookFormats : ['print', 'ebook', 'audio'];
    const all = {
      print: { key: 'amazon', name: 'Amazon', short: 'a', color: '#ff9900', ink: '#1a1000', note: 'Paperback & hardcover', href: `https://www.${AMAZON[region] || AMAZON.OTHER}/s?k=${enc(q + ' ' + (item.creators?.[0] || ''))}&i=stripbooks` },
      ebook: { key: 'kindle', name: 'Kindle & Play Books', short: 'e', color: '#2b6cb0', note: 'E-book', href: `https://play.google.com/store/search?q=${enc(q)}&c=books` },
      audio: { key: 'audible', name: 'Audible', short: 'A', color: '#f7991c', ink: '#1a1000', note: 'Audiobook', href: `https://www.${AUDIBLE[region] || AUDIBLE.OTHER}/search?keywords=${enc(q)}` },
    };
    order.forEach(f => all[f] && tiles.push(all[f]));
    Object.keys(all).forEach(f => !order.includes(f) && tiles.push(all[f]));
    tiles.push({ key: 'openlibrary', name: 'Open Library', short: 'OL', color: '#e2dcc8', ink: '#1b1b1b', note: 'Borrow free (where available)', href: item.olid ? `https://openlibrary.org/works/${item.olid}` : `https://openlibrary.org/search?q=${enc(q)}` });
    tiles.push({ key: 'goodreads', name: 'Goodreads', short: 'g', color: '#553b08', note: 'Shelves & reader reviews', href: `https://www.goodreads.com/search?q=${enc(q)}` });
    return tiles;
  }
  const mine = new Set(prefs.services || []);
  const live = item.liveProviders?.[region];
  if (live) {
    live.stream.forEach(name => {
      const key = matchProviderName(name);
      const p = PROVIDERS[key] || { name, short: name[0], color: '#444', url: () => live.link };
      tiles.push({ key: key || name, ...p, name: p.name, note: 'Stream', href: live.link || p.url(q), mine: mine.has(key) });
    });
    if (live.rent) tiles.push({ key: 'rent', name: 'Rent or buy', short: '₹', color: '#3a3a46', note: 'Digital stores', href: live.link || justWatchUrl(q, region) });
  } else {
    let hasStream = false;
    serviceKeys(item, region).forEach(key => {
      const p = PROVIDERS[key];
      hasStream = true;
      tiles.push({ key, ...p, note: 'Stream', href: p.url(q), mine: mine.has(key) });
    });
    if (!hasStream && item.providers?.length) {
      tiles.push({ key: 'rent', name: 'Rent or buy', short: region === 'IN' ? '₹' : '$', color: '#3a3a46', note: 'Apple TV, Prime Video, Google Play', href: justWatchUrl(q, region) });
    }
  }
  tiles.push({ key: 'justwatch', name: 'JustWatch', short: 'JW', color: '#fbc500', ink: '#1a1400', note: 'Live availability in your region', href: justWatchUrl(q, region) });
  return tiles.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
}
