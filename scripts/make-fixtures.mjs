// Re-encodes a (synthetic) Spotify history into every other supported export format,
// byte-shaped like the real files, to exercise each parser end to end.
// Usage: node scripts/make-fixtures.mjs synthetic/my_spotify_data.zip synthetic/
import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseFiles } from '../src/lib/parse.js';

const [input = 'synthetic/my_spotify_data.zip', outDir = 'synthetic/'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const b = readFileSync(input);
const { plays } = await parseFiles([{ name: 'x.zip', data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }]);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (header, rows) => '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const save = async (name, zip) => {
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(outDir + name, buf);
  return buf;
};
const write = (name, data) => writeFileSync(outDir + name, data);

// ── Deezer: xlsx with shared strings, sheet "10_listeningHistory" (rId3 → sheet3.xml, to test the rel lookup).
{
  const strings = [];
  const idx = new Map();
  const s = (v) => {
    if (!idx.has(v)) { idx.set(v, strings.length); strings.push(v); }
    return idx.get(v);
  };
  const header = ['Song Title', 'Artist', 'ISRC', 'Album Title', 'IP Address', 'Listening Time', 'Platform Name', 'Platform Model', 'Date'];
  const col = (i) => String.fromCharCode(65 + i);
  const rowsXml = [];
  const rowXml = (r, cells) => `<row r="${r}">${cells.map((c, i) => (c === null ? '' : typeof c === 'number' ? `<c r="${col(i)}${r}"><v>${c}</v></c>` : `<c r="${col(i)}${r}" t="s"><v>${s(c)}</v></c>`)).join('')}</row>`;
  rowsXml.push(rowXml(1, header));
  let r = 2;
  for (const p of plays.filter((p) => p.ts >= Date.UTC(2015, 0) && p.ts < Date.UTC(2019, 0))) {
    const d = new Date(p.ts);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const secs = r % 50 === 0 ? -1 : Math.round(p.ms / 1000); // a few web-player rows without duration
    rowsXml.push(rowXml(r++, [p.track, p.artist, 'GBAAA0000000', p.album, '0.0.0.0', secs, 'web', 'Chrome', date]));
  }
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="1_identityInfo" sheetId="1" r:id="rId1"/><sheet name="2_favoriteSongs" sheetId="2" r:id="rId2"/><sheet name="10_listeningHistory" sheetId="10" r:id="rId3"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Target="worksheets/sheet3.xml" Type="ws" Id="rId3"/></Relationships>`);
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row></sheetData></worksheet>');
  zip.file('xl/worksheets/sheet3.xml', `<?xml version="1.0"?><worksheet><sheetData>${rowsXml.join('')}</sheetData></worksheet>`);
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst count="${strings.length}">${strings.map((x) => `<si><t xml:space="preserve">${esc(x)}</t></si>`).join('')}</sst>`);
  await save('deezer-data_123456.xlsx', zip);
  console.log('deezer', r - 2, 'rows');
}

