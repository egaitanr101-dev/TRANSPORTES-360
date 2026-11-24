# TRANSPORTES 360 — Iteración 4: ALERTAS 360 y consejos breves

| Campo | Valor |
|---|---|
| Fecha | 2026-11-24 |
| Estado | **Aplicada en `TRANSPORTES-360`** (71 comprobaciones en local y en Supabase, sin dejar datos). Panel y app probados en modo demostración; el panel real con sesión queda por recorrer |
| Reglas aplicadas | MAPA_FUNCIONAL §4 (estados), §6 (cuatro ojos y críticas), §10 (alertas), §12 (consejos) |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/07_alertas_consejos.sql` | `alerts` (copia de trabajo), `alert_publications` (copia exacta e inmutable de cada versión aprobada), `alert_acknowledgements` (vista y confirmada, por versión; solo avanza), `tips`. Acceso **solo por RPC**. Amplía `approval_history.entity_type` con `alert` y `tip` |
| Panel → **ALERTAS 360 y consejos** | Lista, editor, vista previa en teléfono, enviar, aprobar, devolver, retirar, historial y seguimiento de lectura (deben leerla, la abrieron, confirmaron, quiénes faltan) |
| Panel → **Revisión y aprobación** | Incluye alertas y consejos pendientes |
| App | Alertas reales por prioridad y área, confirmación con fecha, consejo del día (rota cada día), lista de consejos, compartir por WhatsApp. Un enlace compartido retoma su destino después de ingresar |

## 2. Reglas que hace cumplir el servidor

- **Sin fuente o sin vencimiento no se envía.** Quien aprueba debe declarar que verificó la fuente; los enlaces solo pueden ser `https`.
- **Críticas:** solo el administrador principal las aprueba o las retira, también cuando la versión nueva baja la prioridad de una crítica vigente.
- **Cuatro ojos:** no aprueba nadie que haya editado esa versión. Excepción: si es la única persona activa que puede hacerlo, se permite y queda marcado. Hoy usted es el único administrador, así que aplica la excepción.
- **Se aprueba lo que se leyó:** si alguien cambió el contenido mientras tanto, la aprobación se rechaza.
- **Editar una alerta publicada no la oculta:** la versión aprobada sigue visible hasta aprobar la nueva. La nueva exige confirmar otra vez.
- **Abrir no es confirmar**, y no se puede confirmar sin abrir ni confirmar una versión anterior.
- Una alerta vencida o retirada deja de mostrarse; la evidencia se conserva.
- Los consejos siguen el mismo flujo; al editar uno aprobado, deja de verse hasta aprobarlo de nuevo.

## 3. Pruebas (`sql/94_pruebas_alertas.sql`, 71 comprobaciones)

Permisos, borradores, fuente, vencimiento, cuatro ojos, versiones, críticas, audiencia por área, programación, vencimiento, retiro, inmutabilidad de la evidencia, consejos, acceso directo y anónimo. La reversión (`sql/reversion/07`) se probó en local. Además, las 43 llamadas del frontend se contrastaron con Supabase: todas existen con esos parámetros y rechazan a quien no tiene sesión.

## 4. Corrección a la iteración 3

El historial decía "participó en el sorteo" a quien completó las 5 cápsulas aunque no alcanzara el puntaje máximo. Ahora dice "cumplió el requisito del sorteo".

## 5. Pendiente

- El "protocolo de emergencia" para publicar críticas sin el administrador principal (MAPA_FUNCIONAL §10) **no** se implementó: no está definido quién lo autoriza.
- Lista de dominios y fuentes validadas, imágenes: iteración 6. Avisos automáticos de alertas nuevas: iteración 8.
- El supervisor todavía no ve la lectura de su equipo: iteración 8 (reportes).
- El enlace dentro del mensaje de WhatsApp se agrega cuando la app tenga dirección pública (`urlPublica`, Fase 5).
