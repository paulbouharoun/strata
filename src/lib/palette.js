import { artKey, hashColor, mineralize, mix } from './color.js';

/** Raw (un-mineralized) colour for an artist in a given year. */
export function artistColor(artist, year, art) {
  for (const t of year.topTracks) {
    if (t.artist !== artist) continue;
    const c = art[artKey(t.track, t.artist)]?.colors;
    if (c?.length) return c[0];
  }
  return hashColor(artist);
}

/**
 * The stratum's mineral palette: colours from its era's cover art, pushed toward stone.
 * `months` maps each month (0–11) to a lamina colour keyed on that month's top artist.
 */
export function strataPalette(year, art, depthT = 0) {
  const stone = mix('#9a8a72', '#3b3229', depthT);
  const base = [];
  for (const t of year.topTracks.slice(0, 3)) {
    const c = art[artKey(t.track, t.artist)]?.colors;
    if (c?.length) base.push(...c.slice(0, 2));
    else base.push(hashColor(t.artist));
  }
  while (base.length < 3) base.push(hashColor(year.year + ':' + base.length));
  const amount = 0.38 + depthT * 0.22;
  return {
    stone,
    base: base.map((c) => mineralize(c, stone, amount)),
    artists: year.topArtists.map((a) => mineralize(artistColor(a.name, year, art), stone, amount * 0.6)),
    months: year.months.map((m, i) => mineralize(m.top ? artistColor(m.top, year, art) : base[i % base.length], stone, amount + 0.06)),
  };
}

/** Each month's thickness as a fraction of the stratum. Top of the layer = December (younger rock on top). */
export function laminae(year) {
  const total = year.months.reduce((s, m) => s + m.ms, 0) || 1;
  const floor = 0.018;
  const raw = year.months.map((m) => (m.ms ? floor : floor / 3) + m.ms / total);
  const sum = raw.reduce((a, b) => a + b, 0);
  // Order top → bottom: Dec … Jan.
  const out = [];
  let acc = 0;
  for (let m = 11; m >= 0; m--) {
    const f = raw[m] / sum;
    out.push({ month: m, from: acc, to: acc + f });
    acc += f;
  }
  return out;
}
