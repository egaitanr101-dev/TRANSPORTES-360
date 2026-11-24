-- =============================================================================
-- TRANSPORTES 360 · 08_ia.sql  (Fase 3 · iteración 5: generador con IA)
-- Crea: ai_providers, ai_models, generation_jobs, generation_steps, parámetro ai_limits y sus RPC.
-- Modifica: nada existente (solo agrega una fila a app_settings). Reversión: sql/reversion/08_ia.down.sql
-- Principios:
--   * La IA solo produce un BORRADOR. Convertirlo crea contenido en estado BORRADOR; publicar exige revisión y aprobación.
--   * Las claves NO están aquí: la base solo guarda el NOMBRE del secreto. La llamada la hace la Edge Function ia-generar.
--   * Apagada por defecto (app_settings.ai_enabled = false). El proveedor "simulado" no cuesta y su resultado no se convierte.
--   * El tope mensual se reserva ANTES de cada llamada, con el costo máximo posible; si no se sabe cuánto cobró el
--     proveedor (corte de red), se cuenta la reserva completa.
--   * La salida se valida en la base (estructura, longitudes, una sola respuesta correcta, sin enlaces inventados).
--   * Se genera por pasos (plan + 5 cápsulas): cada llamada es corta y, si algo falla, se reanuda sin repetir lo pagado.
-- =============================================================================
begin;

/* ===================== Catálogo de proveedores y modelos ===================== */
create table public.ai_providers (
  id          text primary key check (id ~ '^[a-z]{3,20}$'),
  name        text not null,
  is_enabled  boolean not null default false,
  secret_name text                                -- SOLO el nombre del secreto en Supabase, nunca su valor
);
create table public.ai_models (
  provider_id        text not null references public.ai_providers (id),
  model_id           text not null,
  name               text not null,
  input_usd_mtok     numeric(10,4) not null check (input_usd_mtok >= 0),
  output_usd_mtok    numeric(10,4) not null check (output_usd_mtok >= 0),
  price_checked_on   date not null,
  is_enabled         boolean not null default true,
  is_default         boolean not null default false,
  primary key (provider_id, model_id)
);
create unique index ai_models_defecto_idx on public.ai_models (is_default) where is_default;

insert into public.ai_providers (id, name, is_enabled, secret_name) values
  ('simulado', 'Simulación (sin costo)', true, null),
  ('anthropic', 'Anthropic (Claude)', true, 'ANTHROPIC_API_KEY'),
  ('openai', 'OpenAI (pendiente)', false, 'OPENAI_API_KEY');
insert into public.ai_models (provider_id, model_id, name, input_usd_mtok, output_usd_mtok, price_checked_on, is_default) values
  ('simulado', 'simulado', 'Simulación · ejemplo fijo', 0, 0, '2026-11-24', false),
  ('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 4, 20, '2026-11-24', true),
  ('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5 (más económico)', 2, 10, '2026-11-24', false);

insert into public.app_settings (key, value, is_public) values ('ai_limits', '{"mes_usd": 10, "dia_trabajos": 10}', false);

/* ===================== Trabajos y pasos ===================== */
create table public.generation_jobs (
  id                uuid primary key default gen_random_uuid(),
  content_type      text not null check (content_type in ('weekly_training', 'alert', 'tip')),
  payload           jsonb not null,
  category_id       uuid not null references public.knowledge_categories (id),
  provider_id       text not null,
  model_id          text not null,
  prompt_version    text not null default 'v1',
  status            text not null default 'EN_COLA'
                    check (status in ('EN_COLA', 'EN_GENERACION', 'GENERADO', 'FALLIDO', 'CANCELADO', 'CONVERTIDO')),
  idempotency_key   uuid not null,
  requested_by      uuid not null references public.profiles (id),
  validation_report jsonb,
  target_id         uuid,                          -- contenido creado al convertir
  created_at        timestamptz not null default now(),
  finished_at       timestamptz,
  unique (requested_by, idempotency_key),
  foreign key (provider_id, model_id) references public.ai_models (provider_id, model_id)
);
create index generation_jobs_category_idx on public.generation_jobs (category_id);
create index generation_jobs_modelo_idx on public.generation_jobs (provider_id, model_id);
create index generation_jobs_fecha_idx on public.generation_jobs (created_at desc);

create table public.generation_steps (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.generation_jobs (id),
  step           text not null,
  attempt        smallint not null check (attempt between 1 and 3),
  status         text not null default 'EN_CURSO' check (status in ('EN_CURSO', 'OK', 'FALLIDO')),
  reserved_usd   numeric(10,4) not null,
  cost_usd       numeric(10,4),
  cost_estimated boolean not null default false,   -- true: no se supo el consumo; se contó la reserva
  input_tokens   int,
  output_tokens  int,
  stop_reason    text,
  error          text,
  output         jsonb,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  unique (job_id, step, attempt)
);
create unique index generation_steps_en_curso_idx on public.generation_steps (job_id) where status = 'EN_CURSO';
create unique index generation_steps_ok_idx on public.generation_steps (job_id, step) where status = 'OK';
create index generation_steps_fecha_idx on public.generation_steps (started_at);

alter table public.ai_providers enable row level security;
alter table public.ai_models enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_steps enable row level security;
revoke all on public.ai_providers, public.ai_models, public.generation_jobs, public.generation_steps from public, anon, authenticated;

/* ===================== Utilidades ===================== */
create or replace function app.ia_pasos(p_tipo text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_tipo when 'weekly_training' then array['plan', 'dia1', 'dia2', 'dia3', 'dia4', 'dia5'] when 'alert' then array['alerta'] else array['consejo'] end
$$;

create or replace function app.ia_max_tokens(p_paso text)
returns int language sql immutable set search_path = '' as $$
  select case when p_paso like 'dia_' then 16000 when p_paso = 'consejo' then 4000 else 8000 end
$$;

/** Costo máximo posible de un paso: toda la salida permitida más una entrada generosa (12 000 tokens). */
create or replace function app.ia_reserva(p_proveedor text, p_modelo text, p_paso text)
returns numeric language sql stable security definer set search_path = '' as $$
  select round((12000 * input_usd_mtok + app.ia_max_tokens(p_paso) * output_usd_mtok) / 1000000, 4)
    from public.ai_models where provider_id = p_proveedor and model_id = p_modelo
$$;

/** Gastado y reservado en el mes en curso (hora de Costa Rica). */
create or replace function app.ia_gasto_mes()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when s.status = 'EN_CURSO' then s.reserved_usd else s.cost_usd end), 0)
    from public.generation_steps s
   where s.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
