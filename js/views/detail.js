// Title page: trailer hero, info, ratings, where to watch/read, photos, reviews.

import { GENRES, TYPES, LANGS, whereTo } from '../config.js';
import { $, $$, esc, ICONS, fmtDate, relTime, reducedMotion, plural, daysFromToday } from '../util.js';
import { state, getItem, posterOf, backdropOf, isUpcoming, wl, region, markDone } from '../store.js';
import {
  row, wireScrollers, reveal, addButton, provLogo, stars, starInput, avatar, toast, tilt, burst,
  ambientColor, placeSegThumb, openLightbox, badgesFor, typeLabel,
} from '../ui.js';
import { similarTo } from '../recommend.js';
import { backend } from '../backend.js';
import { openAuth } from '../auth.js';
import { openRateModal } from '../rate.js';

const fmtRuntime = m => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim() : `${m}m`);

export function renderDetail(root, id) {
  const item = getItem(id);
  if (!item) {
    root.innerHTML = `<div class="empty" style="padding-top:180px"><div class="empty-art">${ICONS.search}</div>
      <h3>We couldn't find that title</h3><p>It may have been renamed or removed.</p><a class="btn btn-primary" href="#/">Back home</a></div>`;
    return;
  }
  document.title = `${item.title} · Plotline`;
  const isBook = item.type === 'book';
  const poster = posterOf(item), bd = backdropOf(item);
  const upcoming = isUpcoming(item);
  const entry = wl(item.id);
  const verb = TYPES[item.type].verb;
  const pair = item.pair && getItem(item.pair);

  const meta = [];
  if (upcoming) meta.push(`Arrives ${fmtDate(item.released)}`);
  else if (item.released && daysFromToday(item.released) >= -365) meta.push(fmtDate(item.released));
  else if (item.year) meta.push(String(item.year));
  if (item.runtime) meta.push(fmtRuntime(item.runtime));
  if (item.seasons) meta.push(plural(item.seasons, 'season'));
  if (item.pages) meta.push(`${item.pages} pages`);
  if (item.lang && item.lang !== 'en' && LANGS[item.lang]) meta.push(isBook ? `Translated from ${LANGS[item.lang]}` : LANGS[item.lang]);
  if (item.nextSeason && daysFromToday(item.nextSeason.date) > 0) meta.push(`Season ${item.nextSeason.number || 'next'} arrives ${fmtDate(item.nextSeason.date)}`);
  else if (item.newSeason && item.latestSeason) meta.push(`Season ${item.latestSeason} out now`);

  const people = [];
  if (item.creators?.length) people.push([isBook ? 'Author' : item.type === 'show' ? 'Created by' : 'Directed by', item.creators.join(', ')]);
  if (item.cast?.length) people.push(['Starring', item.cast.join(', ')]);

  const posterBlock = isBook
    ? `<div class="book3d"><div class="book3d-inner">
        <div class="book3d-back"></div><div class="book3d-spine"></div><div class="book3d-pages"></div>
        <div class="book3d-front ${poster ? '' : 'noimg'}">${poster ? `<img src="${esc(poster)}" alt="Cover of ${esc(item.title)}">` : ''}<div class="card-ph" style="--tc:var(--book)">${esc(item.title)}</div></div>
      </div></div>`
    : `<div class="d-poster ${poster ? '' : 'noimg'}" style="position:relative">${poster ? `<img src="${esc(poster)}" alt="Poster for ${esc(item.title)}">` : ''}<div class="card-ph" style="--tc:var(--${item.type})">${esc(item.title)}</div><div class="tilt-shine"></div></div>`;

  root.innerHTML = `
    <section class="d-hero ${item.trailer ? 'has-trailer' : ''}">
      <div class="d-bg ${bd ? '' : 'poster-blur'}" style="background-image:url('${esc(bd || poster || '')}')"></div>
      ${item.trailer && !isBook ? '<div class="d-video" aria-hidden="true"></div>' : ''}
      <div class="d-shade"></div>
      ${item.trailer ? `<button class="d-play-big" data-play aria-label="Play trailer">${ICONS.play}</button>
        <div class="d-hero-ctrl"><button class="icon-btn" data-mute aria-label="Unmute preview">${ICONS.mute}</button><button class="icon-btn" data-replay aria-label="Replay preview">${ICONS.replay}</button></div>` : ''}
    </section>

    <div class="d-main">
      <div class="d-poster-col">${posterBlock}</div>
      <div class="d-info">
        <div class="d-kicker"><span class="type-dot" style="--tc:var(--${item.type})"></span>${esc(typeLabel(item))}
          ${(item.genres || []).slice(0, 3).map(g => `<span class="tag">${esc(GENRES[g]?.[0] || g)}</span>`).join('')}
          ${badgesFor(item)}</div>
        <h1 class="d-title">${esc(item.title)}</h1>
        <div class="d-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('<span class="sep"></span>')}
          ${item.imdb ? `<span class="sep"></span><span class="row-gap" style="gap:6px"><span class="imdb-badge">IMDb</span><b>${item.imdb.toFixed(1)}</b></span>` : ''}
          ${item.olRating ? `<span class="sep"></span><span>★ ${item.olRating.toFixed(1)} readers</span>` : ''}</div>
        <p class="d-syn">${esc(item.synopsis || 'No synopsis yet.')}</p>
        ${item.synopsisSource === 'wikipedia' && item.wiki ? `<div class="d-src">Summary from <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(item.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">Wikipedia</a>, CC BY-SA</div>` : ''}
        ${people.length ? `<dl class="d-people">${people.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<div style="height:22px"></div>'}
        <div class="d-actions">
          ${item.trailer ? `<button class="btn btn-primary" data-trailer="${item.trailer}" data-title="${esc(item.title)}">${ICONS.play}Play trailer</button>` : ''}
          ${addButton(item, { big: true })}
          ${upcoming ? '' : `<button class="btn btn-glass" data-rate>${entry?.status === 'done' ? `${ICONS.star}Your rating: ${entry.rating || '–'}/5` : `${ICONS.check}Mark as ${verb}`}</button>`}
          <button class="icon-btn" data-share="${item.id}" aria-label="Share" title="Share">${ICONS.share}</button>
        </div>
      </div>
    </div>

    <section class="d-section reveal"><h2>Ratings</h2><div class="ratings">${externalRating(item)}<div class="rcard community" data-community><div class="skeleton" style="height:120px;grid-column:1/-1"></div></div></div></section>

    <section class="d-section reveal"><h2>${isBook ? 'Where to read' : 'Where to watch'}</h2>
      <div class="providers">${whereTo(item, region(), state.prefs || {}).map(p => `
        <a class="ptile ${p.mine ? 'mine' : ''}" href="${esc(p.href)}" target="_blank" rel="noopener">${provLogo(p)}<div><b>${esc(p.name)}</b><span>${esc(p.mine ? 'On your services' : p.note)}</span></div></a>`).join('')}
      </div>
      ${!isBook ? `<p class="dim" style="font-size:13px;margin-top:14px">Availability changes often and varies by country. JustWatch shows live options for your region.</p>` : ''}
    </section>

    ${pair ? `<section class="d-section reveal"><h2>${isBook ? 'Also on screen' : 'Based on the book'}</h2>
      <a class="pair" href="#/title/${pair.id}" style="--tc:var(--${pair.type})">${posterOf(pair) ? `<img src="${esc(posterOf(pair))}" alt="">` : ''}
        <div><div class="k">${esc(typeLabel(pair))}${pair.year ? ' · ' + pair.year : ''}</div><div class="t">${esc(pair.title)}</div><div class="dim" style="font-size:14px">${esc((pair.creators || []).join(', '))}</div></div></a></section>` : ''}

    <section class="d-section reveal" data-gallery-sec hidden><h2>${isBook ? 'Cover, author & events' : 'Photos'}</h2><div class="gallery" data-gallery></div></section>

    <section class="d-section reveal" id="reviews">
      <div class="rev-head"><h2>Reviews</h2>
        <div class="seg" data-sort><span class="seg-thumb"></span><button class="on" data-v="liked">Most liked</button><button data-v="new">Newest</button></div></div>
      <div data-composer></div>
      <div class="reviews" data-reviews><div class="skeleton" style="height:120px"></div></div>
    </section>

    ${row({ title: 'More like this', items: similarTo(item, 16) })}
    <div style="height:80px"></div>`;

  // ── Interactions ──
  tilt($('.d-poster', root));
  wireScrollers(root);
  reveal(root);
  $('[data-rate]', root)?.addEventListener('click', () => openRateModal(item, { onSaved: () => refreshReviews() }));

  // Ambient glow from the poster colors.
  ambientColor(poster).then(c => {
    if (!c) return;
    $('.d-poster', root)?.style.setProperty('--glow', c.replace('rgb', 'rgba').replace(')', ', .55)'));
    $('.book3d-spine', root)?.style.setProperty('--spine', c);
    $('.d-hero', root)?.style.setProperty('--amb', c);
  });

  const disposeHero = wireHero(root, item);
  loadGallery(root, item);

  // ── Reviews ──
  let sort = 'liked';
  let data = null;
  const seg = $('[data-sort]', root);
  requestAnimationFrame(() => placeSegThumb(seg));
  $$('button', seg).forEach(b => b.onclick = () => {
    sort = b.dataset.v;
    $$('button', seg).forEach(x => x.classList.toggle('on', x === b));
    placeSegThumb(seg);
    paintReviews();
  });

  async function refreshReviews() {
    try {
      data = await backend.getReviews(item);
    } catch (err) {
      console.warn(err);
      data = { reviews: [], summary: { avg: 0, count: 0, dist: [0, 0, 0, 0, 0] }, sample: false, error: true };
    }
    if (!root.isConnected) return;
    paintCommunity();
    paintComposer();
    paintReviews();
  }

  function paintCommunity() {
    const box = $('[data-community]', root);
    const { avg, count, dist } = data.summary;
    const max = Math.max(1, ...dist);
    const mine = wl(item.id)?.rating;
    box.innerHTML = `
      <div>
        <div class="rcard-label"><span class="pl-badge">PLOTLINE</span>Community rating</div>
        <div class="rcard-big">${count ? avg.toFixed(1) : '–'}<small>/ 5</small></div>
        ${count ? stars(avg, 18) : ''}
        <div class="rcard-sub" style="margin-top:6px">${count ? `${count.toLocaleString()} rating${count === 1 ? '' : 's'}` : upcoming ? 'Opens on release day' : 'No ratings yet. Be the first!'}${mine ? ` · You gave it ${mine}★` : ''}</div>
        ${data.sample ? '<div class="demo-note" style="margin-top:12px">Sample data · demo mode</div>' : ''}
        ${data.error ? '<div class="demo-note" style="margin-top:12px">Could not reach the review service</div>' : ''}
      </div>
      <div class="dist">${[5, 4, 3, 2, 1].map((n, i) => `<div class="dist-row"><span>${n}★</span><div class="dist-bar"><i style="--w:${(dist[n - 1] / max) * 100}%;--i:${i}"></i></div><span>${dist[n - 1]}</span></div>`).join('')}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => $('.dist', box)?.classList.add('in')));
  }

  function paintComposer() {
    const box = $('[data-composer]', root);
    if (upcoming) { box.innerHTML = `<div class="composer"><b>Reviews open on ${esc(fmtDate(item.released))}.</b><div class="muted">Add it to your list and we'll keep it on your radar.</div></div>`; return; }
    const user = backend.user;
    const mine = data.reviews.find(r => r.mine) || null;
    const entry = wl(item.id);
    let rating = mine?.rating || entry?.rating || 0;
    box.innerHTML = `<div class="composer">
      <div class="row-gap" style="justify-content:space-between;margin-bottom:10px">
        <div class="row-gap">${avatar(user)}<div><b>${user ? esc(user.name) : `${isBook ? 'Read' : 'Seen'} it?`}</b><div class="dim" style="font-size:13px">${mine ? 'Edit your review' : 'Rate it and tell people what you thought'}</div></div></div>
        <div data-stars></div>
      </div>
      <textarea maxlength="2000" placeholder="${isBook ? 'What did you think of the book?' : 'What did you think?'} No spoilers, please.">${esc(mine?.text || entry?.review || '')}</textarea>
      <div class="composer-row"><span class="form-error" style="margin:0"></span>
        <div class="row-gap">${mine ? '<button class="btn btn-sm btn-ghost" data-del>Delete</button>' : ''}<button class="btn btn-grad btn-sm" data-post>${mine ? 'Update review' : 'Post review'}</button></div></div>
    </div>`;
    const sHost = $('[data-stars]', box);
    starInput(sHost, rating, v => { rating = v; $('.form-error', box).textContent = ''; });
    sHost.querySelector('.star-caption').style.textAlign = 'right';
    $('[data-post]', box).onclick = () => {
      const text = $('textarea', box).value.trim();
      if (!rating) { $('.form-error', box).textContent = 'Pick a star rating first.'; return; }
      const post = async () => {
        try {
          await backend.submitReview(item, { rating, text });
          markDone(item.id, { rating, review: text });
          toast(mine ? 'Review updated' : 'Thanks for your review!', { icon: true });
          const btn = $('[data-rate]', root);
          if (btn) btn.innerHTML = `${ICONS.star}Your rating: ${rating}/5`;
          refreshReviews();
        } catch (err) { $('.form-error', box).textContent = err.message || 'Could not post right now.'; }
      };
      if (backend.user) post(); else openAuth({ reason: 'to post your review', onDone: post });
    };
    $('[data-del]', box)?.addEventListener('click', async () => {
      await backend.deleteReview(item);
      toast('Review deleted');
      refreshReviews();
    });
  }

  function paintReviews() {
    const box = $('[data-reviews]', root);
    if (!data) return;
    const list = [...data.reviews].sort(sort === 'liked'
      ? (a, b) => (b.likeCount || 0) - (a.likeCount || 0) || b.createdAt - a.createdAt
      : (a, b) => b.createdAt - a.createdAt);
    if (!list.length) {
      box.innerHTML = `<p class="muted">${upcoming ? 'Nothing yet. It is not out.' : 'No written reviews yet. Yours could be the first one people see.'}</p>`;
      return;
    }
    box.innerHTML = list.map((r, i) => {
      const featured = sort === 'liked' && i === 0 && (r.likeCount || 0) > 0;
      return `<article class="review ${featured ? 'featured' : ''} reveal" style="--i:${Math.min(i, 6)}" data-rid="${esc(r.id)}">
        <div class="rv-top">${avatar({ name: r.name, photo: r.photo })}<div style="flex:1;min-width:0">
          <div class="rv-name">${esc(r.name)}${r.mine ? '<span class="tag">You</span>' : ''}${r.sample ? '<span class="sample-tag">Sample</span>' : ''}</div>
          <div class="rv-date">${stars(r.rating, 13)} · ${esc(relTime(r.createdAt))}</div></div></div>
        <p class="rv-text">${esc(r.text)}</p>
        <div class="rv-foot"><button class="like-btn ${r.likedByMe ? 'on' : ''}" data-like aria-pressed="${Boolean(r.likedByMe)}" aria-label="Helpful">${ICONS.heart}<span>${r.likeCount || 0}</span></button>
        <span class="dim" style="font-size:12.5px">${r.likeCount ? 'found this helpful' : 'Helpful?'}</span></div>
      </article>`;
    }).join('');
    reveal(box);
    $$('[data-like]', box).forEach(btn => btn.onclick = async () => {
      if (!backend.user) { openAuth({ reason: 'to like reviews', onDone: refreshReviews }); return; }
      const card = btn.closest('[data-rid]');
      const rid = card.dataset.rid;
      const rv = data.reviews.find(x => x.id === rid);
      const wasOn = btn.classList.contains('on');
      // Optimistic update with a little heart burst.
      rv.likedByMe = !wasOn;
      rv.likeCount = (rv.likeCount || 0) + (wasOn ? -1 : 1);
      btn.classList.toggle('on', !wasOn);
      btn.setAttribute('aria-pressed', !wasOn);
      $('span', btn).textContent = rv.likeCount;
      if (!wasOn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); burst(btn); }
      try { await backend.toggleLike(item, rid); }
      catch (err) {
        rv.likedByMe = wasOn;
        rv.likeCount += wasOn ? 1 : -1;
        btn.classList.toggle('on', wasOn);
        $('span', btn).textContent = rv.likeCount;
        toast(err.message || 'Could not save your like.');
      }
    });
  }

  refreshReviews();
  return () => { disposeHero?.(); document.title = 'Plotline'; };
}

function externalRating(item) {
  if (item.type === 'book') {
    const gr = `https://www.goodreads.com/search?q=${encodeURIComponent(item.title + ' ' + (item.creators?.[0] || ''))}`;
    return `<div class="rcard"><div class="rcard-label"><span class="ol-badge">Open Library</span>Reader rating</div>
      <div class="rcard-big">${item.olRating ? item.olRating.toFixed(1) : '–'}<small>/ 5</small></div>
      <div class="rcard-sub">${item.olCount ? `${item.olCount.toLocaleString()} ratings · ` : ''}<a href="${item.olid ? `https://openlibrary.org/works/${item.olid}` : `https://openlibrary.org/search?q=${encodeURIComponent(item.title)}`}" target="_blank" rel="noopener">Open Library</a> · <a href="${gr}" target="_blank" rel="noopener">Goodreads</a></div></div>`;
  }
  const url = item.imdbId ? `https://www.imdb.com/title/${item.imdbId}/` : `https://www.imdb.com/find/?q=${encodeURIComponent(item.title + ' ' + (item.year || ''))}`;
  return `<div class="rcard"><div class="rcard-label"><span class="imdb-badge">IMDb</span>IMDb rating</div>
    <div class="rcard-big">${item.imdb ? item.imdb.toFixed(1) : '–'}<small>/ 10</small></div>
    <div class="rcard-sub">${item.imdb ? '' : (isUpcoming(item) ? 'Not out yet · ' : 'Not rated yet · ')}<a href="${url}" target="_blank" rel="noopener">View on IMDb</a></div></div>`;
}

// ─────────────────────────── Hero trailer ───────────────────────────
function wireHero(root, item) {
  const hero = $('.d-hero', root);
  const bg = $('.d-bg', hero);
  const video = $('.d-video', hero);
  let iframe = null, muted = true, timer;

  const send = (func, args = []) => iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');

  $('[data-play]', hero)?.addEventListener('click', () => {
    send('pauseVideo');
    $('[data-trailer]', root)?.click();
  });

  // Quietly start a muted preview behind the title, like a streaming app.
  const canPreview = video && !reducedMotion() && !navigator.connection?.saveData && innerWidth > 760;
  if (canPreview) {
    timer = setTimeout(() => {
      const id = encodeURIComponent(item.trailer);
      iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
      iframe.allow = 'autoplay; encrypted-media';
      iframe.title = `${item.title} preview`;
      iframe.tabIndex = -1;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      // Ask the player to report its state; only fade the video in once it's really playing.
      iframe.addEventListener('load', () => {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'plotline', channel: 'widget' }), '*');
      });
      video.appendChild(iframe);
    }, 1400);
  }

  let revealed = false;
  const onMessage = e => {
    if (!iframe || e.source !== iframe.contentWindow || revealed) return;
    let data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
    if (state === 1) {
      revealed = true;
      setTimeout(() => {
        video.classList.add('on');
        hero.classList.add('playing');
        $('.d-hero-ctrl', hero)?.classList.add('show');
      }, 600); // skip the first frames, which are often black
    }
  };
  addEventListener('message', onMessage);

  $('[data-mute]', hero)?.addEventListener('click', e => {
    muted = !muted;
    send(muted ? 'mute' : 'unMute');
    e.currentTarget.innerHTML = muted ? ICONS.mute : ICONS.sound;
    e.currentTarget.setAttribute('aria-label', muted ? 'Unmute preview' : 'Mute preview');
  });
  $('[data-replay]', hero)?.addEventListener('click', () => { send('seekTo', [0, true]); send('playVideo'); });

  // Parallax + pause the preview when scrolled away.
  let wasVisible = true;
  const onScroll = () => {
    const y = scrollY;
    if (!reducedMotion()) bg.style.transform = `translateY(${y * 0.35}px) scale(${1.06 + y / 6000})`;
    const visible = y < hero.offsetHeight * 0.75;
    if (visible !== wasVisible) { send(visible ? 'playVideo' : 'pauseVideo'); wasVisible = visible; }
  };
  addEventListener('scroll', onScroll, { passive: true });
  return () => { clearTimeout(timer); removeEventListener('scroll', onScroll); removeEventListener('message', onMessage); iframe?.remove(); };
}

