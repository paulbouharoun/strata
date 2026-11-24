// Deezer personal-data export: an .xlsx workbook whose "10_listeningHistory" sheet has one row per stream:
//   Song Title | Artist | ISRC | Album Title | IP Address | Listening Time (seconds) | Platform Name | Platform Model | Date
// Date is "YYYY-MM-DD HH:MM:SS" (UTC). Listening Time is blank or -1 for some web-player plays.
// Headers are matched in English and French. The workbook is read with JSZip + regex: workers have no DOMParser.
import JSZip from 'jszip';
import { decodeEntities, num } from './util.js';

export const name = 'Deezer';

const ESTIMATE_MS = 180_000;
const H = {
  track: ['song title', 'titre', 'titre du morceau', 'titre de la chanson', 'title'],
  artist: ['artist', 'artiste', 'artists', 'artistes'],
  album: ['album title', 'album', "titre de l'album"],
  seconds: ['listening time', "temps d'écoute", "durée d'écoute", "duree d'ecoute", 'écoute'],
  date: ['date', "date d'écoute", "date de l'écoute", "date d'ecoute", "date de l'ecoute"],
};

const attrs = (tag) => {
  const o = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) o[m[1]] = m[2];
  return o;
};

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const textOf = (xml) => decodeEntities([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

/** @param {ArrayBuffer} buf  the .xlsx */
export async function parse(buf) {
  const zip = await JSZip.loadAsync(buf);
  const read = (p) => zip.file(p)?.async('string');
  const workbook = await read('xl/workbook.xml');
  if (!workbook) return [];

  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => attrs(m[0]));
  const sheet = sheets.find((s) => /^10_listeningHistory$/i.test(s.name)) || sheets.find((s) => /listeningHistory$/i.test(s.name));
  if (!sheet) return [];
  const rels = (await read('xl/_rels/workbook.xml.rels')) || '';
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => attrs(m[0])).find((r) => r.Id === sheet['r:id']);
  if (!rel) return [];
  const target = rel.Target.replace(/^\//, '');
  const sheetXml = await read(target.startsWith('xl/') ? target : 'xl/' + target);
  if (!sheetXml) return [];

  const shared = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const date1904 = /date1904="(1|true)"/.test(workbook);

  let cols = null;
  const out = [];
  for (const rm of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(cm[1]);
      const inner = cm[2] || '';
      let v;
      if (a.t === 's') v = shared[+(inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? -1)] ?? '';
      else if (a.t === 'inlineStr') v = textOf(inner);
      else v = decodeEntities(inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? '');
      row[a.r ? colIndex(a.r) : row.length] = v;
    }
    if (!cols) {
      const norm = row.map((c) => String(c ?? '').trim().toLowerCase());
      const find = (aliases) => norm.findIndex((c) => aliases.includes(c));
      const c = Object.fromEntries(Object.entries(H).map(([k, al]) => [k, find(al)]));
      if (c.track >= 0 && c.artist >= 0 && c.date >= 0) cols = c;
      continue;
    }
    const track = (row[cols.track] || '').trim();
    const artist = (row[cols.artist] || '').trim();
    if (!track || !artist) continue;
    const ts = parseDate(row[cols.date], date1904);
    if (!ts) continue;
    const s = cols.seconds >= 0 ? num(row[cols.seconds]) : NaN;
    const known = Number.isFinite(s) && s >= 0;
    out.push({ ts, artist, track, album: cols.album >= 0 ? (row[cols.album] || '').trim() : '', ms: known ? Math.round(s * 1000) : ESTIMATE_MS, est: !known || undefined });
  }
  return out;
}

function parseDate(v, date1904) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const serial = num(s);
  if (serial > 0) return Math.round((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + serial * 86_400_000);
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}
