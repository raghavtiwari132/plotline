// First visit: an Apple-style landing page, then the taste quiz.

import { GENRES, MOODS, REGIONS, REGION_SERVICES, PROVIDERS, guessRegion } from '../config.js';
import { $, $$, esc, ICONS, clamp, daysFromToday, reducedMotion } from '../util.js';
import { state, savePrefs, posterOf } from '../store.js';
import { reveal, magnetic, placeSegThumb, provLogo, toast } from '../ui.js';
import { recommend } from '../recommend.js';
import { openAuth } from '../auth.js';

const MESH = '<div class="mesh"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div></div><div class="grain"></div>';

function shuffle(arr, seed = 7) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const wordsHTML = (text, accent = []) => text.split(' ').map((w, i) =>
  `<span class="w ${accent.includes(i) ? 'grad-text' : ''}" style="--i:${i}">${esc(w)}</span>`).join(' ');

// ─────────────────────────── Landing ───────────────────────────
export function renderLanding(root) {
  document.body.classList.add('is-onboarding');
  const withArt = state.items.filter(i => posterOf(i));
  const rows = [0, 1, 2].map(r => shuffle(withArt, r * 13 + 5).slice(0, 14));
  const fresh = state.items.filter(i => i.source === 'auto' && daysFromToday(i.added) >= -7).length;
  const statement = "Tell us what you love. We'll find movies, shows and books that feel made for you, and show you exactly where to watch or read them.";
  const accentWords = new Set(['made', 'for', 'you,', 'where']);

  root.innerHTML = `
  <div class="landing">
    <section class="l-hero">
      ${MESH}
      <div>
        <div class="l-eyebrow"><b>LIVE</b>${fresh ? `${fresh} new releases added this week, automatically` : 'Movies · Series · Books, updated automatically'}</div>
        <h1 class="l-title">${wordsHTML('Your next favorite story starts here.', [2, 3])}</h1>
        <p class="l-sub">Picks shaped by your taste, with trailers, honest ratings and exactly where to watch or read.</p>
        <div class="l-cta">
          <button class="btn btn-primary btn-lg" data-start data-magnetic>Get started</button>
          <button class="btn btn-glass btn-lg" data-signin>I have an account</button>
        </div>
      </div>
      <div class="scroll-cue" aria-hidden="true"></div>
    </section>

    <section class="marquee-stage" aria-hidden="true">
      <div class="marquee-tilt">
        ${rows.map((r, i) => `<div class="marquee-row ${i % 2 ? 'rev' : ''}" style="--speed:${70 + i * 14}s">
          ${[...r, ...r].map(it => `<img src="${esc(posterOf(it))}" alt="" loading="lazy" decoding="async">`).join('')}
        </div>`).join('')}
      </div>
    </section>

    <section class="scrolly"><div class="scrolly-sticky"><p>
      ${statement.split(' ').map(w => `<span class="sw ${accentWords.has(w) ? 'accent' : ''}">${esc(w)}</span>`).join(' ')}
    </p></div></section>

    <section class="features">
      <article class="feature reveal" style="--i:0"><div class="f-orb" style="--c1:#ff6b5e;--c2:#ff5fa2"></div>
        <h3>Picks that learn you</h3><p>Rate what you finish and every recommendation gets sharper.</p></article>
      <article class="feature reveal" style="--i:1"><div class="f-orb" style="--c1:#8b7cff;--c2:#4fb3ff"></div>
        <h3>Ratings from real people</h3><p>IMDb and reader scores next to reviews from the community. The most-liked rise to the top.</p></article>
      <article class="feature reveal" style="--i:2"><div class="f-orb" style="--c1:#2dd4bf;--c2:#4fb3ff"></div>
        <h3>New releases, automatically</h3><p>Fresh movies, new seasons and books arrive the week they come out, with trailers and where to watch.</p></article>
    </section>

    <section class="l-final reveal">
      <h2>Ready when<br><span class="grad-text">you are.</span></h2>
      <button class="btn btn-grad btn-lg" data-start data-magnetic>Find my next story</button>
    </section>
  </div>`;

  $$('[data-start]', root).forEach(b => b.onclick = () => { location.hash = '#/quiz'; });
  $('[data-signin]', root).onclick = () => openAuth({
    onDone: () => { if (state.prefs?.completedAt) location.hash = '#/'; else location.hash = '#/quiz'; },
  });
  magnetic(root);
  reveal(root);

  // Words light up as the statement scrolls past (sticky scene).
  const scene = $('.scrolly', root);
  const words = $$('.sw', scene);
  const onScroll = () => {
    const r = scene.getBoundingClientRect();
    const p = clamp(-r.top / (r.height - innerHeight), 0, 1);
    const lit = Math.round(p * words.length * 1.15);
    words.forEach((w, i) => w.classList.toggle('lit', i < lit));
  };
  if (reducedMotion()) words.forEach(w => w.classList.add('lit'));
  else { addEventListener('scroll', onScroll, { passive: true }); onScroll(); }

  return () => {
    removeEventListener('scroll', onScroll);
    document.body.classList.remove('is-onboarding');
  };
}

