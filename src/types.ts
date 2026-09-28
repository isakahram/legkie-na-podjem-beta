export type SoundKind = 'silence' | 'breath' | 'speech' | 'cough' | 'noise';
export interface AudioFeatures { rms: number; zcr: number; spectralCentroid: number; spectralFlatness: number; crestFactor: number; }
export interface CalibrationProfile { ambientRms: number; breathRms: number; breathZcr: number; breathCentroid: number; breathFlatness: number; createdAt: string; quality: number; }
export interface SoundClassification { kind: SoundKind; confidence: number; strength: number; reason: string; }
export interface Skin { id: string; name: string; color: string; accent: string; price: number; owned: boolean; category?: 'color' | 'pattern' | 'effect'; pattern?: string; effect?: string; unlockLabel?: string; }
export interface Assignment {
  sessionsPerWeek: number;
  /** Новая цель: количество завершённых глубоких выдохов. */
  targetBreaths?: number;
  /** @deprecated совместимость со старыми клиентами и БД. */
  cyclesPerSession?: number;
  /** Справочно, не ограничивает сессию. */
  recommendedDurationSeconds: number;
}
export interface ChildProfile { id: string; nickname: string; age: number; avatar: string; balance: number; selectedSkin: string; assignment: Assignment; skins: Skin[]; }
export interface SessionPayload {
  childId: string; startedAt: string; durationSeconds: number; breathCount: number; averageStrength: number;
  averageBreathDuration: number | null; bestDuration?: number | null; averageStability: number | null; correctBreathPercent: number;
  completedBreaths?: number; targetBreaths?: number;
  /** @deprecated API compatibility. */ completedCycles?: number; targetCycles?: number;
  coinsCollected: number; averageLatencyMs: number | null; maxLatencyMs: number | null;
  technicalPauses: number; status: 'completed' | 'stopped'; inputMode: 'microphone' | 'demo';
}
export interface SessionRecord extends SessionPayload { id: string; childNickname?: string; }
export interface WeeklyPoint { week: string; label: string; sessions: number; target: number; averageCorrect: number; averageDuration: number; averageStability: number | null; breaths: number; targetBreaths?: number; cycles?: number; targetCycles?: number; }
export interface PatientSummary { sessionsThisWeek: number; targetSessions: number; adherencePercent: number; averageCorrectPercent: number; averageBreathDuration: number | null; bestDuration?: number | null; averageStability: number | null; averageSessionDuration: number; breathCompletionPercent: number; cycleCompletionPercent?: number; missedThisWeek: number; lastSessionAt: string | null; trendPercent: number; }
export interface ClinicianChild extends ChildProfile { code: string; summary: PatientSummary; }
export interface PatientDetail { child: ClinicianChild; weekly: WeeklyPoint[]; sessions: SessionRecord[]; }
export interface ApiErrorBody { error: string; details?: unknown; }

// ==========================================
// DTOs ДЛЯ API V1 (КАБИНЕТ СПЕЦИАЛИСТА)
// ==========================================

export type UserRole = 'admin' | 'specialist' | 'demo_specialist';

export interface UserDto {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  organizationName?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthResponse {
  user: UserDto;
  token: string;
  isDemo?: boolean;
}

export interface AssignmentVersionDto {
  id: string;
  patient_id: string;
  created_by_user_id: string | null;
  sessions_per_week: number;
  target_breaths: number;
  min_completed_breath_seconds: number;
  target_breath_duration_min: number | null;
  target_breath_duration_max: number | null;
  valid_from: string;
  valid_until: string | null;
  note: string | null;
  created_at: string;
}

export interface CreateAssignmentInput {
  sessionsPerWeek: number;
  targetBreaths: number;
  minCompletedBreathSeconds: number;
  targetBreathDurationMin?: number | null;
  targetBreathDurationMax?: number | null;
  validFrom?: string;
  note?: string | null;
}

export interface PatientListItemDto {
  id: string;
  pseudonym: string;
  code: string;
  age: number;
  gender: string | null;
  avatar: string;
  balance: number;
  selectedSkin: string;
  createdAt: string;
  assignment: {
    sessionsPerWeek: number;
    targetBreaths: number;
    minCompletedBreathSeconds: number;
    targetBreathDurationMin: number | null;
    targetBreathDurationMax: number | null;
    validFrom: string;
    note: string | null;
  };
  summary: PatientSummary;
}

export interface PatientV1DetailDto {
  patient: PatientListItemDto;
  weekly: WeeklyPoint[];
  sessions: SessionRecord[];
  assignments: AssignmentVersionDto[];
}
