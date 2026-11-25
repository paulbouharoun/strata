// One shared audio element: starting a preview stops whatever was playing.
export const player = $state({ key: null, playing: false, progress: 0, loading: false });

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
  if (!audio) return;
  audio.pause();
  player.key = null;
  player.playing = false;
  player.progress = 0;
}
