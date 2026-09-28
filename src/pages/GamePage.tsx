import { AlertCircle, ArrowLeft, Coins, Flag, Play, RefreshCw, Wind } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { MicrophoneAnalyzer } from '../audio/analyzer';
import { classifySound } from '../audio/classifier';
import { playTone } from '../audio/sounds';
import { Balloon } from '../components/Balloon';
import { GameSky, RouteCloud } from '../components/GameSky';
import { Loading } from '../components/Loading';
import { useChild } from '../context/ChildContext';
import {
  BALLOON_X,
  initialGameState,
  stepGame,
  wobbleOffset,
  type Cloud,
  type GameState,
} from '../game/engine';
import { WAVE_INTERVAL_SECONDS, spawnBackdropCloud, spawnWave } from '../game/routes';
import { SessionMetricsCollector } from '../game/sessionMetrics';
import type { CalibrationProfile } from '../types';

type GamePhase = 'ready' | 'running' | 'saving' | 'saveError';

/** Время только страховка: основная цель — количество завершённых выдохов. */
export const SESSION_MAX_SECONDS = 600;
export const sessionLengthSeconds = (_recommended: number): number => SESSION_MAX_SECONDS;

/** Сколько секунд посторонний звук должен держаться, чтобы включить паузу. */
const PAUSE_ENTER_SECONDS = 1.2;
/** Сколько секунд сигнал должен быть спокойным, чтобы продолжить. */
const PAUSE_EXIT_SECONDS = 0.8;

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
  const [backdrop, setBackdrop] = useState<Cloud[]>([]);
  const backdropRef = useRef<Cloud[]>([]);
  const targetBreaths = child?.assignment.targetBreaths ?? child?.assignment.cyclesPerSession ?? 8;
  const totalSeconds = sessionLengthSeconds(child?.assignment.recommendedDurationSeconds ?? 600);
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [strength, setStrength] = useState(0);
  const [breathing, setBreathing] = useState(false);
  const [listeningPause, setListeningPause] = useState(false);
  const [error, setError] = useState('');

  const analyzer = useRef(new MicrophoneAnalyzer());
  const strengthRef = useRef(0);
  const pausedRef = useRef(false);
  const foreignSound = useRef(0);
  const calmSound = useRef(0);
  const technicalPauses = useRef(0);
  const strengthSum = useRef(0);
  const breathFrames = useRef(0);
  const activeFrames = useRef(0);
  const breathSegments = useRef(0);
  const wasBreath = useRef(false);
  const metrics = useRef(new SessionMetricsCollector());
  const elapsed = useRef(0);
  const lastFrame = useRef(0);
  const lastWave = useRef(0);
  const lastBackdrop = useRef(0);
  const nextId = useRef(0);
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

  /** Один кадр аудио: обновляет метрики и решает, нужна ли техническая пауза. */
  const handleAudioFrame = useCallback((kind: string, frameStrength: number, atMs: number) => {
    const isBreath = kind === 'breath';
    if (isBreath) {
      strengthSum.current += frameStrength;
      breathFrames.current += 1;
      if (!wasBreath.current) breathSegments.current += 1;
    }
    if (kind !== 'silence') activeFrames.current += 1;
    wasBreath.current = isBreath;
    metrics.current.pushFrame({ atMs, isBreath, strength: frameStrength });

    const foreign = kind === 'speech' || kind === 'cough' || kind === 'noise';
    if (foreign) {
      foreignSound.current += 0.08;
      calmSound.current = 0;
    } else {
      calmSound.current += 0.08;
      foreignSound.current = 0;
    }

    if (!pausedRef.current && foreignSound.current >= PAUSE_ENTER_SECONDS) {
      // Мягкая техническая пауза: прогресс и монеты сохраняются, сессия продолжится сама.
      pausedRef.current = true;
      technicalPauses.current += 1;
      metrics.current.closeSegment();
      strengthRef.current = 0;
      setListeningPause(true);
    } else if (pausedRef.current && calmSound.current >= PAUSE_EXIT_SECONDS) {
      pausedRef.current = false;
      setListeningPause(false);
    }
    if (!pausedRef.current) strengthRef.current = frameStrength;
    setStrength(pausedRef.current ? 0 : frameStrength);
    setBreathing(isBreath && !pausedRef.current);
  }, []);

  const startGame = async () => {
    setError('');
    metrics.current = new SessionMetricsCollector();
    gameRef.current = initialGameState();
    backdropRef.current = [];
    setGame(gameRef.current);
    elapsed.current = 0;
    lastWave.current = 0;
    lastBackdrop.current = 0;
    technicalPauses.current = 0;
    strengthSum.current = 0;
    breathFrames.current = 0;
    activeFrames.current = 0;
    breathSegments.current = 0;
    wasBreath.current = false;
    pausedRef.current = false;
    foreignSound.current = 0;
    calmSound.current = 0;
    finished.current = false;
    setListeningPause(false);
    startedAt.current = new Date().toISOString();
    try {
      if (inputMode === 'microphone') {
        if (!profile) throw new Error('Сначала нужна настройка дыхания');
        await analyzer.current.start((features) => {
          if (phaseRef.current !== 'running') return;
          const result = classifySound(features, profile);
          handleAudioFrame(result.kind, result.strength, performance.now());
        });
      }
      playTone('start');
      setPhase('running');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось начать игру');
      setPhase('ready');
    }
  };

  const finishGame = useCallback(async () => {
    if (!child || finished.current) return;
    finished.current = true;
    analyzer.current.stop();
    strengthRef.current = 0;
    setPhase('saving');
    metrics.current.setCoins(gameRef.current.coinsCollected);
    const summary = metrics.current.finish();
    const payload = {
      childId: child.id,
      startedAt: startedAt.current,
      durationSeconds: Math.max(1, summary.sessionDurationSeconds),
      breathCount: breathSegments.current,
      averageStrength: breathFrames.current ? strengthSum.current / breathFrames.current : 0,
      averageBreathDuration: summary.averageBreathDuration,
      bestDuration: summary.bestDuration,
      averageStability: summary.averageStability,
      correctBreathPercent: activeFrames.current
        ? Math.min(100, (breathFrames.current / activeFrames.current) * 100)
        : 0,
      completedBreaths: summary.completedBreaths,
      targetBreaths,
      coinsCollected: summary.coinsCollected,
      averageLatencyMs: summary.averageLatencyMs,
      maxLatencyMs: summary.maxLatencyMs,
      technicalPauses: technicalPauses.current,
      // Сессия всегда завершается успешно: проигрыша в игре нет.
      status: 'completed',
      inputMode,
    } as const;
    try {
      const saved = await api.saveSession(payload);
      setLastSession(saved.session);
      await refreshChild().catch(() => undefined);
      navigate('/child/result', { replace: true });
    } catch (caught) {
      finished.current = false;
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить результат');
      setPhase('saveError');
    }
  }, [child, inputMode, navigate, refreshChild, setLastSession, targetBreaths]);

  useEffect(() => {
    if (phase !== 'running' || !child) return;
    let animationFrame = 0;
    lastFrame.current = performance.now();
    const loop = (now: number) => {
      if (phaseRef.current !== 'running') return;
      const delta = Math.min(0.05, (now - lastFrame.current) / 1000);
      lastFrame.current = now;

      if (pausedRef.current) {
        // Во время паузы таймер стоит, мир замирает, шарик мягко покачивается.
        animationFrame = requestAnimationFrame(loop);
        return;
      }

      if (inputMode === 'demo') {
        const demoStrength = demoBreathing.current ? 0.7 : 0;
        handleAudioFrame(demoStrength > 0 ? 'breath' : 'silence', demoStrength, now);
      }

      elapsed.current += delta;
      metrics.current.addElapsed(delta);

      if (elapsed.current - lastWave.current >= WAVE_INTERVAL_SECONDS) {
        const wave = spawnWave(nextId.current);
        nextId.current = wave.nextId;
        gameRef.current.clouds.push(...wave.clouds);
        gameRef.current.coins.push(...wave.coins);
        lastWave.current = elapsed.current;
      }
      if (elapsed.current - lastBackdrop.current >= 4.5) {
        nextId.current += 1;
        backdropRef.current = [
          ...backdropRef.current.filter((cloud) => cloud.x > -40),
          spawnBackdropCloud(nextId.current),
        ];
        lastBackdrop.current = elapsed.current;
      }

      const result = stepGame(gameRef.current, delta, strengthRef.current);
      gameRef.current = result.state;
      if (strengthRef.current > 0) metrics.current.markLiftApplied(performance.now());
      if (result.events.includes('coin')) playTone('coin');
      setGame({ ...result.state, clouds: [...result.state.clouds], coins: [...result.state.coins] });
      backdropRef.current = backdropRef.current.map((cloud) => ({
        ...cloud,
        x: cloud.x - (2 + cloud.depth * 6) * delta,
      }));
      setBackdrop(backdropRef.current);

      const remaining = Math.max(0, totalSeconds - elapsed.current);
      setTimeLeft(Math.ceil(remaining));
      const completed = metrics.current.snapshot().completedBreaths;
      if (completed >= targetBreaths || remaining <= 0) void finishGame();
      else animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [child, finishGame, handleAudioFrame, inputMode, phase, targetBreaths, totalSeconds]);

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

  return (
    <main className="game-page">
      <div className="game-sky">
        <GameSky backdrop={backdrop} />

        <div className="game-hud">
          <span className="coin-pill"><Coins /> {game.coinsCollected}</span>
          <strong className="breath-progress">Выдохи: {metrics.current.snapshot().completedBreaths} / {targetBreaths}</strong>
          <span className="timer timer--soft" title="Время занятия">
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
          <button className="button button--soft button--small" onClick={() => void finishGame()}>
            <Flag size={16} /> Завершить
          </button>
        </div>

        {game.clouds.map((cloud) => <RouteCloud key={cloud.id} cloud={cloud} />)}
        {game.coins.map((coin) => (
          <div key={coin.id} className="game-coin" style={{ left: `${coin.x}%`, top: `${coin.y}%` }}>★</div>
        ))}

        <Balloon
          skin={activeSkin}
          className={`player-balloon ${breathing ? 'player-balloon--lift' : ''} ${listeningPause ? 'player-balloon--waiting' : ''}`}
          style={{
            top: `${game.balloonY}%`,
            left: `${BALLOON_X}%`,
            transform: `translate(-50%, -50%) translateY(${wobbleOffset(game).toFixed(2)}px)`,
          }}
          expression="happy"
        />

        {phase === 'running' && (
          <div className="breath-bar" aria-label="Сила выдоха">
            <Wind size={16} />
            <i><em style={{ width: `${Math.round(strength * 100)}%` }} /></i>
            <small>{breathing ? 'Выдох идёт' : 'Можно выдохнуть'}</small>
          </div>
        )}

        {inputMode === 'demo' && phase === 'running' && (
          <button
            className="demo-breath"
            onPointerDown={() => { demoBreathing.current = true; }}
            onPointerUp={() => { demoBreathing.current = false; }}
            onPointerLeave={() => { demoBreathing.current = false; }}
          >
            <Wind /> Удерживай: выдох <small>или пробел</small>
          </button>
        )}

        {listeningPause && (
          <div className="listening-pause" role="status">
            <Wind />
            <div>
              <b>Микрофон слышит другой звук. Подождём тишины</b>
              <span>Время занятия остановлено, монеты и прогресс сохранены.</span>
            </div>
          </div>
        )}
      </div>

      {phase === 'ready' && (
        <div className="game-overlay"><section className="game-dialog">
          <div className="game-dialog__icon"><Play fill="currentColor" /></div>
          <h1>Всё готово!</h1>
          <p>
            {inputMode === 'demo'
              ? 'Удерживай большую кнопку или пробел — шарик поднимется.'
              : 'Выдыхай спокойно и ровно — шарик поднимется. Пауза — шарик плавно опустится.'}
          </p>
          <ul className="simple-list">
            <li><span>1</span> Собирай монеты в облаках. Чем выше маршрут, тем больше монет</li>
            <li><span>2</span> Здесь нет проигрыша: завершить можно в любой момент</li>
          </ul>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button--primary button--xl" onClick={() => void startGame()}>
            <Play fill="currentColor" /> Полетели!
          </button>
          {error && inputMode === 'microphone' && (
            <button className="button button--soft" onClick={() => navigate('/child/game?mode=demo', { replace: true })}>
              Открыть демо без микрофона
            </button>
          )}
        </section></div>
      )}

      {phase === 'saving' && (
        <div className="game-overlay"><section className="game-dialog">
          <Loading label="Сохраняем полёт…" /><p>Ещё одно мгновение</p>
        </section></div>
      )}

      {phase === 'saveError' && (
        <div className="game-overlay"><section className="game-dialog">
          <div className="game-dialog__icon game-dialog__icon--error"><AlertCircle /></div>
          <h1>Полёт пока не сохранился</h1><p>{error}</p>
          <button className="button button--primary" onClick={() => void finishGame()}>
            <RefreshCw /> Попробовать ещё раз
          </button>
          <button className="button button--soft" onClick={() => navigate('/child/home')}>
            <ArrowLeft /> В меню
          </button>
        </section></div>
      )}
    </main>
  );
}
