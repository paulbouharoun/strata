// TIDAL: there's no self-serve download; you email TIDAL support for your data and receive streaming.csv:
//   artist_name, track_title, entry_date (DD/MM/YYYY H:MM), stream_duration_ms, product_type (TRACK|ALBUM|…), …, time_zone (IANA)
// The file may have preamble lines and a BOM before the header.
import { csvObjects, num, primaryArtist, zonedToUtc } from './util.js';

export const name = 'TIDAL';

export const looksLike = (headerText) => /artist_name/i.test(headerText) && /track_title/i.test(headerText) && /entry_date/i.test(headerText);

export function parse(text) {
  const rows = csvObjects(text, (h) => {
    const l = h.map((c) => c.toLowerCase());
    return l.includes('artist_name') && l.includes('track_title') && l.includes('entry_date');
  });
  const out = [];
  for (const raw of rows) {
    const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
    if (r.product_type && r.product_type.trim().toLowerCase() !== 'track') continue;
    const m = (r.entry_date || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!m || !r.track_title || !r.artist_name) continue;
    const tz = (r.time_zone || '').trim();
    const ts = zonedToUtc(+m[3], m[2] - 1, +m[1], +m[4], +m[5], tz && tz.toLowerCase() !== 'null' ? tz : '');
    const ms = num(r.stream_duration_ms);
    out.push({ ts, artist: primaryArtist(r.artist_name), track: r.track_title.trim(), album: '', ms: ms > 0 ? Math.round(ms) : 0 });
  }
  return out;
}
