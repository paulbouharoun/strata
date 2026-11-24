// Colour helpers shared by the browser and the Node sample script.

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Procedural fallback: an earthy mineral colour derived from the artist's name. */
export function hashColor(name) {
  const h = hash(name);
  const hue = h % 360;
  const sat = 22 + ((h >>> 9) % 30);
  const light = 34 + ((h >>> 17) % 28);
  return toHex(hslToRgb(hue, sat, light));
}

/**
 * Dominant colours from RGBA pixels (a 64×64-ish thumbnail is plenty).
 * Returns up to 3 hex colours, most dominant first, kept visually distinct.
 */
export function paletteFromPixels(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const ranked = [...buckets.values()]
    .map((e) => {
      const c = [e.r / e.n, e.g / e.n, e.b / e.n];
      const max = Math.max(...c), min = Math.min(...c);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Prefer colourful, mid-tone buckets but don't ignore big flat areas.
      const tone = 1 - Math.abs((max + min) / 510 - 0.5) * 1.2;
      return { c, score: e.n * (0.35 + sat) * Math.max(0.15, tone) };
    })
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const { c } of ranked) {
    if (picked.every((p) => dist(p, c) > 60)) picked.push(c);
    if (picked.length === 3) break;
  }
  return picked.map((c) => toHex(c.map(Math.round)));
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Mix two hex colours, t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const A = fromHex(a), B = fromHex(b);
  return toHex(A.map((v, i) => Math.round(v + (B[i] - v) * t)));
}

/** Push a colour toward "rock": desaturate into a stone tone, keep a memory of the hue. */
export function mineralize(hex, stone = '#8a7b68', amount = 0.42) {
  return mix(hex, stone, amount);
}

export function luminance(hex) {
  const [r, g, b] = fromHex(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const artKey = (track, artist) => `${track}\u0000${artist}`;
