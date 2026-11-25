// The globe view: what happened in tech & AI while you were listening, three headlines a season,
// each tied to the track you had on that day. Imperative DOM + Canvas inside a host element;
// lazy-loaded (d3-geo, topojson and the world map only ship when someone opens it).
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoInterpolate } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { stopAll } from './player.svelte.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOME = [33.89, 35.5]; // Beirut: a small brass cross marks home
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtCoord = (c) => (c ? `${Math.abs(c[0]).toFixed(1)}°${c[0] >= 0 ? 'N' : 'S'} ${Math.abs(c[1]).toFixed(1)}°${c[1] >= 0 ? 'E' : 'W'}` : '');
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const dayLabel = (d) => (d === 0 ? 'that day' : d === -1 ? 'the day before' : d === 1 ? 'the day after' : d < 0 ? `${-d} days before` : `${d} days after`);

function readLinks(ev) {
  const parts = [];
  if (ev.news?.url) parts.push(`<a href="${esc(ev.news.url)}" target="_blank" rel="noopener">${esc(ev.news.outlet || 'News')} ↗</a>`);
  if (ev.url) parts.push(`<a href="${esc(ev.url)}" target="_blank" rel="noopener">Wikipedia ↗</a>`);
  return parts.length ? `<span class="read">Read · ${parts.join(' · ')}</span>` : '';
}

function linkLine(ev) {
  const n = ev.needle;
  if (n && ev.grave) return `<span class="quiet">You listened for ${n.minutes} minutes ${dayLabel(n.offset)}.</span>`;
  if (!n) return `<span class="quiet">A quiet week for your headphones.</span>`;
  let s = `<span class="needle">${cap(dayLabel(n.offset))}, your needle was on <i>“${esc(n.track)}”</i> by ${esc(n.artist)} · from ${n.at}</span>`;
  if (n.origin && n.km != null) s += `<span class="arc">${esc(n.origin.place)} → ${esc(ev.where || 'here')}: ${n.km.toLocaleString('en-GB')} km</span>`;
  if (ev.echo?.length) s += `<span class="echo">echo: the song and the headline share “${ev.echo.map(esc).join('”, “')}”</span>`;
  return s;
}

// Spotify's player, one at a time. Shares the app's IFrame API loader.
const loadSpotify = () =>
  (window.__strataSpotify ||= new Promise((resolve, reject) => {
    window.onSpotifyIframeApiReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 8000);
  }));

/**
 * @param {HTMLElement} root
 * @param {{ seasons: any[] }} data
 * @param {{ topOffset?: number }} [opts]
 * @returns {() => void} destroy
 */
