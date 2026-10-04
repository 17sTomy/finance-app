import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallAppCard } from './InstallAppCard';

const installState = vi.hoisted(() => ({
  status: 'idle', canPrompt: false, promptInstall: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../app/providers/PwaInstallProvider', () => ({ usePwaInstall: () => installState }));

beforeEach(() => {
  installState.status = 'idle';
  installState.canPrompt = false;
  installState.promptInstall.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 1],
  ['iPad con navegador de escritorio', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5],
])('explica dónde está Compartir al instalar desde %s', (_device, userAgent, touchPoints) => {
  const mobileNavigator = Object.create(navigator);
  Object.defineProperties(mobileNavigator, {
    userAgent: { value: userAgent }, maxTouchPoints: { value: touchPoints },
  });
  vi.stubGlobal('navigator', mobileNavigator);
  render(<InstallAppCard />);
  expect(screen.queryByRole('heading', { name: 'Instalar en iPhone o iPad' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Instalar Finance App' }));
  expect(screen.getByRole('heading', { name: 'Instalar en iPhone o iPad' })).toBeTruthy();
  expect(screen.getByText(/Es un cuadrado con una flecha hacia arriba/)).toBeTruthy();
  expect(screen.getByText('Editar acciones')).toBeTruthy();
  expect(screen.getByText('Abrir como app web')).toBeTruthy();
  expect(installState.promptInstall).not.toHaveBeenCalled();
});

it('ofrece instrucciones cuando el navegador no entrega un prompt', () => {
  render(<InstallAppCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Instalar Finance App' }));
  expect(screen.getByRole('heading', { name: 'Instalar desde el navegador' })).toBeTruthy();
  expect(screen.getByText('Añadir página a → Pantalla de inicio')).toBeTruthy();
});

it('solicita la confirmación nativa desde el botón disponible', () => {
  installState.canPrompt = true;
  render(<InstallAppCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Instalar Finance App' }));
  expect(installState.promptInstall).toHaveBeenCalledOnce();
});

describe('estado de instalación', () => {
  it('no anuncia instalación completada cuando sólo fue aceptada', () => {
    installState.status = 'accepted';
    render(<InstallAppCard />);
    expect(screen.getByRole('status').textContent).toContain('Cuando el navegador termine');
    expect(screen.queryByText('Finance App ya está instalada.')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Instalar desde el navegador' })).toBeTruthy();
  });

  it('quita el botón cuando el navegador confirmó la instalación', () => {
    installState.status = 'installed';
    render(<InstallAppCard />);
    expect(screen.getByRole('status').textContent).toContain('Finance App ya está instalada');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('permite consultar la ayuda mientras espera al navegador', () => {
    installState.status = 'prompting';
    render(<InstallAppCard />);
    expect((screen.getByRole('button', { name: 'Esperando al navegador…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ver instrucciones' }));
    expect(screen.getByRole('heading', { name: 'Instalar desde el navegador' })).toBeTruthy();
  });

  it('muestra una salida manual si falla el prompt', () => {
    installState.status = 'error';
    render(<InstallAppCard />);
    expect(screen.getByRole('status').textContent).toContain('No pudimos abrir la instalación');
    expect(screen.getByRole('heading', { name: 'Instalar desde el navegador' })).toBeTruthy();
  });
});