// ─────────────────────────── Gallery (Wikipedia / Commons) ───────────────────────────
const SKIP = /(logo|icon|symbol|flag|signature|wikiquote|commons-logo|disambig|ambox|question_book|edit-clear|crystal|nuvola|padlock|wiktionary|wikisource|folder|sound|audio|\.svg$|\.gif$|\.tif)/i;

async function mediaList(title) {
  if (!title) return [];
  const key = 'plotline:ml2:' + title;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    if (!res.ok) return [];
    const data = await res.json();
    const out = (data.items || [])
      .filter(m => m.type === 'image' && m.srcset?.length && !SKIP.test(m.title || ''))
      .map(m => {
        const best = m.srcset[m.srcset.length - 1].src.split('?')[0];
        const src = best.startsWith('//') ? 'https:' + best : best;
        const full = src.includes('/thumb/')
          ? src.replace('thumb.wikimedia.org', 'upload.wikimedia.org').replace('/thumb/', '/').replace(/\/[^/]+$/, '')
          : src;
        return { src, full, caption: (m.caption?.text || '').trim(), file: (m.title || '').replace(/^File:/, '') };
      });
    try { sessionStorage.setItem(key, JSON.stringify(out)); } catch { /* ignore */ }
    return out;
  } catch { return []; }
}

