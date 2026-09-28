# Спецификация REST API платформы «Лёгкие на подъём»

Базовый префикс актуального API: `/api/v1`  
Формат данных: `JSON` (Content-Type: `application/json; charset=utf-8`)  
Аутентификация: Cookie `legkie_session` (httpOnly) или заголовок `Authorization: Bearer <token>`.

---

## 1. Аутентификация и сессии

### `POST /api/v1/auth/login`
Вход специалиста или администратора в систему.

**Тело запроса:**
```json
{
  "email": "doctor@legkie.local",
  "password": "DoctorPass123!"
}
```

**Ответ (200 OK):**
*Заголовок `Set-Cookie: legkie_session=...; HttpOnly; SameSite=Lax; Path=/`*
```json
{
  "user": {
    "id": "user-doctor",
    "email": "doctor@legkie.local",
    "role": "specialist",
    "organizationId": "org-demo",
    "organizationName": "Детский пульмонологический центр",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastLoginAt": "2026-09-29T10:00:00.000Z"
  },
  "token": "7a8f9c1e..."
}
```

**Ошибки:**
* `400 Bad Request` — некорректный формат email.
* `401 Unauthorized` — неверный логин или пароль.
* `429 Too Many Requests` — превышен лимит попыток входа (5 за 15 минут).

---

### `POST /api/v1/auth/logout`
Завершение сессии и отзыв токена.

**Ответ (200 OK):**
```json
{
  "ok": true
}
```

---

### `GET /api/v1/auth/me`
Получение профиля текущего авторизованного пользователя.

**Ответ (200 OK):**
```json
{
  "user": {
    "id": "user-doctor",
    "email": "doctor@legkie.local",
    "role": "specialist",
    "organizationId": "org-demo",
    "organizationName": "Детский пульмонологический центр",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastLoginAt": "2026-09-29T10:00:00.000Z"
  }
}
```

---

### `POST /api/v1/auth/change-password`
Смена пароля текущего пользователя (блокируется для `demo_specialist`).

**Тело запроса:**
```json
{
  "oldPassword": "DoctorPass123!",
  "newPassword": "NewStrongPassword456!"
}
```

**Ответ (200 OK):**
```json
{
  "ok": true
}
```

**Ошибки:**
* `400 Bad Request` — неверный старый пароль или новый пароль короче 8 символов.
* `403 Forbidden` — попытка смены пароля в демо-режиме.

---

### `POST /api/v1/demo/session`
Инициализация ознакомительной сессии с ролью `demo_specialist` (Read-Only).

**Ответ (200 OK):**
```json
{
  "user": {
    "id": "user-demo",
    "email": "demo@legkie.local",
    "role": "demo_specialist",
    "organizationId": "org-demo",
    "organizationName": "Детский пульмонологический центр",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "lastLoginAt": null
  },
  "token": "d8e3c1a...",
  "isDemo": true
}
```

---

## 2. Пациенты и назначения

### `GET /api/v1/patients`
Получение списка пациентов, к которым у текущего специалиста есть доступ (`patient_access`).

**Ответ (200 OK):**
```json
[
  {
    "id": "patient-progress",
    "pseudonym": "Тимофей Р.",
    "code": "ВЫДОХ1",
    "age": 8,
    "gender": "male",
    "avatar": "ТР",
    "balance": 48,
    "selectedSkin": "ocean",
    "createdAt": "2026-08-01T00:00:00.000Z",
    "assignment": {
      "sessionsPerWeek": 3,
      "targetBreaths": 8,
      "minCompletedBreathSeconds": 1.5,
      "targetBreathDurationMin": 2.0,
      "targetBreathDurationMax": 4.0,
      "validFrom": "2026-08-01T00:00:00.000Z",
      "note": "Стабильный прогресс"
    },
    "summary": {
      "sessionsThisWeek": 3,
      "targetSessions": 3,
      "adherencePercent": 100,
      "averageCorrectPercent": 92,
      "averageBreathDuration": 3.4,
      "averageStability": 82,
      "averageSessionDuration": 540,
      "breathCompletionPercent": 100,
      "missedThisWeek": 0,
      "lastSessionAt": "2026-09-28T17:00:00.000Z",
      "trendPercent": 5
    }
  }
]
```

---

### `GET /api/v1/patients/:id`
Карточка пациента с недельными агрегатами, журналом сессий и историей назначений.

**Ответ (200 OK):**
```json
{
  "patient": {
    "id": "patient-progress",
    "pseudonym": "Тимофей Р.",
    "code": "ВЫДОХ1",
    "age": 8,
    "gender": "male",
    "avatar": "ТР",
    "balance": 48,
    "selectedSkin": "ocean",
    "createdAt": "2026-08-01T00:00:00.000Z",
    "assignment": { ... },
    "summary": { ... }
  },
  "weekly": [
    {
      "week": "2026-08-10",
      "label": "10 авг",
      "sessions": 3,
      "target": 3,
      "averageCorrect": 74,
      "averageDuration": 500,
      "averageStability": 62,
      "breaths": 24,
      "targetBreaths": 24
    }
  ],
  "sessions": [ ... ],
  "assignments": [ ... ]
}
```

