// Cover art + preview for a track, always from the service it was played on:
//   Spotify  → official cover via oEmbed, Spotify's own embedded player (exact track ID from the export)
//   Apple    → iTunes lookup by catalogue ID (or strict search): Apple's cover and 30 s clip
//   Deezer   → Deezer API by ISRC (or strict search): Deezer's cover and 30 s clip
//   YouTube  → the video's thumbnail, YouTube's own embedded player
//   TIDAL    → no public lookup without a private key, and its export has no IDs: a link out only
// Shared by the browser and the Node sample script; network access is injected.
import { findArtwork, sameArtist, sameTrack } from './itunes.js';

/**
 * @typedef {{ url?: string, preview?: string, embed?: { kind: 'spotify'|'youtube', id: string }, link?: string, colors?: string[] }} Media
 * @param {{ track: string, artist: string, src?: string, id?: string }} t
 * @param {{ fetchJson: (url: string, opts?: { jsonp?: boolean }) => Promise<any> }} net
 * @returns {Promise<Media|null>}
 */
export async function resolveMedia(t, net) {
  const q = encodeURIComponent(`${t.artist} ${t.track}`);
  switch (t.src) {
    case 'spotify': {
      if (!t.id) return { link: `https://open.spotify.com/search/${q}` };
      const o = await net.fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${t.id}`)}`).catch(() => null);
      return { url: o?.thumbnail_url, embed: { kind: 'spotify', id: t.id }, link: `https://open.spotify.com/track/${t.id}` };
    }
    case 'deezer': {
      let d = t.id ? await net.fetchJson(`https://api.deezer.com/track/isrc:${t.id}`, { jsonp: true }).catch(() => null) : null;
      if (!d || d.error) {
        const s = await net.fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${t.artist}" track:"${t.track}"`)}`, { jsonp: true }).catch(() => null);
        d = (s?.data || []).find((r) => sameArtist(t.artist, r.artist?.name) && sameTrack(t.track, r.title));
      }
      if (!d || d.error) return { link: `https://www.deezer.com/search/${q}` };
      return { url: d.album?.cover_big || d.album?.cover_medium, preview: d.preview || undefined, link: d.link };
    }
    case 'youtube': {
      if (!t.id) return { link: `https://music.youtube.com/search?q=${q}` };
      return { url: `https://i.ytimg.com/vi/${t.id}/mqdefault.jpg`, embed: { kind: 'youtube', id: t.id }, link: `https://music.youtube.com/watch?v=${t.id}` };
    }
    case 'tidal':
      return { link: `https://listen.tidal.com/search?q=${q}` };
    case 'apple':
    default: {
      // Exports without a service (old samples) are treated like Apple: it's the only keyless catalogue search.
      if (t.id) {
        const l = await net.fetchJson(`https://itunes.apple.com/lookup?id=${t.id}&entity=song`).catch(() => null);
        const r = (l?.results || []).find((x) => x.wrapperType === 'track' && x.artworkUrl100);
        if (r) return { url: r.artworkUrl100.replace('100x100bb', '600x600bb'), preview: r.previewUrl || undefined, link: r.trackViewUrl };
      }
      const hit = await findArtwork(t.track, t.artist);
      return hit ? { url: hit.url, preview: hit.preview || undefined } : { link: `https://music.apple.com/search?term=${q}` };
    }
  }
}

/** How the specimen plays, if at all. */
export const playable = (m) => (m?.preview ? 'audio' : m?.embed ? 'embed' : null);
