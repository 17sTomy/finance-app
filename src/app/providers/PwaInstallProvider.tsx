import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type InstallStatus = 'idle' | 'prompting' | 'accepted' | 'dismissed' | 'error' | 'installed';
type InstallChoice = { outcome: 'accepted' | 'dismissed' };
interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<InstallChoice>;
}
interface PwaInstallContextValue {
  status: InstallStatus;
  canPrompt: boolean;
  promptInstall: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches === true
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<InstallStatus>(() => isStandalone() ? 'installed' : 'idle');
  const [canPrompt, setCanPrompt] = useState(false);
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const busy = useRef(false);
  const installed = useRef(status === 'installed');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const markInstalled = () => {
      installed.current = true;
      deferredPrompt.current = null;
      setCanPrompt(false);
      setStatus('installed');
    };
    const capturePrompt = (event: Event) => {
      const candidate = event as Partial<InstallPromptEvent>;
      if (installed.current || busy.current || typeof candidate.prompt !== 'function'
        || typeof candidate.userChoice?.then !== 'function') return;
      event.preventDefault();
      deferredPrompt.current = candidate as InstallPromptEvent;
      setCanPrompt(true);
      setStatus('idle');
    };
    const media = window.matchMedia?.('(display-mode: standalone)');
    const checkStandalone = () => { if (isStandalone()) markInstalled(); };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    media?.addEventListener?.('change', checkStandalone);
    return () => {
      mounted.current = false;
      deferredPrompt.current = null;
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
      media?.removeEventListener?.('change', checkStandalone);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt.current;
    if (!event || busy.current || installed.current || !mounted.current) return;
    // A deferred event can only be used once, even when the user dismisses it.
    deferredPrompt.current = null;
    busy.current = true;
    setCanPrompt(false);
    setStatus('prompting');
    try {
      // Invoke prompt before awaiting anything to preserve the button's user gesture.
      const [, choice] = await Promise.all([event.prompt(), event.userChoice]);
      if (mounted.current && !installed.current) setStatus(choice.outcome);
    } catch {
      if (mounted.current && !installed.current) setStatus('error');
    } finally {
      busy.current = false;
    }
  }, []);

  const value = useMemo(() => ({ status, canPrompt, promptInstall }), [status, canPrompt, promptInstall]);
  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error('usePwaInstall debe usarse dentro de PwaInstallProvider');
  return value;
}
