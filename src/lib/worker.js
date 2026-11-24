// Parses the export off the main thread so the page never freezes on a 100 MB history.
import { parseFiles } from './parse.js';
import { aggregate } from './aggregate.js';

self.onmessage = async (e) => {
  try {
    const { plays, source } = await parseFiles(e.data.files, (msg) => self.postMessage({ type: 'progress', msg }));
    self.postMessage({ type: 'progress', msg: 'Dating the layers' });
    self.postMessage({ type: 'done', core: aggregate(plays, source) });
  } catch (err) {
    self.postMessage({ type: 'error', msg: err.message || String(err) });
  }
};
