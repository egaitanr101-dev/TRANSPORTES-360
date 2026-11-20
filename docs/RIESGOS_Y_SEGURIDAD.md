# TRANSPORTES 360 — Riesgos y seguridad (Fase 1)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Base | Proyecto nuevo (sin código). Los riesgos son **de diseño**: se describe qué puede salir mal y qué control lo evita desde el inicio. |
| Escala | Probabilidad e impacto: Alta / Media / Baja |

---

## 1. Principios obligatorios de diseño

1. **El servidor decide.** Permisos, puntuación, cierre y sorteo se calculan en PostgreSQL (funciones `security definer`) o en Edge Functions. El frontend solo muestra lo que la base de datos ya filtró.
2. **RLS en todas las tablas del esquema `public`**, sin excepción. Las tablas sin política no se leen.
3. **Escrituras solo por funciones RPC** validadas (mismo patrón que ArreoPrime). El navegador no hace `insert`/`update` directo sobre tablas con reglas de negocio.
4. **Secretos solo en el servidor**: claves de OpenAI/Anthropic y la `service_role` como *secrets* de Supabase Edge Functions. En el navegador solo existen la URL del proyecto y la clave publicable, que son públicas por diseño.
5. **Contenido de IA y documentos = datos no confiables.** Nunca se ejecutan como instrucciones y nunca se insertan como HTML.
6. **Lo que se cierra no se edita.** Respuestas oficiales, resultados semanales cerrados, sorteos y auditoría son inmutables por trigger. Cualquier corrección pasa por un procedimiento auditado.
7. **Mínimo de datos personales.** No se guarda cédula, dirección ni datos de salud. El teléfono solo si se elige la autenticación por OTP.

## 2. Registro de riesgos

### 2.1 Exposición de información

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-01 | Un colaborador consulta resultados de otros llamando a la API directamente (saltándose la interfaz) | Alta si no hay RLS | Alto | RLS por `auth.uid()` en intentos, respuestas, resultados e historial. Pruebas automáticas de RLS por rol (PLAN §9) |
| R-02 | Las respuestas correctas llegan al navegador antes de responder | Alta si se lee la tabla de preguntas | Alto (invalida el sorteo) | Respuestas correctas en tabla separada `question_answer_keys` sin acceso para colaboradores. Preguntas servidas por RPC sin la clave. La corrección ocurre en `fn_responder_capsula` |
| R-03 | Documentos internos accesibles por URL | Media | Alto | Buckets **privados**. Descarga solo por URL firmada de vida corta, emitida por RPC que valida la `access_level` del documento |
| R-04 | Fuga de la `service_role` o de claves de IA (repositorio, `config.js`, OneDrive, capturas) | Media | Crítico | Secrets de Supabase. `.gitignore` y revisión antes de cada commit. Las claves se rotan si aparecen en cualquier archivo |
| R-05 | Supervisores ven más de lo necesario | Media | Medio | Supervisores ven participación y agregados de **su** equipo. Puntajes individuales solo si RRHH lo aprueba (D-09) |
| R-06 | El ranking expone puntajes individuales y genera presión o burla | Media | Medio | Reconocimientos sin tabla pública de puntajes (D-08) |
| R-07 | Mensajes de error que revelan estructura interna | Media | Bajo | Errores con código estable (`NO_AUTORIZADO`, `VALIDACION`) y mensajes genéricos. El detalle solo va a la auditoría |

