import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const outputDir = new URL('./', import.meta.url);
await mkdir(outputDir, { recursive: true });
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173'], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
let serverReady = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try { const response = await fetch('http://127.0.0.1:5173/'); if (response.ok) { serverReady = true; break; } } catch { /* server is still starting */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!serverReady) throw new Error(`El servidor de QA no inició. ${serverOutput}`);
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'es-AR' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('fonts.googleapis')) errors.push(message.text()); });

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const report = [];
const check = (name) => report.push({ name, ok: true });

try {
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.locator('.summary-grid').waitFor();
await page.waitForTimeout(1800);
await page.screenshot({ path: new URL('dashboard-desktop.png', outputDir).pathname.slice(1), fullPage: true });
assert((await page.getByText('Balance disponible', { exact: true }).count()) === 1, 'No se renderizó el dashboard');
check('dashboard desktop');

await page.getByLabel('Mes anterior').click();
assert((await page.locator('.month-selector').innerText()).includes('Julio 2026'), 'No navegó al mes anterior');
await page.getByLabel('Mes siguiente').click();
assert((await page.locator('.month-selector').innerText()).includes('Agosto 2026'), 'No regresó al mes seleccionado');
check('navegación entre snapshots mensuales');

await page.getByLabel('Ocultar importes').click();
assert((await page.getByText('••••••', { exact: true }).count()) >= 4, 'No se ocultaron globalmente los importes');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.summary-grid').waitFor();
assert((await page.getByText('••••••', { exact: true }).count()) >= 4, 'No persistió la privacidad después de recargar');
await page.getByLabel('Mostrar importes').click();
check('privacidad global persistente');

await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
let dialog = page.getByRole('dialog');
await dialog.getByLabel('Nombre').fill('Prueba QA');
await dialog.getByLabel('Importe').fill('12345');
await dialog.getByLabel('Fecha').fill('2026-08-15');
await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
await page.getByRole('link', { name: 'Movimientos' }).click();
await page.getByText('Prueba QA', { exact: true }).waitFor();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByText('Prueba QA', { exact: true }).waitFor();
check('alta y persistencia tras recarga');

await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
dialog = page.getByRole('dialog');
await dialog.getByLabel('Nombre').fill('Celular QA');
await dialog.getByLabel('Importe').fill('12000');
await dialog.getByLabel('Fecha').fill('2026-08-15');
await dialog.getByLabel('Es una compra en cuotas').check();
await dialog.getByLabel('Cantidad de cuotas').fill('3');
await dialog.getByRole('button', { name: 'Crear plan de cuotas' }).click();
await page.waitForTimeout(150);
const installmentState = await page.evaluate(() => JSON.parse(localStorage.getItem('titus-finance:data:v1')));
const qaPlan = installmentState.installmentPlans.find((item) => item.description === 'Celular QA');
assert(qaPlan, 'No se guardó el plan de cuotas');
const qaInstallments = Object.values(installmentState.months).flatMap((month) => month.transactions).filter((item) => item.installmentPlanId === qaPlan.id);
assert(qaInstallments.length === 3 && qaInstallments.every((item) => item.installmentCount === 3), 'Las cuotas no conservaron su vínculo');
check('plan de cuotas vinculado');

assert(installmentState.fixedExpenses.length > 0, 'No existen recurrencias');
assert(installmentState.months['2026-08'].transactions.some((item) => item.recurrenceId === 'rent'), 'No se proyectó la recurrencia de alquiler');
check('recurrencias proyectadas sin duplicación');

await page.getByRole('link', { name: 'Calendario' }).click();
await page.locator('.calendar-grid').waitFor();
assert((await page.locator('.event-label').count()) > 0, 'El calendario no muestra eventos financieros');
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.calendar-grid').waitFor();
await page.screenshot({ path: new URL('calendar-mobile.png', outputDir).pathname.slice(1), fullPage: true });
const dimensions = await page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
assert(dimensions.scroll <= dimensions.inner, `Hay scroll horizontal: ${dimensions.scroll}px > ${dimensions.inner}px`);
assert(await page.locator('.bottom-nav').isVisible(), 'La navegación móvil inferior no está visible');
check('calendario y layout mobile sin scroll horizontal');

await page.goto('http://127.0.0.1:5173/#/datos', { waitUntil: 'domcontentloaded' });
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: /Mes actual/ }).click();
const download = await downloadPromise;
const exportPath = new URL('month-export.json', outputDir).pathname.slice(1);
await download.saveAs(exportPath);
await page.locator('input[type="file"]').setInputFiles(exportPath);
await page.waitForTimeout(500);
const importMessage = await page.locator('.toast-message').innerText();
assert(importMessage.includes('Datos importados correctamente.'), `Falló la importación: ${importMessage}`);
check('exportación e importación JSON');

assert(errors.length === 0, `Errores de navegador: ${errors.join(' | ')}`);
check('consola del navegador limpia');
await writeFile(new URL('report.json', outputDir), JSON.stringify({ passed: report.length, checks: report, errors }, null, 2));
console.log(JSON.stringify({ passed: report.length, checks: report.map((item) => item.name) }, null, 2));
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  await browser.close();
  server.kill();
}
