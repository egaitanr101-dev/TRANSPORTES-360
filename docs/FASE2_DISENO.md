# TRANSPORTES 360 — Fase 2: diseño y aprobación

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Estado | **Pendiente de aprobación.** No se ha ejecutado nada en Supabase ni se ha escrito código de la aplicación |
| Base | Fase 1: [AUDITORIA_TECNICA](AUDITORIA_TECNICA.md) · [PLAN_IMPLEMENTACION](PLAN_IMPLEMENTACION.md) · [MAPA_FUNCIONAL](MAPA_FUNCIONAL.md) · [MODELO_DATOS_PROPUESTO](MODELO_DATOS_PROPUESTO.md) · [RIESGOS_Y_SEGURIDAD](RIESGOS_Y_SEGURIDAD.md) |
| Proyecto Supabase | `TRANSPORTES-360` (creado por el usuario). **Configuración aún sin verificar** (§9) |

Este documento no repite la Fase 1: indica qué se aprueba, qué cambió y cómo se ejecutará.

---

## 1. Qué se pide aprobar

| # | Elemento | Dónde |
|---|---|---|
| 1 | Arquitectura definitiva y estructura del repositorio | §2 |
| 2 | Decisiones de negocio y seguridad | §3 |
| 3 | Diseño de interfaces (prototipo navegable) | §4 y carpeta `prototipo/` |
| 4 | Modelo de datos (con los ajustes de §5) | §5 + MODELO_DATOS_PROPUESTO |
| 5 | Plan de migración y reversión | §6 |
| 6 | Lógica crítica en SQL (sorteo y evaluación), en borrador | §7 |
| 7 | Alcance de la primera iteración de la Fase 3 | §10 |

## 2. Arquitectura definitiva

Sin cambios respecto de PLAN_IMPLEMENTACION §1: HTML + CSS + JS sin compilación, dos entradas (`index.html` para el colaborador y `admin.html` para el panel), Supabase (Auth, PostgREST con RPC, PostgreSQL con RLS, Storage privado, Edge Functions para secretos e IA, `pg_cron` solo para cierres y vencimientos).

### 2.1 Estructura del repositorio (objetivo de la Fase 3)

```
APP TRANSPORTES 360/
├─ index.html                 App del colaborador (móvil)
├─ admin.html                 Panel administrativo
├─ manifest.webmanifest       PWA (iteración 8)
├─ css/
│  ├─ tokens.css              Paleta, tipografía, modo oscuro (base: prototipo/estilos.css)
│  ├─ base.css · componentes.css
│  ├─ colaborador.css · admin.css
├─ js/
│  ├─ config.js               URL + clave publicable (públicas). NUNCA service_role ni claves de IA
│  ├─ core/                   dom.js (h(), sin innerHTML), enrutador.js, formato.js, errores.js
│  ├─ api/                    api.js (modos DEMO/SUPABASE/LOCAL), mock/, supabase/
│  ├─ colaborador/            inicio, semana, capsula, alertas, historial, ingreso, perfil
│  ├─ admin/                  resumen, generador, revision, contenido, alertas, documentos, sorteo, usuarios, config, auditoria
│  └─ vendor/                 supabase-js-2.45.4.js (versión fija, servida localmente)
├─ assets/                    Logo e imágenes con derechos confirmados
├─ supabase/functions/        activar-cuenta · admin-usuarios · ia-generar · documento-procesar
├─ sql/                       01…14 (creación), 90 demo, 98–99 pruebas, migraciones/ (cambios fechados)
├─ tools/                     servidor-local.ps1 (incluye la corrección de AUDITORIA §4.1), entorno-pruebas.ps1
├─ docs/                      Documentos de Fase 1 y 2 (se moverían aquí en la iteración 0)
├─ prototipo/                 Referencia de diseño (se elimina, con autorización, al terminar la Fase 4)
└─ .gitignore                 Excluye .env, *.local.*, claves, exportaciones de datos
```

## 3. Decisiones

D-02, D-04, D-05, D-07, D-08 y D-09 fueron aprobadas por el usuario el 2026-11-20 tal como se recomendaron. Las marcadas "Recomendación adoptada" se aplican salvo que usted indique otra cosa.

