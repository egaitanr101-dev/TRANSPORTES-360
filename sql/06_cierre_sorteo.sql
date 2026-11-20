-- =============================================================================
-- TRANSPORTES 360 · 06_cierre_sorteo.sql  (Fase 3 · iteración 3)
-- Crea: weekly_results, weekly_draws, draw_entries, recognitions (inmutables, salvo la anulación auditada
--       del sorteo y el consentimiento del ganador); cierre de semana; sorteo criptográfico idempotente;
--       anulación por el administrador principal; reconocimientos (semana perfecta, ganador).
-- Modifica: fn_mi_historial (agrega "participó en el sorteo" e insignia). Reversión: sql/reversion/06_cierre_sorteo.down.sql
-- Reglas (MAPA_FUNCIONAL §9, reglamento del sorteo):
--   * Participan solo quienes completaron las 5 evaluaciones oficiales y pueden participar (D-07).
--   * Máximo = puntuación más alta REALMENTE alcanzada (sin mínimo fijo). Entran todos los empatados.
--   * Misma probabilidad para todos: lista ordenada por identificador, bytes criptográficos, rechazo (sin sesgo).
--   * Un único sorteo vigente por semana (índice único parcial + bloqueo + retorno idempotente).
--   * Corrección solo por anulación auditada del administrador principal, con motivo.
-- =============================================================================
begin;

/* ===================== Tablas ===================== */
create table public.weekly_results (
  week_id            uuid not null references public.training_weeks (id),
  user_id            uuid not null references public.profiles (id),
  capsules_completed smallint not null check (capsules_completed between 0 and 5),
  score              smallint not null check (score between 0 and 10),
  completed_all      boolean not null,
  eligible           boolean not null,          -- completó 5/5, activo y habilitado para el sorteo al cierre
  computed_at        timestamptz not null default now(),
  primary key (week_id, user_id)
);
create index weekly_results_user_idx on public.weekly_results (user_id);
create trigger weekly_results_inmutable before update or delete on public.weekly_results for each row execute function app.tg_inmutable();

create table public.weekly_draws (
  id                   uuid primary key default gen_random_uuid(),
  week_id              uuid not null references public.training_weeks (id),
  status               text not null check (status in ('OFICIAL', 'DESIERTO', 'ANULADO')),
  max_score            smallint,
  eligible_count       int not null default 0,
  winner_user_id       uuid references public.profiles (id),
  random_bytes         bytea,
  eligible_list_sha256 text,
  algorithm_version    text not null,
  executed_by          uuid not null references public.profiles (id),
  executed_at          timestamptz not null default now(),
  annulled_by          uuid references public.profiles (id),
  annulled_at          timestamptz,
  annul_reason         text,
  replaces_draw_id     uuid references public.weekly_draws (id),
  constraint sorteo_con_ganador check (status = 'DESIERTO' or winner_user_id is not null)
);
create unique index weekly_draws_vigente_idx on public.weekly_draws (week_id) where status in ('OFICIAL', 'DESIERTO');
create index weekly_draws_week_idx on public.weekly_draws (week_id);
create index weekly_draws_winner_idx on public.weekly_draws (winner_user_id);
create index weekly_draws_executed_by_idx on public.weekly_draws (executed_by);
create index weekly_draws_annulled_by_idx on public.weekly_draws (annulled_by);
create index weekly_draws_replaces_idx on public.weekly_draws (replaces_draw_id);

/** El sorteo solo admite un cambio: pasar a ANULADO con motivo. Nada se borra. */
create or replace function app.tg_sorteo_protegido()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Un sorteo no se borra; se anula.', hint = 'INMUTABLE';
  end if;
  if old.status in ('OFICIAL', 'DESIERTO') and new.status = 'ANULADO'
     and new.annulled_by is not null and char_length(coalesce(new.annul_reason, '')) >= 10
     and (new.id, new.week_id, new.max_score, new.eligible_count, new.winner_user_id, new.random_bytes, new.eligible_list_sha256, new.executed_by, new.executed_at)
         is not distinct from (old.id, old.week_id, old.max_score, old.eligible_count, old.winner_user_id, old.random_bytes, old.eligible_list_sha256, old.executed_by, old.executed_at) then
    return new;
  end if;
  raise exception using errcode = '42501', message = 'El sorteo registrado no se modifica.', hint = 'INMUTABLE';
