// Builds public/globe.json for the sample: the same picking code the browser runs for uploads,
// plus covers/players and artist home towns resolved ahead of time (so the sample makes no lookups).
// Ships only the picks: 3 headlines a season and the track played on each headline's day.
//   node scripts/build-globe.mjs private/paul_spotify_data.zip
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { parseFiles } from '../src/lib/parse.js';
import { buildDays } from '../src/lib/globe/days.js';
import { pickSeasons } from '../src/lib/globe/pick.js';
import { originLookup, km } from '../src/lib/globe/origins.js';
import { resolveMedia } from '../src/lib/media.js';

const [input] = process.argv.slice(2);
const b = readFileSync(input);
const { plays } = await parseFiles([{ name: basename(input), data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }]);
const headlines = JSON.parse(readFileSync(new URL('../public/headlines.json', import.meta.url), 'utf8'));
const data = pickSeasons(buildDays(plays), headlines);

const fetchJson = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'strata-sample-builder' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};
const diskCache = (file) => {
  const url = new URL(file, import.meta.url);
  const all = existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : {};
  return { get: (k) => all[k], set: (k, v) => { all[k] = v; writeFileSync(url, JSON.stringify(all, null, 1)); } };
};
const origin = originLookup({ fetchJson, cache: diskCache('./.origins-cache.json') });
const media = diskCache('./.media-cache.json');

let n = 0;
for (const s of data.seasons)
  for (const h of s.headlines) {
    const nd = h.needle;
    if (!nd || h.grave) continue;
    const k = `${nd.src || 'apple'}:${nd.id || nd.track + '\u0000' + nd.artist}`;
    let m = media.get(k);
    if (m === undefined) {
      m = await resolveMedia({ track: nd.track, artist: nd.artist, src: nd.src, id: nd.id }, { fetchJson }).catch(() => null);
      media.set(k, m);
    }
    if (m) nd.media = { url: m.url, preview: m.preview, embed: m.embed };
    const o = await origin(nd.artist);
    if (o && h.coord) { nd.origin = o; nd.km = km(o.coord, h.coord); }
    process.stdout.write(`\r  ${++n} needles resolved`);
  }

writeFileSync(new URL('../public/globe.json', import.meta.url), JSON.stringify(data));
const all = data.seasons.flatMap((s) => s.headlines);
console.log(`\n${data.seasons.length} seasons, ${all.length} headlines (${all.filter((h) => h.category === 'ai').length} AI, ${all.filter((h) => h.category === 'ml').length} ML), ${all.filter((h) => h.needle?.media?.url).length} covers, ${all.filter((h) => h.needle?.km != null).length} arcs`);