| ID | Decisión | Propuesta | Estado |
|---|---|---|---|
| D-01 | Proyecto Supabase | `TRANSPORTES-360`, dedicado; se usa para desarrollo y pruebas | ✅ Resuelta |
| D-02 | Ingreso de colaboradores | Código de empleado + contraseña personal, activada con un código de un solo uso | ✅ Aprobada (2026-11-20) |
| D-03 | Idioma del modelo de datos | Inglés | Recomendación adoptada |
| D-04 | Política de intentos | Primer intento oficial + práctica que no cuenta | ✅ Aprobada (2026-11-20) |
| D-05 | Retroalimentación | Inmediata tras el intento oficial | ✅ Aprobada (2026-11-20) |
| D-06 | Cierre de semana | Domingo 23:59, hora de Costa Rica | Recomendación adoptada |
| D-07 | Exclusión del sorteo | Excluir a quien puede ver las respuestas | ✅ Aprobada (2026-11-20) |
| D-08 | Ranking | Reconocimientos sin tabla pública de puntajes | ✅ Aprobada (2026-11-20) |
| D-09 | Qué ve el supervisor | Participación y agregados de su equipo (sin puntajes individuales) | ✅ Aprobada (2026-11-20) |
| D-10 | IA inicial | Anthropic primero (`claude-opus-5-5` por defecto, `claude-sonnet-5-5` como opción económica); OpenAI después | Recomendación adoptada |
| D-11 | Extracción documental | PDF con la entrada de documentos de Claude; DOCX/PPTX/XLSX en el navegador del administrador | Recomendación adoptada (se confirma en la iteración 6) |
| D-12 | Búsqueda | Texto completo de PostgreSQL; pgvector después si hace falta | Recomendación adoptada |
| D-13 | Identidad gráfica | Marca provisional "anillo 360" del prototipo hasta recibir logo oficial | Pendiente de material del usuario |
| D-14 | Control de versiones | Instalar Git + repositorio privado | **Requiere autorización para instalar** (§10) |
| D-15 | Plan de Supabase | Gratuito en desarrollo; pago antes de la operación real | Recomendación adoptada |
| D-16 | Entradas | `index.html` + `admin.html` | Recomendación adoptada |
| D-17 | Conservación de datos | Intentos 24 meses; sorteos y auditoría 5 años; temporales 30 días | Pendiente de Legal/RRHH (no bloquea la Fase 3) |
| D-18 | Reglamento del sorteo | Revisión de Legal/RRHH | Pendiente; **bloquea la primera semana real**, no el desarrollo |
| D-19 | Imágenes de las cápsulas | Plantillas SVG propias + fotos propias desde el inicio; generación de imágenes con IA solo más adelante, con proveedor y costo aprobados | ✅ Aprobada junto con el formato de cápsula (2026-11-20) |

## 4. Diseño de interfaces

### 4.1 Cómo ver el prototipo

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\servidor-local.ps1
```

Luego abra `http://localhost:5610/prototipo/` (colaborador) y `http://localhost:5610/prototipo/admin.html` (panel). Es solo un servidor de archivos en `localhost`; no instala nada. Los datos son ficticios; la IA y el sorteo son simulaciones visuales.

> Desde la iteración 0 de la Fase 3 la aplicación real (modo DEMO) está en `http://localhost:5610/` y `http://localhost:5610/admin.html`. El prototipo se conserva como referencia de diseño.

### 4.2 Pantallas incluidas

