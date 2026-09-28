import { ArrowRight, Check, Coins, Home, RotateCcw, ShieldCheck, Target, Wind } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Balloon } from '../components/Balloon';
import { useChild } from '../context/ChildContext';

export function ResultPage() {
  const { child, lastSession } = useChild();
  const navigate = useNavigate();
  if (!child) return <Navigate to="/child" replace />;
  if (!lastSession) return <Navigate to="/child/home" replace />;
  const activeSkin = child.skins.find((skin) => skin.id === child.selectedSkin);
  const completed = lastSession.completedCycles;
  const target = lastSession.targetCycles;
  const percent = Math.min(100, Math.round((completed / target) * 100));

  return (
    <main className="result-page sky-page">
      <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
      <section className="result-card">
        <div className="result-card__visual"><span className="result-halo" /><Balloon skin={activeSkin} className="result-balloon" /><span className="result-star result-star--1">★</span><span className="result-star result-star--2">★</span></div>
        <div className="result-card__content">
          <div className="success-badge"><Check /> Полёт завершён</div>
          <h1>{percent >= 90 ? 'Вот это высота!' : 'Отличный полёт!'}</h1>
          <p>Ты спокойно прошёл свой воздушный маршрут. Можно собой гордиться!</p>
          <div className="result-score">
            <div><Wind /><span><small>Выдохов</small><b>{completed}<em> / {target}</em></b></span></div>
            <div><Coins /><span><small>Монет</small><b>{lastSession.coinsCollected}</b></span></div>
            <div><Target /><span><small>Точность</small><b>{Math.round(lastSession.correctBreathPercent)}%</b></span></div>
          </div>
          <div className="goal-progress"><div><span>Цель занятия</span><b>{percent}%</b></div><i><em style={{ width: `${percent}%` }} /></i></div>
          {lastSession.inputMode === 'demo' && <div className="demo-warning"><ShieldCheck /> Это был демо-полёт: он не влияет на показатели и баланс монет</div>}
          <div className="result-actions"><button className="button button--primary button--large" onClick={() => navigate('/child/calibration')}><RotateCcw /> Полететь ещё</button><button className="button button--soft button--large" onClick={() => navigate('/child/home')}><Home /> В меню <ArrowRight /></button></div>
        </div>
      </section>
    </main>
  );
}
