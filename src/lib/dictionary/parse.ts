import { numberedToAccented } from '@/lib/pinyin';
import type { DictEntry } from '@/lib/dictionary/types';

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;

export function parseCedictLine(line: string): DictEntry | null {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  const match = LINE.exec(trimmed);
  if (!match) return null;
  const [, traditional, simplified, pinyin, glosses] = match;
  return {
    traditional: traditional!,
    simplified: simplified!,
    pinyin: numberedToAccented(pinyin!),
    meanings: glosses!.split('/').filter((gloss) => gloss !== ''),
  };
}
