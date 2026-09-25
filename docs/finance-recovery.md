# Recuperación y sincronización

Cada edición conserva un borrador en el navegador antes de esperar el guardado.
El borrador pertenece a una cuenta y a una pestaña; una recarga recupera su copia.
Las pestañas duplicadas escriben en espacios distintos. La copia se elimina solo
cuando el servidor confirma los cambios. Si el navegador bloquea el almacenamiento
o agota su espacio, se informa y sigue disponible la exportación desde Datos.

Una diferencia de revisión provoca una lectura y una combinación de tres
versiones: la última confirmada, los cambios locales y el estado del servidor.
Las altas independientes (incluido Telegram) se conservan. Una edición y un
borrado del mismo elemento requieren revisión explícita. Los cambios ambiguos
detienen el guardado y permiten descargar ambas copias. Una referencia eliminada
requiere corregir esa relación en la app y volver a comprobar.

Al volver a la ventana o usar Telegram → Actualizar gastos, se usa la misma
combinación segura. Renovar el token de sesión no reinicia las finanzas. Los
guardados/importaciones comparten una cola y el servidor comprueba el usuario
que originó cada solicitud.

Desde la migración 20260925040000, replace_finance_data conserva el estado previo
en finance_backups dentro de la misma transacción y antes de reemplazar filas.
Esto también cubre pestañas que todavía usan el RPC anterior. Un guardado fallido
revierte tanto el reemplazo como su historial. La tabla permite leer/agregar solo
copias propias y no concede UPDATE ni DELETE a clientes. No hay purga automática.

El historial nuevo no reconstruye estados anteriores a la migración ni cambios
que nunca llegaron al servidor. Ante un incidente: preservar la pestaña y exportar
su copia antes de recargar; consultar las copias de esa cuenta, comparar IDs y
restaurar únicamente lo faltante, sin reemplazar a ciegas el estado actual.
