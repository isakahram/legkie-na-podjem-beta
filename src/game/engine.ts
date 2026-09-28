export type GameObjectType = 'coin' | 'bird';

export interface GameObject {
  id: number;
  type: GameObjectType;
  x: number;
  y: number;
  collected: boolean;
}

export interface GameState {
  balloonY: number;
  velocityY: number;
  objects: GameObject[];
  coins: number;
  birdsAvoided: number;
  birdBumps: number;
}

export interface GameStepResult {
  state: GameState;
  events: Array<'coin' | 'bump' | 'avoided'>;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const initialGameState = (): GameState => ({
  balloonY: 52,
  velocityY: 0,
  objects: [],
  coins: 0,
  birdsAvoided: 0,
  birdBumps: 0,
});

/** Pure physics step. Coordinates are percentages of the game viewport. */
export function stepGame(
  current: GameState,
  deltaSeconds: number,
  breathStrength: number,
): GameStepResult {
  const delta = Math.min(deltaSeconds, 0.05);
  const lift = clamp(breathStrength, 0, 1) * 72;
  const velocityY = clamp(current.velocityY + (34 - lift) * delta, -28, 24);
  const balloonY = clamp(current.balloonY + velocityY * delta, 8, 88);
  const events: GameStepResult['events'] = [];

  const objects = current.objects
    .map((object) => ({ ...object, x: object.x - 22 * delta }))
    .filter((object) => {
      if (object.collected) return false;
      const distance = Math.hypot((object.x - 18) * 1.15, object.y - balloonY);
      if (object.type === 'coin' && distance < 7) {
        events.push('coin');
        return false;
      }
      if (object.type === 'bird' && distance < 8) {
        events.push('bump');
        return false;
      }
      if (object.type === 'bird' && object.x < -5) events.push('avoided');
      return object.x >= -8;
    });

  return {
    state: {
      balloonY,
      velocityY: balloonY === 8 || balloonY === 88 ? velocityY * -0.15 : velocityY,
      objects,
      coins: current.coins + events.filter((event) => event === 'coin').length,
      birdsAvoided: current.birdsAvoided + events.filter((event) => event === 'avoided').length,
      birdBumps: current.birdBumps + events.filter((event) => event === 'bump').length,
    },
    events,
  };
}

export function spawnObject(
  id: number,
  type: GameObjectType,
  random = Math.random,
): GameObject {
  return {
    id,
    type,
    x: 108,
    y: 14 + random() * 68,
    collected: false,
  };
}
