import { ArrowRight, Coins, Gauge, Home, Palette, RotateCcw, Sparkles, Timer, Wind } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Balloon } from '../components/Balloon';
import { useChild } from '../context/ChildContext';

/** Экран результата всегда позитивный: проигрыша в игре нет. */
export function ResultPage() {
  const { child, lastSession } = useChild();
  const navigate = useNavigate();
  if (!child) return <Navigate to="/child" replace />;
  if (!lastSession) return <Navigate to="/child/home" replace />;

  const activeSkin = child.skins.find((skin) => skin.id === child.selectedSkin);
  const breaths = lastSession.completedCycles;
  const bestDuration = lastSession.averageBreathDuration;
  const stability = lastSession.averageStability;
  const minutes = Math.round(lastSession.durationSeconds / 60);
  const locked = child.skins.filter((skin) => !skin.owned).sort((a, b) => a.price - b.price);
  const nextSkin = locked.find((skin) => skin.price <= child.balance) ?? locked[0];
  const unlocked = nextSkin ? child.balance >= nextSkin.price : false;

  return (
    <main className="result-page sky-page">
      <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
      <section className="result-card">
        <div className="result-card__visual">
          <span className="result-halo" />
          <Balloon skin={activeSkin} className="result-balloon" />
          <span className="result-star result-star--1">★</span>
          <span className="result-star result-star--2">★</span>
        </div>
        <div className="result-card__content">
          <div className="success-badge"><Sparkles /> Полёт засчитан</div>
          <h1>{breaths > 0 ? 'Отличный полёт!' : 'Хорошее начало!'}</h1>
          <p>
            {breaths > 0
              ? 'Ты собрал монеты и подышал ровно. Можно собой гордиться!'
              : 'Ты уже в небе — в следующий раз попробуем выдох подлиннее. Монеты остаются с тобой.'}
          </p>

          <div className="result-score">
            <div><Coins /><span><small>Монет</small><b>{lastSession.coinsCollected}</b></span></div>
            <div><Wind /><span><small>Ровных выдохов</small><b>{breaths}</b></span></div>
            <div>
              <Timer />
              <span>
                <small>Лучшая длительность</small>
                <b>{bestDuration === null ? '—' : `${bestDuration.toFixed(1)} с`}</b>
              </span>
            </div>
            <div>
              <Gauge />
              <span>
                <small>Ровность дыхания</small>
                <b>{stability === null ? '—' : stability}</b>
              </span>
            </div>
          </div>

          <div className="goal-progress">
            <div><span>Время в небе</span><b>{minutes} мин</b></div>
            <i><em style={{ width: '100%' }} /></i>
          </div>

          {nextSkin && (
            <div className="next-skin">
              <Palette />
              <span>
                {unlocked
                  ? <>Монет хватает на новый образ <b>«{nextSkin.name}»</b> — открой его в меню!</>
                  : <>До образа <b>«{nextSkin.name}»</b> осталось {nextSkin.price - child.balance} монет</>}
              </span>
            </div>
          )}

          <div className="result-actions">
            <button className="button button--primary button--large" onClick={() => navigate('/child/game')}>
              <RotateCcw /> Полететь ещё
            </button>
            <button className="button button--soft button--large" onClick={() => navigate('/child/home')}>
              <Home /> В меню <ArrowRight />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
