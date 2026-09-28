import type { AudioFeatures } from '../types';

export class MicrophoneAnalyzer {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;

  async start(onFeatures: (features: AudioFeatures) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Этот браузер не поддерживает доступ к микрофону');
    }
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
      });
      this.context = new AudioContext({ latencyHint: 'interactive' });
      await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.25;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -20;
      source.connect(this.analyser);

      const collect = (): void => {
        if (!this.analyser || !this.context) return;
        onFeatures(extractAudioFeatures(this.analyser, this.context.sampleRate));
      };
      collect();
      this.timer = window.setInterval(collect, 80);
    } catch (error) {
      this.stop();
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new Error('Микрофон выключен. Разрешите доступ в настройках браузера.');
      }
      throw error instanceof Error ? error : new Error('Не удалось включить микрофон');
    }
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
    this.analyser = null;
  }
}

export function extractAudioFeatures(analyser: AnalyserNode, sampleRate: number): AudioFeatures {
  const time = new Float32Array(analyser.fftSize);
  const frequency = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(time);
  analyser.getFloatFrequencyData(frequency);

  let sumSquares = 0;
  let peak = 0;
  let crossings = 0;
  for (let index = 0; index < time.length; index += 1) {
    const value = time[index];
    sumSquares += value * value;
    peak = Math.max(peak, Math.abs(value));
    if (index > 0 && (value >= 0) !== (time[index - 1] >= 0)) crossings += 1;
  }
  const rms = Math.sqrt(sumSquares / time.length);
  const zcr = crossings / (time.length - 1);

  let weightedFrequency = 0;
  let magnitudeSum = 0;
  let logMagnitudeSum = 0;
  const binWidth = sampleRate / analyser.fftSize;
  for (let index = 1; index < frequency.length; index += 1) {
    const magnitude = Math.max(1e-8, 10 ** (frequency[index] / 20));
    magnitudeSum += magnitude;
    weightedFrequency += index * binWidth * magnitude;
    logMagnitudeSum += Math.log(magnitude);
  }
  const bins = Math.max(1, frequency.length - 1);
  const arithmeticMean = magnitudeSum / bins;
  const geometricMean = Math.exp(logMagnitudeSum / bins);

  return {
    rms,
    zcr,
    spectralCentroid: magnitudeSum > 0 ? weightedFrequency / magnitudeSum : 0,
    spectralFlatness: arithmeticMean > 0 ? Math.min(1, geometricMean / arithmeticMean) : 0,
    crestFactor: rms > 1e-5 ? peak / rms : 0,
  };
}
