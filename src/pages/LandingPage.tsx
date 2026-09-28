import { ArrowRight, Gamepad2, ShieldCheck, Stethoscope, Wind } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Balloon } from '../components/Balloon';
import { Brand } from '../components/Brand';
import { InstallPrompt } from '../components/InstallPrompt';

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing__header container">
        <Brand />
        <Link className="text-link" to="/about"><ShieldCheck size={18} /> Как мы бережём данные</Link>
      </header>
      <section className="hero container">
        <div className="hero__copy">
          <div className="eyebrow"><Wind size={18} /> Игра, которая слушает дыхание</div>
          <h1>Летим выше<br /><em>на одном дыхании</em></h1>
          <p>Помоги Шарику собрать звёздные монетки. Спокойный выдох поднимает его прямо к облакам!</p>
          <div className="hero__actions">
            <Link className="button button--primary button--large" to="/child">
              <Gamepad2 /> Играть <ArrowRight size={20} />
            </Link>
            <Link className="button button--soft button--large" to="/specialist">
              <Stethoscope /> Кабинет специалиста
            </Link>
          </div>
          <div className="privacy-note"><ShieldCheck size={19} /><span><b>Без записи голоса.</b> Звук анализируется только на устройстве.</span></div>
        </div>
        <div className="hero__scene" aria-label="Воздушный шар летит среди облаков">
          <div className="sun-orb" />
          <div className="cloud cloud--one" /><div className="cloud cloud--two" />
          <Balloon className="hero-balloon" />
          <div className="coin coin--one">★</div><div className="coin coin--two">★</div><div className="coin coin--three">★</div>
          <div className="wind-line wind-line--one" /><div className="wind-line wind-line--two" />
          <div className="hero__tip"><span>Выдыхай</span><b>и поднимайся!</b></div>
        </div>
      </section>
      <section className="how container">
        <article><span>1</span><div><b>Настрой микрофон</b><p>Послушаем тишину и твой спокойный выдох</p></div></article>
        <article><span>2</span><div><b>Дыши и лети</b><p>Собирай монетки и обходи птиц</p></div></article>
        <article><span>3</span><div><b>Смотри свой успех</b><p>Результат сохранится для специалиста</p></div></article>
      </section>
      <InstallPrompt />
    </main>
  );
}
