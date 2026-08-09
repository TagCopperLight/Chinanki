import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { X } from 'lucide-react';
import { StudySession } from '@/lib/study';
import { answerFor, isWritingDirection, promptFor, type NoteField } from '@/lib/study/prompt';
import { drawableCharacters } from '@/lib/writing/characters';
import type { Stroke } from '@/lib/writing/strokes';
import { DIRECTION_LABELS } from '@/lib/db/types';
import type { Rating } from '@/lib/fsrs';
import type { QueueItem } from '@/lib/study';
import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import HanziText from '@/components/HanziText';
import PinyinText from '@/components/PinyinText';
import RatingButtons from '@/components/RatingButtons';
import WritingAnswer from '@/components/WritingAnswer';
import WritingPrompt from '@/components/WritingPrompt';

function FieldView({
  field,
  item,
  large,
  colour = true,
}: {
  field: NoteField;
  item: QueueItem;
  large: boolean;
  colour?: boolean;
}) {
  const { note } = item;
  const size = large ? 'text-5xl' : 'text-2xl';
  if (field === 'hanzi') {
    return (
      <HanziText
        hanzi={note.hanzi}
        pinyin={note.pinyin}
        colour={colour}
        className={`${size} leading-tight`}
      />
    );
  }
  if (field === 'pinyin') {
    return <PinyinText pinyin={note.pinyin} className={large ? 'text-4xl' : 'text-xl'} />;
  }
  return <span className={large ? 'text-3xl' : 'text-xl'}>{note.meaning}</span>;
}

