-- =============================================================================
-- TRANSPORTES 360 · 07_alertas_consejos.sql  (Fase 3 · iteración 4)
-- Crea: alerts (copia de trabajo), alert_publications (cada versión aprobada, inmutable), alert_acknowledgements
--       (vista ≠ confirmada, por versión), tips (consejos breves) y sus RPC.
-- Modifica: approval_history.entity_type admite además 'alert' y 'tip' (solo amplía la lista).
-- Reversión: sql/reversion/07_alertas_consejos.down.sql
-- Reglas (MAPA_FUNCIONAL §4, §6, §10, §12):
--   * Fuente obligatoria y verificada por quien aprueba. Vencimiento obligatorio en alertas.
--   * CRITICA (la nueva versión o la que está publicada): solo quien tiene alerta.aprobar_critica.
--   * Cuatro ojos: quien editó la versión no la aprueba, salvo que sea la única persona que puede (queda marcado).
--   * Editar una alerta publicada crea otra versión; la aprobada SIGUE visible hasta aprobar la nueva.
--   * Una versión nueva exige confirmar de nuevo. Nada de esto suma puntos.
-- =============================================================================
begin;

alter table public.approval_history drop constraint approval_history_entity_type_check;
alter table public.approval_history add constraint approval_history_entity_type_check
  check (entity_type in ('training_week', 'alert', 'tip'));

/* ===================== Tablas ===================== */
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.knowledge_categories (id),
  priority        text not null check (priority in ('INFORMATIVA', 'PREVENTIVA', 'ALTA', 'CRITICA')),
  title           text not null check (char_length(trim(title)) between 5 and 140),
  description     text not null default '' check (char_length(description) <= 2000),
  risk            text not null default '' check (char_length(risk) <= 1000),
  recommendations jsonb not null default '[]'::jsonb check (jsonb_typeof(recommendations) = 'array'),
  source          text not null default '' check (char_length(source) <= 300),
  source_url      text check (source_url ~ '^https://[^\s<>"]+$' and char_length(source_url) <= 500),
  area_ids        text[] check (area_ids is null or cardinality(area_ids) > 0),   -- null = todas las áreas
  publish_at      timestamptz,                                                    -- null = al aprobar
  expires_at      timestamptz,
  status          text not null default 'BORRADOR'
                  check (status in ('BORRADOR', 'PENDIENTE_REVISION', 'REQUIERE_CORRECCION', 'PUBLICADO', 'ARCHIVADO')),
  version         int not null default 1,
  editors         uuid[] not null default '{}',                                   -- quienes editaron ESTA versión
  created_by      uuid not null references public.profiles (id),
  updated_by      uuid not null references public.profiles (id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint alerta_vencimiento check (expires_at is null or publish_at is null or expires_at > publish_at)
);
create index alerts_category_idx on public.alerts (category_id);
create index alerts_created_by_idx on public.alerts (created_by);
create index alerts_updated_by_idx on public.alerts (updated_by);
create trigger alerts_updated_at before update on public.alerts for each row execute function app.tg_updated_at();

create table public.alert_publications (
  alert_id        uuid not null references public.alerts (id),
  version         int not null,
  category_id     uuid not null references public.knowledge_categories (id),
  priority        text not null,
  title           text not null,
  description     text not null,
  risk            text not null,
  recommendations jsonb not null,
  source          text not null,
  source_url      text,
  area_ids        text[],
  publish_at      timestamptz not null,
  expires_at      timestamptz not null check (expires_at > publish_at),
  approved_by     uuid not null references public.profiles (id),
  approved_at     timestamptz not null default now(),
  sole_approver   boolean not null default false,
  primary key (alert_id, version)
);
create index alert_publications_vigencia_idx on public.alert_publications (publish_at, expires_at);
create index alert_publications_category_idx on public.alert_publications (category_id);
create index alert_publications_approved_by_idx on public.alert_publications (approved_by);
create trigger alert_publications_inmutable before update or delete on public.alert_publications for each row execute function app.tg_inmutable();

create table public.alert_acknowledgements (
  alert_id        uuid not null,
  version         int not null,
  user_id         uuid not null references public.profiles (id),
  viewed_at       timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (alert_id, version, user_id),
  foreign key (alert_id, version) references public.alert_publications (alert_id, version)
);
create index alert_acknowledgements_user_idx on public.alert_acknowledgements (user_id);

