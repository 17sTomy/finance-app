import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { vi } from 'vitest';
import { PwaInstallProvider, usePwaInstall } from './PwaInstallProvider';

type Choice = { outcome: 'accepted' | 'dismissed' };
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode><PwaInstallProvider>{children}</PwaInstallProvider></StrictMode>;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
function installEvent(userChoice: Promise<Choice> = Promise.resolve({ outcome: 'dismissed' })) {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined), userChoice,
  });
}
let media: EventTarget & { matches: boolean };

beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps an install opportunity captured before the settings consumer mounts', () => {
  function Settings() {
    const { canPrompt } = usePwaInstall();
    return <span>{canPrompt ? 'Lista para instalar' : 'Sin aviso nativo'}</span>;
  }
  const view = render(<PwaInstallProvider><span>Inicio</span></PwaInstallProvider>);
  const event = installEvent();
  act(() => { window.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true);
  view.rerender(<PwaInstallProvider><Settings /></PwaInstallProvider>);
  expect(screen.getByText('Lista para instalar')).toBeTruthy();
});

it('ignores synthetic events without the native prompt method', async () => {
  const { result } = renderHook(usePwaInstall, { wrapper });
  const event = new Event('beforeinstallprompt', { cancelable: true });
  act(() => { window.dispatchEvent(event); });
  await act(async () => { await result.current.promptInstall(); });
  expect(event.defaultPrevented).toBe(false);
  expect(result.current.status).toBe('idle');
  expect(result.current.canPrompt).toBe(false);
});

it('calls the native prompt synchronously, blocks double taps and consumes the event once', async () => {
  const choice = deferred<Choice>();
  const event = installEvent(choice.promise);
  const { result } = renderHook(usePwaInstall, { wrapper });
  act(() => { window.dispatchEvent(event); });
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.promptInstall();
    expect(event.prompt).toHaveBeenCalledOnce();
    void result.current.promptInstall();
  });
  expect(result.current.status).toBe('prompting');
  expect(result.current.canPrompt).toBe(false);
  await act(async () => { choice.resolve({ outcome: 'dismissed' }); await pending; });
  expect(result.current.status).toBe('dismissed');
  await act(async () => { await result.current.promptInstall(); });
  expect(event.prompt).toHaveBeenCalledOnce();
  const fresh = installEvent();
  act(() => { window.dispatchEvent(fresh); });
  expect(result.current.canPrompt).toBe(true);
  expect(result.current.status).toBe('idle');
});

it('distinguishes accepting the browser prompt from confirmed installation', async () => {
  const event = installEvent(Promise.resolve({ outcome: 'accepted' }));
  const { result } = renderHook(usePwaInstall, { wrapper });
  act(() => { window.dispatchEvent(event); });
  await act(async () => { await result.current.promptInstall(); });
  expect(result.current.status).toBe('accepted');
  expect(result.current.canPrompt).toBe(false);
  act(() => { window.dispatchEvent(new Event('appinstalled')); });
  expect(result.current.status).toBe('installed');
  act(() => { window.dispatchEvent(installEvent()); });
  expect(result.current.canPrompt).toBe(false);
});

it('does not overwrite confirmed installation when a pending prompt resolves later', async () => {
  const choice = deferred<Choice>();
  const event = installEvent(choice.promise);
  const { result } = renderHook(usePwaInstall, { wrapper });
  act(() => { window.dispatchEvent(event); });
  let pending!: Promise<void>;
  act(() => { pending = result.current.promptInstall(); });
  act(() => { window.dispatchEvent(new Event('appinstalled')); });
  await act(async () => { choice.resolve({ outcome: 'accepted' }); await pending; });
  expect(result.current.status).toBe('installed');
});

it.each(['throw', 'reject'] as const)('recovers when the browser prompt fails with %s', async (failure) => {
  const event = installEvent();
  event.prompt.mockImplementation(() => {
    if (failure === 'throw') throw new Error('Unavailable');
    return Promise.reject(new Error('Unavailable'));
  });
  const { result } = renderHook(usePwaInstall, { wrapper });
  act(() => { window.dispatchEvent(event); });
  await act(async () => { await result.current.promptInstall(); });
  expect(result.current.status).toBe('error');
  expect(result.current.canPrompt).toBe(false);
  const retry = installEvent(Promise.resolve({ outcome: 'accepted' }));
  act(() => { window.dispatchEvent(retry); });
  await act(async () => { await result.current.promptInstall(); });
  expect(result.current.status).toBe('accepted');
});

it('recognizes iOS standalone launches without requiring beforeinstallprompt', () => {
  const iosNavigator = Object.create(navigator);
  Object.defineProperty(iosNavigator, 'standalone', { value: true });
  vi.stubGlobal('navigator', iosNavigator);
  const { result } = renderHook(usePwaInstall, { wrapper });
  expect(result.current.status).toBe('installed');
  expect(result.current.canPrompt).toBe(false);
});

it('recognizes entering standalone mode and discards the pending install event', async () => {
  const { result } = renderHook(usePwaInstall, { wrapper });
  const event = installEvent();
  act(() => { window.dispatchEvent(event); });
  act(() => { media.matches = true; media.dispatchEvent(new Event('change')); });
  expect(result.current.status).toBe('installed');
  expect(result.current.canPrompt).toBe(false);
  await act(async () => { await result.current.promptInstall(); });
  expect(event.prompt).not.toHaveBeenCalled();
});

it('removes install listeners when unmounted, including StrictMode effect replay', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const addMedia = vi.spyOn(media, 'addEventListener');
  const removeMedia = vi.spyOn(media, 'removeEventListener');
  const { unmount } = renderHook(usePwaInstall, { wrapper });
  unmount();
  for (const [name, callback] of add.mock.calls.filter(([name]) => ['beforeinstallprompt', 'appinstalled'].includes(name))) {
    expect(remove).toHaveBeenCalledWith(name, callback);
  }
  for (const [name, callback] of addMedia.mock.calls) expect(removeMedia).toHaveBeenCalledWith(name, callback);
  const event = installEvent();
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
