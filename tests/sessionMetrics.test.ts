import { describe, expect, it } from 'vitest';
import {
  BREATH_THRESHOLD,
  SessionMetricsCollector,
  normalizeBreathThreshold,
  stabilityScore,
  trimFrames,
} from '../src/game/sessionMetrics.ts';

/** Проигрывает выдох длительностью `seconds` с заданными силами по кадрам. */
const playBreath = (
  collector: SessionMetricsCollector,
  startMs: number,
  seconds: number,
  strengthAt: (index: number) => number,
  frameMs = 50,
): number => {
  const frames = Math.round((seconds * 1000) / frameMs);
  for (let index = 0; index <= frames; index += 1) {
    collector.pushFrame({
      atMs: startMs + index * frameMs,
      isBreath: true,
      strength: strengthAt(index),
    });
  }
  return startMs + frames * frameMs;
};

describe('порог завершённого выдоха', () => {
  it('по умолчанию 1.5 с', () => {
    expect(BREATH_THRESHOLD.default).toBe(1.5);
    expect(new SessionMetricsCollector().breathThresholdSeconds).toBe(1.5);
  });

  it('клампится в диапазон 0.5–10 с шагом 0.1', () => {
    expect(normalizeBreathThreshold(0.1)).toBe(0.5);
    expect(normalizeBreathThreshold(42)).toBe(10);
    expect(normalizeBreathThreshold(2.34)).toBe(2.3);
    expect(normalizeBreathThreshold(Number.NaN)).toBe(1.5);
  });

  it('сегмент короче порога не считается завершённым выдохом', () => {
    const collector = new SessionMetricsCollector();
    playBreath(collector, 0, 1.2, () => 0.6);
    collector.pushFrame({ atMs: 1_400, isBreath: false, strength: 0 });
    const metrics = collector.finish();
    expect(metrics.completedBreaths).toBe(0);
    expect(metrics.averageBreathDuration).toBeNull();
    expect(metrics.averageStability).toBeNull();
  });
});

describe('стабильность', () => {
  it('ровный выдох даёт высокую оценку', () => {
    expect(stabilityScore(Array.from({ length: 40 }, () => 0.6))).toBe(100);
  });

  it('пилообразный сигнал даёт низкую оценку', () => {
    const saw = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? 0.15 : 0.95));
    const score = stabilityScore(saw);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(25);
  });

  it('оценка ограничена диапазоном 0–100', () => {
    const chaos = Array.from({ length: 60 }, (_, index) => (index % 3 === 0 ? 0 : 1));
    const score = stabilityScore(chaos)!;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('исключает первые и последние 15% кадров', () => {
    const frames = Array.from({ length: 20 }, (_, index) => index);
    expect(trimFrames(frames)).toEqual(frames.slice(3, 17));
    // Всплески на краях не портят оценку ровной середины.
    const withEdges = [0, 1, 0, ...Array.from({ length: 14 }, () => 0.5), 1, 0, 1];
    expect(stabilityScore(withEdges)).toBe(100);
  });

  it('слишком короткий ряд не оценивается', () => {
    expect(stabilityScore([0.5, 0.5])).toBeNull();
  });
});

describe('агрегаты сессии', () => {
  it('считает завершённые выдохи и их среднюю длительность', () => {
    const collector = new SessionMetricsCollector();
    let now = playBreath(collector, 0, 2, () => 0.6);
    collector.pushFrame({ atMs: (now += 200), isBreath: false, strength: 0 });
    now = playBreath(collector, now + 200, 4, () => 0.6);
    collector.pushFrame({ atMs: now + 200, isBreath: false, strength: 0 });
    collector.addElapsed(30);
    collector.setCoins(12);
    const metrics = collector.finish();
    expect(metrics.completedBreaths).toBe(2);
    expect(metrics.averageBreathDuration).toBeCloseTo(3, 5);
    expect(metrics.averageStability).toBe(100);
    expect(metrics.sessionDurationSeconds).toBe(30);
    expect(metrics.coinsCollected).toBe(12);
  });

  it('закрывает открытый сегмент при завершении сессии', () => {
    const collector = new SessionMetricsCollector();
    playBreath(collector, 0, 3, () => 0.5);
    expect(collector.finish().completedBreaths).toBe(1);
  });

  it('измеряет задержку между детекцией выдоха и применением подъёма', () => {
    const collector = new SessionMetricsCollector();
    collector.pushFrame({ atMs: 100, isBreath: true, strength: 0.6 });
    collector.markLiftApplied(118);
    collector.pushFrame({ atMs: 150, isBreath: true, strength: 0.6 });
    // Повторный вызов без новой детекции ничего не добавляет.
    collector.markLiftApplied(400);
    collector.pushFrame({ atMs: 200, isBreath: false, strength: 0 });
    collector.pushFrame({ atMs: 400, isBreath: true, strength: 0.6 });
    collector.markLiftApplied(432);
    const metrics = collector.finish();
    expect(metrics.averageLatencyMs).toBe(25);
    expect(metrics.maxLatencyMs).toBe(32);
  });

  it('без данных отдаёт null вместо нуля', () => {
    const metrics = new SessionMetricsCollector().finish();
    expect(metrics).toEqual({
      averageBreathDuration: null,
      bestDuration: null,
      averageStability: null,
      completedBreaths: 0,
      sessionDurationSeconds: 0,
      coinsCollected: 0,
      averageLatencyMs: null,
      maxLatencyMs: null,
    });
  });
});
