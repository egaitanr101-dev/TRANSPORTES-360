-- =============================================================================
-- TRANSPORTES 360 · 11_reportes.sql  (Fase 3 · iteración 8: reportes)
-- Crea: RPC de reportes (solo lectura) y el resumen del panel. No crea tablas ni modifica nada existente.
-- Reversión: sql/reversion/11_reportes.down.sql
-- Reglas (MAPA_FUNCIONAL §14, D-09):
--   * Todo indicador trae numerador y denominador.
--   * Alcance: quien gestiona usuarios ve a todos; un supervisor, solo a su equipo (profiles.supervisor_id).
--   * El supervisor NO ve puntajes individuales; los promedios de un grupo se ocultan si lo completaron menos de 5
--     personas (con tan pocos, un promedio deja adivinar puntajes individuales).
--   * Base de los porcentajes: personas que responden evaluaciones (colaboradores y supervisores, D-07) activas.
--     En semanas cerradas, la base congelada al cierre (weekly_results), que también incluye a quien participó y
--     después fue desactivado.
-- =============================================================================
begin;

/** ¿El usuario ve a toda la organización (true) o solo a su equipo (false)? */
create or replace function app.ve_todos()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.tiene_permiso('usuarios.gestionar')
$$;

create or replace function app.exigir_reportes()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.actor();
  if not (app.tiene_permiso('reportes.ver') or app.tiene_permiso('equipo.ver_participacion')) then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
end $$;

/** Personas en el alcance de quien consulta (activas y que responden evaluaciones). */
create or replace function app.en_alcance(p_persona public.profiles)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.ve_todos() or p_persona.supervisor_id = auth.uid()
$$;

/** Indicadores de una semana para un grupo (todos, un equipo o un área). */
create or replace function app.indicadores_semana(w public.training_weeks, p_area text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_base int; v_part int; v_comp int; v_prom numeric; v_ingr int;
begin
  if w.closed_at is not null then
    select count(*), count(*) filter (where r.capsules_completed > 0), count(*) filter (where r.completed_all), avg(r.score) filter (where r.completed_all)
      into v_base, v_part, v_comp, v_prom
      from public.weekly_results r join public.profiles p on p.id = r.user_id
     where r.week_id = w.id and app.en_alcance(p) and (p_area is null or p.area_id = p_area);
  else
    select count(*), count(*) filter (where a.n > 0), count(*) filter (where a.n = 5), avg(a.puntos) filter (where a.n = 5)
      into v_base, v_part, v_comp, v_prom
      from public.profiles p
      left join (select user_id, count(*) n, sum(score) puntos from public.capsule_attempts where week_id = w.id and attempt_type = 'OFICIAL' group by user_id) a on a.user_id = p.id
     where p.is_active and app.permiso_de(p.id, 'evaluacion.responder') and app.en_alcance(p) and (p_area is null or p.area_id = p_area);
  end if;
  select count(distinct v.user_id) into v_ingr
    from public.capsule_views v join public.capsules c on c.id = v.capsule_id join public.profiles p on p.id = v.user_id
   where c.week_id = w.id and app.en_alcance(p) and (p_area is null or p.area_id = p_area) and app.permiso_de(p.id, 'evaluacion.responder');
  return jsonb_build_object('base', v_base, 'ingresaron', v_ingr, 'participaron', v_part, 'completaron', v_comp,
    'promedio', case when v_comp >= 5 or (app.ve_todos() and v_comp > 0) then round(v_prom, 1) end,
    'promedio_oculto', v_comp > 0 and v_comp < 5 and not app.ve_todos());
end $$;

/** Semanas publicadas más recientes (hasta 26) con sus indicadores. */
create or replace function public.fn_reporte_semanas(p_semanas int default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_reportes();
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'lunes', w.week_start, 'numero', extract(week from w.week_start)::int, 'titulo', w.title,
      'categoria', k.name, 'cerrada', w.closed_at is not null, 'en_curso', app.semana_abierta(w)) || app.indicadores_semana(w) order by w.week_start desc)
    from (select * from public.training_weeks w0 where w0.status in ('PROGRAMADO', 'PUBLICADO') and w0.publish_at <= now() and w0.week_start <= app.hoy_cr()
           order by w0.week_start desc limit least(greatest(coalesce(p_semanas, 8), 1), 26)) w
    join public.knowledge_categories k on k.id = w.category_id), '[]'::jsonb);
end $$;

