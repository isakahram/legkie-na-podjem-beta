import { describe, expect, it } from 'vitest';
import {
  BALLOON_X,
  PHYSICS,
  initialGameState,
  liftFactor,
  stepGame,
  wobbleOffset,
  type GameState,
} from '../src/game/engine.ts';

const run = (state: GameState, seconds: number, strength: number): GameState => {
  let current = state;
  const frames = Math.round(seconds / 0.05);
  for (let index = 0; index < frames; index += 1) {
    current = stepGame(current, 0.05, strength).state;
  }
  return current;
};

describe('физика шарика', () => {
  it('без выдоха шарик плавно опускается, но остаётся в игре', () => {
    const state = run(initialGameState(), 6, 0);
    expect(state.balloonY).toBe(PHYSICS.floor);
    expect(state.velocityY).toBe(0);
    expect(state.wobble).toBeGreaterThanOrEqual(PHYSICS.wobbleMin);
  });

  it('ровный выдох поднимает шарик без резкого ускорения', () => {
    let state = initialGameState();
    const speeds: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      state = stepGame(state, 0.05, 0.6).state;
      speeds.push(state.velocityY);
    }
    expect(state.balloonY).toBeLessThan(initialGameState().balloonY);
    const jumps = speeds.slice(1).map((value, index) => Math.abs(value - speeds[index]));
    expect(Math.max(...jumps)).toBeLessThan(3);
  });

  it('слабый выдох удерживает высоту или снижает медленнее свободного падения', () => {
    const weak = run(initialGameState(), 2, 0.25);
    const none = run(initialGameState(), 2, 0);
    expect(weak.balloonY).toBeLessThan(none.balloonY);
  });

  it('после комфортной силы дополнительная громкость не ускоряет подъём', () => {
    expect(liftFactor(PHYSICS.comfortStrength)).toBe(1);
    expect(liftFactor(1)).toBe(1);
    const comfortable = run(initialGameState(), 3, PHYSICS.comfortStrength);
    const loud = run(initialGameState(), 3, 1);
    expect(Math.abs(comfortable.balloonY - loud.balloonY)).toBeLessThan(0.5);
  });

  it('верхняя граница ограничивает высоту мягко', () => {
    const state = run(initialGameState(), 20, 1);
    expect(state.balloonY).toBeGreaterThanOrEqual(PHYSICS.ceiling);
    expect(state.balloonY).toBeLessThan(PHYSICS.ceiling + PHYSICS.ceilingSoftZone);
    // У потолка шарик замирает, а не отскакивает.
    expect(Math.abs(state.velocityY)).toBeLessThan(3);
  });

  it('резкий скачок сигнала даёт покачивание 2–4 px и не отнимает монеты', () => {
    const state = { ...initialGameState(), coinsCollected: 5 };
    const result = stepGame(state, 0.05, 1);
    expect(result.events).toContain('wobble');
    expect(result.state.wobble).toBeGreaterThanOrEqual(PHYSICS.wobbleMin);
    expect(result.state.wobble).toBeLessThanOrEqual(PHYSICS.wobbleMax);
    expect(result.state.coinsCollected).toBe(5);
    expect(Math.abs(wobbleOffset(result.state))).toBeLessThanOrEqual(PHYSICS.wobbleMax);
  });

  it('собирает монету и не знает других событий столкновения', () => {
    const state = initialGameState();
    state.coins = [{ id: 1, cloudId: 0, x: BALLOON_X, y: state.balloonY }];
    const result = stepGame(state, 0.02, 0.4);
    expect(result.events.filter((event) => event === 'coin')).toHaveLength(1);
    expect(result.state.coinsCollected).toBe(1);
    expect(result.state.coins).toHaveLength(0);
  });

  it('облака и монеты плывут справа налево и уходят за край', () => {
    const state = initialGameState();
    state.clouds = [{ id: 1, x: -39.5, y: 30, scale: 1, depth: 1 }];
    state.coins = [{ id: 2, cloudId: 1, x: -9.8, y: 30 }];
    const result = stepGame(state, 0.05, 0);
    expect(result.state.clouds).toHaveLength(0);
    expect(result.state.coins).toHaveLength(0);
  });
});
