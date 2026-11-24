// The share card: "My first stream was X, on [date]" + the full cross-section. 1080×1350 (4:5).
import { drawStratum, drawBedrock, rng } from './rock.js';
import { strataPalette, laminae } from './palette.js';
import { artKey } from './color.js';
import { longDate, num } from './format.js';
import { loadImage } from './art-runtime.js';

const SERIF = '"IM Fell English", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
export const SITE = 'strata · your listening, carbon-dated';

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx, text, maxW, maxLines, size, min, family, style = '') {
  let s = size;
  for (; s >= min; s -= 4) {
    ctx.font = `${style} ${s}px ${family}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { lines, size: s };
  }
  ctx.font = `${style} ${min}px ${family}`;
  const lines = wrap(ctx, text, maxW).slice(0, maxLines);
  lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  return { lines, size: min };
}

export async function renderCard(core, art) {
  await Promise.all([
    document.fonts.load(`400 80px "IM Fell English"`),
    document.fonts.load(`italic 400 40px "IM Fell English"`),
    document.fonts.load(`400 20px "IBM Plex Mono"`),
    document.fonts.load(`500 20px "IBM Plex Mono"`),
  ]).catch(() => {});

  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Ground.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2a231c');
  bg.addColorStop(1, '#100d0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const rand = rng(99);
  for (let i = 0; i < 60000; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(255,240,215,${rand() * 0.05})` : `rgba(0,0,0,${rand() * 0.12})`;
    ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5);
  }

  // Cross-section on the left.
  const coreX = 96, coreW = 150, top = 150, bedH = 70, bottom = H - 120;
  const avail = bottom - top - bedH;
  const minH = 26;
  const totalH = core.years.reduce((s, y) => s + y.ms, 0) || 1;
  const extra = avail - minH * core.years.length;
  let y = top;
  ctx.font = `500 17px ${MONO}`;
  ctx.textBaseline = 'middle';
  core.years.forEach((yr, i) => {
    const h = Math.round(minH + (yr.ms / totalH) * extra);
    const depthT = i / Math.max(1, core.years.length - 1);
    const off = document.createElement('canvas');
    off.width = coreW; off.height = h;
    drawStratum(off.getContext('2d'), { w: coreW, h, palette: strataPalette(yr, art, depthT), laminae: laminae(yr), seed: yr.year * 31, depthT, detail: 0.6 });
    ctx.drawImage(off, coreX, y);
    // Tick + year.
    ctx.fillStyle = 'rgba(232,222,204,0.45)';
    ctx.fillRect(coreX + coreW + 10, y, 14, 1);
    if (h >= 22) {
      ctx.fillStyle = '#e9dfcc';
      ctx.fillText(String(yr.year), coreX + coreW + 32, y + Math.min(h / 2, 20));
    }
    y += h;
  });
  const bed = document.createElement('canvas');
  bed.width = coreW; bed.height = bedH;
  drawBedrock(bed.getContext('2d'), { w: coreW, h: bedH });
  ctx.drawImage(bed, coreX, y);
  ctx.fillStyle = '#c9a86a';
  ctx.fillText('BEDROCK', coreX + coreW + 32, y + bedH / 2);
  // A gold pin where the fossil sits.
  ctx.beginPath();
  ctx.arc(coreX + coreW / 2, y + 16, 6, 0, 6.28);
  ctx.fillStyle = '#d9b46a';
  ctx.fill();

  // Header.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e9dfcc';
  ctx.font = `500 22px ${MONO}`;
  ctx.letterSpacing = '8px';
  ctx.fillText('STRATA', coreX, 92);
  ctx.letterSpacing = '0px';
  ctx.font = `400 18px ${MONO}`;
  ctx.fillStyle = 'rgba(233,223,204,0.55)';
  ctx.textAlign = 'right';
  ctx.fillText(`CORE ${core.years.at(-1)?.year ?? ''}–${core.years[0]?.year ?? ''} · ${num(core.totals.hours, 0)} M`, W - 90, 92);
  ctx.textAlign = 'left';

  // Text column.
  const tx = 420, tw = W - tx - 90;
  const b = core.bedrock;
  let ty = 250;
  ctx.fillStyle = 'rgba(233,223,204,0.75)';
  ctx.font = `italic 400 44px ${SERIF}`;
  ctx.fillText('My first stream was', tx, ty);
  ty += 28;
  ctx.fillStyle = '#f3ead8';
  const title = fitText(ctx, b.track, tw, 3, 96, 52, SERIF, '400');
  for (const l of title.lines) {
    ty += title.size * 1.02;
    ctx.fillText(l, tx, ty);
  }
  ty += 62;
  ctx.font = `400 40px ${SERIF}`;
  ctx.fillStyle = '#d9b46a';
  for (const l of fitText(ctx, `by ${b.artist},`, tw, 2, 44, 30, SERIF).lines) {
    ctx.fillText(l, tx, ty);
    ty += 50;
  }
  ctx.fillStyle = 'rgba(233,223,204,0.75)';
  ctx.font = `italic 400 44px ${SERIF}`;
  ctx.fillText(`on ${longDate(b.ts)}.`, tx, ty + 4);
  ty += 60;

  // Specimen case with the cover.
  const a = art[artKey(b.track, b.artist)];
  const caseS = Math.min(300, bottom - ty - 150);
  const cx = tx, cy = ty + 20;
  if (caseS > 120) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx + 10, cy + 14, caseS, caseS);
    ctx.fillStyle = '#1b1611';
    ctx.fillRect(cx, cy, caseS, caseS);
    let drew = false;
    if (a?.url) {
      try {
        const img = await loadImage(a.url);
        ctx.drawImage(img, cx + 18, cy + 18, caseS - 36, caseS - 36);
        drew = true;
      } catch {}
    }
    if (!drew) {
      ctx.fillStyle = '#3a3027';
      ctx.fillRect(cx + 18, cy + 18, caseS - 36, caseS - 36);
    }
    // Glass.
    const glass = ctx.createLinearGradient(cx, cy, cx + caseS, cy + caseS);
    glass.addColorStop(0, 'rgba(255,255,255,0.18)');
    glass.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    glass.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = glass;
    ctx.fillRect(cx, cy, caseS, caseS);
    ctx.strokeStyle = 'rgba(217,180,106,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 1, cy + 1, caseS - 2, caseS - 2);
    ctx.font = `400 16px ${MONO}`;
    ctx.fillStyle = 'rgba(233,223,204,0.6)';
    ctx.fillText(b.precision === 'day' ? 'SPECIMEN 0001' : `SPECIMEN 0001 · ${new Date(b.ts).toISOString().slice(11, 16)} UTC`, cx, cy + caseS + 34);
  }

  // Stats + footer.
  ctx.font = `400 19px ${MONO}`;
  ctx.fillStyle = 'rgba(233,223,204,0.7)';
  const stats = [`${core.estimated ? '≈' : ''}${num(core.totals.hours, 0)} m of listening`, `${core.years.length} strata`, `${num(core.totals.artists)} artists`];
  ctx.fillText(stats.join('  ·  '), tx, bottom - 6);
  ctx.fillStyle = 'rgba(233,223,204,0.4)';
  ctx.font = `400 17px ${MONO}`;
  ctx.fillText(SITE.toUpperCase(), coreX, H - 60);
  return c;
}

export async function cardBlob(core, art) {
  const c = await renderCard(core, art);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
