import { argentinaMessageDate, matchExpenseCategory, parseExpenseMessage, type ExpenseCategory } from './parser.ts';

export interface ExpenseInput {
  updateId: number; chatId: number; messageId: number;
  name: string; amount: number; currency: 'ARS' | 'USD'; date: string; categoryId: string | null;
}
export interface ExpenseResult {
  status: 'saved' | 'not_linked'; duplicate?: boolean; replied?: boolean;
  name?: string; amount?: number; currency?: string; date?: string; categoryName?: string | null;
}
export interface TelegramGateway {
  link(token: string, chatId: number, username: string | null): Promise<{ status: string }>;
  findUser(chatId: number): Promise<string | null>;
  categories(userId: string): Promise<ExpenseCategory[]>;
  record(expense: ExpenseInput): Promise<ExpenseResult>;
  markReplied(chatId: number, messageId: number): Promise<void>;
  reply(chatId: number, messageId: number, text: string): Promise<void>;
}

const help = 'Vinculá tu cuenta desde Finance’s App → Datos y preferencias → Telegram.\nDespués enviá, por ejemplo:\n3000 en supermercado\n3.000,50 en supermercado\nUSD 20 en café\nUsaré la fecha del mensaje en Argentina. /categorias muestra tus categorías.';
const json = (value: unknown, status = 200) => Response.json(value, { status });

function equalSecret(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

export function createTelegramHandler(gateway: TelegramGateway, secret: string) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!secret || !equalSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), secret)) return json({ error: 'Unauthorized' }, 401);
    let update;
    try {
      const raw = await request.text();
      if (raw.length > 65536) return json({ error: 'Payload too large' }, 413);
      update = JSON.parse(raw);
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    const message = update?.message;
    // Ignore edits, channels, groups and bots. A private chat ID must match its sender.
    if (!message || message.chat?.type !== 'private' || message.from?.is_bot
      || !Number.isSafeInteger(message.chat?.id) || message.chat.id <= 0
      || message.from?.id !== message.chat.id) return json({ ok: true });
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0
      || !Number.isSafeInteger(message.message_id) || message.message_id <= 0
      || !Number.isSafeInteger(message.date) || message.date <= 0) return json({ error: 'Invalid update' }, 400);
    const chatId = message.chat.id as number;
    const messageId = message.message_id as number;
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    const reply = (value: string) => gateway.reply(chatId, messageId, value);

    try {
      const start = text.match(/^\/start(?:@\w+)?(?:\s+([a-f0-9]{64}))?$/i);
      if (start?.[1]) {
        const linked = await gateway.link(start[1], chatId, typeof message.from.username === 'string' ? message.from.username : null);
        await reply(linked.status === 'linked'
          ? 'Tu cuenta quedó vinculada. Ya podés enviar gastos, por ejemplo: 3000 en supermercado.'
          : linked.status === 'already_linked'
            ? 'Este chat o tu cuenta ya tiene una vinculación. Desvinculalo desde Datos y preferencias antes de conectar otra cuenta.'
            : 'El enlace venció o no es válido. Generá uno nuevo desde Datos y preferencias → Telegram.');
        return json({ ok: true });
      }
      if (start || /^\/(?:help|ayuda)(?:@\w+)?$/i.test(text)) {
        await reply(help);
        return json({ ok: true });
      }
      const userId = await gateway.findUser(chatId);
      if (!userId) {
        await reply('Primero vinculá tu cuenta desde Datos y preferencias → Telegram en https://17stomy.github.io/finance-app/#/datos');
        return json({ ok: true });
      }
      if (/^\/categorias(?:@\w+)?$/i.test(text)) {
        const categories = (await gateway.categories(userId)).filter((item) => item.kind === 'expense' || item.kind === 'all');
        const names = categories.slice(0, 50).map((item) => item.name.slice(0, 60));
        await reply(names.length ? 'Tus categorías:\n' + names.join('\n') + '\nEjemplo: 3000 en ' + names[0] : 'Todavía no tenés categorías de gastos. Podés crearlas en Planificación.');
        return json({ ok: true });
      }
      const expense = parseExpenseMessage(text);
      if (!expense) {
        await reply('No guardé ningún gasto. Escribí un importe positivo y una descripción, por ejemplo: 3000 en supermercado. Usá coma para centavos: 3.000,50. También podés indicar USD 20 en café.');
        return json({ ok: true });
      }
      const category = matchExpenseCategory(expense.name, await gateway.categories(userId));
      const result = await gateway.record({
        ...expense, updateId: update.update_id, chatId, messageId,
        date: argentinaMessageDate(message.date), categoryId: category?.id ?? null,
      });
      if (result.status === 'not_linked') {
        await reply('La cuenta se desvinculó. Volvé a conectarla desde la app para registrar gastos.');
        return json({ ok: true });
      }
      if (!result.replied) {
        const amount = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(result.amount!);
        const date = result.date!.split('-').reverse().join('/');
        await reply('Anoté ' + result.currency + ' ' + amount + ' en ' + result.name
          + '\nCategoría: ' + (result.categoryName ?? 'Sin categoría')
          + '\nFecha: ' + date + '\nPodés editarlo desde Movimientos en la app.');
        await gateway.markReplied(chatId, messageId);
      }
      return json({ ok: true });
    } catch {
      // A non-2xx asks Telegram to retry. The DB receipt prevents duplicate expenses,
      // including retries after a successful write but a failed confirmation message.
      return json({ error: 'Temporary failure' }, 503);
    }
  };
}
