<script>
  import { drawStratum } from '../lib/rock.js';
  import { strataPalette, laminae } from '../lib/palette.js';
  import { artKey } from '../lib/color.js';
  import { thumb } from '../lib/itunes.js';
  import { MONTHS, roman, num, eraName, depth } from '../lib/format.js';
  import { player, toggle } from '../lib/player.svelte.js';

  let { year, index, count, art, height, el = $bindable() } = $props();

  const depthT = $derived(count > 1 ? index / (count - 1) : 0);
  const palette = $derived(strataPalette(year, art, depthT));
  const lam = $derived(laminae(year));
  // Month labels down the ruler, skipping any that would collide with the one above (thin, quiet months).
  const ticks = $derived.by(() => {
    const out = [];
    let last = -Infinity;
    for (const l of lam) {
      const y = l.from * height;
      if (y - last < 16) continue;
      out.push(l);
      last = y;
    }
    return out;
  });
  const ordinal = $derived(count - index); // the oldest layer is stratum I

  let canvas;
  let near = $state(false);
  let coreW = $state(0);

  $effect(() => {
    const io = new IntersectionObserver(([e]) => (near = e.isIntersecting), { rootMargin: '120% 0px' });
    io.observe(el);
    return () => io.disconnect();
  });

  $effect(() => {
    if (!canvas) return;
    if (!near || !coreW) {
      // Free GPU memory for strata far off-screen (matters on phones).
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.round(coreW * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStratum(ctx, { w: coreW, h: height, palette, laminae: lam, seed: year.year * 31, depthT, detail: coreW < 160 ? 0.7 : 1 });
  });

  const hours = $derived(year.ms / 3_600_000);
  const topShare = $derived(year.topArtists[0]?.ms || 1);
</script>

<section class="stratum" bind:this={el} style:height="{height}px" aria-labelledby="era-{year.year}">
  <div class="ruler" aria-hidden="true">
    <span class="year mono">{year.year}</span>
    {#each ticks as l, i (l.month)}
      <span class="tick mono" class:lead={i === 0} style:top="{l.from * 100}%">{MONTHS[l.month]}</span>
    {/each}
  </div>

  <div class="core" bind:clientWidth={coreW}>
    <canvas bind:this={canvas} style:height="{height}px" role="img" aria-label="Rock layer for {year.year}"></canvas>
  </div>

  <div class="placard-wrap">
    <article class="placard">
      <header class="mono head">
        <span>Stratum {roman(ordinal)}</span>
        <span>{year.year}</span>
      </header>
      <h2 id="era-{year.year}">{eraName(year)}</h2>
      <dl class="coords mono">
        <div><dt>Depth, hours</dt><dd>{num(year.depthTop, 0)} → {num(year.depthBottom, 0)}</dd></div>
        <div><dt>Streams</dt><dd>{num(year.streams)}</dd></div>
        <div><dt>Hours</dt><dd>{num(hours, 0)}</dd></div>
        <div><dt>Artists</dt><dd>{num(year.artistCount)}</dd></div>
      </dl>

      <h3 class="mono">Principal deposits</h3>
      <ol class="artists">
        {#each year.topArtists.slice(0, 5) as a, i (a.name)}
          <li>
            <span class="swatch" style:background={palette.artists[i]}></span>
            <span class="name">{a.name}</span>
            <span class="bar" style:width="{(a.ms / topShare) * 100}%"></span>
          </li>
        {/each}
      </ol>

      <h3 class="mono">Characteristic specimens</h3>
      <ul class="tracks">
        {#each year.topTracks.slice(0, 3) as t, i (t.track + t.artist)}
          {@const a = art[artKey(t.track, t.artist)]}
          <li>
            {#if a?.url && a.preview}
              {@const key = artKey(t.track, t.artist)}
              {@const active = player.key === key}
              <button
                class="sleeve"
                class:active
                onclick={() => toggle(key, a.preview)}
                aria-label="{active && player.playing ? 'Pause' : 'Play'} a preview of {t.track} by {t.artist}"
                style:--p={active ? player.progress : 0}
              >
                <img src={thumb(a.url, 100)} alt="" width="44" height="44" loading="lazy" crossorigin="anonymous" />
                <span class="glyph" aria-hidden="true">{#if active && player.loading}<span class="spin"></span>{:else if active && player.playing}❚❚{:else}▶{/if}</span>
                <span class="ring" aria-hidden="true"></span>
              </button>
            {:else if a?.url}
              <img src={thumb(a.url, 100)} alt="" width="44" height="44" loading="lazy" crossorigin="anonymous" />
            {:else}
              <span class="noart" style:background={palette.base[i % palette.base.length]}></span>
            {/if}
            <span class="t">
              <span class="title">{t.track}</span>
              <span class="by">{t.artist} · <span class="mono n">{num(t.streams)}×</span></span>
            </span>
          </li>
        {/each}
      </ul>

      {#if year.discoveries.length}
        <p class="first"><span class="mono">First appearance</span> <em>{year.discoveries.slice(0, 3).join(', ')}</em></p>
      {/if}
    </article>
  </div>
</section>

<style>
  .stratum {
    display: grid;
    grid-template-columns: var(--ruler-w) var(--core-w) 1fr;
    position: relative;
  }
  .ruler {
    position: relative;
    border-right: 1px solid var(--line);
    background: repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px 24px) right top / 8px 100% no-repeat;
  }
  .tick {
    position: absolute;
    right: 10px;
    transform: translateY(-1px);
    font-size: 9.5px;
    color: var(--meter-ink);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  /* The year sits on the same line as the stratum's first month, set larger and bold. */
  .year {
    position: absolute;
    top: 0;
    right: 44px;
    transform: translateY(-3px);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--meter-ink);
  }
  .tick::after {
    content: '';
    position: absolute;
    right: -10px;
    top: 0;
    width: 14px;
    border-top: 1px solid var(--meter-ink);
  }
  .core { position: relative; box-shadow: 10px 0 28px rgba(12, 8, 4, 0.28); }
  canvas { display: block; width: 100%; background: #3d342a; }

  .placard-wrap { padding: 0 0 0 clamp(12px, 3vw, 40px); }
  .placard {
    position: sticky;
    top: 92px;
    margin-top: 28px;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--paper-edge);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset, 0 18px 40px -20px rgba(10, 6, 2, 0.6);
    padding: 16px 18px 18px;
    max-width: 440px;
  }
  .head { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--ink-soft); border-bottom: 1px solid var(--paper-edge); padding-bottom: 8px; }
  h2 { font-weight: 400; font-size: clamp(22px, 3.2vw, 32px); line-height: 1.05; margin: 12px 0 12px; overflow-wrap: anywhere; }
  .coords { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin: 0 0 14px; font-size: 10.5px; }
  .coords div { display: flex; flex-direction: column; }
  dt { color: var(--ink-soft); font-size: 9.5px; }
  dd { margin: 0; color: var(--ink); }
  h3 { font-weight: 400; font-size: 10px; color: var(--ink-soft); margin: 14px 0 6px; border-top: 1px dotted var(--paper-edge); padding-top: 10px; }
  .artists { list-style: none; padding: 0; margin: 0; }
  .artists li { position: relative; display: flex; align-items: center; gap: 8px; font-size: 16px; padding: 2px 0; }
  .swatch { width: 10px; height: 10px; flex: none; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25) inset; }
  .name { position: relative; z-index: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { position: absolute; left: 18px; bottom: 2px; height: 1px; background: var(--brass); opacity: 0.7; max-width: calc(100% - 18px); }
  .tracks { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .tracks li { display: flex; gap: 10px; align-items: center; min-width: 0; }
  img, .noart { width: 44px; height: 44px; flex: none; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2), 2px 3px 6px rgba(0, 0, 0, 0.2); }
  .sleeve {
    position: relative; flex: none; padding: 0; border: 0; background: none; cursor: pointer;
    width: 44px; height: 44px; display: block;
  }
  .sleeve img { display: block; }
  .glyph {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-family: var(--mono); font-size: 13px; color: #f3ead8;
    background: rgba(20, 14, 8, 0.38); opacity: 0; transition: opacity 0.2s;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }
  .sleeve:hover .glyph, .sleeve:focus-visible .glyph, .sleeve.active .glyph { opacity: 1; }
  @media (hover: none) { .glyph { opacity: 0.85; background: rgba(20, 14, 8, 0.22); } }
  .sleeve:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
  /* A brass bar fills along the sleeve's foot as the preview plays. */
  .ring { position: absolute; left: 0; bottom: -4px; height: 2px; width: calc(var(--p) * 100%); background: var(--brass); transition: width 0.25s linear; }
  .spin { width: 12px; height: 12px; border: 1.5px solid #f3ead8; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .t { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
  .title { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .by { font-size: 14px; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { font-size: 10px; }
  .first { margin: 14px 0 0; font-size: 15px; border-top: 1px dotted var(--paper-edge); padding-top: 10px; }
  .first .mono { display: block; font-size: 10px; color: var(--ink-soft); margin-bottom: 2px; }

  @media (max-width: 560px) {
    .placard { padding: 12px 12px 14px; top: 76px; margin-top: 18px; }
    .artists li:nth-child(n + 4) { display: none; }
    .tracks li:nth-child(n + 3) { display: none; }
    .coords { grid-template-columns: 1fr; gap: 4px; }
    .coords div { flex-direction: row; justify-content: space-between; gap: 6px; }
    .coords dd { white-space: nowrap; font-size: 9.5px; letter-spacing: 0.02em; }
    .artists li { font-size: 15px; }
    img, .noart, .sleeve { width: 36px; height: 36px; }
    .title { font-size: 14.5px; }
    .by { font-size: 12.5px; }
    .first { font-size: 13.5px; }
    .tick { font-size: 8.5px; right: 8px; }
    .tick.lead { display: none; } /* no room beside the year on phones */
    .year { right: 8px; font-size: 11.5px; transform: translateY(-2px); }
  }
</style>
