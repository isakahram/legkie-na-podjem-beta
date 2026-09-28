import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvValue, sessionsToCsv } from '../src/specialist/lib/csv.ts';
import type { SessionRecord } from '../src/types.ts';

const session = (patch: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  childId: 'p1',
  childNickname: 'Артём Л.',
  startedAt: '2026-09-29T14:05:00.000Z',
  durationSeconds: 540,
  breathCount: 8,
  averageStrength: 0.6,
  averageBreathDuration: 3.2,
  averageStability: 82,
  correctBreathPercent: 88,
  completedBreaths: 7,
  targetBreaths: 8,
  coinsCollected: 6,
  averageLatencyMs: 60,
  maxLatencyMs: 90,
  technicalPauses: 1,
  status: 'completed',
  inputMode: 'microphone',
  ...patch,
});

describe('Экранирование значений CSV', () => {
  it('оставляет обычный текст как есть', () => {
    expect(escapeCsvValue('Артём')).toBe('Артём');
    expect(escapeCsvValue(42)).toBe('42');
  });

  it('пустые значения превращаются в пустую строку', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('оборачивает значения с разделителем, кавычками и переводом строки', () => {
    expect(escapeCsvValue('а;б')).toBe('"а;б"');
    expect(escapeCsvValue('он сказал "да"')).toBe('"он сказал ""да"""');
    expect(escapeCsvValue('строка\nвторая')).toBe('"строка\nвторая"');
  });
});

describe('Сборка CSV', () => {
  it('склеивает заголовок и строки через CRLF', () => {
    const csv = buildCsv(['A', 'B'], [[1, 2], [3, 4]]);
    expect(csv).toBe('A;B\r\n1;2\r\n3;4');
  });
});

describe('Экспорт журнала занятий', () => {
  it('содержит заголовок и данные занятия', () => {
    const csv = sessionsToCsv([session()]);
    const [header, row] = csv.split('\r\n');

    expect(header.split(';')).toContain('Стабильность, %');
    expect(row).toContain('Артём Л.');
    expect(row).toContain('540');
    expect(row).toContain('завершено');
    expect(row).toContain('микрофон');
  });

  it('подставляет имя пациента, если в записи его нет', () => {
    const csv = sessionsToCsv([session({ childNickname: undefined })], 'Вера Н.');
    expect(csv).toContain('Вера Н.');
  });

  it('пустые метрики не превращаются в нули', () => {
    const csv = sessionsToCsv([session({ averageStability: null, averageBreathDuration: null })]);
    const row = csv.split('\r\n')[1].split(';');
    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
  });

  it('прерванное занятие и демо-режим подписаны по-русски', () => {
    const csv = sessionsToCsv([session({ status: 'stopped', inputMode: 'demo' })]);
    expect(csv).toContain('прервано');
    expect(csv).toContain('демо');
  });
});
