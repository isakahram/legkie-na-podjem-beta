export type SoundKind = 'silence' | 'breath' | 'speech' | 'cough' | 'noise';

export interface AudioFeatures {
  rms: number;
  zcr: number;
  spectralCentroid: number;
  spectralFlatness: number;
  crestFactor: number;
}

export interface CalibrationProfile {
  ambientRms: number;
  breathRms: number;
  breathZcr: number;
  breathCentroid: number;
  breathFlatness: number;
  createdAt: string;
  quality: number;
}

export interface SoundClassification {
  kind: SoundKind;
  confidence: number;
  strength: number;
  reason: string;
}

export interface Skin {
  id: string;
  name: string;
  color: string;
  accent: string;
  price: number;
  owned: boolean;
}

export interface Assignment {
  sessionsPerWeek: number;
  cyclesPerSession: number;
  recommendedDurationSeconds: number;
}

export interface ChildProfile {
  id: string;
  nickname: string;
  age: number;
  avatar: string;
  balance: number;
  selectedSkin: string;
  assignment: Assignment;
  skins: Skin[];
}

export interface SessionPayload {
  childId: string;
  startedAt: string;
  durationSeconds: number;
  /** Все breath-сегменты, включая короткие. */
  breathCount: number;
  averageStrength: number;
  /** Среднее по завершённым выдохам; null, если завершённых не было. */
  averageBreathDuration: number | null;
  /** 0..100, «требует валидации»; null без завершённых выдохов. */
  averageStability: number | null;
  correctBreathPercent: number;
  /** Завершённые выдохи: непрерывные сегменты не короче порога. */
  completedCycles: number;
  targetCycles: number;
  coinsCollected: number;
  /** Техническая метрика конвейера, мс. Не физиологическая. */
  averageLatencyMs: number | null;
  maxLatencyMs: number | null;
  /** Сколько раз включалась мягкая техническая пауза по постороннему звуку. */
  technicalPauses: number;
  status: 'completed' | 'stopped';
  inputMode: 'microphone' | 'demo';
}

export interface SessionRecord extends SessionPayload {
  id: string;
  childNickname?: string;
}

export interface WeeklyPoint {
  week: string;
  label: string;
  sessions: number;
  target: number;
  averageCorrect: number;
  averageDuration: number;
  averageStability: number | null;
  cycles: number;
  targetCycles: number;
}

export interface PatientSummary {
  sessionsThisWeek: number;
  targetSessions: number;
  adherencePercent: number;
  averageCorrectPercent: number;
  averageBreathDuration: number | null;
  averageStability: number | null;
  averageSessionDuration: number;
  cycleCompletionPercent: number;
  missedThisWeek: number;
  lastSessionAt: string | null;
  trendPercent: number;
}

export interface ClinicianChild extends ChildProfile {
  code: string;
  summary: PatientSummary;
}

export interface PatientDetail {
  child: ClinicianChild;
  weekly: WeeklyPoint[];
  sessions: SessionRecord[];
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}
