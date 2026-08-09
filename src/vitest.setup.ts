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

// jsdom implements neither a canvas 2D context nor ResizeObserver. What is
// actually painted is proved by the Playwright suite; here the components only
// need to mount, so a context that swallows every call and an observer that
// never fires are enough.
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
