/**
 * Лёгкие инлайновые SVG-графики: без внешних зависимостей и без лишнего веса бандла.
 * Все графики декоративны для скринридера — числовые данные дублируются таблицами рядом.
 */

export interface SeriesPoint {
  label: string;
  value: number;
  target?: number;
  /** Неделя ещё не завершена: точка рисуется приглушённо и не считается провалом. */
  partial?: boolean;
}

/** Подпись под графиком, когда последняя точка — незавершённая неделя. */
export const PARTIAL_WEEK_NOTE = 'Текущая неделя не завершена';

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
                className={point.partial ? 'sp-chart__bar sp-chart__bar--partial' : 'sp-chart__bar'}
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
        {points.some((point) => point.partial) && <span className="sp-chart__partial-note">{PARTIAL_WEEK_NOTE}</span>}
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
  // Незавершённые недели не участвуют в сплошной линии: иначе последняя точка
  // падает в ноль и выглядит как резкое прекращение занятий.
  const solid = coords.filter((coord) => coord.point.partial !== true);
  const hasPartial = solid.length !== coords.length;
  const base = solid.length > 0 ? solid : coords;
  const path = base.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x},${coord.y}`).join(' ');
  const area = `${path} L${base[base.length - 1].x},${PADDING.top + plotHeight} L${base[0].x},${
    PADDING.top + plotHeight
  } Z`;
  const lastSolid = solid[solid.length - 1];
  const firstPartial = coords.find((coord) => coord.point.partial === true);
  const dashedPath =
    hasPartial && lastSolid && firstPartial
      ? `M${lastSolid.x},${lastSolid.y} L${firstPartial.x},${firstPartial.y}`
      : null;

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
        {dashedPath && <path className="sp-chart__line sp-chart__line--partial" d={dashedPath} />}
        {coords.map((coord, index) => (
          <circle
            key={index}
            className={coord.point.partial ? 'sp-chart__point sp-chart__point--partial' : 'sp-chart__point'}
            cx={coord.x}
            cy={coord.y}
            r={4}
          />
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
      {hasPartial && (
        <figcaption className="sp-chart__legend">
          <span className="sp-chart__partial-note">{PARTIAL_WEEK_NOTE}</span>
        </figcaption>
      )}
    </figure>
  );
}
