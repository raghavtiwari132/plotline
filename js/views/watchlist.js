// "My list": up next + finished (with your ratings and reviews).

import { TYPES, PROVIDERS, serviceKeys } from '../config.js';
import { $, $$, esc, ICONS, fmtDate, on, plural } from '../util.js';
import { state, getItem, posterOf, isUpcoming, removeFromWatchlist, markWant, region, toggleWatchlist } from '../store.js';
import { stars, toast, openShare, reveal, placeSegThumb, metaLine, badgesFor } from '../ui.js';
import { openRateModal } from '../rate.js';
import { backend } from '../backend.js';

export function renderWatchlist(root, params) {
  let tab = params.get('tab') === 'done' ? 'done' : 'want';
  let filter = ['movie', 'show', 'book'].includes(params.get('f')) ? params.get('f') : 'all';

  const entries = () => Object.entries(state.watchlist)
    .map(([id, e]) => ({ item: getItem(id), e }))
    .filter(x => x.item);

  function paint() {
    const all = entries();
    const want = all.filter(x => x.e.status !== 'done').sort((a, b) => (isUpcoming(a.item) - isUpcoming(b.item)) || b.e.addedAt - a.e.addedAt);
    const done = all.filter(x => x.e.status === 'done').sort((a, b) => (b.e.finishedAt || 0) - (a.e.finishedAt || 0));
    const list = (tab === 'done' ? done : want).filter(x => filter === 'all' || x.item.type === filter);

    root.innerHTML = `
      <header class="page-head">
        <div><h1 class="page-title">My list</h1>
          <p class="page-sub">${plural(want.length, 'title')} up next · ${done.length} finished${backend.user ? '' : ' · saved in this browser'}</p></div>
        ${all.length ? `<button class="btn btn-glass" data-share-list>${ICONS.share}Share my list</button>` : ''}
      </header>
      <div class="wl-bar">
        <div class="seg big" data-tabs><span class="seg-thumb"></span>
          <button class="${tab === 'want' ? 'on' : ''}" data-tab="want">Up next · ${want.length}</button>
          <button class="${tab === 'done' ? 'on' : ''}" data-tab="done">Finished · ${done.length}</button></div>
        <div class="pills">${[['all', 'All'], ['movie', 'Movies'], ['show', 'Shows'], ['book', 'Books']].map(([k, l]) =>
          `<button class="pill ${filter === k ? 'on' : ''}" data-f="${k}">${k !== 'all' ? `<span class="dot" style="--c:var(--${k})"></span>` : ''}${l}</button>`).join('')}</div>
      </div>
      ${list.length ? `<div class="wl-grid">${list.map((x, i) => wlCard(x, i)).join('')}</div>` : emptyState(tab, all.length)}`;

    const seg = $('[data-tabs]', root);
    requestAnimationFrame(() => placeSegThumb(seg));
    $$('[data-tab]', root).forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, '', `#/watchlist${tab === 'done' ? '?tab=done' : ''}`); paint(); });
    $$('[data-f]', root).forEach(b => b.onclick = () => { filter = b.dataset.f; paint(); });
    $('[data-share-list]', root)?.addEventListener('click', shareList);
    reveal(root);
  }

  function wlCard({ item, e }, i) {
    const src = posterOf(item);
    const upcoming = isUpcoming(item);
    const svc = serviceKeys(item, region()).map(k => PROVIDERS[k]?.name).filter(Boolean)[0];
    const verb = TYPES[item.type].verb;
    const info = e.status === 'done'
      ? `<div>${e.rating ? stars(e.rating, 15) : '<span class="dim">Not rated</span>'}</div>
         ${e.review ? `<div class="wl-review">“${esc(e.review)}”</div>` : `<div class="dim" style="font-size:13px">No review yet</div>`}`
      : `<div class="wl-meta">${upcoming ? `${ICONS.bell.replace('<svg', '<svg style="width:14px;height:14px"')} Arrives ${esc(fmtDate(item.released))}` : svc ? `On ${esc(svc)}` : item.type === 'book' ? `${item.pages ? item.pages + ' pages' : 'Book'}` : 'Rent or stream'}</div>`;
    const actions = e.status === 'done'
      ? `<button class="btn btn-sm btn-glass" data-rate="${item.id}">${ICONS.edit}${e.rating ? 'Edit review' : 'Rate it'}</button>
         <button class="btn btn-sm btn-ghost" data-back="${item.id}">Watch again</button>`
      : `${upcoming ? '' : `<button class="btn btn-sm btn-glass" data-rate="${item.id}">${ICONS.check}Mark as ${verb}</button>`}
         <button class="btn btn-sm btn-ghost" data-remove="${item.id}" aria-label="Remove ${esc(item.title)}">${ICONS.trash}Remove</button>`;
    return `<article class="wl-card reveal" data-type="${item.type}" data-id="${item.id}" style="--i:${Math.min(i, 8)}">
      <a href="#/title/${item.id}" class="card-media ${src ? '' : 'noimg'}"><div class="card-badges">${badgesFor(item)}</div>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}<div class="card-ph">${esc(item.title)}</div></a>
      <div class="wl-body">
        <a href="#/title/${item.id}" class="wl-title">${esc(item.title)}</a>
        <div class="wl-meta"><span class="type-dot" style="--tc:var(--${item.type})"></span>${esc(metaLine(item))}</div>
        ${info}
        <div class="wl-actions">${actions}</div>
      </div></article>`;
  }

  function emptyState(which, total) {
    if (which === 'done') {
      return `<div class="empty"><div class="empty-art">${ICONS.star}</div><h3>Nothing finished yet</h3>
        <p>When you finish something on your list, mark it as watched or read to rate it and share a review.</p></div>`;
    }
    return `<div class="empty"><div class="empty-art">${ICONS.list}</div><h3>${total ? 'All caught up' : 'Your list is empty'}</h3>
      <p>Tap the + on anything that looks good and it will wait for you here.</p><a class="btn btn-primary" href="#/">Find something</a></div>`;
  }

  function shareList() {
    const ids = Object.keys(state.watchlist).slice(0, 40);
    const by = backend.user?.name?.split(' ')[0] || '';
    const url = `${location.origin}${location.pathname}#/list?ids=${ids.map(encodeURIComponent).join(',')}${by ? `&by=${encodeURIComponent(by)}` : ''}`;
    const first = getItem(ids[0]);
    openShare(first, { url, heading: 'Share your list', text: `${by ? by + "'s" : 'My'} watch & read list on Plotline:` });
  }

  root.addEventListener('click', ev => {
    const rate = ev.target.closest('[data-rate]');
    if (rate) { openRateModal(getItem(rate.dataset.rate), { onSaved: paint }); return; }
    const rm = ev.target.closest('[data-remove]');
    if (rm) {
      const id = rm.dataset.remove;
      const cardEl = rm.closest('.wl-card');
      cardEl.classList.add('leaving');
      setTimeout(() => {
        removeFromWatchlist(id);
        toast('Removed from your list', { action: 'Undo', onAction: () => toggleWatchlist(id) });
      }, 320);
      return;
    }
    const back = ev.target.closest('[data-back]');
    if (back) { markWant(back.dataset.back); toast('Moved back to Up next'); }
  });

  const off = on('watchlist', paint);
  const offAuth = on('auth', paint);
  paint();
  return () => { off(); offAuth(); };
}
