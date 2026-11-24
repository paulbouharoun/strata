// Browser-side cover-art resolution for uploaded cores: iTunes lookup + canvas colour extraction,
// throttled to stay under iTunes' ~20 requests/minute, cached in localStorage.
import { artKey, paletteFromPixels } from './color.js';
import { findArtwork, thumb } from './itunes.js';
import { tracksNeedingArt } from './art-targets.js';

const CACHE_KEY = 'strata.art.v1';
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

/**
 * Resolves art progressively. `onArt(key, entry)` fires as each cover lands.
 * Returns a cancel function.
 */
export function resolveArt(core, onArt) {
  let cancelled = false;
  const cache = loadCache();
  (async () => {
    let sent = 0;
    for (const { track, artist } of tracksNeedingArt(core)) {
      if (cancelled) return;
      const k = artKey(track, artist);
      if (k in cache) {
        if (cache[k]) onArt(k, cache[k]);
        continue;
      }
      let entry = null;
      try {
        const url = await findArtwork(track, artist);
        if (url) entry = { url, colors: await colorsOf(url).catch(() => null) };
        cache[k] = entry;
        saveCache(cache);
      } catch (e) {
        if (e.rateLimited) {
          await sleep(60_000);
          continue;
        }
      }
      if (entry && !cancelled) onArt(k, entry);
      // A quick burst first so the surface fills fast, then a polite trickle.
      await sleep(++sent < 16 ? 350 : 3200);
    }
  })();
  return () => (cancelled = true);
}
