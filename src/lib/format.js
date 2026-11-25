export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const num = (n, d = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

export function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}

export const longDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const clock = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Geological name for an era, from how dominant its top artists were. */
export function eraName(year) {
  const [a, b] = year.topArtists;
  if (!a) return 'Barren Strata';
  // "The Black Keys" → "The Black Keys Beds", not "The The Black Keys Beds".
  const bare = (n) => n.replace(/^the\s+/i, '');
  const share = a.ms / (year.ms || 1);
  if (share > 0.24 || !b) return `The ${bare(a.name)} Formation`;
  if (b.ms / a.ms > 0.82) return `The ${bare(a.name)}–${bare(b.name)} Group`;
  return `The ${bare(a.name)} Beds`;
}

/** Depth into the core, in hours listened (counted down from today): 1,204.3 h */
export const depth = (h, d = 1) => `${num(h < 0.05 ? 0 : h, d)} h`;
