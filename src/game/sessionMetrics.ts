/**
 * Агрегаты сессии.
 *
 * ПРИВАТНОСТЬ: покадровые ряды живут только внутри текущего breath-сегмента
 * и уничтожаются при его закрытии. Сырое аудио не записывается, покадровые
 * данные не сохраняются и не передаются на сервер — наружу уходят только
 * агрегаты из `SessionMetrics`.
 */

export interface SessionMetrics {
  averageBreathDuration: number | null;
  averageStability: number | null;
  completedBreaths: number;
  sessionDurationSeconds: number;
  coinsCollected: number;
  averageLatencyMs: number | null;
  maxLatencyMs: number | null;
}

/** Порог завершённого выдоха, с. */
export const BREATH_THRESHOLD = {
  default: 1.5,
  min: 0.5,
  max: 10,
  step: 0.1,
} as const;

/**
 * Коэффициенты формулы стабильности.
 *
 * ТРЕБУЕТ ВАЛИДАЦИИ: значения подобраны эмпирически и не проверены
 * клинически. Формула и пороги не являются медицинским показателем.
 */
export const STABILITY = {
  /** Нижняя граница знаменателя, чтобы тихий выдох не раздувал вариацию. */
  minMean: 0.1,
  /** Нормировка коэффициента вариации. */
  cvScale: 0.4,
  /** Нормировка средней покадровой разности. */
  driftScale: 0.25,
  weightCv: 0.7,
  weightDrift: 0.3,
  /** Доля кадров, отбрасываемая в начале и в конце сегмента. */
  trimRatio: 0.15,
  /** Минимум кадров после обрезки, иначе сегмент не оценивается. */
  minFrames: 3,
} as const;

/** Приводит порог к допустимому диапазону и шагу 0.1 с. */
export function normalizeBreathThreshold(value: number): number {
  if (!Number.isFinite(value)) return BREATH_THRESHOLD.default;
  const stepped = Math.round(value / BREATH_THRESHOLD.step) * BREATH_THRESHOLD.step;
  const clamped = Math.min(BREATH_THRESHOLD.max, Math.max(BREATH_THRESHOLD.min, stepped));
  return Math.round(clamped * 10) / 10;
}

/** Обрезает первые и последние 15% кадров выдоха. */
export function trimFrames(values: number[]): number[] {
  const cut = Math.floor(values.length * STABILITY.trimRatio);
  const trimmed = cut > 0 ? values.slice(cut, values.length - cut) : values;
  return trimmed.length >= STABILITY.minFrames ? trimmed : values;
}

/**
 * Стабильность одного выдоха, 0..100.
 *
 * CV = σ / max(μ, 0.10); D = mean(|sᵢ − sᵢ₋₁|) / max(μ, 0.10);
 * V = 0.7 × min(CV/0.40, 1) + 0.3 × min(D/0.25, 1); Stability = round(100 × (1 − V)).
 *
 * ТРЕБУЕТ ВАЛИДАЦИИ.
 */
export function stabilityScore(rawFrames: number[]): number | null {
  const frames = trimFrames(rawFrames);
  if (frames.length < STABILITY.minFrames) return null;
  const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length;
  const denominator = Math.max(mean, STABILITY.minMean);
  const variance =
    frames.reduce((sum, value) => sum + (value - mean) ** 2, 0) / frames.length;
  const cv = Math.sqrt(variance) / denominator;
  const drift =
    frames.slice(1).reduce((sum, value, index) => sum + Math.abs(value - frames[index]), 0) /
    (frames.length - 1) /
    denominator;
  const v =
    STABILITY.weightCv * Math.min(cv / STABILITY.cvScale, 1) +
    STABILITY.weightDrift * Math.min(drift / STABILITY.driftScale, 1);
  return Math.round(100 * (1 - v));
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

export interface FrameInput {
  /** Метка времени кадра, мс (`performance.now()`). */
  atMs: number;
  /** Кадр классифицирован как выдох. */
  isBreath: boolean;
  /** Сила выдоха, 0..1. */
  strength: number;
}

/**
 * Накопитель метрик сессии. Хранит только текущий сегмент и агрегаты;
 * завершённый сегмент сворачивается в два числа и стирается.
 */
export class SessionMetricsCollector {
  private readonly threshold: number;

  private segmentStartMs: number | null = null;

  private segmentLastMs = 0;

  private segmentFrames: number[] = [];

  private readonly durations: number[] = [];

  private readonly stabilities: number[] = [];

  private readonly latencies: number[] = [];

  /** Момент первого кадра выдоха, ещё не сопоставленный с игровым кадром. */
  private pendingDetectionMs: number | null = null;

  private elapsedSeconds = 0;

  private coins = 0;

  constructor(thresholdSeconds: number = BREATH_THRESHOLD.default) {
    this.threshold = normalizeBreathThreshold(thresholdSeconds);
  }

  get breathThresholdSeconds(): number {
    return this.threshold;
  }

  /** Время сессии. Во время технической паузы вызывать не нужно — таймер стоит. */
  addElapsed(deltaSeconds: number): void {
    if (deltaSeconds > 0) this.elapsedSeconds += deltaSeconds;
  }

  setCoins(value: number): void {
    this.coins = Math.max(0, Math.round(value));
  }

  /** Кадр аудио-конвейера. */
  pushFrame(frame: FrameInput): void {
    if (frame.isBreath) {
      if (this.segmentStartMs === null) {
        this.segmentStartMs = frame.atMs;
        this.segmentFrames = [];
        // Первый кадр выдоха ждёт игрового кадра, применившего подъём.
        this.pendingDetectionMs = frame.atMs;
      }
      this.segmentLastMs = frame.atMs;
      this.segmentFrames.push(Math.max(0, Math.min(1, frame.strength)));
    } else {
      this.closeSegment();
    }
  }

  /**
   * Игровой кадр применил подъёмную силу. Задержка — программный интервал
   * конвейера «детекция → отрисовка». Это техническая метрика, не физиологическая.
   */
  markLiftApplied(atMs: number): void {
    if (this.pendingDetectionMs === null) return;
    this.latencies.push(Math.max(0, atMs - this.pendingDetectionMs));
    this.pendingDetectionMs = null;
  }

  /** Закрывает текущий сегмент и стирает покадровый ряд. */
  closeSegment(): void {
    if (this.segmentStartMs === null) return;
    const duration = (this.segmentLastMs - this.segmentStartMs) / 1000;
    if (duration >= this.threshold) {
      this.durations.push(duration);
      const stability = stabilityScore(this.segmentFrames);
      if (stability !== null) this.stabilities.push(stability);
    }
    this.segmentStartMs = null;
    this.segmentFrames = [];
    this.pendingDetectionMs = null;
  }

  /** Итоговые агрегаты. Без данных возвращает `null`, а не `0`. */
  snapshot(): SessionMetrics {
    const averageLatency = average(this.latencies);
    return {
      averageBreathDuration: average(this.durations),
      averageStability: average(this.stabilities),
      completedBreaths: this.durations.length,
      sessionDurationSeconds: Math.round(this.elapsedSeconds),
      coinsCollected: this.coins,
      averageLatencyMs: averageLatency === null ? null : Math.round(averageLatency),
      maxLatencyMs: this.latencies.length === 0 ? null : Math.round(Math.max(...this.latencies)),
    };
  }

  /** Завершает сессию: закрывает открытый сегмент и отдаёт агрегаты. */
  finish(): SessionMetrics {
    this.closeSegment();
    return this.snapshot();
  }
}
