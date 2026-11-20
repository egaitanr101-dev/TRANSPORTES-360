-- =============================================================================
-- TRANSPORTES 360 · 05_capacitacion.sql  (Fase 3 · iteración 2)
-- Crea: training_weeks, capsules, capsule_blocks, capsule_questions, question_options,
--       question_answer_keys, approval_history, capsule_views, capsule_attempts, attempt_answers;
--       funciones de disponibilidad y validación; RPC del panel (editar, enviar, devolver, aprobar,
--       archivar, eliminar) y del colaborador (semana actual, cápsula, responder, historial).
-- Modifica: nada existente. Reversión: sql/reversion/05_capacitacion.down.sql
-- Reglas: D-04 (primer envío oficial + práctica), D-05 (retroalimentación inmediata), D-06 (cierre domingo),
--         D-07 (los que ven respuestas no participan), cuatro ojos en la aprobación (MAPA_FUNCIONAL §6).
-- Acceso: SOLO por RPC. Las tablas tienen RLS activa y ningún privilegio para anon/authenticated:
--         la respuesta correcta nunca puede leerse desde la API (R-02).
-- =============================================================================
begin;

/* ===================== Tablas ===================== */
create table public.training_weeks (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null check (extract(isodow from week_start) = 1),
  week_end    date generated always as (week_start + 6) stored,
  category_id uuid not null references public.knowledge_categories (id),
  title       text not null check (char_length(trim(title)) between 3 and 140),
  objective   text not null default '' check (char_length(objective) <= 400),
  status      text not null default 'BORRADOR'
              check (status in ('BORRADOR', 'PENDIENTE_REVISION', 'REQUIERE_CORRECCION', 'PROGRAMADO', 'PUBLICADO', 'ARCHIVADO')),
  version     int not null default 1,
  publish_at  timestamptz,
  created_by  uuid not null references public.profiles (id),
  updated_by  uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  closed_at   timestamptz,
  closed_by   uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index training_weeks_semana_idx on public.training_weeks (week_start) where status <> 'ARCHIVADO';
create index training_weeks_category_idx on public.training_weeks (category_id);
create index training_weeks_created_by_idx on public.training_weeks (created_by);
create index training_weeks_updated_by_idx on public.training_weeks (updated_by);
create index training_weeks_approved_by_idx on public.training_weeks (approved_by);
create index training_weeks_closed_by_idx on public.training_weeks (closed_by);
create trigger training_weeks_updated_at before update on public.training_weeks for each row execute function app.tg_updated_at();

create table public.capsules (
  id                uuid primary key default gen_random_uuid(),
  week_id           uuid not null references public.training_weeks (id) on delete cascade,
  day_number        smallint not null check (day_number between 1 and 5),
  title             text not null check (char_length(trim(title)) between 3 and 140),
  objective         text not null default '' check (char_length(objective) <= 400),
  estimated_minutes smallint not null default 4 check (estimated_minutes between 1 and 15),
  locked_at         timestamptz,                      -- primera respuesta oficial: ya no se edita
  unique (week_id, day_number)                        -- 5 cápsulas por semana (no unique(week_id))
);

create table public.capsule_blocks (
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  position   smallint not null check (position between 1 and 20),
  block_type text not null check (block_type in ('portada', 'texto', 'escenario', 'revelar', 'detecta', 'historia', 'infografia', 'compromiso')),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000),
  primary key (capsule_id, position)
);

create table public.capsule_questions (
  id         uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  position   smallint not null check (position between 1 and 2),
  prompt     text not null check (char_length(trim(prompt)) between 5 and 400),
  unique (capsule_id, position)
);

create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.capsule_questions (id) on delete cascade,
  position    smallint not null check (position between 1 and 4),
  label       text not null check (char_length(trim(label)) between 1 and 200),
  unique (question_id, position),
  unique (question_id, id)
);

create table public.question_answer_keys (
  question_id        uuid primary key references public.capsule_questions (id) on delete cascade,
  correct_option_id  uuid not null,
  explanation        text not null check (char_length(trim(explanation)) between 3 and 500),
  incorrect_feedback text not null check (char_length(trim(incorrect_feedback)) between 3 and 500),
  foreign key (question_id, correct_option_id) references public.question_options (question_id, id) on delete cascade
);

