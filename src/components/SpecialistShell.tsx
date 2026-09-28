import { BarChart3, Gamepad2, HelpCircle, LogOut, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Brand } from './Brand';

export function SpecialistShell({ children, patientActive = false }: { children: ReactNode; patientActive?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="specialist-shell">
      <aside className="specialist-sidebar">
        <Brand to="/specialist" />
        <nav aria-label="Кабинет специалиста">
          <NavLink to="/specialist" end className={({ isActive }) => isActive && !patientActive ? 'active' : ''}><BarChart3 /> Обзор</NavLink>
          <NavLink to="/specialist" className={patientActive ? 'active' : ''}><Users /> Пациенты</NavLink>
          <span className="nav-disabled"><Settings /> Назначения <small>скоро</small></span>
        </nav>
        <div className="sidebar-bottom">
          <Link to="/about"><HelpCircle /> О сервисе</Link>
          <Link to="/"><Gamepad2 /> Открыть игру</Link>
          <button onClick={() => { sessionStorage.removeItem('legkie-clinician'); navigate('/'); }}><LogOut /> Выйти</button>
        </div>
      </aside>
      <div className="specialist-main">{children}</div>
    </div>
  );
}
