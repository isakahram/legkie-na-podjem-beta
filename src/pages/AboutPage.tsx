import { ArrowLeft, CheckCircle2, LockKeyhole, Mic, ServerOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';

export function AboutPage() {
  return (
    <main className="info-page">
      <header className="simple-header container"><Brand /><Link to="/" className="text-link"><ArrowLeft size={18} /> Назад</Link></header>
      <section className="info-card container-narrow">
        <div className="eyebrow"><LockKeyhole size={18} /> Приватность по умолчанию</div>
        <h1>Мы не записываем голос</h1>
        <p className="lead">Микрофон нужен только во время калибровки и игры. Сырые записи не создаются и никуда не отправляются.</p>
        <div className="privacy-grid">
          <article><Mic /><h2>На устройстве</h2><p>Браузер вычисляет громкость и характеристики спектра в коротких кадрах.</p></article>
          <article><ServerOff /><h2>Без аудиофайлов</h2><p>На сервер уходят только итоговые числа сессии: длительность, выдохи и игровые результаты.</p></article>
          <article><CheckCircle2 /><h2>Можно повторить</h2><p>Если проверка ошиблась, ребёнок может спокойно откалибровать микрофон заново.</p></article>
        </div>
        <div className="validation-callout"><b>Важно:</b> алгоритм распознавания — MVP и <strong>требует валидации</strong> на репрезентативных данных. Сервис не ставит диагноз и не заменяет медицинское решение.</div>
      </section>
    </main>
  );
}
