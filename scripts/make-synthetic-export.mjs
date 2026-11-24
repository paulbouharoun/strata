// Generates a fake Spotify "Extended streaming history" zip, shaped exactly like the real thing.
// Used to exercise the upload path and to seed the sample core until a real export is swapped in.
// Usage: node scripts/make-synthetic-export.mjs out/my_spotify_data.zip
import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] || 'synthetic/my_spotify_data.zip';

// Deterministic RNG (mulberry32)
let seed = 0x5742a7a;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};

const CATALOG = {
  'Linkin Park': [['Numb', 'Meteora'], ['In the End', 'Hybrid Theory'], ['Burn It Down', 'LIVING THINGS']],
  'Daft Punk': [['Get Lucky (feat. Pharrell Williams and Nile Rodgers)', 'Random Access Memories'], ['Instant Crush (feat. Julian Casablancas)', 'Random Access Memories'], ['Lose Yourself to Dance (feat. Pharrell Williams)', 'Random Access Memories']],
  'Arctic Monkeys': [['Do I Wanna Know?', 'AM'], ['R U Mine?', 'AM'], ["Why'd You Only Call Me When You're High?", 'AM'], ['505', 'Favourite Worst Nightmare']],
  'Imagine Dragons': [['Radioactive', 'Night Visions'], ['Demons', 'Night Visions']],
  'Red Hot Chili Peppers': [["Can't Stop", 'By the Way'], ['Californication', 'Californication'], ['Snow (Hey Oh)', 'Stadium Arcadium'], ['Dani California', 'Stadium Arcadium']],
  'Muse': [['Hysteria', 'Absolution'], ['Supermassive Black Hole', 'Black Holes and Revelations'], ['Madness', 'The 2nd Law']],
  'The Black Keys': [['Lonely Boy', 'El Camino'], ['Fever', 'Turn Blue']],
  'Jamiroquai': [['Virtual Insanity', 'Travelling Without Moving'], ['Canned Heat', 'Synkronized'], ['Cosmic Girl', 'Travelling Without Moving']],
  "Mashrou' Leila": [['Lil Watan', 'Raasük'], ['Roman', 'Ibn El Leil'], ['Fasateen', "Mashrou' Leila"]],
  'Tame Impala': [['The Less I Know The Better', 'Currents'], ['Let It Happen', 'Currents'], ['Eventually', 'Currents'], ['Borderline', 'The Slow Rush'], ['Lost in Yesterday', 'The Slow Rush']],
  'Snarky Puppy': [['Lingus', 'We Like It Here'], ['Shofukan', 'We Like It Here'], ['What About Me?', 'We Like It Here']],
  'Vulfpeck': [['Dean Town', 'The Beautiful Game'], ['Back Pocket', 'Thrill of the Arts'], ['1612', 'Fugue State'], ['Animal Spirits', 'The Beautiful Game']],
  'Thundercat': [['Them Changes', 'Drunk'], ['Show You The Way (feat. Michael McDonald & Kenny Loggins)', 'Drunk'], ['Dragonball Durag', 'It Is What It Is'], ['Funny Thing', 'It Is What It Is']],
  'Kendrick Lamar': [['HUMBLE.', 'DAMN.'], ['DNA.', 'DAMN.'], ['Money Trees', 'good kid, m.A.A.d city'], ['Not Like Us', 'Not Like Us']],
  'Anderson .Paak': [['Come Down', 'Malibu'], ['Am I Wrong (feat. ScHoolboy Q)', 'Malibu'], ['Tints (feat. Kendrick Lamar)', 'Oxnard']],
  'Khruangbin': [['Maria También', 'Con Todo El Mundo'], ['Time (You and I)', 'Mordechai'], ['Evan Finds the Third Room', 'Con Todo El Mundo'], ["So We Won't Forget", 'Mordechai']],
  'Tom Misch': [['Disco Yes (feat. Poppy Ajudha)', 'Geography'], ['It Runs Through Me (feat. De La Soul)', 'Geography'], ['South of the River', 'Geography']],
  'Jacob Collier': [['Hideaway', 'In My Room'], ['All Night Long (feat. Jules Buckley, Take 6 & Metropole Orkest)', 'Djesse Vol. 1']],
  'Fairuz': [['Kifak Inta', 'Kifak Inta'], ['Li Beirut', 'Li Beirut'], ['Shadi', 'Fairuz Legend']],
  'The Weeknd': [['Blinding Lights', 'After Hours'], ['Save Your Tears', 'After Hours']],
  'Parcels': [['Tieduprightnow', 'Parcels'], ['Overnight', 'Overnight'], ['Somethinggreater', 'Day/Night']],
  'Fred again..': [['Delilah (pull me out of this)', 'Actual Life 3 (January 1 - September 9 2022)'], ['Marea (we’ve lost dancing)', 'Actual Life (April 14 - December 17 2020)'], ['Danielle (smile on my face)', 'Actual Life 3 (January 1 - September 9 2022)'], ['adore u', 'adore u']],
  'KAYTRANADA': [['10%', 'BUBBA'], ['Glowed Up (feat. Anderson .Paak)', '99.9%']],
  'Overmono': [['So U Kno', 'Good Lies'], ['Good Lies', 'Good Lies']],
  'Jungle': [['Back On 74', 'Volcano'], ['Casio', 'Volcano'], ["Busy Earnin'", 'Jungle']],
  'Little Simz': [['Introvert', 'Sometimes I Might Be Introvert'], ['Gorilla', 'NO THANK YOU']],
  'Fontaines D.C.': [['Starburster', 'Romance'], ['Favourite', 'Romance']],
  'Doechii': [['Anxiety', 'Anxiety']],
};

