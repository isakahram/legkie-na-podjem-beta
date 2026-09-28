import { describe, expect, it } from 'vitest';
import { classifySound, createCalibrationProfile } from '../src/audio/classifier.ts';
import type { AudioFeatures, CalibrationProfile } from '../src/types.ts';

const calibration: CalibrationProfile = {
  ambientRms: 0.004,
  breathRms: 0.08,
  breathZcr: 0.22,
  breathCentroid: 3_000,
  breathFlatness: 0.5,
  quality: 0.8,
  createdAt: '2026-09-29T00:00:00.000Z',
};

const feature = (overrides: Partial<AudioFeatures> = {}): AudioFeatures => ({
  rms: 0.08,
  zcr: 0.21,
  spectralCentroid: 3_100,
  spectralFlatness: 0.48,
  crestFactor: 3,
  ...overrides,
});

describe('classifySound', () => {
  it('classifies audio below the personal threshold as silence', () => {
    expect(classifySound(feature({ rms: 0.003 }), calibration).kind).toBe('silence');
  });

  it('recognises a noise-shaped signal close to calibration as breath', () => {
    const result = classifySound(feature(), calibration);
    expect(result.kind).toBe('breath');
    expect(result.strength).toBeGreaterThan(0.5);
    expect(result.reason).toContain('персональный');
  });

  it('marks a tonal, low-ZCR signal as speech', () => {
    const result = classifySound(
      feature({ zcr: 0.05, spectralCentroid: 1_900, spectralFlatness: 0.17 }),
      calibration,
    );
    expect(result.kind).toBe('speech');
    expect(result.strength).toBe(0);
  });

  it('marks a strong transient as cough', () => {
    const result = classifySound(feature({ rms: 0.14, crestFactor: 9 }), calibration);
    expect(result.kind).toBe('cough');
    expect(result.reason).toContain('импульс');
  });

  it('marks an extremely loud signal as noise', () => {
    expect(classifySound(feature({ rms: 0.25 }), calibration).kind).toBe('noise');
  });
});

describe('createCalibrationProfile', () => {
  it('aggregates only active breath frames and computes signal quality', () => {
    const quiet = Array.from({ length: 5 }, () => feature({ rms: 0.003 }));
    const breath = Array.from({ length: 8 }, () => feature({ rms: 0.07 }));
    const result = createCalibrationProfile(quiet, breath, '2026-09-29T00:00:00.000Z');
    expect(result.ambientRms).toBeCloseTo(0.003);
    expect(result.breathRms).toBeCloseTo(0.07);
    expect(result.quality).toBeGreaterThan(0.8);
  });

  it('rejects calibration when a breath was not distinguishable', () => {
    const quiet = Array.from({ length: 5 }, () => feature({ rms: 0.01 }));
    const breath = Array.from({ length: 8 }, () => feature({ rms: 0.011 }));
    expect(() => createCalibrationProfile(quiet, breath)).toThrow('Не удалось');
  });

  it('rejects too few measurements', () => {
    expect(() => createCalibrationProfile([feature()], [feature()])).toThrow('недостаточно');
  });
});
