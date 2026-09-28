/**
 * Русское склонение существительных по числительному.
 *
 * `forms` — три формы: [1 монета, 2 монеты, 5 монет] (именительный/родительный
 * падежи для «один», «немного» и «много»). Правило учитывает исключения на
 * 11–14 (всегда «много»), поэтому работает для любых неотрицательных целых.
 */
export function pluralize(count: number, forms: readonly [string, string, string]): string {
  const value = Math.abs(Math.trunc(count));
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

/** Склонение слова «монета» под число: 1 монета, 2 монеты, 5 монет. */
export function pluralizeCoins(count: number): string {
  return pluralize(count, ['монета', 'монеты', 'монет']);
}
