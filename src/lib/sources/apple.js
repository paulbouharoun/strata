// Apple Music, from privacy.apple.com → "Apple Media Services information" (zip, often with a nested zip inside).
//
// "Apple Music - Play History Daily Tracks.csv" (preferred: it reliably names the artist)
//   Track Description = "Artist - Title", Date Played = YYYYMMDD, Hours = "20, 21", Play Duration Milliseconds, Play Count
// "Apple Music Play Activity.csv" (precise timestamps, but newer exports drop the Artist Name column)
//   Song Name, Album Name, Artist Name | Container Artist Name, Event Start Timestamp, Play Duration Milliseconds, Media Type
import { csvObjects, num } from './util.js';

export const name = 'Apple Music';

export const isDaily = (path) => /Play History Daily Tracks\.csv$/i.test(path);
export const isActivity = (path) => /Play Activity\.csv$/i.test(path);

export function parseDaily(text) {
  const rows = csvObjects(text, (h) => h.includes('Track Description') && h.includes('Date Played'));
  const out = [];
  for (const r of rows) {
    if (/video/i.test(r['Media type'] || r['Media Type'] || '')) continue;
    const desc = (r['Track Description'] || '').trim();
    const cut = desc.indexOf(' - ');
    if (cut < 1) continue;
    const artist = desc.slice(0, cut).trim();
    const track = desc.slice(cut + 3).trim();
    const d = String(r['Date Played'] || '').replace(/\D/g, '');
    if (d.length !== 8) continue;
    const hour = parseInt(String(r['Hours'] || '').split(/[,\s]+/).filter(Boolean)[0], 10);
    const ts = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), Number.isFinite(hour) ? hour : 12).getTime();
    const ms = num(r['Play Duration Milliseconds']);
    if (!(ms > 0)) continue;
    const n = Math.max(1, parseInt(r['Play Count'], 10) || 1);
    out.push({ ts, artist, track, album: '', ms: Math.round(ms), n, day: true });
  }
  return out;
}

export function parseActivity(text) {
  const rows = csvObjects(text, (h) => h.includes('Song Name') && h.includes('Play Duration Milliseconds'));
  const out = [];
  for (const r of rows) {
    if (/video/i.test(r['Media Type'] || '')) continue;
    const track = (r['Song Name'] || '').trim();
    if (!track) continue;
    const ts = Date.parse(r['Event Start Timestamp'] || r['Event End Timestamp'] || r['Event Received Timestamp'] || '');
    const ms = num(r['Play Duration Milliseconds']);
    if (Number.isNaN(ts) || !(ms > 0)) continue;
    const artist = (r['Artist Name'] || r['Container Artist Name'] || '').trim() || 'Unknown artist';
    out.push({ ts, artist, track, album: (r['Album Name'] || '').trim(), ms: Math.round(ms) });
  }
  return out;
}

/**
 * Daily Tracks only know the day. If Play Activity is also present, borrow its exact
 * timestamp (and album) for the earliest stream, so bedrock is dated to the minute.
 */
export function refineFirst(dailyPlays, activityPlays) {
  if (!dailyPlays.length || !activityPlays.length) return;
  const day = (t) => new Date(t).toDateString();
  const firstDay = day(Math.min(...dailyPlays.map((p) => p.ts)));
  // The activity log knows the order of plays within that first day; daily rows don't.
  const sameDay = activityPlays.filter((p) => day(p.ts) === firstDay).sort((a, b) => a.ts - b.ts);
  const pick = sameDay.find((p) => p.ms >= 30_000) || sameDay[0];
  if (!pick) return;
  const row = dailyPlays.find((p) => p.day && day(p.ts) === firstDay && p.track === pick.track);
  if (!row) return;
  // Daily rows are stamped with the hour they started in, which can sort ahead of the true first play.
  for (const p of dailyPlays) if (p.day && p.ts <= pick.ts && day(p.ts) === firstDay) p.ts = pick.ts + 1000;
  // Split the daily row so its earliest play carries the precise time.
  const per = Math.round(row.ms / row.n);
  const precise = { ts: pick.ts, artist: row.artist, track: row.track, album: pick.album, ms: pick.ms || per, n: 1 };
  if (row.n > 1) {
    row.n -= 1;
    row.ms = Math.max(0, row.ms - precise.ms);
    dailyPlays.push(precise);
  } else Object.assign(row, precise, { day: undefined });
}
