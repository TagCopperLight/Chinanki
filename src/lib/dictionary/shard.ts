export const SHARD_COUNT = 128;

/**
 * Buckets an entry by its first character so a lookup only downloads one shard.
 * Shared by the build script and the runtime loader — they must never diverge.
 */
export function shardKeyFor(hanzi: string): string {
  const code = hanzi.codePointAt(0);
  if (code === undefined) return 'xx';
  return (code % SHARD_COUNT).toString(16).padStart(2, '0');
}