**Ошибки:**
* `403 Forbidden` — у специалиста нет записи в `patient_access` для данного `id`.
* `404 Not Found` — пациент не найден.

---

### `GET /api/v1/patients/:id/assignments`
История версий назначений пациента.

**Ответ (200 OK):**
```json
[
  {
    "id": "assign-123",
    "patient_id": "patient-progress",
    "created_by_user_id": "user-doctor",
    "sessions_per_week": 4,
    "target_breaths": 10,
    "min_completed_breath_seconds": 2.0,
    "target_breath_duration_min": 2.5,
    "target_breath_duration_max": 4.5,
    "valid_from": "2026-10-01T00:00:00.000Z",
    "valid_until": null,
    "note": "Увеличение нагрузки",
    "created_at": "2026-09-29T10:00:00.000Z"
  }
]
```

---

### `POST /api/v1/patients/:id/assignments`
Создание новой версии назначения для пациента.

**Тело запроса:**
```json
{
  "sessionsPerWeek": 4,
  "targetBreaths": 10,
  "minCompletedBreathSeconds": 2.0,
  "targetBreathDurationMin": 2.5,
  "targetBreathDurationMax": 4.5,
  "validFrom": "2026-10-01T00:00:00.000Z",
  "note": "Увеличение нагрузки"
}
```

**Ответ (201 Created):**
```json
{
  "id": "assign-new-uuid",
  "patient_id": "patient-progress",
  "created_by_user_id": "user-doctor",
  "sessions_per_week": 4,
  "target_breaths": 10,
  "min_completed_breath_seconds": 2.0,
  "target_breath_duration_min": 2.5,
  "target_breath_duration_max": 4.5,
  "valid_from": "2026-10-01T00:00:00.000Z",
  "valid_until": null,
  "note": "Увеличение нагрузки",
  "created_at": "2026-09-29T10:05:00.000Z"
}
```

**Ошибки:**
* `400 Bad Request` — ошибки валидации Zod (выход за допустимые диапазоны).
* `403 Forbidden` — отсутствие прав доступа к пациенту либо попытка мутации из роли `demo_specialist`.

---

## 3. Сводка, занятия и отчёты

### `GET /api/v1/dashboard?period=week|month|8weeks`
Сводка кабинета: KPI периода, ряд по неделям, список «Требуют внимания», лента последних занятий.

**Ответ (200 OK):**
```json
{
  "period": "week",
  "generatedAt": "2026-09-29T10:00:00.000Z",
  "kpi": {
    "activePatients": 4,
    "totalPatients": 4,
    "sessionsInPeriod": 9,
    "targetSessionsInPeriod": 12,
    "averageAdherencePercent": 72,
    "missedSessions": 3,
    "attentionCount": 1
  },
  "series": [{ "week": "2026-09-21", "label": "21 сент.", "sessions": 9, "target": 12, "adherencePercent": 75 }],
  "attention": [{ "id": "patient-maria-gap", "pseudonym": "Вера Н.", "reasons": ["missed_days"], "daysSinceLastSession": 6 }],
  "recentSessions": [{ "id": "sess-1", "childId": "patient-maria-stable", "childNickname": "Артём Л." }]
}
```

---

### `GET /api/v1/patients/:id/analytics`
Аналитика карточки ребёнка: недельные ряды, план/факт и сравнение двух недель с двумя предыдущими.

**Ответ (200 OK):**
```json
{
  "weekly": [{ "week": "2026-09-21", "label": "21 сент.", "sessions": 3, "target": 3, "averageBreathDuration": 3.2, "averageStability": 82, "breaths": 24 }],
  "planFact": [{ "week": "2026-09-21", "label": "21 сент.", "factSessions": 3, "planSessions": 3, "factBreaths": 24, "planBreaths": 24 }],
  "comparison": {
    "current": { "from": "2026-09-15T00:00:00.000Z", "to": "2026-09-29T00:00:00.000Z", "sessions": 6, "averageBreathDuration": 3.3, "averageStability": 83, "averageSessionDuration": 560, "totalBreaths": 47, "adherencePercent": 100 },
    "previous": { "sessions": 5, "averageBreathDuration": 3.0, "averageStability": 79, "averageSessionDuration": 540, "totalBreaths": 39, "adherencePercent": 83 },
    "delta": { "sessions": 20, "averageBreathDuration": 10, "averageStability": 5, "totalBreaths": 21, "adherencePercent": 20 }
  }
}
```

**Ошибки:** `403 Forbidden` — нет доступа к ребёнку.

---

### `GET /api/v1/patients/:id/sessions`
Журнал занятий одного ребёнка.

**Параметры запроса:** `from`, `to` (ISO 8601), `minDurationSeconds`, `minBreaths`, `page`, `pageSize`.

