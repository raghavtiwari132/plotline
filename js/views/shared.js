// A list someone shared with you: #/list?ids=a,b,c&by=Name

import { $, esc, ICONS } from '../util.js';
import { state, getItem, addToWatchlist } from '../store.js';
import { card, wireScrollers, reveal, toast, syncAddButtons } from '../ui.js';

export function renderShared(root, params) {
  const ids = (params.get('ids') || '').split(',').map(decodeURIComponent).filter(Boolean);
  const items = ids.map(getItem).filter(Boolean);
  const by = (params.get('by') || '').slice(0, 40);
  root.innerHTML = `
    <header class="page-head">
      <div><h1 class="page-title">${by ? `${esc(by)}'s picks` : 'A shared list'}</h1>
        <p class="page-sub">${items.length} title${items.length === 1 ? '' : 's'} someone thinks you'll love.</p></div>
      <div class="row-gap">
        ${items.length ? `<button class="btn btn-primary" data-all>${ICONS.plus}Add all to my list</button>` : ''}
        ${state.prefs?.completedAt ? '' : '<a class="btn btn-glass" href="#/welcome">Get your own picks</a>'}
      </div>
    </header>
    ${items.length
      ? `<div class="search-results" style="padding-top:30px">${items.map((it, i) => card(it).replace('<article class="card"', `<article class="card" style="--i:${Math.min(i, 20)}"`)).join('')}</div>`
      : `<div class="empty"><div class="empty-art">${ICONS.list}</div><h3>This list is empty</h3><p>The link may be incomplete.</p><a class="btn btn-primary" href="#/">Explore Plotline</a></div>`}`;
  $('[data-all]', root)?.addEventListener('click', () => {
    items.forEach(it => { addToWatchlist(it.id); syncAddButtons(it.id); });
    toast(`Added ${items.length} titles to your list`, { icon: true, action: 'View', onAction: () => { location.hash = '#/watchlist'; } });
  });
  wireScrollers(root);
  reveal(root);
}
