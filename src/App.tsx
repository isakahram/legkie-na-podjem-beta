import { Navigate, Route, Routes } from 'react-router-dom';
import { ChildProvider } from './context/ChildContext';
import { AboutPage } from './pages/AboutPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { ChildAccessPage } from './pages/ChildAccessPage';
import { ChildHomePage } from './pages/ChildHomePage';
import { GamePage } from './pages/GamePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { ResultPage } from './pages/ResultPage';
import { SpecialistPage } from './pages/SpecialistPage';
import { SpecialistAuthProvider } from './specialist/AuthContext';
import { specialistRoutes } from './specialist/routes';

export default function App() {
  return (
    <ChildProvider>
      <SpecialistAuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />

          {/* Игра ребёнка — маршруты не меняются */}
          <Route path="/child" element={<ChildAccessPage />} />
          <Route path="/child/home" element={<ChildHomePage />} />
          <Route path="/child/calibration" element={<CalibrationPage />} />
          <Route path="/child/game" element={<GamePage />} />
          <Route path="/child/result" element={<ResultPage />} />

          {/* Кабинет специалиста */}
          {specialistRoutes}

          {/* Интерфейс этапа 1 остаётся доступным до завершения перехода на API v1 */}
          <Route path="/specialist-legacy" element={<SpecialistPage />} />
          <Route path="/specialist-legacy/patient/:id" element={<PatientPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SpecialistAuthProvider>
    </ChildProvider>
  );
}
