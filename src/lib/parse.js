// Any supported export → normalized plays. Files from several services can be dropped together;
// their histories merge into one core, and bedrock is the earliest stream across all of them.
// Pure ESM, no DOM: runs in the browser worker and in the Node sample script.
import JSZip from 'jszip';
import * as spotify from './sources/spotify.js';
import * as deezer from './sources/deezer.js';
import * as apple from './sources/apple.js';
import * as youtube from './sources/youtube.js';
import * as tidal from './sources/tidal.js';

/**
 * @typedef {{ ts: number, artist: string, track: string, album: string, ms: number,
 *   n?: number,     // plays this row stands for (Apple's daily rows); default 1
 *   day?: boolean,  // timestamp only known to the day
 *   est?: boolean,  // duration estimated (export didn't record it)
 * }} Play
 */

export const SERVICES = ['Spotify', 'Apple Music', 'Deezer', 'YouTube Music', 'TIDAL'];

// Inside archives, only open files that could plausibly be a listening history.
// (A full Google Takeout can hold gigabytes of unrelated JSON.)
const HISTORY_PATH = /histor|verlauf|cronolog|geschiedenis|streaming|play activity|listening/i;
const MAX_NESTING = 5;

/**
 * @param {{ name: string, data: ArrayBuffer }[]} files  zips, or loose .json / .csv / .html / .xlsx files
 * @param {(msg: string) => void} [onProgress]
 */
export async function parseFiles(files, onProgress = () => {}) {
  /** @type {{ path: string, top: boolean, text?: () => Promise<string>, buffer?: () => Promise<ArrayBuffer> }[]} */
  const docs = [];

  async function expandZip(data, prefix, depth) {
    const zip = await JSZip.loadAsync(data);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || /(^|\/)__MACOSX\//.test(entry.name)) continue;
      const path = prefix + entry.name;
      if (/\.zip$/i.test(entry.name) && depth < MAX_NESTING) {
        onProgress('Opening a nested archive');
        await expandZip(await entry.async('arraybuffer'), path + '/', depth + 1);
      } else {
        docs.push({ path, top: false, text: () => entry.async('string'), buffer: () => entry.async('arraybuffer') });
      }
    }
  }

  onProgress('Unsealing the archive');
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) await expandZip(f.data, '', 0);
    else docs.push({ path: f.name, top: true, text: async () => new TextDecoder().decode(f.data), buffer: async () => f.data });
  }

  /** @type {Play[]} */
  let plays = [];
  const found = new Set();
  let appleDaily = [];
  let appleActivity = [];
  const add = (service, ps) => {
    if (!ps.length) return;
    found.add(service);
    plays = plays.concat(ps);
  };

  let i = 0;
  for (const d of docs) {
    const file = d.path.split('/').pop();
    const ext = (file.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
    const candidate = d.top || HISTORY_PATH.test(d.path) || ext === 'xlsx';
    if (!candidate || !['json', 'csv', 'html', 'xlsx'].includes(ext)) continue;
    onProgress(`Reading layer ${++i}`);

    if (ext === 'xlsx') {
      add(deezer.name, await deezer.parse(await d.buffer()));
    } else if (ext === 'json') {
      if (spotify.skipFile(d.path)) continue;
      let json;
      try { json = JSON.parse(await d.text()); } catch { continue; }
      if (!Array.isArray(json) || !json.length) continue;
      if (spotify.looksLike(json[0])) add(spotify.name, spotify.parse(json));
      else if (youtube.looksLikeJson(json[0])) add(youtube.name, youtube.parseJson(json));
    } else if (ext === 'csv') {
      if (apple.isDaily(d.path)) { appleDaily = appleDaily.concat(apple.parseDaily(await d.text())); continue; }
      if (apple.isActivity(d.path)) { appleActivity = appleActivity.concat(apple.parseActivity(await d.text())); continue; }
      const text = await d.text();
      const head = text.slice(0, 4000);
      if (tidal.looksLike(head)) add(tidal.name, tidal.parse(text));
      else if (/Track Description/.test(head) && /Date Played/.test(head)) appleDaily = appleDaily.concat(apple.parseDaily(text));
      else if (/Song Name/.test(head) && /Play Duration Milliseconds/.test(head)) appleActivity = appleActivity.concat(apple.parseActivity(text));
    } else if (ext === 'html') {
      const text = await d.text();
      if (youtube.looksLikeHtml(text)) add(youtube.name, youtube.parseHtml(text));
    }
  }

  // Apple: daily rows name the artist reliably; activity rows date the first stream to the minute.
  if (appleDaily.length) {
    apple.refineFirst(appleDaily, appleActivity);
    add(apple.name, appleDaily);
  } else add(apple.name, appleActivity);

  if (!plays.length) {
    throw new Error(
      docs.length
        ? `No listening history found in that file. Strata reads exports from ${SERVICES.join(', ')}.`
        : 'That file is empty.'
    );
  }
  plays.sort((a, b) => a.ts - b.ts);
  return { plays, source: [...found].sort((a, b) => SERVICES.indexOf(a) - SERVICES.indexOf(b)).join(' + ') };
}

// Kept for the Node scripts and tests.
export const normalizeEntries = spotify.parse;