end $$;
create trigger weekly_draws_protegido before update or delete on public.weekly_draws for each row execute function app.tg_sorteo_protegido();

create table public.draw_entries (
  draw_id  uuid not null references public.weekly_draws (id),
  user_id  uuid not null references public.profiles (id),
  score    smallint not null,
  position int not null,
  primary key (draw_id, user_id),
  unique (draw_id, position)
);
create index draw_entries_user_idx on public.draw_entries (user_id);
create trigger draw_entries_inmutable before update or delete on public.draw_entries for each row execute function app.tg_inmutable();

create table public.recognitions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id),
  week_id    uuid references public.training_weeks (id),
  type       text not null check (type in ('GANADOR_SORTEO', 'SEMANA_PERFECTA')),
  is_public  boolean not null default false,     -- D-08: el nombre del ganador se muestra solo con su consentimiento
  created_at timestamptz not null default now(),
  unique (user_id, week_id, type)
);
create index recognitions_week_idx on public.recognitions (week_id);

alter table public.weekly_results enable row level security;
alter table public.weekly_draws enable row level security;
alter table public.draw_entries enable row level security;
alter table public.recognitions enable row level security;
revoke all on public.weekly_results, public.weekly_draws, public.draw_entries, public.recognitions from public, anon, authenticated;

/* ===================== Cierre de semana ===================== */
/** Congela los resultados. Base: perfiles activos que pueden responder evaluaciones. Idempotente.
    p_actor null = cierre automático (proceso programado). */
