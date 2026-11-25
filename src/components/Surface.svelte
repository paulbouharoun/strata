<script>
  import { drawStratum } from '../lib/rock.js';
  import { strataPalette, laminae } from '../lib/palette.js';

  let { status, error, onSample, onUpload, samplePromise } = $props();

  let fetchArt = $state(true);
  let dragging = $state(false);
  let showHow = $state(false);
  let service = $state('spotify');

  const link = (href, text) => `<a href="${href}" target="_blank" rel="noreferrer">${text}</a>`;
  const GUIDES = [
    { id: 'spotify', name: 'Spotify', steps: [
      `Open ${link('https://www.spotify.com/account/privacy/', 'spotify.com/account/privacy')}.`,
      'Tick <strong>Extended streaming history</strong>: it goes back to your very first play. “Account data” works too, but only covers the last year.',
      'Spotify emails a zip within a few days. Drop it here, as is.',
    ] },
    { id: 'apple', name: 'Apple Music', steps: [
      `Sign in at ${link('https://privacy.apple.com/', 'privacy.apple.com')} and choose <strong>Request a copy of your data</strong>.`,
      'Select <strong>Apple Media Services information</strong> only, and keep the default 1 GB file size.',
      'Apple emails a download link, usually within a week. Drop the zip (or every part of it) here, unopened.',
    ] },
    { id: 'deezer', name: 'Deezer', steps: [
      `In Deezer’s ${link('https://www.deezer.com/account/privacy', 'account settings')}, under privacy / personal data, ask for a copy of your personal data.`,
      'Deezer sends a spreadsheet (<code>deezer-data_….xlsx</code>) whose <em>listeningHistory</em> sheet has every stream.',
      'Drop the .xlsx here (or the zip it came in).',
    ] },
    { id: 'youtube', name: 'YouTube Music', steps: [
      `Go to ${link('https://takeout.google.com/', 'takeout.google.com')}, click <strong>Deselect all</strong>, then tick <strong>YouTube and YouTube Music</strong>.`,
      'Under “All YouTube data included”, keep only <strong>history</strong>. HTML or JSON both work.',
      'Drop the Takeout zip here. YouTube doesn’t record how long you listened, so depths are estimated at 3½ minutes a play.',
    ] },
    { id: 'tidal', name: 'TIDAL', steps: [
      'TIDAL has no download button. Email TIDAL support and ask for a copy of your personal data, including your <strong>streaming history</strong>.',
      'They reply with a <code>streaming.csv</code> file.',
      'Drop that file here.',
    ] },
  ];
  let input;
  let preview;

  // A short length of the sample core rises out of the ground below the title.
  $effect(() => {
    let alive = true;
    samplePromise.then((s) => {
      if (!alive || !preview) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = preview.clientWidth, h = preview.clientHeight;
      preview.width = w * dpr; preview.height = h * dpr;
      const ctx = preview.getContext('2d');
      ctx.scale(dpr, dpr);
      let y = 0;
      for (const [i, yr] of s.years.slice(0, 4).entries()) {
        const seg = Math.round(h * [0.22, 0.3, 0.26, 0.4][i]);
        const off = document.createElement('canvas');
        off.width = w * dpr; off.height = seg * dpr;
        const octx = off.getContext('2d');
        octx.scale(dpr, dpr);
        drawStratum(octx, { w, h: seg, palette: strataPalette(yr, s.art, i * 0.08), laminae: laminae(yr), seed: yr.year * 31, depthT: i * 0.08, detail: 0.8 });
        ctx.drawImage(off, 0, y, w, seg);
        y += seg;
        if (y > h) break;
      }
    });
    return () => (alive = false);
  });

  function pick(files) {
    if (files?.length) onUpload(files, fetchArt);
  }
</script>

