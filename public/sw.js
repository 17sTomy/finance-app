// Only document navigations use this worker. Assets, Auth, Supabase requests and
// financial data keep their existing network/storage behavior. No response cache.
const offlinePage = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f4f1fb">
    <title>Sin conexión · Finance's App</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; background: #f4f1fb; color: #302942; }
      body { margin: 0; min-height: 100dvh; display: grid; place-items: center; }
      main { max-width: 28rem; padding: 2rem; text-align: center; }
      p { line-height: 1.6; }
      button { font: inherit; font-weight: 600; background: #7867b7; color: white; border: 0; border-radius: .8rem; padding: .9rem 1.3rem; cursor: pointer; }
      button:focus-visible { outline: 3px solid #302942; outline-offset: 4px; }
    </style>
  </head>
  <body>
    <main>
      <p>Finance's App</p>
      <h1>Necesitás conexión</h1>
      <p>Conectate a internet para cargar y sincronizar tus finanzas.</p>
      <button type="button" onclick="window.location.reload()">Volver a intentar</button>
    </main>
  </body>
</html>`;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  if (!request.url.startsWith(self.registration.scope)) return;

  event.respondWith(fetch(request).catch(() => new Response(offlinePage, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })));
});

// No skipWaiting/clients.claim: installing or updating cannot replace a running
// application. The browser activates updates once the previous clients close.
