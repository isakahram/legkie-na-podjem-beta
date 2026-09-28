import { ArrowRight, Check, Coins, Lock, LogOut, Palette, Play, Sparkles, Target, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Balloon } from '../components/Balloon';
import { Brand } from '../components/Brand';
import { useChild } from '../context/ChildContext';
import { buildShopSections } from '../skins/shop';
import type { ChildProfile } from '../types';
import { pluralizeCoins } from '../utils/pluralize';

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
  const ownedIds = new Set(child.skins.filter((skin) => skin.owned).map((skin) => skin.id));
  const sections = buildShopSections(ownedIds, child.selectedSkin, child.balance);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal shop-modal" role="dialog" aria-modal="true" aria-labelledby="shop-title">
        <div className="shop-modal__header">
          <div className="shop-modal__intro">
            <div className="eyebrow"><Palette size={18} /> Воздушный гардероб</div>
            <h2 id="shop-title">Выбери образ</h2>
            <p>Монетки остаются навсегда — собирай их в полёте!</p>
          </div>
          <div className="shop-modal__header-actions">
            <span className="coin-pill" title="Общий накопленный баланс"><Coins size={18} /> Всего: {child.balance} {pluralizeCoins(child.balance)}</span>
            <button className="modal__close" onClick={onClose} aria-label="Закрыть"><X /></button>
          </div>
        </div>
        <div className="shop-modal__body">
          {sections.map((section) => (
            <div className="shop-section" key={section.category}>
              <h3 className="shop-section__title">{section.title}</h3>
              <div className="skin-grid">
                {section.skins.map((skin) => {
                  const clickable = skin.status === 'owned' || skin.status === 'available';
                  const locked = skin.status === 'locked-price' || skin.status === 'locked-progress';
                  return (
                    <button
                      className={`skin-card skin-card--${skin.status}`}
                      key={skin.id}
                      style={{ '--skin-color': skin.color, '--skin-accent': skin.accent } as CSSProperties}
                      onClick={() => clickable && void onChoose(skin.id, skin.status === 'owned')}
                      disabled={!clickable}
                    >
                      {locked && <span className="skin-card__badge skin-card__badge--lock" aria-hidden="true"><Lock size={15} /></span>}
                      {(skin.status === 'owned' || skin.status === 'selected') && (
                        <span className="skin-card__badge skin-card__badge--check" aria-hidden="true"><Check size={15} /></span>
                      )}
                      <Balloon skin={{ id: skin.id }} />
                      <b>{skin.name}</b>
                      <span className="skin-card__status">
                        {skin.status === 'selected' && 'Выбран'}
                        {skin.status === 'owned' && 'Надеть'}
                        {skin.status === 'available' && <><Coins size={14} /> Открыть за {skin.price} {pluralizeCoins(skin.price)}</>}
                        {locked && skin.reason}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {message && <div className="shop-message">{message}</div>}
        </div>
      </section>
    </div>
  );
}
