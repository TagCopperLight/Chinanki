import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import BrowsePage from '@/pages/BrowsePage';
import DeckListPage from '@/pages/DeckListPage';
import DeckPage from '@/pages/DeckPage';
import DeckSettingsPage from '@/pages/DeckSettingsPage';
import NoteEditorPage from '@/pages/NoteEditorPage';
import SettingsPage from '@/pages/SettingsPage';
import StudyPage from '@/pages/StudyPage';
import EmptyState from '@/components/EmptyState';

// Recharts (and its transitive deps) are only needed on the Statistics
// screen, which is visited far less often than the daily Study page.
// Loading it lazily keeps it out of the main bundle that every user
// downloads on first install.
const StatsPage = lazy(() => import('@/pages/StatsPage'));

function StatsFallback() {
  return <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Loading statistics…</div>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DeckListPage />} />
      <Route path="/deck/:deckId" element={<DeckPage />} />
      <Route path="/deck/:deckId/settings" element={<DeckSettingsPage />} />
      <Route path="/deck/:deckId/study" element={<StudyPage />} />
      <Route path="/deck/:deckId/browse" element={<BrowsePage />} />
      <Route path="/deck/:deckId/note/new" element={<NoteEditorPage />} />
      <Route path="/note/:noteId" element={<NoteEditorPage />} />
      <Route
        path="/stats"
        element={
          <Suspense fallback={<StatsFallback />}>
            <StatsPage />
          </Suspense>
        }
      />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<EmptyState title="Page not found" />} />
    </Routes>
  );
}
