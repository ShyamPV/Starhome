import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A service worker controls the page: the app shell and core catalogue work offline. */
  offlineReady: boolean;
  /** A newer version has installed and is waiting for a reload. */
  waiting: ServiceWorker | null;
  /** Chromium's install prompt, when the app can be installed. */
  installEvent: InstallPromptEvent | null;
  online: boolean;
}

export const usePwa = create<PwaState>(() => ({
  offlineReady: false,
  waiting: null,
  installEvent: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}));

/** Switch to the waiting version and reload once it has taken over. */
export function applyUpdate(): void {
  const w = usePwa.getState().waiting;
  if (!w) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  w.postMessage('skip-waiting');
}

export async function installApp(): Promise<void> {
  const e = usePwa.getState().installEvent;
  if (!e) return;
  await e.prompt();
  await e.userChoice;
  usePwa.setState({ installEvent: null });
}

/** Production builds only: the dev server serves modules that must never be cached. */
export function registerServiceWorker(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installEvent: null }));
  window.addEventListener('online', () => usePwa.setState({ online: true }));
  window.addEventListener('offline', () => usePwa.setState({ online: false }));
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const watch = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener('statechange', () => {
            // A new worker waiting behind the current one: an update. The first install is not.
            if (w.state === 'installed' && navigator.serviceWorker.controller) usePwa.setState({ waiting: w });
            if (w.state === 'activated') usePwa.setState({ offlineReady: true });
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) usePwa.setState({ waiting: reg.waiting });
        if (reg.active) usePwa.setState({ offlineReady: true });
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        // Look for a new version now and then while the app stays open.
        window.setInterval(() => void reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        // Not fatal: the app works online without it.
      });
  });
}
