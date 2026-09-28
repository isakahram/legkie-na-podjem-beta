/**
 * Лёгкие инлайновые SVG-графики: без внешних зависимостей и без лишнего веса бандла.
 * Все графики декоративны для скринридера — числовые данные дублируются таблицами рядом.
 */

export interface SeriesPoint {
  label: string;
  value: number;
  target?: number;
}

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = { top: 16, right: 12, bottom: 28, left: 32 };

const plotWidth = WIDTH - PADDING.left - PADDING.right;
const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

function niceMax(values: number[]): number {
  const max = Math.max(1, ...values.filter((value) => Number.isFinite(value)));
  const step = max <= 5 ? 1 : max <= 20 ? 2 : max <= 50 ? 5 : 10;
  return Math.ceil(max / step) * step;
}

export function BarSeriesChart({
  points,
  ariaLabel,
  targetLabel = 'план',
}: {
  points: SeriesPoint[];
  ariaLabel: string;
  targetLabel?: string;
}) {
  if (points.length === 0) return null;
  const max = niceMax([...points.map((point) => point.value), ...points.map((point) => point.target ?? 0)]);
  const slot = plotWidth / points.length;
  const barWidth = Math.min(34, slot * 0.5);

  return (
    <figure className="sp-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {[0, 0.5, 1].map((ratio) => {
          const y = PADDING.top + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line className="sp-chart__grid" x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} />
              <text className="sp-chart__axis" x={PADDING.left - 8} y={y + 4} textAnchor="end">
                {Math.round(max * ratio)}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const centre = PADDING.left + slot * index + slot / 2;
          const height = (point.value / max) * plotHeight;
          const y = PADDING.top + plotHeight - height;
          const targetY =
            point.target === undefined ? null : PADDING.top + plotHeight - (point.target / max) * plotHeight;
          return (
            <g key={`${point.label}-${index}`}>
              <rect
                className="sp-chart__bar"
                x={centre - barWidth / 2}
                y={y}
                width={barWidth}
                height={Math.max(2, height)}
                rx={5}
              />
              {targetY !== null && (
                <line
                  className="sp-chart__target"
                  x1={centre - barWidth / 2 - 5}
                  y1={targetY}
                  x2={centre + barWidth / 2 + 5}
                  y2={targetY}
                />
              )}
              <text className="sp-chart__axis" x={centre} y={HEIGHT - 8} textAnchor="middle">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sp-chart__legend">
        <span>
          <i className="sp-dot sp-dot--bar" /> занятия
        </span>
        <span>
          <i className="sp-dot sp-dot--target" /> {targetLabel}
        </span>
      </figcaption>
    </figure>
  );
}

export function LineSeriesChart({
  points,
  ariaLabel,
  unit = '',
}: {
  points: SeriesPoint[];
  ariaLabel: string;
  unit?: string;
}) {
  if (points.length === 0) return null;
  const max = niceMax(points.map((point) => point.value));
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    x: PADDING.left + step * index,
    y: PADDING.top + plotHeight - (point.value / max) * plotHeight,
    point,
  }));
  const path = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x},${coord.y}`).join(' ');
  const area = `${path} L${coords[coords.length - 1].x},${PADDING.top + plotHeight} L${coords[0].x},${
    PADDING.top + plotHeight
  } Z`;

  return (
    <figure className="sp-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {[0, 0.5, 1].map((ratio) => {
          const y = PADDING.top + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line className="sp-chart__grid" x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} />
              <text className="sp-chart__axis" x={PADDING.left - 8} y={y + 4} textAnchor="end">
                {Math.round(max * ratio)}
                {unit}
              </text>
            </g>
          );
        })}
        <path className="sp-chart__area" d={area} />
        <path className="sp-chart__line" d={path} />
        {coords.map((coord, index) => (
          <circle key={index} className="sp-chart__point" cx={coord.x} cy={coord.y} r={4} />
        ))}
        {coords.map((coord, index) => (
          <text
            key={`label-${index}`}
            className="sp-chart__axis"
            x={coord.x}
            y={HEIGHT - 8}
            textAnchor="middle"
          >
            {coord.point.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}
