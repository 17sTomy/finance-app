import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const html = await readFile(resolve(dist, 'index.html'), 'utf8');
const manifestPath = html.match(/rel="manifest" href="([^"]+)"/)?.[1];
assert.ok(manifestPath?.startsWith('/'), 'Build must link the manifest at its Vite base');
const base = manifestPath.slice(0, -'manifest.webmanifest'.length);
let workerRevision = 1;
let probeRequests = 0;
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/__pwa-observer') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>PWA observer</title>');
    return;
  }
  if (pathname === `${base}__api-probe`) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ request: ++probeRequests, method: request.method }));
    return;
  }
  if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
  const relative = pathname.slice(base.length) || 'index.html';
  const filename = resolve(dist, relative);
  if (!filename.startsWith(`${dist}/`)) { response.writeHead(404).end(); return; }
  try {
    let body = await readFile(filename);
    if (relative === 'sw.js') body = Buffer.concat([body, Buffer.from(`\n// QA revision ${workerRevision}\n`)]);
    response.setHeader('Content-Type', mime[extname(filename)] ?? 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const appUrl = `${origin}${base}`;
const profile = await mkdtemp(resolve(tmpdir(), 'finance-pwa-qa-'));
let context;

try {
  // A fresh persistent profile exercises installation in a normal browser, not incognito.
  context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath: process.env.QA_BROWSER_PATH || undefined,
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  // This QA never accesses a real backend, even if dist contains production configuration.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort('blockedbyclient'));
  const observer = await context.newPage();
  await observer.goto(`${origin}/__pwa-observer`);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Seed existing storage before the application can register its first worker.
  const stored = {
    'sb-pwa-qa-auth-token': JSON.stringify({ marker: 'synthetic-session' }),
    'finance-app:draft:pwa-qa:fixture': JSON.stringify({ marker: 'unsaved-finances', amount: 12345 }),
  };
  await page.goto(`${origin}/__pwa-observer`);
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    sessionStorage.setItem('finance-app:draft-pointer:pwa-qa', 'finance-app:draft:pwa-qa:fixture');
  }, stored);
  await page.goto(`${appUrl}#/login`);
  await page.getByRole('heading', { name: 'Ingresar', exact: true }).waitFor();

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const response = await fetch(link.href);
    return { url: link.href, status: response.status, type: response.headers.get('content-type'), data: await response.json() };
  });
  assert.equal(manifest.status, 200);
  assert.match(manifest.type, /application\/manifest\+json/);
  assert.equal(manifest.data.display, 'standalone');
  for (const property of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest.data[property], manifest.url).href, appUrl);
  for (const size of ['192x192', '512x512']) assert.ok(manifest.data.icons.some((icon) => icon.sizes === size && icon.purpose === 'any'));
  assert.ok(manifest.data.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.data.icons) {
    const dimensions = await page.evaluate(async (url) => {
      const image = new Image(); image.src = url; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, new URL(icon.src, manifest.url).href);
    assert.equal(dimensions, icon.sizes);
  }
  const appleIcon = await page.evaluate(async () => {
    const image = new Image(); image.src = document.querySelector('link[rel="apple-touch-icon"]').href; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  assert.deepEqual(appleIcon, [180, 180]);

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.equal(scope, appUrl);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
  await page.getByRole('heading', { name: 'Ingresar', exact: true }).waitFor();
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installabilityErrors, [], 'Chromium must recognize an installable application');
  assert.equal(await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperty(event, 'prompt', { value: async () => undefined });
    Object.defineProperty(event, 'userChoice', { value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }) });
    return window.dispatchEvent(event);
  }), false, 'The application must retain the install prompt before entering Settings');

  const probe = await page.evaluate(async (url) => [
    await (await fetch(url)).json(), await (await fetch(url)).json(),
    await (await fetch(url, { method: 'POST', body: 'synthetic' })).json(),
  ], `${appUrl}__api-probe`);
  assert.deepEqual(probe, [{ request: 1, method: 'GET' }, { request: 2, method: 'GET' }, { request: 3, method: 'POST' }]);
  const assertStorage = async () => {
    assert.deepEqual(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), Object.keys(stored)), stored);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('finance-app:draft-pointer:pwa-qa')), 'finance-app:draft:pwa-qa:fixture');
    assert.deepEqual(await page.evaluate(() => caches.keys()), [], 'The worker must not cache data or responses');
  };
  await assertStorage();

  await page.getByLabel('Email', { exact: true }).fill('sin-guardar@example.test');
  workerRevision = 2;
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'sin-guardar@example.test', 'An update must preserve the open form');
  await assertStorage();

  await context.setOffline(true);
  const offline = await page.reload();
  assert.equal(offline.status(), 503);
  assert.equal(offline.fromServiceWorker(), true);
  await page.getByRole('heading', { name: 'Necesitás conexión' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/login');
  await assertStorage();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await page.getByRole('heading', { name: 'Ingresar', exact: true }).waitFor();
  await assertStorage();

  // The observer predates registration and is uncontrolled, so it doesn't block activation.
  assert.equal(await observer.evaluate(() => navigator.serviceWorker.controller), null);
  await page.close();
  await observer.waitForFunction(async (url) => {
    const registration = await navigator.serviceWorker.getRegistration(url);
    return registration?.active?.state === 'activated' && !registration.waiting && !registration.installing;
  }, appUrl);
  assert.deepEqual(errors, []);

  // Registration errors must not break the normal online application.
  const blocked = await context.browser().newContext({ serviceWorkers: 'block' });
  await blocked.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const fallback = await blocked.newPage();
  await fallback.goto(appUrl);
  await fallback.getByRole('heading', { name: 'Ingresar', exact: true }).waitFor();
  await blocked.close();
  console.log(`PWA QA passed at ${base}: manifest, icons, installability, storage, network, offline recovery and safe updates.`);
} finally {
  await context?.close();
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true });
}
