import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { Card, SectionHeader } from '../../../shared/components/Card';
import { createTelegramLink, disconnectTelegram, getTelegramStatus, type TelegramLink, type TelegramStatus } from '../infrastructure/telegramApi';

export function TelegramSettings() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    getTelegramStatus().then((value) => { if (current) setStatus(value); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'No pudimos consultar Telegram.'); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!link) return;
    let current = true;
    const timer = window.setInterval(() => {
      if (Date.now() >= Date.parse(link.expiresAt) || document.visibilityState === 'hidden') return;
      getTelegramStatus().then((value) => {
        if (!current) return;
        setStatus(value);
        if (value.connected) setLink(null);
      }).catch(() => { /* Manual refresh remains available. */ });
    }, 5000);
    return () => { current = false; window.clearInterval(timer); };
  }, [link]);

  const perform = async (action: 'refresh' | 'link' | 'disconnect') => {
    setBusy(true); setError('');
    try {
      if (action === 'link') setLink(await createTelegramLink());
      if (action === 'disconnect') { await disconnectTelegram(); setLink(null); }
      const latest = await getTelegramStatus();
      setStatus(latest);
      if (latest.connected) setLink(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos completar la operación.'); }
    finally { setBusy(false); }
  };

  return <Card className="telegram-settings">
    <SectionHeader title="Telegram" />
    <p className="muted">Anotá gastos desde un chat. Por ejemplo: <strong>3000 en supermercado</strong>.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!status && !error && <p role="status">Consultando conexión…</p>}
    {status && !status.available && <p className="muted">El bot todavía no está configurado.</p>}
    {status?.connected && <>
      <p role="status"><strong>Cuenta vinculada{status.telegramUsername ? ' con @' + status.telegramUsername : ''}.</strong></p>
      {status.botUsername && <a className="button button--primary" href={'https://t.me/' + status.botUsername} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} /> Abrir bot</a>}
      <p className="muted small-copy">Usá ARS o USD; si no indicás moneda, se guardará en pesos. La fecha corresponde al día del mensaje en Argentina. El bot confirma el importe y la categoría.</p>
      <p className="muted small-copy">Si la app ya estaba abierta, recargala para ver los gastos nuevos. Podés corregirlos desde Movimientos.</p>
      <button className="button button--ghost" disabled={busy} onClick={() => void perform('disconnect')}>Desvincular Telegram</button>
      <p className="muted small-copy">Desvincular conserva todos los gastos registrados.</p>
    </>}
    {status?.available && !status.connected && <>
      <p className="muted">Generá un enlace, abrilo en Telegram y tocá Iniciar. El enlace es personal y vence en 10 minutos.</p>
      <div className="form-actions">
        <button className="button button--primary" disabled={busy} onClick={() => void perform('link')}><MessageCircle size={17} />{link ? 'Generar otro enlace' : 'Vincular Telegram'}</button>
        {link && <a className="button button--primary" href={link.url} target="_blank" rel="noopener noreferrer">Abrir bot en Telegram</a>}
      </div>
    </>}
    <button className="button button--ghost" disabled={busy} onClick={() => void perform('refresh')}><RefreshCw size={16} />{busy ? 'Procesando…' : 'Actualizar estado de Telegram'}</button>
  </Card>;
}
