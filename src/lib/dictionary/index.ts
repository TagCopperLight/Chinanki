export { clearDictionaryCache, lookupExact, lookupPrefix, setDictionaryFetch } from '@/lib/dictionary/lookup';
export { mergeDictionaries, pinyinKey } from '@/lib/dictionary/merge';
export { parseCedictLine } from '@/lib/dictionary/parse';
export { shardKeyFor } from '@/lib/dictionary/shard';
export { glossesFor } from '@/lib/dictionary/glosses';
export type { DictEntry, GlossLanguage, ParsedEntry } from '@/lib/dictionary/types';
