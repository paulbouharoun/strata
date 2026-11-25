// Where an artist comes from: MusicBrainz (open, keyless, ~1 request/second) → area → Wikidata coordinates.
// Shared by the browser (cached in localStorage) and the Node sample script (cached on disk).

const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Great-circle distance in km between [lat, lon] pairs. */
export function km([la1, lo1], [la2, lo2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(la2 - la1) / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(r(lo2 - lo1) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)));
}

/**
 * @param {{ fetchJson: (url: string) => Promise<any>, cache: { get(k: string): any, set(k: string, v: any): void } }} io
 */
export function originLookup(io) {
  let last = 0;
  let chain = Promise.resolve();
  // MusicBrainz asks for at most one request a second: serialize every call through one queue.
  const mb = (url) =>
    (chain = chain.then(async () => {
      const wait = 1100 - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      return io.fetchJson(url).catch(() => null);
    }));

  async function areaCoord(areaId) {
    const a = await mb(`https://musicbrainz.org/ws/2/area/${areaId}?inc=url-rels&fmt=json`);
    const wd = a?.relations?.find((r) => r.type === 'wikidata')?.url?.resource?.split('/').pop();
    if (!wd) return null;
    const w = await io.fetchJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wd}&props=claims&format=json&origin=*`).catch(() => null);
    const c = w?.entities?.[wd]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    return c ? [+c.latitude.toFixed(2), +c.longitude.toFixed(2)] : null;
  }

  const pending = new Map();
  return function origin(artist) {
    const cached = io.cache.get(artist);
    if (cached !== undefined) return Promise.resolve(cached);
    if (pending.has(artist)) return pending.get(artist);
    const p = (async () => {
      const s = await mb(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${artist}"`)}&fmt=json&limit=5`);
      const hit = (s?.artists || []).find((a) => norm(a.name) === norm(artist) && a.score >= 90);
      let result = null;
      if (hit) {
        for (const area of [hit['begin-area'], hit.area].filter(Boolean)) {
          const coord = await areaCoord(area.id);
          if (coord) { result = { place: area.name, coord }; break; }
        }
      }
      if (s) io.cache.set(artist, result); // don't cache network failures
      pending.delete(artist);
      return result;
    })();
    pending.set(artist, p);
    return p;
  };
}