/** La evidencia solo avanza: vista → confirmada, una vez. No se borra ni se reescribe. */
create or replace function app.tg_confirmacion_protegida()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.acknowledged_at is null and new.acknowledged_at is not null
     and (new.alert_id, new.version, new.user_id, new.viewed_at) is not distinct from (old.alert_id, old.version, old.user_id, old.viewed_at) then
    return new;
  end if;
  raise exception using errcode = '42501', message = 'La evidencia de lectura no se modifica.', hint = 'INMUTABLE';
end $$;
create trigger alert_acknowledgements_protegida before update or delete on public.alert_acknowledgements for each row execute function app.tg_confirmacion_protegida();

create table public.tips (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.knowledge_categories (id),
  title       text not null check (char_length(trim(title)) between 3 and 100),
  body        text not null default '' check (char_length(body) <= 600),
  share_text  text not null default '' check (char_length(share_text) <= 300),
  source      text not null default '' check (char_length(source) <= 300),
  publish_at  timestamptz,
  expires_at  timestamptz,
  status      text not null default 'BORRADOR'
              check (status in ('BORRADOR', 'PENDIENTE_REVISION', 'REQUIERE_CORRECCION', 'PUBLICADO', 'ARCHIVADO')),
  version     int not null default 1,
  editors     uuid[] not null default '{}',
  created_by  uuid not null references public.profiles (id),
  updated_by  uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint consejo_vencimiento check (expires_at is null or publish_at is null or expires_at > publish_at)
);
create index tips_category_idx on public.tips (category_id);
create index tips_created_by_idx on public.tips (created_by);
create index tips_updated_by_idx on public.tips (updated_by);
create index tips_approved_by_idx on public.tips (approved_by);
create trigger tips_updated_at before update on public.tips for each row execute function app.tg_updated_at();

alter table public.alerts enable row level security;
alter table public.alert_publications enable row level security;
alter table public.alert_acknowledgements enable row level security;
alter table public.tips enable row level security;
revoke all on public.alerts, public.alert_publications, public.alert_acknowledgements, public.tips from public, anon, authenticated;

/* ===================== Utilidades ===================== */
create or replace function app.registrar_editorial(p_tipo text, p_id uuid, p_version int, p_desde text, p_hasta text, p_comentario text, p_detalle jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.approval_history (entity_type, entity_id, version, from_status, to_status, comment, actor_id, details)
  values (p_tipo, p_id, p_version, p_desde, p_hasta, nullif(trim(p_comentario), ''), auth.uid(), coalesce(p_detalle, '{}'::jsonb))
$$;

create or replace function app.historial_editorial(p_tipo text, p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('fecha', x.ts, 'de', x.from_status, 'a', x.to_status, 'version', x.version,
                                               'comentario', x.comment, 'actor', p.full_name) order by x.id), '[]'::jsonb)
    from public.approval_history x join public.profiles p on p.id = x.actor_id
   where x.entity_type = p_tipo and x.entity_id = p_id
$$;