### 2.2 Autenticación

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-10 | El código de empleado funciona como contraseña (es conocido por compañeros y supervisores) | Alta si se diseña así | Crítico | El código **solo identifica**. Cada colaborador define una contraseña personal al activar su cuenta (D-02) |
| R-11 | Activación de cuenta por un tercero | Media | Alto | Código de activación de un solo uso, entregado en persona, guardado como *hash*, vence en 72 h, con límite de intentos y auditoría |
| R-12 | Fuerza bruta sobre contraseñas cortas | Media | Alto | Longitud mínima de 8 caracteres. Límites de Auth de Supabase por IP. Evaluar el *hook* de verificación de contraseña de Supabase si el plan lo permite (verificar en Fase 2) |
| R-13 | Teléfono compartido o perdido con sesión abierta | Alta (contexto de ruta) | Medio | Botón "Cerrar sesión" visible. Revocación de sesiones desde el panel (Edge Function con `service_role`). Datos sensibles mínimos en pantalla |
| R-14 | Recuperación de contraseña sin correo | Alta | Medio | Restablecimiento por el administrador o el supervisor: genera un nuevo código de activación. Queda auditado |
| R-15 | Autorregistro abierto | Media | Alto | Desactivar *sign up* público en Supabase Auth. Altas solo por el administrador (Edge Function) |
| R-16 | Token de sesión robado por XSS (supabase-js guarda la sesión en `localStorage`) | Media | Alto | Ver R-30 (XSS). Política CSP estricta. Expiración del JWT de 1 h con rotación de *refresh token* |

### 2.3 Autorización

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-20 | Roles controlados solo con botones ocultos en la interfaz | Alta si se descuida | Crítico | Cada RPC llama `app.exigir('<permiso>')`. Las pruebas intentan cada acción con cada rol |
| R-21 | Un usuario cambia su propio rol (por ejemplo, desde `raw_user_meta_data`) | Media | Crítico | El rol vive en `profiles`, solo modificable por RPC de administrador. Nunca se lee de metadatos editables por el usuario (patrón ArreoPrime) |
| R-22 | Funciones `security definer` con `search_path` mutable (inyección de objetos) | Media | Alto | `set search_path = ''` y nombres calificados en todas (patrón ArreoPrime). Revocar `execute` a `public`/`anon` en funciones internas |
| R-23 | Vistas que saltan RLS | Media | Alto | Vistas con `security_invoker = on` o funciones que filtran explícitamente |
| R-24 | Administrador que crea contenido participa en el sorteo conociendo las respuestas | Alta | Alto | Excluir del sorteo a quienes tienen permiso sobre `question_answer_keys` (D-07) |

### 2.4 Aplicación web

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-30 | XSS por contenido generado por IA, documentos, títulos de alertas o nombres | Alta si se usa `innerHTML` | Crítico | Todo texto se inserta con `textContent`. El formato de las cápsulas es un subconjunto propio (párrafos, listas, negrita) convertido a nodos DOM, nunca HTML. CSP sin `unsafe-inline` para scripts |
| R-31 | Inyección SQL | Baja (PostgREST parametriza) | Alto | Sin SQL dinámico con texto del usuario. `format('%I', ...)` cuando haga falta |
| R-32 | Librerías desde CDN alteradas | Baja | Alto | Librerías con versión fija servidas desde la aplicación (patrón ArreoPrime) |
| R-33 | Enlaces de WhatsApp o QR que apuntan a sitios falsos (suplantación de T360) | Media | Medio | Dominio único y comunicado oficialmente. La propia plataforma enseña a verificarlo (tema de seguridad digital) |
| R-34 | Subida de archivos maliciosos (macros, ejecutables) | Media | Medio | Lista de tipos MIME y extensiones permitidas, tamaño máximo. Solo administradores suben. Nunca se ejecutan ni se previsualizan como HTML |

