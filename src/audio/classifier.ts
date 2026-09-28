import type {
  AudioFeatures,
  CalibrationProfile,
  SoundClassification,
} from '../types';

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/**
 * Explainable first-pass classifier. It runs entirely in the browser and consumes
 * short-lived derived features, never raw audio. Thresholds require clinical and
 * age-stratified validation before medical use.
 */
export function classifySound(
  features: AudioFeatures,
  calibration: CalibrationProfile,
): SoundClassification {
  const activityThreshold = Math.max(
    0.006,
    calibration.ambientRms * 2.2,
    calibration.breathRms * 0.2,
  );

  if (features.rms < activityThreshold) {
    return {
      kind: 'silence',
      confidence: clamp(1 - features.rms / activityThreshold),
      strength: 0,
      reason: 'Звук тише персонального порога активности',
    };
  }

  const strength = clamp(
    (features.rms - activityThreshold) /
      Math.max(0.001, calibration.breathRms * 1.25 - activityThreshold),
  );
  const energyRatio = features.rms / Math.max(calibration.breathRms, 0.001);
  const flatnessRatio = features.spectralFlatness / Math.max(calibration.breathFlatness, 0.02);
  const centroidRatio = features.spectralCentroid / Math.max(calibration.breathCentroid, 100);
  const zcrRatio = features.zcr / Math.max(calibration.breathZcr, 0.01);

  if (features.crestFactor > 7 && energyRatio > 1.35) {
    return {
      kind: 'cough',
      confidence: clamp((features.crestFactor - 6) / 4),
      strength: 0,
      reason: 'Обнаружен короткий резкий звуковой импульс',
    };
  }

  if (
    energyRatio > 2.4 ||
    (features.spectralCentroid > 5_500 && centroidRatio > 1.9)
  ) {
    return {
      kind: 'noise',
      confidence: clamp(Math.max(energyRatio / 3, centroidRatio / 2.4)),
      strength: 0,
      reason: 'Громкость или спектр сильно отличаются от калибровочного выдоха',
    };
  }

  const voicedPattern =
    (flatnessRatio < 0.58 && centroidRatio < 0.9) ||
    (zcrRatio < 0.48 && flatnessRatio < 0.8);
  if (voicedPattern) {
    return {
      kind: 'speech',
      confidence: clamp(1 - Math.max(flatnessRatio, zcrRatio) * 0.7),
      strength: 0,
      reason: 'В звуке заметна тональная структура, не похожая на калибровочный выдох',
    };
  }

  const breathSimilarity = clamp(
    1 -
      (Math.abs(Math.log(Math.max(0.05, flatnessRatio))) * 0.28 +
        Math.abs(Math.log(Math.max(0.05, centroidRatio))) * 0.18 +
        Math.abs(Math.log(Math.max(0.05, zcrRatio))) * 0.12),
  );

  return {
    kind: breathSimilarity >= 0.38 ? 'breath' : 'noise',
    confidence: breathSimilarity,
    strength: breathSimilarity >= 0.38 ? strength : 0,
    reason:
      breathSimilarity >= 0.38
        ? 'Шумовой профиль похож на персональный калибровочный выдох'
        : 'Профиль звука заметно отличается от калибровочного выдоха',
  };
}

export function createCalibrationProfile(
  quietFrames: AudioFeatures[],
  breathFrames: AudioFeatures[],
  createdAt = new Date().toISOString(),
): CalibrationProfile {
  if (quietFrames.length < 3 || breathFrames.length < 3) {
    throw new Error('Для калибровки недостаточно измерений');
  }
  const mean = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const ambientRms = mean(quietFrames.map((frame) => frame.rms));
  const active = breathFrames.filter((frame) => frame.rms > ambientRms * 1.5);
  if (active.length < Math.max(3, breathFrames.length * 0.25)) {
    throw new Error('Не удалось уверенно услышать выдох');
  }
  const breathRms = mean(active.map((frame) => frame.rms));
  const signalToNoise = breathRms / Math.max(ambientRms, 0.001);
  return {
    ambientRms,
    breathRms,
    breathZcr: mean(active.map((frame) => frame.zcr)),
    breathCentroid: mean(active.map((frame) => frame.spectralCentroid)),
    breathFlatness: mean(active.map((frame) => frame.spectralFlatness)),
    createdAt,
    quality: clamp((signalToNoise - 1.5) / 5),
  };
}
