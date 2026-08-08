import { describe, expect, it } from 'vitest';
import { SHARD_COUNT, shardKeyFor } from '@/lib/dictionary/shard';

describe('shardKeyFor', () => {
  it('returns a stable two-hex-digit key', () => {
    expect(shardKeyFor('好')).toMatch(/^[0-9a-f]{2}$/);
  });

  it('depends only on the first character', () => {
    expect(shardKeyFor('好')).toBe(shardKeyFor('好人'));
  });

  it('returns "xx" for an empty string', () => {
    expect(shardKeyFor('')).toBe('xx');
  });

  it('spreads common characters over many shards', () => {
    const keys = new Set(
      [...'的一是不了人我在有他这为之大来以个中上们'].map((c) => shardKeyFor(c)),
    );
    expect(keys.size).toBeGreaterThan(5);
  });

  it('never exceeds SHARD_COUNT distinct values', () => {
    const keys = new Set<string>();
    for (let code = 0x4e00; code < 0x4e00 + 2000; code++) {
      keys.add(shardKeyFor(String.fromCodePoint(code)));
    }
    expect(keys.size).toBeLessThanOrEqual(SHARD_COUNT);
  });
});
