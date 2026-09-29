import { pluralize } from '../../utils/pluralize';
import type { TrendContext } from '../../shared/trend';
import { formatTrendLabel, trendContextFromValues } from '../../shared/trend';

/** Пол человека в карточке пациента. */
export const GENDER_LABELS: Record<string, string> = {
  male: 'мальчик',
  female: 'девочка',
  unspecified: 'пол не указан',
};

const EMPTY_VALUE = '—';

const asDate = (value: string | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Форматирует ISO-дату для коротких дат в кабинете специалиста. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? dateFormatter.format(date) : EMPTY_VALUE;
}

/** Форматирует дату и время в локальном часовом поясе браузера. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  return date ? dateTimeFormatter.format(date) : EMPTY_VALUE;
}

/** Форматирует целое количество секунд как «минуты секунды». */
export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;

  const totalSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} с`;
  return `${minutes} мин ${String(seconds).padStart(2, '0')} с`;
}

/** Форматирует длительность выдоха, сохраняя одну десятичную долю. */
export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} с`;
}

/** Форматирует процентные метрики без ложного нуля для отсутствующих данных. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  return `${Math.round(value)}%`;
}

/**
 * Форматирует изменение показателя с понятным направлением динамики.
 * Сигнатура сохранена намеренно: старые вызовы и тесты не должны меняться.
 * Развёрнутую формулировку «Снижение с X% до Y%» даёт formatTrendLabel.
 */
export function formatTrend(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  if (value === 0) return 'без изменений';
  return value > 0 ? `рост +${Math.round(value)}%` : `снижение ${Math.round(value)}%`;
}

/**
 * Формулировка динамики по контексту полных недель.
 * Обёртка над общим модулем: UI не должен знать правил выбора недель.
 */
export function formatTrendContext(
  input: Parameters<typeof trendContextFromValues>[0] | TrendContext,
): string {
  const context = 'state' in input ? input : trendContextFromValues(input);
  return formatTrendLabel(context);
}

/** Форматирует возраст с правильным русским склонением. */
export function formatAge(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY_VALUE;
  const age = Math.trunc(value);
  return `${age} ${pluralize(age, ['год', 'года', 'лет'])}`;
}
