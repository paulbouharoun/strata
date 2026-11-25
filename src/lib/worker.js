// Parses the export off the main thread so the page never freezes on a 100 MB history.
import { parseFiles } from './parse.js';
import { aggregate } from './aggregate.js';
import { buildDays } from './globe/days.js';

self.onmessage = async (e) => {
  try {
    const { plays, source } = await parseFiles(e.data.files, (msg) => self.postMessage({ type: 'progress', msg }));
    self.postMessage({ type: 'progress', msg: 'Dating the layers' });
    // Day-by-day listening powers the globe view; it stays in this browser tab.
    self.postMessage({ type: 'done', core: aggregate(plays, source), listening: buildDays(plays) });
  } catch (err) {
    self.postMessage({ type: 'error', msg: err.message || String(err) });
  }
};
