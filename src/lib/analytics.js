// PostHog telemetry (EU cloud). Cookieless: nothing is stored on the visitor's device.
// Events: $pageview / $pageleave (automatic), core_drilled, drill_failed,
// card_downloaded, card_shared, link_clicked.
// Never pass listening data, track or artist names, or file names as properties.
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// Nothing is sent from a dev machine unless the page was opened with ?track=1.
const enabled = !local || /[?&]track=1/.test(location.search);

let posthog = null;
let queue = [];

if (enabled) {
  // Loaded on the side so a blocked or failed load never touches the app.
  import('posthog-js')
    .then((m) => {
      m.default.init('phc_yJbpfPFmYFdSnRnf63TjfnLiMoKow9kihqV43MV46C3Q', {
        api_host: 'https://eu.i.posthog.com',
        persistence: 'memory',
        person_profiles: 'identified_only',
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: true,
        // Extras the PostHog project can switch on remotely (they capture clicks, page
        // text and URLs): kept off here whatever the project settings say.
        capture_heatmaps: false,
        capture_dead_clicks: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_surveys: true,
        // Runs before the first $pageview, so every event carries these.
        loaded: (ph) => ph.register({ site: 'portfolio-apps', app: 'strata', test: local }),
      });
      posthog = m.default;
      queue.forEach(([event, props, options]) => track(event, props, options));
      queue = [];
    })
    .catch(() => {});

  // Outbound links (the export guides and the source link).
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest?.('a[href]');
    const href = a?.getAttribute('href');
    if (!href || !/^https?:/.test(href)) return;
    track('link_clicked', { label: a.textContent.replace(/\s+/g, ' ').trim(), href }, { transport: 'sendBeacon' });
  });
}

export function track(event, props, options) {
  if (!enabled) return;
  try {
    if (posthog) posthog.capture(event, props, options);
    else queue.push([event, props, options]);
  } catch {
    // Telemetry must never break the app.
  }
}

/** Coarse file types of a drop, e.g. "json+zip". Never the names. */
export function fileTypes(fileList) {
  const types = new Set();
  for (const f of fileList) {
    const ext = /\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1].toLowerCase();
    types.add(ext || 'none');
  }
  return [...types].sort().join('+');
}
