export { db } from '@/lib/db/db';
export { createDeck, deleteDeck, getDeck, listDecks, updateDeck } from '@/lib/db/decks';
export { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/lib/db/settings';
export { ALL_DIRECTIONS, DIRECTION_LABELS } from '@/lib/db/types';
export type { AppSettings, Card, Deck, Direction, Note, ReviewLog } from '@/lib/db/types';