/** Cuatro ojos. Devuelve true si se aplica la excepción de única persona que puede aprobar. */
create or replace function app.cuatro_ojos(p_editores uuid[], p_permiso text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_otros int;
begin
  if not (auth.uid() = any (p_editores)) then return false; end if;
  select count(*) into v_otros from public.profiles p where p.id <> auth.uid() and app.permiso_de(p.id, p_permiso);
  if v_otros > 0 then perform app.error('VALIDACION', 'Usted editó esta versión: debe aprobarla otra persona (regla de cuatro ojos).'); end if;
  return true;
end $$;

create or replace function app.exigir_editorial()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.actor();
  if not (app.tiene_permiso('contenido.crear_editar') or app.tiene_permiso('contenido.aprobar')) then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
end $$;

create or replace function app.en_audiencia(p_areas text[], p_area text)
returns boolean language sql immutable set search_path = '' as $$
  select p_areas is null or coalesce(p_area = any (p_areas), false)
$$;

/** Versión que rige hoy de cada alerta: la última ya publicada, si no venció ni se archivó. */
create or replace function app.alertas_vigentes()
returns setof public.alert_publications language sql stable security definer set search_path = '' as $$
  select p.* from public.alert_publications p
    join public.alerts a on a.id = p.alert_id and a.status <> 'ARCHIVADO'
   where p.publish_at <= now() and p.expires_at > now()
     and not exists (select 1 from public.alert_publications q where q.alert_id = p.alert_id and q.version > p.version and q.publish_at <= now())
$$;

/** Audiencia, vistas y confirmaciones de una versión (solo personas activas que hoy pertenecen a la audiencia). */
create or replace function app.alerta_seguimiento(p_alerta uuid, p_version int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('audiencia', count(*), 'vistas', count(k.viewed_at), 'confirmadas', count(k.acknowledged_at))
    from public.alert_publications pub
    join public.profiles p on p.is_active and app.en_audiencia(pub.area_ids, p.area_id) and app.permiso_de(p.id, 'alerta.confirmar_lectura')
    left join public.alert_acknowledgements k on k.alert_id = pub.alert_id and k.version = pub.version and k.user_id = p.id
   where pub.alert_id = p_alerta and pub.version = p_version
$$;

create or replace function app.validar_alerta_completa(a public.alerts)
returns void language plpgsql stable set search_path = '' as $$
begin
  perform app.validar(char_length(trim(a.description)) >= 10, 'Escriba la descripción de la alerta.');
  perform app.validar(char_length(trim(a.risk)) >= 5, 'Escriba el riesgo identificado.');
  perform app.validar(jsonb_array_length(a.recommendations) between 1 and 8, 'Agregue entre 1 y 8 recomendaciones.');
  perform app.validar(char_length(trim(a.source)) >= 3, 'Indique la fuente: sin fuente no hay alerta.');
  perform app.validar(a.expires_at is not null, 'Indique hasta cuándo está vigente.');
  perform app.validar(a.expires_at > greatest(coalesce(a.publish_at, now()), now()), 'El vencimiento debe ser posterior a la publicación y a hoy.');
end $$;

/* ===================== Panel: alertas ===================== */
create or replace function public.fn_admin_alertas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'titulo', a.title, 'prioridad', a.priority, 'categoria', k.name, 'estado', a.status, 'version', a.version,
      'editor', e.full_name, 'editado', a.updated_at,
      'publica', u.publish_at, 'vence', u.expires_at, 'version_publicada', u.version,
      'vigente', v.alert_id is not null, 'version_vigente', v.version,
      'seguimiento', case when v.alert_id is not null then app.alerta_seguimiento(v.alert_id, v.version) end) order by a.updated_at desc)
    from public.alerts a
    join public.knowledge_categories k on k.id = a.category_id
    join public.profiles e on e.id = a.updated_by
    left join lateral (select * from public.alert_publications p where p.alert_id = a.id order by p.version desc limit 1) u on true
    left join app.alertas_vigentes() v on v.alert_id = a.id), '[]'::jsonb);
end $$;

