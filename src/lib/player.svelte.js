// One shared audio element: starting a preview stops whatever was playing.
// `embed` is the key of an open Spotify/YouTube player (they play inside their own iframe).
export const player = $state({ key: null, playing: false, progress: 0, loading: false, embed: null });

let audio = null;

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.85;
  audio.addEventListener('timeupdate', () => {
    player.progress = audio.duration ? audio.currentTime / audio.duration : 0;
  });
  audio.addEventListener('playing', () => {
    player.loading = false;
    player.playing = true;
  });
  audio.addEventListener('pause', () => (player.playing = false));
  audio.addEventListener('ended', () => {
    player.playing = false;
    player.progress = 0;
    player.key = null;
  });
  audio.addEventListener('error', () => {
    player.loading = false;
    player.playing = false;
    player.key = null;
  });
  return audio;
}

export function toggle(key, src) {
  player.embed = null;
  const a = ensure();
  if (player.key === key) {
    if (a.paused) a.play().catch(() => {});
    else a.pause();
    return;
  }
  a.pause();
  player.key = key;
  player.progress = 0;
  player.loading = true;
  a.src = src;
  a.play().catch(() => {
    player.loading = false;
    player.key = null;
  });
}

export function stop() {
  player.embed = null;
  if (!audio) return;
  audio.pause();
  player.key = null;
  player.playing = false;
  player.progress = 0;
}

/** Open (or close, if already open) a service's own embedded player. Stops any audio clip. */
export function toggleEmbed(key) {
  if (audio) audio.pause();
  player.key = null;
  player.embed = player.embed === key ? null : key;
}

export function stopAll() {
  stop();
  player.embed = null;
}
