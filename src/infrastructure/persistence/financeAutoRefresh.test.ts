import { vi } from 'vitest';
import { FINANCE_REFRESH_INTERVAL_MS, startFinanceAutoRefresh } from './financeAutoRefresh';

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.restoreAllMocks(); });

it('coalesces realtime, focus and visibility signals into one refresh', async () => {
  const refresh = vi.fn(async () => {});
  let notify!: () => void;
  stop = startFinanceAutoRefresh(refresh, (callback) => { notify = callback; return () => {}; });
  notify(); notify();
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('polls when realtime is unavailable and retries after a failed request', async () => {
  const refresh = vi.fn(async () => {}).mockRejectedValueOnce(new Error('offline'));
  stop = startFinanceAutoRefresh(refresh, () => { throw new Error('unavailable'); });
  await vi.advanceTimersByTimeAsync(FINANCE_REFRESH_INTERVAL_MS + 150);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(FINANCE_REFRESH_INTERVAL_MS);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('pauses while hidden or offline and refreshes on return or reconnection', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const online = vi.spyOn(navigator, 'onLine', 'get');
  const refresh = vi.fn(async () => {});
  stop = startFinanceAutoRefresh(refresh);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(1);
  online.mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  online.mockReturnValue(true);
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('queues one follow-up for changes arriving during a slow request without overlapping reads', async () => {
  let finish!: () => void;
  const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  let notify!: () => void;
  stop = startFinanceAutoRefresh(refresh, (callback) => { notify = callback; return () => {}; });
  notify();
  await vi.advanceTimersByTimeAsync(150);
  notify(); notify();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(2);
  finish();
});

it('cleans up polling, pending callbacks and subscriptions on session end', async () => {
  const refresh = vi.fn(async () => {});
  const unsubscribe = vi.fn();
  let notify!: () => void;
  stop = startFinanceAutoRefresh(refresh, (callback) => { notify = callback; return unsubscribe; });
  notify();
  stop(); stop = undefined;
  notify();
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(refresh).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
