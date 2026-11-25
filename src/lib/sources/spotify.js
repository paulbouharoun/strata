// Spotify "Download your data".
// Extended streaming history (Streaming_History_Audio_2019-2021_3.json):
//   { ts, ms_played, master_metadata_track_name, master_metadata_album_artist_name, master_metadata_album_album_name, ... }
// Account data (StreamingHistory_music_0.json / StreamingHistory0.json):
//   { endTime: "2023-04-01 21:04", artistName, trackName, msPlayed }

export const name = 'Spotify';

export const looksLike = (first) => first && typeof first === 'object' && ('ms_played' in first || 'msPlayed' in first);

/** Video and podcast histories ride in the same zip; skip them by filename. */
export const skipFile = (path) => /(Video|podcast)/i.test(path.split('/').pop());

export function parse(entries) {
  const out = [];
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if ('ms_played' in e) {
      const track = e.master_metadata_track_name;
      const artist = e.master_metadata_album_artist_name;
      if (!track || !artist) continue; // podcasts, audiobooks, local nulls
      const ts = Date.parse(e.ts);
      if (Number.isNaN(ts)) continue;
      const id = typeof e.spotify_track_uri === 'string' ? e.spotify_track_uri.split(':')[2] : undefined;
      out.push({ ts, artist, track, album: e.master_metadata_album_album_name || '', ms: e.ms_played | 0, src: 'spotify', id });
    } else if ('msPlayed' in e && e.trackName && e.artistName) {
      // endTime is UTC "YYYY-MM-DD HH:mm"; it marks the end of the play.
      const end = Date.parse(e.endTime.replace(' ', 'T') + ':00Z');
      if (Number.isNaN(end)) continue;
      if (e.artistName === 'Unknown Artist' && e.trackName === 'Unknown Track') continue;
      out.push({ ts: end - (e.msPlayed | 0), artist: e.artistName, track: e.trackName, album: '', ms: e.msPlayed | 0, src: 'spotify' });
    }
  }
  return out;
}
