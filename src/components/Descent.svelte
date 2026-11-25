<script>
  import { onMount } from 'svelte';
  import Stratum from './Stratum.svelte';
  import Ceremony from './Ceremony.svelte';
  import { drawBedrock } from '../lib/rock.js';
  import { mix, luminance } from '../lib/color.js';
  import { MONTHS, num, depth, longDate } from '../lib/format.js';
  import { laminae } from '../lib/palette.js';
  import { stop } from '../lib/player.svelte.js';

  let { core, art, label, onExit } = $props();

  // Layer thickness: a floor so every year can hold its placard, plus a share ∝ hours listened.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const maxMs = Math.max(...core.years.map((y) => y.ms));
  const heights = core.years.map((y) => Math.round(vh * 0.92 + (y.ms / maxMs) * vh * 0.9));
  const lams = core.years.map(laminae);

  let sectionEls = $state([]);
  let bedrockCanvas;
  let fossilEl;
  let dustCanvas;

  let readout = $state({ depth: 0, when: 'Surface', year: null });
  let dark = $state(false);
  let ceremony = $state(false);
  let seenCeremony = false;

  const BG = ['#d8ccb6', '#b9a98f', '#7d6b57', '#3e342b', '#191512'];
  const bgAt = (p) => {
    const x = Math.min(0.9999, Math.max(0, p)) * (BG.length - 1);
    const i = Math.floor(x);
    return mix(BG[i], BG[i + 1], x - i);
  };

  function onScroll() {
    const y = scrollY;
    const doc = document.documentElement;
    const p = y / Math.max(1, doc.scrollHeight - innerHeight);
    const bg = bgAt(p);
    doc.style.setProperty('--bg', bg);
    doc.style.setProperty('--grain-y', String(-y * 0.25));
    dark = luminance(bg) < 0.2;

    // What sits under the sampling line at mid-screen?
    const probe = y + innerHeight * 0.5;
    let found = null;
    for (let i = 0; i < sectionEls.length; i++) {
      const el = sectionEls[i];
      if (!el) continue;
      const top = el.offsetTop, h = el.offsetHeight;
      if (probe >= top && probe < top + h) {
        const f = (probe - top) / h;
        const yr = core.years[i];
        const l = lams[i].find((l) => f >= l.from && f < l.to) || lams[i][0];
        found = { depth: yr.depthTop + f * (yr.depthBottom - yr.depthTop), when: `${MONTHS[l.month]} ${yr.year}`, year: yr.year };
        break;
      }
    }
    if (!found) {
      const first = sectionEls[0];
      found = first && probe < first.offsetTop ? { depth: 0, when: 'Surface', year: null } : { depth: core.totals.hours, when: 'Bedrock', year: null };
    }
    readout = found;
    lastScroll = y;
  }

  // Dust motes drifting up past the camera as we descend. They stop when the app goes still.
  let lastScroll = 0;
  onMount(() => {
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);

    // Bedrock rock texture.
    const bw = bedrockCanvas.clientWidth, bh = bedrockCanvas.clientHeight;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    bedrockCanvas.width = bw * dpr; bedrockCanvas.height = bh * dpr;
    const bctx = bedrockCanvas.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBedrock(bctx, { w: bw, h: bh });

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !seenCeremony) {
          seenCeremony = true;
          ceremony = true;
        }
      },
      { threshold: 1, rootMargin: '0px 0px -30% 0px' }
    );
    io.observe(fossilEl);

    let raf;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const ctx = dustCanvas.getContext('2d');
      const motes = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.6, v: 0.00004 + Math.random() * 0.00012, a: 0.15 + Math.random() * 0.35 }));
      let prevScroll = scrollY;
      let prevT = performance.now();
      const tick = (t) => {
        raf = requestAnimationFrame(tick);
        if (ceremony) return; // stillness
        const dt = Math.min(64, t - prevT);
        prevT = t;
        const w = innerWidth, h = innerHeight;
        if (dustCanvas.width !== w) { dustCanvas.width = w; dustCanvas.height = h; }
        const ds = (scrollY - prevScroll) / h;
        prevScroll = scrollY;
        ctx.clearRect(0, 0, w, h);
        for (const m of motes) {
          m.y -= m.v * dt + ds * 0.35 * (m.r / 2);
          if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
          if (m.y > 1.02) { m.y = -0.02; m.x = Math.random(); }
          ctx.fillStyle = dark ? `rgba(240,225,200,${m.a * 0.6})` : `rgba(60,45,30,${m.a * 0.5})`;
          ctx.beginPath();
          ctx.arc(m.x * w, m.y * h, m.r, 0, 6.28);
          ctx.fill();
        }
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  $effect(() => {
    document.body.classList.toggle('still', ceremony);
    return () => document.body.classList.remove('still');
  });

  // ── Dragging the timeline ────────────────────────────────────────────────────
  // 1. Grab the ruler or the core with a mouse and the rock follows the hand (touch already scrolls natively),
  //    with a little inertia on release.
  // 2. The depth readout is a scrubber: drag it to race through the whole core, like a scrollbar thumb.
  let dragging = $state(false);
  let inertia = 0;

  function grab(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!e.target.closest('.ruler, .core, .bcore')) return;
    e.preventDefault();
    cancelAnimationFrame(inertia);
    const startY = e.clientY, startScroll = scrollY;
    let lastY = e.clientY, lastT = performance.now(), v = 0;
    dragging = true;
    const move = (ev) => {
      const now = performance.now();
      v = 0.8 * v + 0.2 * ((ev.clientY - lastY) / Math.max(1, now - lastT));
      lastY = ev.clientY; lastT = now;
      scrollTo(0, startScroll - (ev.clientY - startY));
    };
    const up = () => {
      dragging = false;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      let vel = -v * 16; // px per frame
      const glide = () => {
        if (Math.abs(vel) < 0.5) return;
        scrollBy(0, vel);
        vel *= 0.94;
        inertia = requestAnimationFrame(glide);
      };
      if (performance.now() - lastT < 80) inertia = requestAnimationFrame(glide);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  function scrub(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelAnimationFrame(inertia);
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch {}
    const startY = e.clientY, startScroll = scrollY;
    const travel = document.documentElement.scrollHeight - innerHeight;
    // Dragging the readout across ~70% of the screen covers the whole core.
    const ratio = travel / (innerHeight * 0.7);
    dragging = true;
    const move = (ev) => scrollTo(0, Math.max(0, Math.min(travel, startScroll + (ev.clientY - startY) * ratio)));
    const up = () => {
      dragging = false;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function scrubKey(e) {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 }[e.key];
    if (!step) return;
    e.preventDefault();
    scrollBy({ top: step * innerHeight * 0.5, behavior: 'smooth' });
  }

  $effect(() => {
    document.body.classList.toggle('dragging', dragging);
  });

  $effect(() => {
    if (ceremony) stop(); // the app goes still, the music too
  });
  onMount(() => stop);

  function toBedrock() {
    fossilEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const start = core.years.at(-1)?.year;
  const end = core.years[0]?.year;
</script>

<canvas class="dust" bind:this={dustCanvas} aria-hidden="true"></canvas>

<header class="bar" class:dark>
  <button class="mono back" onclick={onExit}>↑ Surface</button>
  <span class="mono what">{label} · {start}–{end}</span>
  <button class="mono skip" onclick={toBedrock}>Bedrock ↓</button>
</header>

<!-- The sampling line: a fixed hairline across the core with a live readout. -->
<div class="probe" class:hidden={readout.when === 'Surface'}>
  <div
    class="readout mono"
    class:dark
    role="slider"
    tabindex="0"
    aria-label="Depth. Drag to travel through time"
    aria-valuemin="0"
    aria-valuemax={Math.round(core.totals.hours)}
    aria-valuenow={Math.round(readout.depth)}
    aria-valuetext="{depth(readout.depth, 0)} deep, {readout.when}"
    title="Drag to travel through time"
    onpointerdown={scrub}
    onkeydown={scrubKey}
  >
    <span class="grip" aria-hidden="true">⇕</span>
    <span class="d">{depth(readout.depth)} deep</span>
    <span class="w">{readout.when}</span>
  </div>
  <div class="hair"></div>
</div>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<main class="descent" class:dark onpointerdown={grab}>
  <section class="collar">
    <p class="mono kicker">Ground level · {longDate(core.range.end)}</p>
    <h1>{label}</h1>
    <p class="sub"><em>{core.years.length} strata. {core.estimated ? '≈' : ''}{num(core.totals.hours, 0)} hours of listening{core.estimated ? ', estimated' : ''}.<br />Every hour laid down a little more rock.</em></p>
    {#if core.source && core.source !== 'unknown'}<p class="mono src">Drilled from {core.source}</p>{/if}
    <p class="mono cue">Descend <span aria-hidden="true">↓</span></p>
  </section>

  {#each core.years as year, i (year.year)}
    <Stratum {year} index={i} count={core.years.length} {art} height={heights[i]} bind:el={sectionEls[i]} />
  {/each}

  <section class="bedrock">
    <div class="ruler"></div>
    <div class="bcore">
      <canvas bind:this={bedrockCanvas}></canvas>
      <div class="fossil" bind:this={fossilEl}></div>
    </div>
    <div class="bplacard">
      <p class="mono">Bedrock · {depth(core.totals.hours, 0)} deep</p>
      <p class="btitle">Below this, silence.</p>
      <button class="mono again" onclick={() => (ceremony = true)}>View the specimen</button>
    </div>
  </section>
  <footer class="mono foot">
    <span>Strata — your listening, carbon-dated.</span>
    <a href="https://github.com/paulbouharoun/strata" target="_blank" rel="noreferrer">Source</a>
  </footer>
</main>

{#if ceremony}
  <Ceremony {core} {art} onClose={() => (ceremony = false)} onSurface={onExit} />
{/if}

<style>
  :global(:root) {
    --ruler-w: 96px;
    --core-w: min(300px, 30vw);
    --line: rgba(42, 33, 25, 0.35);
    --meter-ink: rgba(42, 33, 25, 0.75);
    --col-max: 980px;
  }
  .descent.dark { --line: rgba(236, 226, 207, 0.3); --meter-ink: rgba(236, 226, 207, 0.7); }
  .descent { max-width: var(--col-max); margin: 0 auto; padding: 0 var(--gutter); position: relative; }

  .dust { position: fixed; inset: 0; z-index: 3; pointer-events: none; width: 100vw; height: 100vh; }

  .bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 20;
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 14px var(--gutter);
    color: var(--ink);
    background: linear-gradient(to bottom, var(--bg) 40%, transparent);
    transition: color 0.4s;
  }
  .bar.dark { color: var(--bone); }
  .bar button { background: none; border: 1px solid currentColor; padding: 8px 12px; cursor: pointer; min-height: 36px; }
  .what { opacity: 0.75; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .probe {
    position: fixed; z-index: 10; pointer-events: none;
    top: 50%;
    left: max(var(--gutter), calc((100vw - var(--col-max)) / 2 + var(--gutter)));
    width: calc(var(--ruler-w) + var(--core-w) + 16px);
  }
  .probe { transition: opacity 0.4s; }
  .probe.hidden { opacity: 0; }
  .hair { height: 1px; background: #d9b46a; box-shadow: 0 0 6px rgba(217, 180, 106, 0.8); }
  .readout {
    position: absolute; bottom: 6px; left: calc(var(--ruler-w) + 8px);
    display: flex; flex-direction: column; gap: 1px;
    background: rgba(25, 20, 16, 0.82); color: #f0e6d2;
    padding: 5px 8px; font-size: 11px; line-height: 1.25;
    border-left: 2px solid #d9b46a;
    font-variant-numeric: tabular-nums;
  }
  .readout {
    pointer-events: auto; cursor: ns-resize; touch-action: none; user-select: none;
    padding-left: 22px;
    transition: background 0.2s, transform 0.2s;
  }
  .readout:hover, :global(body.dragging) .readout { background: rgba(25, 20, 16, 0.95); }
  .readout:focus-visible { outline: 2px solid #d9b46a; outline-offset: 2px; }
  .grip { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); color: #d9b46a; font-size: 12px; }
  .readout .d { font-size: 13px; white-space: nowrap; }
  .descent :global(.ruler), .descent :global(.core), .bcore { cursor: grab; }
  :global(body.dragging), :global(body.dragging) * { cursor: grabbing !important; user-select: none !important; }
  .readout .w { opacity: 0.75; font-size: 10px; }

  .collar { min-height: 78svh; display: flex; flex-direction: column; justify-content: flex-end; padding: 110px 0 48px; }
  .kicker { margin: 0 0 10px; color: var(--ink-soft); }
  h1 { font-weight: 400; font-size: clamp(54px, 11vw, 120px); line-height: 0.9; margin: 0; }
  .sub { font-size: 21px; color: var(--ink-soft); margin: 14px 0 28px; }
  .src { margin: -14px 0 24px; color: var(--ink-soft); }
  .cue { margin: 0; animation: bob 2.4s ease-in-out infinite; }
  @keyframes bob { 50% { transform: translateY(6px); } }

  .bedrock { display: grid; grid-template-columns: var(--ruler-w) var(--core-w) 1fr; height: 110vh; }
  .ruler { border-right: 1px solid var(--line); }
  .bcore { position: relative; }
  .bcore canvas { width: 100%; height: 100%; display: block; }
  .fossil {
    position: absolute; left: 50%; top: 32%; width: 34px; height: 34px; transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #f3d89a, #a07a35 60%, #4a3619);
    box-shadow: 0 0 0 6px rgba(217, 180, 106, 0.15), 0 0 30px rgba(217, 180, 106, 0.55);
  }
  .bplacard { padding: 28vh 0 0 clamp(12px, 3vw, 40px); color: var(--bone); }
  .bplacard .mono { opacity: 0.7; }
  .btitle { font-size: clamp(24px, 4vw, 40px); margin: 6px 0 16px; font-style: italic; }
  .again { background: none; border: 1px solid currentColor; color: var(--bone); padding: 10px 14px; cursor: pointer; opacity: 1; }
  .foot { display: flex; justify-content: space-between; padding: 28px 0 40px; color: rgba(236, 226, 207, 0.55); }
  .foot a { color: inherit; }

  @media (max-width: 560px) {
    :global(:root) { --ruler-w: 44px; --core-w: 26vw; }
    .what { display: none; }
    .bar { padding-top: max(12px, env(safe-area-inset-top)); }
    .sub { font-size: 18px; }
  }
</style>