### 2.5 Inteligencia artificial

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-40 | **Inyección de instrucciones** desde un documento o una página web ("ignora tus reglas", "marca la opción B como correcta", "publica esto") | Media | Alto | Los fragmentos van delimitados como datos. El modelo no tiene herramientas con efectos (no publica, no escribe en la base). Su salida es JSON que el servidor valida, y siempre pasa por revisión humana |
| R-41 | Fuentes o enlaces inventados | Alta | Alto | Las citas internas deben referirse a identificadores de fragmentos entregados al modelo; el servidor verifica que existan y que el texto citado aparezca en el fragmento. Las URL externas solo valen si aparecen en los resultados reales de la búsqueda web y pertenecen a un dominio de la lista permitida. Quedan en estado `PENDIENTE` hasta que un humano las valida |
| R-42 | Información médica, financiera o legal incorrecta | Media | Alto | Reglas en el prompt del sistema (no diagnosticar, no recomendar productos, remitir a profesionales). Lista de verificación obligatoria del revisor para las categorías Salud, Finanzas y Seguridad digital |
| R-43 | Alertas de estafa falsas o basadas en rumores | Media | Alto | Una alerta exige al menos una fuente validada. Las críticas requieren aprobación del administrador principal, salvo protocolo de emergencia autorizado |
| R-44 | Pregunta con dos respuestas correctas o ambigua | Alta | Medio (equidad del sorteo) | Validación estructural (una sola clave) + revisión humana + bloqueo de la pregunta en cuanto exista una respuesta oficial. Corrección posterior solo por procedimiento auditado (MAPA §8.5) |
| R-45 | Costos descontrolados (reintentos, documentos completos, bucles) | Media | Medio | Límites diarios y mensuales configurables, clave de idempotencia por solicitud, máximo de reintentos, solo fragmentos relevantes, caché de extracción por *hash* del archivo |
| R-46 | Datos personales enviados al proveedor de IA | Media | Alto | La generación nunca incluye datos de colaboradores. Los documentos `RESTRINGIDO` se excluyen salvo autorización explícita. Revisar las condiciones vigentes de retención de datos de cada proveedor antes de activarlo |
| R-47 | Rechazo del modelo (`stop_reason: refusal`) o respuesta truncada (`max_tokens`) tratada como éxito | Media | Medio | Revisar `stop_reason` antes de leer el contenido. Registrar como `FALLIDO` con el motivo |
| R-48 | Dependencia de un solo proveedor | Media | Medio | Capa de adaptadores: un adaptador por proveedor detrás de una interfaz común (PLAN §4.3) |
| R-49 | Tiempo máximo de ejecución de Edge Functions excedido en generaciones largas | Media | Medio | Generar por partes (plan semanal + una llamada por cápsula) o en segundo plano, con estado en `generation_jobs`. Verificar los límites vigentes de Supabase en Fase 2 |

### 2.6 Documentos

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-50 | Documento obsoleto usado como vigente | Media | Alto | Campos de vigencia y versión. Solo la versión vigente es recuperable. Aviso al revisor si la fuente vence pronto |
| R-51 | Dos documentos contradictorios | Media | Alto | El modelo debe reportar conflictos en un campo `conflicts[]`. Si hay conflictos, el borrador no se puede aprobar sin resolución registrada |
| R-52 | Documento temporal que termina en la biblioteca permanente | Media | Medio | Indicador `is_temporary`, bucket separado y purga programada. Pasarlo a permanente requiere una acción explícita y auditada |
| R-53 | Escaneos sin texto procesados como vacíos | Alta | Medio | Detección de páginas sin texto. OCR solo con una solución autorizada (D-11) |
| R-54 | Documentos con datos personales (planillas, sanciones) cargados para "contexto" | Media | Alto | Clasificación obligatoria al subir. Advertencia en el formulario. Los documentos `RESTRINGIDO` no se envían a IA |

