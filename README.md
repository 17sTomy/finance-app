# Titu's Finance

Aplicación responsive de finanzas personales desarrollada con React, TypeScript, Vite y Supabase. El frontend se conecta directamente mediante `@supabase/supabase-js`; Supabase Auth identifica al usuario y PostgreSQL aplica Row Level Security (RLS) en cada tabla privada.

## Arquitectura

```text
Frontend React
    ↓
supabase-js
    ↓
Supabase Auth
    ↓
PostgreSQL + RLS
```

- `src/app`: composición, rutas, Auth y providers.
- `src/modules`: dominio y presentación por feature.
- `src/infrastructure/persistence`: repositorio Supabase y mappers DB ↔ dominio.
- `src/lib`: cliente central y tipos de PostgreSQL.
- `supabase/migrations`: schema, constraints, triggers, RLS y funciones reproducibles.
- `scripts`: importación automatizada de respaldos JSON anteriores.

Los componentes no realizan consultas directas. `FinanceProvider` conserva la misma estructura `FinanceDatabase` para la UI y el repositorio la transforma a tablas normalizadas.

## Crear un proyecto Supabase desde cero

1. Creá un proyecto en [Supabase](https://supabase.com/dashboard).
2. En **Project Settings → API**, copiá:
   - Project URL.
   - Publishable key o `anon` key.
   - Nunca copies la `service_role` al frontend.
3. Aplicá las migraciones versionadas:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

4. Copiá `.env.example` como `.env.local`:

```env
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
```

5. En **Authentication → URL Configuration**, agregá como redirect URLs:
   - `http://localhost:5173/**`
   - la URL publicada de GitHub Pages.
6. Registrá los dos usuarios desde la aplicación o desde **Authentication → Users**. Cuando ambos existan, podés deshabilitar nuevos registros públicos en la configuración de Auth.

Ser administrador del proyecto Supabase no habilita acceso cruzado dentro de la aplicación. Ambos usuarios siguen aislados por RLS; la administración del proyecto ocurre desde el Dashboard de Supabase.

## Desarrollo

```bash
npm install
npm run dev
```

Verificaciones:

```bash
npm test
npm run lint
npm run build
```

Para validar las migraciones con una instancia local de Supabase/Docker:

```bash
npx supabase start
npx supabase db reset
npx supabase db lint --local --level warning
```

El QA integral crea dos usuarios temporales y comprueba Auth, CRUD, recarga, sincronización aporte/movimiento y aislamiento RLS. Primero compilá apuntando al Supabase local y luego ejecutá:

```powershell
$env:QA_SUPABASE_URL='http://127.0.0.1:54321'
$env:QA_SUPABASE_ANON_KEY='TU_CLAVE_PUBLICA_LOCAL'
npm run test:e2e
```

La URL y la clave pública local aparecen al ejecutar `npx supabase status`.

## Migrar un respaldo JSON anterior

La pantalla **Datos** sigue aceptando las exportaciones JSON de la versión local. También se incluye un importador idempotente por usuario:

```powershell
$env:SUPABASE_URL='https://TU_PROJECT_REF.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='TU_PUBLISHABLE_KEY'
$env:SUPABASE_EMAIL='usuario@ejemplo.com'
$env:SUPABASE_PASSWORD='contraseña-del-usuario'
node scripts/import-finance-json.mjs .\respaldo.json
```

El script inicia sesión como el usuario de destino, genera UUID determinísticos para los IDs anteriores y llama a la misma función transaccional protegida por RLS. No necesita ni acepta una service-role key. Ejecutarlo nuevamente con el mismo usuario y archivo no duplica registros.

## Deploy en GitHub Pages

Configurá en el repositorio:

- Variable `VITE_SUPABASE_URL`.
- Variable `VITE_SUPABASE_PUBLISHABLE_KEY` (es pública; nunca uses una secret/service-role key).

Cada push a `main` ejecuta tests, compila y publica la aplicación. La navegación usa hash para funcionar correctamente en hosting estático.

## Seguridad

- Todas las tablas privadas tienen RLS habilitado.
- Las policies comparan `user_id` con `(select auth.uid())` para SELECT/INSERT/UPDATE/DELETE.
- Los inserts normales omiten `user_id`; PostgreSQL lo obtiene de la sesión.
- Triggers adicionales impiden referencias entre entidades de usuarios diferentes.
- La función de reemplazo/importación ignora cualquier `user_id` del JSON y opera únicamente sobre `auth.uid()`.
- No se incluye ninguna secret key en el código ni en el bundle.
