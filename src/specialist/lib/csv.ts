import type { SessionRecord } from '../../types';
import { formatDateTime } from './format';

/**
 * Экранирует значение для CSV с разделителем `;`, который корректно открывается
 * в русской локали офисных приложений.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Собирает таблицу в CSV без лишней пустой строки в конце файла. */
export function buildCsv(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[] = [],
): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(';')).join('\r\n');
}

const completedBreathsOf = (session: SessionRecord): number | null =>
  session.completedBreaths ?? session.completedCycles ?? null;

const targetBreathsOf = (session: SessionRecord): number | null =>
  session.targetBreaths ?? session.targetCycles ?? null;

const percentOfStrength = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : Math.round(value * 100);

const statusLabel = (status: SessionRecord['status']): string =>
  status === 'completed' ? 'завершено' : 'прервано';

const inputModeLabel = (mode: SessionRecord['inputMode']): string =>
  mode === 'microphone' ? 'микрофон' : 'демо';

/**
 * Преобразует записи журнала в экспортируемую таблицу.
 * Пустые метрики остаются пустыми: отсутствие данных не подменяется нулём.
 */
export function sessionsToCsv(sessions: readonly SessionRecord[], fallbackPatientName?: string): string {
  const headers = [
    'Пациент',
    'Дата и время',
    'Длительность, сек',
    'Завершённых выдохов',
    'Целевых выдохов',
    'Правильность, %',
    'Средняя длительность выдоха, сек',
    'Стабильность, %',
    'Средняя сила, %',
    'Монеты',
    'Средняя задержка, мс',
    'Максимальная задержка, мс',
    'Технические паузы',
    'Статус',
    'Режим',
  ];

  const rows = sessions.map((session) => [
    session.childNickname ?? fallbackPatientName ?? session.childId,
    formatDateTime(session.startedAt),
    session.durationSeconds,
    completedBreathsOf(session),
    targetBreathsOf(session),
    session.correctBreathPercent,
    session.averageBreathDuration,
    session.averageStability,
    percentOfStrength(session.averageStrength),
    session.coinsCollected,
    session.averageLatencyMs,
    session.maxLatencyMs,
    session.technicalPauses,
    statusLabel(session.status),
    inputModeLabel(session.inputMode),
  ]);

  return buildCsv(headers, rows);
}

/** Скачивает текст как файл в браузере. */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType = 'text/csv;charset=utf-8',
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;

  // BOM нужен Excel, чтобы кириллица в CSV определилась как UTF-8.
  const blob = new Blob([mimeType.startsWith('text/csv') ? `\uFEFF${text}` : text], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