create or replace function app.cerrar_semana(p_semana uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.training_weeks; n int;
begin
  select * into w from public.training_weeks where id = p_semana for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  if w.closed_at is not null then
    return jsonb_build_object('cerrada', true, 'ya_estaba', true, 'resultados', (select count(*) from public.weekly_results where week_id = w.id));
  end if;
  perform app.validar(w.status in ('PROGRAMADO', 'PUBLICADO') and w.publish_at <= now(), 'Solo se cierra una semana publicada.');
  perform app.validar(w.week_end < app.hoy_cr(), 'La semana termina el domingo ' || to_char(w.week_end, 'DD/MM') || ' a las 11:59 p. m.; todavía no se puede cerrar.');

  insert into public.weekly_results (week_id, user_id, capsules_completed, score, completed_all, eligible)
  select w.id, p.id, coalesce(a.n, 0), coalesce(a.puntos, 0), coalesce(a.n, 0) = 5, coalesce(a.n, 0) = 5 and p.draw_eligible and p.is_active
    from public.profiles p
    left join (select user_id, count(*)::smallint as n, sum(score)::smallint as puntos
                 from public.capsule_attempts where week_id = w.id and attempt_type = 'OFICIAL' group by user_id) a on a.user_id = p.id
   where (p.is_active and exists (select 1 from public.role_permissions rp where rp.role_id = p.role_id and rp.permission_id = 'evaluacion.responder'))
      or a.user_id is not null;
  get diagnostics n = row_count;

  insert into public.recognitions (user_id, week_id, type, is_public)
  select r.user_id, w.id, 'SEMANA_PERFECTA', false from public.weekly_results r where r.week_id = w.id and r.score = 10 and r.completed_all
  on conflict do nothing;

  update public.training_weeks set closed_at = now(), closed_by = p_actor, status = 'PUBLICADO' where id = w.id;
  perform app.auditar('SEMANA_CERRADA', 'training_week', w.id::text, jsonb_build_object('resultados', n, 'automatico', p_actor is null), p_actor);
  return jsonb_build_object('cerrada', true, 'ya_estaba', false, 'resultados', n);
end $$;

create or replace function public.fn_cerrar_semana(p_semana uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  perform app.exigir('semana.cerrar');
  return app.cerrar_semana(p_semana, v_actor.id);
end $$;

/** Para el proceso programado (iteración 8): cierra todas las semanas vencidas. */
create or replace function app.cerrar_semanas_vencidas()
returns int language plpgsql security definer set search_path = '' as $$
declare w record; n int := 0;
begin
  for w in select id from public.training_weeks
            where closed_at is null and status in ('PROGRAMADO', 'PUBLICADO') and publish_at <= now() and week_end < app.hoy_cr() loop
    perform app.cerrar_semana(w.id, null);
    n := n + 1;
  end loop;
  return n;
end $$;

/* ===================== Sorteo ===================== */
/** Entero uniforme en [0, n) con bytes criptográficos de PostgreSQL y rechazo (sin sesgo de módulo).
    Devuelve el índice y TODOS los bytes usados (evidencia para recalcular). */
create or replace function app.indice_aleatorio(p_n int, out indice int, out bytes bytea)
language plpgsql volatile set search_path = '' as $$
declare v_lim bigint; v_r bigint; v_chunk bytea;
begin
  if p_n is null or p_n < 1 then raise exception 'n inválido'; end if;
  v_lim := (4294967296 / p_n) * p_n;
  bytes := ''::bytea;
  loop
    v_chunk := extensions.gen_random_bytes(4);
    bytes := bytes || v_chunk;
    v_r := (get_byte(v_chunk, 0)::bigint << 24) | (get_byte(v_chunk, 1)::bigint << 16) | (get_byte(v_chunk, 2)::bigint << 8) | get_byte(v_chunk, 3)::bigint;
    exit when v_r < v_lim;
  end loop;
  indice := (v_r % p_n)::int;
end $$;

/** Ejecuta el sorteo oficial de una semana. Si la semana ya terminó y no está cerrada, la cierra primero.
    Idempotente: si ya hay un sorteo vigente (OFICIAL o DESIERTO), lo devuelve sin sortear de nuevo. */
create or replace function public.fn_ejecutar_sorteo(p_semana uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  w public.training_weeks; d public.weekly_draws;
  v_max smallint; v_ids uuid[]; v_n int := 0; v_idx int; v_bytes bytea; v_anterior uuid;
begin
  perform app.exigir('sorteo.ejecutar');
  select * into w from public.training_weeks where id = p_semana for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;

  select * into d from public.weekly_draws where week_id = w.id and status in ('OFICIAL', 'DESIERTO');
  if found then return jsonb_build_object('id', d.id, 'ya_existia', true); end if;

  if w.closed_at is null then perform app.cerrar_semana(w.id, v_actor.id); end if;

  select max(r.score) into v_max from public.weekly_results r where r.week_id = w.id and r.eligible;
  select id into v_anterior from public.weekly_draws where week_id = w.id and status = 'ANULADO' order by annulled_at desc limit 1;

  if v_max is null then
    insert into public.weekly_draws (week_id, status, eligible_count, algorithm_version, executed_by, replaces_draw_id)
    values (w.id, 'DESIERTO', 0, 'v1-rejection-u32', v_actor.id, v_anterior) returning * into d;
  else
    select array_agg(r.user_id order by r.user_id) into v_ids
      from public.weekly_results r where r.week_id = w.id and r.eligible and r.score = v_max;
    v_n := array_length(v_ids, 1);
    select x.indice, x.bytes into v_idx, v_bytes from app.indice_aleatorio(v_n) x;
    insert into public.weekly_draws (week_id, status, max_score, eligible_count, winner_user_id, random_bytes, eligible_list_sha256,
                                     algorithm_version, executed_by, replaces_draw_id)
    values (w.id, 'OFICIAL', v_max, v_n, v_ids[v_idx + 1], v_bytes,
            encode(extensions.digest(array_to_string(v_ids, E'\n') || E'\n' || v_max::text, 'sha256'), 'hex'),
            'v1-rejection-u32', v_actor.id, v_anterior)
    returning * into d;
    insert into public.draw_entries (draw_id, user_id, score, position)
    select d.id, t.u, v_max, (t.ord - 1)::int from unnest(v_ids) with ordinality as t(u, ord);
    insert into public.recognitions (user_id, week_id, type, is_public) values (d.winner_user_id, w.id, 'GANADOR_SORTEO', false)
    on conflict do nothing;
  end if;

  perform app.auditar('SORTEO_EJECUTADO', 'weekly_draw', d.id::text,
                      jsonb_build_object('semana', w.id, 'estado', d.status, 'maximo', v_max, 'n', v_n, 'reemplaza', v_anterior));
  return jsonb_build_object('id', d.id, 'ya_existia', false);
end $$;

/** Anulación auditada (solo administrador principal). Permite un nuevo sorteo que queda enlazado al anulado. */
create or replace function public.fn_anular_sorteo(p_sorteo uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); d public.weekly_draws;
begin
  perform app.exigir('sorteo.anular');
  perform app.validar(char_length(trim(coalesce(p_motivo, ''))) >= 10, 'Explique el motivo de la anulación (mínimo 10 caracteres).');
  select * into d from public.weekly_draws where id = p_sorteo for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Sorteo no encontrado.'); end if;
  perform app.validar(d.status in ('OFICIAL', 'DESIERTO'), 'Ese sorteo ya está anulado.');
  update public.weekly_draws set status = 'ANULADO', annulled_by = v_actor.id, annulled_at = now(), annul_reason = trim(p_motivo) where id = d.id;
  perform app.auditar('SORTEO_ANULADO', 'weekly_draw', d.id::text, jsonb_build_object('semana', d.week_id, 'motivo', trim(p_motivo), 'ganador_anterior', d.winner_user_id));
  return jsonb_build_object('estado', 'ANULADO');
end $$;

/** Datos del panel para una semana: participación, máximo, empatados, sorteo vigente y anulados. */
create or replace function public.fn_admin_sorteo(p_semana uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.training_weeks; d public.weekly_draws; v_max smallint; v_base int;
begin
  perform app.exigir('sorteo.ejecutar');   -- incluye nombres de los empatados: no se abre a supervisores
  select * into w from public.training_weeks where id = p_semana;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  select * into d from public.weekly_draws where week_id = w.id and status in ('OFICIAL', 'DESIERTO');

  if w.closed_at is not null then
    select max(score) into v_max from public.weekly_results where week_id = w.id and eligible;
    select count(*) into v_base from public.weekly_results where week_id = w.id;
  end if;

  return jsonb_build_object(
    'semana', jsonb_build_object('id', w.id, 'titulo', w.title, 'week_start', w.week_start, 'week_end', w.week_end,
                                 'cerrada', w.closed_at is not null, 'cerrada_el', w.closed_at,
                                 'puede_cerrar', w.closed_at is null and w.week_end < app.hoy_cr() and w.status in ('PROGRAMADO', 'PUBLICADO') and w.publish_at <= now()),
    'base', v_base,
    'participaron', (select count(*) from public.weekly_results where week_id = w.id and capsules_completed > 0),
    'completaron', (select count(*) from public.weekly_results where week_id = w.id and completed_all),
    'excluidos', (select count(*) from public.weekly_results where week_id = w.id and completed_all and not eligible),
    'maximo', v_max,
    'elegibles', coalesce((select jsonb_agg(jsonb_build_object('id', r.user_id, 'codigo', p.employee_code, 'nombre', p.full_name, 'puntos', r.score) order by r.user_id)
                           from public.weekly_results r join public.profiles p on p.id = r.user_id
                          where r.week_id = w.id and r.eligible and r.score = v_max), '[]'::jsonb),
    'sorteo', case when d.id is null then null else jsonb_build_object(
        'id', d.id, 'estado', d.status, 'maximo', d.max_score, 'n', d.eligible_count, 'fecha', d.executed_at,
        'ejecutadoPor', (select full_name from public.profiles where id = d.executed_by),
        'ganador', (select jsonb_build_object('codigo', employee_code, 'nombre', full_name) from public.profiles where id = d.winner_user_id),
        'bytes', encode(d.random_bytes, 'hex'), 'hash', d.eligible_list_sha256, 'algoritmo', d.algorithm_version,
        'reemplaza', d.replaces_draw_id) end,
    'anulados', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'fecha', x.executed_at, 'anulado', x.annulled_at, 'motivo', x.annul_reason,
                                                              'ganador', (select full_name from public.profiles where id = x.winner_user_id),
                                                              'anuladoPor', (select full_name from public.profiles where id = x.annulled_by)) order by x.annulled_at)
                          from public.weekly_draws x where x.week_id = w.id and x.status = 'ANULADO'), '[]'::jsonb));
