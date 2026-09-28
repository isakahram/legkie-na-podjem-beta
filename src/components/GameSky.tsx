import type { Cloud } from '../game/engine';

interface GameSkyProps {
  /** Фоновые облака дальних слоёв параллакса. */
  backdrop: Cloud[];
}

/** Небо, солнце и слои облаков с лёгким параллаксом. Чистая декорация. */
export function GameSky({ backdrop }: GameSkyProps) {
  return (
    <div className="sky-layers" aria-hidden="true">
      <div className="sky-gradient" />
      <div className="sky-sun">
        <span className="sky-sun__glow" />
      </div>
      {backdrop.map((cloud) => (
        <div
          key={cloud.id}
          className={`sky-cloud sky-cloud--depth-${cloud.depth < 0.3 ? 'far' : 'near'}`}
          style={{
            left: `${cloud.x}%`,
            top: `${cloud.y}%`,
            transform: `scale(${cloud.scale})`,
          }}
        >
          <i />
          <i />
          <i />
        </div>
      ))}
      <div className="sky-hills sky-hills--back" />
      <div className="sky-hills sky-hills--front" />
    </div>
  );
}

interface RouteCloudProps {
  cloud: Cloud;
}

/** Облако-маршрут: по нему проложены монеты. */
export function RouteCloud({ cloud }: RouteCloudProps) {
  return (
    <div
      className="route-cloud"
      style={{ left: `${cloud.x}%`, top: `${cloud.y}%`, transform: `scale(${cloud.scale})` }}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </div>
  );
}
