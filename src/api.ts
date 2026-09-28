import type {
  ApiErrorBody,
  AssignmentVersionDto,
  AuthResponse,
  CalibrationProfile,
  ChildProfile,
  ClinicianChild,
  CreateAssignmentInput,
  PatientDetail,
  PatientListItemDto,
  PatientV1DetailDto,
  SessionPayload,
  SessionRecord,
  UserDto,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Ошибка сервера' }))) as ApiErrorBody;
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  // ==========================================
  // ИГРОВЫЕ ЭНДПОИНТЫ
  // ==========================================
  accessChild: (code: string) =>
    request<ChildProfile>('/api/child/access', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  getChild: (id: string) => request<ChildProfile>(`/api/children/${id}`),
  saveCalibration: (childId: string, profile: CalibrationProfile) =>
    request<{ ok: true }>('/api/calibrations', {
      method: 'POST',
      body: JSON.stringify({ childId, ...profile }),
    }),
  getCalibration: (childId: string) =>
    request<CalibrationProfile | null>(`/api/children/${childId}/calibration`),
  saveSession: (payload: SessionPayload) =>
    request<{ session: SessionRecord; balance: number }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  buySkin: (childId: string, skinId: string) =>
    request<ChildProfile>('/api/shop/purchase', {
      method: 'POST',
      body: JSON.stringify({ childId, skinId }),
    }),
  selectSkin: (childId: string, skinId: string) =>
    request<ChildProfile>(`/api/children/${childId}/skin`, {
      method: 'PUT',
      body: JSON.stringify({ skinId }),
    }),

  // ==========================================
  // СТАРЫЙ API КАБИНЕТА (ДЛЯ СОВМЕСТИМОСТИ UI)
  // ==========================================
  clinicianChildren: () => request<ClinicianChild[]>('/api/clinician/children'),
  patientDetail: (id: string) => request<PatientDetail>(`/api/clinician/children/${id}`),

  // ==========================================
  // НОВЫЙ V1 API (ДЛЯ СПЕЦИАЛИСТА И БЕЗОПАСНОСТИ)
  // ==========================================
  v1: {
    login: (body: { email: string; password: string }) =>
      request<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    logout: () =>
      request<{ ok: true }>('/api/v1/auth/logout', {
        method: 'POST',
      }),
    me: () => request<{ user: UserDto }>('/api/v1/auth/me'),
    changePassword: (body: { oldPassword: string; newPassword: string }) =>
      request<{ ok: true }>('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    startDemoSession: () =>
      request<AuthResponse>('/api/v1/demo/session', {
        method: 'POST',
      }),
    listPatients: () => request<PatientListItemDto[]>('/api/v1/patients'),
    getPatient: (id: string) => request<PatientV1DetailDto>(`/api/v1/patients/${id}`),
    listAssignments: (patientId: string) =>
      request<AssignmentVersionDto[]>(`/api/v1/patients/${patientId}/assignments`),
    createAssignment: (patientId: string, input: CreateAssignmentInput) =>
      request<AssignmentVersionDto>(`/api/v1/patients/${patientId}/assignments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
};