// ─────────────────────────── Quiz ───────────────────────────
const LEGEND_SEEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const LEGEND_LOVED = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 5.5 3.7 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>`;

export function renderQuiz(root) {
  document.body.classList.add('is-onboarding');
  const prev = state.prefs || {};
  const draft = {
    medium: prev.medium || null, genres: [...(prev.genres || [])], moods: [...(prev.moods || [])],
    seen: { ...(prev.seen || {}) }, format: prev.format || 'both', bookLength: prev.bookLength || 'any',
    bookFormats: [...(prev.bookFormats || [])], eras: [...(prev.eras || [])], intl: prev.intl ?? true,
    region: prev.region || guessRegion(), services: [...(prev.services || [])],
  };

  const STEPS = [
    { id: 'medium', render: stepMedium },
    { id: 'genres', render: stepGenres },
    { id: 'moods', render: stepMoods },
    { id: 'seen', render: stepSeen },
    { id: 'style', render: stepStyle },
    { id: 'services', render: stepServices, when: () => draft.medium !== 'book' },
    { id: 'picks', render: stepPicks },
  ];
  const active = () => STEPS.filter(s => !s.when || s.when());
  let idx = 0;
  let current = null; // { valid(), hint() }

  root.innerHTML = `
    <div class="quiz">
      ${MESH}
      <div class="quiz-top">
        <button class="icon-btn" data-back aria-label="Back">${ICONS.chevL}</button>
        <div class="quiz-progress"><i style="width:0"></i></div>
        <div class="quiz-step-n"></div>
      </div>
      <div class="quiz-stage"></div>
      <div class="quiz-foot"><span class="hint"></span><button class="btn btn-primary btn-lg" data-next data-magnetic>Continue</button></div>
    </div>`;

  const stage = $('.quiz-stage', root), nextBtn = $('[data-next]', root), hintEl = $('.hint', root);

  function refreshFoot() {
    const steps = active();
    const isLast = idx === steps.length - 1;
    nextBtn.disabled = current && !current.valid();
    nextBtn.textContent = isLast ? 'Start exploring' : 'Continue';
    hintEl.textContent = current?.hint?.() || '';
  }

  function show(dir = 1) {
    const steps = active();
    idx = clamp(idx, 0, steps.length - 1);
    const step = steps[idx];
    const old = $('.step:not(.leave)', stage);
    if (old) {
      old.classList.remove('enter', 'back');
      old.classList.add('leave');
      if (dir < 0) old.classList.add('back');
      setTimeout(() => old.remove(), 450);
    }
    const el = document.createElement('section');
    el.className = `step enter ${dir < 0 ? 'back' : ''}`;
    stage.appendChild(el);
    current = step.render(el, refreshFoot) || {};
    $('.quiz-progress i', root).style.width = `${((idx + 1) / steps.length) * 100}%`;
    $('.quiz-step-n', root).textContent = `Step ${idx + 1} of ${steps.length}`;
    $('[data-back]', root).style.visibility = 'visible';
    refreshFoot();
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function next() {
    if (current && !current.valid()) return;
    const steps = active();
    if (idx === steps.length - 1) return finish();
    idx++;
    show(1);
  }
  function back() {
    if (idx === 0) { location.hash = state.prefs?.completedAt ? '#/' : '#/welcome'; return; }
    idx--;
    show(-1);
  }
  function finish() {
    savePrefs({ ...draft, completedAt: Date.now() });
    location.hash = '#/';
    toast('Your home is ready. Enjoy!', { icon: true });
  }

  nextBtn.onclick = next;
  $('[data-back]', root).onclick = back;
  const onKey = e => {
    if (e.key === 'Enter' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) next();
  };
  document.addEventListener('keydown', onKey);
  magnetic(root);
  show(1);

  // ───── Steps ─────
  function stepMedium(el, changed) {
    const art = type => {
      const pool = state.items.filter(i => posterOf(i) && (type === 'both' ? true : type === 'book' ? i.type === 'book' : i.type !== 'book'))
        .sort((a, b) => (b.pop || 0) - (a.pop || 0));
      const pick = type === 'both'
        ? [pool.find(i => i.type === 'book'), pool.find(i => i.type === 'movie'), pool.find(i => i.type === 'show')]
        : pool.slice(0, 3);
      return pick.filter(Boolean).map(i => `<span style="background-image:url('${esc(posterOf(i))}')"></span>`).join('');
    };
    const opts = [
      ['screen', 'Movies & Shows', 'Films and series to stream tonight.'],
      ['book', 'Books', 'Novels and non-fiction to get lost in.'],
      ['both', 'Both', 'The best stories, on any page or screen.'],
    ];
    el.innerHTML = `
      <h1 class="step-title">What are you in the mood to discover?</h1>
      <p class="step-sub">We'll tailor everything to this. You can change it any time.</p>
      <div class="choice-grid stagger">
        ${opts.map(([k, t, d], i) => `<button class="choice ${draft.medium === k ? 'on' : ''}" data-k="${k}" style="--i:${i}" aria-pressed="${draft.medium === k}">
          <div class="choice-art">${art(k)}</div><span class="check">${ICONS.check}</span><h3>${t}</h3><p>${d}</p></button>`).join('')}
      </div>`;
    $$('.choice', el).forEach(b => b.onclick = () => {
      draft.medium = b.dataset.k;
      // Drop genres that don't apply to the new medium.
      draft.genres = draft.genres.filter(g => genreApplies(g));
      $$('.choice', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      changed();
      setTimeout(next, 420);
    });
    return { valid: () => Boolean(draft.medium), hint: () => '' };
  }

  function genreApplies(g) {
    const scope = GENRES[g]?.[2];
    if (!scope) return false;
    if (draft.medium === 'both' || scope === 'all') return true;
    return draft.medium === 'screen' ? scope === 'screen' : scope === 'book';
  }

  function stepGenres(el, changed) {
    const keys = Object.keys(GENRES).filter(genreApplies);
    el.innerHTML = `
      <h1 class="step-title">Which genres pull you in?</h1>
      <p class="step-sub">Pick at least two. The more you choose, the wider we'll look.</p>
      <div class="chips stagger">
        ${keys.map((k, i) => `<button class="chip ${draft.genres.includes(k) ? 'on' : ''}" data-k="${k}" style="--c:${GENRES[k][1]};--i:${i}" aria-pressed="${draft.genres.includes(k)}"><span class="dot"></span>${GENRES[k][0]}</button>`).join('')}
      </div>`;
    $$('.chip', el).forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      draft.genres = draft.genres.includes(k) ? draft.genres.filter(g => g !== k) : [...draft.genres, k];
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on'));
      changed();
    });
    return { valid: () => draft.genres.length >= 2, hint: () => (draft.genres.length >= 2 ? `${draft.genres.length} selected` : `Pick ${2 - draft.genres.length} more`) };
  }

  function stepMoods(el, changed) {
    el.innerHTML = `
      <h1 class="step-title">How do you want to feel?</h1>
      <p class="step-sub">Choose any vibes that sound right, today or most days.</p>
      <div class="mood-grid stagger">
        ${Object.entries(MOODS).map(([k, [label, hint, c1, c2]], i) => `<button class="mood ${draft.moods.includes(k) ? 'on' : ''}" data-k="${k}" style="--c1:${c1};--c2:${c2};--i:${i}" aria-pressed="${draft.moods.includes(k)}">
          <span class="orb"></span><span class="check">${ICONS.check}</span><b>${label}</b><span>${hint}</span></button>`).join('')}
      </div>`;
    $$('.mood', el).forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      draft.moods = draft.moods.includes(k) ? draft.moods.filter(m => m !== k) : [...draft.moods, k];
      b.classList.toggle('on');
      b.setAttribute('aria-pressed', b.classList.contains('on'));
      changed();
    });
    return { valid: () => draft.moods.length >= 1, hint: () => (draft.moods.length ? `${draft.moods.length} selected` : 'Pick at least one') };
  }

  function stepSeen(el, changed) {
    const fits = i => draft.medium === 'both' || (draft.medium === 'book' ? i.type === 'book' : i.type !== 'book');
    const daysAhead = i => daysFromToday(i.released) > 0;
    const pool = state.items.filter(i => fits(i) && !daysAhead(i));
    const base = [...pool].sort((a, b) => {
      const ga = (a.genres || []).filter(g => draft.genres.includes(g)).length;
      const gb = (b.genres || []).filter(g => draft.genres.includes(g)).length;
      return (gb - ga) || ((b.pop || 0) - (a.pop || 0));
    }).slice(0, 30);
    const word = draft.medium === 'book' ? 'read' : draft.medium === 'screen' ? 'watched' : 'watched or read';
    el.innerHTML = `
      <h1 class="step-title">What have you already ${word}?</h1>
      <p class="step-sub">We'll skip these and use your favorites to find more like them. Optional, but it helps a lot.</p>
      <div class="pick-tools">
        <input class="input" type="search" placeholder="Search for a title…" aria-label="Search titles">
        <div class="legend"><span><span class="p-state" style="position:static;transform:none;width:22px;height:22px;background:var(--sky);color:#04121f;display:inline-grid;place-items:center;border-radius:50%">${LEGEND_SEEN}</span>Tap once: ${draft.medium === 'book' ? 'read it' : 'seen it'}</span>
        <span><span class="p-state" style="position:static;transform:none;width:22px;height:22px;background:var(--pink);color:#fff;display:inline-grid;place-items:center;border-radius:50%">${LEGEND_LOVED}</span>Twice: loved it</span></div>
      </div>
      <div class="pick-grid"></div>`;
    const grid = $('.pick-grid', el);
    const paint = list => {
      grid.innerHTML = list.map((i, n) => {
        const st = draft.seen[i.id] || '';
        const src = posterOf(i);
        return `<button class="pick ${st} ${src ? '' : 'noimg'}" data-id="${i.id}" style="--i:${Math.min(n, 24)}" aria-label="${esc(i.title)}${st ? ', ' + st : ''}">
          ${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}<div class="card-ph">${esc(i.title)}</div>
          <span class="p-state">${st === 'loved' ? LEGEND_LOVED : LEGEND_SEEN}</span><span class="p-title">${esc(i.title)}</span></button>`;
      }).join('');
      grid.classList.remove('stagger'); void grid.offsetWidth; grid.classList.add('stagger');
    };
    paint(base);
    grid.addEventListener('click', e => {
      const b = e.target.closest('.pick');
      if (!b) return;
      const id = b.dataset.id;
      const next = { '': 'seen', seen: 'loved', loved: '' }[draft.seen[id] || ''];
      if (next) draft.seen[id] = next; else delete draft.seen[id];
      b.classList.remove('seen', 'loved');
      if (next) b.classList.add(next);
      $('.p-state', b).innerHTML = next === 'loved' ? LEGEND_LOVED : LEGEND_SEEN;
      changed();
    });
    $('input', el).addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      paint(q ? pool.filter(i => i.title.toLowerCase().includes(q) || (i.creators || []).join(' ').toLowerCase().includes(q)).slice(0, 30) : base);
    });
    return {
      valid: () => true,
      hint: () => {
        const v = Object.values(draft.seen);
        const loved = v.filter(x => x === 'loved').length;
        return v.length ? `${v.length} marked · ${loved} loved` : 'Optional, skip if you like';
      },
    };
  }

  function segHTML(name, options, value) {
    return `<div class="seg big" data-seg="${name}"><span class="seg-thumb"></span>${options.map(([v, l]) =>
      `<button type="button" class="${String(value) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

  function stepStyle(el, changed) {
    const screen = draft.medium !== 'book', book = draft.medium !== 'screen';
    el.innerHTML = `
      <h1 class="step-title">A few details on your style.</h1>
      <p class="step-sub">These fine-tune the picks. Leave the defaults if you're easygoing.</p>
      <div class="stagger">
        ${screen ? `<div class="opt-group" style="--i:0"><h4>Movies or series?</h4><p>What fits your evenings better.</p>
          ${segHTML('format', [['both', 'Both'], ['movies', 'Mostly movies'], ['series', 'Mostly series']], draft.format)}</div>` : ''}
        ${book ? `<div class="opt-group" style="--i:1"><h4>Book length</h4><p>Quick weekend reads or doorstoppers?</p>
          ${segHTML('bookLength', [['any', 'Any length'], ['short', 'Quick reads'], ['long', 'Big epics']], draft.bookLength)}</div>
          <div class="opt-group" style="--i:2"><h4>How do you read?</h4><p>We'll put your format first in "where to read".</p>
          <div class="chips">${[['print', 'Print'], ['ebook', 'E-books'], ['audio', 'Audiobooks']].map(([k, l]) =>
            `<button class="chip ${draft.bookFormats.includes(k) ? 'on' : ''}" data-fmt="${k}" style="--c:var(--teal)"><span class="dot"></span>${l}</button>`).join('')}</div></div>` : ''}
        <div class="opt-group" style="--i:3"><h4>Favorite eras</h4><p>Leave empty for any era.</p>
          <div class="chips">${[['classic', 'Classics (before 2000)'], ['modern', '2000s & 2010s'], ['new', 'Brand new (2020+)']].map(([k, l]) =>
            `<button class="chip ${draft.eras.includes(k) ? 'on' : ''}" data-era="${k}" style="--c:var(--amber)"><span class="dot"></span>${l}</button>`).join('')}</div></div>
        <div class="opt-group" style="--i:4"><h4>Languages</h4><p>Subtitles and translations open up a lot of great stories.</p>
          ${segHTML('intl', [['true', 'Any language'], ['false', 'English only']], draft.intl)}</div>
      </div>`;
    $$('[data-seg]', el).forEach(seg => {
      requestAnimationFrame(() => placeSegThumb(seg));
      $$('button', seg).forEach(b => b.onclick = () => {
        $$('button', seg).forEach(x => x.classList.toggle('on', x === b));
        placeSegThumb(seg);
        const key = seg.dataset.seg;
        draft[key] = key === 'intl' ? b.dataset.v === 'true' : b.dataset.v;
        changed();
      });
    });
    const toggle = (attr, list) => $$(`[data-${attr}]`, el).forEach(b => b.onclick = () => {
      const k = b.dataset[attr];
      const i = draft[list].indexOf(k);
      if (i >= 0) draft[list].splice(i, 1); else draft[list].push(k);
      b.classList.toggle('on');
    });
    toggle('fmt', 'bookFormats');
    toggle('era', 'eras');
    return { valid: () => true, hint: () => '' };
  }

  function stepServices(el, changed) {
    const paintServices = () => {
      const list = REGION_SERVICES[draft.region] || REGION_SERVICES.OTHER;
      $('.service-grid', el).innerHTML = list.map((k, i) => {
        const p = PROVIDERS[k];
        const on = draft.services.includes(k);
        return `<button class="service ${on ? 'on' : ''}" data-k="${k}" style="--i:${i}" aria-pressed="${on}">${provLogo(p)}${esc(p.name)}<span class="check">${ICONS.check}</span></button>`;
      }).join('');
      $$('.service', el).forEach(b => b.onclick = () => {
        const k = b.dataset.k;
        draft.services = draft.services.includes(k) ? draft.services.filter(s => s !== k) : [...draft.services, k];
        b.classList.toggle('on');
        b.setAttribute('aria-pressed', b.classList.contains('on'));
        changed();
      });
    };
    el.innerHTML = `
      <h1 class="step-title">Where do you watch?</h1>
      <p class="step-sub">We'll show what's on your services first, and where else to find the rest.</p>
      <div class="opt-group"><h4>Your region</h4><p>Streaming catalogs differ by country.</p>
        <div class="pills">${Object.entries(REGIONS).map(([k, v]) => `<button class="pill ${draft.region === k ? 'on' : ''}" data-r="${k}">${esc(v)}</button>`).join('')}</div></div>
      <div class="opt-group"><h4>Your services</h4><p>Select all you subscribe to.</p><div class="service-grid stagger"></div></div>`;
    $$('[data-r]', el).forEach(b => b.onclick = () => {
      draft.region = b.dataset.r;
      draft.services = draft.services.filter(s => (REGION_SERVICES[draft.region] || []).includes(s));
      $$('[data-r]', el).forEach(x => x.classList.toggle('on', x === b));
      paintServices();
      changed();
    });
    paintServices();
    return { valid: () => true, hint: () => (draft.services.length ? `${draft.services.length} service${draft.services.length > 1 ? 's' : ''}` : 'Optional') };
  }

  function stepPicks(el) {
    // Recommendations need the draft as the active taste profile.
    savePrefs({ ...draft, completedAt: prev.completedAt || null });
    const picks = recommend({ limit: 8 });
    el.innerHTML = `
      <h1 class="step-title">Your first <span class="grad-text">picks</span>.</h1>
      <p class="step-sub">Add anything that catches your eye. Your home is built from these signals and keeps learning.</p>
      <div class="picks-grid stagger">
        ${picks.map(({ item, reason }, i) => {
          const bd = item.backdrop, po = posterOf(item);
          const media = bd ? `<img src="${esc(bd)}" alt="" loading="lazy">`
            : po ? `<div class="pc-blur" style="background-image:url('${esc(po)}')"></div><img src="${esc(po)}" alt="" loading="lazy">` : '';
          return `<article class="pickcard" style="--i:${i};--tc:var(--${item.type})">
            <a href="#/title/${item.id}" class="pc-media" aria-label="${esc(item.title)}">${media}</a>
            <div class="pc-body"><div class="pc-reason">${esc(reason)}</div><h4>${esc(item.title)}</h4><p>${esc(item.synopsis || '')}</p>
              <div class="pc-actions">${pickAdd(item)}${item.trailer ? `<button class="btn btn-sm btn-ghost" data-trailer="${item.trailer}" data-title="${esc(item.title)}">${ICONS.play}Trailer</button>` : ''}</div></div>
          </article>`;
        }).join('')}
      </div>
      <p class="muted" style="margin-top:28px">Want this on all your devices? <button class="btn btn-sm btn-glass" data-signin>Sign in</button></p>`;
    $('[data-signin]', el).onclick = () => openAuth();
    return { valid: () => true, hint: () => 'You can always retake this from your profile' };
  }

  function pickAdd(item) {
    const on = Boolean(state.watchlist[item.id]);
    return `<button class="btn btn-sm btn-glass ${on ? 'is-on' : ''}" data-add="${item.id}">${on ? ICONS.check : ICONS.plus}<span>${on ? 'Added' : 'Add to list'}</span></button>`;
  }

  return () => {
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('is-onboarding');
  };
}
