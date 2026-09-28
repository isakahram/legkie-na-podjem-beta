import { ArrowRight, Coins, LogOut, Palette, Play, Sparkles, Target, X } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Balloon } from '../components/Balloon';
import { Brand } from '../components/Brand';
import { useChild } from '../context/ChildContext';
import type { ChildProfile } from '../types';

export function ChildHomePage() {
  const { child, setChild, logout } = useChild();
  const [shopOpen, setShopOpen] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  if (!child) return <Navigate to="/child" replace />;
  const activeSkin = child.skins.find((skin) => skin.id === child.selectedSkin) ?? child.skins[0];

  async function chooseSkin(skinId: string, owned: boolean) {
    setMessage('');
    try {
      const next = owned ? await api.selectSkin(child!.id, skinId) : await api.buySkin(child!.id, skinId);
      setChild(next);
      if (!owned) setMessage('Новый образ открыт! ✨');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не получилось открыть образ');
    }
  }

  return (
    <main className="child-home sky-page">
      <header className="simple-header container">
        <Brand to="/child/home" />
        <div className="child-topbar"><span className="coin-pill"><Coins size={19} /> {child.balance}</span><button className="icon-button" aria-label="Выйти" onClick={() => { logout(); navigate('/'); }}><LogOut /></button></div>
      </header>
      <section className="child-hub container">
        <div className="child-hub__copy">
          <span className="hello-pill">Привет, {child.nickname.split(' ')[0]}! 👋</span>
          <h1>Готов к новому<br /><em>воздушному пути?</em></h1>
          <div className="mission-card">
            <span className="mission-card__icon"><Target /></span>
            <div><small>Задание на сегодня</small><b>{child.assignment.targetBreaths} спокойных выдохов</b><p>Лети в своём темпе — спешить не нужно</p></div>
          </div>
          <button className="button button--primary button--xl" onClick={() => navigate('/child/calibration')}><Play fill="currentColor" /> Начать полёт <ArrowRight /></button>
          <button className="button button--white" onClick={() => setShopOpen(true)}><Palette /> Выбрать образ</button>
        </div>
        <div className="child-hub__scene">
          <div className="cloud cloud--one" /><div className="cloud cloud--two" />
          <Balloon skin={activeSkin} className="hub-balloon" />
          <span className="spark spark--one">✦</span><span className="spark spark--two">✦</span>
          <div className="skin-label"><Sparkles size={18} /><span>Твой образ</span><b>{activeSkin.name}</b></div>
        </div>
      </section>
      {shopOpen && <Shop child={child} message={message} onChoose={chooseSkin} onClose={() => setShopOpen(false)} />}
    </main>
  );
}

function Shop({ child, message, onChoose, onClose }: { child: ChildProfile; message: string; onChoose: (id: string, owned: boolean) => Promise<void>; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal shop-modal" role="dialog" aria-modal="true" aria-labelledby="shop-title">
        <button className="modal__close" onClick={onClose} aria-label="Закрыть"><X /></button>
        <div><div className="eyebrow"><Palette size={18} /> Воздушный гардероб</div><h2 id="shop-title">Выбери образ</h2><p>Монетки остаются навсегда — собирай их в полёте!</p></div>
        <span className="coin-pill"><Coins size={18} /> {child.balance}</span>
        <div className="skin-grid">
          {child.skins.map((skin) => {
            const selected = child.selectedSkin === skin.id;
            return <button className={`skin-card ${selected ? 'skin-card--selected' : ''}`} key={skin.id} onClick={() => void onChoose(skin.id, skin.owned)} disabled={selected}>
              <Balloon skin={skin} />
              <b>{skin.name}</b>
              <span>{selected ? 'Выбран' : skin.owned ? 'Надеть' : <><Coins size={15} /> {skin.price}</>}</span>
            </button>;
          })}
        </div>
        {message && <div className="shop-message">{message}</div>}
      </section>
    </div>
  );
}
