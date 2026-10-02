export const FINANCE_REFRESH_INTERVAL_MS = 15_000;
const REFRESH_DEBOUNCE_MS = 150;

/** Route every notification through the existing conflict-aware synchronization. */
export function startFinanceAutoRefresh(
  refresh: () => Promise<void>,
  subscribe?: (onChange: () => void) => () => void,
) {
  let active = true;
  let inFlight = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canRefresh = () => active && document.visibilityState !== 'hidden' && navigator.onLine;

  const run = async () => {
    timer = undefined;
    if (!canRefresh()) return;
    if (inFlight) { pending = true; return; }
    inFlight = true;
    try {
      await refresh();
    } catch {
      // FinanceSync reports failures and retains drafts. The next signal retries.
    } finally {
      inFlight = false;
      if (pending) { pending = false; request(); }
    }
  };
  const request = () => {
    if (!canRefresh()) return;
    if (inFlight) { pending = true; return; }
    if (timer === undefined) timer = setTimeout(() => { void run(); }, REFRESH_DEBOUNCE_MS);
  };

  const interval = setInterval(request, FINANCE_REFRESH_INTERVAL_MS);
  window.addEventListener('focus', request);
  window.addEventListener('online', request);
  document.addEventListener('visibilitychange', request);
  let unsubscribe: (() => void) | undefined;
  try { unsubscribe = subscribe?.(request); } catch { /* Polling remains available if Realtime cannot start. */ }
  return () => {
    active = false;
    clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener('focus', request);
    window.removeEventListener('online', request);
    document.removeEventListener('visibilitychange', request);
    unsubscribe?.();
  };
}
