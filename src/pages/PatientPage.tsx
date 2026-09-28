import { Activity, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, Download, Info, Search, Target, TrendingDown, TrendingUp, Wind } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Loading } from '../components/Loading';
import { SpecialistShell } from '../components/SpecialistShell';
import type { PatientDetail, SessionRecord, WeeklyPoint } from '../types';

type Period = '30' | '90' | 'all';
type Mode = 'all' | 'microphone' | 'demo';

export function PatientPage() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('90');
  const [mode, setMode] = useState<Mode>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.patientDetail(id).then(setDetail).catch((caught) => setError(caught instanceof Error ? caught.message : 'Не удалось загрузить карточку'));
  }, [id]);

  const filtered = useMemo(() => detail?.sessions.filter((session) => {
    const periodOk = period === 'all' || new Date(session.startedAt).getTime() >= Date.now() - Number(period) * 86_400_000;
    const modeOk = mode === 'all' || session.inputMode === mode;
    const searchOk = !search || new Intl.DateTimeFormat('ru').format(new Date(session.startedAt)).includes(search);
    return periodOk && modeOk && searchOk;
  }) ?? [], [detail, mode, period, search]);

  if (error) return <SpecialistShell patientActive><div className="panel-error page-error">{error}<Link to="/specialist">Вернуться</Link></div></SpecialistShell>;
  if (!detail) return <SpecialistShell patientActive><Loading label="Открываем карточку…" /></SpecialistShell>;
  const { child, weekly } = detail;

  return (
    <SpecialistShell patientActive>
      <header className="specialist-topbar"><Link to="/specialist" className="back-link"><ArrowLeft /> Все пациенты</Link><div className="doctor-avatar">АВ</div></header>
      <main className="patient-content">
        <section className="patient-hero"><span className="patient-avatar">{child.avatar}</span><div><span className="status-pill status-pill--good"><i /> Активен</span><h1>{child.nickname}</h1><p>{child.age} лет · Код <code>{child.code}</code></p></div><div className="assignment-summary"><small>Текущая цель</small><b>{child.assignment.sessionsPerWeek} занятия в неделю</b><span>{child.assignment.targetBreaths} циклов · ~{child.assignment.recommendedDurationSeconds} сек</span></div></section>
        <section className="patient-kpis">
          <Metric icon={<CalendarDays />} label="Регулярность" value={`${child.summary.sessionsThisWeek}/${child.summary.targetSessions}`} note={child.summary.missedThisWeek ? `Осталось ${child.summary.missedThisWeek}` : 'План выполнен'} good={!child.summary.missedThisWeek} />
          <Metric icon={<CheckCircle2 />} label="Правильность" value={`${child.summary.averageCorrectPercent}%`} note={`${child.summary.trendPercent >= 0 ? '+' : ''}${child.summary.trendPercent}% к прошлой неделе`} good={child.summary.trendPercent >= 0} />
          <Metric icon={<Wind />} label="Средний выдох" value={child.summary.averageBreathDuration === null ? '—' : `${child.summary.averageBreathDuration} c`} note="по завершённым выдохам" good />
          <Metric icon={<Target />} label="Выполнение выдохов" value={`${child.summary.cycleCompletionPercent ?? child.summary.breathCompletionPercent}%`} note="за весь период" good={(child.summary.cycleCompletionPercent ?? child.summary.breathCompletionPercent) >= 75} />
        </section>
        <section className="patient-charts">
          <article className="panel chart-panel"><div className="panel-heading"><div><h2>Регулярность занятий</h2><p>Количество завершённых сессий по неделям</p></div><span className="legend-target">— план {child.assignment.sessionsPerWeek}</span></div><SessionsChart points={weekly} /></article>
          <article className="panel chart-panel"><div className="panel-heading"><div><h2>Качество выдоха</h2><p>Доля звука, похожего на калибровочный выдох</p></div><span className="validation-tag"><Info /> требует валидации</span></div><QualityChart points={weekly} /></article>
        </section>
        <section className="panel auto-summary">
          <span className="auto-summary__icon"><Activity /></span><div><div className="eyebrow">Автоматическая сводка</div><h2>{summaryTitle(child.summary.missedThisWeek, child.summary.trendPercent)}</h2><p>{summaryText(child.summary.missedThisWeek, child.summary.trendPercent, child.summary.averageBreathDuration)}</p><small>Сводка рассчитана по производным метрикам и не является медицинским заключением — <b>требует валидации специалистом.</b></small></div>
        </section>
        <section className="panel sessions-panel">
          <div className="panel-heading sessions-heading"><div><h2>История занятий</h2><p>{filtered.length} сессий с учётом фильтров</p></div><div className="table-actions">
            <label className="search-field search-field--small"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Дата" /></label>
            <label className="select-field"><select value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="30">30 дней</option><option value="90">90 дней</option><option value="all">Всё время</option></select><ChevronDown /></label>
            <label className="select-field"><select value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="all">Все режимы</option><option value="microphone">Микрофон</option><option value="demo">Демо</option></select><ChevronDown /></label>
            <button className="button button--outline button--small" onClick={() => exportCsv(filtered, child.nickname)}><Download /> CSV</button>
          </div></div>
          <div className="patient-table-wrap"><table className="session-table"><thead><tr><th>Дата и время</th><th>Длительность</th><th>Выдохи</th><th>Ср. выдох</th><th>Правильность</th><th>Циклы</th><th>Монеты</th><th>Ровность</th></tr></thead><tbody>
            {filtered.map((session) => <tr key={session.id}><td><b>{formatDate(session.startedAt)}</b><small>{formatTime(session.startedAt)} {session.inputMode === 'demo' && <em>демо</em>}</small></td><td>{formatDuration(session.durationSeconds)}</td><td>{session.breathCount}</td><td>{session.averageBreathDuration === null ? '—' : `${session.averageBreathDuration.toFixed(1)} с`}</td><td><span className={`quality-value ${session.correctBreathPercent >= 80 ? 'quality-value--good' : 'quality-value--warn'}`}>{Math.round(session.correctBreathPercent)}%</span></td><td>{session.completedBreaths ?? session.completedCycles ?? 0}/{session.targetBreaths ?? session.targetCycles ?? 0}</td><td>{session.coinsCollected}</td><td>{session.averageStability === null ? <span className="ok-check">—</span> : <span className={`quality-value ${session.averageStability >= 70 ? 'quality-value--good' : 'quality-value--warn'}`}>{session.averageStability}</span>}</td></tr>)}
            {!filtered.length && <tr><td colSpan={8}><div className="empty-table">Нет сессий по выбранным фильтрам</div></td></tr>}
          </tbody></table></div>
          <div className="table-footnote"><Info /> Ровность дыхания рассчитывается по производной формуле и <b>требует валидации</b>. Прочерк — метрика недоступна для этой записи.</div>
        </section>
      </main>
    </SpecialistShell>
  );
}

