// YouTube Music, from Google Takeout → "YouTube and YouTube Music" → history/watch-history.(json|html).
// JSON: [{ header: "YouTube Music", title: "Watched Song", subtitles: [{ name: "Artist - Topic" }], time: ISO }]
// HTML (Takeout's default): one "outer-cell" per entry: header, then "Watched <a>Song</a><br><a>Artist - Topic</a><br>Date".
// Takeout records no play duration, so each play is estimated at 3.5 minutes.
import { decodeEntities } from './util.js';

export const name = 'YouTube Music';

const ESTIMATE_MS = 210_000;
const VERB = /^(Watched|Listened to|A regardé|A écouté|Visto|Has visto|Angesehen|Assistiu|Hai guardato|Bekeken|Обнаружено|Просмотрено)\s+/i;
const videoId = (url) => String(url || '').match(/[?&]v=([\w-]{11})/)?.[1];
const cleanArtist = (s) => s.replace(/\s+-\s+Topic$/i, '').replace(/VEVO$/i, '').trim();

export const looksLikeJson = (first) => first && typeof first === 'object' && 'header' in first && 'time' in first;
export const looksLikeHtml = (text) => /class="(?:outer|content)-cell/.test(text) && /YouTube Music/.test(text);

export function parseJson(entries) {
  const out = [];
  for (const e of entries) {
    const isMusic = e.header === 'YouTube Music' || (Array.isArray(e.products) && e.products.includes('YouTube Music'));
    if (!isMusic || !e.subtitles?.[0]?.name || !e.title) continue;
    const ts = Date.parse(e.time);
    if (Number.isNaN(ts)) continue;
    out.push({ ts, artist: cleanArtist(e.subtitles[0].name), track: e.title.replace(VERB, '').trim(), album: '', ms: ESTIMATE_MS, est: true, src: 'youtube', id: videoId(e.titleUrl) });
  }
  return out;
}

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "Nov 3, 2023, 9:41:12 PM GMT+02:00" / "3 Nov 2023, 21:41:12 CET" → epoch ms (offset honoured when present). */
export function parseTakeoutDate(s) {
  s = s.replace(/[  ]/g, ' ').trim();
  let m = s.match(/([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?/i);
  let y, mo, d, h, mi, sec, ap;
  if (m) [, mo, d, y, h, mi, sec, ap] = m;
  else {
    m = s.match(/(\d{1,2}) ([A-Za-z]{3})[a-z]*\.? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?/i);
    if (!m) return NaN;
    [, d, mo, y, h, mi, sec, ap] = m;
  }
  const month = MON[mo.toLowerCase()];
  if (month === undefined) return NaN;
  h = +h;
  if (ap) h = (h % 12) + (/pm/i.test(ap) ? 12 : 0);
  const off = s.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (off) {
    const mins = (+off[2] * 60 + +(off[3] || 0)) * (off[1] === '-' ? -1 : 1);
    return Date.UTC(+y, month, +d, h, +mi, +(sec || 0)) - mins * 60_000;
  }
  return new Date(+y, month, +d, h, +mi, +(sec || 0)).getTime();
}

export function parseHtml(html) {
  const out = [];
  const cells = html.split(/<div class="outer-cell/).slice(1);
  for (const cell of cells) {
    const header = cell.match(/mdl-typography--title">([\s\S]*?)<br/)?.[1]?.trim();
    if (header !== 'YouTube Music') continue;
    const body = cell.match(/mdl-typography--body-1">([\s\S]*?)<\/div>/)?.[1];
    if (!body) continue;
    const links = [...body.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((x) => decodeEntities(x[1]).trim());
    if (links.length < 2) continue;
    const parts = body.split(/<br\s*\/?>/).map((p) => decodeEntities(p.replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
    const ts = parseTakeoutDate(parts[parts.length - 1] || '');
    if (Number.isNaN(ts)) continue;
    const href = decodeEntities(body.match(/<a href="([^"]+)"/)?.[1] || '');
    out.push({ ts, artist: cleanArtist(links[1]), track: links[0], album: '', ms: ESTIMATE_MS, est: true, src: 'youtube', id: videoId(href) });
  }
  return out;
}
