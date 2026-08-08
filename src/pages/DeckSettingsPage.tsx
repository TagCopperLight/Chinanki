import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteDeck, getDeck, updateDeck } from '@/lib/db/decks';
import { ALL_DIRECTIONS, DIRECTION_LABELS } from '@/lib/db/types';
import Button from '@/components/Button';
import Field, { inputClass } from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import type { Direction } from '@/lib/db/types';

const MIN_RETENTION = 0.7;
const MAX_RETENTION = 0.98;

export default function DeckSettingsPage() {
  const { deckId: param } = useParams();
  const deckId = Number(param);
  const navigate = useNavigate();
  const deck = useLiveQuery(() => getDeck(deckId), [deckId]);
  const [directionError, setDirectionError] = useState('');
  const [retentionError, setRetentionError] = useState('');
  const [learningStepsError, setLearningStepsError] = useState('');

  if (!deck) return <PageHeader title="Deck settings" backTo="/" />;

  async function toggleDirection(direction: Direction, enabled: boolean) {
    const next = enabled
      ? [...deck!.directions, direction]
      : deck!.directions.filter((d) => d !== direction);
    if (next.length === 0) {
      setDirectionError('A deck needs at least one card direction.');
      return;
    }
    if (!enabled) {
      const confirmed = window.confirm(
        `Disabling "${DIRECTION_LABELS[direction]}" deletes those cards and their review history. Continue?`,
      );
      if (!confirmed) return;
    }
    setDirectionError('');
    await updateDeck(deckId, { directions: ALL_DIRECTIONS.filter((d) => next.includes(d)) });
  }

  async function commitRetention(event: React.FocusEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (event.target.value.trim() === '' || !Number.isFinite(value) || value < MIN_RETENTION || value > MAX_RETENTION) {
      setRetentionError(`Desired retention must be between ${MIN_RETENTION} and ${MAX_RETENTION}.`);
      event.target.value = String(deck!.config.desiredRetention);
      return;
    }
    try {
      await updateDeck(deckId, { config: { ...deck!.config, desiredRetention: value } });
      setRetentionError('');
    } catch (cause) {
      setRetentionError(cause instanceof Error ? cause.message : 'Could not save desired retention');
      event.target.value = String(deck!.config.desiredRetention);
    }
  }

  async function commitLearningSteps(event: React.FocusEvent<HTMLInputElement>) {
    const steps = event.target.value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (steps.length === 0) {
      setLearningStepsError('Enter at least one positive learning step, in minutes.');
      event.target.value = deck!.config.learningSteps.join(', ');
      return;
    }
    try {
      await updateDeck(deckId, { config: { ...deck!.config, learningSteps: steps } });
      setLearningStepsError('');
    } catch (cause) {
      setLearningStepsError(cause instanceof Error ? cause.message : 'Could not save learning steps');
      event.target.value = deck!.config.learningSteps.join(', ');
    }
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
          {directionError && <p className="mt-2 text-sm text-red-600">{directionError}</p>}
        </fieldset>

        <Field label="Desired retention" hint="Higher means shorter intervals. 0.9 is a good default.">
          <input
            className={inputClass}
            type="number"
            min={MIN_RETENTION}
            max={MAX_RETENTION}
            step={0.01}
            defaultValue={deck.config.desiredRetention}
            onBlur={commitRetention}
          />
        </Field>
        {retentionError && <p className="text-sm text-red-600">{retentionError}</p>}

        <Field label="Learning steps (minutes, comma separated)">
          <input className={inputClass} defaultValue={deck.config.learningSteps.join(', ')} onBlur={commitLearningSteps} />
        </Field>
        {learningStepsError && <p className="text-sm text-red-600">{learningStepsError}</p>}

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
