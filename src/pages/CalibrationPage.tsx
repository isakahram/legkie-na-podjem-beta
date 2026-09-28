import { ArrowLeft, ArrowRight, Check, Mic, RefreshCw, ShieldCheck, Volume2, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { MicrophoneAnalyzer } from '../audio/analyzer';
import { createCalibrationProfile } from '../audio/classifier';
import { playTone, speakHint } from '../audio/sounds';
import { Balloon } from '../components/Balloon';
import { Brand } from '../components/Brand';
import { useChild } from '../context/ChildContext';
import type { AudioFeatures, CalibrationProfile } from '../types';

type Phase = 'intro' | 'permission' | 'quiet' | 'breath' | 'saving' | 'success' | 'error';

export function CalibrationPage() {
  const { child, setCalibration } = useChild();
  const navigate = useNavigate();
  const analyzer = useRef(new MicrophoneAnalyzer());
  const phaseRef = useRef<Phase>('intro');
  const quietFrames = useRef<AudioFeatures[]>([]);
  const breathFrames = useRef<AudioFeatures[]>([]);
  const timers = useRef<number[]>([]);
  const [phase, setPhaseState] = useState<Phase>('intro');
  const [progress, setProgress] = useState(0);
  const [level, setLevel] = useState(0);
  const [profile, setProfile] = useState<CalibrationProfile | null>(null);
  const [error, setError] = useState('');

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
    setProgress(0);
  };

  useEffect(() => () => {
    analyzer.current.stop();
    timers.current.forEach(window.clearTimeout);
  }, []);

  async function begin() {
    setError('');
    quietFrames.current = [];
    breathFrames.current = [];
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPhase('permission');
    try {
      await analyzer.current.start((features) => {
        setLevel(Math.min(1, features.rms * 14));
        if (phaseRef.current === 'quiet') quietFrames.current.push(features);
        if (phaseRef.current === 'breath') breathFrames.current.push(features);
      });
      setPhase('quiet');
      speakHint('Сиди спокойно. Сейчас послушаем тишину.');
      animateProgress(2_600);
      timers.current.push(window.setTimeout(() => {
        setPhase('breath');
        speakHint('А теперь сделай длинный спокойный выдох в микрофон.');
        animateProgress(5_200);
        timers.current.push(window.setTimeout(() => void complete(), 5_200));
      }, 2_600));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось включить микрофон');
      setPhase('error');
    }
  }

  function animateProgress(duration: number) {
    const started = performance.now();
    const tick = () => {
      const value = Math.min(1, (performance.now() - started) / duration);
      setProgress(value);
      if (value < 1 && (phaseRef.current === 'quiet' || phaseRef.current === 'breath')) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function complete() {
    analyzer.current.stop();
    setPhase('saving');
    try {
      const result = createCalibrationProfile(quietFrames.current, breathFrames.current);
      await api.saveCalibration(child!.id, result);
      setProfile(result);
      setCalibration(result);
      setPhase('success');
      playTone('success');
      speakHint('Отлично! Всё готово к полёту.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Калибровка не получилась');
      setPhase('error');
    }
  }

  if (!child) return <Navigate to="/child" replace />;
  const activeSkin = child.skins.find((skin) => skin.id === child.selectedSkin);

  return (
    <main className="calibration-page sky-page">
      <header className="simple-header container"><Brand to="/child/home" /><button className="text-link button-reset" onClick={() => navigate('/child/home')}><ArrowLeft size={18} /> Назад</button></header>
      <section className="calibration-card">
        <div className="calibration-visual">
          <div className={`mic-orbit mic-orbit--${phase}`} style={{ '--level': level } as React.CSSProperties}>
            <span className="mic-orbit__pulse" /><span className="mic-orbit__pulse" /><div className="mic-orbit__center"><Mic size={40} /></div>
          </div>
          <Balloon skin={activeSkin} className="calibration-balloon" expression={phase === 'error' ? 'surprised' : 'happy'} />
        </div>
        <div className="calibration-content">
          <div className="steps" aria-label="Шаги настройки"><span className="steps__done"><Check /></span><i /><span className={phase !== 'intro' ? 'steps__active' : ''}>2</span><i /><span className={phase === 'success' ? 'steps__done' : ''}>{phase === 'success' ? <Check /> : '3'}</span></div>
          {phase === 'intro' && <>
            <div className="eyebrow"><Mic size={18} /> Настройка перед полётом</div>
            <h1>Познакомимся<br />с твоим дыханием</h1>
            <p className="lead">Сначала послушаем тишину, а потом один длинный спокойный выдох.</p>
            <ul className="simple-list"><li><span>1</span> Держи микрофон примерно в ладошке от лица</li><li><span>2</span> Не дуй резко — выдыхай ровно и спокойно</li></ul>
            <button className="button button--primary button--large" onClick={() => void begin()}><Mic /> Включить микрофон <ArrowRight /></button>
            <small className="safe-note"><ShieldCheck /> Запись не ведётся</small>
          </>}
          {phase === 'permission' && <Status title="Включаем микрофон…" text="Разреши доступ в окошке браузера" />}
          {phase === 'quiet' && <Status icon={<Volume2 />} title="Тихо-тихо…" text="Сиди спокойно и пока не дыши в микрофон" progress={progress} />}
          {phase === 'breath' && <Status icon={<Wind />} title="Длинный выдох" text="Ф-ф-ф… ровно и спокойно, у тебя отлично получается!" progress={progress} />}
          {phase === 'saving' && <Status title="Запоминаем дыхание…" text="Сохраняем только числа, не звук" />}
          {phase === 'success' && <>
            <div className="success-mark"><Check /></div><div className="eyebrow">Настройка готова</div><h1>Отличный выдох!</h1><p className="lead">Теперь Шарик будет понимать именно твоё дыхание.</p>
            <div className="quality-row"><span>Сигнал</span><div><i style={{ width: `${Math.max(24, (profile?.quality ?? 0) * 100)}%` }} /></div><b>{(profile?.quality ?? 0) > 0.55 ? 'Отличный' : 'Подходит'}</b></div>
            <button className="button button--primary button--xl" onClick={() => navigate('/child/game')}><Wind /> Начать полёт <ArrowRight /></button>
          </>}
          {phase === 'error' && <>
            <div className="eyebrow">Ничего страшного</div><h1>Давай попробуем ещё раз</h1><p className="lead">{error}</p>
            <button className="button button--primary button--large" onClick={() => void begin()}><RefreshCw /> Повторить настройку</button>
            <button className="button button--soft" onClick={() => navigate('/child/game?mode=demo')}>Посмотреть игру без микрофона</button>
            <small className="safe-note">Демо-результат не попадёт в показатели специалиста</small>
          </>}
        </div>
      </section>
    </main>
  );
}

function Status({ icon, title, text, progress }: { icon?: React.ReactNode; title: string; text: string; progress?: number }) {
  return <div className="calibration-status">{icon && <div className="calibration-status__icon">{icon}</div>}<div className="eyebrow">Настройка микрофона</div><h1>{title}</h1><p className="lead">{text}</p>{progress !== undefined && <div className="calibration-progress"><i style={{ width: `${progress * 100}%` }} /></div>}<div className="listening-dots"><i /><i /><i /><span>Слушаем только сейчас</span></div></div>;
}
