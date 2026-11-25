// iTunes Search API lookup (free, no key, CORS-enabled). Shared by browser + Node.

const clean = (s) =>
  s
    .replace(/\s*[([](feat|with|ft)\.?[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster|live|radio edit|single|edit|mono|stereo).*$/i, '')
    .trim();

/** Comparable form: lowercase, no accents, no punctuation, no leading "the", "&" → "and". */
const norm = (s) =>
  clean(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^the /, '')
    .trim();

const words = (s) => new Set(norm(s).split(' ').filter(Boolean));

export function sameArtist(want, got) {
  const a = norm(want), b = norm(got || '');
  if (!a || !b) return false;
  // "Tyler, The Creator" vs "Tyler the Creator", or a credited collaboration "A & B".
  return a === b || b.split(' and ').some((p) => p.trim() === a) || b.startsWith(a + ' ') || a.startsWith(b + ' ');
}

export function sameTrack(want, got) {
  const a = norm(want), b = norm(got || '');
  if (!a || !b) return false;
  if (a === b || b.startsWith(a) || a.startsWith(b)) return true;
  // Tolerate small differences ("Pt. 2" vs "Part 2"): most words in common.
  const A = words(want), B = words(got);
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(A.size, B.size) >= 0.75;
}

/**
 * Only a result by the same artist with the same title counts. If iTunes doesn't carry
 * the track, we return null and the UI falls back to a procedural colour: a wrong cover
 * or someone else's song is worse than none.
 * @returns {Promise<{ url: string, preview: string|null }|null>} 600×600 artwork + 30 s preview clip
 */
export async function findArtwork(track, artist, fetchImpl = fetch) {
  const search = async (params) => {
    const res = await fetchImpl(`https://itunes.apple.com/search?media=music&entity=song&${params}`);
    if (res.status === 403 || res.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.results || []).find((r) => r.artworkUrl100 && sameArtist(artist, r.artistName) && sameTrack(track, r.trackName));
  };
  // Artist + title first; if the right song is buried, search titles only and filter by artist.
  const hit =
    (await search(`limit=10&term=${encodeURIComponent(`${clean(artist)} ${clean(track)}`)}`)) ||
    (await search(`limit=50&attribute=songTerm&term=${encodeURIComponent(clean(track))}`));
  if (!hit) return null;
  return { url: hit.artworkUrl100.replace('100x100bb', '600x600bb'), preview: hit.previewUrl || null };
}

export const thumb = (url, size = 64) => url.replace(/\d+x\d+bb/, `${size}x${size}bb`);