/** Indicadores por área de una semana (solo quien ve a toda la organización). */
create or replace function public.fn_reporte_areas(p_semana uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.training_weeks;
begin
  perform app.exigir_reportes();
  if not app.ve_todos() then perform app.error('NO_AUTORIZADO', 'Solo la administración ve el reporte por área.'); end if;
  select * into w from public.training_weeks where id = p_semana;
  if not found then perform app.error('NO_ENCONTRADO', 'Semana no encontrada.'); end if;
  return jsonb_build_object(
    'areas', coalesce((select jsonb_agg(jsonb_build_object('area', x.nombre, 'area_id', x.id) || app.indicadores_semana(w, x.id) order by x.nombre)
      from (select a.id, a.name nombre from public.areas a where exists (select 1 from public.profiles p where p.area_id = a.id)) x), '[]'::jsonb),
    'sin_area', (select count(*) from public.profiles p where p.area_id is null and p.is_active and app.permiso_de(p.id, 'evaluacion.responder')));
end $$;

/** Aciertos por pregunta de una semana (solo quien crea contenido: incluye la respuesta correcta). */
create or replace function public.fn_reporte_preguntas(p_semana uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir('contenido.crear_editar');
  return coalesce((select jsonb_agg(jsonb_build_object('dia', c.day_number, 'capsula', c.title, 'posicion', q.position, 'pregunta', q.prompt,
      'respuestas', s.n, 'correctas', s.ok, 'aciertos', case when s.n > 0 then round(100.0 * s.ok / s.n) end,
      'error_comun', (select o.label from public.attempt_answers aa join public.capsule_attempts ca on ca.id = aa.attempt_id and ca.attempt_type = 'OFICIAL'
                        join public.question_options o on o.id = aa.selected_option_id
                       where aa.question_id = q.id and not aa.is_correct group by o.label order by count(*) desc limit 1)) order by c.day_number, q.position)
    from public.capsules c join public.capsule_questions q on q.capsule_id = c.id
    left join lateral (select count(*) n, count(*) filter (where aa.is_correct) ok from public.attempt_answers aa
                         join public.capsule_attempts ca on ca.id = aa.attempt_id and ca.attempt_type = 'OFICIAL' where aa.question_id = q.id) s on true
   where c.week_id = p_semana), '[]'::jsonb);
end $$;

/** Lectura de las alertas (vigentes y las vencidas en los últimos 30 días), por la última versión publicada. */
create or replace function public.fn_reporte_alertas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.alert_id, 'titulo', p.title, 'prioridad', p.priority, 'version', p.version, 'publica', p.publish_at, 'vence', p.expires_at,
      'vigente', exists (select 1 from app.alertas_vigentes() v where v.alert_id = p.alert_id and v.version = p.version)) || app.alerta_seguimiento(p.alert_id, p.version) order by p.publish_at desc)
    from public.alert_publications p
   where p.publish_at <= now() and p.expires_at > now() - interval '30 days'
     and not exists (select 1 from public.alert_publications q where q.alert_id = p.alert_id and q.version > p.version and q.publish_at <= now())), '[]'::jsonb);
end $$;

/** Uso de IA por mes (últimos 6): solicitudes, generadas, convertidas en borrador, aprobadas y costo estimado. */
create or replace function public.fn_reporte_ia()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir('ia.generar');
  return coalesce((select jsonb_agg(x order by x ->> 'mes' desc) from (
    select jsonb_build_object('mes', to_char(date_trunc('month', j.created_at at time zone 'America/Costa_Rica'), 'YYYY-MM'),
      'solicitudes', count(*), 'simuladas', count(*) filter (where j.provider_id = 'simulado'),
      'generadas', count(*) filter (where j.status in ('GENERADO', 'CONVERTIDO')), 'convertidas', count(*) filter (where j.status = 'CONVERTIDO'),
      'aprobadas', count(*) filter (where j.status = 'CONVERTIDO' and (
          exists (select 1 from public.training_weeks w where w.id = j.target_id and w.approved_at is not null)
          or exists (select 1 from public.alerts a where a.id = j.target_id and a.approved_at is not null)
          or exists (select 1 from public.tips t where t.id = j.target_id and t.approved_at is not null))),
      'costo_usd', coalesce(sum((select sum(s.cost_usd) from public.generation_steps s where s.job_id = j.id)), 0),
      'costo_estimado', bool_or(exists (select 1 from public.generation_steps s where s.job_id = j.id and s.cost_estimated))) x
    from public.generation_jobs j
   where j.created_at >= date_trunc('month', now()) - interval '5 months'
   group by date_trunc('month', j.created_at at time zone 'America/Costa_Rica')) s), '[]'::jsonb);
end $$;

