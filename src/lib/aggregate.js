// Normalized plays → the core sample: one stratum per year, surface (latest) first.
// Only aggregates leave this function — this is also exactly what ships as the public sample.

const STREAM_MS = 30_000; // Spotify counts a "stream" at 30 seconds

/** @param {import('./parse.js').Play[]} plays sorted ascending */
export function aggregate(plays, source = 'unknown') {
  // De-dupe plays that appear in overlapping export files.
  const seen = new Set();
  plays = plays.filter((p) => {
    const k = `${Math.round(p.ts / 60000)}|${p.track}|${p.artist}|${p.n || 1}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const byYear = new Map();
  const firstHeard = new Map(); // artist -> year
  const allArtists = new Set();
  const allTracks = new Set();
  let bedrock = null;
  let estimatedMs = 0;

  for (const p of plays) {
    const d = new Date(p.ts);
    const year = d.getFullYear();
    const month = d.getMonth();
    let y = byYear.get(year);
    if (!y) {
      y = { year, ms: 0, streams: 0, artists: new Map(), tracks: new Map(), months: Array.from({ length: 12 }, () => ({ ms: 0, artists: new Map() })) };
      byYear.set(year, y);
    }
    // A row can stand for several plays (Apple's daily summaries); judge the average play.
    const n = p.n || 1;
    const streams = p.ms / n >= STREAM_MS ? n : 0;
    const stream = streams > 0;
    y.ms += p.ms;
    y.streams += streams;
    if (p.est) estimatedMs += p.ms;

    const a = y.artists.get(p.artist) || { name: p.artist, ms: 0, streams: 0 };
    a.ms += p.ms;
    a.streams += streams;
    y.artists.set(p.artist, a);

    const tk = `${p.track}\u0000${p.artist}`;
    const t = y.tracks.get(tk) || { track: p.track, artist: p.artist, album: p.album, ms: 0, streams: 0, src: p.src, id: p.id };
    if (!t.id && p.id) { t.id = p.id; t.src = p.src; }
    t.ms += p.ms;
    t.streams += streams;
    if (!t.album && p.album) t.album = p.album;
    y.tracks.set(tk, t);

    const m = y.months[month];
    m.ms += p.ms;
    m.artists.set(p.artist, (m.artists.get(p.artist) || 0) + p.ms);

    if (!firstHeard.has(p.artist)) firstHeard.set(p.artist, year);
    allArtists.add(p.artist);
    allTracks.add(tk);
    if (!bedrock && stream) bedrock = p;
  }
  if (!bedrock && plays.length) bedrock = plays[0];

  const years = [...byYear.values()]
    .sort((a, b) => b.year - a.year)
    .map((y) => {
      const artists = [...y.artists.values()].sort((a, b) => b.ms - a.ms);
      const tracks = [...y.tracks.values()].sort((a, b) => b.streams - a.streams || b.ms - a.ms);
      const discoveries = artists.filter((a) => firstHeard.get(a.name) === y.year && a.streams >= 3).slice(0, 5).map((a) => a.name);
      return {
        year: y.year,
        ms: y.ms,
        streams: y.streams,
        artistCount: artists.length,
        topArtists: artists.slice(0, 8).map(({ name, ms, streams }) => ({ name, ms, streams })),
        topTracks: tracks.slice(0, 5).map(({ track, artist, album, ms, streams, src, id }) => ({ track, artist, album, ms, streams, src, id })),
        months: y.months.map((m) => {
          let top = '';
          let best = -1;
          for (const [k, v] of m.artists) if (v > best) { best = v; top = k; }
          return { ms: m.ms, top };
        }),
        discoveries,
      };
    });

  // Depth: hours listened, counted down from the surface (today).
  let depth = 0;
  for (const y of years) {
    y.depthTop = depth;
    depth += y.ms / 3_600_000;
    y.depthBottom = depth;
  }

  return {
    v: 1,
    source,
    range: { start: plays[0]?.ts ?? 0, end: plays[plays.length - 1]?.ts ?? 0 },
    totals: {
      streams: years.reduce((s, y) => s + y.streams, 0),
      hours: depth,
      artists: allArtists.size,
      tracks: allTracks.size,
    },
    years,
    // Over half the depth is guessed when an export (YouTube Music, some Deezer) doesn't record play time.
    estimated: depth > 0 && estimatedMs / 3_600_000 / depth > 0.5,
    bedrock: bedrock && {
      track: bedrock.track,
      artist: bedrock.artist,
      album: bedrock.album,
      ts: bedrock.ts,
      ms: Math.round(bedrock.ms / (bedrock.n || 1)),
      precision: bedrock.day ? 'day' : 'minute',
      src: bedrock.src,
      id: bedrock.id,
      depth,
    },
  };
}
