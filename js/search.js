// Full-screen instant search (Ctrl/⌘ + K or "/").

import { $, $$, esc, frag, ICONS, debounce } from './util.js';
import { card, wireScrollers } from './ui.js';
import { state, isUpcoming } from './store.js';

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');

function search(q, type) {
  const nq = norm(q).trim();
  const pool = state.items.filter(i => type === 'all' || i.type === type);
  if (!nq) return [...pool].filter(i => !isUpcoming(i)).sort((a, b) => (b.pop || 0) - (a.pop || 0)).slice(0, 18);
  const words = nq.split(/\s+/);
  return pool
    .map(i => {
      const t = norm(i.title);
      const people = norm([...(i.creators || []), ...(i.cast || [])].join(' '));
      let s = 0;
      if (t.startsWith(nq)) s += 10;
      else if (t.includes(nq)) s += 6;
      if (words.every(w => t.includes(w))) s += 3;
      if (words.every(w => people.includes(w))) s += 4;
      if ((i.genres || []).some(g => g.startsWith(nq))) s += 2;
      return { i, s: s ? s + (i.pop || 0) / 50 : 0 };
    })
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
    .map(x => x.i);
}

export function openSearch(initial = '') {
  if ($('.search-ov')) return;
  let type = 'all';
  const ov = frag(`<div class="search-ov" role="dialog" aria-modal="true" aria-label="Search">
    <div class="search-box">
      <div class="search-field">${ICONS.search}<input type="search" placeholder="Movies, shows, books, people…" aria-label="Search" value="${esc(initial)}" autocomplete="off">
        <button class="icon-btn" data-close aria-label="Close search">${ICONS.x}</button></div>
      <div class="pills" style="margin-top:14px">
        ${[['all', 'All'], ['movie', 'Movies'], ['show', 'Shows'], ['book', 'Books']].map(([k, l]) => `<button class="pill ${k === 'all' ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="search-hint"></div>
    <div class="search-results"></div>
  </div>`);
  document.body.appendChild(ov);
  document.body.classList.add('no-scroll');
  const input = $('input', ov), results = $('.search-results', ov), hint = $('.search-hint', ov);

  const paint = () => {
    const q = input.value;
    const list = search(q, type);
    hint.textContent = q.trim() ? (list.length ? `${list.length} result${list.length === 1 ? '' : 's'}` : 'No matches. Try a title, author, director or actor.') : 'Popular right now';
    results.innerHTML = list.map((it, idx) => card(it).replace('<article class="card"', `<article class="card" style="--i:${Math.min(idx, 20)}"`)).join('');
    wireScrollers(results);
  };
  const close = () => {
    ov.remove();
    if (!$('.modal-root, .lightbox')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
  };
  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && document.activeElement === input) {
      const first = $('.card-link', results);
      if (first) { location.hash = first.getAttribute('href'); }
    }
  };
  input.addEventListener('input', debounce(paint, 120));
  $$('[data-t]', ov).forEach(b => b.onclick = () => {
    type = b.dataset.t;
    $$('[data-t]', ov).forEach(x => x.classList.toggle('on', x === b));
    paint();
  });
  $('[data-close]', ov).onclick = close;
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  paint();
  setTimeout(() => input.focus(), 30);
}
