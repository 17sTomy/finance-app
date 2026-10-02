# Finance's App

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
$env:QA_SUPABASE_SERVICE_ROLE_KEY='TU_SERVICE_ROLE_LOCAL'
npm run test:e2e
```

La URL y ambas claves locales aparecen al ejecutar `npx supabase status`. La service-role se usa únicamente para crear y eliminar usuarios temporales contra `localhost`; nunca se incorpora al frontend.

El workflow de CI levanta esa misma stack local con Docker, aplica las migraciones desde cero, instala Chromium y ejecuta el E2E antes de habilitar el deploy. El runner rechaza cualquier `QA_SUPABASE_URL` cuyo host no sea `127.0.0.1`, `localhost` o `::1`, por lo que este flujo no puede apuntar a producción. Para reproducirlo localmente hacen falta Docker, la CLI incluida en las dependencias del proyecto y Chromium administrado por Playwright (`npx playwright-core install chromium`).

## Dólares sin costo y saldo entre meses

En **Nuevo movimiento → Ahorro en dólares → Sin costo**, la cantidad recibida se suma a la tenencia USD con costo de $0 en pesos. También se admite una compra con cotización 0. Las ventas siguen requiriendo una cotización positiva. El almacenamiento utiliza la operación `buy` con `exchange_rate = 0`, compatible con la migración existente `20260831140000_zero_cost_dollar_savings.sql`.

El **Balance disponible** del dashboard y de Análisis suma el saldo de todos los meses anteriores registrados y el resultado del mes seleccionado. Por ejemplo, un cierre de −$90.000 más un sueldo de $1.000.000 da $910.000 disponibles antes de nuevos gastos. Se muestran por separado **Saldo anterior** y **Resultado del mes**; los ingresos, gastos y gráficos mensuales siguen representando sólo ese mes. El arrastre se recalcula al editar o borrar movimientos históricos, sin crear movimientos adicionales, y no incluye meses futuros ni proyecta períodos sin registros.

## Cambios de sueldo por mes

Editar, pausar o reactivar un sueldo recurrente desde **Gastos fijos** aplica las nuevas condiciones desde el mes seleccionado inclusive. Se actualizan los meses futuros ya creados y las proyecciones de meses nuevos. Los meses anteriores mantienen sus movimientos y las condiciones vigentes en su momento, incluso si se abren por primera vez después del cambio. Una edición reemplaza las condiciones programadas desde el mes elegido en adelante.

El historial se guarda en `recurring_incomes.salary_history`. Al actualizar una instalación existente, aplicá `20260925010000_recurring_income_history.sql` con `npx supabase db push` antes de publicar este frontend. Los datos anteriores y los respaldos sin historial siguen siendo compatibles: su configuración previa se conserva al realizar el primer cambio. Los importes que ya se hubieran perdido antes de esta actualización no se pueden reconstruir automáticamente.

Las pruebas de persistencia, validación, concurrencia y aislamiento del historial corren en CI contra Supabase local. También se pueden ejecutar después de `npx supabase start`:

```bash
docker exec -i supabase_db_finance-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < qa/recurring-income-history.sql
```

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

## Actualización automática de gastos

La app escucha cambios de `user_preferences` para el usuario autenticado mediante [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes). Telegram incrementa `finance_revision` después de guardar cada gasto; ese aviso dispara la carga y conciliación existentes, conservando las ediciones locales pendientes y la revisión manual de conflictos. También se consulta al conectar o reconectar Realtime, volver a la ventana y recuperar internet.

Como respaldo, se consultan los datos cada 15 segundos mientras la app esté visible y con conexión. Los avisos cercanos se agrupan y las consultas automáticas no se superponen. Si llega otro aviso durante una consulta, se realiza una consulta posterior. Al cerrar sesión o cambiar de cuenta se cancelan el canal, los temporizadores y los listeners.

Antes de publicar, aplicá `20261002010000_finance_realtime.sql`. Sólo agrega `user_preferences` a la publicación `supabase_realtime` si hace falta: no borra ni modifica registros, ni cambia las políticas RLS. Sin esta migración, la consulta periódica sigue funcionando, pero no llegan los avisos inmediatos. El QA de Telegram en CI verifica la publicación y el aislamiento de lectura entre cuentas.

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
