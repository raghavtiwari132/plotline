// Shared UI components and interactions.

import { $, $$, esc, frag, ICONS, reducedMotion, fmtDate, daysFromToday, initials } from './util.js';
import { TYPES } from './config.js';
import { posterOf, backdropOf, inWatchlist, toggleWatchlist, isUpcoming, isFreshlyAdded, getItem, seasonSoon } from './store.js';

// ───────── Images: fade in on load, graceful fallback on error ─────────
document.addEventListener('load', e => {
  if (e.target.tagName === 'IMG') e.target.classList.add('loaded');
}, true);
document.addEventListener('error', e => {
  const t = e.target;
  if (t.tagName !== 'IMG') return;
  const g = t.closest('.g-item');
  if (g) { g.remove(); return; }
  t.closest('.card-media, .pick, .book3d-front, .d-poster, .pc-media')?.classList.add('noimg');
}, true);

// ───────── Small pieces ─────────
export const typeLabel = item => TYPES[item.type]?.label || '';

export function metaLine(item) {
  const parts = [];
  if (isUpcoming(item)) parts.push(fmtDate(item.released, { month: 'short', day: 'numeric' }));
  else if (item.year) parts.push(item.year);
  parts.push(typeLabel(item));
  return parts.join(' · ');
}

export function badgesFor(item) {
  if (isUpcoming(item)) return `<span class="badge soon">${esc(fmtDate(item.released, { month: 'short', day: 'numeric' }))}</span>`;
  if (item.newSeason) return '<span class="badge season">NEW SEASON</span>';
  if (seasonSoon(item, 45)) return `<span class="badge soon">S${item.nextSeason.number || ''} · ${esc(fmtDate(item.nextSeason.date, { month: 'short', day: 'numeric' }))}</span>`;
  const d = daysFromToday(item.released);
  if (isFreshlyAdded(item) || (d != null && d <= 0 && d >= -21)) return '<span class="badge new">NEW</span>';
  return '';
}

export function posterImg(item) {
  const src = posterOf(item);
  return `${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}<div class="card-ph">${esc(item.title)}</div>`;
}

export function provLogo(p, size = '') {
  return `<span class="prov-logo" style="--pc:${p.color};color:${p.ink || '#fff'};${size}">${esc(p.short)}</span>`;
}

export function avatar(user) {
  if (!user) return `<span class="avatar">${ICONS.user}</span>`;
  return `<span class="avatar">${user.photo ? `<img src="${esc(user.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(user.name))}</span>`;
}

