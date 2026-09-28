let muted = localStorage.getItem('legkie-muted') === 'true';

export const soundSettings = {
  isMuted: () => muted,
  setMuted(value: boolean) {
    muted = value;
    localStorage.setItem('legkie-muted', String(value));
  },
};

export function playTone(kind: 'coin' | 'success' | 'bump' | 'start'): void {
  if (muted) return;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies = { coin: 720, success: 520, bump: 160, start: 390 };
  oscillator.frequency.value = frequencies[kind];
  oscillator.type = kind === 'bump' ? 'sine' : 'triangle';
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);
  oscillator.addEventListener('ended', () => void context.close());
}

export function speakHint(text: string): void {
  if (muted || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.92;
  utterance.pitch = 1.08;
  window.speechSynthesis.speak(utterance);
}