export function mountOrrery(root, data, opts = {}) {
  const top = opts.topOffset ?? 0;
  const seasons = data.seasons.filter((s) => s.headlines.length).sort((a, b) => b.year - a.year || b.q - a.q);

  root.innerHTML = `
    <div class="stage">
      <div class="case" style="--top:${top}px">
        <p class="era mono">—</p>
        <div class="globe-wrap"><canvas aria-label="Globe showing where each headline of the season in view happened"></canvas></div>
        <div class="dial mono"><span>Lat <b data-lat>—</b></span><span>Lon <b data-lon>—</b></span><span data-when>—</span></div>
      </div>
      <div class="years"></div>
    </div>`;
  const yearsEl = root.querySelector('.years');
  const caseEl = root.querySelector('.case');
  const eraEl = root.querySelector('.era');
  const canvas = root.querySelector('canvas');
  const latEl = root.querySelector('[data-lat]'), lonEl = root.querySelector('[data-lon]'), whenEl = root.querySelector('[data-when]');

  const items = [];
  for (const s of seasons) {
    const sec = document.createElement('section');
    sec.className = 'season';
    sec.dataset.key = s.key;
    sec.dataset.label = `${s.name} ${s.year}`;
    sec.innerHTML = `
      <div class="oplacard">
        <div class="head mono"><span>${s.name} ${s.year} · ${s.months}</span><span>${s.hours} h</span></div>
        <h2>${s.name} <small>${s.year}</small></h2>
        <h3 class="mono">You were listening to</h3>
        <ul class="music">${s.artists.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
        <p class="wonder">What happened in tech &amp; AI while you were listening…</p>
        <ol class="events"></ol>
        <p class="credit mono">Headlines from Wikipedia’s <a href="https://en.wikipedia.org/wiki/${s.year}_in_artificial_intelligence" target="_blank" rel="noopener">AI</a>, computing and science timelines (CC BY-SA 4.0) · ◆ AI · places from Wikidata (CC0) · origins from MusicBrainz</p>
      </div>`;
    const ol = sec.querySelector('ol');
    for (const ev of s.headlines) {
      const li = document.createElement('li');
      li.className = `${ev.category === 'ai' ? 'ai' : ''}${ev.grave ? ' grave' : ''}`;
      // The song you had on that day, as a sleeve under the date (never beside a grave headline).
      const n = ev.needle;
      const sleeve = n?.cover && !ev.grave ? `<img class="sleeve" src="${esc(n.cover)}" alt="" width="44" height="44" loading="lazy" title="${esc(n.track)} by ${esc(n.artist)}">` : '';
      const listen = n?.id && !ev.grave ? `<button class="listen" data-id="${esc(n.id)}" aria-expanded="false" aria-label="Listen to ${esc(n.track)} on Spotify" title="Listen on Spotify">▶</button>` : '';
      li.innerHTML = `<span class="d mono"><span class="date">${ev.cited ? '<small>Rep.</small> ' : ''}${String(ev.day).padStart(2, '0')} ${MONTHS[ev.month]}</span>${sleeve}${listen}</span>
        <span class="t">${esc(ev.text.length > 170 ? ev.text.slice(0, 167) + '…' : ev.text)}<span class="w mono">${ev.where ? esc(ev.where) + ' · ' : ''}${fmtCoord(ev.coord)}</span>${readLinks(ev)}<span class="link mono">${linkLine(ev)}</span><span class="player" hidden></span></span>`;
      li.addEventListener('click', (e) => {
        if (!e.target.closest('a, button, .player')) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      li.querySelector('.listen')?.addEventListener('click', (e) => toggleListen(e.currentTarget, li));
      ol.append(li);
      items.push({ ev, li, key: s.key });
    }
    yearsEl.append(sec);
  }

  // ── Listen ────────────────────────────────────────────────────────────────────────
  let openPlayer = null;
  function closePlayer() {
    if (!openPlayer) return;
    openPlayer.controller?.destroy?.();
    openPlayer.host.innerHTML = '';
    openPlayer.host.hidden = true;
    openPlayer.btn.setAttribute('aria-expanded', 'false');
    openPlayer.btn.textContent = '▶';
    openPlayer = null;
  }
  async function toggleListen(btn, li) {
    if (openPlayer?.btn === btn) return closePlayer();
    closePlayer();
    stopAll(); // the app's own previews
    const host = li.querySelector('.player');
    const id = btn.dataset.id;
    openPlayer = { btn, host, controller: null };
    host.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = '×';
    try {
      const api = await loadSpotify();
      if (openPlayer?.btn !== btn) return;
      const el = document.createElement('div');
      host.append(el);
      api.createController(el, { uri: `spotify:track:${id}`, width: '100%', height: 80 }, (c) => {
        if (openPlayer?.btn !== btn) return c.destroy();
        openPlayer.controller = c;
        c.addListener('ready', () => c.play());
      });
    } catch {
      host.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${esc(id)}" allow="autoplay; encrypted-media" title="Spotify player"></iframe>`;
    }
  }

  // ── Globe ─────────────────────────────────────────────────────────────────────────
  const landGeo = feature(land110, land110.objects.land);
  const grat = geoGraticule10();
  const ctx = canvas.getContext('2d');
  const proj = geoOrthographic().clipAngle(90).precision(0.6);
  const path = geoPath(proj, ctx);
  let size = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    size = canvas.clientWidth;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    proj.translate([size / 2, size / 2]).scale(size / 2 - 6);
  }

  let active = null, activeKey = null;
  let rot = [-HOME[1], -20, 0], target = rot.slice();
  let dragging = false;

  function readingLine() {
    const mid = innerWidth <= 760 ? caseEl.getBoundingClientRect().bottom + 70 : top + (innerHeight - top) * 0.5;
    // At the top of the view, start on the newest season's first headline.
    if (yearsEl.getBoundingClientRect().top > mid - 40 && items.length) return { best: items[0], key: items[0].key };
    let best = null, bd = Infinity;
    for (const it of items) {
      const r = it.li.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bd) { bd = d; best = it; }
    }
    let key = null;
    for (const s of yearsEl.children) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) key = s.dataset.key;
    }
    return { best, key: key || best?.key };
  }

  function onScroll() {
    const { best, key } = readingLine();
    if (key !== activeKey) {
      activeKey = key;
      const sec = key && yearsEl.querySelector(`[data-key="${key}"]`);
      eraEl.textContent = sec ? sec.dataset.label : '—';
    }
    if (best && best !== active) {
      active?.li.classList.remove('on');
      active = best;
      best.li.classList.add('on');
      setTarget(best.ev);
    }
  }

  function setTarget(ev) {
    if (!ev.coord) return;
    // With an arc to draw (artist's home → headline), frame its midpoint so both ends show.
    let focus = ev.coord;
    const o = !ev.grave && ev.needle?.origin;
    if (o && ev.needle.km != null && ev.needle.km < 15000) {
      const m = geoInterpolate([o.coord[1], o.coord[0]], [ev.coord[1], ev.coord[0]])(0.5);
      focus = [m[1], m[0]];
    }
    // Turn westward, as if winding the world back, unless that's nearly a full lap.
    let λ = -focus[1];
    while (λ > rot[0]) λ -= 360;
    if (rot[0] - λ > 300) λ += 360;
    target = [λ, -Math.max(-50, Math.min(50, focus[0])) * 0.8, 0];
    latEl.textContent = `${Math.abs(ev.coord[0]).toFixed(2)}°${ev.coord[0] >= 0 ? 'N' : 'S'}`;
    lonEl.textContent = `${Math.abs(ev.coord[1]).toFixed(2)}°${ev.coord[1] >= 0 ? 'E' : 'W'}`;
    whenEl.textContent = `${ev.day} ${MONTHS[ev.month]} ${ev.year}`;
  }

  // Drag to spin freely; release and it drifts back to the headline under the reading line.
  let last = null;
  const down = (e) => { dragging = true; last = [e.clientX, e.clientY]; try { canvas.setPointerCapture(e.pointerId); } catch {} canvas.style.cursor = 'grabbing'; };
  const move = (e) => {
    if (!dragging) return;
    const k = 180 / size;
    rot[0] += (e.clientX - last[0]) * k;
    rot[1] = Math.max(-70, Math.min(70, rot[1] - (e.clientY - last[1]) * k));
    last = [e.clientX, e.clientY];
  };
  const release = () => { dragging = false; canvas.style.cursor = 'grab'; if (active) setTarget(active.ev); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  function draw(t) {
    raf = requestAnimationFrame(draw);
    if (!dragging) rot = rot.map((v, i) => v + (target[i] - v) * (reduce ? 1 : 0.06));
    if (size < 40) return;
    proj.rotate(rot);
    const pulse = (t / 1000) % 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const R = proj.scale(), c = size / 2;

    // Paper sphere with a soft limb shadow, like a varnished library globe.
    const g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
    g.addColorStop(0, '#f3ead6'); g.addColorStop(0.7, '#e2d4b8'); g.addColorStop(1, '#b8a27d');
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(93,79,64,.28)'; ctx.lineWidth = 0.5; ctx.stroke();
    // Land: engraved hatching clipped to the coastlines, then an ink outline.
    ctx.save();
    ctx.beginPath(); path(landGeo); ctx.fillStyle = 'rgba(169,130,63,.22)'; ctx.fill(); ctx.clip();
    ctx.strokeStyle = 'rgba(60,45,30,.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let x = -size; x < size * 2; x += 4) { ctx.moveTo(x, 0); ctx.lineTo(x + size, size); }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath(); path(landGeo); ctx.strokeStyle = '#3a2d21'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = '#2a2119'; ctx.lineWidth = 1.2; ctx.stroke();

    // Pins for the season in view; the active one inked (a still ring for grave news, a ripple otherwise).
    const center = [-rot[0], -rot[1]];
    for (const it of items) {
      if (it.key !== activeKey || !it.ev.coord) continue;
      const ll = [it.ev.coord[1], it.ev.coord[0]];
      if (geoDistance(ll, center) > Math.PI / 2 - 0.02) continue;
      const [x, y] = proj(ll);
      const on = it === active;
      ctx.beginPath(); ctx.arc(x, y, on ? 4 : 2.2, 0, 7);
      ctx.fillStyle = it.ev.category === 'ai' ? '#a9823f' : on ? '#2a2119' : 'rgba(42,33,25,.55)';
      ctx.fill();
      if (on) {
        ctx.beginPath(); ctx.arc(x, y, it.ev.grave || reduce ? 9 : 6 + pulse * 10, 0, 7);
        ctx.strokeStyle = it.ev.grave ? 'rgba(42,33,25,.6)' : `rgba(42,33,25,${0.6 * (1 - pulse)})`;
        ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // The arc from the needle's artist's home town to the headline.
    const n = active && !active.ev.grave && active.ev.needle;
    if (n?.origin && active.ev.coord && active.key === activeKey) {
      const a = [n.origin.coord[1], n.origin.coord[0]], b = [active.ev.coord[1], active.ev.coord[0]];
      const interp = geoInterpolate(a, b);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); path({ type: 'LineString', coordinates: Array.from({ length: 65 }, (_, i) => interp(i / 64)) });
      ctx.strokeStyle = 'rgba(138,75,47,.85)'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.restore();
      if (geoDistance(a, center) < Math.PI / 2) {
        const [x, y] = proj(a);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = '#8a4b2f'; ctx.fill();
        ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#5d4f40';
        ctx.fillText(`♪ ${n.origin.place}`, x + 6, y - 6);
      }
    }
    const hl = [HOME[1], HOME[0]];
    if (geoDistance(hl, center) < Math.PI / 2) {
      const [x, y] = proj(hl);
      ctx.strokeStyle = '#8a4b2f'; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
    }
  }

  resize();
  const ro = new ResizeObserver(() => { resize(); onScroll(); });
  ro.observe(canvas);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('scroll', onScroll);
    closePlayer();
    root.innerHTML = '';
  };
}
