export type Tone = 0 | 1 | 2 | 3 | 4;

export interface PinyinToken {
  /** The text to render. */
  text: string;
  /** Tone for colouring, or null when this token is a separator / non-pinyin. */
  tone: Tone | null;
}
