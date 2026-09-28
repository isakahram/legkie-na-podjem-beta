import { ArrowRight, Eye, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../../components/Brand';
import { useSpecialistAuth } from '../AuthContext';
import { ErrorBanner } from '../components/ui';

/**
 * Явно выделенный ознакомительный вход.
 * Данные синтетические, любые изменения на сервере запрещены (403).
 */
export function DemoEntryPage() {
  const { startDemo } = useSpecialistAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const enter = async (): Promise<void> => {
    setError('');
    setPending(true);
    try {
      await startDemo();
      navigate('/specialist', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть ознакомительный режим');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="sp-auth sp-auth--demo">
      <header className="sp-auth__top">
        <Brand to="/" />
        <Link to="/login" className="sp-auth__link">
          Вход для специалиста <ArrowRight size={16} aria-hidden />
        </Link>
      </header>

      <section className="sp-auth__card">
        <span className="sp-demo-chip sp-demo-chip--large">
          <Eye size={14} aria-hidden /> Демонстрационный режим
        </span>
        <h1>Ознакомительный доступ</h1>
        <p className="sp-auth__lead">
          Кабинет открывается на синтетических профилях. Реальных персональных данных здесь нет.
        </p>

        <ul className="sp-auth__list">
          <li>
            <Lock size={15} aria-hidden /> Только просмотр: создание и редактирование недоступны
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden /> Девять учебных профилей с готовой историей занятий
          </li>
        </ul>

        {error && <ErrorBanner message={error} />}

        <button type="button" className="sp-button sp-button--primary" onClick={enter} disabled={pending}>
          {pending ? 'Готовим данные…' : 'Открыть ознакомительный режим'}
          {!pending && <ArrowRight size={18} aria-hidden />}
        </button>
      </section>
    </main>
  );
}
