export type SkinCategory = 'color' | 'pattern' | 'effect';
export type SkinUnlock = 'coins' | 'streak' | 'breaths' | 'sessions';

export interface SkinDefinition {
  id: string;
  name: string;
  category: SkinCategory;
  price: number;
  color: string;
  accent: string;
  pattern?: 'stripes' | 'dots' | 'clouds' | 'stars' | 'waves' | 'rainbow';
  effect?: 'glow' | 'sparkles' | 'iridescent';
  unlock?: SkinUnlock;
  /** Порог прогресса для `unlock` (дни, выдохи за сессию, занятия). Используется сервером для честной автовыдачи. */
  unlockTarget?: number;
  unlockLabel?: string;
}

export const CATEGORY_TITLES: Record<SkinCategory, string> = {
  color: 'Цвета',
  pattern: 'Узоры',
  effect: 'Эффекты',
};

export const SKIN_CATALOG: readonly SkinDefinition[] = [
  { id: 'berry', name: 'Ягодка', category: 'color', price: 0, color: '#f45d7a', accent: '#862d54' },
  { id: 'sunny', name: 'Солнышко', category: 'color', price: 12, color: '#ffc342', accent: '#d86b2d' },
  { id: 'ocean', name: 'Океан', category: 'color', price: 18, color: '#42c7d0', accent: '#176b91' },
  { id: 'lavender', name: 'Лаванда', category: 'color', price: 18, color: '#a88be8', accent: '#59408d' },
  { id: 'mint', name: 'Мята', category: 'color', price: 30, color: '#75d5ae', accent: '#267b6c' },
  { id: 'sunset', name: 'Закат', category: 'color', price: 50, color: '#fa8561', accent: '#9b3d51' },
  { id: 'space', name: 'Космос', category: 'color', price: 80, color: '#6863d8', accent: '#29245e' },
  { id: 'night', name: 'Ночь', category: 'color', price: 120, color: '#30426e', accent: '#17243f' },
  { id: 'stripes', name: 'Полоски', category: 'pattern', price: 30, color: '#f58b8d', accent: '#8b3859', pattern: 'stripes' },
  { id: 'dots', name: 'Горошек', category: 'pattern', price: 50, color: '#7ac7e8', accent: '#28658c', pattern: 'dots' },
  { id: 'clouds', name: 'Облака', category: 'pattern', price: 50, color: '#a5c9f5', accent: '#4771a7', pattern: 'clouds' },
  { id: 'stars', name: 'Звёздочки', category: 'pattern', price: 80, color: '#7064d8', accent: '#29235f', pattern: 'stars' },
  { id: 'waves', name: 'Волны', category: 'pattern', price: 80, color: '#54c7b8', accent: '#1c6871', pattern: 'waves' },
  { id: 'rainbow', name: 'Радуга', category: 'pattern', price: 120, color: '#f39a75', accent: '#754b88', pattern: 'rainbow' },
  {
    id: 'glow',
    name: 'Сияние',
    category: 'effect',
    price: 0,
    color: '#f7c8ff',
    accent: '#924eb0',
    effect: 'glow',
    unlock: 'streak',
    unlockTarget: 7,
    unlockLabel: '7 дней подряд',
  },
  {
    id: 'sparkles',
    name: 'Искры',
    category: 'effect',
    price: 0,
    color: '#ffe28a',
    accent: '#b27620',
    effect: 'sparkles',
    unlock: 'breaths',
    unlockTarget: 30,
    unlockLabel: '30 ровных выдохов',
  },
  {
    id: 'iridescent',
    name: 'Переливание',
    category: 'effect',
    price: 0,
    color: '#9ee7e1',
    accent: '#3d63a7',
    effect: 'iridescent',
    unlock: 'sessions',
    unlockTarget: 10,
    unlockLabel: '10 занятий',
  },
];

export const skinDefinition = (id: string): SkinDefinition =>
  SKIN_CATALOG.find((skin) => skin.id === id) ?? SKIN_CATALOG[0];
