// Which tracks get cover art and a preview: the bedrock fossil first, then each era's top three, surface downward.
export function tracksNeedingArt(core, perYear = 3) {
  const list = [];
  const seen = new Set();
  const add = (t) => {
    const k = t.track + '\u0000' + t.artist;
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ track: t.track, artist: t.artist, src: t.src, id: t.id });
  };
  if (core.bedrock) add(core.bedrock);
  for (const y of core.years) for (const t of y.topTracks.slice(0, perYear)) add(t);
  return list;
}