export function stars(value, size = 16) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span class="${value >= i - 0.25 ? '' : 'off'}">${ICONS.star}</span>`;
  return `<span class="stars" style="--s:${size}px" role="img" aria-label="${(+value).toFixed(1)} out of 5 stars">${s}</span>`;
}

export function addButton(item, { big = false } = {}) {
  const on = inWatchlist(item.id);
  if (!big) {
    return `<button class="card-add ${on ? 'on' : ''}" data-add="${item.id}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} your list">${on ? ICONS.check : ICONS.plus}</button>`;
  }
  return `<button class="btn btn-glass ${on ? 'is-on' : ''}" data-add="${item.id}" data-big aria-pressed="${on}">${on ? ICONS.check : ICONS.plus}<span>${on ? 'In your list' : 'My list'}</span></button>`;
}

export function syncAddButtons(id) {
  const on = inWatchlist(id);
  $$(`[data-add="${CSS.escape(id)}"]`).forEach(b => {
    b.setAttribute('aria-pressed', on);
    if (b.hasAttribute('data-big')) {
      b.classList.toggle('is-on', on);
      b.innerHTML = `${on ? ICONS.check : ICONS.plus}<span>${on ? 'In your list' : 'My list'}</span>`;
    } else if (b.classList.contains('card-add')) {
      b.classList.toggle('on', on);
      b.innerHTML = on ? ICONS.check : ICONS.plus;
      b.setAttribute('aria-label', `${on ? 'Remove from' : 'Add to'} your list`);
    } else {
      b.classList.toggle('is-on', on);
      b.innerHTML = `${on ? ICONS.check : ICONS.plus}<span>${on ? 'Added' : 'Add to list'}</span>`;
    }
  });
}

// ───────── Cards ─────────
export function card(item, { rank } = {}) {
  const src = posterOf(item);
  const media = `<div class="card-media ${src ? '' : 'noimg'}"><div class="card-badges">${badgesFor(item)}</div>${posterImg(item)}</div>`;
  if (rank) {
    return `<article class="card rank" data-type="${item.type}" data-id="${item.id}">
      <span class="rank-num" aria-hidden="true">${rank}</span>
      <div class="card-body"><a class="card-link" href="#/title/${item.id}" aria-label="${esc(item.title)}">${media}</a></div>
      ${addButton(item)}</article>`;
  }
  return `<article class="card" data-type="${item.type}" data-id="${item.id}">
    <a class="card-link" href="#/title/${item.id}">${media}
      <div class="card-info"><div class="card-title">${esc(item.title)}</div>
      <div class="card-meta"><span class="type-dot" style="--tc:var(--${item.type})"></span>${esc(metaLine(item))}</div></div>
    </a>${addButton(item)}</article>`;
}

export function wideCard(item, { sub } = {}) {
  const bd = backdropOf(item), po = posterOf(item);
  const img = bd
    ? `<img src="${esc(bd)}" alt="" loading="lazy" decoding="async">`
    : po ? `<div class="poster-in-wide" style="background-image:url('${esc(po)}')"></div><img src="${esc(po)}" alt="" loading="lazy" decoding="async">` : '';
  return `<article class="lcard" data-type="${item.type}" data-id="${item.id}">
    <a class="card-link" href="#/title/${item.id}">
      <div class="card-media ${img ? '' : 'noimg'}"><div class="card-badges">${badgesFor(item)}</div>${img}<div class="card-ph">${esc(item.title)}</div>
        <div class="lc-text"><div class="lc-title">${esc(item.title)}</div>
        <div class="lc-meta"><span class="type-dot" style="--tc:var(--${item.type})"></span>${esc(sub || metaLine(item))}</div></div>
      </div>
    </a>${addButton(item)}</article>`;
}

export function row({ title, sub = '', items, kind = 'card', id = '', more = '', subFor = null }) {
  if (!items?.length) return '';
  const cards = items.map((it, i) => (kind === 'rank' ? card(it, { rank: i + 1 }) : kind === 'wide' ? wideCard(it, { sub: subFor?.(it) }) : card(it))).join('');
  return `<section class="row reveal" ${id ? `id="${id}"` : ''}>
    <div class="row-head"><h2 class="row-title">${esc(title)}</h2>${sub ? `<span class="row-sub">${esc(sub)}</span>` : ''}${more ? `<a class="row-more" href="${more}">See all</a>` : ''}</div>
    <div class="scroller-wrap">
      <button class="scroll-btn prev" aria-label="Scroll left" hidden>${ICONS.chevL}</button>
      <div class="scroller">${cards}</div>
      <button class="scroll-btn next" aria-label="Scroll right">${ICONS.chevR}</button>
    </div></section>`;
}

export function wireScrollers(root = document) {
  $$('.scroller-wrap', root).forEach(w => {
    if (w.dataset.wired) return;
    w.dataset.wired = '1';
    const sc = $('.scroller', w), prev = $('.prev', w), next = $('.next', w);
    const update = () => {
      prev.hidden = sc.scrollLeft < 8;
      next.hidden = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 8;
    };
    prev.onclick = () => sc.scrollBy({ left: -sc.clientWidth * 0.85 });
    next.onclick = () => sc.scrollBy({ left: sc.clientWidth * 0.85 });
    sc.addEventListener('scroll', update, { passive: true });
    requestAnimationFrame(update);
  });
}

// ───────── Global click handling ─────────
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) {
    e.preventDefault();
    e.stopPropagation();
    handleAdd(add.dataset.add, add);
    return;
  }
  const tr = e.target.closest('[data-trailer]');
  if (tr) { e.preventDefault(); openTrailer(tr.dataset.trailer, tr.dataset.title); return; }
  const sh = e.target.closest('[data-share]');
  if (sh) { e.preventDefault(); const it = getItem(sh.dataset.share); if (it) openShare(it); return; }

  // Shared-element transition: the clicked poster morphs into the detail page poster.
  const link = e.target.closest('a[href^="#/title/"]');
  if (link) {
    $$('.d-poster, .book3d').forEach(el => { el.style.viewTransitionName = 'none'; });
    $$('.card-media').forEach(el => { el.style.viewTransitionName = ''; });
    const media = link.querySelector('.card-media');
    if (media && !link.closest('.lcard')) media.style.viewTransitionName = 'hero-poster';
  }
});

function handleAdd(id, btn) {
  const item = getItem(id);
  const added = toggleWatchlist(id);
  syncAddButtons(id);
  if (added) {
    flyToList(btn);
    toast(`${item?.title || 'Title'} added to your list`, { icon: true, action: 'View', onAction: () => { location.hash = '#/watchlist'; } });
  } else {
    toast('Removed from your list', { action: 'Undo', onAction: () => { toggleWatchlist(id); syncAddButtons(id); } });
  }
}

// ───────── Toasts ─────────
export function toast(msg, { action, onAction, icon = false, duration = 3800 } = {}) {
  const host = $('.toasts') || document.body.appendChild(frag('<div class="toasts" role="status" aria-live="polite"></div>'));
  const t = frag(`<div class="toast">${icon ? `<span class="t-ic">${ICONS.check}</span>` : ''}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}</div>`);
  host.appendChild(t);
  while (host.children.length > 2) host.firstElementChild.remove();
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 350); };
  if (action) t.querySelector('button').onclick = () => { onAction?.(); close(); };
  setTimeout(close, duration);
}

// ───────── Modal ─────────
export function openModal(html, { wide = false, label = 'Dialog', onClose } = {}) {
  const root = frag(`<div class="modal-root" role="dialog" aria-modal="true" aria-label="${esc(label)}">
    <div class="modal-backdrop"></div>
    ${wide ? `<button class="icon-btn lb-close" aria-label="Close">${ICONS.x}</button>` : ''}
    <div class="modal ${wide ? 'wide' : ''}">${wide ? '' : `<button class="icon-btn modal-x" aria-label="Close">${ICONS.x}</button>`}${html}</div>
  </div>`);
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    if (root.classList.contains('closing')) return;
    root.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      root.remove();
      if (!$('.modal-root, .search-ov, .lightbox')) document.body.classList.remove('no-scroll');
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.();
    }, 280);
  }
  document.addEventListener('keydown', onKey);
  $('.modal-backdrop', root).onclick = close;
  $('.modal-x, .lb-close', root)?.addEventListener('click', close);
  setTimeout(() => $('.modal input, .modal textarea, .modal [autofocus]', root)?.focus(), 80);
  return { el: $('.modal', root), root, close };
}

export function openTrailer(id, title = 'Trailer') {
  openModal(`<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
    title="${esc(title)} trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`, { wide: true, label: `${title} trailer` });
}

