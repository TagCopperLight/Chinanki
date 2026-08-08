import { Route, Routes } from 'react-router';
import BrowsePage from '@/pages/BrowsePage';
import DeckListPage from '@/pages/DeckListPage';
import DeckPage from '@/pages/DeckPage';
import DeckSettingsPage from '@/pages/DeckSettingsPage';
import NoteEditorPage from '@/pages/NoteEditorPage';
import SettingsPage from '@/pages/SettingsPage';
import StatsPage from '@/pages/StatsPage';
import StudyPage from '@/pages/StudyPage';
import EmptyState from '@/components/EmptyState';

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
      <Route path="/stats" element={<StatsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<EmptyState title="Page not found" />} />
    </Routes>
  );
}