**Ответ (200 OK):** `{ "items": [ SessionRecord ], "total": 42, "page": 1, "pageSize": 15 }`

---

### `GET /api/v1/sessions`
Глобальный журнал занятий по всем детям, доступным специалисту.

**Параметры запроса:** те же, плюс `patientId`. При указании `patientId` без доступа возвращается `403 Forbidden`.

---

### `GET /api/v1/sessions/:sessionId`
Агрегаты одного занятия. `404 Not Found`, если занятие принадлежит недоступному ребёнку.

---

### `GET /api/v1/patients/:id/reports`
История сохранённых отчётов по ребёнку (снимки в `report_snapshots`).

---

### `POST /api/v1/patients/:id/reports`
Формирование и сохранение отчёта за период.

**Тело запроса:**
```json
{ "periodStart": "2026-08-04T00:00:00.000Z", "periodEnd": "2026-09-29T00:00:00.000Z" }
```

**Ответ (201 Created):**
```json
{
  "id": "report-uuid",
  "periodStart": "2026-08-04T00:00:00.000Z",
  "periodEnd": "2026-09-29T00:00:00.000Z",
  "createdAt": "2026-09-29T10:00:00.000Z",
  "data": {
    "sessions": 22,
    "averageSessionDuration": 548,
    "averageBreathDuration": 3.2,
    "averageStability": 80,
    "averageAdherencePercent": 86,
    "totalBreaths": 174,
    "weekly": [ ... ]
  }
}
```

**Ошибки:** `403 Forbidden` — нет доступа к ребёнку либо роль `demo_specialist`.

---

## 4. Настройки кабинета и активные входы

### `GET /api/v1/settings`
Профиль специалиста, настройки уведомлений и параметры назначений по умолчанию.

```json
{
  "profile": { "displayName": "Мария Орлова", "clinicName": "Детская клиника", "contactEmail": "maria@legkie.local", "contactPhone": null },
  "notifications": { "emailAlerts": true, "weeklyReport": true, "missedDaysThreshold": 3, "declineTrendPercent": -10 },
  "assignmentDefaults": { "sessionsPerWeek": 3, "targetBreaths": 8, "minCompletedBreathSeconds": 1.5 },
  "attentionThresholds": { "missedDays": 3, "declinePercent": -10, "minAdherencePercent": 60 },
  "updatedAt": "2026-09-29T10:00:00.000Z"
}
```

### `PUT /api/v1/settings/profile`
Тело: `displayName`, `clinicName`, `contactEmail`, `contactPhone` (все необязательны). Ответ: `{ "user": UserDto }`.
`400 Bad Request` при некорректной почте, `403 Forbidden` для `demo_specialist`.

### `PUT /api/v1/settings/notifications`
Тело: `emailAlerts`, `weeklyReport`, `missedDaysThreshold` (1–30), `declineTrendPercent` (−100…0).

### `PUT /api/v1/settings/defaults`
Тело: `sessionsPerWeek` (1–7), `targetBreaths` (4–30), `minCompletedBreathSeconds` (0.5–10).

### `GET /api/v1/settings/export`
Выгрузка агрегатов по своим детям в JSON. Каждая запись содержит псевдоним, возраст, активное назначение, сводку и список занятий. Действие пишется в аудит как `export_data`.

### `GET /api/v1/auth/sessions`
Активные входы пользователя. Текущий помечен полем `current: true`.

```json
[{ "id": "sess-a", "createdAt": "...", "lastActiveAt": "...", "expiresAt": "...", "userAgent": "Chrome, Windows", "ip": "10.0.0.1", "current": true }]
```

### `DELETE /api/v1/auth/sessions/:sessionId`
Завершает один вход. `404 Not Found`, если сессия принадлежит другому пользователю.

### `POST /api/v1/auth/sessions/revoke-all`
Завершает все входы пользователя, включая текущий.

---

## 5. Обратная совместимость игровых эндпоинтов

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/child/access` | Вход ребёнка в игру по буквенно-цифровому коду |
| `GET` | `/api/children/:id` | Профиль ребёнка, баланс монет, открытые скины |
| `POST` | `/api/calibrations` | Сохранение производных акустических признаков калибровки |
| `GET` | `/api/children/:id/calibration` | Получение последней калибровки |
| `POST` | `/api/sessions` | Сохранение агрегатов сессии и начисление монет |
| `POST` | `/api/shop/purchase` | Покупка скина в игровом магазине |
| `PUT` | `/api/children/:id/skin` | Выбор активного скина шара |

---

## 6. Удалённые эндпоинты

Маршруты этапа 1 `GET /api/clinician/children`, `GET /api/clinician/children/:id` и
`GET /api/clinician/sessions` удалены после полного перехода кабинета на `/api/v1/...`.
Обращение к ним возвращает `404 Not Found`. Игровые маршруты `/api/child/*` не менялись.
