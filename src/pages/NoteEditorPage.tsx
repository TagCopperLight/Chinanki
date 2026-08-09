import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { createNote, deleteNote, getNote, updateNote } from '@/lib/db/notes';
import Button from '@/components/Button';
import DictionarySuggestions from '@/components/DictionarySuggestions';
import EmptyState from '@/components/EmptyState';
import Field, { inputClass } from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import type { DictEntry } from '@/lib/dictionary';

export default function NoteEditorPage() {
  const params = useParams();
  const navigate = useNavigate();
  const noteId = params.noteId ? Number(params.noteId) : null;
  const isEditing = noteId !== null;

  const [deckId, setDeckId] = useState(params.deckId ? Number(params.deckId) : 0);
  const [hanzi, setHanzi] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [meaning, setMeaning] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!isEditing);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (noteId === null) return;
    void (async () => {
      try {
        const note = await getNote(noteId);
        if (!note) {
          setLoadError('This word no longer exists.');
          return;
        }
        setDeckId(note.deckId);
        setHanzi(note.hanzi);
        setPinyin(note.pinyin);
        setMeaning(note.meaning);
        setNotes(note.notes);
        setLoaded(true);
      } catch (cause) {
        setLoadError(cause instanceof Error ? cause.message : 'Could not load this word');
      }
    })();
  }, [noteId]);

  /**
   * Overwrites all three fields. Picking a second suggestion must visibly
   * correct a wrong first pick, which a fill-only-if-blank rule cannot do.
   */
  function applySuggestion(entry: DictEntry) {
    setHanzi(entry.simplified);
    setPinyin(entry.pinyin);
    setMeaning(entry.meanings.join('; '));
  }

  async function save() {
    try {
      if (isEditing) {
        await updateNote(noteId, { hanzi, pinyin, meaning, notes });
      } else {
        await createNote({ deckId, hanzi, pinyin, meaning, notes });
      }
      navigate(`/deck/${deckId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note');
    }
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Note" backTo="/" />
        <EmptyState title="Couldn't load this word" description={loadError} />
      </>
    );
  }

  if (!loaded) return <PageHeader title="Note" backTo={`/deck/${deckId}`} />;

  return (
    <>
      <PageHeader title={isEditing ? 'Edit word' : 'Add word'} backTo={`/deck/${deckId}`} />
      <div className="space-y-4 p-4">
        <Field label="Hanzi">
          <input
            className={`${inputClass} text-2xl`}
            lang="zh-Hans"
            value={hanzi}
            autoFocus={!isEditing}
            onChange={(event) => setHanzi(event.target.value)}
          />
        </Field>

        <DictionarySuggestions query={hanzi} onPick={applySuggestion} />

        <Field label="Pinyin" hint="Accented, e.g. nǐ hǎo. Suggestions fill this in for you.">
          <input
            className={inputClass}
            value={pinyin}
            onChange={(event) => setPinyin(event.target.value)}
          />
        </Field>

        <Field label="Meaning" hint="Separate multiple senses with a semicolon.">
          <input
            className={inputClass}
            value={meaning}
            onChange={(event) => setMeaning(event.target.value)}
          />
        </Field>

        <Field label="Notes" hint="Shown on the answer side. Mnemonics, example sentences, anything.">
          <textarea
            className={`${inputClass} min-h-24 py-2`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={save}>
            Save
          </Button>
          {isEditing && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(`Delete "${hanzi}" and its cards?`)) return;
                await deleteNote(noteId);
                navigate(`/deck/${deckId}`);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
