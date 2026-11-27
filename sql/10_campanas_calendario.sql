-- =============================================================================
-- TRANSPORTES 360 · 10_campanas_calendario.sql  (Fase 3 · iteración 7: campañas y calendario editorial)
-- Crea: campaigns, campaign_items, editorial_plan, parámetros "rotacion_categorias" y "repeticion_meses", y sus RPC.
-- Modifica: nada existente (solo agrega filas a app_settings; topic_catalog, que ya existe, se administra por RPC nuevas).
-- Reversión: sql/reversion/10_campanas_calendario.down.sql
-- Reglas (MAPA_FUNCIONAL §11 y §13):
--   * La campaña solo agrupa y da visibilidad: no publica, no suma puntos ni altera el sorteo. Cada elemento sigue su flujo.
--   * Los colaboradores ven una campaña solo si quien aprueba contenido la hizo visible; editar su texto la oculta de nuevo.
--     Dentro de ella ven ÚNICAMENTE los elementos que ya ven por su cuenta (publicados, vigentes y de su área).
--   * Calendario de 8 semanas: categoría y tema planificados, aviso de repetición, rotación configurable y sugerencias
--     sin IA (catálogo de temas no usados y preguntas con más errores). La IA no se usa aquí.
-- =============================================================================
begin;

create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 600),
  category_id uuid references public.knowledge_categories (id),
  starts_on   date not null,
  ends_on     date not null check (ends_on >= starts_on),
  is_visible  boolean not null default false,
  is_archived boolean not null default false,
  visible_by  uuid references public.profiles (id),
  visible_at  timestamptz,
  created_by  uuid not null references public.profiles (id),
  updated_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index campaigns_category_idx on public.campaigns (category_id);
create index campaigns_fechas_idx on public.campaigns (starts_on, ends_on);
create index campaigns_created_by_idx on public.campaigns (created_by);
create index campaigns_updated_by_idx on public.campaigns (updated_by);
create index campaigns_visible_by_idx on public.campaigns (visible_by);
create trigger campaigns_updated_at before update on public.campaigns for each row execute function app.tg_updated_at();

create table public.campaign_items (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  week_id     uuid references public.training_weeks (id) on delete cascade,
  alert_id    uuid references public.alerts (id) on delete cascade,
  tip_id      uuid references public.tips (id) on delete cascade,
  sort_order  int not null default 0,
  created_by  uuid not null references public.profiles (id),
  constraint campana_un_elemento check (num_nonnulls(week_id, alert_id, tip_id) = 1)
);
create unique index campaign_items_unico_idx on public.campaign_items (campaign_id, coalesce(week_id, alert_id, tip_id));
create index campaign_items_week_idx on public.campaign_items (week_id);
create index campaign_items_alert_idx on public.campaign_items (alert_id);
create index campaign_items_tip_idx on public.campaign_items (tip_id);
create index campaign_items_created_by_idx on public.campaign_items (created_by);

create table public.editorial_plan (
  week_start  date primary key check (extract(isodow from week_start) = 1),
  category_id uuid references public.knowledge_categories (id),
  topic       text not null default '' check (char_length(topic) <= 140),
  notes       text not null default '' check (char_length(notes) <= 400),
  updated_by  uuid not null references public.profiles (id),
  updated_at  timestamptz not null default now()
);
create index editorial_plan_category_idx on public.editorial_plan (category_id);
create index editorial_plan_updated_by_idx on public.editorial_plan (updated_by);

insert into public.app_settings (key, value, is_public) values
  ('rotacion_categorias', (select coalesce(jsonb_agg(id order by sort_order), '[]'::jsonb) from public.knowledge_categories where is_active), false),
  ('repeticion_meses', '3', false)
on conflict (key) do nothing;

alter table public.campaigns enable row level security;
alter table public.campaign_items enable row level security;
alter table public.editorial_plan enable row level security;
revoke all on public.campaigns, public.campaign_items, public.editorial_plan from public, anon, authenticated;

