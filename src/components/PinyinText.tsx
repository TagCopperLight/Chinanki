import { parseAccentedPinyin } from '@/lib/pinyin';
import { useSettings } from '@/hooks/useSettings';

export default function PinyinText({
  pinyin,
  className = '',
}: {
  pinyin: string;
  className?: string;
}) {
  const { settings } = useSettings();
  const tokens = parseAccentedPinyin(pinyin);

  return (
    <span className={className}>
      {tokens.map((token, index) =>
        token.tone === null ? (
          <span key={index}>{token.text}</span>
        ) : (
          <span key={index} data-tone={token.tone} style={{ color: settings.toneColours[token.tone] }}>
            {token.text}
          </span>
        ),
      )}
    </span>
  );
}
