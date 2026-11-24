<script>
  import Surface from './components/Surface.svelte';
  import Descent from './components/Descent.svelte';
  import { resolveArt } from './lib/art-runtime.js';
  import { track, fileTypes } from './lib/analytics.js';

  let view = $state('surface'); // surface | descent
  let core = $state.raw(null);
  let art = $state({});
  let label = $state('');
  let status = $state('');
  let error = $state('');
  let cancelArt = null;

  let samplePromise = fetch('/sample.json').then((r) => r.json());

  async function drillSample(via) {
    error = '';
    status = 'Extracting the sample core';
    try {
      const s = await samplePromise;
      const { art: sampleArt, label: l, ...c } = s;
      art = sampleArt || {};
      core = c;
      label = l || 'A sample life';
      enter();
      track('core_drilled', { source: 'sample', trigger: via === 'link' ? 'deep_link' : 'button', years: c.years.length });
    } catch {
      error = 'The sample core failed to load. Try again?';
      samplePromise = fetch('/sample.json').then((r) => r.json());
      track('drill_failed', { source: 'sample', reason: 'sample_unavailable' });
    }
    status = '';
  }

  async function drillUpload(fileList, fetchArt) {
    error = '';
    status = 'Opening the archive';
    const dropped = { source: 'upload', files: fileList.length, file_types: fileTypes(fileList) };
    const files = await Promise.all([...fileList].map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    const worker = new Worker(new URL('./lib/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') status = m.msg;
      else if (m.type === 'error') {
        error = m.msg;
        status = '';
        worker.terminate();
        track('drill_failed', { ...dropped, reason: 'unreadable_export' });
      } else if (m.type === 'done') {
        worker.terminate();
        if (!m.core.years.length) {
          error = 'That export has no music in it.';
          status = '';
          track('drill_failed', { ...dropped, reason: 'no_music' });
          return;
        }
        art = {};
        core = m.core;
        label = 'Your core';
        status = '';
        cancelArt?.();
        if (fetchArt) cancelArt = resolveArt(core, (k, entry) => (art[k] = entry));
        enter();
        track('core_drilled', { ...dropped, services: core.source, years: core.years.length, cover_art: !!fetchArt });
      }
    };
    worker.postMessage({ files }, files.map((f) => f.data));
  }

  function enter() {
    view = 'descent';
    window.scrollTo(0, 0);
    if (location.hash !== '#core') history.replaceState(null, '', '#core');
  }

  function exit() {
    cancelArt?.();
    view = 'surface';
    document.documentElement.style.setProperty('--bg', '#d8ccb6');
    window.scrollTo(0, 0);
    history.replaceState(null, '', location.pathname);
  }

  // Always start a descent from the surface, even after a reload.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Deep link straight into the sample: strata.app/#sample
  if (location.hash === '#sample' || location.hash === '#core') drillSample('link');
</script>

<div class="grain" aria-hidden="true"></div>

{#if view === 'surface'}
  <Surface {status} {error} onSample={drillSample} onUpload={drillUpload} {samplePromise} />
{:else if core}
  <Descent {core} {art} {label} onExit={exit} />
{/if}
