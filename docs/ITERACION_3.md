# TRANSPORTES 360 — Iteración 3: cierre de semana y sorteo

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Estado | **Aplicada en `TRANSPORTES-360`** y probada (68 comprobaciones en local y en Supabase, sin dejar datos) |
| Decisiones aplicadas | D-06 (cierre domingo 23:59), D-07 (quien ve respuestas no participa), D-08 (el nombre del ganador solo con su consentimiento), reglamento del sorteo (MAPA_FUNCIONAL §9) |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/06_cierre_sorteo.sql` | Tablas `weekly_results` (resultados congelados, inmutables), `weekly_draws` (un único sorteo vigente por semana; solo admite pasar a `ANULADO` con motivo), `draw_entries` (lista de participantes, inmutable) y `recognitions` (semana perfecta y ganador). Acceso **solo por RPC** |
| Cierre | `fn_cerrar_semana`: solo después del domingo 11:59 p. m. (hora de Costa Rica). Congela, por cada colaborador activo, cápsulas completadas, puntos y si participa. Idempotente. Otorga la insignia **Semana perfecta** (10/10). `app.cerrar_semanas_vencidas()` queda lista para el proceso programado (iteración 8) |
| Sorteo | `fn_ejecutar_sorteo`: si la semana terminó y no está cerrada, la cierra primero. Participan los que completaron 5/5 con la **puntuación máxima realmente alcanzada** (sin mínimo fijo). Lista ordenada por identificador; posición = entero de 32 bits de `gen_random_bytes` (PostgreSQL) con **rechazo** para que todos tengan exactamente la misma probabilidad. Si nadie completó: **desierto**. Repetir la orden devuelve el sorteo ya registrado |
| Evidencia | Se guardan los bytes aleatorios usados, la huella SHA-256 de la lista, la versión del algoritmo, quién y cuándo. El panel **recalcula en el navegador** la huella y la posición y muestra si coinciden |
| Anulación | `fn_anular_sorteo`: solo el administrador principal, con motivo (mínimo 10 caracteres). El anulado se conserva con su evidencia; el nuevo sorteo queda enlazado (`reemplaza`). Todo queda en la auditoría |
| Reconocimientos | `fn_reconocimientos`: los propios y los ganadores de las últimas 8 semanas **que autorizaron** mostrar su nombre (solo nombre e inicial del apellido, nunca el código). `fn_reconocimiento_publico`: solo la persona ganadora decide |
| Panel → **Cierre y sorteo** | Selector de semana, estado (en curso / lista para cerrar / cerrada), **Cerrar semana**, indicadores (completaron, máximo real, empatados, excluidos), **Ejecutar sorteo** con confirmación, ganador, evidencia y verificación, **Anular** (administrador principal), sorteos anulados y lista de participantes |
| App del colaborador | Tarjeta "¡Ganó el sorteo!" con la casilla **Mostrar mi nombre en Reconocimientos** (desmarcada por defecto); reconocimientos reales en el inicio; el historial indica si participó en el sorteo y la insignia |

## 2. Cómo se usa cada semana

1. El lunes (o después), abra **Panel → Cierre y sorteo**. Aparece la semana que terminó.
2. **Cerrar semana** → revise los indicadores y la lista de participantes.
3. **Ejecutar sorteo oficial** → confirme. Se muestra el ganador y la evidencia.
4. Coordine la entrega del premio. El nombre del ganador aparece para los compañeros solo si la persona lo autoriza en la app.

Si hubo un error (por ejemplo, un colaborador mal registrado), el administrador principal puede **anular** con motivo y ejecutar un sorteo nuevo.

## 3. Pruebas (`sql/95_pruebas_sorteo.sql`, 68 comprobaciones)

Permisos (colaborador y supervisor no cierran ni sortean; el supervisor no ve la lista de empatados); la semana en curso no se cierra; cierre idempotente; base de participantes; supervisor participa (D-07); incompleto e inactivo no participan; resultados inmutables; máximo **real** (no cuenta el 10 de un inactivo); empatados; sorteo idempotente; ganador entre los empatados; huella y posición recalculables con la evidencia; reconocimiento privado por defecto; auditoría única; ganador, estado y participantes inmutables; un solo sorteo vigente; solo el principal anula y con motivo; no se anula dos veces; nuevo sorteo enlazado; el anulado conserva su evidencia; el ganador anulado pierde la insignia; cierre perezoso al sortear; semana perfecta; sorteo desierto; consentimiento del ganador (nadie más decide; nunca el nombre completo ni el código); historial; tablas inaccesibles directamente; anónimo sin acceso; cierre automático de semanas vencidas; **uniformidad del generador** (6000 extracciones entre 3: 1978 / 1986 / 2036 en Supabase, 1960 / 1993 / 2047 en local).

## 4. Pendiente

- Cierre automático el lunes 00:00 con `pg_cron` (iteración 8). Mientras tanto, el cierre ocurre al pulsar **Cerrar semana** o al ejecutar el sorteo.
- **Reglamento del sorteo** y aviso de privacidad definitivos (revisión legal): pendiente del usuario.
- Notificar al ganador (correo o mensaje): iteración 8.