async function loadGallery(root, item) {
  const [own, author] = await Promise.all([mediaList(item.wiki), item.type === 'book' ? mediaList(item.authorWiki) : []]);
  const fileKey = s => decodeURIComponent(s || '').replace(/ /g, '_').toLowerCase();
  const posterFile = fileKey((posterOf(item) || '').split('?')[0].split('/').pop());
  const seen = new Set();
  const images = [...own, ...author.slice(0, 6)].filter(m => {
    const name = fileKey(m.file);
    if (seen.has(name) || (posterFile && name === posterFile)) return false;
    seen.add(name);
    return true;
  }).slice(0, 14);
  if (item.type === 'book' && posterOf(item)) images.unshift({ src: posterOf(item), full: posterOf(item), caption: `Cover of ${item.title}` });
  const sec = $('[data-gallery-sec]', root);
  if (!sec || images.length < (item.type === 'book' ? 2 : 1)) return;
  const g = $('[data-gallery]', sec);
  g.innerHTML = images.map((m, i) => `<figure class="g-item" data-i="${i}" tabindex="0" role="button" aria-label="Open photo${m.caption ? ': ' + esc(m.caption) : ''}">
    <img src="${esc(m.src)}" alt="${esc(m.caption)}" loading="lazy" decoding="async">${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`).join('');
  sec.hidden = false;
  reveal(root);
  g.addEventListener('click', e => {
    const f = e.target.closest('.g-item');
    if (!f) return;
    const live = $$('.g-item', g).map(el => images[+el.dataset.i]);
    openLightbox(live, live.indexOf(images[+f.dataset.i]));
  });
  g.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('.g-item')?.click(); });
}
