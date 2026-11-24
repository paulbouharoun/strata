// Procedural core-sample rendering. Draws one stratum (a year) into a 2D context.
import { fromHex, mix } from './color.js';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (hex, a) => {
  const [r, g, b] = fromHex(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** A wavy boundary, sampled across the core's width. */
function boundary(rand, w, y, amp, steps = 24) {
  const f1 = 0.6 + rand() * 1.6, f2 = 2 + rand() * 4;
  const p1 = rand() * 6.28, p2 = rand() * 6.28;
  const tilt = (rand() - 0.5) * amp * 1.2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const u = i / steps;
    pts.push([x, y + Math.sin(u * 6.28 * f1 + p1) * amp + Math.sin(u * 6.28 * f2 + p2) * amp * 0.35 + (u - 0.5) * tilt + (rand() - 0.5) * amp * 0.3]);
  }
  return pts;
}

/**
 * @param {CanvasRenderingContext2D} ctx  already scaled to CSS pixels
 * @param {{ w:number, h:number, palette:{stone:string, base:string[], months:string[]}, laminae:{month:number,from:number,to:number}[], seed:number, depthT:number, detail?:number, fracture?:boolean }} o
 */
export function drawStratum(ctx, o) {
  const { w, h, palette, seed, depthT } = o;
  const detail = o.detail ?? 1;
  const rand = rng(seed);
  ctx.clearRect(0, 0, w, h);

  // Matrix fill so no gaps show between laminae.
  ctx.fillStyle = palette.months[0] || palette.stone;
  ctx.fillRect(0, 0, w, h);

  // Laminae: one band per month, thickness ∝ listening that month, boundaries undulate.
  const amp = Math.min(10, h * 0.012) * (0.6 + rand() * 0.8);
  let top = boundary(rand, w, -amp * 2, 0);
  o.laminae.forEach((l, i) => {
    const isLast = i === o.laminae.length - 1;
    const bottom = isLast ? boundary(rand, w, h + amp * 2, 0) : boundary(rand, w, l.to * h, amp);
    const color = palette.months[l.month];
    const bandTop = l.from * h, bandH = (l.to - l.from) * h;

    ctx.beginPath();
    top.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let k = bottom.length - 1; k >= 0; k--) ctx.lineTo(bottom[k][0], bottom[k][1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
    g.addColorStop(0, mix(color, '#f3e9d6', 0.07));
    g.addColorStop(0.55, color);
    g.addColorStop(1, mix(color, '#1a140e', 0.12));
    ctx.fillStyle = g;
    ctx.fill();

    // Fine striations inside the band.
    ctx.save();
    ctx.clip();
    const lines = Math.floor((bandH / 5) * detail);
    for (let s = 0; s < lines; s++) {
      const y = bandTop + rand() * bandH;
      ctx.strokeStyle = rand() < 0.5 ? rgba('#f6eddc', 0.05 + rand() * 0.07) : rgba('#140f0a', 0.05 + rand() * 0.08);
      ctx.lineWidth = 0.4 + rand() * 1.4;
      ctx.beginPath();
      const ph = rand() * 6.28;
      for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x / w * 6.28 + ph) * amp * 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // Seam line between laminae.
    ctx.beginPath();
    bottom.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = rgba('#120d08', 0.18 + rand() * 0.15);
    ctx.lineWidth = 0.6 + rand() * 0.8;
    ctx.stroke();
    top = bottom;
  });

  // Inclusions: pebbles and clasts.
  const pebbles = Math.floor(((w * h) / 9000) * detail);
  for (let i = 0; i < pebbles; i++) {
    const x = rand() * w, y = rand() * h;
    const r = 1 + Math.pow(rand(), 3) * 9;
    const c = palette.base[Math.floor(rand() * palette.base.length)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * 3.14);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1 + rand()), r, 0, 0, 6.28);
    ctx.fillStyle = mix(c, rand() < 0.5 ? '#efe4cf' : '#1b140d', 0.25 + rand() * 0.3);
    ctx.fill();
    ctx.strokeStyle = rgba('#0f0b07', 0.25);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.4, r * 0.22, 0, 0, 6.28);
    ctx.fillStyle = 'rgba(255,248,235,0.18)';
    ctx.fill();
    ctx.restore();
  }

  // Grain.
  const specks = Math.floor(((w * h) / 70) * detail);
  for (let i = 0; i < specks; i++) {
    const light = rand() < 0.45;
    ctx.fillStyle = light ? `rgba(255,246,228,${0.04 + rand() * 0.1})` : `rgba(14,10,6,${0.05 + rand() * 0.14})`;
    const s = rand() < 0.92 ? 1 : 2;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }

  // Hairline cracks.
  const cracks = Math.floor(1 + rand() * 3 * detail);
  for (let i = 0; i < cracks; i++) {
    let x = rand() * w, y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const len = 4 + Math.floor(rand() * 10);
    for (let k = 0; k < len; k++) {
      x += (rand() - 0.5) * 18;
      y += 4 + rand() * 14;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(10,7,4,0.35)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Cylindrical shading: the core is a drilled cylinder, lit from the upper left.
  const cyl = ctx.createLinearGradient(0, 0, w, 0);
  cyl.addColorStop(0, 'rgba(10,7,4,0.55)');
  cyl.addColorStop(0.1, 'rgba(10,7,4,0.12)');
  cyl.addColorStop(0.3, 'rgba(255,246,230,0.10)');
  cyl.addColorStop(0.45, 'rgba(255,246,230,0.02)');
  cyl.addColorStop(0.8, 'rgba(10,7,4,0.22)');
  cyl.addColorStop(1, 'rgba(10,7,4,0.62)');
  ctx.fillStyle = cyl;
  ctx.fillRect(0, 0, w, h);

  // Darken with depth.
  ctx.fillStyle = `rgba(12,9,6,${depthT * 0.35})`;
  ctx.fillRect(0, 0, w, h);

  // Fracture at the base of the year: a hairline break where one core run meets the next.
  if (o.fracture !== false) {
    const fy = h - 1.5;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    let jy = 0;
    for (let x = 0; x <= w; x += 4) {
      jy = Math.max(-1.5, Math.min(1.5, jy + (rand() - 0.5) * 1.2));
      ctx.lineTo(x, fy + jy);
    }
    ctx.strokeStyle = 'rgba(8,6,4,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Bedrock: dark crystalline basement rock. */
export function drawBedrock(ctx, { w, h, seed = 7 }) {
  const rand = rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b2520');
  g.addColorStop(1, '#141110');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Interlocking crystals.
  const n = Math.floor((w * h) / 260);
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = 2 + rand() * 7;
    ctx.beginPath();
    const sides = 4 + Math.floor(rand() * 3);
    const rot = rand() * 6.28;
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * 6.28;
      const rr = r * (0.6 + rand() * 0.6);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    const t = rand();
    ctx.fillStyle = t < 0.08 ? `rgba(220,205,180,${0.3 + rand() * 0.3})` : t < 0.3 ? `rgba(120,98,82,${0.25 + rand() * 0.3})` : `rgba(0,0,0,${0.2 + rand() * 0.3})`;
    ctx.fill();
  }
  // Mica glints.
  for (let i = 0; i < n / 6; i++) {
    ctx.fillStyle = `rgba(255,240,210,${0.2 + rand() * 0.5})`;
    ctx.fillRect(rand() * w, rand() * h, 1, 1);
  }
  const cyl = ctx.createLinearGradient(0, 0, w, 0);
  cyl.addColorStop(0, 'rgba(0,0,0,0.6)');
  cyl.addColorStop(0.3, 'rgba(255,240,220,0.06)');
  cyl.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = cyl;
  ctx.fillRect(0, 0, w, h);
}
