# TRANSPORTES 360 — Iteración 2: capacitación semanal

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Estado | **Aplicada en `TRANSPORTES-360`** y probada (37 pruebas en local y en Supabase, sin dejar datos) |
| Decisiones aplicadas | D-04 (primer envío oficial + práctica), D-05 (retroalimentación inmediata), D-06 (cierre domingo 23:59), D-07 (quien ve respuestas no responde), cuatro ojos (MAPA_FUNCIONAL §6), D-19 (tarjetas visuales) |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/05_capacitacion.sql` | Tablas `training_weeks`, `capsules` (5 por semana: `unique(week_id, day_number)`), `capsule_blocks`, `capsule_questions`, `question_options`, `question_answer_keys` (separada, sin acceso desde la API), `approval_history` (inmutable), `capsule_views`, `capsule_attempts` y `attempt_answers` (inmutables). Acceso **solo por RPC** |
| RPC del panel | `fn_admin_semanas`, `fn_admin_semana` (incluye la clave), `fn_admin_semana_guardar` (borradores incompletos permitidos), `_enviar` (exige semana completa), `_devolver` (con comentario), `_aprobar` (cuatro ojos; programa para el lunes 00:00 CR), `_archivar`, `_eliminar` (solo borradores nunca aprobados) |
| RPC del colaborador | `fn_semana_actual` (estado por cápsula: hoy, pendiente, completada, bloqueada), `fn_capsula` (sin clave; opciones en orden propio por usuario; registra la vista), `fn_responder_capsula` (corrige en el servidor; oficial/práctica; idempotente; bloquea la cápsula), `fn_mi_historial` |
| Panel → **Capacitación semanal** | Lista y editor: semana (lunes), categoría, tema, objetivo; 5 pestañas (lunes a viernes) con ✔ cuando la cápsula está completa; tarjetas por tipo (portada, texto, ¿qué haría?, voltear, detectar señales, caso, infografía, compromiso) con subir/bajar/quitar; 2 preguntas con 3–4 opciones, respuesta correcta, explicación y retroalimentación; **vista previa en marco de teléfono**; historial |
| Panel → **Revisión y aprobación** | Semanas pendientes de aprobar |
| App del colaborador | Datos reales: semana, cápsula por tarjetas (renderizador compartido `js/core/capsula-vista.js`), evaluación, historial. Puede ponerse al día con cápsulas pendientes hasta el domingo. Aviso de privacidad (texto provisional) antes de la primera respuesta |

### Regla de cuatro ojos y el aprobador único

Quien editó por última vez una semana **no puede aprobarla**. Excepción documentada: si el administrador principal es la **única** persona activa con permiso de aprobación, puede aprobar lo propio y queda marcado (`aprobador_unico`) en el historial y la auditoría. Mientras usted sea el único administrador, esta es la situación; al invitar a un segundo administrador, la regla se aplica completa.

## 2. Corrección encontrada en esta iteración

**Alta de usuarios en dos pasos** (migración `2026-11-20_03`): Supabase Auth crea el usuario sin metadatos y los agrega milisegundos después. El perfil del colaborador `E-7241` (creado por usted desde el panel) había quedado sin rol ni código, por eso no se emitió su código de activación. Se agregó un trigger que completa el perfil cuando llegan los metadatos (solo perfiles nuevos, inactivos y sin rol) y se reparó ese perfil (auditado como `PERFIL_REPARADO`). **Ya puede generar su código desde Usuarios → "Generar código".**

## 3. Pruebas (`sql/96_pruebas_capacitacion.sql`, 37)

Borrador incompleto permitido y envío bloqueado; una capacitación por semana; semana empieza en lunes; el panel ve la clave; cuatro ojos; devolver exige comentario; aprobación programa; historial; el colaborador ve la semana en curso y los días futuros bloqueados; **la cápsula nunca trae la respuesta correcta**; vista registrada; aviso de privacidad obligatorio; deben responderse las 2; oficial con retroalimentación; idempotencia; práctica; puntaje e historial; bloqueo de la cápsula; no se edita, elimina ni archiva con respuestas o en curso; intentos y respuestas inmutables; semana futura invisible; editar lo programado lo devuelve a revisión; aprobador único; colaborador sin acceso al panel ni a las tablas; administrador no responde; anónimo sin acceso.

## 4. Cómo crear la primera semana real

1. Panel → **Capacitación semanal → Nueva semana**. Elija el lunes, la categoría y escriba el tema.
2. En cada día (Lunes…Viernes): título, objetivo, **agregue tarjetas** (recomendado: portada, 2 actividades y un cierre) y llene las **2 preguntas** marcando la correcta.
3. **Vista previa** para ver cómo lo verá el colaborador. **Guardar** en cualquier momento.
4. **Enviar a revisión** (exige las 5 cápsulas completas) → **Aprobar y programar**. Se publica sola el lunes a las 00:00.

## 5. Pendiente para iteraciones siguientes

- Cierre de semana y sorteo reales (iteración 3). Hoy la semana deja de aceptar respuestas oficiales el domingo 23:59, pero aún no se consolidan resultados ni se sortea.
- Imágenes propias desde la biblioteca (iteración 6): por ahora se eligen entre las 3 ilustraciones incluidas.
- Generar semanas con IA (iteración 5).
- Supabase sugiere activar la **protección contra contraseñas filtradas** (Authentication → Policies): pendiente del usuario.