// Era weights per year. Bigger number, bigger share of that year's listening.
const ERAS = {
  2013: { 'Linkin Park': 9, 'Daft Punk': 8, 'Arctic Monkeys': 7, 'Imagine Dragons': 5, 'Muse': 3 },
  2014: { 'Arctic Monkeys': 9, 'The Black Keys': 6, 'Red Hot Chili Peppers': 7, 'Muse': 5, 'Daft Punk': 3 },
  2015: { 'Red Hot Chili Peppers': 10, 'Jamiroquai': 6, "Mashrou' Leila": 6, 'Tame Impala': 5, 'Arctic Monkeys': 3 },
  2016: { 'Snarky Puppy': 9, 'Vulfpeck': 8, 'Tame Impala': 6, 'Red Hot Chili Peppers': 4, 'Jamiroquai': 4 },
  2017: { 'Vulfpeck': 10, 'Thundercat': 8, 'Kendrick Lamar': 7, 'Snarky Puppy': 5 },
  2018: { 'Thundercat': 9, 'Anderson .Paak': 8, 'Khruangbin': 7, "Mashrou' Leila": 4, 'Vulfpeck': 4 },
  2019: { 'Khruangbin': 10, 'Tom Misch': 8, 'Jacob Collier': 6, 'Tame Impala': 5, 'Thundercat': 3 },
  2020: { 'Fairuz': 9, 'The Weeknd': 7, 'Khruangbin': 7, 'Tame Impala': 7, 'Fred again..': 2 },
  2021: { 'Parcels': 9, 'Vulfpeck': 6, 'Khruangbin': 5, 'KAYTRANADA': 5, 'Fairuz': 3 },
  2022: { 'Fred again..': 10, 'KAYTRANADA': 7, 'Parcels': 6, 'Thundercat': 5 },
  2023: { 'Fred again..': 8, 'Overmono': 8, 'Fairuz': 5, 'Khruangbin': 5, 'Jungle': 3 },
  2024: { 'Jungle': 9, 'Little Simz': 7, 'Kendrick Lamar': 7, 'Fred again..': 5, 'Khruangbin': 4 },
  2025: { 'Fontaines D.C.': 8, 'Doechii': 7, 'Kendrick Lamar': 6, 'Vulfpeck': 5, 'Jungle': 4 },
  2026: { 'Fontaines D.C.': 8, 'Khruangbin': 7, 'Thundercat': 6, 'Fairuz': 5, 'Overmono': 4 },
};
// Rough listening intensity (plays per active day) by year — busy uni years, quiet lockdown dip, etc.
const INTENSITY = { 2013: 5, 2014: 8, 2015: 11, 2016: 14, 2017: 15, 2018: 12, 2019: 13, 2020: 18, 2021: 12, 2022: 14, 2023: 11, 2024: 12, 2025: 13, 2026: 10 };

const entries = [];
const push = (ts, artist, track, album, ms) =>
  entries.push({
    ts: new Date(ts).toISOString().replace('.000', ''),
    platform: 'ios', ms_played: ms, conn_country: 'LB', ip_addr: null,
    master_metadata_track_name: track, master_metadata_album_artist_name: artist, master_metadata_album_album_name: album,
    spotify_track_uri: track ? `spotify:track:${Math.floor(rnd() * 1e16).toString(36)}` : null,
    episode_name: null, episode_show_name: null, spotify_episode_uri: null,
    reason_start: 'trackdone', reason_end: 'trackdone', shuffle: rnd() < 0.4, skipped: ms < 30000, offline: false, offline_timestamp: null, incognito_mode: false,
  });

// Bedrock: the very first stream.
const BEDROCK = Date.UTC(2013, 0, 17, 19, 41, 8);
push(BEDROCK, 'Linkin Park', 'Numb', 'Meteora', 185_000);

const END = Date.UTC(2026, 10, 20);
for (let day = BEDROCK + 86_400_000; day < END; day += 86_400_000) {
  const d = new Date(day);
  const year = d.getUTCFullYear();
  if (rnd() < 0.22) continue; // silent days
  const era = Object.entries(ERAS[year]);
  // Seasonal drift: one artist surges each month.
  const surge = era[(d.getUTCMonth() * 7 + year) % era.length][0];
  const n = Math.max(1, Math.round(INTENSITY[year] * (0.4 + rnd() * 1.2)));
  let t = day + (17 + rnd() * 5) * 3_600_000; // evening sessions
  for (let i = 0; i < n; i++) {
    const artist = weighted(era.map(([a, w]) => [a, a === surge ? w * 2.2 : w]));
    const [track, album] = CATALOG[artist][Math.floor(Math.pow(rnd(), 1.6) * CATALOG[artist].length)];
    const ms = rnd() < 0.12 ? Math.floor(rnd() * 29_000) : 150_000 + Math.floor(rnd() * 140_000);
    push(t, artist, track, album, ms);
    t += ms + 2000;
  }
  if (rnd() < 0.03) push(t, null, null, null, 1_800_000); // a podcast episode, should be ignored
}

// Split into files the way Spotify does (~by size), names carry year ranges.
const zip = new JSZip();
const CHUNK = 16000;
for (let i = 0, f = 0; i < entries.length; i += CHUNK, f++) {
  const part = entries.slice(i, i + CHUNK);
  const y0 = part[0].ts.slice(0, 4), y1 = part[part.length - 1].ts.slice(0, 4);
  zip.file(`Spotify Extended Streaming History/Streaming_History_Audio_${y0}-${y1}_${f}.json`, JSON.stringify(part, null, 2));
}
zip.file('Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf', 'not a real pdf');
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`wrote ${entries.length} plays → ${out} (${(buf.length / 1e6).toFixed(1)} MB)`);
