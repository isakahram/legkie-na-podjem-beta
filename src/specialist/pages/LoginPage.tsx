import { ArrowRight, Eye, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Brand } from '../../components/Brand';
import { useSpecialistAuth } from '../AuthContext';
import { ErrorBanner } from '../components/ui';

export function LoginPage() {
  const { login, status } = useSpecialistAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (status === 'authenticated') return <Navigate to="/specialist" replace />;

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(email, password);
      navigate('/specialist', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось войти');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="sp-auth">
      <header className="sp-auth__top">
        <Brand to="/" />
        <Link to="/" className="sp-auth__link">
          Открыть игру <ArrowRight size={16} aria-hidden />
        </Link>
      </header>

      <section className="sp-auth__card">
        <h1>Кабинет специалиста</h1>
        <p className="sp-auth__lead">Войдите, чтобы видеть занятия, назначения и динамику своих пациентов.</p>

        <form onSubmit={onSubmit} className="sp-form">
          {error && <ErrorBanner message={error} />}

          <label className="sp-field">
            <span>Рабочая почта</span>
            <div className="sp-field__control">
              <Mail size={16} aria-hidden />
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="specialist@clinic.ru"
              />
            </div>
          </label>

          <label className="sp-field">
            <span>Пароль</span>
            <div className="sp-field__control">
              <Lock size={16} aria-hidden />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>

          <button type="submit" className="sp-button sp-button--primary" disabled={pending}>
            {pending ? 'Проверяем…' : 'Войти'}
            {!pending && <ArrowRight size={18} aria-hidden />}
          </button>
        </form>

        <p className="sp-auth__hint">
          <ShieldCheck size={14} aria-hidden /> Доступ к данным ребёнка выдаётся администратором организации.
        </p>

        <Link to="/demo" className="sp-auth__demo">
          <Eye size={16} aria-hidden /> Посмотреть ознакомительный режим
        </Link>
      </section>
    </main>
  );
}
