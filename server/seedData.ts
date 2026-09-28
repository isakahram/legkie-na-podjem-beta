import { DatabaseSync } from 'node:sqlite';
import { addDays, setHours, startOfWeek, subWeeks } from 'date-fns';
import { SKIN_CATALOG } from '../src/skins/catalog.ts';
import { hashPassword } from './auth.ts';

export function seedDatabase(db: DatabaseSync): void {
  // 1. Каталог скинов
  const skinStmt = db.prepare(
    'INSERT OR IGNORE INTO skins (id, name, color, accent, price) VALUES (?, ?, ?, ?, ?)',
  );
  SKIN_CATALOG.forEach((skin) => skinStmt.run(skin.id, skin.name, skin.color, skin.accent, skin.price));

  // 2. Организация
  db.prepare('INSERT OR IGNORE INTO organizations (id, name, created_at) VALUES (?, ?, ?)').run(
    'org-demo',
    'Детский пульмонологический центр',
    '2026-01-01T00:00:00.000Z',
  );

  // 3. Пользователи: admin, specialist, demo_specialist
  const userStmt = db.prepare(`
    INSERT OR IGNORE INTO users
      (id, email, password_hash, role, organization_id, created_at, display_name, clinic_name, contact_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Пароли по умолчанию для сида (в проде меняются при первом входе / инициализации)
  const adminHash = hashPassword('AdminPass123!');
  const doctorHash = hashPassword('DoctorPass123!');
  const demoHash = hashPassword('DemoPass123!');
  const specialistHash = hashPassword('SpecialistPass123!');
  const clinic = 'Детский пульмонологический центр';

  userStmt.run('user-admin', 'admin@legkie.local', adminHash, 'admin', 'org-demo', '2026-01-01T00:00:00.000Z', 'Администратор системы', clinic, 'admin@legkie.local');
  userStmt.run('user-doctor', 'doctor@legkie.local', doctorHash, 'specialist', 'org-demo', '2026-01-01T00:00:00.000Z', 'Анна Викторовна', clinic, 'doctor@legkie.local');
  userStmt.run('user-demo', 'demo@legkie.local', demoHash, 'demo_specialist', 'org-demo', '2026-01-01T00:00:00.000Z', 'Ознакомительный доступ', clinic, null);
  userStmt.run('user-maria', 'maria@legkie.local', specialistHash, 'specialist', 'org-demo', '2026-02-01T00:00:00.000Z', 'Мария Сергеевна Орлова', 'Детская клиника «Вдох»', 'maria@legkie.local');

  // Настройки специалиста
  db.prepare(`
    INSERT OR IGNORE INTO specialist_settings (id, user_id, default_thresholds_json, notification_prefs_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'settings-doctor',
    'user-doctor',
    JSON.stringify({ minBreathSeconds: 1.5, targetBreaths: 8, sessionsPerWeek: 3 }),
    JSON.stringify({ emailAlerts: true, weeklyReport: true }),
    '2026-01-01T00:00:00.000Z',
  );

  db.prepare(`
    INSERT OR IGNORE INTO specialist_settings (id, user_id, default_thresholds_json, notification_prefs_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'settings-maria',
    'user-maria',
    JSON.stringify({ minBreathSeconds: 1.5, targetBreaths: 8, sessionsPerWeek: 3 }),
    JSON.stringify({ emailAlerts: true, weeklyReport: true, missedDaysThreshold: 3, declineTrendPercent: -10 }),
    '2026-02-01T00:00:00.000Z',
  );

  // Legacy-врач для обратной совместимости
  db.prepare('INSERT OR IGNORE INTO clinicians (id, display_name) VALUES (?, ?)').run(
    'clinician-demo',
    'Анна Викторовна',
  );

  const existingPatients = (db.prepare('SELECT COUNT(*) AS count FROM patients').get() as { count: number }).count;
  if (existingPatients > 0) return;

  // 4. Существующие демо-пациенты из Этапа 1 (сохраняем в точности!)
  const legacyChildren = [
    { id: 'child-luna', code: 'ВЕТЕР7', nickname: 'Миша К.', age: 7, gender: 'male', avatar: 'МК', balance: 28, skin: 'berry', sessions: 3, breaths: 8, duration: 600, pattern: [3, 2, 3, 3, 1, 3, 4, 1] },
    { id: 'child-star', code: 'ЗВЕЗДА', nickname: 'Соня П.', age: 9, gender: 'female', avatar: 'СП', balance: 41, skin: 'ocean', sessions: 4, breaths: 6, duration: 600, pattern: [3, 4, 4, 3, 4, 4, 3, 1] },
    { id: 'child-rain', code: 'РАДУГА', nickname: 'Лёва М.', age: 6, gender: 'male', avatar: 'ЛМ', balance: 16, skin: 'sunny', sessions: 3, breaths: 10, duration: 600, pattern: [1, 2, 2, 3, 2, 3, 3, 1] },
    { id: 'child-cloud', code: 'ОБЛАКО', nickname: 'Новый участник', age: 7, gender: 'unspecified', avatar: 'ОБ', balance: 0, skin: 'berry', sessions: 3, breaths: 8, duration: 600, pattern: [0, 0, 0, 0, 0, 0, 0, 0] },
  ] as const;

  const insertPatientStmt = db.prepare(`
    INSERT INTO patients (id, pseudonym, age, gender, avatar, balance, selected_skin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCodeStmt = db.prepare(`
    INSERT INTO game_access_codes (id, patient_id, code, created_at, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
  const insertAssignStmt = db.prepare(`
    INSERT INTO assignment_versions (
      id, patient_id, created_by_user_id, sessions_per_week, target_breaths, min_completed_breath_seconds,
      target_breath_duration_min, target_breath_duration_max, valid_from, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSkinStmt = db.prepare(`
    INSERT OR IGNORE INTO patient_skins (patient_id, skin_id, unlocked_at)
    VALUES (?, ?, ?)
  `);
  const insertAccessStmt = db.prepare(`
    INSERT OR IGNORE INTO patient_access (id, user_id, patient_id, granted_at, granted_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSessionStmt = db.prepare(`
    INSERT INTO training_sessions (
      id, patient_id, started_at, duration_seconds, breath_count, average_strength,
      average_breath_duration, best_duration_seconds, average_stability, correct_breath_percent,
      completed_cycles, target_cycles, coins_collected, average_latency_ms, max_latency_ms,
      obstacles_avoided, bird_bumps, suspicious_events, status, input_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();

  // Добавляем 4 базовых детей
  legacyChildren.forEach((child, childIndex) => {
    insertPatientStmt.run(child.id, child.nickname, child.age, child.gender, child.avatar, child.balance, child.skin, '2026-01-01T00:00:00.000Z');
    insertCodeStmt.run(`code-${child.id}`, child.id, child.code, '2026-01-01T00:00:00.000Z');
    insertAssignStmt.run(
      `assign-${child.id}`,
      child.id,
      'user-doctor',
      child.sessions,
      child.breaths,
      1.5,
      2.0,
      4.0,
      '2026-01-01T00:00:00.000Z',
      'Базовое назначение',
      '2026-01-01T00:00:00.000Z',
    );
    insertSkinStmt.run(child.id, 'berry', '2026-01-01T00:00:00.000Z');
    if (child.skin !== 'berry') insertSkinStmt.run(child.id, child.skin, '2026-01-01T00:00:00.000Z');

    insertAccessStmt.run(`acc-doc-${child.id}`, 'user-doctor', child.id, '2026-01-01T00:00:00.000Z', 'user-admin');
    insertAccessStmt.run(`acc-demo-${child.id}`, 'user-demo', child.id, '2026-01-01T00:00:00.000Z', 'user-admin');

    // Сессии по паттерну Stage 1
    child.pattern.forEach((amount, patternIndex) => {
      const weeksAgo = 7 - patternIndex;
      const weekStart = startOfWeek(subWeeks(now, weeksAgo), { weekStartsOn: 1 });
      for (let sessionIndex = 0; sessionIndex < amount; sessionIndex += 1) {
        const date = setHours(addDays(weekStart, Math.min(sessionIndex * 2, 5)), 17);
        if (date > now) continue;
        const correct = Math.min(96, 68 + patternIndex * 3 + childIndex * 2 + sessionIndex);
        const targetCycles = child.breaths;
        const completedCycles = Math.max(3, targetCycles - ((sessionIndex + childIndex) % 3));
        const sessionId = `sess-leg-${child.id}-${patternIndex}-${sessionIndex}`;
        insertSessionStmt.run(
          sessionId,
          child.id,
          date.toISOString(),
          child.duration - 8 + sessionIndex * 3,
          completedCycles,
          0.52 + patternIndex * 0.025,
          2.1 + patternIndex * 0.12 + sessionIndex * 0.08,
          3.0 + patternIndex * 0.1,
          62 + patternIndex * 3 + sessionIndex,
          correct,
          completedCycles,
          targetCycles,
          4 + sessionIndex * 2,
          58 + sessionIndex * 3,
          96 + sessionIndex * 4,
          0,
          0,
          patternIndex < 2 && sessionIndex === 0 ? 1 : 0,
          'completed',
          'microphone',
        );
      }
    });
  });

  // 5. Новые 5 клинических сценариев (отдельные пациенты)
  const scenarios = [
    // 1. Стабильный прогресс
    {
      id: 'patient-progress',
      code: 'ВЫДОХ1',
      pseudonym: 'Тимофей Р.',
      age: 8,
      gender: 'male',
      avatar: 'ТР',
      balance: 48,
      skin: 'ocean',
      sessionsPerWeek: 3,
      targetBreaths: 8,
      scenario: 'progress',
    },
    // 2. Пропуски
    {
      id: 'patient-skips',
      code: 'ПОЛЕТ2',
      pseudonym: 'Алиса К.',
      age: 9,
      gender: 'female',
      avatar: 'АК',
      balance: 22,
      skin: 'berry',
      sessionsPerWeek: 4,
      targetBreaths: 8,
      scenario: 'skips',
    },
    // 3. Ухудшение динамики
    {
      id: 'patient-decline',
      code: 'НЕБО3',
      pseudonym: 'Максим Д.',
      age: 7,
      gender: 'male',
      avatar: 'МД',
      balance: 34,
      skin: 'mint',
      sessionsPerWeek: 3,
      targetBreaths: 10,
      scenario: 'decline',
    },
    // 4. Новичок
    {
      id: 'patient-newbie',
      code: 'ЛУЧИК4',
      pseudonym: 'Полина С.',
      age: 6,
      gender: 'female',
      avatar: 'ПС',
      balance: 6,
      skin: 'berry',
      sessionsPerWeek: 3,
      targetBreaths: 6,
      scenario: 'newbie',
    },
    // 5. Длительный перерыв
    {
      id: 'patient-break',
      code: 'ВЕТЕРОК5',
      pseudonym: 'Егор В.',
      age: 10,
      gender: 'male',
      avatar: 'ЕВ',
      balance: 40,
      skin: 'sunset',
      sessionsPerWeek: 3,
      targetBreaths: 8,
      scenario: 'break',
    },
  ] as const;

  scenarios.forEach((patient) => {
    insertPatientStmt.run(
      patient.id,
      patient.pseudonym,
      patient.age,
      patient.gender,
      patient.avatar,
      patient.balance,
      patient.skin,
      '2026-08-01T00:00:00.000Z',
    );
    insertCodeStmt.run(`code-${patient.id}`, patient.id, patient.code, '2026-08-01T00:00:00.000Z');
    insertAssignStmt.run(
      `assign-${patient.id}`,
      patient.id,
      'user-doctor',
      patient.sessionsPerWeek,
      patient.targetBreaths,
      1.5,
      2.0,
      4.0,
      '2026-08-01T00:00:00.000Z',
      `Назначение для сценария: ${patient.scenario}`,
      '2026-08-01T00:00:00.000Z',
    );
    insertSkinStmt.run(patient.id, 'berry', '2026-08-01T00:00:00.000Z');
    if (patient.skin !== 'berry') insertSkinStmt.run(patient.id, patient.skin, '2026-08-01T00:00:00.000Z');

    insertAccessStmt.run(`acc-doc-${patient.id}`, 'user-doctor', patient.id, '2026-08-01T00:00:00.000Z', 'user-admin');
    insertAccessStmt.run(`acc-demo-${patient.id}`, 'user-demo', patient.id, '2026-08-01T00:00:00.000Z', 'user-admin');

    // Генерация специфических профилей сессий за 8 недель
    for (let weekIdx = 0; weekIdx < 8; weekIdx += 1) {
      const weeksAgo = 7 - weekIdx;
      const weekStart = startOfWeek(subWeeks(now, weeksAgo), { weekStartsOn: 1 });

      if (patient.scenario === 'progress') {
        // Стабильный прогресс: 3 сессии каждую неделю, рост правильности (70->95), длительности (2.0->3.8), стабильности (60->88)
        for (let s = 0; s < 3; s += 1) {
          const date = weekIdx === 7
            ? setHours(weekStart, 9 + s * 4) // 09:00, 13:00, 17:00 понедельника текущей недели
            : setHours(addDays(weekStart, s * 2), 16);
          const avgDur = 2.0 + weekIdx * 0.25 + s * 0.05;
          const stability = 60 + weekIdx * 4 + s;
          const correct = 70 + weekIdx * 3.5 + s;
          insertSessionStmt.run(
            `sess-${patient.id}-${weekIdx}-${s}`,
            patient.id,
            date.toISOString(),
            500 + weekIdx * 10,
            patient.targetBreaths,
            0.55 + weekIdx * 0.03,
            avgDur,
            avgDur + 0.8,
            stability,
            Math.min(98, Math.round(correct)),
            patient.targetBreaths,
            patient.targetBreaths,
            6,
            50,
            90,
            0,
            0,
            0,
            'completed',
            'microphone',
          );
        }
      } else if (patient.scenario === 'skips') {
        // Пропуски: занимается нерегулярно (1-2 в неделю при плане 4), в текущей неделе 0, последняя сессия на прошлой неделе (> 3 дней назад)
        if (weekIdx < 7) {
          const count = weekIdx % 2 === 0 ? 2 : 1;
          for (let s = 0; s < count; s += 1) {
            const date = setHours(addDays(weekStart, s * 2), 15);
            insertSessionStmt.run(
              `sess-${patient.id}-${weekIdx}-${s}`,
              patient.id,
              date.toISOString(),
              450,
              patient.targetBreaths - 1,
              0.5,
              2.3,
              2.9,
              65,
              75,
              patient.targetBreaths - 1,
              patient.targetBreaths,
              4,
              60,
              110,
              0,
              0,
              0,
              'completed',
              'microphone',
            );
          }
        }
      } else if (patient.scenario === 'decline') {
        // Ухудшение динамики: первые 6 недель стабильно и хорошо (85-90%), week 6 — 70%, week 7 — 50%
        const count = weekIdx === 7 ? 2 : 3;
        for (let s = 0; s < count; s += 1) {
          const date = weekIdx === 7
            ? setHours(weekStart, 10 + s * 5)
            : setHours(addDays(weekStart, s * 2), 17);
          let correct = 88;
          let avgDur = 3.2;
          let stability = 80;
          if (weekIdx === 6) {
            correct = 70;
            avgDur = 2.4;
            stability = 65;
          } else if (weekIdx === 7) {
            correct = 50;
            avgDur = 1.6;
            stability = 45;
          }
          insertSessionStmt.run(
            `sess-${patient.id}-${weekIdx}-${s}`,
            patient.id,
            date.toISOString(),
            weekIdx === 7 ? 300 : 540,
            weekIdx === 7 ? 5 : patient.targetBreaths,
            weekIdx === 7 ? 0.35 : 0.65,
            avgDur,
            avgDur + 0.5,
            stability,
            correct,
            weekIdx === 7 ? 5 : patient.targetBreaths,
            patient.targetBreaths,
            weekIdx === 7 ? 2 : 5,
            75,
            130,
            0,
            0,
            0,
            'completed',
            'microphone',
          );
        }
      } else if (patient.scenario === 'newbie') {
        // Новичок: только в текущей неделе (weekIdx 7) 2 вводные сессии
        if (weekIdx === 7) {
          for (let s = 0; s < 2; s += 1) {
            const date = setHours(weekStart, 10 + s * 4);
            insertSessionStmt.run(
              `sess-${patient.id}-${weekIdx}-${s}`,
              patient.id,
              date.toISOString(),
              360,
              4,
              0.45,
              1.9,
              2.4,
              58,
              68,
              4,
              patient.targetBreaths,
              3,
              65,
              100,
              0,
              0,
              0,
              'completed',
              'microphone',
            );
          }
        }
      } else if (patient.scenario === 'break') {
        // Длительный перерыв: первые 4 недели (weekIdx 0..3) отличные сессии, затем 4 недели (weekIdx 4..7) — пусто
        if (weekIdx < 4) {
          for (let s = 0; s < 3; s += 1) {
            const date = setHours(addDays(weekStart, s * 2), 18);
            insertSessionStmt.run(
              `sess-${patient.id}-${weekIdx}-${s}`,
              patient.id,
              date.toISOString(),
              600,
              patient.targetBreaths,
              0.62,
              3.2,
              4.0,
              84,
              90,
              patient.targetBreaths,
              patient.targetBreaths,
              6,
              55,
              90,
              0,
              0,
              0,
              'completed',
              'microphone',
            );
          }
        }
      }
    }
  });

  // 6. Пациенты второго специалиста (Мария Сергеевна) — отдельный набор доступов.
  //    Нужен, чтобы изоляция через patient_access была видна и в интерфейсе, и в тестах.
  const mariaPatients = [
    { id: 'patient-maria-stable', code: 'ОБЛАКО6', pseudonym: 'Артём Л.', age: 8, gender: 'male', avatar: 'АЛ', balance: 52, skin: 'ocean', sessionsPerWeek: 3, targetBreaths: 8, weeks: [3, 3, 3, 3, 3, 3, 3, 2], baseStability: 76, baseBreath: 3.0, baseCorrect: 88, growth: 0.4 },
    { id: 'patient-maria-gap', code: 'ЛИСТИК7', pseudonym: 'Вера Н.', age: 7, gender: 'female', avatar: 'ВН', balance: 19, skin: 'berry', sessionsPerWeek: 4, targetBreaths: 8, weeks: [3, 3, 2, 3, 2, 1, 1, 0], baseStability: 64, baseBreath: 2.3, baseCorrect: 74, growth: 0.1 },
    { id: 'patient-maria-growth', code: 'КОМЕТА8', pseudonym: 'Кирилл Ж.', age: 10, gender: 'male', avatar: 'КЖ', balance: 61, skin: 'mint', sessionsPerWeek: 3, targetBreaths: 10, weeks: [1, 2, 2, 3, 3, 3, 4, 3], baseStability: 58, baseBreath: 2.0, baseCorrect: 68, growth: 1.1 },
    { id: 'patient-maria-start', code: 'ЗЕРНО9', pseudonym: 'Ника Т.', age: 6, gender: 'female', avatar: 'НТ', balance: 8, skin: 'sunny', sessionsPerWeek: 3, targetBreaths: 6, weeks: [0, 0, 0, 0, 0, 0, 2, 2], baseStability: 55, baseBreath: 1.8, baseCorrect: 65, growth: 0.6 },
  ] as const;

  const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

  mariaPatients.forEach((patient) => {
    insertPatientStmt.run(patient.id, patient.pseudonym, patient.age, patient.gender, patient.avatar, patient.balance, patient.skin, '2026-02-01T00:00:00.000Z');
    insertCodeStmt.run(`code-${patient.id}`, patient.id, patient.code, '2026-02-01T00:00:00.000Z');
    insertAssignStmt.run(
      `assign-${patient.id}`,
      patient.id,
      'user-maria',
      patient.sessionsPerWeek,
      patient.targetBreaths,
      1.5,
      2.0,
      4.0,
      '2026-02-01T00:00:00.000Z',
      'Назначение лечащего специалиста',
      '2026-02-01T00:00:00.000Z',
    );
    insertSkinStmt.run(patient.id, 'berry', '2026-02-01T00:00:00.000Z');
    if (patient.skin !== 'berry') insertSkinStmt.run(patient.id, patient.skin, '2026-02-01T00:00:00.000Z');

    // Доступ только у Марии: ни у user-doctor, ни у демо-пользователя его нет.
    insertAccessStmt.run(`acc-maria-${patient.id}`, 'user-maria', patient.id, '2026-02-01T00:00:00.000Z', 'user-admin');

    patient.weeks.forEach((count, weekIdx) => {
      const weekStart = startOfWeek(subWeeks(now, 7 - weekIdx), { weekStartsOn: 1 });
      for (let s = 0; s < count; s += 1) {
        const date = setHours(addDays(weekStart, s * 2), 16 + (s % 3));
        if (date > now) continue;
        const stability = clampPercent(patient.baseStability + weekIdx * patient.growth + s);
        const correct = clampPercent(patient.baseCorrect + weekIdx * patient.growth * 1.5 + s);
        const completed = Math.max(2, patient.targetBreaths - ((weekIdx + s) % 3));
        insertSessionStmt.run(
          `sess-${patient.id}-${weekIdx}-${s}`,
          patient.id,
          date.toISOString(),
          520 + weekIdx * 12 + s * 9,
          completed,
          0.5 + weekIdx * 0.01,
          Number((patient.baseBreath + weekIdx * 0.08 + s * 0.05).toFixed(2)),
          Number((patient.baseBreath + 0.9 + weekIdx * 0.1).toFixed(2)),
          stability,
          correct,
          completed,
          patient.targetBreaths,
          4 + s * 2,
          60 + s * 4,
          95 + s * 6,
          0,
          0,
          0,
          'completed',
          'microphone',
        );
      }
    });
  });
}