<main class="surface">
  <header class="top mono">
    <span>Dept. of Listening · Core Repository</span>
    <span class="hide-sm">Specimen collection, est. today</span>
  </header>

  <section class="hero">
    <p class="kicker mono">Core sample no. 001</p>
    <h1>Strata</h1>
    <p class="tag"><em>Your listening, carbon-dated.</em></p>
    <p class="lede">
      Your entire streaming history from Spotify, Apple Music, Deezer, YouTube Music or TIDAL, drilled as a geological core. Descend through a layer for every year,
      coloured by the music you lived in, until you strike bedrock: the first track you ever streamed.
    </p>

    <div class="actions">
      <button class="btn primary" onclick={onSample} disabled={!!status}>
        <span>Explore Paul’s history</span><span aria-hidden="true">↓</span>
      </button>

      <label
        class="btn drop"
        class:dragging
        ondragover={(e) => { e.preventDefault(); dragging = true; }}
        ondragleave={() => (dragging = false)}
        ondrop={(e) => { e.preventDefault(); dragging = false; pick(e.dataTransfer.files); }}
      >
        <input bind:this={input} type="file" accept=".zip,.json,.csv,.xlsx,.html,application/zip,application/json,text/csv,text/html" multiple class="sr-only" onchange={(e) => pick(e.currentTarget.files)} disabled={!!status} />
        <span>Bring your own</span><span class="mono small">export</span>
      </label>
    </div>
    <p class="whose">
      The specimen on display is the real listening history of
      <a href="https://paulbouharoun.com" target="_blank" rel="noreferrer">Paul Bouharoun</a>, who built Strata. Bring your own export to explore yours.
    </p>

    {#if status}
      <p class="status mono" role="status"><span class="drill" aria-hidden="true"></span>{status}…</p>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="notes">
      <label class="toggle mono">
        <input type="checkbox" bind:checked={fetchArt} />
        Fetch cover art for your top tracks
      </label>
      <p class="fine">
        Your export is read entirely in this browser. Nothing is uploaded. With cover art on, the names of each year's top
        three tracks are sent to Apple's iTunes Search to find their sleeves.
      </p>
      <button class="how mono" onclick={() => (showHow = !showHow)} aria-expanded={showHow}>
        {showHow ? '−' : '+'} How to get your export
      </button>
      {#if showHow}
        <div class="services" role="tablist" aria-label="Streaming service">
          {#each GUIDES as g (g.id)}
            <button class="mono svc" role="tab" aria-selected={service === g.id} onclick={() => (service = g.id)}>{g.name}</button>
          {/each}
        </div>
        {@const g = GUIDES.find((x) => x.id === service)}
        <ol class="steps" role="tabpanel">
          {#each g.steps as step}<li>{@html step}</li>{/each}
        </ol>
        <p class="fine">Use more than one service? Drop all the exports together and they merge into one core.</p>
      {/if}
    </div>
  </section>

  <div class="ground" aria-hidden="true">
    <div class="horizon"></div>
    <canvas class="preview" bind:this={preview}></canvas>
  </div>
</main>

<style>
  .surface {
    min-height: 100svh;
    padding: 0 var(--gutter);
    display: grid;
    grid-template-rows: auto 1fr auto;
    max-width: 1100px;
    margin: 0 auto;
    position: relative;
  }
  .top {
    display: flex;
    justify-content: space-between;
    padding: 20px 0;
    color: var(--ink-soft);
    border-bottom: 1px solid color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .hero {
    padding: clamp(32px, 8vh, 96px) 0 40px;
    max-width: 640px;
  }
  .kicker { color: var(--ink-soft); margin: 0 0 8px; }
  h1 {
    font-weight: 400;
    font-size: clamp(76px, 17vw, 168px);
    line-height: 0.86;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .tag { font-size: clamp(22px, 4vw, 30px); margin: 10px 0 22px; color: var(--ink-soft); }
  .lede { font-size: 19px; max-width: 34em; margin: 0 0 28px; }
  .whose { font-size: 16px; color: var(--ink-soft); margin: 14px 0 0; max-width: 34em; }
  .whose a { color: inherit; }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    justify-content: space-between;
    padding: 14px 20px;
    font-size: 19px;
    border: 1px solid var(--ink);
    background: transparent;
    cursor: pointer;
    min-height: 52px;
    transition: background 0.2s, color 0.2s;
  }
  .btn.primary { background: var(--ink); color: var(--bone); }
  .btn.primary:hover { background: #3c2f24; }
  .btn.drop:hover, .btn.drop.dragging { background: color-mix(in srgb, var(--ink) 10%, transparent); }
  .btn.drop:focus-within { outline: 2px solid var(--brass); outline-offset: 2px; }
  .btn:disabled { opacity: 0.6; cursor: progress; }
  .small { font-size: 11px; opacity: 0.7; }
  .status { margin: 18px 0 0; display: flex; align-items: center; gap: 10px; color: var(--ink-soft); }
  .drill {
    width: 10px; height: 10px; border: 1.5px solid var(--ink); border-top-color: transparent; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { color: #8a2e1c; margin: 16px 0 0; }
  .notes { margin-top: 28px; max-width: 34em; }
  .toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .toggle input { accent-color: var(--ink); width: 16px; height: 16px; }
  .fine { font-size: 15px; color: var(--ink-soft); margin: 8px 0 12px; }
  .how { background: none; border: 0; padding: 6px 0; cursor: pointer; color: var(--ink); }
  .steps { font-size: 16px; padding-left: 1.2em; margin: 6px 0 0; }
  .steps li { margin-bottom: 6px; }
  .steps :global(a) { color: inherit; }
  .steps :global(code) { font-family: var(--mono); font-size: 13px; }
  .services { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
  .svc { background: none; border: 1px solid color-mix(in srgb, var(--ink) 35%, transparent); padding: 6px 10px; cursor: pointer; font-size: 11px; min-height: 32px; }
  .svc[aria-selected='true'] { background: var(--ink); color: var(--bone); border-color: var(--ink); }
  a { color: inherit; }

  .ground { position: relative; height: 150px; margin: 0 calc(-1 * var(--gutter)); overflow: hidden; }
  .horizon { position: absolute; left: 0; right: 0; top: 0; border-top: 1px solid color-mix(in srgb, var(--ink) 40%, transparent); }
  .preview {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 120px;
    height: 220px;
    box-shadow: 0 0 0 1px rgba(20, 14, 8, 0.4), 12px 0 30px rgba(20, 14, 8, 0.25);
  }
  @media (min-width: 900px) {
    .ground { position: absolute; right: var(--gutter); top: 64px; bottom: 0; height: auto; width: 200px; margin: 0; overflow: visible; }
    .horizon { display: none; }
    .preview { top: 18vh; height: calc(82vh - 64px); width: 150px; }
  }
  @media (max-width: 560px) {
    .hide-sm { display: none; }
    .btn { width: 100%; }
  }
</style>