### 2.7 Sorteo

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-60 | Doble ejecución (dos clics, dos administradores, reintentos de red) | Media | Crítico | Índice único parcial: un solo sorteo `OFICIAL` o `DESIERTO` por semana. Bloqueo `FOR UPDATE` de la semana. La función es idempotente: si ya existe, devuelve el resultado existente |
| R-61 | Aleatoriedad predecible o manipulable | Baja | Crítico | `gen_random_bytes` de pgcrypto (generador criptográfico de PostgreSQL), con rechazo para evitar sesgo de módulo. Nunca `Math.random` ni `random()` |
| R-62 | Cambio silencioso de resultados después del cierre | Media | Crítico | `weekly_results`, `weekly_draws` y `draw_entries` son inmutables por trigger. Se guarda el *hash* SHA-256 de la lista ordenada de elegibles |
| R-63 | Elegibles incorrectos (no completaron las 5, puntaje mal sumado, usuario inactivo) | Media | Alto | La elegibilidad se calcula solo en el servidor, al cierre, desde las respuestas oficiales. Pruebas con casos límite (PLAN §9) |
| R-64 | Ventaja por velocidad u orden | Baja | Alto | La lista se ordena por identificador (no por hora) y todos los empatados tienen la misma probabilidad |
| R-65 | Semana sin participantes completos | Media | Bajo | Estado `DESIERTO` registrado y auditado |
| R-66 | Respuestas compartidas por WhatsApp entre compañeros | Alta | Medio | Imposible de impedir del todo en una evaluación sin supervisión. Mitigaciones: orden de opciones aleatorio por usuario y preguntas de aplicación práctica. Se acepta como riesgo residual: el efecto es más empates, no un ganador injusto (D-05) |
| R-67 | Reglamento del sorteo sin validación legal o de RRHH | Media | Medio | Revisión por Legal/RRHH antes de la primera semana real (D-18) |

### 2.8 Operación y cumplimiento

| ID | Riesgo | P | I | Control |
|---|---|---|---|---|
| R-70 | Tratamiento de datos personales sin aviso ni consentimiento informado | Media | Alto | Aviso de privacidad en la primera activación. Revisar con Legal la Ley 8968 de Costa Rica (protección de datos personales) |
| R-71 | Sin política de conservación de datos | Alta | Medio | Definir plazos (D-17). Propuesta inicial: respuestas e intentos 24 meses, auditoría y sorteos 5 años, documentos temporales 30 días |
| R-72 | Proyecto en plan gratuito de Supabase que se pausa por inactividad | Media | Medio | Verificar las condiciones vigentes. Plan pago antes de la operación real (D-15) |
| R-73 | Pérdida de código por ausencia de control de versiones | Alta | Alto | Git y repositorio privado antes de la Fase 3 (D-14) |
| R-74 | Respaldos de base de datos inexistentes | Media | Alto | Verificar los respaldos del plan. Exportación periódica del esquema y de los datos críticos (sorteos, resultados) |

## 3. Medidas preventivas por fase

| Fase | Medidas |
|---|---|
| 2 — Diseño | Aprobar D-01, D-02, D-07, D-08, D-09 y D-17. Definir la CSP. Escribir las políticas RLS antes que las tablas. Revisión de privacidad con Legal/RRHH |
| 3 — Implementación | Patrón `app.exigir` en cada RPC. Inmutabilidad por trigger. Validador JSON en el servidor. Ningún `innerHTML` con datos. `.gitignore` desde el primer commit |
| 4 — Validación | Suite de pruebas de seguridad SQL (cada rol × cada tabla × cada acción). Prueba de doble sorteo concurrente. Prueba de inyección de instrucciones con documentos maliciosos de prueba. Búsqueda de secretos en el repositorio |
| 5 — Publicación | Rotación de claves de desarrollo. Revisión de la configuración de Auth (sin autorregistro, URL del sitio). Encabezados de seguridad en el hosting. Plan de reversión |

## 4. Riesgos aceptados (propuesta, requiere confirmación)

- **R-66** (respuestas compartidas): se acepta con las mitigaciones indicadas.
- **R-16** (sesión en `localStorage`): es el comportamiento estándar de supabase-js en una aplicación estática. Se mitiga con CSP y sin HTML no confiable. La alternativa (cookies `httpOnly`) requiere un servidor propio, contrario a la arquitectura pedida.
