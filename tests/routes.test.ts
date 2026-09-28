import { describe, expect, it } from 'vitest';
import { ROUTES, expectedCoinsPerWave, spawnBackdropCloud, spawnWave } from '../src/game/routes.ts';

/** Детерминированный генератор для воспроизводимых тестов. */
const sequence = (values: number[]): (() => number) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('маршруты облаков', () => {
  it('нижний маршрут появляется в каждой волне и всегда даёт монеты', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const wave = spawnWave(attempt * 100, sequence([0.99, 0.5, 0.01]));
      const lowRoute = ROUTES.find((route) => route.id === 'low')!;
      const lowCoins = wave.coins.filter((coin) => {
        const cloud = wave.clouds.find((item) => item.id === coin.cloudId)!;
        return cloud.y >= lowRoute.minY - 1 && cloud.y <= lowRoute.maxY + 1;
      });
      expect(lowCoins.length).toBeGreaterThanOrEqual(lowRoute.coins[0]);
    }
  });

  it('основная масса монет сосредоточена на верхних маршрутах', () => {
    const totals = ROUTES.map(expectedCoinsPerWave);
    const sum = totals.reduce((acc, value) => acc + value, 0);
    const highShare = totals[0] / sum;
    expect(highShare).toBeGreaterThan(0.5);
    expect(totals[0]).toBeGreaterThan(totals[1]);
    expect(totals[1]).toBeGreaterThan(0);
    expect(totals[2]).toBeGreaterThan(0);
  });

  it('облака появляются за правым краем и в границах своих коридоров', () => {
    const wave = spawnWave(0, sequence([0.1, 0.5]));
    expect(wave.clouds.length).toBeGreaterThan(0);
    wave.clouds.forEach((cloud) => {
      expect(cloud.x).toBeGreaterThan(100);
      const route = ROUTES.find((item) => cloud.y >= item.minY && cloud.y <= item.maxY);
      expect(route).toBeDefined();
    });
  });

  it('выдаёт уникальные идентификаторы и продвигает счётчик', () => {
    const first = spawnWave(0, sequence([0.1, 0.5]));
    const second = spawnWave(first.nextId, sequence([0.1, 0.5]));
    const ids = [...first.clouds, ...first.coins, ...second.clouds, ...second.coins].map(
      (item) => item.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(second.nextId).toBeGreaterThan(first.nextId);
  });

  it('монеты лежат над своим облаком', () => {
    const wave = spawnWave(0, sequence([0.1, 0.5]));
    wave.coins.forEach((coin) => {
      const cloud = wave.clouds.find((item) => item.id === coin.cloudId)!;
      expect(coin.y).toBeLessThan(cloud.y);
    });
  });

  it('фоновые облака не несут монет и движутся в дальнем слое', () => {
    const cloud = spawnBackdropCloud(1, sequence([0.2, 0.6, 0.4]));
    expect(cloud.depth).toBeLessThan(1);
    expect(cloud.y).toBeGreaterThanOrEqual(8);
  });
});
