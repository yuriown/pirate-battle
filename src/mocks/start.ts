import { installMockControl } from './control';

const WORKER_START_TIMEOUT_MS = 5000;

let starting: Promise<void> | null = null;

/**
 * Starts the MSW service worker (dev, e2e and the static production build alike).
 * Never rejects: if the worker cannot start the game still runs and the API calls simply fail,
 * which the UI already handles as a network error.
 */
export function startMocking(): Promise<void> {
  starting ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      installMockControl();
      const { worker } = await import('./browser');
      const started = worker.start({
        serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
        onUnhandledRequest: 'bypass',
        quiet: import.meta.env.PROD,
      });
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('worker did not start in time')), WORKER_START_TIMEOUT_MS);
      });
      await Promise.race([started, timedOut]);
    } catch (error) {
      console.warn('[mocks] Mock API unavailable; ranking and history will show errors.', error);
    } finally {
      clearTimeout(timer);
    }
  })();
  return starting;
}