// ── Apple: outer zip → nested Apple_Media_Services.zip → Apple Music Activity/{Daily Tracks, Play Activity}.csv
{
  const ap = plays.filter((p) => p.ts >= Date.UTC(2019, 0) && p.ts < Date.UTC(2023, 0));
  const daily = new Map();
  for (const p of ap) {
    const d = new Date(p.ts);
    const key = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}|${p.artist} - ${p.track}`;
    const e = daily.get(key) || { date: key.slice(0, 8), desc: key.slice(9), hours: new Set(), ms: 0, n: 0 };
    e.hours.add(d.getHours());
    e.ms += p.ms;
    e.n++;
    daily.set(key, e);
  }
  const dailyCsv = csv(
    ['Country', 'Track Identifier', 'Media type', 'Date Played', 'Hours', 'Play Duration Milliseconds', 'End Reason Type', 'Source Type', 'Play Count', 'Skip Count', 'Ignore For Recommendations', 'Track Reference', 'Track Description'],
    [...daily.values()].map((e) => ['LBN', '1', 'AUDIO', e.date, [...e.hours].join(', '), e.ms, 'NATURAL_END_OF_TRACK', 'IPHONE', e.n, 0, '', '', e.desc])
  );
  // Newer exports: no "Artist Name" column, sparse "Container Artist Name".
  const activityCsv = csv(
    ['Album Name', 'Container Artist Name', 'Event Start Timestamp', 'Event End Timestamp', 'Event Type', 'Media Type', 'Play Duration Milliseconds', 'Song Name', 'UTC Offset In Seconds'],
    ap.map((p, i) => [p.album, i % 3 ? '' : p.artist, new Date(p.ts).toISOString(), new Date(p.ts + p.ms).toISOString(), 'PLAY_END', 'AUDIO', p.ms, p.track, 7200])
  );
  const inner = new JSZip();
  inner.file('Apple_Media_Services/Apple Music Activity/Apple Music - Play History Daily Tracks.csv', dailyCsv);
  inner.file('Apple_Media_Services/Apple Music Activity/Apple Music Play Activity.csv', activityCsv);
  inner.file('Apple_Media_Services/Apple Music Activity/Apple Music Library Tracks.json', '[]');
  const outer = new JSZip();
  outer.file('Apple Media Services information/Apple_Media_Services.zip', await inner.generateAsync({ type: 'uint8array' }));
  await save('Apple Media Services information.zip', outer);
  console.log('apple', daily.size, 'daily rows,', ap.length, 'activity rows');
}

// ── YouTube Music: Takeout zip with watch-history.html (the default), plus a separate JSON variant.
{
  const yt = plays.filter((p) => p.ts >= Date.UTC(2022, 0) && p.ts < Date.UTC(2025, 0));
  const fmt = (ts) => {
    const d = new Date(ts + 2 * 3600e3);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    const h = d.getUTCHours();
    return `${m} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h % 12 || 12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'} GMT+02:00`;
  };
  const cell = (header, title, artist, ts) =>
    `<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp"><div class="mdl-grid"><div class="header-cell mdl-cell mdl-cell--12-col"><p class="mdl-typography--title">${header}<br></p></div><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Watched&nbsp;<a href="https://music.youtube.com/watch?v=x">${esc(title)}</a><br><a href="https://www.youtube.com/channel/y">${esc(artist)} - Topic</a><br>${fmt(ts)}<br></div><div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption"><b>Products:</b><br>&emsp;YouTube<br></div></div></div>`;
  const newest = [...yt].reverse();
  const html = `<html><head><style>.mdl-typography--title{}</style></head><body><div class="mdl-grid">${newest.map((p, i) => (i % 40 === 0 ? cell('YouTube', 'Some vlog', 'A Creator', p.ts - 1000) : '') + cell('YouTube Music', p.track, p.artist, p.ts)).join('')}</div></body></html>`;
  const zip = new JSZip();
  zip.file('Takeout/YouTube and YouTube Music/history/watch-history.html', html);
  zip.file('Takeout/YouTube and YouTube Music/history/search-history.html', '<html></html>');
  zip.file('Takeout/archive_browser.html', '<html></html>');
  await save('takeout-20261124T000000Z-001.zip', zip);
  write('watch-history.json', JSON.stringify(newest.map((p) => ({ header: 'YouTube Music', title: `Watched ${p.track}`, titleUrl: 'https://music.youtube.com/watch?v=x', subtitles: [{ name: `${p.artist} - Topic`, url: 'https://www.youtube.com/channel/y' }], time: new Date(p.ts).toISOString(), products: ['YouTube'] }))));
  console.log('youtube', yt.length, 'plays');
}

// ── TIDAL: streaming.csv, DD/MM/YYYY H:MM in the listener's zone.
{
  const td = plays.filter((p) => p.ts >= Date.UTC(2024, 6));
  const tz = 'Asia/Beirut';
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
  const rows = td.map((p, i) => {
    const parts = Object.fromEntries(f.formatToParts(p.ts).map((x) => [x.type, x.value]));
    const artist = i % 25 === 0 ? `${p.artist} Feat. Someone` : p.artist;
    return [artist, p.track, `${parts.day}/${parts.month}/${parts.year} ${+parts.hour}:${parts.minute}`, `${p.ms}.0`, 'TRACK', 'null', 'mobile', 'Lebanon', 'null', 'null', 'null', tz];
  });
  rows.splice(5, 0, ['Some Artist', 'Some Album', '01/08/2024 12:00', '0.0', 'ALBUM', 'null', 'mobile', 'null', 'null', 'null', 'null', 'null']);
  write('streaming.csv', csv(['artist_name', 'track_title', 'entry_date', 'stream_duration_ms', 'product_type', 'ip_address', 'client_name_from_session', 'country_name', 'region_name', 'city_name', 'postal_code', 'time_zone'], rows));
  console.log('tidal', rows.length, 'rows');
}
