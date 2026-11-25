<script>
  // The other view of the same history: a globe and three headlines a season, tied to the listening.
  // Code, map and headlines load only the first time someone switches to it.
  //   Paul's sample: precomputed picks (/globe.json).
  //   Uploads: picked here in the browser from the upload's day-by-day listening; covers, players
  //   and arcs are looked up from each track's own service as seasons come into view.
  import { onMount } from 'svelte';

  let { listening = null } = $props();
  let host;
  let status = $state('Unwinding the globe…');

  const store = (key) => ({
    get(k) {
      try { const v = JSON.parse(localStorage.getItem(key) || '{}')[k]; return v; } catch { return undefined; }
    },
    set(k, v) {
      try { const all = JSON.parse(localStorage.getItem(key) || '{}'); all[k] = v; localStorage.setItem(key, JSON.stringify(all)); } catch {}
    },
  });

  onMount(() => {
    let destroy = null;
    let alive = true;
    (async () => {
      const { mountOrrery } = await import('../lib/orrery.js');
      let data, opts = { topOffset: 64 };
      if (listening) {
        const [{ pickSeasons }, { originLookup }, { mediaFor }, headlines] = await Promise.all([
          import('../lib/globe/pick.js'),
          import('../lib/globe/origins.js'),
          import('../lib/art-runtime.js'),
          fetch('/headlines.json').then((r) => r.json()),
        ]);
        data = pickSeasons(listening, headlines);
        const origin = originLookup({ fetchJson: (u) => fetch(u).then((r) => (r.ok ? r.json() : null)), cache: store('strata.origins.v1') });
        opts.resolveMedia = (n) => mediaFor({ track: n.track, artist: n.artist, src: n.src, id: n.id });
        opts.resolveOrigin = origin;
        if (!data.seasons.length) throw new Error('empty');
      } else {
        data = await fetch('/globe.json').then((r) => r.json());
      }
      if (!alive) return;
      status = '';
      destroy = mountOrrery(host, data, opts);
    })().catch((e) => {
      status = e.message === 'empty' ? 'No headlines for these years yet: they start in 2010.' : 'The globe failed to load. Try again later.';
    });
    return () => {
      alive = false;
      destroy?.();
    };
  });
</script>

