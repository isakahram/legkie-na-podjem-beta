# Архитектура и потоки данных платформы «Лёгкие на подъём»

## Общая схема системы

```mermaid
flowchart TD
  subgraph ClientApp ["Клиентское приложение (React PWA)"]
    subgraph ChildContour ["Игровой контур ребёнка"]
      AudioPipeline["Web Audio Pipeline\n(FFT / RMS / ZCR / Centroid)"]
      Classifier["Sound Classifier\n(edge audio features)"]
      GameEngine["2D Game Engine\n(управление шаром, сбор монет)"]
      ChildUI["Игровой интерфейс\n(HUD, результат, магазин скинов)"]
    end

    subgraph SpecialistContour ["Контур кабинета специалиста"]
      AuthModule["Авторизация & Сессии\n(email/пароль, демо-вход)"]
      SpecialistUI["Кабинет врача / Дашборд\n(динамика, назначение целей, аудит)"]
    end
  end

  subgraph ServerApp ["Серверный контур (Node.js / Express API)"]
    AuthMiddleware["Auth & RBAC Middleware\n(Cookie parser, Token hash, Rate Limit)"]
    AccessControl["Patient Access Checker\n(Изоляция 403, Demo Read-Only)"]
    ApiV1["API v1 Endpoints\n(/api/v1/auth, /api/v1/patients, /api/v1/assignments)"]
    LegacyApi["Игровое API & Совместимость\n(/api/child/*, /api/sessions, /api/shop/*)"]
    AuditLogger["Audit Event Logger\n(Действия без PII)"]
    AnalyticsEngine["Analytics Engine\n(KPI, тренды, 8 недель)"]
  end

  subgraph Storage ["Слой хранения (SQLite -> PostgreSQL Ready)"]
    Migrations["schema_migrations\n(Идемпотентные миграции)"]
    UsersDB["users, organizations, auth_sessions, specialist_settings"]
    PatientsDB["patients, game_access_codes, calibrations, skins, patient_skins"]
    ClinicalDB["assignment_versions, training_sessions, patient_access, audit_events, report_snapshots"]
  end

  AudioPipeline -->|1. Числовые признаки кадра| Classifier
  Classifier -->|2. Классификация выдоха| GameEngine
  GameEngine -->|3. Прогресс и монеты| ChildUI
  ChildUI -->|4. Агрегаты сессии POST /api/sessions| LegacyApi

  AuthModule -->|POST /api/v1/auth/login| AuthMiddleware
  SpecialistUI -->|Запросы с httpOnly Cookie| AuthMiddleware
  AuthMiddleware --> AccessControl
  AccessControl --> ApiV1
  ApiV1 --> AnalyticsEngine
  ApiV1 --> AuditLogger

  LegacyApi --> Storage
  ApiV1 --> Storage
  AuditLogger --> ClinicalDB
```

---

## Компоненты системы

1. **React 19 PWA** — единая SPA-поставка:
   - Контур ребёнка: калибровка, 2D-игра, магазин скинов и автовыдача достижений;
   - Контур специалиста: авторизация, демо-режим, карточки пациентов, назначения, динамика.
2. **Web Audio Pipeline (Edge / Client-Side)**:
   - Обработка аудиопотока в реальном времени исключительно в памяти браузера (`Float32Array`);
   - Извлечение 5 числовых признаков: RMS, ZCR, спектральный центроид, спектральная плоскостность, crest factor;
   - **Сырое аудио не сохраняется и не передаётся на сервер.**
3. **Игровой движок**:
   - 2D-физика движения шара в процентах viewport, отрисовка через DOM/CSS;
   - Управление по целевому выдоху (`targetBreaths`), генерация волн облаков и сбор монет;
   - Защита от накрутки: демо-сессии не дают монет и не влияют на клинические KPI.
4. **Express API**:
   - **API v1**: безопасность, сессии на httpOnly cookie, изоляция пациентов (`patient_access`), RBAC (`admin`, `specialist`, `demo_specialist`), версионируемые назначения (`assignment_versions`), аудит-лог (`audit_events`);
   - **Игровой API**: обратная совместимость для входа ребёнка по коду, сохранения калибровок и сессий.
5. **Слой данных (SQLite с готовностью к PostgreSQL)**:
   - Идемпотентные миграции через `schema_migrations`;
   - Строгая изоляция персональных данных (псевдонимизация);
   - Реляционная схема из 14 нормализованных таблиц.

---

## Граница аудиоданных и приватность

```text
Микрофон ребёнка (MediaStream)
  │
  ▼
[AnalyserNode (FFT 2048)]
  │
  ▼
[Float32Array кадр (в RAM)] ──(вычисление признаков)──> AudioFeatures { rms, zcr, centroid, flatness }
  │                                                              │
  ▼ (уничтожается GC)                                            ▼
[Сырой звук стёрт]                                    [SoundClassification: kind, strength]
                                                                 │
                                                                 ▼
                                                      [2D Engine & Агрегаты занятия]
                                                                 │
                                                                 ▼ (только агрегаты сессии)
                                                      [POST /api/sessions: duration, avgStrength, stability]
```

---

## Архитектура изоляции и безопасности (RBAC)

| Роль | Права | Ограничения |
|---|---|---|
| `admin` | Управление организациями, создание специалистов, полный аудит | Не имеет прямого отношения к игровому контуру ребёнка |
| `specialist` | Просмотр только своих пациентов (`patient_access`), создание версий назначений (`assignment_versions`), смена своего пароля | Ответ `403 Forbidden` при попытке доступа к чужому пациенту |
| `demo_specialist` | Просмотр синтетических демо-профилей (5 сценариев) | **Строго Read-Only**: любые мутации (`POST`, `PUT`, `DELETE`, `PATCH`) блокируются с кодом `403` |

Все действия пользователей (вход, выход, просмотр карточки, создание назначения, неудачные попытки) фиксируются в `audit_events` без включения персональных данных (ПДн) в поле `details`.
