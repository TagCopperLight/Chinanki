import { parseAccentedPinyin } from '@/lib/pinyin';
import { useSettings } from '@/hooks/useSettings';

/**
 * Renders hanzi, optionally colouring the nth character with the tone of the
 * nth pinyin syllable. When the counts disagree (rare: erhua, punctuation) the
 * extra characters are left uncoloured rather than mis-coloured.
 *
 * `colour={false}` suppresses colouring even when the setting is on, for the
 * prompt side of 汉字 → cards where the tone is what the learner must recall.
 */
export default function HanziText({
  hanzi,
  pinyin,
  className = '',
  colour = true,
}: {
  hanzi: string;
  pinyin: string;
  className?: string;
  colour?: boolean;
}) {
  const { settings } = useSettings();
  const syllables = parseAccentedPinyin(pinyin).filter((token) => token.tone !== null);
  const characters = [...hanzi];

  if (!colour || !settings.colourHanzi || syllables.length !== characters.length) {
    return <span className={className}>{hanzi}</span>;
  }

  return (
    <span className={className}>
      {characters.map((character, index) => (
        <span
          key={index}
          data-tone={syllables[index]!.tone}
          style={{ color: settings.toneColours[syllables[index]!.tone!] }}
        >
          {character}
        </span>
      ))}
    </span>
  );
}
