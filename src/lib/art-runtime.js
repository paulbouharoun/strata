// Browser-side cover-art resolution for uploaded cores: iTunes lookup + canvas colour extraction,
// throttled to stay under iTunes' ~20 requests/minute, cached in localStorage.
import { artKey, paletteFromPixels } from './color.js';
import { thumb } from './itunes.js';
import { resolveMedia } from './media.js';
import { tracksNeedingArt } from './art-targets.js';

const CACHE_KEY = 'strata.media.v1'; // keyed by service + track ID
const loadCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};
const saveCache = (c) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function colorsOf(url) {
  const img = await loadImage(thumb(url, 64));
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 48, 48);
  return paletteFromPixels(ctx.getImageData(0, 0, 48, 48).data);
}

let jsonpSeq = 0;
/** Deezer's API sends no CORS headers but supports JSONP. */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__strataJsonp${++jsonpSeq}`;
    const script = document.createElement('script');
    const done = (fn, v) => {
      delete window[cb];
      script.remove();
      clearTimeout(timer);
      fn(v);
    };
    const timer = setTimeout(() => done(reject, new Error('timeout')), 10_000);
    window[cb] = (data) => done(resolve, data);
    script.onerror = () => done(reject, new Error('jsonp failed'));
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

const net = {
  fetchJson: async (url, opts = {}) => {
    if (opts.jsonp) return jsonp(url);
    const r = await fetch(url);
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
};

/**
 * Resolves covers and previews progressively, each from the service the track was played on.
 * `onArt(key, entry)` fires as each one lands. Returns a cancel function.
 */
export function resolveArt(core, onArt) {
  let cancelled = false;
  const cache = loadCache();
  (async () => {
    let appleCalls = 0;
    for (const t of tracksNeedingArt(core)) {
      if (cancelled) return;
      const k = `${t.src || 'apple'}:${t.id || artKey(t.track, t.artist)}`;
      if (k in cache) {
        if (cache[k]) onArt(artKey(t.track, t.artist), cache[k]);
        continue;
      }
      let entry = null;
      try {
        entry = await resolveMedia(t, net);
        if (entry?.url) entry.colors = await colorsOf(entry.url).catch(() => null);
        cache[k] = entry;
        saveCache(cache);
      } catch (e) {
        if (e.rateLimited) {
          await sleep(60_000);
          continue;
        }
      }
      if (entry && !cancelled) onArt(artKey(t.track, t.artist), entry);
      // iTunes allows ~20 requests a minute: a quick burst, then a polite trickle. Others are lenient.
      const apple = !t.src || t.src === 'apple';
      await sleep(apple ? (++appleCalls < 12 ? 400 : 3200) : 150);
    }
  })();
  return () => (cancelled = true);
}
