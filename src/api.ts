import type {
  ApiErrorBody,
  CalibrationProfile,
  ChildProfile,
  ClinicianChild,
  PatientDetail,
  SessionPayload,
  SessionRecord,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'Ошибка сервера' }))) as ApiErrorBody;
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
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
  clinicianChildren: () => request<ClinicianChild[]>('/api/clinician/children'),
  patientDetail: (id: string) => request<PatientDetail>(`/api/clinician/children/${id}`),
};
