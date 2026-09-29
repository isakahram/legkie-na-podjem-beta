// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarSeriesChart, LineSeriesChart, PARTIAL_WEEK_NOTE } from '../src/specialist/components/charts';

afterEach(cleanup);

const points = [
  { label: 'нед 1', value: 80, target: 3 },
  { label: 'нед 2', value: 70, target: 3 },
  { label: 'нед 3', value: 0, target: 3, partial: true },
];

describe('Незавершённая неделя на графиках', () => {
  it('линейный график подписывает неполную неделю и не ведёт в неё сплошную линию', () => {
    const { container } = render(<LineSeriesChart points={points} ariaLabel="Динамика" />);

    expect(screen.getByText(PARTIAL_WEEK_NOTE)).toBeTruthy();
    expect(container.querySelector('.sp-chart__line--partial')).toBeTruthy();
    expect(container.querySelectorAll('.sp-chart__point--partial')).toHaveLength(1);

    // Сплошная линия строится только по завершённым неделям.
    const solid = container.querySelector('.sp-chart__line:not(.sp-chart__line--partial)');
    expect(solid?.getAttribute('d')?.split('L')).toHaveLength(2);
  });

  it('столбчатый график приглушает неполную неделю и показывает пометку', () => {
    const { container } = render(<BarSeriesChart points={points} ariaLabel="Занятия" />);

    expect(screen.getByText(PARTIAL_WEEK_NOTE)).toBeTruthy();
    expect(container.querySelectorAll('.sp-chart__bar--partial')).toHaveLength(1);
  });

  it('без неполных недель пометка не показывается', () => {
    render(<LineSeriesChart points={points.slice(0, 2)} ariaLabel="Динамика" />);
    expect(screen.queryByText(PARTIAL_WEEK_NOTE)).toBeNull();
  });
});