/** Resumen del panel: semana en curso, alerta principal, IA del mes y pendientes. Cada cifra con su denominador. */
create or replace function public.fn_resumen()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w public.training_weeks; v_alerta jsonb; v_lunes date := date_trunc('week', app.hoy_cr())::date;
begin
  perform app.exigir_reportes();
  select * into w from public.training_weeks where week_start = v_lunes and status in ('PROGRAMADO', 'PUBLICADO') and publish_at <= now();
  if app.ve_todos() then
    select jsonb_build_object('titulo', v.title, 'version', v.version, 'vence', v.expires_at) || app.alerta_seguimiento(v.alert_id, v.version) into v_alerta
      from app.alertas_vigentes() v order by array_position(array['CRITICA', 'ALTA', 'PREVENTIVA', 'INFORMATIVA'], v.priority), v.publish_at desc limit 1;
  end if;
  return jsonb_build_object(
    'equipo', not app.ve_todos(),
    'semana', case when w.id is null then null else jsonb_build_object('id', w.id, 'titulo', w.title, 'lunes', w.week_start, 'numero', extract(week from w.week_start)::int,
                'dia', least(greatest(app.hoy_cr() - w.week_start + 1, 1), 5)) || app.indicadores_semana(w) end,
    'alerta', v_alerta,
    'ia', case when app.tiene_permiso('ia.generar') then jsonb_build_object('gastado_usd', app.ia_gasto_mes(), 'tope_usd', app.ia_limite('mes_usd'), 'encendida', app.ia_encendida()) end,
    'pendientes', case when app.ve_todos() then jsonb_build_object(
        'revision', (select count(*) from public.training_weeks where status = 'PENDIENTE_REVISION') + (select count(*) from public.alerts where status = 'PENDIENTE_REVISION')
                  + (select count(*) from public.tips where status = 'PENDIENTE_REVISION'),
        'sin_capacitacion', (select coalesce(jsonb_agg(l order by l), '[]'::jsonb) from generate_series(v_lunes + 7, v_lunes + 14, interval '7 days') g(d), lateral (select g.d::date l) z
                              where not exists (select 1 from public.training_weeks x where x.week_start = l and x.status in ('PROGRAMADO', 'PUBLICADO'))),
        'sorteos', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.title, 'lunes', x.week_start) order by x.week_start), '[]'::jsonb) from public.training_weeks x
                     where x.status in ('PROGRAMADO', 'PUBLICADO') and x.publish_at <= now() and x.week_end < app.hoy_cr() and x.week_start >= v_lunes - 56
                       and not exists (select 1 from public.weekly_draws d where d.week_id = x.id and d.status in ('OFICIAL', 'DESIERTO'))),
        'alertas_por_vencer', (select coalesce(jsonb_agg(jsonb_build_object('id', v.alert_id, 'titulo', v.title, 'vence', v.expires_at) order by v.expires_at), '[]'::jsonb)
                                 from app.alertas_vigentes() v where v.expires_at < now() + interval '7 days'),
        'fuentes', (select count(*) from public.external_sources where validation_status = 'PENDIENTE')) end,
    'errores', case when w.id is not null and app.tiene_permiso('contenido.crear_editar') then (
        select coalesce(jsonb_agg(x order by (x ->> 'aciertos')::int), '[]'::jsonb) from (
          select x from jsonb_array_elements(public.fn_reporte_preguntas(w.id)) x where (x ->> 'respuestas')::int >= 5 order by (x ->> 'aciertos')::int limit 3) s) end);
end $$;

/** Mi equipo (supervisor, D-09): participación de cada persona en la semana en curso, SIN puntajes individuales. */
create or replace function public.fn_mi_equipo()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); w public.training_weeks; v_lunes date := date_trunc('week', app.hoy_cr())::date;
begin
  perform app.exigir('equipo.ver_participacion');
  select * into w from public.training_weeks where week_start = v_lunes and status in ('PROGRAMADO', 'PUBLICADO') and publish_at <= now();
  return jsonb_build_object(
    'semana', case when w.id is null then null else jsonb_build_object('titulo', w.title, 'numero', extract(week from w.week_start)::int, 'cierra', w.week_end,
                'dia', least(greatest(app.hoy_cr() - w.week_start + 1, 1), 5)) end,
    'personas', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.full_name, 'codigo', p.employee_code, 'area', a.name, 'activo', p.is_active,
        'activada', exists (select 1 from public.account_activations x where x.profile_id = p.id and x.used_at is not null),
        'capsulas', case when w.id is null then null else (select count(*) from public.capsule_attempts c where c.week_id = w.id and c.user_id = p.id and c.attempt_type = 'OFICIAL') end,
        'alertas_pendientes', (select count(*) from app.alertas_vigentes() v where app.en_audiencia(v.area_ids, p.area_id)
                                  and not exists (select 1 from public.alert_acknowledgements k where k.alert_id = v.alert_id and k.version = v.version and k.user_id = p.id and k.acknowledged_at is not null)))
        order by p.full_name)
      from public.profiles p left join public.areas a on a.id = p.area_id where p.supervisor_id = v_actor.id), '[]'::jsonb),
    'semanas', public.fn_reporte_semanas(6));
end $$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_reporte_semanas(int), public.fn_reporte_areas(uuid), public.fn_reporte_preguntas(uuid), public.fn_reporte_alertas(),
  public.fn_reporte_ia(), public.fn_resumen(), public.fn_mi_equipo() to authenticated;

insert into app.schema_migrations (version, description) values ('11', 'Reportes con numerador y denominador, alcance por equipo (D-09) y resumen del panel')
on conflict (version) do nothing;

commit;
