// Parses each fixture and compares it with the Spotify ground truth for the same period.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseFiles } from '../src/lib/parse.js';
import { aggregate } from '../src/lib/aggregate.js';

const load = (p) => { const b = readFileSync(p); return { name: basename(p), data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const truth = (await parseFiles([load('synthetic/my_spotify_data.zip')])).plays;
const cases = [
  ['Deezer', ['synthetic/deezer-data_123456.xlsx'], [2015, 2019]],
  ['Apple', ['synthetic/Apple Media Services information.zip'], [2019, 2023]],
  ['YouTube (html)', ['synthetic/takeout-20261124T000000Z-001.zip'], [2022, 2025]],
  ['YouTube (json)', ['synthetic/watch-history.json'], [2022, 2025]],
  ['TIDAL', ['synthetic/streaming.csv'], [2024.5, 2027]],
];
let fail = 0;
for (const [label, files, [y0, y1]] of cases) {
  const t0 = performance.now();
  const { plays, source } = await parseFiles(files.map(load));
  const core = aggregate(plays, source);
  const from = Date.UTC(Math.floor(y0), (y0 % 1) * 12), to = Date.UTC(y1, 0);
  const slice = truth.filter((p) => p.ts >= from && p.ts < to);
  const ref = aggregate(slice, 'Spotify');
  // Exports without play durations can't tell a skip from a stream: their bedrock is simply the first play.
  if (core.estimated) Object.assign(ref.bedrock, { track: slice[0].track, artist: slice[0].artist, ts: slice[0].ts });
  const firstOk = core.bedrock.track === ref.bedrock.track && core.bedrock.artist === ref.bedrock.artist;
  const dt = Math.abs(core.bedrock.ts - ref.bedrock.ts);
  const topOk = core.years.every((y, i) => y.topArtists[0]?.name === ref.years[i]?.topArtists[0]?.name);
  const streamsRatio = core.totals.streams / ref.totals.streams;
  const ok = firstOk && topOk && streamsRatio > 0.85 && streamsRatio < 1.2 && (core.bedrock.precision === 'day' || dt < 60_000);
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(15)} ${source.padEnd(14)} ${plays.length} plays, ${core.years.length} strata, streams ×${streamsRatio.toFixed(2)}, hours ${core.totals.hours.toFixed(0)} vs ${ref.totals.hours.toFixed(0)}${core.estimated ? ' (est.)' : ''}, bedrock "${core.bedrock.track}" ${firstOk ? 'ok' : '≠ ' + ref.bedrock.track} Δ${Math.round(dt / 1000)}s ${core.bedrock.precision}, top artists ${topOk ? 'match' : 'DIFFER'} · ${Math.round(performance.now() - t0)}ms`);
}
// Merging services: Spotify + Deezer + TIDAL in one drop.
const merged = await parseFiles([load('synthetic/my_spotify_data.zip'), load('synthetic/deezer-data_123456.xlsx'), load('synthetic/streaming.csv')]);
const mc = aggregate(merged.plays, merged.source);
console.log(`merge: ${merged.source}, ${mc.years.length} strata, bedrock ${mc.bedrock.track} ${new Date(mc.bedrock.ts).toISOString()}`);
process.exit(fail ? 1 : 0);
