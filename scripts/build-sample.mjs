// Builds public/sample.json from a Spotify export: aggregates only (no raw plays, IPs or devices),
// plus pre-resolved cover art and colours so the sample core renders instantly with zero API calls.
// Usage: node scripts/build-sample.mjs path/to/my_spotify_data.zip [--label "Paul's core"]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import jpeg from 'jpeg-js';
import { parseFiles } from '../src/lib/parse.js';
import { aggregate } from '../src/lib/aggregate.js';
import { paletteFromPixels, artKey } from '../src/lib/color.js';
import { findArtwork, thumb } from '../src/lib/itunes.js';
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

const CACHE = new URL('./.art-cache.json', import.meta.url);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const art = {};
for (const { track, artist } of tracksNeedingArt(core)) {
  const k = artKey(track, artist);
  if (!(k in cache)) {
    let url = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        url = await findArtwork(track, artist);
        break;
      } catch (e) {
        if (!e.rateLimited) break;
        console.log('  rate limited, waiting 60s');
        await sleep(60_000);
      }
    }
    let colors = null;
    if (url) {
      const img = await fetch(thumb(url, 64)).then((r) => r.arrayBuffer());
      const { data } = jpeg.decode(Buffer.from(img), { useTArray: true });
      colors = paletteFromPixels(data);
    }
    cache[k] = url ? { url, colors } : null;
    writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    console.log(`  ${url ? '✓' : '✗'} ${artist} — ${track}`);
    await sleep(3200); // iTunes allows ~20 req/min
  }
  if (cache[k]) art[k] = cache[k];
}

writeFileSync(new URL('../public/sample.json', import.meta.url), JSON.stringify({ label, ...core, art }));
console.log('wrote public/sample.json');
