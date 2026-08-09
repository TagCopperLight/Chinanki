import type { Direction } from '@/lib/db/types';

export type NoteField = 'hanzi' | 'pinyin' | 'meaning';

/** A direction is literally "<prompt>-<answer>", so the split is the mapping. */
export function promptFor(direction: Direction): NoteField {
  return direction.split('-')[0] as NoteField;
}

export function answerFor(direction: Direction): NoteField {
  return direction.split('-')[1] as NoteField;
}

/** Writing directions are answered by drawing the character rather than reading it. */
export function isWritingDirection(direction: Direction): boolean {
  return answerFor(direction) === 'hanzi';
}
