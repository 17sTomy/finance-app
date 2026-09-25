# Gastos por Telegram

En **Datos y preferencias → Telegram**, generá un enlace personal, abrilo y tocá **Iniciar**. Vence a los diez minutos y solo vincula un chat privado con una cuenta.

Ejemplos:

- **3000 en supermercado**: ARS 3000.
- **3.000,50 en supermercado**: ARS 3000,50.
- **USD 20 en café**: USD 20.
- **/categorias**: categorías disponibles.
- **/ayuda**: instrucciones.

La fecha se toma del mensaje en Argentina. El bot reconoce nombres de categorías y subcategorías de la cuenta; ante una coincidencia ambigua guarda **Sin categoría** y lo informa. Los movimientos se pueden editar en la app. Los mensajes editados de Telegram no modifican movimientos ya registrados.

Si la app estaba abierta, recargala para ver los gastos. Los controles de revisión impiden que una pestaña desactualizada sobrescriba gastos enviados al bot. Si Telegram crea el primer movimiento de un mes nuevo, la app completa sus recurrencias y límites al cargarlo.

## Activación del bot

1. Crear el bot con [@BotFather](https://t.me/BotFather), mediante /newbot.
2. Guardar su token en un archivo fuera del repositorio. No usar variables VITE_ para secretos.
3. Aplicar la migración 20260925030000_telegram_expenses.sql.
4. Con el repositorio vinculado a Supabase y SUPABASE_ACCESS_TOKEN disponible, ejecutar:

~~~sh
npm run configure:telegram -- /ruta/privada/telegram-token.txt
~~~

El script valida el bot, guarda secretos en Supabase, despliega la función, verifica su autenticación, registra el webhook y habilita la integración. SUPABASE_BIN permite indicar la ruta del ejecutable de Supabase. Conserva webhooks de otras aplicaciones y no descarta mensajes pendientes. El archivo original del token se conserva.

Hasta contar con el token, la pantalla indica que el bot aún no está configurado. El código y la migración por sí solos no crean un bot en Telegram.

## Persistencia y verificación

La migración agrega tablas de configuración, vínculos, recibos de mensajes y meses pendientes de inicialización. No elimina ni actualiza registros financieros existentes. Desvincular mantiene el historial y los gastos.

El webhook acepta solamente chats privados y valida X-Telegram-Bot-Api-Secret-Token. Las funciones que vinculan chats o registran gastos solo admiten el rol de servidor. Los enlaces se almacenan como hash y caducan. La deduplicación sobrevive a guardados completos de la app y a la eliminación manual de un gasto.

La confirmación se envía después de guardar. Si falla, Telegram puede reintentar sin crear otro gasto. Si no se puede interpretar el texto, el bot informa que no guardó nada.

Las pruebas incluyen parsing, fechas, autenticación del webhook, reintentos, UI, aislamiento entre cuentas, vínculos vencidos, revisiones y conservación de movimientos. Los fixtures SQL y el E2E se ejecutan solamente en bases locales.

Documentación oficial: [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook), [enlaces a bots](https://core.telegram.org/bots/features#deep-linking), [autenticación de funciones Supabase](https://supabase.com/docs/guides/functions/auth).
