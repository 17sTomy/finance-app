import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:4174';
const supabaseUrl = process.env.QA_SUPABASE_URL;
const supabaseKey = process.env.QA_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.QA_SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey || !serviceRoleKey) throw new Error('Definí QA_SUPABASE_URL, QA_SUPABASE_ANON_KEY y QA_SUPABASE_SERVICE_ROLE_KEY para ejecutar el QA autenticado local.');
const supabaseHost = new URL(supabaseUrl).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(supabaseHost)) throw new Error('El E2E solo puede ejecutarse contra una instancia local de Supabase.');

const outputDir = new URL('./', import.meta.url);
await mkdir(outputDir, { recursive: true });
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174'], {
  cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
let serverReady = false;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try { const response = await fetch(`${baseUrl}/`); if (response.ok) { serverReady = true; break; } } catch { /* starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!serverReady) throw new Error(`El servidor de QA no inició. ${serverOutput}`);

const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emailToken = unique.replace(/[^a-z0-9]/gi, '');
const emailA = `financeqaa${emailToken}@gmail.com`;
const emailB = `financeqab${emailToken}@gmail.com`;
const password = 'Finance-QA-2026!';
const apiA = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const apiB = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUserIds = [];
for (const [email, nickname] of [[emailA, 'QA Inicial'], [emailB, 'QA Secundario']]) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nickname } });
  if (error || !data.user) throw new Error(`No se pudo preparar el usuario temporal ${email}: ${error?.message ?? 'sin usuario'}`);
  createdUserIds.push(data.user.id);
}
const credentialProbe = await apiA.auth.signInWithPassword({ email: emailA, password });
if (credentialProbe.error) throw new Error(`El usuario temporal no acepta sus credenciales: ${credentialProbe.error.message}`);
await apiA.auth.signOut();

const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'es-AR' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const checks = [];
const check = (name) => checks.push({ name, ok: true });

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Ingresar' }).waitFor();
  assert(page.url().includes('#/login'), 'Una vista privada no redirigió al login');
  check('ruta privada protegida');

  await page.getByRole('button', { name: '¿No tenés cuenta? Registrate' }).click();
  assert(await page.getByLabel('Apodo').count() === 1, 'El registro no solicita un apodo');
  await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await page.getByLabel('Email').fill(emailA);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  try {
    await page.locator('.summary-grid').waitFor({ timeout: 15000 });
  } catch (error) {
    throw new Error(`El registro no abrió el dashboard. URL: ${page.url()}. Pantalla: ${await page.locator('body').innerText()}`, { cause: error });
  }
  assert(await page.getByRole('heading', { name: /Hola, QA Inicial/ }).count() === 1, 'El apodo del registro no aparece en el saludo');
  check('registro con apodo, sesión y carga autenticada');

  await page.goto(`${baseUrl}/#/datos`, { waitUntil: 'domcontentloaded' });
  const nicknameInput = page.getByLabel('Apodo');
  await nicknameInput.waitFor();
  assert(await nicknameInput.inputValue() === 'QA Inicial', 'Datos no recuperó el apodo registrado');
  await nicknameInput.fill('QA Editado');
  const saveNicknameButton = page.getByRole('button', { name: 'Guardar apodo' });
  assert(await nicknameInput.inputValue() === 'QA Editado', 'El campo de apodo no acepta cambios');
  assert(!(await saveNicknameButton.isDisabled()), 'Guardar apodo sigue deshabilitado después de editarlo');
  await saveNicknameButton.click();
  await page.locator('.sidebar__footer strong').filter({ hasText: 'QA Editado' }).waitFor();
  await page.getByRole('button', { name: /Restablecer datos demo/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await page.locator('.toast-message').filter({ hasText: 'Datos demo restaurados.' }).waitFor();
  await page.waitForTimeout(700);
  assert(await page.locator('.data-error').count() === 0, `Falló el guardado demo: ${await page.locator('.data-error').allTextContents()}`);

  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.summary-grid').waitFor();
  assert(await page.getByRole('heading', { name: /Hola, QA Editado/ }).count() === 1, 'El apodo editado no aparece en el saludo');
  assert(await page.locator('.sidebar__footer strong').filter({ hasText: 'QA Editado' }).count() === 1, 'El apodo editado no aparece en el menú lateral');
  await page.waitForTimeout(500);
  await page.screenshot({ path: fileURLToPath(new URL('dashboard-desktop.png', outputDir)), fullPage: true });
  const legend = await page.locator('.chart-legend > div').evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y) };
  }));
  assert(new Set(legend.map((item) => item.y)).size <= 5, 'La leyenda de categorías supera cinco filas');
  if (legend.length > 5) assert(new Set(legend.map((item) => item.x)).size > 1, 'La leyenda no usa múltiples columnas');
  assert(await page.locator('.category-card .recharts-wrapper').evaluate((item) => getComputedStyle(item).outlineStyle) === 'none', 'El gráfico conserva borde de foco negro');
  const upcomingCard = page.locator('.upcoming-card');
  assert(await upcomingCard.getByText('Alquiler', { exact: true }).count() === 0, 'Próximos pagos todavía muestra un vencimiento pasado');
  const netflixIsUpcoming = new Date().toISOString().slice(0, 10) <= '2026-08-22';
  assert(await upcomingCard.getByText('Netflix', { exact: true }).count() === (netflixIsUpcoming ? 1 : 0), 'Próximos pagos no respeta la fecha actual');
  assert(await page.getByText('Movimientos del mes', { exact: true }).count() === 1, 'El dashboard no muestra los movimientos del mes');
  await page.getByRole('link', { name: 'Gestionar' }).click();
  assert(page.url().includes('#/planificacion?tab=limits'), 'Gestionar límites no abre Planificación');
  check('dashboard, próximos pagos, movimientos y navegación de límites');

  const sportsLimit = page.locator('.limit-card').filter({ hasText: 'Deportes' });
  await sportsLimit.waitFor({ timeout: 10000 });
  assert(await sportsLimit.count() === 1, 'No se encontró el límite principal de Deportes');
  assert(await sportsLimit.getByRole('button', { name: 'Ver desglose por subcategoría' }).count() === 0, 'La tarjeta todavía muestra el disparador redundante del desglose');
  const sportsInner = sportsLimit.locator('.limit-card__inner');
  const sportsBack = sportsLimit.locator('.limit-card__back');
  const initialTransform = await sportsInner.evaluate((item) => getComputedStyle(item).transform);
  await sportsLimit.hover();
  await page.waitForTimeout(700);
  const flippedTransform = await sportsInner.evaluate((item) => getComputedStyle(item).transform);
  assert(flippedTransform !== initialTransform && flippedTransform !== 'none', 'La tarjeta no rota al pasar el mouse');
  const sportsDetail = await sportsBack.innerText();
  assert(sportsDetail.includes('Categoría principal') && sportsDetail.includes('Detalle de Deportes'), 'La cara posterior no identifica la categoría principal');
  assert(sportsDetail.includes('Gimnasio') && sportsDetail.includes('Básquet'), 'La cara posterior no enumera las subcategorías de Deportes');
  assert(sportsDetail.includes('% usado'), 'La cara posterior no muestra el porcentaje utilizado');
  assert(!sportsDetail.includes('Sin subcategoría'), 'La cara posterior muestra una fila directa sin consumos');
  assert(!sportsDetail.includes('superado suavemente'), 'Un exceso de límite todavía se describe como suave');
  await page.screenshot({ path: fileURLToPath(new URL('planning-limits-flipped.png', outputDir)), fullPage: true });

  await page.getByRole('button', { name: 'Categorías', exact: true }).click();
  const sportsAccordion = page.getByRole('button', { name: 'Mostrar subcategorías de Deportes' });
  await sportsAccordion.waitFor({ timeout: 10000 });
  assert(await sportsAccordion.count() === 1, 'No se encontró el acordeón de la categoría Deportes');
  await sportsAccordion.click();
  const sportsChildren = page.locator('.category-accordion__children').filter({ hasText: 'Gimnasio' });
  assert(await sportsChildren.count() === 1 && await sportsChildren.isVisible(), 'El acordeón no muestra las subcategorías');
  assert((await sportsChildren.innerText()).includes('Básquet'), 'El acordeón no vincula todas las subcategorías de Deportes');
  await page.screenshot({ path: fileURLToPath(new URL('planning-categories-accordion.png', outputDir)), fullPage: true });
  check('jerarquía de categorías, acordeón y desglose del límite');

  await page.getByLabel('Mes siguiente').click();
  await page.getByRole('button', { name: 'Límites', exact: true }).click();
  await page.locator('.limit-card').filter({ hasText: 'Deportes' }).waitFor();
  assert(await page.locator('.limit-card').count() === 4, 'Septiembre no heredó los cuatro límites de agosto');
  await page.getByRole('button', { name: 'Objetivos', exact: true }).click();
  const septemberTrip = page.locator('.goal-card').filter({ hasText: 'Viaje' });
  const septemberEmergency = page.locator('.goal-card').filter({ hasText: 'Fondo de emergencia' });
  assert((await septemberTrip.innerText()).includes('60% acumulado'), 'El objetivo total no conserva su progreso acumulado en septiembre');
  assert((await septemberEmergency.innerText()).includes('0% del mes'), 'El objetivo porcentual no se reinicia en septiembre');
  await page.getByLabel('Mes anterior').click();
  await page.getByLabel('Mes anterior').click();
  const julyTrip = page.locator('.goal-card').filter({ hasText: 'Viaje' });
  assert((await julyTrip.innerText()).includes('0% acumulado'), 'Un aporte de agosto aparece al mirar julio');
  await page.getByLabel('Mes siguiente').click();
  check('límites heredados y progreso histórico de objetivos');

  await page.getByRole('link', { name: 'Análisis' }).click();
  await page.getByText('Flujo del mes', { exact: true }).waitFor();
  assert(await page.getByText('Evolución del balance', { exact: true }).count() === 0, 'Todavía se muestra Evolución del balance');
  const chartOutlines = await page.locator('.recharts-wrapper').evaluateAll((items) => items.map((item) => getComputedStyle(item).outlineStyle));
  assert(chartOutlines.every((value) => value === 'none'), 'Algún gráfico conserva borde negro');
  await page.screenshot({ path: fileURLToPath(new URL('analysis-desktop.png', outputDir)), fullPage: true });
  check('análisis sin gráfico removido ni bordes');

  await page.getByRole('link', { name: 'Inicio' }).click();
  await page.getByRole('button', { name: 'Comprar/vender USD' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Compra USD QA');
  await dialog.getByLabel('Cantidad de dólares').fill('100');
  await dialog.getByLabel('Tipo de cambio (ARS por USD)').fill('1500');
  await dialog.getByLabel('Fecha').fill('2026-08-18');
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await page.getByRole('button', { name: 'Comprar/vender CEDEAR' }).click();
  dialog = page.getByRole('dialog');
  const cedearValues = await dialog.getByLabel('CEDEAR').locator('option').evaluateAll((options) => options.map((option) => option.value));
  assert(['AAPL', 'AMZN', 'KO', 'XOM', 'GOOGL', 'NVDA', 'MSFT'].every((ticker) => cedearValues.includes(ticker)), 'Faltan los nuevos CEDEARs en el formulario');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  check('compra USD con cotización y nuevos CEDEARs');

  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Prueba QA Supabase');
  await dialog.getByLabel('Importe').fill('12345');
  await dialog.getByLabel('Fecha').fill('2026-08-15');
  await dialog.getByLabel('Categoría', { exact: true }).selectOption({ label: '🏅 Deportes' });
  await dialog.getByLabel('Subcategoría (opcional)', { exact: true }).selectOption({ label: '🏋️ Gimnasio' });
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await page.getByRole('link', { name: 'Movimientos', exact: true }).click();
  await page.getByText('Prueba QA Supabase', { exact: true }).waitFor();
  const categorizedMovement = page.locator('.transaction-row').filter({ hasText: 'Prueba QA Supabase' });
  assert((await categorizedMovement.innerText()).includes('Deportes · Gimnasio'), 'El movimiento no conservó la categoría y subcategoría seleccionadas');
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Prueba QA Supabase', { exact: true }).waitFor();
  check('CRUD persistido después de recargar');

  const notebookRow = page.locator('.transaction-row').filter({ hasText: 'Notebook' });
  assert(await notebookRow.count() === 1, 'No se encontró la cuota de Notebook para probar su eliminación');
  await notebookRow.getByRole('button', { name: 'Eliminar Notebook' }).click();
  dialog = page.getByRole('dialog');
  assert((await dialog.innerText()).includes('plan de cuotas completo'), 'La confirmación no informa el borrado completo de cuotas');
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await page.waitForTimeout(700);

  await page.getByRole('link', { name: 'Planificación' }).click();
  await page.getByRole('button', { name: 'Objetivos' }).click();
  await page.getByRole('button', { name: '+ Aportar' }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe').fill('10000');
  await dialog.getByRole('button', { name: 'Registrar aporte' }).click();
  await page.waitForTimeout(700);
  const { data: authA, error: signInAError } = await apiA.auth.signInWithPassword({ email: emailA, password });
  assert(!signInAError && authA.user, `No se pudo reautenticar el usuario A: ${signInAError?.message}`);
  assert(authA.user.user_metadata.nickname === 'QA Editado', 'El apodo editado no persistió en Supabase Auth');
  const { data: dollarPurchase, error: dollarPurchaseError } = await apiA.from('transactions').select('amount, exchange_rate, asset_action').eq('name', 'Compra USD QA').single();
  assert(!dollarPurchaseError && dollarPurchase.amount === 100 && dollarPurchase.exchange_rate === 1500 && dollarPurchase.asset_action === 'buy', 'La compra USD no guardó cantidad, cotización y operación');
  const { data: notebookPlans, error: notebookPlansError } = await apiA.from('installment_plans').select('id').eq('description', 'Notebook');
  const { data: notebookInstallments, error: notebookInstallmentsError } = await apiA.from('transactions').select('id').eq('name', 'Notebook');
  assert(!notebookPlansError && !notebookInstallmentsError && notebookPlans?.length === 0 && notebookInstallments?.length === 0, 'Eliminar una cuota no eliminó el plan y sus cuotas futuras');
  check('borrado completo y persistido del plan de cuotas');
  const { data: contributions, error: contributionsError } = await apiA.from('goal_contributions').select('transaction_id, amount').eq('amount', 10000);
  assert(!contributionsError && contributions?.length === 1 && contributions[0].transaction_id, 'El aporte no quedó persistido y vinculado');
  const { data: savingMovement, error: movementError } = await apiA.from('transactions').select('id, goal_id, type').eq('id', contributions[0].transaction_id).single();
  assert(!movementError && savingMovement.type === 'saving' && savingMovement.goal_id, 'El aporte no generó el movimiento de ahorro sincronizado');
  check('aporte y movimiento guardados atómicamente');

  const { data: authB, error: signInBError } = await apiB.auth.signInWithPassword({ email: emailB, password });
  assert(!signInBError && authB.user, `No se pudo autenticar el usuario B: ${signInBError?.message}`);
  const userAId = authA.user.id;
  const { data: leakedRows, error: selectOtherError } = await apiB.from('transactions').select('id').eq('user_id', userAId);
  assert(!selectOtherError && leakedRows?.length === 0, 'RLS permitió leer movimientos del usuario A');
  const ownCategories = await apiA.from('categories').select('id').limit(1);
  assert(!ownCategories.error && ownCategories.data?.[0], 'El usuario A no tiene categorías para la prueba RLS');
  const { error: forgedInsertError } = await apiB.from('transactions').insert({
    user_id: userAId, name: 'Ataque QA', amount: 1, currency: 'ARS', type: 'expense', transaction_date: '2026-08-17', category_id: ownCategories.data[0].id,
  });
  assert(forgedInsertError, 'RLS permitió insertar usando el user_id de otro usuario');
  const forgedUpdate = await apiB.from('transactions').update({ amount: 2 }).eq('id', savingMovement.id).select('id');
  assert(!forgedUpdate.error && forgedUpdate.data?.length === 0, 'RLS permitió actualizar un movimiento de otro usuario');
  const forgedDelete = await apiB.from('transactions').delete().eq('id', savingMovement.id).select('id');
  assert(!forgedDelete.error && forgedDelete.data?.length === 0, 'RLS permitió eliminar un movimiento de otro usuario');
  check('aislamiento RLS entre dos usuarios');

  await page.getByLabel('Ocultar importes').click();
  assert(await page.getByText('$••••', { exact: true }).count() >= 1, 'La privacidad no conserva el símbolo monetario');
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('Mostrar importes').waitFor({ timeout: 15000 });
  assert(await page.getByText('$••••', { exact: true }).count() >= 1, 'La preferencia de privacidad no persistió');
  check('preferencias sincronizadas');

  await page.close();
  const { data: financeSnapshot, error: snapshotError } = await apiA.rpc('get_finance_data');
  assert(!snapshotError && Number.isSafeInteger(financeSnapshot?.revision), 'No se pudo leer la revisión financiera para probar concurrencia');
  const expectedRevision = financeSnapshot.revision;
  const emptyPayload = { categories: [], fixed_expenses: [], recurring_incomes: [], installment_plans: [], savings_goals: [], transactions: [], monthly_limits: [], calendar_events: [], goal_contributions: [] };
  const firstWrite = await apiA.rpc('replace_finance_data', { p_data: emptyPayload, p_expected_revision: expectedRevision });
  assert(!firstWrite.error, `La escritura con revisión vigente falló: ${firstWrite.error?.code ?? 'error desconocido'}`);
  const { data: advancedSnapshot, error: advancedSnapshotError } = await apiA.rpc('get_finance_data');
  assert(!advancedSnapshotError && advancedSnapshot?.revision === expectedRevision + 1, 'La primera escritura no avanzó la revisión exactamente una vez');
  const staleWrite = await apiA.rpc('replace_finance_data', { p_data: emptyPayload, p_expected_revision: expectedRevision });
  assert(staleWrite.error?.code === 'PT409', `Una escritura obsoleta no fue rechazada por la revisión optimista: ${staleWrite.error?.code ?? 'sin error'}`);
  check('concurrencia optimista rechaza snapshots obsoletos');

  assert(errors.length === 0, `Errores de navegador: ${errors.join(' | ')}`);
  check('consola del navegador limpia');
  await writeFile(new URL('report.json', outputDir), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks: checks.map((item) => item.name) }, null, 2));
} catch (error) {
  console.error(serverOutput);
  console.error('Errores capturados en navegador:', errors);
  throw error;
} finally {
  await browser.close();
  server.kill();
  await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
}
