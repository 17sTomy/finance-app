import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createTelegramHandler, type TelegramGateway } from './handler.ts';

const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const botId = Number(Deno.env.get('TELEGRAM_BOT_ID'));
const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const gateway: TelegramGateway = {
  async link(code, chatId, username) {
    const { data, error } = await supabase.rpc('complete_telegram_link', {
      p_bot_id: botId, p_token: code, p_chat_id: chatId, p_username: username,
    });
    if (error) throw new Error('Telegram account linking failed');
    return data;
  },
  async findUser(chatId) {
    const { data, error } = await supabase.from('telegram_connections').select('user_id')
      .eq('bot_id', botId).eq('chat_id', chatId).is('disconnected_at', null).maybeSingle();
    if (error) throw new Error('Telegram connection lookup failed');
    return data?.user_id ?? null;
  },
  async categories(userId) {
    const { data, error } = await supabase.from('categories').select('id, name, kind, parent_category_id').eq('user_id', userId);
    if (error) throw new Error('Category lookup failed');
    return data ?? [];
  },
  async record(expense) {
    const { data, error } = await supabase.rpc('record_telegram_expense', {
      p_bot_id: botId, p_update_id: expense.updateId, p_chat_id: expense.chatId, p_message_id: expense.messageId,
      p_name: expense.name, p_amount: expense.amount, p_currency: expense.currency, p_date: expense.date, p_category_id: expense.categoryId,
    });
    if (error) throw new Error('Telegram expense write failed');
    return data;
  },
  async markReplied(chatId, messageId) {
    const { error } = await supabase.from('telegram_receipts').update({ replied_at: new Date().toISOString() })
      .eq('bot_id', botId).eq('chat_id', chatId).eq('message_id', messageId);
    if (error) throw new Error('Telegram reply acknowledgement failed');
  },
  async reply(chatId, messageId, text) {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text, reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    // Never log the request URL or token.
    if (!response.ok || !body.ok) throw new Error('Telegram confirmation failed');
  },
};

const handler = createTelegramHandler(gateway, secret);
Deno.serve((request) => {
  if (!token || !Number.isSafeInteger(botId) || botId <= 0) return Response.json({ error: 'Bot not configured' }, { status: 503 });
  return handler(request);
});