| App | Pantalla | Qué demuestra |
|---|---|---|
| Colaborador | Ingreso / Activar mi cuenta | Código de empleado + contraseña personal; código de activación de un solo uso (D-02) |
| Colaborador | Inicio | Flotilla (ilustración propia, sin derechos de terceros), semana y progreso, botón a la cápsula de hoy, alerta pendiente, consejo con WhatsApp, categorías, reconocimientos |
| Colaborador | Semana | 5 cápsulas: completada / hoy / bloqueada; aviso de cierre del domingo |
| Colaborador | Cápsula | 8 tarjetas visuales e interactivas (§4.4) que terminan en las 2 preguntas oficiales, con retroalimentación inmediata y práctica posterior que no cuenta |
| Colaborador | ALERTAS 360 | Prioridades por color **y** texto; detalle con riesgo, qué hacer, fuente y "Confirmo que leí" |
| Colaborador | Mi historial | Puntaje por semana, si participó en el sorteo, insignias; aviso de privacidad |
| Panel | Resumen | Indicadores con numerador y denominador, pendientes, preguntas con más errores |
| Panel | Generador IA | Formulario completo del prompt maestro, aviso de tema repetido, costo estimado, estados del trabajo |
| Panel | Revisión y aprobación | Reporte de validación, lista de verificación por categoría, clave de respuestas visible solo aquí, regla de cuatro ojos |
| Panel | Cierre y sorteo | Elegibles, máximo real, empatados, confirmación, ganador único, evidencia (valor aleatorio, hash), idempotencia |

### 4.3 Reglas de diseño aplicadas

- **Móvil primero**: probado a 375 px sin desplazamiento horizontal; el panel se adapta a teléfono con un selector de secciones.
- **Toques cómodos**: botones y opciones de al menos 48 px de alto; navegación inferior de 4 destinos.
- **Contraste**: el dorado se usa como relleno con texto marino; nunca dorado sobre blanco para texto.
- **Color + texto**: prioridades y resultados siempre llevan palabra o símbolo, no solo color.
- **Modo oscuro** automático según el teléfono.
- **Sin animaciones pesadas**; transiciones mínimas desactivadas si el usuario pide reducir movimiento.
- **Seguridad desde el diseño**: el prototipo ya inserta todo el texto con `textContent` (nunca `innerHTML`) y declara una política CSP sin scripts en línea.
- **Lenguaje**: trato de "usted", frases cortas, sin tecnicismos.

### 4.4 Cápsulas visuales e interactivas (ajuste solicitado el 2026-11-20)

La cápsula deja de ser una página de texto y pasa a ser una **secuencia de tarjetas tipo "historias"**: barra de avance arriba, botones Anterior/Siguiente, deslizar con el dedo y flechas del teclado. Ver `http://localhost:5610/prototipo/#capsula` (la versión anterior, solo texto, sigue en `#capsula-texto` para comparar).

| Tarjeta (tipo de bloque) | Qué hace el colaborador | Para qué sirve |
|---|---|---|
| `portada` | Ve una ilustración del tema, el objetivo y el aviso de no usar la app mientras conduce | Engancha y fija el propósito |
| `escenario` | Elige "¿qué haría usted?" ante un mensaje real simulado y recibe una reacción | Activa lo que ya sabe antes de enseñar |
| `revelar` | Toca tarjetas que se voltean: el error al frente, cómo evitarlo atrás | Contenido en piezas cortas, a su ritmo |
| `detecta` | Toca las partes sospechosas de un mensaje (contador 0/4) | Práctica aplicada, no memoria |
| `historia` | Ve un caso en 3 viñetas ilustradas | Ejemplo concreto y fácil de recordar |
| `infografia` | Ve la imagen resumen, la comparte por WhatsApp o la guarda | Repaso y difusión a la familia |
| `compromiso` | Marca lo que va a poner en práctica (opcional) + mensaje final y fuente | Cierre y transferencia a la vida diaria |
| `evaluacion` | Responde las 2 preguntas oficiales | Lo único que suma puntos |

Además:

- **"Escuchar"**: lee la tarjeta en voz alta con la voz del propio teléfono (Web Speech API del navegador: sin costo, sin librerías, sin servidor). Útil para quien prefiere escuchar. El aviso de seguridad recuerda usarlo solo con el vehículo detenido.
- **Las actividades no suman puntos ni afectan el sorteo**: la puntuación sigue siendo solo las 10 preguntas.
- **Un mismo renderizador para todos los temas**: la IA o el administrador solo llenan los datos de cada bloque; no se programa nada por cápsula.
- **Accesibilidad**: todas las imágenes llevan texto alternativo obligatorio; las actividades funcionan con teclado y lector de pantalla; los volteos respetan "reducir movimiento".
- **Peso**: las ilustraciones del prototipo son SVG de 2–4 KB cada una. Para fotos se exigirá WebP ≤ 150 KB y carga diferida, pensando en datos móviles.