create table public.approval_history (
  id          bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('training_week')),
  entity_id   uuid not null,
  version     int not null,
  from_status text,
  to_status   text not null,
  comment     text,
  actor_id    uuid not null references public.profiles (id),
  details     jsonb not null default '{}'::jsonb,
  ts          timestamptz not null default now()
);
create index approval_history_entity_idx on public.approval_history (entity_type, entity_id, ts);
create index approval_history_actor_idx on public.approval_history (actor_id);
create trigger approval_history_inmutable before update or delete on public.approval_history for each row execute function app.tg_inmutable();

create table public.capsule_views (
  capsule_id      uuid not null references public.capsules (id) on delete cascade,
  user_id         uuid not null references public.profiles (id),
  first_viewed_at timestamptz not null default now(),
  last_viewed_at  timestamptz not null default now(),
  primary key (capsule_id, user_id)
);
create index capsule_views_user_idx on public.capsule_views (user_id);

create table public.capsule_attempts (
  id              uuid primary key default gen_random_uuid(),
  capsule_id      uuid not null references public.capsules (id),          -- sin cascada: protege resultados
  week_id         uuid not null references public.training_weeks (id),
  user_id         uuid not null references public.profiles (id),
  attempt_type    text not null check (attempt_type in ('OFICIAL', 'PRACTICA')),
  score           smallint not null check (score between 0 and 2),
  total           smallint not null check (total between 1 and 2),
  idempotency_key uuid not null unique,
  submitted_at    timestamptz not null default now()
);
create unique index capsule_attempts_oficial_idx on public.capsule_attempts (capsule_id, user_id) where attempt_type = 'OFICIAL';
create index capsule_attempts_week_user_idx on public.capsule_attempts (week_id, user_id);
create index capsule_attempts_user_idx on public.capsule_attempts (user_id);
create trigger capsule_attempts_inmutable before update or delete on public.capsule_attempts for each row execute function app.tg_inmutable();

create table public.attempt_answers (
  attempt_id         uuid not null references public.capsule_attempts (id),
  question_id        uuid not null,
  selected_option_id uuid not null,
  is_correct         boolean not null,
  primary key (attempt_id, question_id),
  foreign key (question_id, selected_option_id) references public.question_options (question_id, id)
);
create index attempt_answers_question_idx on public.attempt_answers (question_id, selected_option_id);
create trigger attempt_answers_inmutable before update or delete on public.attempt_answers for each row execute function app.tg_inmutable();

alter table public.training_weeks enable row level security;
alter table public.capsules enable row level security;
alter table public.capsule_blocks enable row level security;
alter table public.capsule_questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.approval_history enable row level security;
alter table public.capsule_views enable row level security;
alter table public.capsule_attempts enable row level security;
alter table public.attempt_answers enable row level security;
revoke all on public.training_weeks, public.capsules, public.capsule_blocks, public.capsule_questions, public.question_options,
              public.question_answer_keys, public.approval_history, public.capsule_views, public.capsule_attempts,
              public.attempt_answers from public, anon, authenticated;

/* ===================== Utilidades ===================== */
create or replace function app.hoy_cr()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Costa_Rica')::date
$$;

create or replace function app.semana_visible(w public.training_weeks)
returns boolean language sql stable set search_path = '' as $$
  select w.status in ('PROGRAMADO', 'PUBLICADO') and w.publish_at is not null and w.publish_at <= now()
$$;

/** La semana admite respuestas oficiales: no cerrada y hasta el domingo 23:59 (D-06). */
create or replace function app.semana_abierta(w public.training_weeks)
returns boolean language sql stable set search_path = '' as $$
  select w.closed_at is null and app.hoy_cr() <= w.week_end
$$;

create or replace function app.capsula_disponible(c public.capsules, w public.training_weeks)
returns boolean language sql stable set search_path = '' as $$
  select app.semana_visible(w) and w.week_start + (c.day_number - 1) <= app.hoy_cr()
$$;

create or replace function app.etapa(p_dia int)
returns text language sql immutable set search_path = '' as $$
  select (array['Introducción', 'Conocimiento práctico', 'Aplicación', 'Prevención', 'Integración'])[p_dia]
