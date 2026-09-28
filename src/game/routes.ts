/**
 * Маршруты облаков с монетами.
 *
 * Небо разделено на три коридора. Основная масса монет — на верхних
 * маршрутах: чем ровнее и продолжительнее выдох, тем выше поднимается
 * шарик и тем больше монет доступно. На нижнем маршруте монеты
 * гарантированы всегда, чтобы ребёнок получал позитивное подкрепление
 * даже при слабом выдохе.
 */

import type { Cloud, Coin } from './engine';

export type RouteId = 'high' | 'mid' | 'low';

export interface RouteConfig {
  id: RouteId;
  /** Границы коридора по вертикали, % поля. */
  minY: number;
  maxY: number;
  /** Сколько монет несёт облако маршрута: [min, max] включительно. */
  coins: [number, number];
  /** Вероятность появления облака маршрута в одной волне, 0..1. */
  frequency: number;
  scale: number;
}

export const ROUTES: readonly RouteConfig[] = [
  { id: 'high', minY: 13, maxY: 28, coins: [4, 6], frequency: 0.8, scale: 1 },
  { id: 'mid', minY: 34, maxY: 50, coins: [2, 3], frequency: 0.5, scale: 0.92 },
  // frequency = 1: нижний маршрут появляется в каждой волне.
  { id: 'low', minY: 58, maxY: 76, coins: [1, 2], frequency: 1, scale: 0.84 },
] as const;

/** Пауза между волнами облаков, с. */
export const WAVE_INTERVAL_SECONDS = 2.6;

/** Стартовая позиция облака за правым краем поля. */
const SPAWN_X = 112;

export interface Wave {
  clouds: Cloud[];
  coins: Coin[];
  nextId: number;
}

const between = (random: () => number, min: number, max: number): number =>
  min + random() * (max - min);

const intBetween = (random: () => number, min: number, max: number): number =>
  Math.floor(between(random, min, max + 1 - Number.EPSILON));

/**
 * Одна волна облаков. `nextId` — сквозной счётчик идентификаторов,
 * возвращается увеличенным, чтобы ключи React оставались уникальными.
 */
export function spawnWave(nextId: number, random: () => number = Math.random): Wave {
  const clouds: Cloud[] = [];
  const coins: Coin[] = [];
  let id = nextId;

  ROUTES.forEach((route, index) => {
    if (route.frequency < 1 && random() >= route.frequency) return;
    const cloudId = (id += 1);
    const y = between(random, route.minY, route.maxY);
    clouds.push({
      id: cloudId,
      x: SPAWN_X + index * 7,
      y,
      scale: route.scale,
      depth: 1,
    });
    const amount = intBetween(random, route.coins[0], route.coins[1]);
    for (let position = 0; position < amount; position += 1) {
      coins.push({
        id: (id += 1),
        cloudId,
        x: SPAWN_X + index * 7 + position * 4.2,
        // Монеты лежат чуть выше облака — «на верхней кромке».
        y: y - 4.5,
      });
    }
  });

  return { clouds, coins, nextId: id };
}

/** Декоративные облака фона, монет не несут. */
export function spawnBackdropCloud(id: number, random: () => number = Math.random): Cloud {
  const depth = random() < 0.5 ? 0.15 : 0.4;
  return {
    id,
    x: SPAWN_X + random() * 20,
    y: between(random, 8, 72),
    scale: 0.7 + depth,
    depth,
  };
}

/** Ожидаемое число монет на волну для маршрута — используется в тестах и балансировке. */
export function expectedCoinsPerWave(route: RouteConfig): number {
  const averageCoins = (route.coins[0] + route.coins[1]) / 2;
  return averageCoins * route.frequency;
}