// ───────── Share ─────────
export const titleUrl = item => `${location.origin}${location.pathname}#/title/${item.id}`;

const SHARE_ICONS = {
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.4-.7-2.8-1.1-4.6-4-4.8-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 .9c.3.2.5.2.6.4.1.1.1.7-.2 1.3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.2H8v3.6h2.6V22H14v-9.9h2.7l.4-3.6H14z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 3.6 2.9 10.8c-1.3.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.6zM8.6 13.5l9.8-6.2c.5-.3.9-.1.5.2l-8.3 7.5-.3 3.4-1.7-4.9z"/></svg>',
  reddit: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="13.5" r="6.5"/><circle cx="18.5" cy="6" r="1.6"/><path d="M12 7l1.2-4.2 5.3 1.8" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="9.6" cy="13" r="1.1" fill="#ff4500"/><circle cx="14.4" cy="13" r="1.1" fill="#ff4500"/><path d="M9.4 15.6c1.5 1.1 3.7 1.1 5.2 0" stroke="#ff4500" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>',
};

export function openShare(item, { url, text, heading } = {}) {
  url = url || titleUrl(item);
  const kind = item.type === 'book' ? 'read' : item.type === 'show' ? 'series' : 'movie';
  text = text || `You have to check out ${item.title}. Great ${kind} — found it on Plotline:`;
  const e = encodeURIComponent;
  const opts = [
    ['WhatsApp', '#25d366', `https://wa.me/?text=${e(text + ' ' + url)}`, SHARE_ICONS.whatsapp],
    ['X', '#111', `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`, SHARE_ICONS.x],
    ['Facebook', '#1877f2', `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`, SHARE_ICONS.facebook],
    ['Telegram', '#229ed9', `https://t.me/share/url?url=${e(url)}&text=${e(text)}`, SHARE_ICONS.telegram],
    ['Reddit', '#ff4500', `https://www.reddit.com/submit?url=${e(url)}&title=${e(item.title)}`, SHARE_ICONS.reddit],
    ['Email', '#5b5b66', `mailto:?subject=${e(item.title)}&body=${e(text + '\n\n' + url)}`, ICONS.mail],
  ];
  const native = typeof navigator.share === 'function';
  const poster = posterOf(item);
  const { el, close } = openModal(`
    <h3>${esc(heading || 'Share')}</h3>
    <p class="lead">Send it to someone who'd love it.</p>
    <div class="share-preview">${poster ? `<img src="${esc(poster)}" alt="">` : ''}<div><b>${esc(item.title)}</b><div class="dim" style="font-size:13px">${esc(metaLine(item))}</div></div></div>
    <div class="share-grid">
      ${opts.map(([n, c, href, ic]) => `<a class="share-opt" href="${esc(href)}" target="_blank" rel="noopener"><span class="share-ic" style="--sc:${c}">${ic}</span>${n}</a>`).join('')}
      ${native ? `<button class="share-opt" data-native><span class="share-ic" style="--sc:#2c2c36">${ICONS.share}</span>More</button>` : ''}
    </div>
    <div class="copy-row"><input class="input" readonly value="${esc(url)}" aria-label="Link"><button class="btn btn-primary" data-copy>${ICONS.link}Copy</button></div>`, { label: 'Share' });
  $('[data-copy]', el).onclick = async ev => {
    const b = ev.currentTarget;
    try { await navigator.clipboard.writeText(url); } catch { $('input', el).select(); document.execCommand?.('copy'); }
    b.innerHTML = `${ICONS.check}Copied`;
    setTimeout(() => { b.innerHTML = `${ICONS.link}Copy`; }, 1800);
  };
  $('[data-native]', el)?.addEventListener('click', async () => {
    try { await navigator.share({ title: item.title, text, url }); close(); } catch { /* cancelled */ }
  });
}