export default function StudyPage() {
  const { deckId: param } = useParams();
  const deckId = Number(param);
  const navigate = useNavigate();

  const [session, setSession] = useState<StudySession | null>(null);
  const [item, setItem] = useState<QueueItem | null>(null);
  const [revealed, setRevealed] = useState(false);
  // Writing cards only. Drawings are deliberately not persisted: they exist to
  // be compared against the answer once, then thrown away.
  const [charIndex, setCharIndex] = useState(0);
  const [drawings, setDrawings] = useState<Stroke[][]>([]);
  const [ghost, setGhost] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const shownAt = useRef(Date.now());
  // rate() is async and awaits an IndexedDB write before resetting `revealed`.
  // Without this flag, a held key's repeat events (or a fast double click)
  // can all observe stale state and each call rate(), logging duplicate
  // reviews for one card. This guards the answering path itself, since state
  // updates alone are too slow to prevent overlapping invocations.
  const answering = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const started = await StudySession.start(deckId, Date.now());
        setSession(started);
        setItem(started.current);
        shownAt.current = Date.now();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not start this study session');
      }
    })();
  }, [deckId]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!session) return;
      if (answering.current) return;
      answering.current = true;
      try {
        await session.answer(rating, Date.now(), Date.now() - shownAt.current);
        setItem(session.current);
        setRevealed(false);
        setCharIndex(0);
        setDrawings([]);
        setGhost(true);
        shownAt.current = Date.now();
        setTick((value) => value + 1);
      } finally {
        answering.current = false;
      }
    },
    [session],
  );

  const undo = useCallback(async () => {
    if (!session) return;
    await session.undo();
    setItem(session.current);
    setRevealed(false);
    setCharIndex(0);
    setDrawings([]);
    setGhost(true);
    shownAt.current = Date.now();
    setTick((value) => value + 1);
  }, [session]);

  const writing = item !== null && isWritingDirection(item.card.direction);
  const characters = writing && item ? drawableCharacters(item.note.hanzi, item.note.pinyin) : [];
  const moreCharacters = writing && charIndex < characters.length - 1;

  // Keyboard shortcuts make desktop review fast; the buttons stay the mobile
  // path. Scope: this global listener only acts when focus is NOT on an
  // interactive control (button/link/input/textarea/select). When a rating
  // button, Close, or Undo is focused, native activation (click) must win so
  // Enter/Space triggers *that* control instead of being hijacked into
  // rate(3) via preventDefault(). Auto-repeat is also ignored (event.repeat)
  // so holding a key can't fire rate() more than once.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const interactiveTags = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'];
        if (interactiveTags.includes(target.tagName)) return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (revealed) void rate(3);
        else if (moreCharacters) setCharIndex((index) => index + 1);
        else setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        void rate(Number(event.key) as Rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, rate, moreCharacters]);

  if (error) {
    return (
      <EmptyState
        title="Couldn't start this study session"
        description={error}
        action={<Button onClick={() => navigate('/')}>Back to decks</Button>}
      />
    );
  }

  if (!session) return null;

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl font-bold">All done 🎉</p>
        <p className="text-sm text-slate-500">
          {session.counts.answered} card{session.counts.answered === 1 ? '' : 's'} reviewed.
        </p>
        <div className="flex gap-2">
          {session.counts.answered > 0 && (
            <Button variant="secondary" onClick={undo}>
              Undo
            </Button>
          )}
          <Button onClick={() => navigate(`/deck/${deckId}`)}>Back to deck</Button>
        </div>
      </div>
    );
  }

  const counts = session.counts;
  const now = Date.now();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-sm">
        <button
          type="button"
          aria-label="Close"
          onClick={() => navigate(`/deck/${deckId}`)}
          className="flex min-h-11 min-w-11 items-center justify-center text-slate-500"
        >
          <X size={20} />
        </button>
        <span className="flex-1 text-center text-xs text-slate-500">
          {DIRECTION_LABELS[item.card.direction]}
        </span>
        <span className="tabular-nums text-xs">
          <span className="text-sky-600">{counts.new}</span>{' '}
          <span className="text-red-500">{counts.learning}</span>{' '}
          <span className="text-green-600">{counts.review}</span>
        </span>
      </header>

      <div
        className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center"
        key={tick}
      >
        <div data-testid="prompt">
          {/* colour only affects the hanzi branch of FieldView; it's a no-op
              when the prompt field is pinyin or meaning. */}
          <FieldView field={promptFor(item.card.direction)} item={item} large colour={revealed} />
        </div>

        {writing && !revealed && (
          <WritingPrompt
            count={characters.length}
            index={charIndex}
            strokes={drawings}
            onStrokesChange={(index, strokes) =>
              setDrawings((previous) => {
                const next = [...previous];
                next[index] = strokes;
                return next;
              })
            }
          />
        )}

        {revealed && (
          <div
            data-testid="answer"
            className="w-full space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700"
          >
            {writing && (
              <WritingAnswer
                characters={characters}
                strokes={drawings}
                ghost={ghost}
                onToggleGhost={() => setGhost((shown) => !shown)}
              />
            )}
            <div className="font-semibold">
              <FieldView field={answerFor(item.card.direction)} item={item} large={false} />
            </div>
            <div className="space-y-1 text-slate-500">
              {promptFor(item.card.direction) !== 'hanzi' &&
                answerFor(item.card.direction) !== 'hanzi' && (
                  <HanziText hanzi={item.note.hanzi} pinyin={item.note.pinyin} className="text-2xl" />
                )}
              {promptFor(item.card.direction) !== 'pinyin' &&
                answerFor(item.card.direction) !== 'pinyin' && (
                  <PinyinText pinyin={item.note.pinyin} className="block text-lg" />
                )}
              {promptFor(item.card.direction) !== 'meaning' &&
                answerFor(item.card.direction) !== 'meaning' && (
                  <span className="block">{item.note.meaning}</span>
                )}
            </div>
            {item.note.notes && (
              <p className="whitespace-pre-wrap text-sm text-slate-500">{item.note.notes}</p>
            )}
          </div>
        )}
      </div>

      <footer className="space-y-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        {revealed ? (
          <RatingButtons previews={session.previews(now)} now={now} onRate={rate} />
        ) : moreCharacters ? (
          <Button className="min-h-14 w-full" onClick={() => setCharIndex(charIndex + 1)}>
            Next
          </Button>
        ) : (
          <Button className="min-h-14 w-full" onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        )}
        <div className="flex justify-center gap-2">
          {!revealed && moreCharacters && (
            <Button variant="ghost" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          )}
          <Button variant="ghost" disabled={counts.answered === 0} onClick={undo}>
            Undo
          </Button>
        </div>
      </footer>
    </div>
  );
}