create or replace function public.fn_admin_alerta(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.alerts; v public.alert_publications;
begin
  perform app.exigir_editorial();
  select * into a from public.alerts where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
  select * into v from app.alertas_vigentes() x where x.alert_id = a.id;
  return jsonb_build_object(
    'id', a.id, 'category_id', a.category_id, 'prioridad', a.priority, 'titulo', a.title, 'descripcion', a.description, 'riesgo', a.risk,
    'recomendaciones', a.recommendations, 'fuente', a.source, 'fuente_url', a.source_url, 'areas', to_jsonb(a.area_ids),
    'publica', a.publish_at, 'vence', a.expires_at, 'estado', a.status, 'version', a.version, 'editado', a.updated_at,
    'aprobada', a.approved_at is not null,
    'editor', (select full_name from public.profiles where id = a.updated_by),
    'vigente', case when v.alert_id is null then null else jsonb_build_object(
        'version', v.version, 'prioridad', v.priority, 'titulo', v.title, 'publica', v.publish_at, 'vence', v.expires_at,
        'seguimiento', app.alerta_seguimiento(v.alert_id, v.version),
        'pendientes', coalesce((select jsonb_agg(jsonb_build_object('codigo', p.employee_code, 'nombre', p.full_name, 'area', ar.name, 'vista', k.viewed_at is not null) order by p.full_name)
           from public.profiles p
           left join public.areas ar on ar.id = p.area_id
           left join public.alert_acknowledgements k on k.alert_id = v.alert_id and k.version = v.version and k.user_id = p.id
          where p.is_active and app.en_audiencia(v.area_ids, p.area_id) and app.permiso_de(p.id, 'alerta.confirmar_lectura') and k.acknowledged_at is null), '[]'::jsonb)) end,
    'historial', app.historial_editorial('alert', a.id));
end $$;

/** Guarda la copia de trabajo (borrador incompleto permitido). Lo aprobado pasa a una versión nueva; lo enviado vuelve a borrador. */
create or replace function public.fn_admin_alerta_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  a public.alerts; v_antes text; v_areas text[]; v_rec jsonb;
begin
  perform app.exigir('contenido.crear_editar');
  perform app.validar(jsonb_typeof(coalesce(p -> 'recomendaciones', '[]'::jsonb)) = 'array'
                      and jsonb_typeof(coalesce(nullif(p -> 'areas', 'null'::jsonb), '[]'::jsonb)) = 'array', 'Formato no válido.');
  select coalesce(jsonb_agg(trim(t.x) order by t.o), '[]'::jsonb) into v_rec
    from jsonb_array_elements_text(coalesce(p -> 'recomendaciones', '[]'::jsonb)) with ordinality t(x, o) where trim(t.x) <> '';
  perform app.validar(jsonb_array_length(v_rec) <= 8 and not exists (select 1 from jsonb_array_elements_text(v_rec) x where char_length(x) not between 3 and 300),
                      'Máximo 8 recomendaciones, de 3 a 300 caracteres cada una.');
  select array_agg(distinct x) into v_areas from jsonb_array_elements_text(coalesce(nullif(p -> 'areas', 'null'::jsonb), '[]'::jsonb)) x;
  perform app.validar(v_areas is null or (select count(*) from public.areas where id = any (v_areas) and is_active) = cardinality(v_areas),
                      'Hay un área que no existe o está inactiva.');

  if nullif(p ->> 'id', '') is null then
    insert into public.alerts (category_id, priority, title, created_by, updated_by, editors)
    values ((p ->> 'category_id')::uuid, p ->> 'prioridad', trim(p ->> 'titulo'), v_actor.id, v_actor.id, array[v_actor.id]) returning * into a;
    perform app.registrar_editorial('alert', a.id, a.version, null, 'BORRADOR', null);
  else
    select * into a from public.alerts where id = (p ->> 'id')::uuid for update;
    if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
    perform app.validar(a.status <> 'ARCHIVADO', 'Una alerta archivada no se edita.');
  end if;
  v_antes := a.status;

  update public.alerts set
    category_id = (p ->> 'category_id')::uuid, priority = p ->> 'prioridad', title = trim(p ->> 'titulo'),
    description = trim(coalesce(p ->> 'descripcion', '')), risk = trim(coalesce(p ->> 'riesgo', '')), recommendations = v_rec,
    source = trim(coalesce(p ->> 'fuente', '')), source_url = nullif(trim(coalesce(p ->> 'fuente_url', '')), ''),
    area_ids = v_areas, publish_at = nullif(p ->> 'publica', '')::timestamptz, expires_at = nullif(p ->> 'vence', '')::timestamptz,
    version = case when v_antes = 'PUBLICADO' then version + 1 else version end,
    editors = case when v_antes = 'PUBLICADO' then array[v_actor.id] when v_actor.id = any (editors) then editors else editors || v_actor.id end,
    status = case when v_antes in ('PUBLICADO', 'PENDIENTE_REVISION') then 'BORRADOR' else v_antes end,
    updated_by = v_actor.id
  where id = a.id returning * into a;
  if v_antes <> a.status then
    perform app.registrar_editorial('alert', a.id, a.version, v_antes, a.status, case when v_antes = 'PUBLICADO' then 'Nueva versión' else 'Editada durante la revisión' end);
  end if;
  perform app.auditar('ALERTA_GUARDADA', 'alert', a.id::text, jsonb_build_object('version', a.version, 'prioridad', a.priority));
  return a.id;
end $$;

create or replace function public.fn_admin_alerta_enviar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.alerts; v_antes text;
begin
  perform app.exigir('contenido.crear_editar');
  select * into a from public.alerts where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
  perform app.validar(a.status in ('BORRADOR', 'REQUIERE_CORRECCION'), 'Solo un borrador o una alerta devuelta se envía a revisión.');
  perform app.validar_alerta_completa(a);
  v_antes := a.status;
  update public.alerts set status = 'PENDIENTE_REVISION' where id = a.id returning * into a;
  perform app.registrar_editorial('alert', a.id, a.version, v_antes, a.status, null);
  return jsonb_build_object('estado', a.status);
end $$;

create or replace function public.fn_admin_alerta_devolver(p_id uuid, p_comentario text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.alerts;
begin
  perform app.exigir('contenido.aprobar');
  perform app.validar(char_length(trim(coalesce(p_comentario, ''))) >= 5, 'Explique qué se debe corregir.');
  select * into a from public.alerts where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
  perform app.validar(a.status = 'PENDIENTE_REVISION', 'Solo se devuelve una alerta pendiente de revisión.');
  update public.alerts set status = 'REQUIERE_CORRECCION' where id = a.id returning * into a;
  perform app.registrar_editorial('alert', a.id, a.version, 'PENDIENTE_REVISION', a.status, p_comentario);
  return jsonb_build_object('estado', a.status);
end $$;

/** Aprueba y publica. p_editado = marca de la versión que el revisor leyó (si cambió entretanto, se rechaza). */
create or replace function public.fn_admin_alerta_aprobar(p_id uuid, p_editado timestamptz, p_fuente_verificada boolean, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); a public.alerts; v_critica boolean; v_unico boolean; v_publica timestamptz;
begin
  perform app.exigir('contenido.aprobar');
  select * into a from public.alerts where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
  perform app.validar(a.status = 'PENDIENTE_REVISION', 'Solo se aprueba una alerta pendiente de revisión.');
  perform app.validar(a.updated_at = p_editado, 'La alerta cambió mientras la revisaba. Vuelva a abrirla y léala de nuevo.');
  perform app.validar(p_fuente_verificada, 'Confirme que verificó la fuente antes de aprobar.');
  perform app.validar_alerta_completa(a);
  -- También si reemplaza una crítica vigente: bajar la prioridad no evita la aprobación del administrador principal
  v_critica := a.priority = 'CRITICA' or exists (select 1 from app.alertas_vigentes() x where x.alert_id = a.id and x.priority = 'CRITICA');
  if v_critica then perform app.exigir('alerta.aprobar_critica'); end if;
  v_unico := app.cuatro_ojos(a.editors, case when v_critica then 'alerta.aprobar_critica' else 'contenido.aprobar' end);
  v_publica := greatest(coalesce(a.publish_at, now()), now());
  insert into public.alert_publications (alert_id, version, category_id, priority, title, description, risk, recommendations, source, source_url,
                                         area_ids, publish_at, expires_at, approved_by, sole_approver)
  values (a.id, a.version, a.category_id, a.priority, a.title, a.description, a.risk, a.recommendations, a.source, a.source_url,
          a.area_ids, v_publica, a.expires_at, v_actor.id, v_unico);
  update public.alerts set status = 'PUBLICADO', approved_at = now() where id = a.id returning * into a;
  perform app.registrar_editorial('alert', a.id, a.version, 'PENDIENTE_REVISION', a.status, p_comentario, jsonb_build_object('aprobador_unico', v_unico, 'fuente_verificada', true));
  perform app.auditar('ALERTA_APROBADA', 'alert', a.id::text, jsonb_build_object('version', a.version, 'prioridad', a.priority, 'publica', v_publica, 'aprobador_unico', v_unico));
  return jsonb_build_object('estado', a.status, 'publica', v_publica, 'aprobador_unico', v_unico);
end $$;

create or replace function public.fn_admin_alerta_archivar(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.alerts; v_antes text;
begin
  perform app.exigir('contenido.aprobar');
  perform app.validar(char_length(trim(coalesce(p_motivo, ''))) >= 5, 'Explique por qué se retira la alerta.');
  select * into a from public.alerts where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
  perform app.validar(a.status <> 'ARCHIVADO', 'La alerta ya está archivada.');
  if exists (select 1 from app.alertas_vigentes() x where x.alert_id = a.id and x.priority = 'CRITICA') then perform app.exigir('alerta.aprobar_critica'); end if;
  v_antes := a.status;
  update public.alerts set status = 'ARCHIVADO' where id = a.id returning * into a;
  perform app.registrar_editorial('alert', a.id, a.version, v_antes, a.status, p_motivo);
  perform app.auditar('ALERTA_ARCHIVADA', 'alert', a.id::text, jsonb_build_object('motivo', trim(p_motivo)));
  return jsonb_build_object('estado', a.status);
end $$;

create or replace function public.fn_admin_alerta_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.alerts;
begin
  perform app.exigir('contenido.crear_editar');
  select * into a from public.alerts where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Alerta no encontrada.'); end if;
  perform app.validar(a.status in ('BORRADOR', 'REQUIERE_CORRECCION') and a.approved_at is null, 'Solo se elimina un borrador que nunca fue aprobado; archive las demás.');
  delete from public.alerts where id = a.id;
  perform app.auditar('ALERTA_ELIMINADA', 'alert', a.id::text, jsonb_build_object('titulo', a.title));
end $$;

/* ===================== Panel: consejos ===================== */
create or replace function public.fn_admin_consejos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.title, 'categoria', k.name, 'estado', t.status, 'version', t.version,
      'publica', t.publish_at, 'vence', t.expires_at, 'editor', e.full_name, 'editado', t.updated_at) order by t.updated_at desc)
    from public.tips t join public.knowledge_categories k on k.id = t.category_id join public.profiles e on e.id = t.updated_by), '[]'::jsonb);
