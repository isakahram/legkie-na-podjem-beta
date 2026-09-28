import { Activity, ArrowRight, CalendarCheck, Check, ChevronRight, ClipboardCheck, Search, ShieldCheck, Stethoscope, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Loading } from '../components/Loading';
import { SpecialistShell } from '../components/SpecialistShell';
import { api } from '../api';
import type { ClinicianChild } from '../types';

const authKey = 'legkie-clinician';

export function SpecialistPage() {
  const [authorized, setAuthorized] = useState(() => sessionStorage.getItem(authKey) === 'demo');
  if (!authorized) return <ClinicianLogin onLogin={() => { sessionStorage.setItem(authKey, 'demo'); setAuthorized(true); }} />;
  return <ClinicianDashboard />;
}

function ClinicianLogin({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="clinician-login">
      <header className="simple-header container"><Brand /><Link to="/" className="text-link">Открыть игру <ArrowRight size={18} /></Link></header>
      <section className="clinician-login__card">
        <div className="clinician-login__icon"><Stethoscope /></div>
        <div className="eyebrow">Кабинет специалиста</div>
        <h1>Данные занятий<br />уже собраны</h1>
        <p>Посмотрите регулярность, качество выдохов и динамику детей в одном месте.</p>
        <button className="button button--primary button--large button--wide" onClick={onLogin}>Войти в демо-кабинет <ArrowRight /></button>
        <small><ShieldCheck /> Демо-профили не содержат реальных персональных данных</small>
      </section>
      <div className="login-side-art"><span /><i /><b>94<em>%</em></b><small>занятия<br />по плану</small></div>
    </main>
  );
}

function ClinicianDashboard() {
  const [children, setChildren] = useState<ClinicianChild[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.clinicianChildren().then(setChildren).catch((caught) => setError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные')).finally(() => setLoading(false));
  }, []);

  const filtered = children.filter((child) => child.nickname.toLowerCase().includes(query.toLowerCase()) || child.code.toLowerCase().includes(query.toLowerCase()));
  const totals = useMemo(() => ({
    sessions: children.reduce((sum, child) => sum + child.summary.sessionsThisWeek, 0),
    targets: children.reduce((sum, child) => sum + child.summary.targetSessions, 0),
    correct: children.length ? Math.round(children.reduce((sum, child) => sum + child.summary.averageCorrectPercent, 0) / children.length) : 0,
    attention: children.filter((child) => child.summary.missedThisWeek > 0).length,
  }), [children]);

  return (
    <SpecialistShell>
      <header className="specialist-topbar"><div><small>Кабинет специалиста</small><b>Анна Викторовна</b></div><div className="doctor-avatar">АВ</div></header>
      <main className="dashboard-content">
        <section className="dashboard-title"><div><p>{new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><h1>Добрый день, Анна Викторовна</h1><span>Вот как проходят занятия на этой неделе.</span></div><div className="dashboard-title__status"><span /><div><b>Система работает</b><small>Последнее обновление: сейчас</small></div></div></section>
        {loading && <Loading label="Собираем сводку…" />}
        {error && <div className="panel-error">{error}</div>}
        {!loading && !error && <>
          <section className="kpi-grid">
            <Kpi icon={<Users />} tone="purple" label="Пациентов" value={String(children.length)} note="демо-профиля" />
            <Kpi icon={<CalendarCheck />} tone="green" label="Занятий за неделю" value={`${totals.sessions}/${totals.targets}`} note={`${Math.round(totals.sessions / Math.max(1, totals.targets) * 100)}% от плана`} />
            <Kpi icon={<Activity />} tone="blue" label="Качество выдоха" value={`${totals.correct}%`} note="среднее за период" />
            <Kpi icon={<ClipboardCheck />} tone="orange" label="Требуют внимания" value={String(totals.attention)} note="есть пропуски" />
          </section>
          <section className="dashboard-grid">
            <article className="panel weekly-overview">
              <div className="panel-heading"><div><h2>Выполнение плана</h2><p>Текущая неделя по пациентам</p></div><span className="trend-chip"><TrendingUp /> динамика</span></div>
              <div className="patient-bars">
                {children.map((child) => <div key={child.id} className="patient-bar"><span className="mini-avatar">{child.avatar}</span><div><b>{child.nickname}</b><i><em style={{ width: `${child.summary.adherencePercent}%` }} /></i></div><strong>{child.summary.sessionsThisWeek}<small> / {child.summary.targetSessions}</small></strong></div>)}
              </div>
              <div className="chart-legend"><span><i className="legend-purple" />Выполнено</span><span><i className="legend-gray" />План</span></div>
            </article>
            <article className="panel attention-panel"><div className="panel-heading"><div><h2>Фокус внимания</h2><p>Автоматическая сводка</p></div><span className="count-badge">{totals.attention}</span></div>
              {children.filter((child) => child.summary.missedThisWeek > 0).map((child) => <Link to={`/specialist/patient/${child.id}`} className="attention-item" key={child.id}><span className="mini-avatar">{child.avatar}</span><div><b>{child.nickname}</b><p>{child.summary.missedThisWeek === child.summary.targetSessions ? 'Нет занятий на этой неделе' : `Осталось ${child.summary.missedThisWeek} зан.`}</p></div><ChevronRight /></Link>)}
              <small className="validation-mini"><ShieldCheck /> Сводка справочная и требует проверки специалистом</small>
            </article>
          </section>
          <section className="panel patients-panel">
            <div className="panel-heading"><div><h2>Пациенты</h2><p>Краткая сводка по всем профилям</p></div><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или код" /></label></div>
            <div className="patient-table-wrap"><table className="patient-table"><thead><tr><th>Пациент</th><th>Код</th><th>Регулярность</th><th>Качество</th><th>Циклы</th><th>Последнее занятие</th><th /></tr></thead><tbody>
              {filtered.map((child) => <tr key={child.id}><td><span className="mini-avatar">{child.avatar}</span><div><b>{child.nickname}</b><small>{child.age} лет</small></div></td><td><code>{child.code}</code></td><td><span className={`status-pill ${child.summary.missedThisWeek ? 'status-pill--warn' : 'status-pill--good'}`}>{child.summary.sessionsThisWeek}/{child.summary.targetSessions} занятий</span></td><td><b>{child.summary.averageCorrectPercent}%</b></td><td>{child.summary.cycleCompletionPercent}%</td><td>{child.summary.lastSessionAt ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(child.summary.lastSessionAt)) : '—'}</td><td><Link aria-label={`Открыть карточку ${child.nickname}`} to={`/specialist/patient/${child.id}`}><ChevronRight /></Link></td></tr>)}
            </tbody></table></div>
          </section>
        </>}
      </main>
    </SpecialistShell>
  );
}

function Kpi({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  return <article className="kpi-card"><span className={`kpi-card__icon kpi-card__icon--${tone}`}>{icon}</span><div><small>{label}</small><b>{value}</b><p><Check /> {note}</p></div></article>;
}