{#if status}<p class="loading mono" role="status">{status}</p>{/if}
<div class="orrery" bind:this={host}></div>

<style>
  .loading { padding: 20vh 0; text-align: center; color: var(--ink-soft); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
  .orrery { --paper-edge: #c7b89c; --rust: #8a4b2f; }
  /* The app's .mono is uppercase labels; inside the globe, mono also carries song titles and places. */
  .orrery :global(.mono) { text-transform: none; letter-spacing: 0.02em; }
  .orrery :global(.stage) { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(300px, 440px); gap: var(--gutter); }
  .orrery :global(.case) {
    position: sticky; top: var(--top); height: calc(100svh - var(--top));
    display: flex; flex-direction: column; justify-content: center; align-items: center;
  }
  .orrery :global(.globe-wrap) { position: relative; width: min(100%, 68vh); aspect-ratio: 1; }
  .orrery :global(canvas) { width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: grab; }
  .orrery :global(.era) { font-size: clamp(34px, 5vw, 56px); line-height: 1; margin: 0 0 6px; text-transform: none; letter-spacing: 0.01em; white-space: nowrap; }
  .orrery :global(.dial) { margin-top: 10px; display: flex; gap: 18px; font-size: 10.5px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; }
  .orrery :global(.dial b) { font-weight: 500; color: var(--ink); }
  .orrery :global(.years) { padding: 28px 0 50vh; }
  .orrery :global(.season) { min-height: 115vh; padding-top: 10vh; }
  .orrery :global(.season:first-child) { padding-top: 0; }

  .orrery :global(.oplacard) {
    background: var(--paper); border: 1px solid var(--paper-edge); padding: 16px 18px 14px;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset, 0 18px 40px -20px rgba(10, 6, 2, 0.6);
  }
  .orrery :global(.head) { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--ink-soft); border-bottom: 1px solid var(--paper-edge); padding-bottom: 8px; text-transform: uppercase; letter-spacing: 0.08em; }
  .orrery :global(h2) { font-weight: 400; font-size: clamp(26px, 3.2vw, 34px); margin: 10px 0 6px; }
  .orrery :global(h2 small) { font-size: 0.55em; color: var(--ink-soft); }
  .orrery :global(h3.mono) { font-weight: 400; font-size: 10px; color: var(--ink-soft); margin: 14px 0 6px; border-top: 1px dotted var(--paper-edge); padding-top: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
  .orrery :global(ul), .orrery :global(ol) { margin: 0; padding: 0; list-style: none; }
  .orrery :global(.music li) { font-size: 16px; }
  .orrery :global(.wonder) { font-style: italic; font-size: 17px; margin: 14px 0 4px; border-top: 1px dotted var(--paper-edge); padding-top: 12px; }
  .orrery :global(.events li) { display: grid; grid-template-columns: 54px 1fr; gap: 10px; padding: 7px 4px; border-bottom: 1px dotted var(--paper-edge); cursor: pointer; transition: background 0.2s; }
  .orrery :global(.events li:last-child) { border-bottom: 0; }
  .orrery :global(.events li.on) { background: rgba(169, 130, 63, 0.12); }
  .orrery :global(.d) { font-size: 10px; color: var(--ink-soft); padding-top: 3px; text-transform: uppercase; }
  .orrery :global(.d .date) { display: block; white-space: nowrap; }
  .orrery :global(.sleeve) { display: block; width: 52px; height: 52px; margin-top: 8px; object-fit: cover; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2), 2px 3px 6px rgba(0, 0, 0, 0.2); }
  .orrery :global(.d small) { display: block; font-size: 8px; letter-spacing: 0.06em; }
  .orrery :global(li.of-era .date::after) { content: ' ◆'; color: var(--brass); }
  .orrery :global(.player iframe.yt) { height: auto; aspect-ratio: 16 / 9; border-radius: 4px; }
  .orrery :global(li.grave .date::before) { content: '— '; }
  .orrery :global(.t) { font-size: 15px; line-height: 1.3; min-width: 0; }
  .orrery :global(.w) { display: block; font-size: 9.5px; color: var(--ink-soft); margin-top: 3px; }
  .orrery :global(.read) { display: block; font-family: var(--mono); font-size: 9.5px; margin-top: 4px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  .orrery :global(.read a) { color: inherit; }
  .orrery :global(.link) { display: block; font-size: 10px; line-height: 1.5; color: var(--ink-soft); margin-top: 6px; }
  .orrery :global(.link > span) { display: block; }
  .orrery :global(.needle::before) { content: '♪ '; color: var(--brass); }
  .orrery :global(.arc::before) { content: '↝ '; color: var(--rust); }
  .orrery :global(.echo::before) { content: '≈ '; color: var(--brass); }
  .orrery :global(.quiet) { font-style: italic; }
  .orrery :global(.link i) { font-family: var(--serif); font-size: 13px; font-style: normal; color: var(--ink); }
  .orrery :global(.listen) {
    font: inherit; font-size: 12px; line-height: 1;
    display: block; width: 52px; margin-top: 6px; white-space: nowrap;
    background: none; border: 1px solid var(--paper-edge); color: var(--ink); padding: 3px 0; cursor: pointer;
  }
  .orrery :global(.listen:hover), .orrery :global(.listen[aria-expanded='true']) { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .orrery :global(.player) { display: block; margin-top: 6px; }
  .orrery :global(.player iframe) { display: block; width: 100%; height: 80px; border: 0; border-radius: 10px; }
  .orrery :global(.credit) { font-size: 9px; color: var(--ink-soft); margin: 10px 0 0; }
  .orrery :global(.credit a) { color: inherit; }

  @media (max-width: 760px) {
    .orrery :global(.stage) { grid-template-columns: minmax(0, 1fr); }
    .orrery :global(.case) { height: 52svh; z-index: 2; background: var(--bg); box-shadow: 0 10px 14px -6px var(--bg); padding-bottom: 6px; }
    .orrery :global(.globe-wrap) { width: min(80vw, 40svh); }
    .orrery :global(.era) { font-size: 34px; }
    .orrery :global(.years) { padding-top: 4vh; }
    .orrery :global(.season) { min-height: 120svh; }
  }
</style>