end $$;

create or replace function public.fn_admin_consejo(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.tips;
begin
  perform app.exigir_editorial();
  select * into t from public.tips where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
  return jsonb_build_object('id', t.id, 'category_id', t.category_id, 'titulo', t.title, 'texto', t.body, 'compartir', t.share_text, 'fuente', t.source,
    'publica', t.publish_at, 'vence', t.expires_at, 'estado', t.status, 'version', t.version, 'editado', t.updated_at, 'aprobada', t.approved_at is not null,
    'editor', (select full_name from public.profiles where id = t.updated_by), 'historial', app.historial_editorial('tip', t.id));
end $$;

create or replace function public.fn_admin_consejo_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); t public.tips; v_antes text;
begin
  perform app.exigir('contenido.crear_editar');
  if nullif(p ->> 'id', '') is null then
    insert into public.tips (category_id, title, created_by, updated_by, editors)
    values ((p ->> 'category_id')::uuid, trim(p ->> 'titulo'), v_actor.id, v_actor.id, array[v_actor.id]) returning * into t;
    perform app.registrar_editorial('tip', t.id, t.version, null, 'BORRADOR', null);
  else
    select * into t from public.tips where id = (p ->> 'id')::uuid for update;
    if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
    perform app.validar(t.status <> 'ARCHIVADO', 'Un consejo archivado no se edita.');
  end if;
  v_antes := t.status;
  update public.tips set
    category_id = (p ->> 'category_id')::uuid, title = trim(p ->> 'titulo'), body = trim(coalesce(p ->> 'texto', '')),
    share_text = trim(coalesce(p ->> 'compartir', '')), source = trim(coalesce(p ->> 'fuente', '')),
    publish_at = nullif(p ->> 'publica', '')::timestamptz, expires_at = nullif(p ->> 'vence', '')::timestamptz,
    version = case when v_antes = 'PUBLICADO' then version + 1 else version end,
    editors = case when v_antes = 'PUBLICADO' then array[v_actor.id] when v_actor.id = any (editors) then editors else editors || v_actor.id end,
    status = case when v_antes in ('PUBLICADO', 'PENDIENTE_REVISION') then 'BORRADOR' else v_antes end,
    updated_by = v_actor.id
  where id = t.id returning * into t;
  if v_antes <> t.status then
    perform app.registrar_editorial('tip', t.id, t.version, v_antes, t.status, case when v_antes = 'PUBLICADO' then 'Nueva versión' else 'Editado durante la revisión' end);
  end if;
  perform app.auditar('CONSEJO_GUARDADO', 'tip', t.id::text, jsonb_build_object('version', t.version));
  return t.id;