/* ===================== Utilidades ===================== */
/** ¿Dos temas se parecen? (comparten la mitad o más de las palabras del primero, en español) */
create or replace function app.temas_parecidos(p_a text, p_b text)
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(a) >= 1 and (select count(*) from unnest(a) x where x = any (b)) * 2 >= cardinality(a)
    from (select tsvector_to_array(to_tsvector('pg_catalog.spanish', coalesce(p_a, ''))) a, tsvector_to_array(to_tsvector('pg_catalog.spanish', coalesce(p_b, ''))) b) s
$$;

/** Elementos de una campaña que un usuario ve hoy por su cuenta (publicados, vigentes y de su área). */
create or replace function app.campana_elementos_visibles(p_campana uuid, p_usuario uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb) from (
    select i.sort_order o, jsonb_build_object('tipo', 'semana', 'id', w.id, 'titulo', w.title) e
      from public.campaign_items i join public.training_weeks w on w.id = i.week_id
     where i.campaign_id = p_campana and app.semana_visible(w) and w.week_start <= app.hoy_cr()
    union all
    select i.sort_order, jsonb_build_object('tipo', 'alerta', 'id', v.alert_id, 'titulo', v.title)
      from public.campaign_items i join app.alertas_vigentes() v on v.alert_id = i.alert_id
     where i.campaign_id = p_campana and app.en_audiencia(v.area_ids, (select area_id from public.profiles where id = p_usuario))
    union all
    select i.sort_order, jsonb_build_object('tipo', 'consejo', 'id', t.id, 'titulo', t.title)
      from public.campaign_items i join public.tips t on t.id = i.tip_id
     where i.campaign_id = p_campana and t.status = 'PUBLICADO' and t.publish_at <= now() and (t.expires_at is null or t.expires_at > now())) x
$$;

/* ===================== Campañas (panel) ===================== */
create or replace function public.fn_campanas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'categoria', k.name, 'desde', c.starts_on, 'hasta', c.ends_on,
      'visible', c.is_visible, 'archivada', c.is_archived,
      'estado', case when c.is_archived then 'ARCHIVADA' when app.hoy_cr() < c.starts_on then 'PLANIFICADA' when app.hoy_cr() > c.ends_on then 'TERMINADA' else 'EN_CURSO' end,
      'elementos', (select count(*) from public.campaign_items i where i.campaign_id = c.id)) order by c.starts_on desc)
    from public.campaigns c left join public.knowledge_categories k on k.id = c.category_id), '[]'::jsonb);
end $$;

create or replace function public.fn_campana(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.campaigns;
begin
  perform app.exigir_editorial();
  select * into c from public.campaigns where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Campaña no encontrada.'); end if;
  return jsonb_build_object('id', c.id, 'nombre', c.name, 'descripcion', c.description, 'category_id', c.category_id, 'desde', c.starts_on, 'hasta', c.ends_on,
    'visible', c.is_visible, 'archivada', c.is_archived, 'visible_por', (select full_name from public.profiles where id = c.visible_by), 'visible_el', c.visible_at,
    'elementos', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'orden', i.sort_order,
        'tipo', case when i.week_id is not null then 'semana' when i.alert_id is not null then 'alerta' else 'consejo' end,
        'ref', coalesce(i.week_id, i.alert_id, i.tip_id), 'titulo', coalesce(w.title, a.title, t.title),
        'estado', coalesce(w.status, a.status, t.status), 'fecha', coalesce(w.week_start::timestamptz, a.publish_at, t.publish_at)) order by i.sort_order, i.id)
      from public.campaign_items i
      left join public.training_weeks w on w.id = i.week_id
      left join public.alerts a on a.id = i.alert_id
      left join public.tips t on t.id = i.tip_id
     where i.campaign_id = c.id), '[]'::jsonb),
    -- Candidatos para agregar: lo no archivado que no esté ya en la campaña
    'candidatos', coalesce((select jsonb_agg(x order by x ->> 'tipo', x ->> 'titulo') from (
        select jsonb_build_object('tipo', 'semana', 'ref', w.id, 'titulo', w.title || ' (semana del ' || to_char(w.week_start, 'DD/MM') || ')', 'estado', w.status) x
          from public.training_weeks w where w.status <> 'ARCHIVADO' and w.week_end >= c.starts_on - 7
           and not exists (select 1 from public.campaign_items i where i.campaign_id = c.id and i.week_id = w.id)
        union all
        select jsonb_build_object('tipo', 'alerta', 'ref', a.id, 'titulo', a.title, 'estado', a.status) from public.alerts a
         where a.status <> 'ARCHIVADO' and not exists (select 1 from public.campaign_items i where i.campaign_id = c.id and i.alert_id = a.id)
        union all
        select jsonb_build_object('tipo', 'consejo', 'ref', t.id, 'titulo', t.title, 'estado', t.status) from public.tips t
         where t.status <> 'ARCHIVADO' and not exists (select 1 from public.campaign_items i where i.campaign_id = c.id and i.tip_id = t.id)) s), '[]'::jsonb));
