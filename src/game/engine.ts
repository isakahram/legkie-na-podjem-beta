/**
 * «Воздушный шар» — чистая физика полёта.
 *
 * В игре нет врагов, препятствий, столкновений и проигрыша.
 * Единственное событие — сбор монеты. Координаты заданы в процентах
 * игрового поля: x слева направо, y сверху вниз.
 */

export interface Coin {
  id: number;
  cloudId: number;
  x: number;
  y: number;
}

export interface Cloud {
  id: number;
  x: number;
  y: number;
  scale: number;
  /** Слой параллакса: 0 — дальний фон, 1 — ближний. */
  depth: number;
}

export interface GameState {
  /** Высота шарика в процентах поля (меньше — выше). */
  balloonY: number;
  velocityY: number;
  /** Сглаженная подъёмная доля, 0..1. */
  smoothedLift: number;
  /** Последняя сырая сила выдоха — нужна для распознавания скачков. */
  lastStrength: number;
  /** Амплитуда мягкого покачивания в пикселях, 0..4. */
  wobble: number;
  wobblePhase: number;
  clouds: Cloud[];
  coins: Coin[];
  coinsCollected: number;
}

export type GameEvent = 'coin' | 'wobble';

export interface GameStepResult {
  state: GameState;
  events: GameEvent[];
}

/** Горизонтальное положение шарика — левая треть экрана. */
export const BALLOON_X = 18;

export const PHYSICS = {
  /** Сила выдоха, после которой подъём перестаёт расти. */
  comfortStrength: 0.55,
  /** Максимальное ускорение вверх, %/с². */
  liftAcceleration: 64,
  /** Постоянное мягкое опускание, %/с². */
  gravity: 24,
  /** Постоянная времени сглаживания силы выдоха, с. */
  smoothingSeconds: 0.22,
  maxRiseSpeed: 26,
  maxFallSpeed: 18,
  /** Верхняя граница поля и высота зоны мягкого торможения. */
  ceiling: 9,
  ceilingSoftZone: 16,
  /** Нижняя граница поля. */
  floor: 88,
  /** Скачок сглаженной силы за кадр, после которого шарик покачивается. */
  spikeDelta: 0.3,
  wobbleMin: 2,
  wobbleMax: 4,
  /** Скорость затухания покачивания, доля в секунду. */
  wobbleDecay: 2.2,
  /** Дополнительное торможение подъёма в зоне мягкого потолка. */
  ceilingDrag: 5,
  /** Скорость движения облаков справа налево, %/с (для ближнего слоя). */
  scrollSpeed: 15,
  /** Радиус сбора монеты. */
  coinRadius: 6.5,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const initialGameState = (): GameState => ({
  balloonY: 58,
  velocityY: 0,
  smoothedLift: 0,
  lastStrength: 0,
  wobble: 0,
  wobblePhase: 0,
  clouds: [],
  coins: [],
  coinsCollected: 0,
});

/**
 * Насыщение подъёмной силы: после комфортного выдоха дополнительная
 * громкость не даёт непропорционального ускорения.
 */
export function liftFactor(strength: number): number {
  return clamp(strength, 0, 1) < PHYSICS.comfortStrength
    ? clamp(strength, 0, 1) / PHYSICS.comfortStrength
    : 1;
}

/** Мягкий потолок: у самого верха подъёмная сила плавно гасится. */
function ceilingDamping(y: number): number {
  const soft = PHYSICS.ceiling + PHYSICS.ceilingSoftZone;
  if (y >= soft) return 1;
  return clamp((y - PHYSICS.ceiling) / PHYSICS.ceilingSoftZone, 0, 1);
}

/** Скорость слоя параллакса: дальние облака плывут медленнее. */
export function layerSpeed(depth: number): number {
  return PHYSICS.scrollSpeed * (0.45 + 0.55 * clamp(depth, 0, 1));
}

/** Чистый шаг симуляции. Не имеет побочных эффектов и не знает про React. */
export function stepGame(
  current: GameState,
  deltaSeconds: number,
  breathStrength: number,
): GameStepResult {
  const delta = clamp(deltaSeconds, 0, 0.05);
  const events: GameEvent[] = [];
  const target = clamp(breathStrength, 0, 1);

  // Насыщение считается до сглаживания: громкость выше комфортной
  // не ускоряет подъём даже в переходном процессе.
  const alpha = delta === 0 ? 0 : 1 - Math.exp(-delta / PHYSICS.smoothingSeconds);
  const smoothedLift = current.smoothedLift + (liftFactor(target) - current.smoothedLift) * alpha;

  // Резкий скачок сигнала — только лёгкое визуальное покачивание, без штрафов.
  const jump = Math.abs(target - current.lastStrength);
  let wobble = Math.max(0, current.wobble - PHYSICS.wobbleDecay * current.wobble * delta);
  if (jump >= PHYSICS.spikeDelta) {
    const extra = clamp((jump - PHYSICS.spikeDelta) / (1 - PHYSICS.spikeDelta), 0, 1);
    wobble = Math.max(wobble, PHYSICS.wobbleMin + extra * (PHYSICS.wobbleMax - PHYSICS.wobbleMin));
    events.push('wobble');
  }

  const damping = ceilingDamping(current.balloonY);
  const lift = PHYSICS.liftAcceleration * smoothedLift * damping;
  const acceleration = PHYSICS.gravity - lift;
  let velocityY = current.velocityY + acceleration * delta;
  // У потолка подъём дополнительно гасится, чтобы шарик не отскакивал.
  if (velocityY < 0) velocityY -= velocityY * PHYSICS.ceilingDrag * (1 - damping) * delta;
  velocityY = clamp(velocityY, -PHYSICS.maxRiseSpeed, PHYSICS.maxFallSpeed);
  let balloonY = current.balloonY + velocityY * delta;

  if (balloonY <= PHYSICS.ceiling) {
    balloonY = PHYSICS.ceiling;
    velocityY = Math.max(0, velocityY);
  }
  if (balloonY >= PHYSICS.floor) {
    // Нижняя граница не выводит из игры: шарик мягко покачивается и ждёт выдоха.
    balloonY = PHYSICS.floor;
    velocityY = 0;
    wobble = Math.max(wobble, PHYSICS.wobbleMin);
  }

  const clouds = current.clouds
    .map((cloud) => ({ ...cloud, x: cloud.x - layerSpeed(cloud.depth) * delta }))
    .filter((cloud) => cloud.x > -40);

  const movedCoins = current.coins.map((coin) => ({
    ...coin,
    x: coin.x - PHYSICS.scrollSpeed * delta,
  }));
  const coins = movedCoins.filter((coin) => {
    const distance = Math.hypot((coin.x - BALLOON_X) * 1.15, coin.y - balloonY);
    if (distance <= PHYSICS.coinRadius) {
      events.push('coin');
      return false;
    }
    return coin.x > -10;
  });

  const collected = events.filter((event) => event === 'coin').length;

  return {
    state: {
      balloonY,
      velocityY,
      smoothedLift,
      lastStrength: target,
      wobble: clamp(wobble, 0, PHYSICS.wobbleMax),
      wobblePhase: wobble > 0.05 ? current.wobblePhase + delta * 9 : 0,
      clouds,
      coins,
      coinsCollected: current.coinsCollected + collected,
    },
    events,
  };
}

/** Смещение шарика для покачивания, в пикселях. */
export function wobbleOffset(state: GameState): number {
  return state.wobble * Math.sin(state.wobblePhase);
}
