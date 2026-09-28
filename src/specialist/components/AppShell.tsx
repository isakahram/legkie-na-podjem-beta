import { CalendarRange, Eye, LayoutDashboard, LogOut, Menu, Settings, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Brand } from '../../components/Brand';
import { specialistInitials, specialistName, useSpecialistAuth } from '../AuthContext';
import { useViewport } from '../hooks';

// Разделы кабинета. Сессии и настройки подключаются в подэтапе 2.2.3.
const NAV_ITEMS = [
  { to: '/specialist', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/specialist/patients', label: 'Пациенты', icon: Users, end: false },
  { to: '/specialist/sessions', label: 'Занятия', icon: CalendarRange, end: false },
  { to: '/specialist/settings', label: 'Настройки', icon: Settings, end: false },
];

const formatToday = (): string =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isDemo, logout } = useSpecialistAuth();
  const navigate = useNavigate();
  const viewport = useViewport();
  const [navOpen, setNavOpen] = useState(false);
  const collapsible = viewport !== 'laptop';

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`sp-shell${collapsible ? ' sp-shell--compact' : ''}`}>
      <aside className={`sp-sidebar${navOpen ? ' is-open' : ''}`}>
        <Brand to="/specialist" />
        <nav aria-label="Разделы кабинета">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              <item.icon size={18} aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sp-sidebar__foot">
          {isDemo && (
            <p className="sp-demo-note">
              <Eye size={14} aria-hidden /> Демонстрационный режим
            </p>
          )}
          <button type="button" onClick={handleLogout}>
            <LogOut size={18} aria-hidden /> Выйти
          </button>
        </div>
      </aside>

      <div className="sp-main">
        <header className="sp-topbar">
          {collapsible && (
            <button
              type="button"
              className="sp-topbar__menu"
              aria-label="Открыть меню разделов"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              <Menu size={20} aria-hidden />
            </button>
          )}
          <div className="sp-topbar__title">
            <small>{formatToday()}</small>
            <b>{specialistName(user)}</b>
          </div>
          <div className="sp-topbar__side">
            {isDemo && <span className="sp-demo-chip">Демонстрационный режим</span>}
            <span className="sp-avatar" aria-hidden>
              {specialistInitials(user)}
            </span>
            <button type="button" className="sp-topbar__logout" onClick={handleLogout}>
              <LogOut size={18} aria-hidden />
              <span>Выход</span>
            </button>
          </div>
        </header>
        <main className="sp-content">{children}</main>
      </div>
    </div>
  );
}