end $$;

/** Crear o editar. Si cambia el texto o las fechas de una campaña visible, deja de verse hasta que la vuelvan a aprobar. */
create or replace function public.fn_campana_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); c public.campaigns;
begin
  perform app.exigir('campanas.gestionar');
  perform app.validar(nullif(p ->> 'desde', '') is not null and nullif(p ->> 'hasta', '') is not null and (p ->> 'hasta')::date >= (p ->> 'desde')::date, 'Revise las fechas: el fin no puede ser antes del inicio.');
  perform app.validar((p ->> 'hasta')::date - (p ->> 'desde')::date <= 366, 'Una campaña dura como máximo un año.');
  if nullif(p ->> 'id', '') is null then
    insert into public.campaigns (name, starts_on, ends_on, created_by, updated_by) values (trim(p ->> 'nombre'), (p ->> 'desde')::date, (p ->> 'hasta')::date, v_actor.id, v_actor.id) returning * into c;
  else
    select * into c from public.campaigns where id = (p ->> 'id')::uuid for update;
    if not found then perform app.error('NO_ENCONTRADO', 'Campaña no encontrada.'); end if;
    perform app.validar(not c.is_archived, 'Una campaña archivada no se edita.');
  end if;
  update public.campaigns set name = trim(p ->> 'nombre'), description = trim(coalesce(p ->> 'descripcion', '')), category_id = nullif(p ->> 'category_id', '')::uuid,
         starts_on = (p ->> 'desde')::date, ends_on = (p ->> 'hasta')::date, updated_by = v_actor.id,
         is_visible = is_visible and name = trim(p ->> 'nombre') and description = trim(coalesce(p ->> 'descripcion', '')) and starts_on = (p ->> 'desde')::date and ends_on = (p ->> 'hasta')::date
   where id = c.id returning * into c;
  perform app.auditar('CAMPANA_GUARDADA', 'campaign', c.id::text, jsonb_build_object('nombre', c.name, 'visible', c.is_visible));
  return c.id;
end $$;

