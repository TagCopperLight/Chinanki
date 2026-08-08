import type { Direction } from '@/lib/db/types';

export type NoteField = 'hanzi' | 'pinyin' | 'meaning';

/** A direction is literally "<prompt>-<answer>", so the split is the mapping. */
export function promptFor(direction: Direction): NoteField {
  return direction.split('-')[0] as NoteField;
}

export function answerFor(direction: Direction): NoteField {
  return direction.split('-')[1] as NoteField;
}