end $$;

create or replace function public.fn_admin_consejo_enviar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tips; v_antes text;
begin
  perform app.exigir('contenido.crear_editar');
  select * into t from public.tips where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
  perform app.validar(t.status in ('BORRADOR', 'REQUIERE_CORRECCION'), 'Solo un borrador o un consejo devuelto se envía a revisión.');
  perform app.validar(char_length(trim(t.body)) >= 10, 'Escriba el consejo (de 10 a 600 caracteres).');
  perform app.validar(char_length(trim(t.source)) >= 3, 'Indique la fuente del consejo.');
  perform app.validar(t.expires_at is null or t.expires_at > now(), 'El vencimiento ya pasó.');
  v_antes := t.status;
  update public.tips set status = 'PENDIENTE_REVISION' where id = t.id returning * into t;
  perform app.registrar_editorial('tip', t.id, t.version, v_antes, t.status, null);
  return jsonb_build_object('estado', t.status);
end $$;

create or replace function public.fn_admin_consejo_devolver(p_id uuid, p_comentario text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tips;
begin
  perform app.exigir('contenido.aprobar');
  perform app.validar(char_length(trim(coalesce(p_comentario, ''))) >= 5, 'Explique qué se debe corregir.');
  select * into t from public.tips where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
  perform app.validar(t.status = 'PENDIENTE_REVISION', 'Solo se devuelve un consejo pendiente de revisión.');
  update public.tips set status = 'REQUIERE_CORRECCION' where id = t.id returning * into t;
  perform app.registrar_editorial('tip', t.id, t.version, 'PENDIENTE_REVISION', t.status, p_comentario);
  return jsonb_build_object('estado', t.status);
end $$;

create or replace function public.fn_admin_consejo_aprobar(p_id uuid, p_editado timestamptz, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); t public.tips; v_unico boolean;
begin
  perform app.exigir('contenido.aprobar');
  select * into t from public.tips where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
  perform app.validar(t.status = 'PENDIENTE_REVISION', 'Solo se aprueba un consejo pendiente de revisión.');
  perform app.validar(t.updated_at = p_editado, 'El consejo cambió mientras lo revisaba. Vuelva a abrirlo y léalo de nuevo.');
  perform app.validar(t.expires_at is null or t.expires_at > greatest(coalesce(t.publish_at, now()), now()), 'El vencimiento ya pasó.');
  v_unico := app.cuatro_ojos(t.editors, 'contenido.aprobar');
  update public.tips set status = 'PUBLICADO', approved_by = v_actor.id, approved_at = now(), publish_at = greatest(coalesce(publish_at, now()), now())
   where id = t.id returning * into t;
  perform app.registrar_editorial('tip', t.id, t.version, 'PENDIENTE_REVISION', t.status, p_comentario, jsonb_build_object('aprobador_unico', v_unico));
  perform app.auditar('CONSEJO_APROBADO', 'tip', t.id::text, jsonb_build_object('version', t.version, 'aprobador_unico', v_unico));
  return jsonb_build_object('estado', t.status, 'publica', t.publish_at, 'aprobador_unico', v_unico);
end $$;

create or replace function public.fn_admin_consejo_archivar(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tips; v_antes text;
begin
  perform app.exigir('contenido.aprobar');
  perform app.validar(char_length(trim(coalesce(p_motivo, ''))) >= 5, 'Explique por qué se retira el consejo.');
  select * into t from public.tips where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
  perform app.validar(t.status <> 'ARCHIVADO', 'El consejo ya está archivado.');
  v_antes := t.status;
  update public.tips set status = 'ARCHIVADO' where id = t.id returning * into t;
  perform app.registrar_editorial('tip', t.id, t.version, v_antes, t.status, p_motivo);
  return jsonb_build_object('estado', t.status);
end $$;

create or replace function public.fn_admin_consejo_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tips;
begin
  perform app.exigir('contenido.crear_editar');
  select * into t from public.tips where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Consejo no encontrado.'); end if;
  perform app.validar(t.status in ('BORRADOR', 'REQUIERE_CORRECCION') and t.approved_at is null, 'Solo se elimina un borrador que nunca fue aprobado; archive los demás.');
  delete from public.tips where id = t.id;
  perform app.auditar('CONSEJO_ELIMINADO', 'tip', t.id::text, jsonb_build_object('titulo', t.title));
end $$;

/* ===================== Colaborador ===================== */
/** Alertas vigentes de su audiencia: primero las que faltan por confirmar, por prioridad y fecha. */
create or replace function public.fn_alertas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  perform app.exigir('contenido.ver_publicado');
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.alert_id, 'version', v.version, 'titulo', v.title, 'prioridad', v.priority, 'categoria', k.name,
      'publica', v.publish_at, 'vence', v.expires_at, 'vista', x.viewed_at is not null, 'confirmada', x.acknowledged_at is not null)
      order by x.acknowledged_at is not null, array_position(array['CRITICA', 'ALTA', 'PREVENTIVA', 'INFORMATIVA'], v.priority), v.publish_at desc)
    from app.alertas_vigentes() v
    join public.knowledge_categories k on k.id = v.category_id
    left join public.alert_acknowledgements x on x.alert_id = v.alert_id and x.version = v.version and x.user_id = v_actor.id
   where app.en_audiencia(v.area_ids, v_actor.area_id)), '[]'::jsonb);
