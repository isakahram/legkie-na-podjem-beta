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

## 3. Обратная совместимость игровых эндпоинтов

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/child/access` | Вход ребёнка в игру по буквенно-цифровому коду |
| `GET` | `/api/children/:id` | Профиль ребёнка, баланс монет, открытые скины |
| `POST` | `/api/calibrations` | Сохранение производных акустических признаков калибровки |
| `GET` | `/api/children/:id/calibration` | Получение последней калибровки |
| `POST` | `/api/sessions` | Сохранение агрегатов сессии и начисление монет |
| `POST` | `/api/shop/purchase` | Покупка скина в игровом магазине |
| `PUT` | `/api/children/:id/skin` | Выбор активного скина шара |
