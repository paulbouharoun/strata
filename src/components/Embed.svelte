<script>
  // A service's own player, for services whose previews only play inside their embed (Spotify, YouTube).
  import { onMount } from 'svelte';

  let { kind, id, title = '' } = $props();
  let host;
  let fallback = $state(false);

  let spotifyApi; // one IFrame API load per page
  const loadSpotify = () =>
    (spotifyApi ??= new Promise((resolve, reject) => {
      window.onSpotifyIframeApiReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = reject;
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('timeout')), 8000);
    }));

  onMount(() => {
    if (kind !== 'spotify') return;
    let controller;
    let alive = true;
    // The IFrame API lets the click that opened the specimen also start it, with Spotify's player in view.
    (window.__strataSpotify ||= loadSpotify())
      .then((api) => {
        if (!alive) return;
        const el = document.createElement('div');
        host.appendChild(el);
        api.createController(el, { uri: `spotify:track:${id}`, width: '100%', height: 80 }, (c) => {
          controller = c;
          c.addListener('ready', () => c.play());
        });
      })
      .catch(() => (fallback = true));
    return () => {
      alive = false;
      controller?.destroy?.();
    };
  });
</script>

<div class="embed {kind}" bind:this={host}>
  {#if kind === 'youtube'}
    <iframe
      src="https://www.youtube-nocookie.com/embed/{id}?autoplay=1&playsinline=1&rel=0"
      title="YouTube player: {title}"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    ></iframe>
  {:else if fallback}
    <iframe src="https://open.spotify.com/embed/track/{id}?utm_source=strata" title="Spotify player: {title}" allow="autoplay; clipboard-write; encrypted-media" loading="lazy"></iframe>
  {/if}
</div>

<style>
  .embed { margin: 6px 0 2px; width: 100%; }
  .embed :global(iframe) { display: block; width: 100%; border: 0; border-radius: 10px; }
  .spotify :global(iframe) { height: 80px; }
  .youtube iframe { aspect-ratio: 16 / 9; height: auto; border-radius: 4px; }
</style>