/** Mostrar u ocultar a los colaboradores (quien aprueba contenido). */
create or replace function public.fn_campana_visible(p_id uuid, p_visible boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.campaigns;
begin
  perform app.exigir('contenido.aprobar');
  select * into c from public.campaigns where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Campaña no encontrada.'); end if;
  perform app.validar(not c.is_archived or not p_visible, 'Una campaña archivada no se muestra.');
  if p_visible then perform app.cuatro_ojos(array[c.updated_by], 'contenido.aprobar'); end if;   -- quien la editó no la publica
  update public.campaigns set is_visible = coalesce(p_visible, false), visible_by = case when p_visible then auth.uid() end, visible_at = case when p_visible then now() end where id = c.id;
  perform app.auditar(case when p_visible then 'CAMPANA_VISIBLE' else 'CAMPANA_OCULTA' end, 'campaign', c.id::text, '{}'::jsonb);
end $$;

create or replace function public.fn_campana_archivar(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('campanas.gestionar');
  update public.campaigns set is_archived = true, is_visible = false where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Campaña no encontrada.'); end if;
  perform app.auditar('CAMPANA_ARCHIVADA', 'campaign', p_id::text, '{}'::jsonb);
end $$;

/** Agrega una semana, alerta o consejo existente. No cambia su estado ni su publicación. */
create or replace function public.fn_campana_agregar(p_id uuid, p_tipo text, p_ref uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.exigir('campanas.gestionar');
  perform app.validar(p_tipo in ('semana', 'alerta', 'consejo'), 'Elemento no válido.');
  perform app.validar(exists (select 1 from public.campaigns where id = p_id and not is_archived), 'La campaña no existe o está archivada.');
  insert into public.campaign_items (campaign_id, week_id, alert_id, tip_id, sort_order, created_by)
  values (p_id, case when p_tipo = 'semana' then p_ref end, case when p_tipo = 'alerta' then p_ref end, case when p_tipo = 'consejo' then p_ref end,
          (select coalesce(max(sort_order), 0) + 1 from public.campaign_items where campaign_id = p_id), auth.uid())
  returning id into v_id;
  perform app.auditar('CAMPANA_ELEMENTO', 'campaign', p_id::text, jsonb_build_object('tipo', p_tipo, 'ref', p_ref));
  return v_id;
exception
  when unique_violation then perform app.error('VALIDACION', 'Ese elemento ya está en la campaña.');
  when foreign_key_violation then perform app.error('NO_ENCONTRADO', 'Ese elemento no existe.');
end $$;

create or replace function public.fn_campana_quitar(p_elemento uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('campanas.gestionar');
  delete from public.campaign_items where id = p_elemento;
  if not found then perform app.error('NO_ENCONTRADO', 'Elemento no encontrado.'); end if;
  perform app.auditar('CAMPANA_ELEMENTO_QUITADO', 'campaign_item', p_elemento::text, '{}'::jsonb);
end $$;

/* ===================== Colaborador ===================== */
/** Campañas visibles en curso, con solo los elementos que esta persona ya puede ver. Sin elementos, no aparece. */
create or replace function public.fn_campanas_activas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor();
begin
  perform app.exigir('contenido.ver_publicado');
  return coalesce((select jsonb_agg(x order by x ->> 'hasta') from (
    select jsonb_build_object('id', c.id, 'nombre', c.name, 'descripcion', c.description, 'hasta', c.ends_on, 'categoria', k.name, 'icono', k.icon,
                              'elementos', app.campana_elementos_visibles(c.id, v_actor.id)) x
      from public.campaigns c left join public.knowledge_categories k on k.id = c.category_id
     where c.is_visible and not c.is_archived and app.hoy_cr() between c.starts_on and c.ends_on) s
   where jsonb_array_length(x -> 'elementos') > 0), '[]'::jsonb);
end $$;

/* ===================== Calendario editorial ===================== */
/** 8 semanas (o las pedidas, hasta 26) desde el lunes indicado: plan, semana real, campañas, rotación sugerida y avisos. */
create or replace function public.fn_calendario(p_desde date default null, p_semanas int default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_lunes date := date_trunc('week', coalesce(p_desde, app.hoy_cr()))::date;
  v_rot jsonb := coalesce((select value from public.app_settings where key = 'rotacion_categorias'), '[]'::jsonb);
  v_meses int := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'repeticion_meses'), 3);
begin
  perform app.exigir_editorial();
  perform app.validar(coalesce(p_semanas, 8) between 1 and 26, 'Entre 1 y 26 semanas.');
  return jsonb_build_object('rotacion', v_rot, 'repeticion_meses', v_meses, 'semanas', (select jsonb_agg(s.j order by s.l) from (
    select l, jsonb_build_object(
      'lunes', l, 'numero', extract(week from l)::int,
      'plan', (select jsonb_build_object('category_id', e.category_id, 'categoria', k.name, 'tema', e.topic, 'notas', e.notes) from public.editorial_plan e left join public.knowledge_categories k on k.id = e.category_id where e.week_start = l),
      'semana', (select jsonb_build_object('id', w.id, 'titulo', w.title, 'estado', w.status, 'categoria', k.name, 'category_id', w.category_id)
                   from public.training_weeks w join public.knowledge_categories k on k.id = w.category_id where w.week_start = l and w.status <> 'ARCHIVADO'),
      'campanas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name)) from public.campaigns c where not c.is_archived and l + 6 >= c.starts_on and l <= c.ends_on), '[]'::jsonb),
      'rotacion', case when jsonb_array_length(v_rot) > 0 then (select jsonb_build_object('category_id', k.id, 'categoria', k.name) from public.knowledge_categories k
                    where k.id = (v_rot ->> (((l - date '2026-01-05') / 7) % jsonb_array_length(v_rot)))::uuid) end,
      'avisos', to_jsonb(array_remove(array[
        -- Misma categoría que la semana anterior (planificada o real)
        case when coalesce((select e.category_id from public.editorial_plan e where e.week_start = l), (select w.category_id from public.training_weeks w where w.week_start = l and w.status <> 'ARCHIVADO'))
                  = coalesce((select w.category_id from public.training_weeks w where w.week_start = l - 7 and w.status <> 'ARCHIVADO'), (select e.category_id from public.editorial_plan e where e.week_start = l - 7))
             then 'Misma categoría que la semana anterior.' end,
        -- Tema parecido a uno impartido o planificado en los últimos N meses
        (select 'Tema parecido a «' || w.title || '» (semana del ' || to_char(w.week_start, 'DD/MM') || ').' from public.training_weeks w
          where w.status <> 'ARCHIVADO' and w.week_start < l and w.week_start >= l - (v_meses * 30)
            and app.temas_parecidos(coalesce(nullif((select e.topic from public.editorial_plan e where e.week_start = l), ''), (select x.title from public.training_weeks x where x.week_start = l and x.status <> 'ARCHIVADO')), w.title)
          order by w.week_start desc limit 1)], null))) j
    from generate_series(v_lunes, v_lunes + (coalesce(p_semanas, 8) - 1) * 7, interval '7 days') g(d), lateral (select g.d::date l) z) s));
end $$;

create or replace function public.fn_calendario_guardar(p_lunes date, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('contenido.crear_editar');
  perform app.validar(extract(isodow from p_lunes) = 1, 'La semana empieza un lunes.');
  if nullif(p ->> 'category_id', '') is null and coalesce(trim(p ->> 'tema'), '') = '' and coalesce(trim(p ->> 'notas'), '') = '' then
    delete from public.editorial_plan where week_start = p_lunes;
  else
    insert into public.editorial_plan (week_start, category_id, topic, notes, updated_by)
    values (p_lunes, nullif(p ->> 'category_id', '')::uuid, trim(coalesce(p ->> 'tema', '')), trim(coalesce(p ->> 'notas', '')), auth.uid())
    on conflict (week_start) do update set category_id = excluded.category_id, topic = excluded.topic, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform app.auditar('CALENDARIO_GUARDADO', 'editorial_plan', p_lunes::text, p);
end $$;

/** Rotación por defecto (orden de categorías) y meses para avisar repeticiones. */
create or replace function public.fn_calendario_configurar(p_rotacion uuid[], p_meses int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('contenido.aprobar');
  perform app.validar(p_meses between 1 and 24, 'Entre 1 y 24 meses.');
  perform app.validar(cardinality(coalesce(p_rotacion, '{}')) between 1 and 12
                      and (select count(distinct x) from unnest(p_rotacion) x) = cardinality(p_rotacion)
                      and (select count(*) from public.knowledge_categories where id = any (p_rotacion)) = cardinality(p_rotacion), 'Revise la rotación: cada categoría una vez.');
  update public.app_settings set value = to_jsonb(p_rotacion), updated_by = auth.uid(), updated_at = now() where key = 'rotacion_categorias';
  update public.app_settings set value = to_jsonb(p_meses), updated_by = auth.uid(), updated_at = now() where key = 'repeticion_meses';
  perform app.auditar('CALENDARIO_CONFIGURADO', 'app_settings', 'calendario', jsonb_build_object('rotacion', p_rotacion, 'meses', p_meses));
end $$;

/** Sugerencias sin IA para una categoría: temas del catálogo no usados en 6 meses y las preguntas con más errores
    (de 12 semanas, con al menos 5 respuestas oficiales), que muestran qué conviene reforzar. */
create or replace function public.fn_calendario_sugerencias(p_categoria uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return jsonb_build_object(
    'temas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.title, 'descripcion', t.description) order by t.title)
      from public.topic_catalog t
     where t.category_id = p_categoria and t.is_active
       and not exists (select 1 from public.training_weeks w where w.status <> 'ARCHIVADO' and w.week_start >= app.hoy_cr() - 182 and app.temas_parecidos(t.title, w.title))), '[]'::jsonb),
    'errores', coalesce((select jsonb_agg(x order by (x ->> 'aciertos')::numeric) from (
      select jsonb_build_object('pregunta', q.prompt, 'semana', w.title, 'respuestas', count(*),
               'aciertos', round(100.0 * count(*) filter (where aa.is_correct) / count(*))) x
        from public.attempt_answers aa
        join public.capsule_attempts ca on ca.id = aa.attempt_id and ca.attempt_type = 'OFICIAL'
        join public.capsule_questions q on q.id = aa.question_id
        join public.training_weeks w on w.id = ca.week_id
       where w.category_id = p_categoria and w.week_start >= app.hoy_cr() - 84
       group by q.id, q.prompt, w.title having count(*) >= 5
       order by count(*) filter (where aa.is_correct)::numeric / count(*) limit 5) s), '[]'::jsonb));
end $$;

create or replace function public.fn_temas(p_categoria uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.title, 'descripcion', t.description, 'categoria', k.name, 'category_id', t.category_id, 'activo', t.is_active) order by k.sort_order, t.title)
    from public.topic_catalog t join public.knowledge_categories k on k.id = t.category_id where p_categoria is null or t.category_id = p_categoria), '[]'::jsonb);
end $$;

create or replace function public.fn_tema_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform app.exigir('contenido.crear_editar');
  perform app.validar(char_length(trim(coalesce(p ->> 'titulo', ''))) between 3 and 140, 'Escriba el tema (de 3 a 140 caracteres).');
  if nullif(p ->> 'id', '') is null then
    insert into public.topic_catalog (category_id, title, description) values ((p ->> 'category_id')::uuid, trim(p ->> 'titulo'), nullif(trim(coalesce(p ->> 'descripcion', '')), ''))
    returning id into v_id;
  else
    update public.topic_catalog set category_id = (p ->> 'category_id')::uuid, title = trim(p ->> 'titulo'), description = nullif(trim(coalesce(p ->> 'descripcion', '')), ''),
           is_active = coalesce((p ->> 'activo')::boolean, true)
     where id = (p ->> 'id')::uuid returning id into v_id;
    if v_id is null then perform app.error('NO_ENCONTRADO', 'Tema no encontrado.'); end if;
  end if;
  return v_id;
exception when unique_violation then
  perform app.error('VALIDACION', 'Ese tema ya está en el catálogo de esa categoría.');
end $$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_campanas(), public.fn_campana(uuid), public.fn_campana_guardar(jsonb), public.fn_campana_visible(uuid, boolean),
  public.fn_campana_archivar(uuid), public.fn_campana_agregar(uuid, text, uuid), public.fn_campana_quitar(uuid), public.fn_campanas_activas(),
  public.fn_calendario(date, int), public.fn_calendario_guardar(date, jsonb), public.fn_calendario_configurar(uuid[], int),
  public.fn_calendario_sugerencias(uuid), public.fn_temas(uuid), public.fn_tema_guardar(jsonb) to authenticated;

insert into app.schema_migrations (version, description) values ('10', 'Campañas (agrupan, no publican), calendario editorial de 8 semanas, rotación, avisos de repetición y sugerencias sin IA')
on conflict (version) do nothing;

commit;
