<script>
  import { onMount } from 'svelte';
  import { artKey, hashColor } from '../lib/color.js';
  import { longDate, clock, depth } from '../lib/format.js';
  import { cardBlob } from '../lib/card.js';
  import { player, toggle, toggleEmbed, stop } from '../lib/player.svelte.js';
  import { playable } from '../lib/media.js';
  import Embed from './Embed.svelte';
  import { track } from '../lib/analytics.js';

  let { core, art, onClose, onSurface } = $props();

  const b = core.bedrock;
  const a = $derived(art[artKey(b.track, b.artist)]);
  let phase = $state(0); // 0 dark · 1 case lit · 2 label · 3 actions
  let busy = $state(false);
  let note = $state('');
  let closeBtn = $state();
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;

  onMount(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = reduce ? [0, 0, 0] : [1600, 3000, 4200];
    const ids = t.map((ms, i) => setTimeout(() => (phase = i + 1), ms));
    const onKey = (e) => e.key === 'Escape' && phase >= 3 && onClose();
    addEventListener('keydown', onKey);
    return () => {
      stop();
      ids.forEach(clearTimeout);
      removeEventListener('keydown', onKey);
    };
  });

  $effect(() => {
    if (phase === 3) closeBtn?.focus({ preventScroll: true });
  });

  const fileName = () => `strata-first-stream-${new Date(b.ts).toISOString().slice(0, 10)}.png`;

  async function download() {
    busy = true;
    note = 'Engraving your card';
    try {
      const blob = await cardBlob(core, art);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      note = 'Card saved';
      track('card_downloaded');
    } catch (e) {
      note = 'Could not make the card: ' + e.message;
    }
    busy = false;
  }

  async function share() {
    busy = true;
    note = '';
    try {
      const blob = await cardBlob(core, art);
      const file = new File([blob], fileName(), { type: 'image/png' });
      const data = { files: [file], title: 'Strata', text: `My first stream was ${b.track} by ${b.artist}, on ${longDate(b.ts)}.` };
      if (navigator.canShare(data)) {
        await navigator.share(data);
        track('card_shared');
      } else await download();
    } catch (e) {
      if (e.name !== 'AbortError') note = 'Sharing failed, try Download';
    }
    busy = false;
  }

  const mins = Math.floor(b.ms / 60000);
  const secs = String(Math.floor((b.ms % 60000) / 1000)).padStart(2, '0');
  const fossilHue = hashColor(b.artist);
</script>