end $$;

/** Detalle. Registra que la persona lo abrió (vista); eso NO es confirmación. */
create or replace function public.fn_alerta(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); v public.alert_publications; x public.alert_acknowledgements;
begin
  perform app.exigir('contenido.ver_publicado');
  select * into v from app.alertas_vigentes() z where z.alert_id = p_id and app.en_audiencia(z.area_ids, v_actor.area_id);
  if not found then perform app.error('NO_ENCONTRADO', 'La alerta ya no está vigente.'); end if;
  insert into public.alert_acknowledgements (alert_id, version, user_id) values (v.alert_id, v.version, v_actor.id) on conflict do nothing;
  select * into x from public.alert_acknowledgements k where k.alert_id = v.alert_id and k.version = v.version and k.user_id = v_actor.id;
  return jsonb_build_object('id', v.alert_id, 'version', v.version, 'titulo', v.title, 'prioridad', v.priority,
    'categoria', (select name from public.knowledge_categories where id = v.category_id),
    'descripcion', v.description, 'riesgo', v.risk, 'recomendaciones', v.recommendations, 'fuente', v.source, 'fuente_url', v.source_url,
    'publica', v.publish_at, 'vence', v.expires_at, 'confirmada', x.acknowledged_at is not null, 'confirmada_el', x.acknowledged_at);
