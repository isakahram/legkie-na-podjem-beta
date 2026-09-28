# Модель данных платформы «Лёгкие на подъём» (Этап 2.1)

Схема спроектирована с учётом нормализации и лёгкого перехода с SQLite на PostgreSQL без изменения контрактов публичного API.

---

## 1. Реестр миграций

### `schema_migrations`
Таблица фиксации применённых версий схемы.
* `version` `INTEGER PRIMARY KEY` — порядковый номер миграции (1, 2, ...);
* `name` `TEXT NOT NULL` — наименование миграции (`001_specialist_cabinet_data_model`);
* `applied_at` `TEXT NOT NULL` — дата и время применения в формате ISO 8601 (UTC).

---

## 2. Пользователи, организации и доступ

### `organizations`
Организации (клиники, медицинские центры), к которым прикреплены специалисты.
* `id` `TEXT PRIMARY KEY` — UUID организации;
* `name` `TEXT NOT NULL` — официальное наименование организации;
* `created_at` `TEXT NOT NULL` — дата добавления.

### `users`
Специалисты, администраторы и демо-пользователи.
* `id` `TEXT PRIMARY KEY` — UUID пользователя;
* `email` `TEXT UNIQUE NOT NULL` — электронная почта для авторизации (индексировано);
* `password_hash` `TEXT NOT NULL` — хэш пароля `scrypt` в формате `salt:hash` (16 байт соль + 64 байта ключ);
* `role` `TEXT NOT NULL CHECK(role IN ('admin', 'specialist', 'demo_specialist'))` — роль в системе;
* `organization_id` `TEXT REFERENCES organizations(id) ON DELETE SET NULL` — привязка к организации;
* `created_at` `TEXT NOT NULL` — дата создания аккаунта;
* `last_login_at` `TEXT` — дата последнего успешного входа (NULL до первого входа).

### `auth_sessions`
Активные серверные сессии авторизации (привязаны к httpOnly cookie).
* `id` `TEXT PRIMARY KEY` — UUID сессии;
* `user_id` `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE` — владелец сессии;
* `token_hash` `TEXT UNIQUE NOT NULL` — SHA-256 хэш случайного 32-байтного токена;
* `expires_at` `TEXT NOT NULL` — дата истечения срока жизни сессии (по умолчанию 7 суток);
* `created_at` `TEXT NOT NULL` — дата создания сессии;
* `last_active_at` `TEXT NOT NULL` — дата последней активности пользователя;
* `user_agent` `TEXT` — заголовок User-Agent клиента;
* `ip` `TEXT` — IP-адрес клиента при создании сессии.

### `patient_access`
Связь «специалист ↔ пациент» для обеспечения серверной изоляции данных.
* `id` `TEXT PRIMARY KEY` — UUID записи доступа;
* `user_id` `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE` — специалист;
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — пациент;
* `granted_at` `TEXT NOT NULL` — дата выдачи доступа;
* `granted_by_user_id` `TEXT REFERENCES users(id) ON DELETE SET NULL` — кто выдал доступ (администратор);
* `UNIQUE(user_id, patient_id)` — исключение дублирования прав.

### `audit_events`
Журнал безопасности и клинического аудита действий специалистов.
* `id` `TEXT PRIMARY KEY` — UUID события аудита;
* `user_id` `TEXT REFERENCES users(id) ON DELETE SET NULL` — инициатор действия;
* `action` `TEXT NOT NULL` — тип события (`login`, `logout`, `view_patient_detail`, `create_assignment`, `failed_login_attempt` и др.);
* `resource_type` `TEXT NOT NULL` — тип затронутого ресурса (`patient`, `auth`, `assignment`, `user`);
* `resource_id` `TEXT` — ID ресурса (ID пациента, ID назначения и т.д.);
* `details` `TEXT` — не содержащие персональных данных метаданные (JSON);
* `ip` `TEXT` — IP-адрес запроса;
* `created_at` `TEXT NOT NULL` — метка времени события.

### `specialist_settings`
Индивидуальные настройки рабочего места специалиста.
* `id` `TEXT PRIMARY KEY` — UUID настройки;
* `user_id` `TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE` — ID специалиста;
* `default_thresholds_json` `TEXT` — значения порогов выдоха по умолчанию для новых назначений;
* `notification_prefs_json` `TEXT` — предпочтения по оповещениям;
* `updated_at` `TEXT NOT NULL` — дата последнего изменения.

---

## 3. Пациенты и игровой процесс

### `patients`
Профили пациентов. Не содержат ФИО, даты рождения, диагнозов и контактов родителей (принцип минимизации 152-ФЗ).
* `id` `TEXT PRIMARY KEY` — UUID / строковый ID пациента;
* `pseudonym` `TEXT NOT NULL` — псевдоним пациента (например, «Миша К.», «Тимофей Р.»);
* `age` `INTEGER NOT NULL CHECK(age BETWEEN 3 AND 17)` — возраст ребёнка;
* `gender` `TEXT CHECK(gender IN ('male', 'female', 'unspecified'))` — пол (справочно для калибровочных норм);
* `avatar` `TEXT NOT NULL` — двухбуквенная плашка аватара (например, «МК», «СП»);
* `balance` `INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0)` — баланс собранных в игре монет;
* `selected_skin` `TEXT NOT NULL DEFAULT 'berry'` — текущий выбранный скин шара;
* `created_at` `TEXT NOT NULL` — дата регистрации профиля.

