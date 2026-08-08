import { parseAccentedPinyin } from '@/lib/pinyin';
import { useSettings } from '@/hooks/useSettings';

/**
 * Renders hanzi, optionally colouring the nth character with the tone of the
 * nth pinyin syllable. When the counts disagree (rare: erhua, punctuation) the
 * extra characters are left uncoloured rather than mis-coloured.
 */
export default function HanziText({
  hanzi,
  pinyin,
  className = '',
}: {
  hanzi: string;
  pinyin: string;
  className?: string;
}) {
  const { settings } = useSettings();
  const syllables = parseAccentedPinyin(pinyin).filter((token) => token.tone !== null);
  const characters = [...hanzi];

  if (!settings.colourHanzi || syllables.length !== characters.length) {
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