$$;

create or replace function app.nombre_dia(p_dia int)
returns text language sql immutable set search_path = '' as $$
  select (array['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])[p_dia]
$$;

/** Exige una semana completa: 5 cápsulas (lunes a viernes), con contenido, 2 preguntas de 3–4 opciones y su clave. */
create or replace function app.validar_semana_completa(p_semana uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare c record; n int;
begin
  select count(*) into n from public.capsules where week_id = p_semana;
  perform app.validar(n = 5, 'La semana debe tener 5 cápsulas (lunes a viernes); tiene ' || n || '.');
  for c in select * from public.capsules where week_id = p_semana order by day_number loop
    perform app.validar(exists (select 1 from public.capsule_blocks b where b.capsule_id = c.id),
                        'La cápsula del ' || app.nombre_dia(c.day_number) || ' no tiene contenido.');
    select count(*) into n from public.capsule_questions q where q.capsule_id = c.id;
    perform app.validar(n = 2, 'La cápsula del ' || app.nombre_dia(c.day_number) || ' debe tener 2 preguntas.');
    perform app.validar(not exists (
        select 1 from public.capsule_questions q
        where q.capsule_id = c.id
          and ((select count(*) from public.question_options o where o.question_id = q.id) not between 3 and 4
               or not exists (select 1 from public.question_answer_keys k where k.question_id = q.id))),
      'Cada pregunta del ' || app.nombre_dia(c.day_number) || ' necesita 3 o 4 opciones y una respuesta correcta.');
  end loop;
end $$;

create or replace function app.registrar_estado(p_semana public.training_weeks, p_desde text, p_hasta text, p_comentario text, p_detalle jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.approval_history (entity_type, entity_id, version, from_status, to_status, comment, actor_id, details)
  values ('training_week', p_semana.id, p_semana.version, p_desde, p_hasta, nullif(trim(p_comentario), ''), auth.uid(), coalesce(p_detalle, '{}'::jsonb))
$$;

/* ===================== RPC del panel ===================== */
create or replace function public.fn_admin_semanas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.actor();
  if not (app.tiene_permiso('contenido.crear_editar') or app.tiene_permiso('contenido.aprobar')) then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'week_start', w.week_start, 'week_end', w.week_end, 'titulo', w.title,
      'categoria', k.name, 'estado', w.status, 'version', w.version, 'publica', w.publish_at,
      'editado', w.updated_at, 'editor', e.full_name, 'aprobador', a.full_name, 'cerrada', w.closed_at is not null,
      'completas', (select count(*) from public.capsules c where c.week_id = w.id)
    ) order by w.week_start desc)
    from public.training_weeks w
    join public.knowledge_categories k on k.id = w.category_id
    join public.profiles e on e.id = w.updated_by
    left join public.profiles a on a.id = w.approved_by), '[]'::jsonb);
end $$;

