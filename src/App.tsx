import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router';
import AppRoutes from '@/routes';
import NavBar from '@/components/NavBar';
import { useSettings } from '@/hooks/useSettings';

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
