import type { CardState, DeckConfig, Rating, SchedulingState, Tone } from '@/lib/db/imports';
import type { GlossLanguage } from '@/lib/dictionary/types';

export type { CardState };

export type Direction = 'hanzi-meaning' | 'hanzi-pinyin' | 'meaning-pinyin' | 'pinyin-meaning';

export const ALL_DIRECTIONS: readonly Direction[] = [
  'hanzi-meaning',
  'hanzi-pinyin',
  'meaning-pinyin',
  'pinyin-meaning',
];

export const DIRECTION_LABELS: Record<Direction, string> = {
  'hanzi-meaning': '汉字 → Meaning',
  'hanzi-pinyin': '汉字 → Pinyin',
  'meaning-pinyin': 'Meaning → Pinyin',
  'pinyin-meaning': 'Pinyin → Meaning',
};

export interface Deck {
  id?: number;
  name: string;
  description: string;
  /** Which card directions this deck generates. */
  directions: Direction[];
  config: DeckConfig;
  createdAt: number;
}

export interface Note {
  id?: number;
  deckId: number;
  hanzi: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  /** English meaning; multiple senses separated by "; ". */
  meaning: string;
  /** Free-form user notes shown on the answer side. */
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Card extends SchedulingState {
  id?: number;
  noteId: number;
  deckId: number;
  direction: Direction;
  /** 0/1 rather than boolean so Dexie can index it. */
  suspended: 0 | 1;
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  noteId: number;
  deckId: number;
  direction: Direction;
  rating: Rating;
  stateBefore: CardState;
  stateAfter: CardState;
  reviewedAt: number;
  /** Days since the previous review; 0 for a first answer. */
  elapsedDays: number;
  /** Days scheduled by this answer; 0 for intraday (re)learning steps. */
  scheduledDays: number;
  stabilityAfter: number;
  difficultyAfter: number;
  /** How long the user spent on the card, capped at 60s. */
  durationMs: number;
}

export interface AppSettings {
  /** Local hour at which the study day rolls over, 0–23. */
  rolloverHour: number;
  theme: 'system' | 'light' | 'dark';
  /** Colour the hanzi by tone as well as the pinyin. */
  colourHanzi: boolean;
  toneColours: Record<Tone, string>;
  /** Language of the dictionary suggestions in the note editor. */
  suggestionLanguage: GlossLanguage;
}
