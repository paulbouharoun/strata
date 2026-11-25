// iTunes Search API lookup (free, no key, CORS-enabled). Shared by browser + Node.

const clean = (s) =>
  s
    .replace(/\s*[([](feat|with|ft)\.?[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(remaster|live|radio edit|single).*$/i, '')
    .trim();

/** @returns {Promise<{ url: string, preview: string|null }|null>} 600×600 artwork + 30 s preview clip */
export async function findArtwork(track, artist, fetchImpl = fetch) {
  const term = `${clean(artist)} ${clean(track)}`;
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(term)}`;
  const res = await fetchImpl(url);
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error('rate limited'), { rateLimited: true });
  if (!res.ok) return null;
  const json = await res.json();
  const results = json.results || [];
  const a = clean(artist).toLowerCase();
  const hit = results.find((r) => r.artistName?.toLowerCase().includes(a) || a.includes(r.artistName?.toLowerCase())) || results[0];
  if (!hit?.artworkUrl100) return null;
  return { url: hit.artworkUrl100.replace('100x100bb', '600x600bb'), preview: hit.previewUrl || null };
}

export const thumb = (url, size = 64) => url.replace(/\d+x\d+bb/, `${size}x${size}bb`);
