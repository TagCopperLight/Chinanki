import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/index.css';

// Best-effort: without this, IndexedDB (the app's only copy of the user's
// data) sits in the browser's evictable storage bucket and can be cleared
// under storage pressure (or, on iOS Safari, after 7 days without a visit).
// The API is not universally available and must never throw.
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
