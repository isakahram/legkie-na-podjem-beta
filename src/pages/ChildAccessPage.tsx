import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Balloon } from '../components/Balloon';
import { Brand } from '../components/Brand';
import { useChild } from '../context/ChildContext';

export function ChildAccessPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setChild } = useChild();
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const profile = await api.accessChild(code);
      setChild(profile);
      navigate('/child/home');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не получилось войти');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="child-access sky-page">
      <header className="simple-header container"><Brand /><Link to="/" className="text-link"><ArrowLeft size={18} /> На главную</Link></header>
      <section className="access-card">
        <div className="access-card__mascot"><Balloon /></div>
        <div className="eyebrow"><KeyRound size={18} /> Твой игровой код</div>
        <h1>Привет! Давай полетаем?</h1>
        <p>Введи код, который дал взрослый</p>
        <form onSubmit={submit}>
          <label htmlFor="child-code">Код игрока</label>
          <input id="child-code" autoFocus autoComplete="off" maxLength={12} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="НАПРИМЕР, ВЕТЕР7" />
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button--primary button--large button--wide" disabled={loading || code.length < 3}>
            {loading ? 'Ищем…' : <>Вперёд <ArrowRight /></>}
          </button>
        </form>
        <div className="demo-codes">
          <span>Демо-коды:</span>
          {['ВЕТЕР7', 'ЗВЕЗДА', 'РАДУГА'].map((demoCode) => <button key={demoCode} type="button" onClick={() => setCode(demoCode)}>{demoCode}</button>)}
        </div>
        <small><ShieldCheck size={16} /> Здесь нет фамилий и записей голоса</small>
      </section>
    </main>
  );
}
