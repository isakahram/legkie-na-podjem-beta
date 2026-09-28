import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSpecialistAuth } from './AuthContext';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';

/**
 * Гейт кабинета: пока профиль не подтверждён сервером, интерфейс не рендерится.
 * Проверка прав дублируется на сервере — здесь только маршрутизация.
 */
export function SpecialistLayout() {
  const { status } = useSpecialistAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="sp-boot">
        <Spinner label="Открываем кабинет…" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
