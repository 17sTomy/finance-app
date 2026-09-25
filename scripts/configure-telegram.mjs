import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = process.env.SUPABASE_BIN || 'supabase';
class SetupError extends Error {}
let tempDirectory;
let secretFile;
let stage = 'leer configuración';

async function post(url, body, authorization) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new SetupError('Falló ' + stage + ' (HTTP ' + response.status + ').');
  return response.json();
}
function run(args) {
  const result = spawnSync(cli, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) throw new SetupError('Falló ' + stage + '. Revisá la conexión y la autenticación de Supabase.');
}
try {
  const tokenPath = process.argv[2];
  if (!tokenPath) throw new SetupError('Uso: npm run configure:telegram -- /ruta/al/archivo-del-token');
  const token = (await readFile(tokenPath, 'utf8')).trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new SetupError('El archivo debe contener solamente el token entregado por BotFather.');
  const projectRef = (await readFile(join(root, 'supabase/.temp/project-ref'), 'utf8')).trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new SetupError('Primero vinculá este repositorio con supabase link.');
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) throw new SetupError('Definí SUPABASE_ACCESS_TOKEN para guardar la configuración del bot.');
  const telegram = (method, data = {}) => post('https://api.telegram.org/bot' + token + '/' + method, data);
  stage = 'validar el bot';
  const identity = await telegram('getMe');
  if (!identity.ok || !identity.result?.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(identity.result.username)) throw new SetupError('Telegram no reconoció el bot.');
  const bot = identity.result;
  const webhookUrl = 'https://' + projectRef + '.supabase.co/functions/v1/telegram-expense';
  const existing = await telegram('getWebhookInfo');
  if (!existing.ok) throw new SetupError('No pudimos consultar el webhook actual.');
  if (existing.result.url && existing.result.url !== webhookUrl) throw new SetupError('Este bot ya está conectado a otra aplicación. Su webhook se conservó.');
  const queryUrl = 'https://api.supabase.com/v1/projects/' + projectRef + '/database/query';
  const settings = await post(queryUrl + '/read-only', { query: 'select bot_id, enabled from public.telegram_settings where id = 1' }, accessToken);
  if (settings[0]?.enabled && String(settings[0].bot_id) !== String(bot.id)) throw new SetupError('Finance App ya tiene otro bot activo. Su configuración se conservó.');
  const secret = randomBytes(32).toString('hex');
  tempDirectory = await mkdtemp(join(tmpdir(), 'finance-telegram-'));
  secretFile = join(tempDirectory, 'secrets.env');
  await writeFile(secretFile, [
    'TELEGRAM_BOT_TOKEN=' + token, 'TELEGRAM_BOT_ID=' + bot.id, 'TELEGRAM_WEBHOOK_SECRET=' + secret, '',
  ].join('\n'), { mode: 0o600 });
  stage = 'guardar los secretos';
  run(['secrets', 'set', '--env-file', secretFile, '--project-ref', projectRef]);
  stage = 'publicar la función';
  run(['functions', 'deploy', 'telegram-expense', '--use-api', '--project-ref', projectRef]);
  stage = 'verificar la función';
  const unauthorized = await fetch(webhookUrl, { method: 'POST', body: '{}' });
  if (unauthorized.status !== 401) throw new SetupError('La función todavía no está lista o no rechaza peticiones sin el secreto. Podés reintentar.');
  const probe = await fetch(webhookUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ update_id: 0 }),
  });
  if (!probe.ok) throw new SetupError('La función no pasó la verificación autenticada.');
  stage = 'configurar los comandos';
  const commands = await telegram('setMyCommands', { commands: [
    { command: 'start', description: 'Vincular la cuenta de Finance App' },
    { command: 'ayuda', description: 'Cómo registrar un gasto' },
    { command: 'categorias', description: 'Ver tus categorías de gastos' },
  ] });
  if (!commands.ok) throw new SetupError('No pudimos configurar los comandos.');
  stage = 'conectar el webhook';
  const webhook = await telegram('setWebhook', { url: webhookUrl, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: false });
  if (!webhook.ok) throw new SetupError('Telegram rechazó el webhook.');
  stage = 'activar el bot en la app';
  await post(queryUrl, { query: "update public.telegram_settings set bot_id = " + bot.id + ", bot_username = '" + bot.username + "', enabled = true where id = 1" }, accessToken);
  const status = await telegram('getWebhookInfo');
  if (!status.ok || status.result.url !== webhookUrl) throw new SetupError('La verificación final del webhook falló.');
  console.log('Telegram configurado: https://t.me/' + bot.username);
  console.log('Vinculá tu cuenta desde Datos y preferencias → Telegram. No se modificó ningún gasto existente.');
} catch (error) {
  // Fetch errors can include the secret-bearing Telegram URL. Never print them.
  console.error(error instanceof SetupError ? error.message : 'No se pudo completar el paso: ' + stage + '. Revisá los archivos y la conexión.');
  process.exitCode = 1;
} finally {
  if (secretFile) await unlink(secretFile).catch(() => {});
  if (tempDirectory) await rmdir(tempDirectory).catch(() => {});
}