#### De dónde salen las imágenes

| Fuente | Cuándo | Costo | Derechos |
|---|---|---|---|
| **A. Plantillas SVG generadas por la plataforma** (infografía de 4 reglas, pasos, comparación, mensaje sospechoso, checklist) | Siempre disponible. La IA entrega el texto; la plataforma dibuja la imagen | US$0 | Propios |
| **B. Fotos propias** de la flotilla, el centro de distribución o el equipo (con autorización de las personas que aparezcan) | Portadas y casos reales | US$0 | Propios; registrar consentimiento |
| **C. Ilustraciones del banco de recursos** creado por diseño o comprado con licencia | Portadas recurrentes por categoría | Según licencia | Licencia registrada en `generated_assets.rights_status` |
| **D. Generación de imágenes con IA** (proveedor especializado) | Opcional, más adelante | Por imagen; se registra en `generation_jobs` | Revisar términos del proveedor; siempre revisión humana |

Nota: los modelos de texto (Claude o GPT) **no dibujan** las imágenes; proponen qué mostrar y el texto. La opción D requiere un proveedor de imágenes aparte, con autorización y costos propios (D-19). Recomendación: arrancar con A + B, que no cuestan y ya se ven como en el prototipo.

### 4.5 Pendientes de diseño

Logo y paleta oficiales (D-13); fotografía real de flotilla con derechos confirmados (opcional: la ilustración actual funciona sin ella); textos legales del aviso de privacidad (Legal).

## 5. Modelo de datos: ajustes respecto de la Fase 1

El modelo de MODELO_DATOS_PROPUESTO se mantiene. Ajustes surgidos al diseñar las pantallas y el SQL:

| Ajuste | Motivo |
|---|---|
| `capsule_attempts`: el intento oficial se inserta con `on conflict ... do nothing` sobre el índice único parcial | Dos envíos simultáneos (doble toque, red lenta) producen un solo intento oficial sin error visible |
| `capsule_attempts.score` se calcula **antes** de insertar | El trigger de inmutabilidad no admite actualizaciones posteriores |
| Nueva tabla `app.schema_migrations (version text pk, applied_at, applied_by, checksum)` | Registro de qué migración se aplicó, porque se aplicarán desde el SQL Editor sin el CLI (§6) |
| `weekly_draws.eligible_list_sha256` = SHA-256 de los `user_id` ordenados, uno por línea, más la puntuación máxima | Formato fijo para que la verificación sea reproducible |
| `profiles.privacy_accepted_at` obligatorio para responder evaluaciones | Aviso de privacidad antes de registrar datos de desempeño (R-70) |
| **Nueva tabla `capsule_blocks`**: `capsule_id`, `position`, `block_type` (`portada, escenario, revelar, detecta, historia, infografia, compromiso, evaluacion`), `data jsonb` validado por tipo, `asset_id` (fk a `generated_assets`, null), `alt_text` (obligatorio si hay imagen). `unique (capsule_id, position)` | Cápsulas visuales e interactivas (§4.4). Las columnas de texto actuales de `capsules` se mantienen como resumen y como versión de solo texto |
| `app.validar_semana_completa` exige además: una `portada`, al menos 2 bloques interactivos (`escenario`, `revelar` o `detecta`) y `evaluacion` como último bloque | Que toda cápsula aprobada tenga el formato visual |
| Esquema JSON `weekly_training/1.1`: cada cápsula incluye `blocks[]` con los datos de cada tipo (por ejemplo `detecta.partes[{t, senal}]`) y `visual_proposal` por bloque | La IA genera también las actividades; el servidor valida tipos, longitudes y que `detecta` tenga entre 2 y 5 señales |
| `capsule_views.last_block` | Retomar la cápsula donde la dejó (por ejemplo, si lo interrumpe una entrega) |
| Plantillas SVG versionadas en `js/plantillas/` (infografía, pasos, comparación, mensaje) | Imágenes sin costo generadas desde los datos del bloque (fuente A de §4.4) |

