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

// jsdom implements neither a canvas 2D context nor ResizeObserver. Components
// only need to mount in tests, so no-op stand-ins are enough.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noopContext = new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => noopContext) as never;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
