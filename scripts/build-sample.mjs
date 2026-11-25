// Builds public/sample.json from a Spotify export: aggregates only (no raw plays, IPs or devices),
// plus pre-resolved cover art and colours so the sample core renders instantly with zero API calls.
// Usage: node scripts/build-sample.mjs path/to/my_spotify_data.zip [--label "Paul's core"]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import jpeg from 'jpeg-js';
import { parseFiles } from '../src/lib/parse.js';
import { aggregate } from '../src/lib/aggregate.js';
import { paletteFromPixels, artKey } from '../src/lib/color.js';
import { thumb } from '../src/lib/itunes.js';
import { resolveMedia } from '../src/lib/media.js';
import { tracksNeedingArt } from '../src/lib/art-targets.js';

const [input, ...rest] = process.argv.slice(2);
if (!input) {
  console.error('usage: node scripts/build-sample.mjs <export.zip | file.json ...> [--label "..."]');
  process.exit(1);
}
const labelIdx = rest.indexOf('--label');
const label = labelIdx >= 0 ? rest[labelIdx + 1] : 'A sample life';
const inputs = [input, ...rest.filter((r, i) => i !== labelIdx && i !== labelIdx + 1)];

const files = inputs.map((p) => {
  const b = readFileSync(p);
  return { name: basename(p), data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
});
const { plays, source } = await parseFiles(files, (m) => console.log('·', m));
const core = aggregate(plays, source);
console.log(`${plays.length} plays → ${core.years.length} strata, ${core.totals.hours.toFixed(0)} h`);

const CACHE = new URL('./.media-cache.json', import.meta.url);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const net = {
  // Node has no CORS, so Deezer's JSONP is just JSON here.
  fetchJson: async (url) => {
    const r = await fetch(url, { headers: { 'User-Agent': 'strata-sample-builder' } });
    if (r.status === 403 || r.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
};

async function colorsOf(url) {
  const img = await fetch(thumb(url, 64)).then((r) => r.arrayBuffer());
  const { data } = jpeg.decode(Buffer.from(img), { useTArray: true, maxMemoryUsageInMB: 64 });
  return paletteFromPixels(data);
}

const art = {};
for (const t of tracksNeedingArt(core)) {
  const k = `${t.src || 'apple'}:${t.id || artKey(t.track, t.artist)}`;
  if (!(k in cache)) {
    let m = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        m = await resolveMedia(t, net);
        break;
      } catch (e) {
        if (!e.rateLimited) break;
        console.log('  rate limited, waiting 60s');
        await sleep(60_000);
      }
    }
    if (m?.url) m.colors = await colorsOf(m.url).catch(() => null);
    cache[k] = m;
    writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    const how = m?.preview ? 'clip' : m?.embed ? `${m.embed.kind} player` : 'no preview';
    console.log(`  ${m?.url ? '✓' : '✗'} ${t.artist} — ${t.track} (${t.src || '?'}, ${how})`);
    await sleep(!t.src || t.src === 'apple' ? 3200 : 300);
  }
  if (cache[k]) art[artKey(t.track, t.artist)] = cache[k];
}

writeFileSync(new URL('../public/sample.json', import.meta.url), JSON.stringify({ label, ...core, art }));
console.log('wrote public/sample.json');