// ───────── Star input ─────────
const CAPTIONS = ['', 'Not for me', 'It was okay', 'Liked it', 'Really liked it', 'Loved it!'];
export function starInput(host, value, onChange) {
  host.innerHTML = `<div class="star-input" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n =>
    `<button type="button" role="radio" aria-label="${n} star${n > 1 ? 's' : ''}" data-n="${n}">${ICONS.star}</button>`).join('')}</div>
    <div class="star-caption"></div>`;
  const btns = $$('button', host), cap = $('.star-caption', host);
  let current = value || 0;
  const paint = v => {
    btns.forEach(b => b.classList.toggle('lit', +b.dataset.n <= v));
    cap.textContent = CAPTIONS[v] || 'Tap a star to rate';
  };
  btns.forEach(b => {
    b.addEventListener('mouseenter', () => paint(+b.dataset.n));
    b.addEventListener('click', () => {
      current = +b.dataset.n;
      btns.forEach(x => x.setAttribute('aria-checked', x === b));
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      paint(current);
      onChange?.(current);
    });
  });
  $('.star-input', host).addEventListener('mouseleave', () => paint(current));
  paint(current);
  return { get value() { return current; } };
}

// ───────── Motion helpers ─────────
let io;
export function reveal(root = document) {
  const els = $$('.reveal:not(.in)', root);
  if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  io = io || new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  els.forEach(e => io.observe(e));
}

