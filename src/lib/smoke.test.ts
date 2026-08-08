import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests with an IndexedDB shim available', () => {
    expect(typeof indexedDB).toBe('object');
  });
});
