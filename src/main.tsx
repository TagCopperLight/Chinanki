import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/index.css';

// Best-effort: without this, IndexedDB (the app's only copy of the user's
// data) sits in the browser's evictable storage bucket and can be cleared
// under storage pressure (or, on iOS Safari, after 7 days without a visit).
// The API is not universally available and must never throw.
void navigator.storage?.persist?.();

// The dict runtime cache was renamed chinanki-dict -> chinanki-dict-v2 (see
// vite.config.ts). Workbox's cleanupOutdatedCaches only prunes precache
// revisions, not renamed runtime caches, so the old cache is orphaned and
// never reclaimed on its own — up to ~14 MB of stale shard bodies sitting
// on disk indefinitely. Delete it by hand, once, at startup. `caches` is
// undefined in non-secure contexts and in the jsdom test environment, and a
// browser refusing the delete is not a reason to break startup, so this
// must never throw. Update the retired name here on the next cache bump.
const RETIRED_DICT_CACHE = 'chinanki-dict';
void caches?.delete(RETIRED_DICT_CACHE).catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
