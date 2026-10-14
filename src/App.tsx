import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import BrowsePage from '@/pages/BrowsePage';
import DeckListPage from '@/pages/DeckListPage';
import DeckPage from '@/pages/DeckPage';
import DeckSettingsPage from '@/pages/DeckSettingsPage';
import NoteEditorPage from '@/pages/NoteEditorPage';
import SettingsPage from '@/pages/SettingsPage';
import StudyPage from '@/pages/StudyPage';
import EmptyState from '@/components/EmptyState';
import NavBar from '@/components/NavBar';
import { useSettings } from '@/hooks/useSettings';

// Recharts is heavy and only used on the Statistics page, so load it lazily.
const StatsPage = lazy(() => import('@/pages/StatsPage'));

function StatsFallback() {
  return <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Loading statistics…</div>;
}

function AppRoutes() {
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

/** Applies the stored theme to <html> so Tailwind's dark: variants respond. */
function ThemeEffect() {
  const { settings } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    root.classList.toggle('dark', dark);
  }, [settings.theme]);
  return null;
}

/** The study screen is full-bleed; every other screen gets the tab bar. */
function Shell() {
  const location = useLocation();
  const isStudying = location.pathname.endsWith('/study');
  return (
    <div className="mx-auto flex h-full max-w-[480px] flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <main className="flex-1 overflow-y-auto">
        <AppRoutes />
      </main>
      {!isStudying && <NavBar />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeEffect />
      <Shell />
    </BrowserRouter>
  );
}
