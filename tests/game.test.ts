import { describe, expect, it } from 'vitest';
import { initialGameState, spawnObject, stepGame } from '../src/game/engine.ts';

describe('game physics', () => {
  it('moves the balloon down without breath', () => {
    const result = stepGame(initialGameState(), 0.05, 0);
    expect(result.state.balloonY).toBeGreaterThan(52);
  });

  it('moves the balloon up with a strong breath after acceleration', () => {
    let state = initialGameState();
    for (let index = 0; index < 10; index += 1) state = stepGame(state, 0.05, 1).state;
    expect(state.balloonY).toBeLessThan(52);
  });

  it('collects a coin on collision', () => {
    const state = initialGameState();
    state.objects = [{ id: 1, type: 'coin', x: 18, y: 52, collected: false }];
    const result = stepGame(state, 0.01, 0.47);
    expect(result.events).toContain('coin');
    expect(result.state.coins).toBe(1);
    expect(result.state.objects).toHaveLength(0);
  });

  it('counts a bird only after it safely leaves the screen', () => {
    const state = initialGameState();
    state.objects = [{ id: 1, type: 'bird', x: -5, y: 12, collected: false }];
    const result = stepGame(state, 0.05, 0);
    expect(result.events).toContain('avoided');
    expect(result.state.birdsAvoided).toBe(1);
  });

  it('spawns objects in a child-safe vertical area', () => {
    expect(spawnObject(1, 'coin', () => 0).y).toBe(14);
    expect(spawnObject(2, 'bird', () => 1).y).toBe(82);
  });
});
