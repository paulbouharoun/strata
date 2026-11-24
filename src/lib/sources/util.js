// Small parsing helpers shared by the source adapters. No DOM: these run in a Web Worker and in Node.

/** RFC 4180-ish CSV → array of rows (arrays of strings). Handles quotes, escaped quotes, CRLF, BOM. */
export function parseCSV(text, delimiter = ',') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Rows → objects keyed by header. `findHeader` lets a file have preamble lines before its header. */
export function csvObjects(text, isHeader = () => true) {
  const rows = parseCSV(text);
  const h = rows.findIndex((r) => isHeader(r.map((c) => c.trim())));
  if (h < 0) return [];
  const header = rows[h].map((c) => c.trim());
  const out = [];
  for (let i = h + 1; i < rows.length; i++) {
    const o = {};
    for (let j = 0; j < header.length; j++) o[header[j]] = rows[i][j] ?? '';
    out.push(o);
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m
  );

const tzFormatters = new Map();
/** Offset (ms) of an IANA zone from UTC at a given instant. Unknown zone → 0 (UTC). */
export function tzOffset(utcMs, timeZone) {
  let f = tzFormatters.get(timeZone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    } catch {
      f = null;
    }
    tzFormatters.set(timeZone, f);
  }
  if (!f) return 0;
  const p = {};
  for (const { type, value } of f.formatToParts(utcMs)) p[type] = +value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in a zone → UTC epoch ms. */
export function zonedToUtc(y, mo, d, h, mi, timeZone) {
  const guess = Date.UTC(y, mo, d, h, mi);
  if (!timeZone) return guess;
  const first = guess - tzOffset(guess, timeZone);
  return guess - tzOffset(first, timeZone);
}

/** "Artist Feat. Guest" → "Artist" so collaborations fold into the main artist's stratum. */
export const primaryArtist = (s) => s.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim();

export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
