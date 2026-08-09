import { NavLink } from 'react-router';
import { ChartColumn, Library, Settings } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Decks', Icon: Library },
  { to: '/stats', label: 'Stats', Icon: ChartColumn },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const;

export default function NavBar() {
  return (
    <nav className="sticky bottom-0 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-900">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
