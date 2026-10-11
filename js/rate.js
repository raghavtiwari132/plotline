// "Mark as watched/read" → rate + review sheet. Saves to the watchlist and,
// when shared, posts to the community reviews.

import { backend } from './backend.js';
import { TYPES } from './config.js';
import { $, esc } from './util.js';
import { openModal, starInput, toast } from './ui.js';
import { wl, markDone, posterOf } from './store.js';
import { openAuth } from './auth.js';

export function openRateModal(item, { onSaved } = {}) {
  const entry = wl(item.id);
  const verb = TYPES[item.type].verb;
  const poster = posterOf(item);
  const { el, close } = openModal(`
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">
      ${poster ? `<img src="${esc(poster)}" alt="" style="width:64px;aspect-ratio:2/3;object-fit:cover;border-radius:10px">` : ''}
      <div><h3 style="margin:0">How was it?</h3><div class="muted">${esc(item.title)}</div></div>
    </div>
    <div data-stars></div>
    <div class="field" style="margin-top:16px">
      <label for="rv-text">Your review <span class="dim">(optional)</span></label>
      <textarea id="rv-text" maxlength="2000" placeholder="What stood out? No spoilers, please.">${esc(entry?.review || '')}</textarea>
    </div>
    <label class="row-gap" style="font-size:14px;color:var(--text-2);margin:4px 0 20px;cursor:pointer">
      <input type="checkbox" data-public checked style="accent-color:#8b7cff;width:18px;height:18px"> Share with the Plotline community
    </label>
    <div class="form-error" role="alert"></div>
    <button class="btn btn-grad" data-save style="width:100%">Save — I've ${verb} it</button>`, { label: `Rate ${item.title}` });

  let rating = entry?.rating || 0;
  starInput($('[data-stars]', el), rating, v => { rating = v; $('.form-error', el).textContent = ''; });

  $('[data-save]', el).onclick = async () => {
    if (!rating) { $('.form-error', el).textContent = 'Tap a star to rate it first.'; return; }
    const text = $('#rv-text', el).value.trim();
    const share = $('[data-public]', el).checked;
    markDone(item.id, { rating, review: text });
    close();
    const post = async () => {
      try {
        await backend.submitReview(item, { rating, text });
        toast(text ? 'Review posted. Thanks!' : 'Rating shared. Thanks!', { icon: true });
      } catch (err) {
        toast(err.message || 'Could not post your review.');
      }
      onSaved?.();
    };
    if (!share) { toast('Saved to your list', { icon: true }); onSaved?.(); return; }
    if (backend.user) post();
    else openAuth({ reason: 'to share your rating with the community', onDone: post });
    onSaved?.();
  };
}
