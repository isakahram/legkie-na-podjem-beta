export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // PWA support is an enhancement; registration failure must not block a session.
      console.warn('Service worker registration failed', error);
    });
  });
}
