// Picks 3 headlines per season and ties each to what you were listening to. Shared by the browser
// (for uploads) and the Node sample script, so everyone's globe follows the same rules.
//
// Eras: the headlines follow what the field was called at the time.
//   tech  … to mid-2012           plain tech news
//   ml    autumn 2012 (AlexNet) … summer 2022   machine learning
//   ai    autumn 2022 (ChatGPT) …                AI
// A headline's category is capped at its era (an "AI" story in 2016 reads as ML; Watson in 2011 as tech),
// and each season prefers its era's category: boosted, with at least one when there is one.
//
// Coincidence score:  log(1 + notability) × listening × (1 + 1.5 × echoes)
//   notability  how many Wikipedia language editions cover the story's subject
//   listening   1 + 0.5 × that day's minutes vs. your average day that season (capped);
//               an adjacent day counts 0.8; no listening within ±2 days counts 0.25
//   echoes      words the song (title, artist, album) shares with the headline
// Diversity: different months where possible, at most one grave story per season.
// Grave stories never get a song: the UI shows only the minutes you listened.

export const ERA_LABEL = { tech: 'tech', ml: 'tech & machine learning', ai: 'tech & AI' };
const RANK = { tech: 0, ml: 1, ai: 2 };
export function eraOf(year, q) {
  const t = year * 4 + (q - 1);
  if (t < 2012 * 4 + 2) return 'tech';
  if (t < 2022 * 4 + 3) return 'ml';
  return 'ai';
}

const GRAVE = /\b(kill|killed|killing|dies|died|dead|deaths?|(?<!cyber[- ])attacks?|bomb|bombings?|explosions?|blasts?|war|invade[sd]?|invasion|massacres?|shootings?|open fire|earthquakes?|tsunami|famine|genocide|hostages?|crash(es)?|fires?|floods?|pandemic|terror\w*|airstrikes?|strikes? on|wounded|casualties|victims?|assassinat\w*|shot down|suicide)\b/i;
const STOP = new Set('the a an and or of in on at to for from by with into over after before about as is are was were be been his her its their this that these those than then who whom which what when where while during between against under above new first last more most also has have had not no yes all any some one two three four five six seven eight nine ten world year years people day days part city state states national international says said will would could amid near'.split(' '));
const stem = (w) => w.replace(/(ings?|ed|es|s)$/i, '');
const words = (s) =>
  new Set(
    String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem)
  );
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * @param {{ days: Record<string, any>, seasons: Record<string, any> }} listening  from buildDays()
 * @param {{ years: { year: number, events: any[] }[] }} headlines
 */
export function pickSeasons(listening, headlines) {
  const { days, seasons } = listening;
  const byYear = new Map(headlines.years.map((y) => [y.year, y.events]));
  const needleFor = (y, m, d) => {
    for (const off of [0, -1, 1, -2, 2]) {
      const t = new Date(y, m, d + off);
      const k = key(t.getFullYear(), t.getMonth(), t.getDate());
      if (days[k]) return { date: k, offset: off, ...days[k] };
    }
    return null;
  };
  // Days per season, for "how much did you listen that day, relative to usual".
  const seasonMinutes = {};
  for (const [k, d] of Object.entries(days)) {
    const sk = `${k.slice(0, 4)}-Q${Math.floor((+k.slice(5, 7) - 1) / 3) + 1}`;
    (seasonMinutes[sk] ||= []).push(d.min);
  }

  const out = [];
  for (const [sk, s] of Object.entries(seasons)) {
    const era = eraOf(s.year, s.q);
    const mins = seasonMinutes[sk] || [];
    const avg = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
    const candidates = (byYear.get(s.year) || [])
      .filter((e) => e.day != null && Math.floor(e.month / 3) + 1 === s.q)
      .map((e) => {
        const category = RANK[e.category] > RANK[era] ? era : e.category;
        const grave = !!e.grave || GRAVE.test(`${e.text} ${e.where || ''}`);
        const needle = needleFor(e.year, e.month, e.day);
        const intensity = needle ? Math.min(3, needle.min / Math.max(1, avg)) : 0;
        const hw = words(`${e.text} ${e.where || ''}`);
        const echo = needle && !grave ? [...words(`${needle.top.track} ${needle.top.artist} ${needle.top.album}`)].filter((w) => hw.has(w)) : [];
        const score =
          Math.log1p(e.rank || 1) *
          (e.coord ? 1 : 0.35) *
          ((e.rank || 0) < 40 ? 0.6 : 1) *
          (needle ? (needle.offset === 0 ? 1 : 0.8) * (1 + 0.5 * intensity) : 0.25) *
          (1 + 1.5 * Math.min(2, echo.length)) *
          (era !== 'tech' && category === era ? 1.6 : 1);
        return { e: { ...e, category, grave }, needle, echo, score };
      });

    const picks = [];
    const months = new Set();
    const take = (c) => { picks.push(c); months.add(c.e.month); };
    if (era !== 'tech') {
      const first = candidates.filter((c) => c.e.category === era && !c.e.grave).sort((a, b) => b.score - a.score)[0];
      if (first) take(first);
    }
    while (picks.length < 3) {
      const pool = candidates.filter((c) => !picks.includes(c) && !(c.e.grave && picks.some((p) => p.e.grave)));
      const fresh = pool.filter((c) => !months.has(c.e.month));
      const next = (fresh.length ? fresh : pool).sort((a, b) => b.score - a.score)[0];
      if (!next) break;
      take(next);
    }
    picks.sort((a, b) => a.e.month - b.e.month || a.e.day - b.e.day);

    out.push({
      ...s,
      key: sk,
      era,
      headlines: picks.map(({ e, needle, echo }) => ({
        ...e,
        date: key(e.year, e.month, e.day),
        echo,
        needle: needle && {
          date: needle.date, offset: needle.offset, minutes: needle.min,
          track: needle.top.track, artist: needle.top.artist, album: needle.top.album,
          src: needle.top.src, id: needle.top.id, at: needle.top.at,
        },
      })),
    });
  }
  return { seasons: out.filter((s) => s.headlines.length).sort((a, b) => b.year - a.year || b.q - a.q) };
}
