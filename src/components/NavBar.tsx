import { NavLink } from 'react-router';

const TABS = [
  { to: '/', label: 'Decks', icon: '📚' },
  { to: '/stats', label: 'Stats', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
] as const;

export default function NavBar() {
  return (
    <nav className="sticky bottom-0 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-900">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'
            }`
          }
        >
          <span aria-hidden className="text-xl">
            {tab.icon}
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