export function tilt(el, max = 9) {
  if (!el || reducedMotion() || matchMedia('(hover: none)').matches) return;
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateY(${(x - 0.5) * max * 2}deg) rotateX(${(0.5 - y) * max * 2}deg) scale(1.02)`;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.classList.add('tilting');
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; el.classList.remove('tilting'); });
}

export function magnetic(root = document) {
  if (reducedMotion() || matchMedia('(hover: none)').matches) return;
  $$('[data-magnetic]', root).forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.2}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}

function bumpList() {
  $$('.wl-icon').forEach(el => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); });
}

export function flyToList(fromBtn) {
  const host = fromBtn.closest('.card, .lcard, .pickcard, .d-main, .wl-card, .bb-slide');
  const img = host && [...host.querySelectorAll('img')].find(i => i.complete && i.naturalWidth);
  const target = [...$$('.wl-icon')].find(t => t.offsetParent !== null);
  if (reducedMotion() || !img || !target) return bumpList();
  const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
  const ghost = frag(`<div class="fly-ghost"><img src="${esc(img.currentSrc || img.src)}" alt=""></div>`);
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(ghost);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${Math.max(0.06, 22 / a.width)})`;
    ghost.style.opacity = '0.3';
    ghost.style.borderRadius = '50%';
  }));
  setTimeout(() => { ghost.remove(); bumpList(); }, 870);
}

export function burst(btn) {
  if (reducedMotion()) return;
  const colors = ['#ff5fa2', '#ff6b5e', '#ffb547', '#8b7cff'];
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('i');
    d.className = 'burst-dot';
    const ang = (i / 10) * Math.PI * 2;
    d.style.setProperty('--dx', `${Math.cos(ang) * 28}px`);
    d.style.setProperty('--dy', `${Math.sin(ang) * 28}px`);
    d.style.background = colors[i % 4];
    btn.appendChild(d);
    setTimeout(() => d.remove(), 750);
  }
}

/** Average vivid color of an image (for ambient glows). Resolves null if blocked. */
export function ambientColor(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (mx < 40 || mx - mn < 25) continue; // skip dark & grey pixels
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        resolve(n ? `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function placeSegThumb(seg) {
  const thumb = $('.seg-thumb', seg), onBtn = $('button.on', seg);
  if (thumb && onBtn) { thumb.style.left = `${onBtn.offsetLeft}px`; thumb.style.width = `${onBtn.offsetWidth}px`; }
}

export function openLightbox(images, index = 0) {
  let i = index;
  const lb = frag(`<div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <button class="icon-btn lb-close" aria-label="Close">${ICONS.x}</button>
    ${images.length > 1 ? `<button class="icon-btn lb-nav lb-prev" aria-label="Previous">${ICONS.chevL}</button><button class="icon-btn lb-nav lb-next" aria-label="Next">${ICONS.chevR}</button>` : ''}
    <figure><img alt=""><figcaption></figcaption></figure></div>`);
  const img = $('img', lb), cap = $('figcaption', lb);
  const show = () => {
    const im = images[i];
    img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
    img.src = im.full || im.src;
    img.alt = im.caption || '';
    cap.textContent = im.caption || '';
  };
  const close = () => { lb.remove(); document.removeEventListener('keydown', key); if (!$('.modal-root, .search-ov')) document.body.classList.remove('no-scroll'); };
  const key = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') { i = (i + 1) % images.length; show(); }
    if (e.key === 'ArrowLeft') { i = (i - 1 + images.length) % images.length; show(); }
  };
  $('.lb-close', lb).onclick = close;
  $('.lb-prev', lb)?.addEventListener('click', () => { i = (i - 1 + images.length) % images.length; show(); });
  $('.lb-next', lb)?.addEventListener('click', () => { i = (i + 1) % images.length; show(); });
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', key);
  document.body.appendChild(lb);
  document.body.classList.add('no-scroll');
  show();
}
