import { getSupabase } from '../../../lib/supabase';

export interface TelegramStatus {
  available: boolean; connected: boolean; botUsername: string | null; telegramUsername: string | null; connectedAt: string | null;
}
export interface TelegramLink { url: string; expiresAt: string }

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const { data, error } = await getSupabase().rpc('telegram_connection_status');
  if (error || !data) throw new Error('No pudimos consultar la conexión con Telegram. Reintentá en unos segundos.');
  return data as unknown as TelegramStatus;
}
export async function createTelegramLink(): Promise<TelegramLink> {
  const { data, error } = await getSupabase().rpc('create_telegram_link');
  if (error || !data) throw new Error('No pudimos generar el enlace. Actualizá el estado y volvé a intentar.');
  return data as unknown as TelegramLink;
}
export async function disconnectTelegram(): Promise<void> {
  const { error } = await getSupabase().rpc('disconnect_telegram');
  if (error) throw new Error('No pudimos desvincular Telegram. Volvé a intentar.');
}
