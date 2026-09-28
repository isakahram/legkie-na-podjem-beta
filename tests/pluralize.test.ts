import { describe, expect, it } from 'vitest';
import { pluralize, pluralizeCoins } from '../src/utils/pluralize.ts';

describe('pluralizeCoins', () => {
  it('1 → монета', () => {
    expect(pluralizeCoins(1)).toBe('монета');
  });

  it('2, 3, 4 → монеты', () => {
    expect(pluralizeCoins(2)).toBe('монеты');
    expect(pluralizeCoins(3)).toBe('монеты');
    expect(pluralizeCoins(4)).toBe('монеты');
  });

  it('5–20 → монет (включая исключения 11–14)', () => {
    expect(pluralizeCoins(5)).toBe('монет');
    expect(pluralizeCoins(11)).toBe('монет');
    expect(pluralizeCoins(12)).toBe('монет');
    expect(pluralizeCoins(13)).toBe('монет');
    expect(pluralizeCoins(14)).toBe('монет');
    expect(pluralizeCoins(20)).toBe('монет');
  });

  it('21 → монета', () => {
    expect(pluralizeCoins(21)).toBe('монета');
  });

  it('22, 23, 24 → монеты', () => {
    expect(pluralizeCoins(22)).toBe('монеты');
    expect(pluralizeCoins(23)).toBe('монеты');
    expect(pluralizeCoins(24)).toBe('монеты');
  });

  it('25–30 → монет', () => {
    expect(pluralizeCoins(25)).toBe('монет');
    expect(pluralizeCoins(28)).toBe('монет');
    expect(pluralizeCoins(30)).toBe('монет');
  });

  it('0 → монет (родительный множественного)', () => {
    expect(pluralizeCoins(0)).toBe('монет');
  });

  it('generic pluralize принимает произвольные формы', () => {
    expect(pluralize(1, ['занятие', 'занятия', 'занятий'])).toBe('занятие');
    expect(pluralize(3, ['занятие', 'занятия', 'занятий'])).toBe('занятия');
    expect(pluralize(10, ['занятие', 'занятия', 'занятий'])).toBe('занятий');
  });
});