## 6. Plan de migración

### 6.1 Entornos

| Entorno | Uso | Datos |
|---|---|---|
| Local (PostgreSQL 17 + PostgREST portables, como ArreoPrime) | Probar cada archivo SQL y las suites 98–99 antes de tocar Supabase | Ficticios, se recrean en cada ejecución |
| Supabase `TRANSPORTES-360` | Desarrollo integrado y demostraciones | Ficticios (`90_datos_demo`) |
| Producción (Fase 5) | Operación real | Reales |

### 6.2 Procedimiento por migración

1. Se escribe el archivo (`sql/NN_nombre.sql`) dentro de `begin; … commit;`, con `if not exists` donde aplique.
2. Se prueba en local junto con todas las anteriores y las suites 98–99.
3. Se le presenta a usted: **qué crea, qué modifica (nada existente), si es reversible y qué riesgo tiene**.
4. Con su autorización, se ejecuta en el SQL Editor de `TRANSPORTES-360`, **un archivo por envío**.
5. Se registra en `app.schema_migrations` y se corren las consultas de verificación (las de PLAN §2 + las específicas del archivo).
6. Los cambios posteriores van como archivos nuevos en `sql/migraciones/AAAA-MM-DD_NN_descripcion.sql`; nunca se edita un archivo ya aplicado.

### 6.3 Reversión

- Cada archivo de creación tiene su par `sql/reversion/NN_nombre.down.sql` (por ejemplo, `drop function`, `drop table` en orden inverso). Solo se usa en desarrollo y con autorización.
- Antes de cualquier migración que toque datos existentes (desde la iteración 2 en adelante), se exporta un respaldo de las tablas afectadas.
- En producción no se revierte borrando: se aplica una migración correctiva nueva.

### 6.4 Orden

`01_base` → `02_identidad` → `03_catalogos` → `04_seguridad` → `05_capacitacion` → `06_participacion_sorteo` → `07_alertas_consejos_campanas` → `08_documentos_fuentes` → `09_ia` → `10_auditoria_triggers` → `11_rls` → `12_storage` → `13_vistas_reportes` → `14_cron`. Cada iteración de la Fase 3 aplica solo los archivos que necesita (la iteración 1 llega hasta `04` + la parte de `10`–`11` de identidad).

## 7. Lógica crítica en SQL (borrador para revisión)

> **Borrador no ejecutado.** Se probará en el entorno local durante la Fase 3 antes de proponer su ejecución en Supabase. Depende de las tablas de MODELO_DATOS_PROPUESTO y de las funciones `app.*` (patrón ArreoPrime).

### 7.1 Sorteo semanal idempotente