end $$;

/** Confirma la versión que la persona leyó. Idempotente: conserva la primera fecha. */
create or replace function public.fn_confirmar_alerta(p_id uuid, p_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); v public.alert_publications; v_fecha timestamptz;
begin
  perform app.exigir('alerta.confirmar_lectura');
  select * into v from app.alertas_vigentes() z where z.alert_id = p_id and app.en_audiencia(z.area_ids, v_actor.area_id);
  if not found then perform app.error('NO_ENCONTRADO', 'La alerta ya no está vigente.'); end if;
  perform app.validar(v.version = p_version, 'La alerta fue actualizada. Léala de nuevo antes de confirmar.');
  perform app.validar(exists (select 1 from public.alert_acknowledgements k where k.alert_id = v.alert_id and k.version = v.version and k.user_id = v_actor.id),
                      'Abra y lea la alerta antes de confirmar.');
  update public.alert_acknowledgements k set acknowledged_at = now()
   where k.alert_id = v.alert_id and k.version = v.version and k.user_id = v_actor.id and k.acknowledged_at is null;
  select k.acknowledged_at into v_fecha from public.alert_acknowledgements k where k.alert_id = v.alert_id and k.version = v.version and k.user_id = v_actor.id;
  return jsonb_build_object('confirmada', true, 'confirmada_el', v_fecha);
end $$;

/** Consejos vigentes; 'hoy' marca el que se muestra en Inicio (rota cada día, igual para todos). */
create or replace function public.fn_consejos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir('contenido.ver_publicado');
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.title, 'texto', t.body, 'compartir', t.share_text, 'fuente', t.source, 'categoria', t.categoria,
             'hoy', t.pos = mod(app.hoy_cr() - date '2026-01-01', t.total::int)) order by t.publish_at desc)
    from (select c.*, k.name as categoria, row_number() over (order by c.id) - 1 as pos, count(*) over () as total
            from public.tips c join public.knowledge_categories k on k.id = c.category_id
           where c.status = 'PUBLICADO' and c.publish_at <= now() and (c.expires_at is null or c.expires_at > now())) t), '[]'::jsonb);
end $$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_admin_alertas(), public.fn_admin_alerta(uuid), public.fn_admin_alerta_guardar(jsonb), public.fn_admin_alerta_enviar(uuid),
  public.fn_admin_alerta_devolver(uuid, text), public.fn_admin_alerta_aprobar(uuid, timestamptz, boolean, text), public.fn_admin_alerta_archivar(uuid, text),
  public.fn_admin_alerta_eliminar(uuid), public.fn_admin_consejos(), public.fn_admin_consejo(uuid), public.fn_admin_consejo_guardar(jsonb),
  public.fn_admin_consejo_enviar(uuid), public.fn_admin_consejo_devolver(uuid, text), public.fn_admin_consejo_aprobar(uuid, timestamptz, text),
  public.fn_admin_consejo_archivar(uuid, text), public.fn_admin_consejo_eliminar(uuid), public.fn_alertas(), public.fn_alerta(uuid),
  public.fn_confirmar_alerta(uuid, int), public.fn_consejos() to authenticated;

insert into app.schema_migrations (version, description) values ('07', 'ALERTAS 360 (versiones, críticas, vista y confirmación) y consejos breves')
on conflict (version) do nothing;

commit;
