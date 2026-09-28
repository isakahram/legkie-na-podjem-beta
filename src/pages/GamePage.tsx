import { AlertCircle, ArrowLeft, Coins, Mic, Pause, Play, RefreshCw, ShieldCheck, Wind, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { MicrophoneAnalyzer } from '../audio/analyzer';
import { classifySound } from '../audio/classifier';
import { playTone, speakHint } from '../audio/sounds';
import { Balloon } from '../components/Balloon';
import { Loading } from '../components/Loading';
import { useChild } from '../context/ChildContext';
import { initialGameState, spawnObject, stepGame, type GameState } from '../game/engine';
import type { CalibrationProfile, SoundKind } from '../types';

type GamePhase = 'ready' | 'running' | 'paused' | 'saving' | 'saveError';

interface Metrics {
  breathCount: number;
  breathActive: boolean;
  activeDuration: number;
  breathDurations: number[];
  strengthSum: number;
  validFrames: number;
  activeSoundFrames: number;
  suspiciousEvents: number;
}

const emptyMetrics = (): Metrics => ({
  breathCount: 0,
  breathActive: false,
  activeDuration: 0,
  breathDurations: [],
  strengthSum: 0,
  validFrames: 0,
  activeSoundFrames: 0,
  suspiciousEvents: 0,
});

export function GamePage() {
  const { child, calibration, setCalibration, setLastSession, refreshChild } = useChild();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inputMode = searchParams.get('mode') === 'demo' ? 'demo' : 'microphone';
  const [profile, setProfile] = useState<CalibrationProfile | null>(calibration);
  const [loading, setLoading] = useState(inputMode === 'microphone' && !calibration);
  const [phase, setPhaseState] = useState<GamePhase>('ready');
  const phaseRef = useRef<GamePhase>('ready');
  const [game, setGame] = useState<GameState>(initialGameState);
  const gameRef = useRef<GameState>(initialGameState());
  const [timeLeft, setTimeLeft] = useState(child?.assignment.recommendedDurationSeconds ?? 60);
  const [soundKind, setSoundKind] = useState<SoundKind>('silence');
  const [strength, setStrength] = useState(0);
  const [message, setMessage] = useState('');
  const [pauseReason, setPauseReason] = useState('');
  const [error, setError] = useState('');
  const analyzer = useRef(new MicrophoneAnalyzer());
  const strengthRef = useRef(0);
  const metrics = useRef<Metrics>(emptyMetrics());
  const elapsed = useRef(0);
  const lastFrame = useRef(0);
  const lastSpawn = useRef(0);
  const objectId = useRef(0);
  const suspiciousSequence = useRef(0);
  const finished = useRef(false);
  const demoBreathing = useRef(false);
  const startedAt = useRef(new Date().toISOString());

  const setPhase = (next: GamePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  useEffect(() => {
    if (!child || inputMode === 'demo' || profile) return;
    let active = true;
    api.getCalibration(child.id)
      .then((saved) => {
        if (!active) return;
        if (!saved) navigate('/child/calibration', { replace: true });
        else {
          setProfile(saved);
          setCalibration(saved);
          setLoading(false);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройку');
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [child, inputMode, navigate, profile, setCalibration]);

  const closeBreath = useCallback(() => {
    if (!metrics.current.breathActive) return;
    if (metrics.current.activeDuration >= 0.45) {
      metrics.current.breathDurations.push(metrics.current.activeDuration);
    }
    metrics.current.breathActive = false;
    metrics.current.activeDuration = 0;
  }, []);

  const recordFrame = useCallback((validBreath: boolean, frameStrength: number, delta: number, activeSound: boolean) => {
    if (activeSound) metrics.current.activeSoundFrames += 1;
    if (validBreath) {
      if (!metrics.current.breathActive) metrics.current.breathCount += 1;
      metrics.current.breathActive = true;
      metrics.current.activeDuration += delta;
      metrics.current.strengthSum += frameStrength;
      metrics.current.validFrames += 1;
    } else {
      closeBreath();
    }
  }, [closeBreath]);

  const startGame = async () => {
    setError('');
    metrics.current = emptyMetrics();
    gameRef.current = initialGameState();
    setGame(gameRef.current);
    elapsed.current = 0;
    lastSpawn.current = 0;
    finished.current = false;
    startedAt.current = new Date().toISOString();
    try {
      if (inputMode === 'microphone') {
        if (!profile) throw new Error('Сначала нужна настройка дыхания');
        await analyzer.current.start((features) => {
          if (phaseRef.current !== 'running') return;
          const result = classifySound(features, profile);
          strengthRef.current = result.strength;
          setStrength(result.strength);
          setSoundKind(result.kind);
          recordFrame(result.kind === 'breath', result.strength, 0.08, result.kind !== 'silence');

          if (result.kind === 'speech') suspiciousSequence.current += 0.08;
          else suspiciousSequence.current = 0;
          if (suspiciousSequence.current >= 1.2 && phaseRef.current === 'running') {
            metrics.current.suspiciousEvents += 1;
            setPauseReason(result.reason);
            setPhase('paused');
            analyzer.current.stop();
            strengthRef.current = 0;
            closeBreath();
          }
        });
      }
      playTone('start');
      speakHint(inputMode === 'demo' ? 'Удерживай кнопку, чтобы поднять шарик.' : 'Спокойно выдыхай, чтобы поднять шарик.');
      setPhase('running');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось начать игру');
      setPhase('ready');
    }
  };

  const finishGame = useCallback(async (status: 'completed' | 'stopped') => {
    if (!child || finished.current) return;
    finished.current = true;
    analyzer.current.stop();
    closeBreath();
    strengthRef.current = 0;
    setPhase('saving');
    const durations = metrics.current.breathDurations;
    const completedCycles = durations.filter((duration) => duration >= 0.7).length;
    const averageDuration = durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;
    const payload = {
      childId: child.id,
      startedAt: startedAt.current,
      durationSeconds: Math.max(1, Math.round(elapsed.current)),
      breathCount: metrics.current.breathCount,
      averageStrength: metrics.current.validFrames
        ? metrics.current.strengthSum / metrics.current.validFrames
        : 0,
      averageBreathDuration: averageDuration,
      correctBreathPercent: metrics.current.activeSoundFrames
        ? Math.min(100, (metrics.current.validFrames / metrics.current.activeSoundFrames) * 100)
        : 0,
      completedCycles,
      targetCycles: child.assignment.cyclesPerSession,
      coinsCollected: gameRef.current.coins,
      obstaclesAvoided: gameRef.current.birdsAvoided,
      suspiciousEvents: metrics.current.suspiciousEvents,
      status,
      inputMode,
    } as const;
    try {
      const saved = await api.saveSession(payload);
      setLastSession(saved.session);
      // The session is already durable at this point; a transient profile refresh
      // must not result in a duplicate session on retry.
      await refreshChild().catch(() => undefined);
      navigate('/child/result', { replace: true });
    } catch (caught) {
      finished.current = false;
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить результат');
      setPhase('saveError');
    }
  }, [child, closeBreath, inputMode, navigate, refreshChild, setLastSession]);

  useEffect(() => {
    if (phase !== 'running' || !child) return;
    let animationFrame = 0;
    lastFrame.current = performance.now();
    const loop = (now: number) => {
      if (phaseRef.current !== 'running') return;
      const delta = Math.min(0.05, (now - lastFrame.current) / 1000);
      lastFrame.current = now;
      elapsed.current += delta;
      if (inputMode === 'demo') {
        const demoStrength = demoBreathing.current ? 0.76 : 0;
        strengthRef.current = demoStrength;
        setStrength(demoStrength);
        setSoundKind(demoStrength ? 'breath' : 'silence');
        recordFrame(demoStrength > 0, demoStrength, delta, demoStrength > 0);
      }
      if (elapsed.current - lastSpawn.current > 1.55) {
        objectId.current += 1;
        const type = objectId.current % 3 === 0 ? 'bird' : 'coin';
        gameRef.current.objects.push(spawnObject(objectId.current, type));
        lastSpawn.current = elapsed.current;
      }
      const result = stepGame(gameRef.current, delta, strengthRef.current);
      gameRef.current = result.state;
      if (result.events.includes('coin')) playTone('coin');
      if (result.events.includes('bump')) {
        playTone('bump');
        setMessage('Ой! Всё хорошо, летим дальше');
        window.setTimeout(() => setMessage(''), 1_500);
      }
      setGame({ ...result.state, objects: [...result.state.objects] });
      const remaining = Math.max(0, child.assignment.recommendedDurationSeconds - elapsed.current);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0) void finishGame('completed');
      else animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [child, finishGame, inputMode, phase, recordFrame]);

  useEffect(() => {
    if (inputMode !== 'demo') return;
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') { event.preventDefault(); demoBreathing.current = true; }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') demoBreathing.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [inputMode]);

  useEffect(() => () => analyzer.current.stop(), []);

  if (!child) return <Navigate to="/child" replace />;
  if (loading) return <main className="game-loading"><Loading label="Готовим небо…" /></main>;
  const activeSkin = child.skins.find((skin) => skin.id === child.selectedSkin);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const setDemoControl = (active: boolean) => { demoBreathing.current = active; };

  return (
    <main className="game-page">
      <div className="game-sky">
        <div className="game-cloud game-cloud--1" /><div className="game-cloud game-cloud--2" /><div className="game-cloud game-cloud--3" />
        <div className="game-hud">
          <button className="game-hud__exit" aria-label="Завершить игру" onClick={() => void finishGame('stopped')}><X /></button>
          <div className="game-hud__progress"><span><Wind size={18} /> Выдохи <b>{metrics.current.breathDurations.length}/{child.assignment.cyclesPerSession}</b></span><i><em style={{ width: `${Math.min(100, metrics.current.breathDurations.length / child.assignment.cyclesPerSession * 100)}%` }} /></i></div>
          <div className="game-hud__right"><span className="coin-pill"><Coins /> {game.coins}</span><span className="timer">{minutes}:{String(seconds).padStart(2, '0')}</span></div>
        </div>
        <Balloon skin={activeSkin} className={`player-balloon ${strength > 0.15 ? 'player-balloon--lift' : ''}`} style={{ top: `${game.balloonY}%` }} expression={message ? 'surprised' : 'focused'} />
        {game.objects.map((object) => object.type === 'coin'
          ? <div key={object.id} className="game-coin" style={{ left: `${object.x}%`, top: `${object.y}%` }}>★</div>
          : <div key={object.id} className="game-bird" style={{ left: `${object.x}%`, top: `${object.y}%` }}><span>⌁</span><i /></div>)}
        <div className="hills hills--back" /><div className="hills hills--front" />
        {message && <div className="game-message">{message}</div>}
        {phase === 'running' && <div className={`breath-indicator breath-indicator--${soundKind}`}><span><Mic /></span><div><b>{soundKind === 'breath' ? 'Отличный выдох!' : soundKind === 'silence' ? 'Выдыхай, чтобы подняться' : 'Слушаю…'}</b><i><em style={{ width: `${strength * 100}%` }} /></i></div></div>}
        {inputMode === 'demo' && phase === 'running' && <button className="demo-breath" onPointerDown={() => setDemoControl(true)} onPointerUp={() => setDemoControl(false)} onPointerLeave={() => setDemoControl(false)}><Wind /> Удерживай: выдох <small>или пробел</small></button>}
      </div>

      {phase === 'ready' && <div className="game-overlay"><section className="game-dialog">
        <div className="game-dialog__icon"><Play fill="currentColor" /></div><h1>Всё готово!</h1><p>{inputMode === 'demo' ? 'Удерживай большую кнопку или пробел, чтобы лететь вверх.' : 'Выдыхай спокойно и ровно. Шарик поднимется вслед за дыханием.'}</p>
        {inputMode === 'demo' && <div className="demo-warning"><ShieldCheck /> Демо не учитывается в показателях и не приносит монеты</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button--primary button--xl" onClick={() => void startGame()}><Play fill="currentColor" /> Полетели!</button>
        {error && inputMode === 'microphone' && <button className="button button--soft" onClick={() => navigate('/child/game?mode=demo', { replace: true })}>Открыть демо без микрофона</button>}
      </section></div>}

      {phase === 'paused' && <div className="game-overlay"><section className="game-dialog game-dialog--gentle">
        <div className="game-dialog__icon game-dialog__icon--pause"><Pause /></div><div className="eyebrow">Небольшая пауза</div><h1>Кажется, микрофон услышал голос</h1><p>Так бывает — ты ничего не сделал неправильно. Давай ещё раз настроим дыхание.</p>
        <div className="reason-box"><AlertCircle /><span><b>Почему остановились</b>{pauseReason}. Проверка может ошибаться и <strong>требует валидации</strong>.</span></div>
        <button className="button button--primary button--large" onClick={() => navigate('/child/calibration', { replace: true })}><RefreshCw /> Настроить заново</button>
        <button className="button button--soft" onClick={() => navigate('/child/home')}>Вернуться в меню</button>
      </section></div>}

      {phase === 'saving' && <div className="game-overlay"><section className="game-dialog"><Loading label="Сохраняем полёт…" /><p>Ещё одно мгновение</p></section></div>}
      {phase === 'saveError' && <div className="game-overlay"><section className="game-dialog"><div className="game-dialog__icon game-dialog__icon--error"><AlertCircle /></div><h1>Полёт пока не сохранился</h1><p>{error}</p><button className="button button--primary" onClick={() => void finishGame('stopped')}><RefreshCw /> Попробовать ещё раз</button><button className="button button--soft" onClick={() => navigate('/child/home')}><ArrowLeft /> В меню</button></section></div>}
    </main>
  );
}
