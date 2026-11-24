# TRANSPORTES 360 — Iteración 5: generador con IA

| Campo | Valor |
|---|---|
| Fecha | 2026-11-24 |
| Estado | **Construida y aplicada, con la IA APAGADA.** No se configuró ninguna clave ni se hizo ninguna llamada a un proveedor: **la generación real todavía no está probada** |
| Decisiones aplicadas | D-10 (Anthropic primero; OpenAI pendiente), cuatro ojos, "la IA nunca publica", claves solo en Supabase Secrets |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/08_ia.sql` | `ai_providers` (solo el nombre del secreto), `ai_models` (precios), `generation_jobs`, `generation_steps`, parámetro `ai_limits`. Acceso solo por RPC |
| Edge Function `ia-generar` (v1) | Ejecuta un paso con la librería oficial `@anthropic-ai/sdk` 1.0.0 y salida estructurada. Exige sesión y permiso `ia.generar`. Sin clave, falla sin cobrar |
| Panel → **Generador IA** | Solicitud (tipo, categoría, tema, nivel, estilo, indicaciones), aviso de tema repetido, costo máximo, seguimiento por pasos, vista previa, advertencias y conversión a borrador |
| Panel → **Proveedores IA y parámetros** | Encender o apagar, tope mensual, solicitudes por día, precios, modelo por defecto |

## 2. Por qué se genera por pasos

Las funciones de Supabase cortan a los 150 segundos. Una semana completa no cabe en una sola llamada, así que son 6: el plan y cada cápsula. Si una falla, solo se repite esa (máximo 3 intentos, y cada reintento lo decide una persona).

## 3. Controles

- **Apagada por defecto**; solo el administrador principal la enciende. Tope inicial: US$ 10 al mes y 10 solicitudes por persona y día.
- **El gasto se reserva antes de llamar**, con el costo máximo posible del paso. Si no se sabe cuánto cobró el proveedor, se cuenta la reserva completa.
- **Costo máximo posible** de una semana con Claude Opus 5.5: US$ 2,05 si ningún paso se repite (con Sonnet 5.5, la mitad). El real solo se conocerá con la primera prueba. Los precios registrados (Opus 5.5: 4 y 20; Sonnet 5.5: 2 y 10 dólares por millón de tokens) deben confirmarse en la página oficial antes de encender.
- **Datos personales:** se rechazan correos y secuencias de 8 o más dígitos; el resto depende de quien escribe.
- **La base valida la salida:** estructura, longitudes, una sola respuesta correcta, opciones distintas, sin enlaces.
- **Sin fuentes inventadas:** la IA no consulta documentos ni internet; la fuente queda vacía y debe agregarla una persona. Alertas y consejos no se pueden enviar a revisión sin ella; **las cápsulas semanales sí**, porque ahí la fuente es opcional.
- **Solo quien pidió convierte**, y siempre en BORRADOR. La IA no elige prioridad: las alertas nacen como preventivas.
- **Simulación:** proveedor sin costo para probar el proceso; su resultado no se puede convertir en contenido.

## 4. Pruebas

- `sql/93_pruebas_ia.sql`: 68 comprobaciones en local. La reversión también se probó en local.
- En Supabase: las 22 funciones tienen la misma huella que las probadas en local y un recorrido de 15 comprobaciones pasó (revertido).
- La Edge Function arranca y rechaza a quien no tiene sesión.
- **No probado:** la llamada real a Anthropic y el recorrido del panel con sesión en Supabase.

## 5. Para activarla (requiere su autorización; tiene costo)

1. En console.anthropic.com cree una clave y ponga ahí también un límite de gasto.
2. En Supabase → Edge Functions → Secrets agregue `ANTHROPIC_API_KEY`. No la envíe por chat ni la guarde en archivos.
3. Panel → Proveedores IA y parámetros: confirme precios y tope, y encienda.
4. Primera prueba sugerida: un **consejo breve** (máximo US$ 0,13).

Antes de eso puede probar todo el proceso sin costo con el modelo "Simulación".

## 6. Hallazgo: cuatro ojos en la capacitación semanal

En alertas y consejos no aprueba nadie que haya editado esa versión. En la capacitación semanal (iteración 2) la regla solo mira a la **última** persona que editó: si A edita, B guarda después y A aprueba, se permite. Corregirlo reemplaza `fn_admin_semana_aprobar`, que ya existe: **queda pendiente de su autorización**.

## 7. Pendiente

OpenAI; documentos y fuentes como insumo (iteración 6); plan de campañas (iteración 7).