### `game_access_codes`
Короткие коды для входа ребёнка в игру без пароля.
* `id` `TEXT PRIMARY KEY` — UUID записи;
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — ID пациента;
* `code` `TEXT UNIQUE NOT NULL` — буквенно-цифровой код (например, «ВЕТЕР7», «ВЫДОХ1»);
* `created_at` `TEXT NOT NULL` — дата создания кода;
* `is_active` `INTEGER NOT NULL DEFAULT 1` — статус активности кода.

### `calibrations`
Параметры последней калибровки микрофона (только производные акустические признаки).
* `id` `TEXT PRIMARY KEY` — UUID калибровки;
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — ID пациента;
* `ambient_rms` `REAL NOT NULL` — уровень фонового шума;
* `breath_rms` `REAL NOT NULL` — целевой уровень звука выдоха;
* `breath_zcr` `REAL NOT NULL` — плотность пересечений нуля;
* `breath_centroid` `REAL NOT NULL` — спектральный центроид;
* `breath_flatness` `REAL NOT NULL` — спектральная плоскостность;
* `quality` `REAL NOT NULL` — показатель качества калибровки (0.0..1.0);
* `created_at` `TEXT NOT NULL` — дата проведения калибровки.

### `skins`
Каталог скинов (синхронизирован с `src/skins/catalog.ts`).
* `id` `TEXT PRIMARY KEY` — идентификатор скина (`berry`, `ocean`, `glow` и т.д.);
* `name` `TEXT NOT NULL` — отображаемое название скина;
* `color` `TEXT NOT NULL` — HEX-код основного цвета;
* `accent` `TEXT NOT NULL` — HEX-код акцентного цвета;
* `price` `INTEGER NOT NULL` — цена в монетах (0 для бесплатных и прогресс-эффектов).

### `patient_skins`
Открытые пациентом образы шара (покупки и автовыдачи за достижения).
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — ID пациента;
* `skin_id` `TEXT NOT NULL REFERENCES skins(id) ON DELETE CASCADE` — ID скина;
* `unlocked_at` `TEXT NOT NULL` — дата и время разблокировки;
* `PRIMARY KEY (patient_id, skin_id)` — составной ключ.

---

## 4. Клинические назначения и сессии

### `assignment_versions`
Версионируемые назначения специалиста. Хранят полную историю изменений целей.
* `id` `TEXT PRIMARY KEY` — UUID назначения;
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — ID пациента;
* `created_by_user_id` `TEXT REFERENCES users(id) ON DELETE SET NULL` — специалист, создавший версию;
* `sessions_per_week` `INTEGER NOT NULL CHECK(sessions_per_week BETWEEN 1 AND 7)` — целевое число занятий в неделю;
* `target_breaths` `INTEGER NOT NULL CHECK(target_breaths BETWEEN 4 AND 30)` — целевое количество глубоких выдохов за сессию;
* `min_completed_breath_seconds` `REAL NOT NULL DEFAULT 1.5` — минимальная длительность для зачёта выдоха;
* `target_breath_duration_min` `REAL` — нижняя граница рекомендуемой длительности выдоха (сек);
* `target_breath_duration_max` `REAL` — верхняя граница рекомендуемой длительности выдоха (сек);
* `valid_from` `TEXT NOT NULL` — дата начала действия версии назначения;
* `valid_until` `TEXT` — дата окончания действия (NULL для текущей активной);
* `note` `TEXT` — клинический комментарий специалиста;
* `created_at` `TEXT NOT NULL` — дата создания записи.

### `training_sessions`
Журнал выполненных тренировочных сессий.
* `id` `TEXT PRIMARY KEY` — UUID сессии;
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — ID пациента;
* `started_at` `TEXT NOT NULL` — дата и время начала занятия;
* `duration_seconds` `INTEGER NOT NULL` — общая длительность сессии в секундах;
* `breath_count` `INTEGER NOT NULL` — количество распознанных попыток выдоха;
* `average_strength` `REAL NOT NULL` — средняя сила выдоха;
* `average_breath_duration` `REAL` — средняя длительность зачтённых выдохов (сек) или NULL;
* `best_duration_seconds` `REAL` — максимальная длительность выдоха за занятие или NULL;
* `average_stability` `REAL` — средняя стабильность выдоха (%) или NULL;
* `correct_breath_percent` `REAL NOT NULL` — процент корректных выдохов;
* `completed_cycles` `INTEGER NOT NULL` — количество выполненных целевых выдохов;
* `target_cycles` `INTEGER NOT NULL` — назначенная цель по выдохам;
* `coins_collected` `INTEGER NOT NULL` — заработанные монеты;
* `average_latency_ms` `REAL` — средняя задержка старта выдоха или NULL;
* `max_latency_ms` `REAL` — максимальная задержка или NULL;
* `obstacles_avoided` `INTEGER DEFAULT 0` — колонка миграционной совместимости;
* `bird_bumps` `INTEGER DEFAULT 0` — колонка миграционной совместимости;
* `suspicious_events` `INTEGER NOT NULL DEFAULT 0` — число пауз и помех;
* `status` `TEXT NOT NULL CHECK(status IN ('completed', 'stopped'))` — статус завершения;
* `input_mode` `TEXT NOT NULL CHECK(input_mode IN ('microphone', 'demo'))` — режим ввода.

### `report_snapshots`
Сформированные снимки отчётов для архивации и экспорта.
* `id` `TEXT PRIMARY KEY` — UUID снимка отчёта;
* `patient_id` `TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE` — ID пациента;
* `created_by_user_id` `TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — специалист;
* `period_start` `TEXT NOT NULL` — дата начала периода;
* `period_end` `TEXT NOT NULL` — дата окончания периода;
* `data_json` `TEXT NOT NULL` — агрегированные показатели и графики в JSON;
* `created_at` `TEXT NOT NULL` — дата генерации отчёта.