<div class="ceremony" role="dialog" aria-modal="true" aria-labelledby="specimen-title" data-phase={phase}>
  <div class="spot" aria-hidden="true"></div>

  <figure class="vitrine">
    <div class="plinth">
      {#if a?.url}
        <img src={a.url} alt="Cover of {b.album || b.track}" crossorigin="anonymous" />
      {:else}
        <!-- No sleeve found: an ammonite stands in. -->
        <svg viewBox="0 0 100 100" class="ammonite" aria-hidden="true">
          <defs>
            <radialGradient id="am" cx="40%" cy="35%"><stop offset="0" stop-color="#f1dfb8" /><stop offset="1" stop-color={fossilHue} /></radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#am)" />
          <path d="M50 50 m0 0 a4 4 0 0 1 8 0 a8 8 0 0 1 -16 0 a14 14 0 0 1 28 0 a22 22 0 0 1 -44 0 a32 32 0 0 1 64 0 a40 40 0 0 1 -80 0" fill="none" stroke="#3b2c1c" stroke-width="1.6" opacity="0.7" />
        </svg>
      {/if}
    </div>
    <div class="glass" aria-hidden="true"></div>
  </figure>

  <figcaption class="label">
    <p class="mono no">Specimen 0001 · Bedrock</p>
    <h2 id="specimen-title">{b.track}</h2>
    <p class="artist">{b.artist}{#if b.album}<span class="album">{' · '}<em>{b.album}</em></span>{/if}</p>
    <dl class="mono meta">
      <div><dt>Deposited</dt><dd>{longDate(b.ts)}{#if b.precision !== 'day'}, {clock(b.ts)}{/if}</dd></div>
      <div><dt>Recovered at</dt><dd>{depth(b.depth, 0)} deep</dd></div>
      <div><dt>Duration</dt><dd>{mins}:{secs}</dd></div>
    </dl>
    <p class="caption"><em>The first track you ever streamed. Everything above was laid down after it.</em></p>
  </figcaption>

  <div class="actions">
    <button class="btn primary" onclick={download} disabled={busy}>Download your card</button>
    {#if playable(a) === 'audio'}
      {@const key = 'bedrock'}
      <button class="btn" onclick={() => toggle(key, a.preview)} aria-pressed={player.key === key && player.playing}>
        {player.key === key && player.playing ? '❚❚ Pause' : '▶ Hear it again'}
      </button>
    {:else if playable(a) === 'embed'}
      <button class="btn" onclick={() => toggleEmbed('bedrock')} aria-expanded={player.embed === 'bedrock'}>
        {player.embed === 'bedrock' ? '× Close player' : '▶ Hear it again'}
      </button>
      {#if player.embed === 'bedrock'}
        <div class="bplayer"><Embed kind={a.embed.kind} id={a.embed.id} title="{b.track} by {b.artist}" /></div>
      {/if}
    {/if}
    {#if canShare}
      <button class="btn" onclick={share} disabled={busy}>Share</button>
    {/if}
    <button class="btn ghost" bind:this={closeBtn} onclick={onClose}>Close case</button>
    <button class="btn ghost" onclick={onSurface}>Return to surface</button>
    <p class="mono note" role="status">{note}</p>
  </div>
</div>

<style>
  .ceremony {
    position: fixed; inset: 0; z-index: 100;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    justify-items: center;
    gap: 22px;
    padding: max(24px, env(safe-area-inset-top)) var(--gutter) max(24px, env(safe-area-inset-bottom));
    background: #070605;
    color: var(--bone);
    overflow-y: auto;
    animation: fall 1.6s ease-in both;
  }
  @keyframes fall { from { background: rgba(7, 6, 5, 0); } to { background: #070605; } }

  .spot {
    position: fixed; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 60% 55% at 50% 30%, rgba(255, 228, 176, 0.16), transparent 70%);
    opacity: 0; transition: opacity 2.2s ease;
  }
  [data-phase='1'] .spot, [data-phase='2'] .spot, [data-phase='3'] .spot { opacity: 1; }

  .vitrine {
    position: relative; margin: 0;
    width: min(62vw, 38svh, 340px); aspect-ratio: 1;
    padding: 18px;
    background: linear-gradient(#17120e, #0d0a08);
    box-shadow: 0 0 0 1px rgba(217, 180, 106, 0.35), 0 40px 80px -30px rgba(255, 220, 160, 0.25), 0 30px 60px rgba(0, 0, 0, 0.8);
    opacity: 0; transform: translateY(10px) scale(0.985);
    transition: opacity 2.4s ease, transform 3s cubic-bezier(0.2, 0.7, 0.1, 1);
  }
  [data-phase='1'] .vitrine, [data-phase='2'] .vitrine, [data-phase='3'] .vitrine { opacity: 1; transform: none; }
  .plinth { width: 100%; height: 100%; }
  .plinth img, .ammonite { width: 100%; height: 100%; display: block; object-fit: cover; filter: sepia(0.15) contrast(1.02); }
  .glass {
    position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(125deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.03) 28%, transparent 45%, rgba(255, 255, 255, 0.05) 80%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .label { text-align: center; max-width: 520px; opacity: 0; transition: opacity 1.8s ease; }
  [data-phase='2'] .label, [data-phase='3'] .label { opacity: 1; }
  .no { color: #d9b46a; margin: 0 0 6px; }
  h2 { font-weight: 400; font-size: clamp(30px, 6vw, 52px); line-height: 1.02; margin: 0; overflow-wrap: anywhere; }
  .artist { font-size: 20px; margin: 8px 0 14px; color: rgba(236, 226, 207, 0.85); }
  .album { color: rgba(236, 226, 207, 0.6); }
  .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 22px; margin: 0; font-size: 11px; }
  .meta div { display: flex; flex-direction: column; }
  dt { color: rgba(236, 226, 207, 0.5); font-size: 9.5px; }
  dd { margin: 0; }
  .caption { color: rgba(236, 226, 207, 0.6); font-size: 16px; margin: 14px 0 0; }

  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; opacity: 0; transition: opacity 1.2s ease; pointer-events: none; max-width: 560px; }
  [data-phase='3'] .actions { opacity: 1; pointer-events: auto; }
  .btn { border: 1px solid rgba(236, 226, 207, 0.6); background: none; color: var(--bone); padding: 12px 16px; font-size: 17px; cursor: pointer; min-height: 46px; }
  .btn.primary { background: #d9b46a; border-color: #d9b46a; color: #1a140e; }
  .btn.ghost { border-color: rgba(236, 226, 207, 0.25); color: rgba(236, 226, 207, 0.75); }
  .btn:disabled { opacity: 0.6; cursor: progress; }
  .bplayer { flex-basis: 100%; max-width: 420px; }
  .note { flex-basis: 100%; text-align: center; margin: 2px 0 0; min-height: 1.2em; color: rgba(236, 226, 207, 0.6); }

  @media (max-width: 560px) {
    .ceremony { gap: 16px; }
    .btn.primary { flex-basis: 100%; }
    .artist { font-size: 17px; }
  }
</style>