function Metric({ icon, label, value, note, good }: { icon: React.ReactNode; label: string; value: string; note: string; good: boolean }) {
  return <article className="patient-metric"><span>{icon}</span><div><small>{label}</small><b>{value}</b><p className={good ? 'positive' : 'warning'}>{good ? <TrendingUp /> : <TrendingDown />}{note}</p></div></article>;
}

function SessionsChart({ points }: { points: WeeklyPoint[] }) {
  const max = Math.max(5, ...points.map((point) => Math.max(point.sessions, point.target)));
  return <div className="bar-chart"><div className="chart-y"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="bar-chart__plot"><div className="target-line" style={{ bottom: `${(points[0]?.target ?? 0) / max * 100}%` }} />{points.map((point) => <div className="bar-column" key={point.week}><div className="bar" style={{ height: `${point.sessions / max * 100}%` }}><span>{point.sessions}</span></div><small>{point.label}</small></div>)}</div></div>;
}

function QualityChart({ points }: { points: WeeklyPoint[] }) {
  const coordinates = points.map((point, index) => `${8 + index * 12},${92 - point.averageCorrect * 0.72}`).join(' ');
  return <div className="line-chart"><svg viewBox="0 0 100 100" role="img" aria-label="Динамика правильности выдоха"><defs><linearGradient id="quality-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a4fcf" stopOpacity=".28"/><stop offset="1" stopColor="#5a4fcf" stopOpacity="0"/></linearGradient></defs><path d={`M ${coordinates.replaceAll(',', ' L ')} L 92 94 L 8 94 Z`} fill="url(#quality-area)" /><polyline points={coordinates} fill="none" stroke="#5a4fcf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{points.map((point, index) => <circle key={point.week} cx={8 + index * 12} cy={92 - point.averageCorrect * 0.72} r="2.6" fill="white" stroke="#5a4fcf" strokeWidth="2" />)}</svg><div className="line-chart__labels">{points.map((point) => <small key={point.week}>{point.label}</small>)}</div></div>;
}

function summaryTitle(missed: number, trend: number): string {
  if (missed > 1) return 'Регулярность ниже недельного плана';
  if (trend > 4) return 'Качество выдоха растёт';
  return 'Показатели стабильны';
}
function summaryText(missed: number, trend: number, duration: number | null): string {
  const value = duration === null ? 'нет данных' : `${duration} сек`;
  if (missed > 1) return `За эту неделю пропущено ${missed} занятия. Средняя продолжительность выдоха — ${value}.`;
  return `Средняя продолжительность выдоха — ${value}. Недельная динамика правильности: ${trend >= 0 ? '+' : ''}${trend}%.`;
}
const formatDate = (date: string) => new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
const formatTime = (date: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function exportCsv(sessions: SessionRecord[], nickname: string) {
  const header = ['Дата', 'Длительность, сек', 'Выдохи', 'Средний выдох, сек', 'Ровность', 'Правильность, %', 'Циклы', 'Цель', 'Монеты', 'Режим'];
  const rows = sessions.map((session) => [session.startedAt, session.durationSeconds, session.breathCount, session.averageBreathDuration?.toFixed(2) ?? '', session.averageStability ?? '', session.correctBreathPercent.toFixed(1), session.completedBreaths ?? session.completedCycles ?? 0, session.targetBreaths ?? session.targetCycles ?? 0, session.coinsCollected, session.inputMode]);
  const escape = (value: string | number | undefined) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(escape).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sessions-${nickname.replaceAll(' ', '-')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
