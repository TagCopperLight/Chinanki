import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia; the app shell uses it to detect the
// system colour scheme. Stub a "light" match so ThemeEffect can run in tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