/** Semana completa para editar o revisar, INCLUIDA la clave de respuestas (solo panel). */
create or replace function public.fn_admin_semana(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.training_weeks;
begin
  perform app.actor();
  if not (app.tiene_permiso('contenido.crear_editar') or app.tiene_permiso('contenido.aprobar')) then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
  select * into w from public.training_weeks where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  return jsonb_build_object(
    'id', w.id, 'week_start', w.week_start, 'week_end', w.week_end, 'category_id', w.category_id, 'titulo', w.title,
    'objetivo', w.objective, 'estado', w.status, 'version', w.version, 'publica', w.publish_at,
    'editor_id', w.updated_by, 'editor', (select full_name from public.profiles where id = w.updated_by),
    'aprobador', (select full_name from public.profiles where id = w.approved_by), 'aprobada', w.approved_at,
    'bloqueada', exists (select 1 from public.capsules c where c.week_id = w.id and c.locked_at is not null),
    'historial', coalesce((select jsonb_agg(jsonb_build_object('fecha', h.ts, 'de', h.from_status, 'a', h.to_status, 'comentario', h.comment,
                                                               'actor', (select full_name from public.profiles where id = h.actor_id), 'version', h.version) order by h.ts)
                           from public.approval_history h where h.entity_type = 'training_week' and h.entity_id = w.id), '[]'::jsonb),
    'capsulas', coalesce((select jsonb_agg(jsonb_build_object(
        'dia', c.day_number, 'titulo', c.title, 'objetivo', c.objective, 'minutos', c.estimated_minutes, 'bloqueada', c.locked_at is not null,
        'bloques', coalesce((select jsonb_agg(b.data || jsonb_build_object('tipo', b.block_type) order by b.position) from public.capsule_blocks b where b.capsule_id = c.id), '[]'::jsonb),
        'preguntas', coalesce((select jsonb_agg(jsonb_build_object(
            'texto', q.prompt,
            'opciones', (select jsonb_agg(o.label order by o.position) from public.question_options o where o.question_id = q.id),
            'correcta', (select o.position - 1 from public.question_options o join public.question_answer_keys k on k.correct_option_id = o.id where k.question_id = q.id),
            'explicacion', (select k.explanation from public.question_answer_keys k where k.question_id = q.id),
            'retro', (select k.incorrect_feedback from public.question_answer_keys k where k.question_id = q.id)) order by q.position)
          from public.capsule_questions q where q.capsule_id = c.id), '[]'::jsonb)
      ) order by c.day_number) from public.capsules c where c.week_id = w.id), '[]'::jsonb));
end $$;

/** Crea o actualiza una semana completa (borradores incompletos permitidos).
    Editar algo aprobado o en revisión lo devuelve a revisión. Una cápsula con respuestas oficiales no se edita. */
create or replace function public.fn_admin_semana_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  w       public.training_weeks;
  v_id    uuid := nullif(p ->> 'id', '')::uuid;
  v_cap   jsonb; v_blq jsonb; v_pre jsonb; v_opc jsonb;
  v_cap_id uuid; v_q_id uuid; v_o_id uuid; v_correcta int;
  i int; j int;
begin
  perform app.exigir('contenido.crear_editar');
  perform app.validar(jsonb_typeof(p) = 'object', 'Datos no válidos.');
  perform app.validar(jsonb_typeof(coalesce(p -> 'capsulas', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p -> 'capsulas', '[]'::jsonb)) <= 5,
                      'Una semana tiene como máximo 5 cápsulas.');
  perform app.validar(extract(isodow from (p ->> 'week_start')::date) = 1, 'La semana debe empezar un lunes.');

  if v_id is null then
    begin
      insert into public.training_weeks (week_start, category_id, title, objective, created_by, updated_by)
      values ((p ->> 'week_start')::date, (p ->> 'category_id')::uuid, trim(p ->> 'titulo'), coalesce(trim(p ->> 'objetivo'), ''), v_actor.id, v_actor.id)
      returning * into w;
    exception when unique_violation then
      perform app.error('VALIDACION', 'Ya existe una capacitación para esa semana.');
    end;
    perform app.registrar_estado(w, null, 'BORRADOR', null);
  else
    select * into w from public.training_weeks where id = v_id for update;
    if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
    perform app.validar(w.status in ('BORRADOR', 'REQUIERE_CORRECCION', 'PENDIENTE_REVISION', 'PROGRAMADO'), 'Esta semana ya no se puede editar.');
    perform app.validar(not exists (select 1 from public.capsules c where c.week_id = w.id and c.locked_at is not null)
                        and not exists (select 1 from public.capsule_attempts a where a.week_id = w.id),
                        'La semana ya tiene respuestas: no se puede editar.');
    begin
      update public.training_weeks
         set week_start = (p ->> 'week_start')::date, category_id = (p ->> 'category_id')::uuid, title = trim(p ->> 'titulo'),
             objective = coalesce(trim(p ->> 'objetivo'), ''), updated_by = v_actor.id, version = version + 1,
             status = case when status in ('PROGRAMADO', 'PENDIENTE_REVISION') then 'PENDIENTE_REVISION' else status end,
             publish_at = case when status = 'PROGRAMADO' then null else publish_at end,
             approved_by = case when status = 'PROGRAMADO' then null else approved_by end,
             approved_at = case when status = 'PROGRAMADO' then null else approved_at end
       where id = w.id
      returning * into w;
    exception when unique_violation then
      perform app.error('VALIDACION', 'Ya existe una capacitación para esa semana.');
    end;
    delete from public.capsules where week_id = w.id;
  end if;

  i := 0;
  for v_cap in select * from jsonb_array_elements(coalesce(p -> 'capsulas', '[]'::jsonb)) loop
    insert into public.capsules (week_id, day_number, title, objective, estimated_minutes)
    values (w.id, (v_cap ->> 'dia')::smallint, trim(v_cap ->> 'titulo'), coalesce(trim(v_cap ->> 'objetivo'), ''), coalesce((v_cap ->> 'minutos')::smallint, 4))
    returning id into v_cap_id;
    j := 0;
    for v_blq in select * from jsonb_array_elements(coalesce(v_cap -> 'bloques', '[]'::jsonb)) loop
      j := j + 1;
      insert into public.capsule_blocks (capsule_id, position, block_type, data)
      values (v_cap_id, j, v_blq ->> 'tipo', v_blq - 'tipo');
    end loop;
    j := 0;
    for v_pre in select * from jsonb_array_elements(coalesce(v_cap -> 'preguntas', '[]'::jsonb)) loop
      j := j + 1;
      insert into public.capsule_questions (capsule_id, position, prompt) values (v_cap_id, j, trim(v_pre ->> 'texto')) returning id into v_q_id;
      v_correcta := (v_pre ->> 'correcta')::int;
      i := 0;
      for v_opc in select * from jsonb_array_elements(coalesce(v_pre -> 'opciones', '[]'::jsonb)) loop
        i := i + 1;
        insert into public.question_options (question_id, position, label) values (v_q_id, i, trim(v_opc #>> '{}')) returning id into v_o_id;
        if v_correcta is not null and v_correcta = i - 1 then
          insert into public.question_answer_keys (question_id, correct_option_id, explanation, incorrect_feedback)
          values (v_q_id, v_o_id, trim(coalesce(v_pre ->> 'explicacion', '')), trim(coalesce(v_pre ->> 'retro', '')));
        end if;
      end loop;
    end loop;
  end loop;

  perform app.auditar('SEMANA_GUARDADA', 'training_week', w.id::text, jsonb_build_object('version', w.version, 'estado', w.status));
  return w.id;
end $$;

create or replace function public.fn_admin_semana_enviar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.training_weeks; v_antes text;
begin
  perform app.exigir('contenido.crear_editar');
  select * into w from public.training_weeks where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  perform app.validar(w.status in ('BORRADOR', 'REQUIERE_CORRECCION'), 'Solo un borrador o una semana devuelta se envía a revisión.');
  perform app.validar_semana_completa(w.id);
  v_antes := w.status;
  update public.training_weeks set status = 'PENDIENTE_REVISION' where id = w.id returning * into w;
  perform app.registrar_estado(w, v_antes, 'PENDIENTE_REVISION', null);
  return jsonb_build_object('estado', w.status);
end $$;

create or replace function public.fn_admin_semana_devolver(p_id uuid, p_comentario text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.training_weeks;
begin
  perform app.exigir('contenido.aprobar');
  perform app.validar(char_length(trim(coalesce(p_comentario, ''))) >= 5, 'Explique qué se debe corregir.');
  select * into w from public.training_weeks where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  perform app.validar(w.status = 'PENDIENTE_REVISION', 'Solo se devuelve una semana pendiente de revisión.');
  update public.training_weeks set status = 'REQUIERE_CORRECCION' where id = w.id returning * into w;
  perform app.registrar_estado(w, 'PENDIENTE_REVISION', 'REQUIERE_CORRECCION', p_comentario);
  return jsonb_build_object('estado', w.status);
end $$;

/** Aprueba y programa: se publica el lunes 00:00 (hora de Costa Rica) de su semana.
    Cuatro ojos: quien editó por última vez no aprueba, salvo que el administrador principal sea el único aprobador. */
create or replace function public.fn_admin_semana_aprobar(p_id uuid, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  w       public.training_weeks;
  v_unico boolean := false;
  v_aprobadores int;
begin
  perform app.exigir('contenido.aprobar');
  select * into w from public.training_weeks where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  perform app.validar(w.status = 'PENDIENTE_REVISION', 'Solo se aprueba una semana pendiente de revisión.');
  perform app.validar(w.week_end >= app.hoy_cr(), 'Esa semana ya pasó.');
  perform app.validar_semana_completa(w.id);
  if w.updated_by = v_actor.id then
    select count(*) into v_aprobadores from public.profiles p
     where p.is_active and exists (select 1 from public.role_permissions rp where rp.role_id = p.role_id and rp.permission_id = 'contenido.aprobar');
    if v_actor.role_id = 'ADMIN_PRINCIPAL' and v_aprobadores = 1 then
      v_unico := true;   -- excepción documentada: único aprobador de la organización
    else
      perform app.error('VALIDACION', 'Usted editó esta semana: debe aprobarla otra persona (regla de cuatro ojos).');
    end if;
  end if;
  update public.training_weeks
     set status = 'PROGRAMADO', approved_by = v_actor.id, approved_at = now(),
         publish_at = (w.week_start::timestamp at time zone 'America/Costa_Rica')
   where id = w.id returning * into w;
  perform app.registrar_estado(w, 'PENDIENTE_REVISION', 'PROGRAMADO', p_comentario, jsonb_build_object('aprobador_unico', v_unico));
  perform app.auditar('SEMANA_APROBADA', 'training_week', w.id::text, jsonb_build_object('version', w.version, 'publica', w.publish_at, 'aprobador_unico', v_unico));
  return jsonb_build_object('estado', w.status, 'publica', w.publish_at, 'aprobador_unico', v_unico);
end $$;

create or replace function public.fn_admin_semana_archivar(p_id uuid, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.training_weeks; v_antes text;
begin
  perform app.exigir('contenido.aprobar');
  select * into w from public.training_weeks where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  perform app.validar(w.status <> 'ARCHIVADO', 'La semana ya está archivada.');
  perform app.validar(not (app.semana_visible(w) and app.semana_abierta(w) and w.week_start <= app.hoy_cr()),
                      'La semana está en curso: no se archiva hasta que termine.');
  v_antes := w.status;
  update public.training_weeks set status = 'ARCHIVADO' where id = w.id returning * into w;
  perform app.registrar_estado(w, v_antes, 'ARCHIVADO', p_comentario);
  return jsonb_build_object('estado', w.status);
end $$;

create or replace function public.fn_admin_semana_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.training_weeks;
begin
  perform app.exigir('contenido.crear_editar');
  select * into w from public.training_weeks where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  perform app.validar(w.status in ('BORRADOR', 'REQUIERE_CORRECCION') and w.approved_at is null, 'Solo se elimina un borrador que nunca fue aprobado; archive las demás.');
  delete from public.training_weeks where id = w.id;
  perform app.auditar('SEMANA_ELIMINADA', 'training_week', w.id::text, jsonb_build_object('titulo', w.title, 'semana', w.week_start));
end $$;

/* ===================== RPC del colaborador ===================== */
/** Semana en curso con el estado de cada cápsula para quien consulta. Null si no hay. */
create or replace function public.fn_semana_actual()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  w       public.training_weeks;
  v_hoy   date := app.hoy_cr();
begin
  perform app.exigir('contenido.ver_publicado');
  select * into w from public.training_weeks t
   where t.status in ('PROGRAMADO', 'PUBLICADO') and t.publish_at <= now() and t.week_start <= v_hoy and v_hoy <= t.week_end
   order by t.week_start desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', w.id, 'numero', extract(week from w.week_start)::int, 'tema', w.title,
    'categoria', (select k.name from public.knowledge_categories k where k.id = w.category_id),
    'rango', to_char(w.week_start, 'DD/MM') || ' al ' || to_char(w.week_end, 'DD/MM'),
    'cierre', 'domingo ' || to_char(w.week_end, 'DD/MM') || ' a las 11:59 p. m.',
    'abierta', app.semana_abierta(w),
    'capsulas', (select jsonb_agg(jsonb_build_object(
        'id', c.id, 'dia', c.day_number, 'nombre', app.nombre_dia(c.day_number), 'etapa', app.etapa(c.day_number), 'titulo', c.title,
        'estado', case
          when a.id is not null then 'completada'
          when w.week_start + (c.day_number - 1) = v_hoy then 'hoy'
          when w.week_start + (c.day_number - 1) < v_hoy then 'pendiente'
          else 'bloqueada' end,
        'puntos', a.score) order by c.day_number)
      from public.capsules c
      left join public.capsule_attempts a on a.capsule_id = c.id and a.user_id = v_actor.id and a.attempt_type = 'OFICIAL'
      where c.week_id = w.id));
end $$;

/** Cápsula para leer y responder. Opciones en orden propio de cada usuario. NUNCA incluye la respuesta correcta. */
create or replace function public.fn_capsula(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  c public.capsules; w public.training_weeks; v_of public.capsule_attempts;
begin
  perform app.exigir('contenido.ver_publicado');
  select * into c from public.capsules where id = p_id;
  if found then select * into w from public.training_weeks where id = c.week_id; end if;
  if c.id is null or w.status = 'ARCHIVADO' or not app.capsula_disponible(c, w) then
    perform app.error('NO_ENCONTRADO', 'Cápsula no disponible.');
  end if;
  insert into public.capsule_views (capsule_id, user_id) values (c.id, v_actor.id)
  on conflict (capsule_id, user_id) do update set last_viewed_at = now();
  select * into v_of from public.capsule_attempts where capsule_id = c.id and user_id = v_actor.id and attempt_type = 'OFICIAL';
  return jsonb_build_object(
    'id', c.id, 'dia', c.day_number, 'etapa', app.etapa(c.day_number), 'titulo', c.title, 'objetivo', c.objective, 'minutos', c.estimated_minutes,
    'semana', jsonb_build_object('numero', extract(week from w.week_start)::int, 'tema', w.title),
    'abierta', app.semana_abierta(w),
    'intentoOficial', case when v_of.id is null then null else jsonb_build_object('puntaje', v_of.score) end,
    'bloques', coalesce((select jsonb_agg(b.data || jsonb_build_object('tipo', b.block_type) order by b.position) from public.capsule_blocks b where b.capsule_id = c.id), '[]'::jsonb),
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'texto', q.prompt,
        'opciones', (select jsonb_agg(jsonb_build_object('id', o.id, 'texto', o.label) order by md5(v_actor.id::text || o.id::text))
                       from public.question_options o where o.question_id = q.id)) order by q.position)
      from public.capsule_questions q where q.capsule_id = c.id), '[]'::jsonb));
end $$;

/** Corrige en el servidor. Primer envío con la semana abierta = OFICIAL; los demás = PRÁCTICA (D-04).
    Devuelve la retroalimentación inmediata (D-05). La misma clave de idempotencia devuelve el mismo resultado. */
create or replace function public.fn_responder_capsula(p_capsula uuid, p_respuestas jsonb, p_clave uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  c public.capsules; w public.training_weeks;
  v_prev uuid; v_tipo text; v_intento uuid; v_puntos smallint := 0; v_filas jsonb := '[]'::jsonb;
  q record; v_sel uuid;
begin
  perform app.exigir('evaluacion.responder');
  perform app.validar(v_actor.privacy_accepted_at is not null, 'Debe aceptar el aviso de privacidad antes de responder.');
  perform app.validar(p_clave is not null and jsonb_typeof(p_respuestas) = 'object', 'Formato de respuestas no válido.');

  select a.id into v_prev from public.capsule_attempts a where a.idempotency_key = p_clave and a.user_id = v_actor.id;
  if v_prev is null then
    select * into c from public.capsules where id = p_capsula;
    if found then select * into w from public.training_weeks where id = c.week_id; end if;
    if c.id is null or w.status = 'ARCHIVADO' or not app.capsula_disponible(c, w) then
      perform app.error('NO_ENCONTRADO', 'Cápsula no disponible.');
    end if;

    for q in select x.id, k.correct_option_id, k.explanation, k.incorrect_feedback
               from public.capsule_questions x join public.question_answer_keys k on k.question_id = x.id
              where x.capsule_id = c.id order by x.position loop
      v_sel := nullif(p_respuestas ->> q.id::text, '')::uuid;
      perform app.validar(exists (select 1 from public.question_options o where o.question_id = q.id and o.id = v_sel),
                          'Responda todas las preguntas con una opción válida.');
      v_filas := v_filas || jsonb_build_object('pregunta_id', q.id, 'seleccionada', v_sel, 'correcta_id', q.correct_option_id,
                                               'es_correcta', v_sel = q.correct_option_id,
                                               'mensaje', case when v_sel = q.correct_option_id then q.explanation else q.incorrect_feedback end);
      if v_sel = q.correct_option_id then v_puntos := v_puntos + 1; end if;
    end loop;
    perform app.validar(jsonb_array_length(v_filas) between 1 and 2, 'La cápsula no tiene preguntas válidas.');

    v_tipo := 'PRACTICA';
    if app.semana_abierta(w) then
      insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, total, idempotency_key)
      values (c.id, w.id, v_actor.id, 'OFICIAL', v_puntos, jsonb_array_length(v_filas), p_clave)
      on conflict (capsule_id, user_id) where attempt_type = 'OFICIAL' do nothing
      returning id into v_intento;
      if v_intento is not null then v_tipo := 'OFICIAL'; end if;
    end if;
    if v_intento is null then
      insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, total, idempotency_key)
      values (c.id, w.id, v_actor.id, 'PRACTICA', v_puntos, jsonb_array_length(v_filas), p_clave)
      returning id into v_intento;
    end if;
    insert into public.attempt_answers (attempt_id, question_id, selected_option_id, is_correct)
    select v_intento, (e ->> 'pregunta_id')::uuid, (e ->> 'seleccionada')::uuid, (e ->> 'es_correcta')::boolean from jsonb_array_elements(v_filas) e;
    if v_tipo = 'OFICIAL' then
      update public.capsules set locked_at = coalesce(locked_at, now()) where id = c.id;
    end if;
    v_prev := v_intento;
  end if;

  -- Respuesta (también para reintentos con la misma clave)
  return (select jsonb_build_object(
    'tipo', a.attempt_type, 'puntaje', a.score, 'total', a.total,
    'resultados', (select jsonb_agg(jsonb_build_object(
        'pregunta_id', r.question_id, 'seleccionada', r.selected_option_id, 'correcta_id', k.correct_option_id,
        'es_correcta', r.is_correct, 'mensaje', case when r.is_correct then k.explanation else k.incorrect_feedback end)
        order by qq.position)
      from public.attempt_answers r
      join public.question_answer_keys k on k.question_id = r.question_id
      join public.capsule_questions qq on qq.id = r.question_id
      where r.attempt_id = a.id))
    from public.capsule_attempts a where a.id = v_prev);
end $$;

/** Historial propio: semanas visibles hasta hoy, cápsulas completadas y puntos oficiales. */
create or replace function public.fn_mi_historial()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  perform app.exigir('resultados.ver_propios');
  return jsonb_build_object('semanas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'semana', extract(week from w.week_start)::int, 'tema', w.title,
      'estado', case when app.semana_abierta(w) then 'En curso' else 'Cerrada' end,
      'capsulas', (select count(*) from public.capsule_attempts a where a.week_id = w.id and a.user_id = v_actor.id and a.attempt_type = 'OFICIAL'),
      'puntos', (select coalesce(sum(a.score), 0) from public.capsule_attempts a where a.week_id = w.id and a.user_id = v_actor.id and a.attempt_type = 'OFICIAL'))
      order by w.week_start desc)
    from public.training_weeks w
    where w.status in ('PROGRAMADO', 'PUBLICADO') and w.publish_at <= now() and w.week_start <= app.hoy_cr()), '[]'::jsonb));
end $$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
grant execute on function app.permiso_de(uuid, text), app.tiene_permiso(text) to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_admin_semanas(), public.fn_admin_semana(uuid), public.fn_admin_semana_guardar(jsonb),
                          public.fn_admin_semana_enviar(uuid), public.fn_admin_semana_devolver(uuid, text),
                          public.fn_admin_semana_aprobar(uuid, text), public.fn_admin_semana_archivar(uuid, text),
                          public.fn_admin_semana_eliminar(uuid), public.fn_semana_actual(), public.fn_capsula(uuid),
                          public.fn_responder_capsula(uuid, jsonb, uuid), public.fn_mi_historial() to authenticated;

insert into app.schema_migrations (version, description) values ('05', 'Capacitación semanal: semanas, cápsulas, preguntas, flujo editorial, respuestas')
on conflict (version) do nothing;

commit;
