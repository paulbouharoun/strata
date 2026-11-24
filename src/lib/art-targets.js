// Which tracks get cover art: the bedrock fossil first, then each era's top three, surface downward.
export function tracksNeedingArt(core, perYear = 3) {
  const list = [];
  const seen = new Set();
  const add = (track, artist) => {
    const k = track + '\u0000' + artist;
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ track, artist });
  };
  if (core.bedrock) add(core.bedrock.track, core.bedrock.artist);
  for (const y of core.years) for (const t of y.topTracks.slice(0, perYear)) add(t.track, t.artist);
  return list;
}