```sql
create or replace function public.fn_ejecutar_sorteo(p_week_id uuid)
returns public.weekly_draws
language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();           -- error si no hay sesión o el usuario está inactivo
  v_week  public.training_weeks;
  v_draw  public.weekly_draws;
  v_max   smallint;
  v_ids   uuid[];
  v_n     int := 0;
  v_lim   bigint;
  v_r     bigint;
  v_chunk bytea;
  v_bytes bytea := ''::bytea;
begin
  perform app.exigir('sorteo.ejecutar');

  -- Bloquea la semana: dos administradores a la vez se ejecutan en serie
  select * into v_week from public.training_weeks where id = p_week_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  perform app.validar(v_week.closed_at is not null, 'La semana debe estar cerrada antes del sorteo.');

  -- Idempotencia: si ya hay sorteo vigente, se devuelve el registrado
  select * into v_draw from public.weekly_draws
   where week_id = p_week_id and status in ('OFICIAL', 'DESIERTO');
  if found then return v_draw; end if;

  -- Máximo real entre quienes completaron 5 de 5 y son elegibles (D-07)
  select max(r.score) into v_max
    from public.weekly_results r
    join public.profiles p on p.id = r.user_id
   where r.week_id = p_week_id and r.completed_all and p.draw_eligible;

  if v_max is null then
    insert into public.weekly_draws (week_id, status, eligible_count, algorithm_version, executed_by, executed_at)
    values (p_week_id, 'DESIERTO', 0, 'v1-rejection-u32', v_actor.id, now())
    returning * into v_draw;
  else
    select array_agg(r.user_id order by r.user_id) into v_ids
      from public.weekly_results r
      join public.profiles p on p.id = r.user_id
     where r.week_id = p_week_id and r.completed_all and p.draw_eligible and r.score = v_max;
    v_n := array_length(v_ids, 1);

    -- Entero uniforme en [0, n) con bytes criptográficos y rechazo (sin sesgo de módulo)
    v_lim := (4294967296 / v_n) * v_n;
    loop
      v_chunk := extensions.gen_random_bytes(4);
      v_bytes := v_bytes || v_chunk;
      v_r := (get_byte(v_chunk, 0)::bigint << 24) | (get_byte(v_chunk, 1)::bigint << 16)
           | (get_byte(v_chunk, 2)::bigint << 8)  |  get_byte(v_chunk, 3)::bigint;
      exit when v_r < v_lim;
    end loop;

    insert into public.weekly_draws (week_id, status, max_score, eligible_count, winner_user_id,
                                     random_bytes, eligible_list_sha256, algorithm_version, executed_by, executed_at)
    values (p_week_id, 'OFICIAL', v_max, v_n, v_ids[(v_r % v_n) + 1], v_bytes,
            encode(extensions.digest(array_to_string(v_ids, E'\n') || E'\n' || v_max::text, 'sha256'), 'hex'),
            'v1-rejection-u32', v_actor.id, now())
    returning * into v_draw;

    insert into public.draw_entries (draw_id, user_id, score, position)
    select v_draw.id, t.u, v_max, t.ord - 1
      from unnest(v_ids) with ordinality as t(u, ord);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (v_actor.id, 'SORTEO_EJECUTADO', 'weekly_draw', v_draw.id,
          jsonb_build_object('week_id', p_week_id, 'status', v_draw.status, 'max_score', v_max, 'n', v_n));
  return v_draw;
end $$;

revoke all on function public.fn_ejecutar_sorteo(uuid) from public, anon;
grant execute on function public.fn_ejecutar_sorteo(uuid) to authenticated;   -- el permiso real lo exige app.exigir
```

Garantías: un único sorteo vigente (bloqueo + índice único parcial + retorno idempotente); aleatoriedad criptográfica del servidor; elegibilidad calculada desde resultados congelados; evidencia suficiente para que un auditor recalcule el ganador: `random_bytes`, `n`, lista ordenada (en `draw_entries`) y su hash.

### 7.2 Respuesta a una cápsula