end $$;

/* ===================== Colaborador ===================== */
/** Reconocimientos: los propios (todos) y los ganadores que autorizaron mostrar su nombre (últimas 8 semanas). */
create or replace function public.fn_reconocimientos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  perform app.exigir('contenido.ver_publicado');
  return jsonb_build_object(
    'propios', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'tipo', r.type, 'publico', r.is_public, 'semana', extract(week from w.week_start)::int, 'tema', w.title) order by w.week_start desc)
                         from public.recognitions r join public.training_weeks w on w.id = r.week_id
                        where r.user_id = v_actor.id
                          and (r.type <> 'GANADOR_SORTEO' or exists (select 1 from public.weekly_draws d where d.week_id = r.week_id and d.status = 'OFICIAL' and d.winner_user_id = r.user_id))), '[]'::jsonb),
    'ganadores', coalesce((select jsonb_agg(jsonb_build_object('semana', extract(week from w.week_start)::int, 'nombre',
                                      split_part(p.full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(p.full_name, ' ', 2), ''), 1) || '.', '')) order by w.week_start desc)
                           from public.recognitions r join public.training_weeks w on w.id = r.week_id join public.profiles p on p.id = r.user_id
                          where r.type = 'GANADOR_SORTEO' and r.is_public and w.week_start >= app.hoy_cr() - 56
                            and exists (select 1 from public.weekly_draws d where d.week_id = r.week_id and d.status = 'OFICIAL' and d.winner_user_id = r.user_id)), '[]'::jsonb));
