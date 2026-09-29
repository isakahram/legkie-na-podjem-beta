import type { PatientListItemWithAttention, ReportSummary } from '../../types';
import { formatAge, formatDate, formatDateTime, formatDuration, formatPercent, formatSeconds } from './format';

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/** Строит самостоятельную HTML-страницу, которую можно сохранить через системный диалог печати. */
export function buildPrintableReportHtml(
  patient: PatientListItemWithAttention,
  report: ReportSummary,
): string {
  const weeklyRows = report.weekly
    .map(
      (point) => `
        <tr>
          <td>${escapeHtml(point.label)}</td>
          <td>${point.sessions}</td>
          <td>${point.target}</td>
          <td>${point.breaths}</td>
          <td>${formatPercent(point.averageCorrect)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <title>Отчёт — ${escapeHtml(patient.pseudonym)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, Arial, sans-serif; }
      body { color: #172033; margin: 0 auto; max-width: 860px; padding: 40px; }
      h1 { margin: 0 0 6px; font-size: 28px; }
      h2 { border-bottom: 1px solid #d8deea; font-size: 18px; margin: 28px 0 10px; padding-bottom: 7px; }
      p { color: #566176; margin: 5px 0; }
      .meta { color: #566176; font-size: 13px; margin-bottom: 24px; }
      .grid { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
      .metric { background: #f3f6fb; border-radius: 8px; padding: 13px; }
      .metric b, .metric span { display: block; }
      .metric span { color: #566176; font-size: 12px; margin-bottom: 5px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border-bottom: 1px solid #e4e8f0; padding: 8px 6px; text-align: left; }
      th { color: #566176; font-size: 12px; font-weight: 600; }
      .note { border-left: 3px solid #e2a93b; color: #566176; font-size: 12px; margin-top: 28px; padding: 5px 12px; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style>
  </head>
  <body>
    <header>
      <h1>Отчёт по занятиям</h1>
      <p><strong>${escapeHtml(patient.pseudonym)}</strong> · ${escapeHtml(formatAge(patient.age))}</p>
      <p class="meta">Период: ${escapeHtml(formatDate(report.periodStart))} — ${escapeHtml(formatDate(report.periodEnd))}<br>
        Сформирован: ${escapeHtml(formatDateTime(new Date()))}</p>
    </header>

    <section class="grid" aria-label="Итоговые показатели">
      <div class="metric"><span>Занятий</span><b>${report.sessions}</b></div>
      <div class="metric"><span>Средняя регулярность</span><b>${escapeHtml(formatPercent(report.averageAdherencePercent))}</b></div>
      <div class="metric"><span>Средняя длительность занятия</span><b>${escapeHtml(formatDuration(report.averageSessionDuration))}</b></div>
      <div class="metric"><span>Средняя длительность выдоха</span><b>${escapeHtml(formatSeconds(report.averageBreathDuration))}</b></div>
      <div class="metric"><span>Стабильность</span><b>${escapeHtml(formatPercent(report.averageStability))}</b></div>
      <div class="metric"><span>Выдохов всего</span><b>${report.totalBreaths}</b></div>
    </section>

    <h2>Динамика по неделям</h2>
    <table>
      <thead><tr><th>Неделя</th><th>Занятий</th><th>План</th><th>Выдохов</th><th>Правильность</th></tr></thead>
      <tbody>${weeklyRows || '<tr><td colspan="5">Нет данных за период</td></tr>'}</tbody>
    </table>

    <p class="note">Показатели длительности и стабильности рассчитаны по игровым звуковым признакам и требуют валидации специалистом. Отчёт не является медицинским заключением.</p>
  </body>
</html>`;
}

/** Открывает печатную версию отчёта; в системном диалоге её можно сохранить как PDF. */
export function openPrintableReport(
  patient: PatientListItemWithAttention,
  report: ReportSummary,
): void {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(buildPrintableReportHtml(patient, report));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