$$;

create or replace function app.ia_encendida()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = 'ai_enabled'), false)
$$;

create or replace function app.ia_limite(p_clave text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (value ->> p_clave)::numeric from public.app_settings where key = 'ai_limits'), 0)
$$;

/* ===================== Validación de la salida ===================== */
create or replace function app.ia_largo(p jsonb, p_campo text, p_min int, p_max int)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p -> p_campo) = 'string' and char_length(trim(p ->> p_campo)) between p_min and p_max, false)
$$;

/** Lista de textos: cantidad y longitudes dentro de los límites. */
create or replace function app.ia_lista(p jsonb, p_min int, p_max int, p_largo int)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p) <> 'array' then false else
    jsonb_array_length(p) between p_min and p_max
    and not exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string' or char_length(trim(e #>> '{}')) not between 1 and p_largo) end, false)
$$;

create or replace function app.ia_validar_bloque(b jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare n int; m int;
begin
  case b ->> 'tipo'
    when 'portada' then
      if not (app.ia_largo(b, 'titulo', 3, 140) and app.ia_largo(b, 'objetivo', 5, 300)) then return 'portada incompleta'; end if;
    when 'texto' then
      if not (app.ia_largo(b, 'titulo', 3, 140) and app.ia_lista(b -> 'parrafos', 1, 4, 600) and app.ia_lista(b -> 'puntos', 0, 8, 200)) then return 'texto incompleto o muy largo'; end if;
    when 'escenario' then
      if not (app.ia_largo(b, 'mensaje', 5, 600) and app.ia_largo(b, 'pregunta', 5, 200) and jsonb_typeof(b -> 'opciones') = 'array') then return 'escenario incompleto'; end if;
      select count(*), count(*) filter (where e -> 'segura' = 'true'::jsonb) into n, m from jsonb_array_elements(b -> 'opciones') e
       where app.ia_largo(e, 't', 1, 200) and app.ia_largo(e, 'reaccion', 1, 400) and jsonb_typeof(e -> 'segura') = 'boolean';
      if n <> jsonb_array_length(b -> 'opciones') or n not between 2 and 4 or m = 0 or m = n then return 'el escenario necesita de 2 a 4 opciones, con seguras y no seguras'; end if;
    when 'revelar' then
      if not app.ia_largo(b, 'titulo', 3, 140) or jsonb_typeof(b -> 'tarjetas') is distinct from 'array' then return 'tarjetas incompletas'; end if;
      select count(*) into n from jsonb_array_elements(b -> 'tarjetas') e where app.ia_largo(e, 'error', 1, 200) and app.ia_largo(e, 'solucion', 1, 300);
      if n <> jsonb_array_length(b -> 'tarjetas') or n not between 2 and 6 then return 'se necesitan de 2 a 6 tarjetas completas'; end if;
    when 'detecta' then
      if not app.ia_largo(b, 'titulo', 3, 140) or jsonb_typeof(b -> 'partes') is distinct from 'array' then return 'detecta incompleto'; end if;
      select count(*), count(*) filter (where char_length(trim(e ->> 'senal')) > 0) into n, m from jsonb_array_elements(b -> 'partes') e
       where app.ia_largo(e, 't', 1, 300) and app.ia_largo(e, 'senal', 0, 300);
      if n <> jsonb_array_length(b -> 'partes') or n not between 3 and 8 or m not between 2 and 5 then return 'detecta necesita de 3 a 8 partes y de 2 a 5 señales'; end if;
    when 'historia' then
      if not (app.ia_largo(b, 'titulo', 3, 140) and app.ia_lista(b -> 'pasos', 2, 6, 300)) then return 'caso incompleto'; end if;
    when 'compromiso' then
      if not (app.ia_largo(b, 'cierre', 5, 400) and app.ia_lista(b -> 'opciones', 2, 4, 200)) then return 'compromiso incompleto'; end if;
    else return 'tipo de tarjeta no permitido';
  end case;
  return null;
end $$;

/** Errores de la salida de un paso (vacío = correcta). Nunca lanza: lo inesperado es un error más. */
create or replace function app.ia_validar(p_paso text, s jsonb)
returns text[] language plpgsql immutable set search_path = '' as $$
declare e text[] := '{}'; x jsonb; v text; n int; i int;
begin
  if jsonb_typeof(s) is distinct from 'object' then return array['La respuesta no tiene la estructura pedida']; end if;
  if pg_column_size(s) > 60000 then return array['La respuesta es demasiado larga']; end if;
  if s::text ~* '(https?://|www\.)' then e := e || 'Contiene enlaces: la IA no debe inventar direcciones'::text; end if;

  if p_paso = 'plan' then
    if not app.ia_largo(s, 'titulo', 3, 140) then e := e || 'Falta el tema de la semana'::text; end if;
    if not app.ia_largo(s, 'objetivo', 5, 400) then e := e || 'Falta el objetivo general'::text; end if;
    if jsonb_typeof(s -> 'capsulas') is distinct from 'array' or jsonb_array_length(s -> 'capsulas') <> 5 then return e || 'El plan debe tener 5 cápsulas'::text; end if;
    i := 0;
    for x in select * from jsonb_array_elements(s -> 'capsulas') loop
      i := i + 1;
      if (x ->> 'dia') is distinct from i::text or not app.ia_largo(x, 'titulo', 3, 140) or not app.ia_largo(x, 'objetivo', 5, 400) or not app.ia_largo(x, 'enfoque', 5, 600) then
        e := e || ('La cápsula ' || i || ' del plan está incompleta');
      end if;
    end loop;

  elsif p_paso like 'dia_' then
    if not app.ia_largo(s, 'titulo', 3, 140) then e := e || 'Falta el título'::text; end if;
    if not app.ia_largo(s, 'objetivo', 5, 400) then e := e || 'Falta el objetivo'::text; end if;
    if coalesce(s ->> 'minutos', '') !~ '^([1-9]|1[0-5])$' then e := e || 'La duración debe ser de 1 a 15 minutos'::text; end if;
    if jsonb_typeof(s -> 'bloques') is distinct from 'array' or jsonb_typeof(s -> 'preguntas') is distinct from 'array' then return e || 'Faltan tarjetas o preguntas'::text; end if;
    n := jsonb_array_length(s -> 'bloques');
    if n not between 4 and 10 then e := e || 'Debe tener de 4 a 10 tarjetas'::text; end if;
    if (s #>> '{bloques,0,tipo}') is distinct from 'portada' then e := e || 'La primera tarjeta debe ser la portada'::text; end if;
    if (s #>> array['bloques', (n - 1)::text, 'tipo']) is distinct from 'compromiso' then e := e || 'La última tarjeta debe ser el compromiso'::text; end if;
    if (select count(*) from jsonb_array_elements(s -> 'bloques') b where b ->> 'tipo' in ('escenario', 'revelar', 'detecta', 'historia')) < 2 then e := e || 'Necesita al menos 2 actividades'::text; end if;
    i := 0;
    for x in select * from jsonb_array_elements(s -> 'bloques') loop
      i := i + 1; v := app.ia_validar_bloque(x);
      if v is not null then e := e || ('Tarjeta ' || i || ': ' || v); end if;
    end loop;
    if jsonb_array_length(s -> 'preguntas') <> 2 then e := e || 'Debe tener 2 preguntas'::text; end if;
    i := 0;
    for x in select * from jsonb_array_elements(s -> 'preguntas') loop
      i := i + 1;
      if not (app.ia_largo(x, 'texto', 5, 400) and app.ia_largo(x, 'explicacion', 3, 500) and app.ia_largo(x, 'retro', 3, 500) and app.ia_lista(x -> 'opciones', 3, 4, 200)) then
        e := e || ('Pregunta ' || i || ' incompleta');
      elsif coalesce(x ->> 'correcta', '') !~ '^[0-3]$' or (x ->> 'correcta')::int >= jsonb_array_length(x -> 'opciones') then
        e := e || ('Pregunta ' || i || ': la respuesta correcta no existe');
      elsif (select count(distinct lower(trim(o #>> '{}'))) from jsonb_array_elements(x -> 'opciones') o) <> jsonb_array_length(x -> 'opciones') then
        e := e || ('Pregunta ' || i || ': opciones repetidas');
      end if;
    end loop;

  elsif p_paso = 'alerta' then
    if not (app.ia_largo(s, 'titulo', 5, 140) and app.ia_largo(s, 'descripcion', 10, 2000) and app.ia_largo(s, 'riesgo', 5, 1000)) then e := e || 'La alerta está incompleta'::text; end if;
    if not app.ia_lista(s -> 'recomendaciones', 1, 8, 300) then e := e || 'Necesita de 1 a 8 recomendaciones'::text; end if;
  elsif p_paso = 'consejo' then
    if not (app.ia_largo(s, 'titulo', 3, 100) and app.ia_largo(s, 'texto', 10, 600) and app.ia_largo(s, 'compartir', 0, 300)) then e := e || 'El consejo está incompleto o es muy largo'::text; end if;
  else
    e := e || 'Paso desconocido'::text;
  end if;
  return e;
exception when others then
  return array['La respuesta no tiene la estructura pedida'];
end $$;

/** Advertencias para el revisor (no bloquean): se calculan al terminar el trabajo. */
create or replace function app.ia_informe(p_trabajo uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v text[] := array['La IA no consultó documentos ni fuentes externas: el revisor debe verificar el contenido y agregar la fuente.']; v_txt text; n int; m int;
begin
  select string_agg(output::text, ' ') into v_txt from public.generation_steps where job_id = p_trabajo and status = 'OK';
  if v_txt ~* '[0-9]+([.,][0-9]+)? ?(%|por ciento|colones|dólares|km/h|horas|litros)' or v_txt ~ '(₡|\$) ?[0-9]' then v := v || 'Contiene cifras: verifíquelas una por una.'::text; end if;
  if v_txt ~* '\m(ley|decreto|artículo|reglamento|norma)\M' then v := v || 'Menciona normas o leyes: confirme que existen y dicen eso.'::text; end if;
  select count(*), count(distinct q ->> 'correcta') into n, m from public.generation_steps s, jsonb_array_elements(s.output -> 'preguntas') q where s.job_id = p_trabajo and s.status = 'OK' and s.step like 'dia_';
  if n = 10 then
    if m = 1 then v := v || 'La respuesta correcta está siempre en la misma posición: cambie el orden de algunas opciones.'::text; end if;
    select count(*) into m from public.generation_steps s, jsonb_array_elements(s.output -> 'preguntas') q
     where s.job_id = p_trabajo and s.status = 'OK' and s.step like 'dia_'
       and char_length(q #>> array['opciones', q ->> 'correcta']) = (select max(char_length(o #>> '{}')) from jsonb_array_elements(q -> 'opciones') o);
    if m >= 8 then v := v || 'La respuesta correcta suele ser la más larga: se puede adivinar.'::text; end if;
    select count(distinct lower(trim(q ->> 'texto'))) into m from public.generation_steps s, jsonb_array_elements(s.output -> 'preguntas') q where s.job_id = p_trabajo and s.status = 'OK' and s.step like 'dia_';
    if m < 10 then v := v || 'Hay preguntas repetidas.'::text; end if;
  end if;
  return jsonb_build_object('advertencias', to_jsonb(v));
end $$;

/* ===================== RPC del panel ===================== */
create or replace function public.fn_ia_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  perform app.exigir('ia.generar');
  return jsonb_build_object('encendida', app.ia_encendida(), 'mes_usd', app.ia_limite('mes_usd'), 'gastado_usd', app.ia_gasto_mes(),
    'dia_trabajos', app.ia_limite('dia_trabajos'),
    'trabajos_hoy', (select count(*) from public.generation_jobs j where j.requested_by = v_actor.id and (j.created_at at time zone 'America/Costa_Rica')::date = app.hoy_cr()),
    'modelos', (select jsonb_agg(jsonb_build_object('proveedor', m.provider_id, 'proveedor_nombre', p.name, 'modelo', m.model_id, 'nombre', m.name, 'defecto', m.is_default,
                   'habilitado', m.is_enabled and p.is_enabled, 'entrada', m.input_usd_mtok, 'salida', m.output_usd_mtok, 'precio_del', m.price_checked_on,
                   'maximo', (select jsonb_object_agg(t, (select sum(app.ia_reserva(m.provider_id, m.model_id, x)) from unnest(app.ia_pasos(t)) x)) from unnest(array['weekly_training', 'alert', 'tip']) t))
                   order by m.is_default desc, m.provider_id, m.input_usd_mtok desc)
                  from public.ai_models m join public.ai_providers p on p.id = m.provider_id));
end $$;

/** Encender/apagar, topes, modelo por defecto y precios. Solo quien configura proveedores. Todo auditado. */
create or replace function public.fn_ia_configurar(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); m jsonb;
begin
  perform app.exigir('ia.configurar_proveedores');
  if p ? 'encendida' then
    perform app.validar(jsonb_typeof(p -> 'encendida') = 'boolean', 'Valor no válido.');
    update public.app_settings set value = p -> 'encendida', updated_by = v_actor.id, updated_at = now() where key = 'ai_enabled';
  end if;
  if p ? 'mes_usd' or p ? 'dia_trabajos' then
    perform app.validar(coalesce((p ->> 'mes_usd')::numeric, app.ia_limite('mes_usd')) between 0 and 500 and coalesce((p ->> 'dia_trabajos')::int, app.ia_limite('dia_trabajos')) between 0 and 50,
                        'El tope mensual va de 0 a 500 dólares y los trabajos por día de 0 a 50.');
    update public.app_settings set value = jsonb_build_object('mes_usd', coalesce((p ->> 'mes_usd')::numeric, app.ia_limite('mes_usd')), 'dia_trabajos', coalesce((p ->> 'dia_trabajos')::int, app.ia_limite('dia_trabajos'))),
           updated_by = v_actor.id, updated_at = now() where key = 'ai_limits';
  end if;
  if p ? 'modelo' then
    m := p -> 'modelo';
    perform app.validar(exists (select 1 from public.ai_models where provider_id = m ->> 'proveedor' and model_id = m ->> 'modelo') and m ->> 'proveedor' <> 'simulado', 'Modelo no encontrado.');
    perform app.validar(coalesce((m ->> 'entrada')::numeric, 1) > 0 and coalesce((m ->> 'salida')::numeric, 1) > 0, 'El precio debe ser mayor que cero.');
    if m -> 'defecto' = 'true'::jsonb then update public.ai_models set is_default = false where is_default; end if;
    update public.ai_models set
      is_default = case when m -> 'defecto' = 'true'::jsonb then true else is_default end,
      is_enabled = coalesce((m ->> 'habilitado')::boolean, is_enabled),
      input_usd_mtok = coalesce((m ->> 'entrada')::numeric, input_usd_mtok), output_usd_mtok = coalesce((m ->> 'salida')::numeric, output_usd_mtok),
      price_checked_on = case when m ? 'entrada' or m ? 'salida' then app.hoy_cr() else price_checked_on end
    where provider_id = m ->> 'proveedor' and model_id = m ->> 'modelo';
  end if;
  perform app.auditar('IA_CONFIGURADA', 'app_settings', 'ai', p);
end $$;

/** Semanas de los últimos 6 meses con un tema parecido (comparten la mitad o más de sus palabras). */
create or replace function public.fn_ia_tema_repetido(p_tema text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v text[] := tsvector_to_array(to_tsvector('pg_catalog.spanish', coalesce(p_tema, '')));
begin
  perform app.exigir('ia.generar');
  if cardinality(v) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('semana', extract(week from w.week_start)::int, 'titulo', w.title, 'fecha', w.week_start) order by w.week_start desc)
    from public.training_weeks w
   where w.status <> 'ARCHIVADO' and w.week_start >= app.hoy_cr() - 182
     and (select count(*) from unnest(v) x where x = any (tsvector_to_array(to_tsvector('pg_catalog.spanish', w.title)))) * 2 >= cardinality(v)), '[]'::jsonb);
end $$;

/** Registra la solicitud (no llama a la IA). Idempotente por persona y clave. */
create or replace function public.fn_ia_solicitar(p jsonb, p_clave uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); j public.generation_jobs; v_tipo text := p ->> 'tipo'; v_max numeric; v_libre text;
begin
  perform app.exigir('ia.generar');
  perform app.validar(p_clave is not null, 'Falta la clave de la solicitud.');
  select * into j from public.generation_jobs where requested_by = v_actor.id and idempotency_key = p_clave;
  if found then return jsonb_build_object('id', j.id, 'estado', j.status, 'ya_existia', true); end if;

  perform app.validar(v_tipo in ('weekly_training', 'alert', 'tip'), 'Elija el tipo de contenido.');
  perform app.validar(app.ia_largo(p, 'tema', 5, 140), 'Escriba el tema (de 5 a 140 caracteres).');
  perform app.validar(char_length(coalesce(p ->> 'objetivo', '')) <= 300 and char_length(coalesce(p ->> 'publico', '')) <= 80 and char_length(coalesce(p ->> 'instrucciones', '')) <= 1500, 'Hay un texto demasiado largo.');
  perform app.validar(coalesce(p ->> 'dificultad', 'BASICO') in ('BASICO', 'INTERMEDIO', 'AVANZADO') and coalesce(p ->> 'estilo', 'CERCANO') in ('CERCANO', 'FORMAL', 'MOTIVACIONAL'), 'Opción no válida.');
  perform app.validar(exists (select 1 from public.knowledge_categories where id = (p ->> 'category_id')::uuid and is_active), 'Elija una categoría.');
  v_libre := concat_ws(' ', p ->> 'tema', p ->> 'objetivo', p ->> 'publico', p ->> 'instrucciones');
  perform app.validar(v_libre !~ '[^\s@]+@[^\s@]+\.[^\s@]+' and v_libre !~ '[0-9]([ .-]?[0-9]){7,}', 'No incluya correos, teléfonos ni números de identificación: el texto se envía al proveedor de IA.');
  perform app.validar(exists (select 1 from public.ai_models m join public.ai_providers r on r.id = m.provider_id
                               where m.provider_id = p ->> 'proveedor' and m.model_id = p ->> 'modelo' and m.is_enabled and r.is_enabled), 'Ese modelo no está habilitado.');
  perform app.validar(p ->> 'proveedor' = 'simulado' or app.ia_encendida(), 'La IA está apagada. El administrador principal la enciende en Proveedores IA y parámetros.');

  perform pg_advisory_xact_lock(hashtext('t360.ia'));
  perform app.validar((select count(*) from public.generation_jobs x where x.requested_by = v_actor.id and (x.created_at at time zone 'America/Costa_Rica')::date = app.hoy_cr()) < app.ia_limite('dia_trabajos'),
                      'Alcanzó el máximo de solicitudes por día.');
  select sum(app.ia_reserva(p ->> 'proveedor', p ->> 'modelo', x)) into v_max from unnest(app.ia_pasos(v_tipo)) x;
  perform app.validar(app.ia_gasto_mes() + v_max <= app.ia_limite('mes_usd') or v_max = 0, 'El costo máximo de esta solicitud supera lo que queda del tope mensual.');

  insert into public.generation_jobs (content_type, payload, category_id, provider_id, model_id, idempotency_key, requested_by)
  values (v_tipo, jsonb_build_object('tema', trim(p ->> 'tema'), 'objetivo', trim(coalesce(p ->> 'objetivo', '')), 'publico', trim(coalesce(p ->> 'publico', '')),
            'dificultad', coalesce(p ->> 'dificultad', 'BASICO'), 'estilo', coalesce(p ->> 'estilo', 'CERCANO'), 'instrucciones', trim(coalesce(p ->> 'instrucciones', ''))),
          (p ->> 'category_id')::uuid, p ->> 'proveedor', p ->> 'modelo', p_clave, v_actor.id) returning * into j;
  perform app.auditar('IA_SOLICITADA', 'generation_job', j.id::text, jsonb_build_object('tipo', v_tipo, 'modelo', j.model_id, 'maximo_usd', v_max));
  return jsonb_build_object('id', j.id, 'estado', j.status, 'ya_existia', false, 'maximo_usd', v_max);
end $$;

create or replace function app.ia_resumen(j public.generation_jobs)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', j.id, 'tipo', j.content_type, 'tema', j.payload ->> 'tema', 'estado', j.status, 'proveedor', j.provider_id, 'modelo', j.model_id,
    'solicitado_por', p.full_name, 'mio', j.requested_by = auth.uid(), 'creado', j.created_at, 'contenido_id', j.target_id, 'total', cardinality(app.ia_pasos(j.content_type)),
    'listos', (select count(*) from public.generation_steps s where s.job_id = j.id and s.status = 'OK'),
    'costo_usd', (select coalesce(sum(s.cost_usd), 0) from public.generation_steps s where s.job_id = j.id))
    from public.profiles p where p.id = j.requested_by
$$;

create or replace function public.fn_ia_trabajos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir('ia.generar');
  return coalesce((select jsonb_agg(app.ia_resumen(j) order by j.created_at desc) from (select * from public.generation_jobs order by created_at desc limit 50) j), '[]'::jsonb);
end $$;

create or replace function public.fn_ia_trabajo(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  perform app.exigir('ia.generar');
  select * into j from public.generation_jobs where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Solicitud no encontrada.'); end if;
  return app.ia_resumen(j) || jsonb_build_object('solicitud', j.payload, 'informe', j.validation_report,
    'categoria', (select name from public.knowledge_categories where id = j.category_id),
    'pasos', (select jsonb_agg(jsonb_build_object('paso', x.paso, 'estado', coalesce(s.status, 'PENDIENTE'), 'intento', s.attempt, 'error', s.error, 'costo_usd', s.cost_usd, 'estimado', s.cost_estimated,
                'entrada', s.input_tokens, 'salida', s.output_tokens, 'resultado', case when s.status = 'OK' then s.output end) order by x.o)
              from unnest(app.ia_pasos(j.content_type)) with ordinality x(paso, o)
              left join lateral (select * from public.generation_steps t where t.job_id = j.id and t.step = x.paso order by t.attempt desc limit 1) s on true));
end $$;

create or replace function public.fn_ia_cancelar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  perform app.exigir('ia.generar');
  select * into j from public.generation_jobs where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Solicitud no encontrada.'); end if;
  if j.requested_by <> auth.uid() and not app.tiene_permiso('ia.configurar_proveedores') then perform app.error('NO_AUTORIZADO', 'Solo quien la pidió puede cancelarla.'); end if;
  perform app.validar(j.status in ('EN_COLA', 'EN_GENERACION', 'FALLIDO'), 'Esa solicitud ya terminó.');
  update public.generation_jobs set status = 'CANCELADO', finished_at = now() where id = j.id;
  perform app.auditar('IA_CANCELADA', 'generation_job', j.id::text, '{}'::jsonb);
end $$;

/** Convierte el borrador de la IA en contenido en estado BORRADOR. Solo quien lo pidió (así no podrá aprobarlo: cuatro ojos).
    La fuente queda vacía a propósito: la debe agregar una persona. Idempotente. */
create or replace function public.fn_ia_convertir(p_id uuid, p_semana date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); j public.generation_jobs; v_plan jsonb; v_caps jsonb; s jsonb; v_id uuid;
begin
  perform app.exigir('ia.generar');
  select * into j from public.generation_jobs where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Solicitud no encontrada.'); end if;
  if j.requested_by <> v_actor.id then perform app.error('NO_AUTORIZADO', 'Solo quien pidió la generación la convierte en borrador.'); end if;
  if j.status = 'CONVERTIDO' then return jsonb_build_object('tipo', j.content_type, 'id', j.target_id, 'ya_existia', true); end if;
  perform app.validar(j.status = 'GENERADO', 'La generación todavía no está completa.');
  perform app.validar(j.provider_id <> 'simulado', 'Una simulación no se convierte en contenido: sirve solo para probar el proceso.');

  if j.content_type = 'weekly_training' then
    perform app.validar(p_semana is not null, 'Elija la semana.');
    select output into v_plan from public.generation_steps where job_id = j.id and step = 'plan' and status = 'OK';
    select jsonb_agg(jsonb_build_object('dia', right(x.step, 1)::int, 'titulo', x.output ->> 'titulo', 'objetivo', x.output ->> 'objetivo', 'minutos', (x.output ->> 'minutos')::int,
             'bloques', (select jsonb_agg(case b ->> 'tipo' when 'portada' then b || '{"imagen": "", "alt": ""}' when 'historia' then b || '{"imagen": "", "alt": ""}' when 'compromiso' then b || '{"fuente": ""}' else b end order by o)
                           from jsonb_array_elements(x.output -> 'bloques') with ordinality t(b, o)),
             'preguntas', x.output -> 'preguntas') order by x.step)
      into v_caps from public.generation_steps x where x.job_id = j.id and x.status = 'OK' and x.step like 'dia_';
    v_id := public.fn_admin_semana_guardar(jsonb_build_object('week_start', p_semana, 'category_id', j.category_id, 'titulo', v_plan ->> 'titulo', 'objetivo', v_plan ->> 'objetivo', 'capsulas', v_caps));
  else
    select output into s from public.generation_steps where job_id = j.id and status = 'OK';
    if j.content_type = 'alert' then
      v_id := public.fn_admin_alerta_guardar(jsonb_build_object('category_id', j.category_id, 'prioridad', 'PREVENTIVA', 'titulo', s ->> 'titulo', 'descripcion', s ->> 'descripcion', 'riesgo', s ->> 'riesgo', 'recomendaciones', s -> 'recomendaciones', 'fuente', ''));
    else
      v_id := public.fn_admin_consejo_guardar(jsonb_build_object('category_id', j.category_id, 'titulo', s ->> 'titulo', 'texto', s ->> 'texto', 'compartir', s ->> 'compartir', 'fuente', ''));
    end if;
  end if;
  update public.generation_jobs set status = 'CONVERTIDO', target_id = v_id where id = j.id;
  perform app.auditar('IA_CONVERTIDA', 'generation_job', j.id::text, jsonb_build_object('contenido', v_id, 'tipo', j.content_type));
  return jsonb_build_object('tipo', j.content_type, 'id', v_id, 'ya_existia', false);
end $$;

/* ===================== RPC solo para el servidor (Edge Function ia-generar, service_role) ===================== */
/** Reserva el siguiente paso pendiente y devuelve lo necesario para llamar al proveedor. */
create or replace function public.fn_srv_ia_paso_iniciar(p_trabajo uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; v_paso text; v_intento int; v_reserva numeric; v_id uuid; x public.generation_steps;
begin
  perform pg_advisory_xact_lock(hashtext('t360.ia'));
  select * into j from public.generation_jobs where id = p_trabajo for update;
  if not found or j.requested_by <> p_usuario or not app.permiso_de(p_usuario, 'ia.generar') then perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.'); end if;
  if j.status in ('GENERADO', 'CONVERTIDO') then return jsonb_build_object('terminado', true, 'estado', j.status); end if;
  perform app.validar(j.status in ('EN_COLA', 'EN_GENERACION'), 'La solicitud está cancelada o falló.');

  select * into x from public.generation_steps where job_id = j.id and status = 'EN_CURSO';
  if found then
    perform app.validar(x.started_at < now() - interval '4 minutes', 'Ya hay un paso en curso. Espere a que termine.');
    update public.generation_steps set status = 'FALLIDO', error = 'Sin respuesta del proveedor', cost_usd = reserved_usd, cost_estimated = reserved_usd > 0, finished_at = now() where id = x.id;
  end if;

  select t.p into v_paso from unnest(app.ia_pasos(j.content_type)) with ordinality t(p, o)
   where not exists (select 1 from public.generation_steps s where s.job_id = j.id and s.step = t.p and s.status = 'OK') order by t.o limit 1;
  select coalesce(max(attempt), 0) + 1 into v_intento from public.generation_steps where job_id = j.id and step = v_paso;
  if v_intento > 3 then
    update public.generation_jobs set status = 'FALLIDO', finished_at = now() where id = j.id;
    return jsonb_build_object('terminado', true, 'estado', 'FALLIDO');
  end if;
  perform app.validar(exists (select 1 from public.ai_models m join public.ai_providers r on r.id = m.provider_id where m.provider_id = j.provider_id and m.model_id = j.model_id and m.is_enabled and r.is_enabled)
                      and (j.provider_id = 'simulado' or app.ia_encendida()), 'La IA o ese modelo están apagados.');
  v_reserva := app.ia_reserva(j.provider_id, j.model_id, v_paso);
  perform app.validar(v_reserva = 0 or app.ia_gasto_mes() + v_reserva <= app.ia_limite('mes_usd'), 'Se alcanzó el tope mensual de gasto en IA.');

  insert into public.generation_steps (job_id, step, attempt, reserved_usd) values (j.id, v_paso, v_intento, v_reserva) returning id into v_id;
  update public.generation_jobs set status = 'EN_GENERACION' where id = j.id;
  return jsonb_build_object('terminado', false, 'paso_id', v_id, 'paso', v_paso, 'intento', v_intento, 'proveedor', j.provider_id, 'modelo', j.model_id, 'max_tokens', app.ia_max_tokens(v_paso),
    'solicitud', j.payload, 'tipo', j.content_type, 'categoria', (select name from public.knowledge_categories where id = j.category_id),
    'plan', (select output from public.generation_steps where job_id = j.id and step = 'plan' and status = 'OK'),
    'preguntas_previas', coalesce((select jsonb_agg(q ->> 'texto') from public.generation_steps s, jsonb_array_elements(s.output -> 'preguntas') q where s.job_id = j.id and s.status = 'OK' and s.step like 'dia_'), '[]'::jsonb),
    'error_anterior', (select error from public.generation_steps where job_id = j.id and step = v_paso and status = 'FALLIDO' order by attempt desc limit 1));
end $$;

/** Guarda el resultado de un paso: valida la salida, calcula el costo y decide si el trabajo terminó. */
create or replace function public.fn_srv_ia_paso_terminar(p_paso uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.generation_steps; j public.generation_jobs; m public.ai_models; v_err text[] := '{}'; v_costo numeric; v_est boolean := false; v_ok boolean;
begin
  perform pg_advisory_xact_lock(hashtext('t360.ia'));
  select * into s from public.generation_steps where id = p_paso;
  if not found then perform app.error('NO_ENCONTRADO', 'Paso no encontrado.'); end if;
  select * into j from public.generation_jobs where id = s.job_id for update;
  select * into s from public.generation_steps where id = p_paso for update;
  perform app.validar(s.status = 'EN_CURSO', 'Ese paso ya se cerró.');
  select * into m from public.ai_models where provider_id = j.provider_id and model_id = j.model_id;

  if coalesce((p ->> 'sin_cobro')::boolean, false) then v_costo := 0;
  elsif p ->> 'input_tokens' is not null and p ->> 'output_tokens' is not null then
    v_costo := round(((p ->> 'input_tokens')::numeric * m.input_usd_mtok + (p ->> 'output_tokens')::numeric * m.output_usd_mtok) / 1000000, 4);
  else v_costo := s.reserved_usd; v_est := s.reserved_usd > 0; end if;

  if nullif(p ->> 'error', '') is not null then v_err := array[left(p ->> 'error', 500)];
  else v_err := app.ia_validar(s.step, p -> 'salida'); end if;
  v_ok := cardinality(v_err) = 0;

  update public.generation_steps set status = case when v_ok then 'OK' else 'FALLIDO' end, cost_usd = v_costo, cost_estimated = v_est,
         input_tokens = (p ->> 'input_tokens')::int, output_tokens = (p ->> 'output_tokens')::int, stop_reason = left(p ->> 'stop_reason', 40),
         error = case when v_ok then null else left(array_to_string(v_err, '; '), 1000) end, output = p -> 'salida', finished_at = now()
   where id = s.id;

  if j.status = 'EN_GENERACION' then
    if v_ok and not exists (select 1 from unnest(app.ia_pasos(j.content_type)) t(x) where not exists (select 1 from public.generation_steps z where z.job_id = j.id and z.step = t.x and z.status = 'OK')) then
      update public.generation_jobs set status = 'GENERADO', finished_at = now(), validation_report = app.ia_informe(j.id) where id = j.id returning * into j;
    elsif not v_ok and (s.attempt >= 3 or coalesce((p ->> 'definitivo')::boolean, false)) then
      update public.generation_jobs set status = 'FALLIDO', finished_at = now() where id = j.id returning * into j;
    end if;
    if j.status in ('GENERADO', 'FALLIDO') then
      perform app.auditar('IA_' || j.status, 'generation_job', j.id::text, jsonb_build_object('costo_usd', (select sum(cost_usd) from public.generation_steps where job_id = j.id)), j.requested_by);
    end if;
  end if;
  return jsonb_build_object('ok', v_ok, 'errores', to_jsonb(v_err), 'estado', j.status, 'costo_usd', v_costo);
end $$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_ia_estado(), public.fn_ia_configurar(jsonb), public.fn_ia_tema_repetido(text), public.fn_ia_solicitar(jsonb, uuid), public.fn_ia_trabajos(),
  public.fn_ia_trabajo(uuid), public.fn_ia_cancelar(uuid), public.fn_ia_convertir(uuid, date) to authenticated;
grant execute on function public.fn_srv_ia_paso_iniciar(uuid, uuid), public.fn_srv_ia_paso_terminar(uuid, jsonb) to service_role;

insert into app.schema_migrations (version, description) values ('08', 'Generador con IA: proveedores, modelos, topes, trabajos por pasos, validación y conversión a borrador')
on conflict (version) do nothing;

commit;
