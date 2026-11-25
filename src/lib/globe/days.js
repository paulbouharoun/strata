// Per-day and per-season listening, from normalized plays. Runs in the parse worker for uploads
// and in the Node sample script. Stays in memory: nothing here is uploaded.
//   days["2020-08-04"] = { min, streams, top: { track, artist, album, src, id, at } }
//   seasons["2020-Q3"] = { year, q, name, months, hours, streams, artists: [3 top artists] }

const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'];
const RANGES = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** @param {import('../parse.js').Play[]} plays */
export function buildDays(plays) {
  const days = new Map();
  const seasons = new Map();
  for (const p of plays) {
    const n = p.n || 1;
    if (p.ms / n < 30_000) continue; // streams only
    const k = dayKey(p.ts);
    const d = days.get(k) || { ms: 0, n: 0, tracks: new Map() };
    d.ms += p.ms;
    d.n += n;
    const tk = p.track + '\u0000' + p.artist;
    const t = d.tracks.get(tk) || { track: p.track, artist: p.artist, album: p.album, src: p.src, id: p.id, ms: 0, first: p.ts };
    t.ms += p.ms;
    if (!t.id && p.id) t.id = p.id;
    d.tracks.set(tk, t);
    days.set(k, d);

    const dt = new Date(p.ts);
    const sk = `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`;
    const s = seasons.get(sk) || { ms: 0, n: 0, artists: new Map() };
    s.ms += p.ms;
    s.n += n;
    s.artists.set(p.artist, (s.artists.get(p.artist) || 0) + p.ms);
    seasons.set(sk, s);
  }

  const outDays = {};
  for (const [k, d] of days) {
    const top = [...d.tracks.values()].sort((a, b) => b.ms - a.ms)[0];
    const at = new Date(top.first);
    outDays[k] = {
      min: Math.round(d.ms / 60000),
      streams: d.n,
      top: { track: top.track, artist: top.artist, album: top.album, src: top.src, id: top.id, at: `${pad(at.getHours())}:${pad(at.getMinutes())}` },
    };
  }
  const outSeasons = {};
  for (const [k, s] of seasons) {
    const [y, q] = k.split('-Q').map(Number);
    outSeasons[k] = {
      year: y,
      q,
      name: SEASONS[q - 1],
      months: RANGES[q - 1],
      hours: Math.round(s.ms / 3_600_000),
      streams: s.n,
      artists: [...s.artists].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    };
  }
  return { days: outDays, seasons: outSeasons };
}
