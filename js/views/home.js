// Home: billboard + Netflix-style rows.

import { GENRES, TYPES, PROVIDERS, REGION_SERVICES, REGIONS, serviceKeys, LANGS } from '../config.js';
import { $, $$, esc, ICONS, fmtDate, daysFromToday, relTime, reducedMotion, storage, plural } from '../util.js';
import { state, posterOf, backdropOf, isUpcoming, isRecent, addedSinceLastVisit, region, releaseISO, seasonSoon } from '../store.js';
import { row, card, wireScrollers, reveal, addButton, provLogo, toast, magnetic, typeLabel } from '../ui.js';
import { recommend, becauseYouLoved, mediumAllows, matchScore } from '../recommend.js';
import { backend } from '../backend.js';

const FILTERS = [['all', 'For you'], ['movie', 'Movies'], ['show', 'Shows'], ['book', 'Books']];

export function renderHome(root, params) {
  const prefs = state.prefs || {};
  const filter = FILTERS.some(f => f[0] === params.get('f')) ? params.get('f') : 'all';
  const fits = it => (filter === 'all' ? mediumAllows(it) : it.type === filter);
  const recs = recommend({ limit: 40, type: filter === 'all' ? null : filter });
  const recRank = new Map(recs.map((r, i) => [r.item.id, i]));
  const pool = state.items.filter(fits);

  // ── Billboard: top picks that have artwork ──
  const heroes = recs.filter(r => backdropOf(r.item) || posterOf(r.item)).slice(0, 5);

  // ── Rows ──
  const rowsHTML = [];
  const used = new Set();
  const take = (list, n) => list.slice(0, n);

  rowsHTML.push(row({ title: 'Top picks for you', sub: 'Updated as you rate', items: take(recs.slice(heroes.length ? 1 : 0).map(r => r.item), 20) }));

  const newSince = pool.filter(addedSinceLastVisit).sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  if (newSince.length) rowsHTML.push(row({ title: 'New since your last visit', sub: 'Added automatically', items: take(newSince, 16), kind: 'wide', id: 'new-row' }));

  becauseYouLoved(2).forEach(({ seed, items }) => {
    const list = items.filter(fits);
    if (list.length >= 4) rowsHTML.push(row({ title: `Because you loved ${seed.title}`, items: take(list, 14) }));
  });

  const trending = pool.filter(i => !isUpcoming(i)).sort((a, b) => (b.pop || 0) - (a.pop || 0));
  rowsHTML.push(row({ title: filter === 'all' ? 'Top 10 right now' : `Top 10 ${TYPES[filter].plural.toLowerCase()} right now`, sub: 'Ranked by what people are looking up this month', items: take(trending, 10), kind: 'rank' }));

  const recent = pool.filter(i => isRecent(i, 200)).sort((a, b) => releaseISO(b).localeCompare(releaseISO(a)));
  rowsHTML.push(row({ title: 'Recent releases', sub: 'Out in the last few months', items: take(recent, 20) }));

  // Upcoming releases plus new seasons of shows that are on the way.
  const soonDate = i => (isUpcoming(i) ? i.released : i.nextSeason.date);
  const soon = pool.filter(i => isUpcoming(i) || seasonSoon(i)).sort((a, b) => soonDate(a).localeCompare(soonDate(b)));
  if (soon.length) rowsHTML.push(row({
    title: 'Coming soon', sub: 'Add one to get it on your radar', items: take(soon, 16), kind: 'wide',
    subFor: i => (isUpcoming(i) ? `${typeLabel(i)} · ${fmtDate(i.released, { month: 'short', day: 'numeric' })}` : `Season ${i.nextSeason.number || ''} · ${fmtDate(i.nextSeason.date, { month: 'short', day: 'numeric' })}`),
  }));

  const whereSlot = filter !== 'book' && prefs.medium !== 'book' ? '<div data-where></div>' : '';
  rowsHTML.push(whereSlot);

  rowsHTML.push('<div data-community></div>');

  if (filter === 'all' && prefs.medium === 'both') {
    const pairs = state.items.filter(i => i.type === 'book' && i.pair && state.byId.get(i.pair));
    if (pairs.length >= 4) rowsHTML.push(row({ title: 'Read it, then watch it', sub: 'Books with screen adaptations', items: pairs }));
    const books = recommend({ limit: 16, type: 'book' }).map(r => r.item);
    rowsHTML.push(row({ title: 'Books you will devour', items: books }));
  }

  const acclaimed = pool.filter(i => !isUpcoming(i) && ((i.imdb || 0) >= 8.5 || (i.olRating || 0) >= 4.3))
    .sort((a, b) => ((b.imdb || b.olRating * 2) || 0) - ((a.imdb || a.olRating * 2) || 0));
  rowsHTML.push(row({ title: 'Critically acclaimed', sub: 'IMDb 8.5+ and top-rated reads', items: take(acclaimed, 18) }));

  (prefs.genres || []).slice(0, 3).forEach(g => {
    const list = pool.filter(i => (i.genres || []).includes(g) && !isUpcoming(i))
      .sort((a, b) => (recRank.get(a.id) ?? 999) - (recRank.get(b.id) ?? 999) || (b.pop || 0) - (a.pop || 0));
    if (list.length >= 4) rowsHTML.push(row({ title: `${GENRES[g]?.[0] || g} for you`, items: take(list, 16) }));
  });

  const intl = pool.filter(i => i.lang && i.lang !== 'en' && !isUpcoming(i));
  if (prefs.intl !== false && intl.length >= 4) rowsHTML.push(row({ title: 'Around the world', sub: 'Subtitled & translated favorites', items: take(intl.sort((a, b) => (b.pop || 0) - (a.pop || 0)), 16) }));

  root.innerHTML = `
    ${heroes.length ? billboard(heroes) : '<div class="spacer-header"></div>'}
    <div class="filter-bar">
      <div class="pills" role="tablist" aria-label="Filter">
        ${FILTERS.map(([k, l]) => `<a class="pill ${filter === k ? 'on' : ''}" role="tab" aria-selected="${filter === k}" href="#/${k === 'all' ? '' : '?f=' + k}">${k !== 'all' ? `<span class="dot" style="--c:var(--${k})"></span>` : ''}${l}</a>`).join('')}
      </div>
    </div>
    <div class="rows">${rowsHTML.join('')}</div>
    <footer class="footer">
      <span>Plotline · Catalog ${state.generatedAt ? `updated ${relTime(Date.parse(state.generatedAt))}` : 'loaded'} · ${state.items.length} titles</span>
      <span>Data: <a href="https://www.wikipedia.org" target="_blank" rel="noopener">Wikipedia</a> & <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (CC BY-SA), <a href="https://openlibrary.org" target="_blank" rel="noopener">Open Library</a>, trailers via YouTube</span>
    </footer>`;

  if (whereSlot) renderWhere($('[data-where]', root), pool, recRank);
  renderCommunity($('[data-community]', root), pool);
  wireScrollers(root);
  reveal(root);
  magnetic(root);

  const disposeHero = heroes.length ? wireBillboard($('.billboard', root)) : null;

  // Let people know when new releases have landed since they were last here.
  if (newSince.length && !sessionStorage.getItem('plotline:notified')) {
    sessionStorage.setItem('plotline:notified', '1');
    const matching = newSince.filter(i => matchScore(i) > 3).length;
    setTimeout(() => toast(`${plural(newSince.length, 'new release')} added since your last visit${matching ? ` · ${matching} match your taste` : ''}`, {
      action: 'See them', duration: 7000, onAction: () => $('#new-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    }), 1200);
  }

  return () => disposeHero?.();
}

// ─────────────────────────── Billboard ───────────────────────────
function billboard(heroes) {
  return `<section class="billboard" aria-roledescription="carousel" aria-label="Featured picks">
    ${heroes.map(({ item, reason }, i) => {
      const bd = backdropOf(item), po = posterOf(item);
      const meta = [
        item.year && !isUpcoming(item) ? item.year : (item.released ? fmtDate(item.released) : ''),
        typeLabel(item),
        (item.genres || []).slice(0, 2).map(g => GENRES[g]?.[0]).filter(Boolean).join(', '),
        item.imdb ? `<span class="row-gap" style="gap:6px"><span class="imdb-badge">IMDb</span>${item.imdb.toFixed(1)}</span>` : item.olRating ? `★ ${item.olRating.toFixed(1)}` : '',
        item.lang && item.lang !== 'en' ? LANGS[item.lang] || '' : '',
      ].filter(Boolean);
      return `<div class="bb-slide ${i === 0 ? 'active' : ''}" data-i="${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${heroes.length}">
        <div class="bb-bg ${bd ? '' : 'poster-blur'}" style="background-image:url('${esc(bd || po)}')"></div>
        ${po ? `<div class="bb-poster"><img src="${esc(po)}" alt=""></div>` : ''}
        <div class="bb-shade"></div>
        <div class="bb-content">
          <div class="bb-kicker"><span class="type-dot" style="--tc:var(--${item.type})"></span>${esc(reason)}</div>
          <h1 class="bb-title">${esc(item.title)}</h1>
          <div class="bb-meta">${meta.map(m => `<span>${typeof m === 'string' && m.startsWith('<') ? m : esc(m)}</span>`).join('<span class="dim">·</span>')}</div>
          <p class="bb-desc">${esc(item.synopsis || '')}</p>
          <div class="bb-actions">
            ${item.trailer ? `<button class="btn btn-primary" data-trailer="${item.trailer}" data-title="${esc(item.title)}" data-magnetic>${ICONS.play}Trailer</button>` : ''}
            <a class="btn ${item.trailer ? 'btn-glass' : 'btn-primary'}" href="#/title/${item.id}">${ICONS.info}More info</a>
            ${addButton(item, { big: true })}
          </div>
        </div>
      </div>`;
    }).join('')}
    ${heroes.length > 1 ? `<div class="bb-dots" role="tablist">${heroes.map((h, i) => `<button class="bb-dot ${i === 0 ? 'active' : ''}" data-go="${i}" role="tab" aria-label="Show ${esc(h.item.title)}"><i></i></button>`).join('')}</div>` : ''}
  </section>`;
}

function wireBillboard(bb) {
  const slides = $$('.bb-slide', bb), dots = $$('.bb-dot', bb);
  const DUR = 8000;
  let i = 0, timer = null, paused = false;
  bb.style.setProperty('--dur', `${DUR}ms`);
  const go = n => {
    i = (n + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('active', k === i));
    dots.forEach((d, k) => {
      d.classList.toggle('active', k === i);
      const bar = d.querySelector('i');
      bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
    });
    schedule();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (slides.length > 1 && !paused && !reducedMotion()) timer = setTimeout(() => go(i + 1), DUR);
  };
  dots.forEach(d => d.onclick = () => go(+d.dataset.go));
  bb.addEventListener('pointerenter', () => { paused = true; bb.classList.add('paused'); clearTimeout(timer); });
  bb.addEventListener('pointerleave', () => { paused = false; bb.classList.remove('paused'); schedule(); });

  // Apple-style scroll: content lifts and fades, backdrop eases back.
  const onScroll = () => {
    const y = Math.min(scrollY, innerHeight);
    const p = y / innerHeight;
    bb.style.setProperty('--p', p);
    const active = slides[i];
    const content = active.querySelector('.bb-content');
    const bg = active.querySelector('.bb-bg');
    content.style.translate = `0 ${-y * 0.25}px`;
    content.style.opacity = String(1 - p * 1.4);
    bg.style.translate = `0 ${y * 0.35}px`;
  };
  if (!reducedMotion()) addEventListener('scroll', onScroll, { passive: true });
  const onVis = () => { if (document.hidden) clearTimeout(timer); else schedule(); };
  document.addEventListener('visibilitychange', onVis);
  schedule();
  return () => {
    clearTimeout(timer);
    removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVis);
  };
}

// ─────────────────────────── Where to watch ───────────────────────────
function renderWhere(slot, pool, recRank) {
  const reg = region();
  const mine = state.prefs?.services || [];
  const screen = pool.filter(i => i.type !== 'book' && !isUpcoming(i));
  const byService = {};
  screen.forEach(it => serviceKeys(it, reg).forEach(k => (byService[k] = byService[k] || []).push(it)));
  const order = [...new Set([...mine, ...(REGION_SERVICES[reg] || []), ...Object.keys(byService)])].filter(k => byService[k]?.length && PROVIDERS[k]);
  if (!order.length) return;
  let current = order.find(k => mine.includes(k)) || order[0];

  slot.outerHTML = `<section class="where reveal" data-where-live>
    <div class="where-head">
      <div><div class="row-sub" style="margin-bottom:6px">${ICONS.globe.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:6px"')}Showing availability in ${esc(REGIONS[reg] || 'your region')}</div>
      <h2>Where to watch</h2></div>
      <div class="prov-tabs" role="tablist">${order.map(k => `<button class="prov-tab ${k === current ? 'on' : ''}" data-k="${k}" role="tab" aria-selected="${k === current}">${provLogo(PROVIDERS[k])}${esc(PROVIDERS[k].name)}<span class="count">${byService[k].length}</span></button>`).join('')}</div>
    </div>
    <div class="scroller-wrap"><button class="scroll-btn prev" aria-label="Scroll left" hidden>${ICONS.chevL}</button><div class="scroller"></div><button class="scroll-btn next" aria-label="Scroll right">${ICONS.chevR}</button></div>
  </section>`;
  const sec = $('[data-where-live]');
  const sc = $('.scroller', sec);
  const paint = () => {
    const list = [...byService[current]].sort((a, b) => (recRank.get(a.id) ?? 999) - (recRank.get(b.id) ?? 999) || (b.pop || 0) - (a.pop || 0));
    sc.style.opacity = '0';
    setTimeout(() => {
      sc.innerHTML = list.map(it => card(it)).join('');
      sc.scrollLeft = 0;
      sc.style.transition = 'opacity .5s var(--ease)';
      sc.style.opacity = '1';
      sc.dispatchEvent(new Event('scroll'));
    }, 160);
  };
  $$('.prov-tab', sec).forEach(b => b.onclick = () => {
    current = b.dataset.k;
    $$('.prov-tab', sec).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    paint();
  });
  paint();
  wireScrollers(sec);
  reveal(sec);
}

// ─────────────────────────── Community ───────────────────────────
async function renderCommunity(slot, pool) {
  try {
    const candidates = pool.filter(i => !isUpcoming(i));
    const ratings = await backend.communityRatings(candidates);
    const minVotes = backend.mode === 'demo' ? 40 : 1;
    const top = ratings.filter(r => r.count >= minVotes).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 16)
      .map(r => state.byId.get(r.id)).filter(Boolean);
    if (!slot.isConnected || top.length < 4) return slot.remove();
    const html = row({
      title: 'Loved by the Plotline community',
      sub: backend.mode === 'demo' ? 'Sample ratings (demo mode)' : 'Highest rated by people here',
      items: top,
    });
    slot.outerHTML = html;
    const sec = [...$$('.row')].find(r => r.querySelector('.row-title')?.textContent.startsWith('Loved by'));
    if (sec) { wireScrollers(sec); reveal(sec); }
  } catch (err) {
    console.warn('Community ratings unavailable', err);
    slot.remove();
  }
}
