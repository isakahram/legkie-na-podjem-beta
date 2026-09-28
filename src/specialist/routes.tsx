import { Route } from 'react-router-dom';
import { SpecialistLayout } from './SpecialistLayout';
import { DashboardPage } from './pages/DashboardPage';
import { DemoEntryPage } from './pages/DemoEntryPage';
import { LoginPage } from './pages/LoginPage';
import { PatientsPage } from './pages/PatientsPage';

/**
 * Маршруты кабинета специалиста одним определением:
 * используются и приложением, и тестами навигации.
 */
export const specialistRoutes = (
  <>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/demo" element={<DemoEntryPage />} />
    <Route path="/specialist" element={<SpecialistLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="patients" element={<PatientsPage />} />
    </Route>
  </>
);