end $$;

/** El ganador decide si su nombre se muestra (D-08). */
create or replace function public.fn_reconocimiento_publico(p_id uuid, p_publico boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  update public.recognitions set is_public = coalesce(p_publico, false) where id = p_id and user_id = v_actor.id;
  if not found then perform app.error('NO_ENCONTRADO', 'Reconocimiento no encontrado.'); end if;
  perform app.auditar('RECONOCIMIENTO_CONSENTIMIENTO', 'recognition', p_id::text, jsonb_build_object('publico', coalesce(p_publico, false)));
end $$;

/** Historial propio (reemplaza la versión de 05): agrega si participó en el sorteo y la insignia de semana perfecta. */
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
      'puntos', (select coalesce(sum(a.score), 0) from public.capsule_attempts a where a.week_id = w.id and a.user_id = v_actor.id and a.attempt_type = 'OFICIAL'),
      'participo', (select r.eligible from public.weekly_results r where r.week_id = w.id and r.user_id = v_actor.id),
      'insignia', case when exists (select 1 from public.recognitions x where x.week_id = w.id and x.user_id = v_actor.id and x.type = 'SEMANA_PERFECTA') then 'Semana perfecta' end)
      order by w.week_start desc)
    from public.training_weeks w
    where w.status in ('PROGRAMADO', 'PUBLICADO') and w.publish_at <= now() and w.week_start <= app.hoy_cr()), '[]'::jsonb));
end $$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
grant execute on function app.permiso_de(uuid, text), app.tiene_permiso(text) to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_cerrar_semana(uuid), public.fn_ejecutar_sorteo(uuid), public.fn_anular_sorteo(uuid, text),
                          public.fn_admin_sorteo(uuid), public.fn_reconocimientos(), public.fn_reconocimiento_publico(uuid, boolean),
                          public.fn_mi_historial() to authenticated;

insert into app.schema_migrations (version, description) values ('06', 'Cierre de semana, sorteo criptográfico idempotente, anulación auditada, reconocimientos')
on conflict (version) do nothing;

commit;