```sql
create or replace function public.fn_responder_capsula(p_capsule_id uuid, p_answers jsonb, p_idempotency_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor   public.profiles := app.actor();
  v_cap     public.capsules;
  v_week    public.training_weeks;
  v_prev    uuid;
  v_type    text;
  v_score   smallint := 0;
  v_rows    jsonb := '[]'::jsonb;
  v_q       record;
  v_sel     uuid;
  v_attempt uuid;
begin
  perform app.exigir('evaluacion.responder');
  perform app.validar(v_actor.privacy_accepted_at is not null, 'Debe aceptar el aviso de privacidad.');

  -- Reintento de red con la misma clave: devuelve el mismo resultado, no crea otro intento
  select id into v_prev from public.capsule_attempts where idempotency_key = p_idempotency_key and user_id = v_actor.id;
  if found then return app.retroalimentacion(v_prev); end if;

  select * into v_cap  from public.capsules where id = p_capsule_id;
  select * into v_week from public.training_weeks where id = v_cap.week_id;
  perform app.validar(v_cap.id is not null and app.capsula_visible(v_cap, v_week), 'Cápsula no disponible.');
  perform app.validar(v_week.closed_at is null, 'La semana ya cerró.');
  perform app.validar(jsonb_typeof(p_answers) = 'object', 'Formato de respuestas no válido.');

  -- Corrige en el servidor: la clave nunca sale de la base de datos
  for v_q in
    select q.id, k.correct_option_id
      from public.capsule_questions q
      join public.question_answer_keys k on k.question_id = q.id
     where q.capsule_id = p_capsule_id
     order by q.position
  loop
    v_sel := nullif(p_answers ->> v_q.id::text, '')::uuid;
    perform app.validar(exists (select 1 from public.question_options o where o.question_id = v_q.id and o.id = v_sel),
                        'Debe responder las 2 preguntas con una opción válida.');
    v_rows := v_rows || jsonb_build_object('q', v_q.id, 'o', v_sel, 'ok', v_sel = v_q.correct_option_id);
    if v_sel = v_q.correct_option_id then v_score := v_score + 1; end if;
  end loop;
  perform app.validar(jsonb_array_length(v_rows) = 2, 'La cápsula no tiene 2 preguntas válidas.');

  -- Primer envío = OFICIAL. Si otro envío simultáneo ganó la carrera, este queda como PRÁCTICA.
  insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, idempotency_key)
  values (p_capsule_id, v_week.id, v_actor.id, 'OFICIAL', v_score, p_idempotency_key)
  on conflict (capsule_id, user_id) where attempt_type = 'OFICIAL' do nothing
  returning id into v_attempt;
  if v_attempt is null then
    insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, idempotency_key)
    values (p_capsule_id, v_week.id, v_actor.id, 'PRACTICA', v_score, p_idempotency_key)
    returning id into v_attempt;
  end if;

  insert into public.attempt_answers (attempt_id, question_id, selected_option_id, is_correct)
  select v_attempt, (e->>'q')::uuid, (e->>'o')::uuid, (e->>'ok')::boolean from jsonb_array_elements(v_rows) e;

  -- Primera respuesta oficial: la cápsula queda bloqueada para edición
  update public.capsules set locked_at = now() where id = p_capsule_id and locked_at is null;

  return app.retroalimentacion(v_attempt);   -- según D-05: correcta/incorrecta + explicación
end $$;
```

## 8. Riesgos de esta fase

Los riesgos de RIESGOS_Y_SEGURIDAD siguen vigentes. Nuevos o actualizados:

| ID | Riesgo | Control |
|---|---|---|
| R-80 | Que el prototipo se tome por la aplicación real (contiene la clave de respuestas en el navegador, a propósito, para simular) | Franja "PROTOTIPO" en cada pantalla, comentarios en el código, carpeta separada; no se publica y se elimina tras la Fase 4 |
| R-81 | Configuración del proyecto `TRANSPORTES-360` desconocida (autorregistro abierto, extensiones, plan) | Verificación de §9 antes de la primera migración |
| R-82 | Ejecutar SQL desde el SQL Editor sin registro | `app.schema_migrations` + un archivo por envío + verificación posterior (§6.2) |

## 9. Verificación de Supabase todavía pendiente

Para pasar de la iteración 0 a la 1 necesito el resultado de las consultas de solo lectura de PLAN_IMPLEMENTACION §2 en `TRANSPORTES-360`, la región, el plan y las dos pantallas de configuración (Authentication → Providers y Project Settings → API → Exposed schemas). No comparta claves.

## 10. Alcance propuesto para iniciar la Fase 3

Con su aprobación, la Fase 3 empezaría solo con:

| Iteración | Trabajo | Toca Supabase |
|---|---|---|
| **0 — Preparación** | Instalar Git (requiere su autorización, con `winget install Git.Git` o el instalador oficial) · crear `.gitignore` y la estructura de §2.1 · mover los documentos a `docs/` · copiar de ArreoPrime `supabase-js-2.45.4.js` y el patrón de `api.js` · servidor local · pantallas en modo DEMO a partir del prototipo | **No** |
| **1 — Identidad y base** | SQL `01`–`04` + políticas de identidad, probados en local; Edge Function `activar-cuenta`; ingreso real | **Sí, previa presentación de cada archivo y su autorización** |

El repositorio en GitHub (privado) se crea cuando usted lo indique; no se sube nada sin autorización.
