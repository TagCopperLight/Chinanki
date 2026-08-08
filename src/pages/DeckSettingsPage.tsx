import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteDeck, getDeck, updateDeck } from '@/lib/db/decks';
import { ALL_DIRECTIONS, DIRECTION_LABELS } from '@/lib/db/types';
import Button from '@/components/Button';
import Field, { inputClass } from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import type { Direction } from '@/lib/db/types';

export default function DeckSettingsPage() {
  const { deckId: param } = useParams();
  const deckId = Number(param);
  const navigate = useNavigate();
  const deck = useLiveQuery(() => getDeck(deckId), [deckId]);

  if (!deck) return <PageHeader title="Deck settings" backTo="/" />;

  async function toggleDirection(direction: Direction, enabled: boolean) {
    const next = enabled
      ? [...deck!.directions, direction]
      : deck!.directions.filter((d) => d !== direction);
    if (next.length === 0) return;
    if (!enabled) {
      const confirmed = window.confirm(
        `Disabling "${DIRECTION_LABELS[direction]}" deletes those cards and their review history. Continue?`,
      );
      if (!confirmed) return;
    }
    await updateDeck(deckId, { directions: ALL_DIRECTIONS.filter((d) => next.includes(d)) });
  }

  return (
    <>
      <PageHeader title="Deck settings" backTo={`/deck/${deckId}`} />
      <div className="space-y-6 p-4">
        <Field label="Name">
          <input
            className={inputClass}
            defaultValue={deck.name}
            onBlur={(event) => updateDeck(deckId, { name: event.target.value })}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            Card directions
          </legend>
          <div className="space-y-2">
            {ALL_DIRECTIONS.map((direction) => (
              <label key={direction} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={deck.directions.includes(direction)}
                  onChange={(event) => toggleDirection(direction, event.target.checked)}
                />
                <span>{DIRECTION_LABELS[direction]}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Nothing prompts for the character itself — writing practice comes later.
          </p>
        </fieldset>

        <Field label="Desired retention" hint="Higher means shorter intervals. 0.9 is a good default.">
          <input
            className={inputClass}
            type="number"
            min={0.7}
            max={0.98}
            step={0.01}
            defaultValue={deck.config.desiredRetention}
            onBlur={(event) =>
              updateDeck(deckId, {
                config: { ...deck.config, desiredRetention: Number(event.target.value) },
              })
            }
          />
        </Field>

        <Field label="Learning steps (minutes, comma separated)">
          <input
            className={inputClass}
            defaultValue={deck.config.learningSteps.join(', ')}
            onBlur={(event) =>
              updateDeck(deckId, {
                config: {
                  ...deck.config,
                  learningSteps: event.target.value
                    .split(',')
                    .map((part) => Number(part.trim()))
                    .filter((n) => Number.isFinite(n) && n > 0),
                },
              })
            }
          />
        </Field>

        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            if (!window.confirm(`Delete "${deck.name}" and all of its words?`)) return;
            await deleteDeck(deckId);
            navigate('/');
          }}
        >
          Delete deck
        </Button>
      </div>
    </>
  );
}
