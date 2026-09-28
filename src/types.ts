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
  breathCount: number;
  averageStrength: number;
  averageBreathDuration: number;
  correctBreathPercent: number;
  completedCycles: number;
  targetCycles: number;
  coinsCollected: number;
  obstaclesAvoided: number;
  suspiciousEvents: number;
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
  cycles: number;
  targetCycles: number;
}

export interface PatientSummary {
  sessionsThisWeek: number;
  targetSessions: number;
  adherencePercent: number;
  averageCorrectPercent: number;
  averageBreathDuration: number;
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
