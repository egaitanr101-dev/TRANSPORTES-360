-- =============================================================================
-- TRANSPORTES 360 · 90_pruebas_reportes.sql  (iteración 8: reportes)
-- Datos ficticios (solo identificadores 00000000-…). Termina en ROLLBACK (en Supabase: con un error final a propósito).
-- =============================================================================
begin;

create function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated')::text end, true);
  if p is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;
create function pg_temp.yo() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'OK  %', msg;
  perform set_config('t360.n', (coalesce(nullif(current_setting('t360.n', true), ''), '0')::int + 1)::text, true);
end $$;
create function pg_temp.falla(sql text, esperado text, msg text) returns void language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin execute sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if v_hint = esperado or v_state = esperado then perform pg_temp.ok(true, msg || ' (rechazado)'); return; end if;
    raise exception 'FALLÓ: % → error inesperado % / % / %', msg, v_state, v_hint, v_msg;
  end;
  raise exception 'FALLÓ: % → no hubo error', msg;
end $$;
/** n cápsulas oficiales con p puntos (2 por cápsula; lo que sobra en las primeras). */
create function pg_temp.intentos(p_semana uuid, p_usuario uuid, n int, p int) returns void language sql as $$
  insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, total, idempotency_key)
  select c.id, p_semana, p_usuario, 'OFICIAL', least(2, greatest(0, p - 2 * (c.day_number - 1))), 2, gen_random_uuid()
    from public.capsules c where c.week_id = p_semana and c.day_number <= n
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'k-50@colaboradores.t360.invalid', '{"role":"SUPERVISOR","employee_code":"K-50","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'k-51@colaboradores.t360.invalid', '{"role":"SUPERVISOR","employee_code":"K-51","full_name":"Susana Supervisora"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'k-1@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-1","full_name":"Colaborador Uno"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'k-2@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-2","full_name":"Colaborador Dos"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'k-3@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-3","full_name":"Colaborador Tres"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'k-4@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-4","full_name":"Colaborador Cuatro"}');
insert into public.areas (id, name) values ('T_PRUEBA_UNO', 'Prueba Uno'), ('T_PRUEBA_DOS', 'Prueba Dos');
update public.profiles set is_active = (id::text like '00000000-0000-0000-0000-0000000000%');
-- Equipo de b1: c1, c2, c3 (área uno). Equipo de b2: c4 (área dos).
update public.profiles set supervisor_id = '00000000-0000-0000-0000-0000000000b1', area_id = 'T_PRUEBA_UNO' where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3');
update public.profiles set supervisor_id = '00000000-0000-0000-0000-0000000000b2', area_id = 'T_PRUEBA_DOS' where id = '00000000-0000-0000-0000-0000000000c4';

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  b1 uuid := '00000000-0000-0000-0000-0000000000b1'; b2 uuid := '00000000-0000-0000-0000-0000000000b2';
  c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2'; c3 uuid := '00000000-0000-0000-0000-0000000000c3'; c4 uuid := '00000000-0000-0000-0000-0000000000c4';
  v_lunes date := date_trunc('week', app.hoy_cr())::date; v_cat uuid; wa uuid; wp uuid; r jsonb; q uuid; cap uuid; x jsonb;
begin
  select id into v_cat from public.knowledge_categories where slug = 'seguridad_digital';
  insert into public.training_weeks (week_start, category_id, title, status, publish_at, created_by, updated_by)
  values (v_lunes, v_cat, 'Semana en curso', 'PROGRAMADO', now() - interval '1 hour', a2, a2) returning id into wa;
  insert into public.training_weeks (week_start, category_id, title, status, publish_at, created_by, updated_by)
  values (v_lunes - 7, v_cat, 'Semana pasada', 'PROGRAMADO', now() - interval '8 days', a2, a2) returning id into wp;
  insert into public.capsules (week_id, day_number, title) select w, d, 'Cápsula ' || d from unnest(array[wa, wp]) w, generate_series(1, 5) d;
  -- Semana en curso: c1 completa (9), c2 va en 2, c3 no empieza, c4 completa (10), b1 completa (8)
  perform pg_temp.intentos(wa, c1, 5, 9); perform pg_temp.intentos(wa, c2, 2, 4); perform pg_temp.intentos(wa, c4, 5, 10); perform pg_temp.intentos(wa, b1, 5, 8);
  insert into public.capsule_views (capsule_id, user_id) select c.id, u from public.capsules c, unnest(array[c1, c2, c3]) u where c.week_id = wa and c.day_number = 1;
  -- Una pregunta con respuestas oficiales en la semana en curso
  select id into cap from public.capsules where week_id = wa and day_number = 1;
  insert into public.capsule_questions (capsule_id, position, prompt) values (cap, 1, '¿Qué hace ante un enlace desconocido?') returning id into q;
  insert into public.question_options (question_id, position, label) values (q, 1, 'Lo abro'), (q, 2, 'No lo abro');
  insert into public.attempt_answers (attempt_id, question_id, selected_option_id, is_correct)
  select a.id, q, (select id from public.question_options where question_id = q and position = case when a.user_id = c1 then 2 else 1 end), a.user_id = c1
    from public.capsule_attempts a where a.capsule_id = cap and a.attempt_type = 'OFICIAL';
  -- Semana pasada cerrada
  perform pg_temp.intentos(wp, c1, 5, 10); perform pg_temp.intentos(wp, c2, 5, 6); perform pg_temp.intentos(wp, c4, 3, 6);
  perform pg_temp.como(a2);
  perform public.fn_cerrar_semana(wp);

  -- R1 · Permisos
  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_reporte_semanas()', 'NO_AUTORIZADO', 'R1 colaborador no ve reportes');
  perform pg_temp.falla('select public.fn_mi_equipo()', 'NO_AUTORIZADO', 'R1 ni el equipo');
  perform pg_temp.como(b1);
  perform pg_temp.falla(format('select public.fn_reporte_areas(%L)', wa), 'NO_AUTORIZADO', 'R1 supervisor no ve por área');
  perform pg_temp.falla(format('select public.fn_reporte_preguntas(%L)', wa), 'NO_AUTORIZADO', 'R1 supervisor no ve las preguntas (traen la respuesta correcta)');
  perform pg_temp.falla('select public.fn_reporte_ia()', 'NO_AUTORIZADO', 'R1 supervisor no ve el costo de IA');

  -- R2 · Administración: toda la organización, con numerador y denominador
  perform pg_temp.como(a2);
  r := public.fn_reporte_semanas(8);
  x := (select e from jsonb_array_elements(r) e where (e ->> 'id')::uuid = wa);
  perform pg_temp.ok((x ->> 'base')::int = 6 and (x ->> 'participaron')::int = 4 and (x ->> 'completaron')::int = 3 and (x ->> 'ingresaron')::int = 3 and (x ->> 'en_curso')::boolean,
                     'R2 semana en curso: 6 personas, 4 participan, 3 completan, 3 ingresaron: ' || x::text);
  perform pg_temp.ok((x ->> 'promedio')::numeric = 9.0, 'R2 promedio de quienes completaron (9, 10, 8)');
  x := (select e from jsonb_array_elements(r) e where (e ->> 'id')::uuid = wp);
  perform pg_temp.ok((x ->> 'cerrada')::boolean and (x ->> 'base')::int = 6 and (x ->> 'completaron')::int = 2 and (x ->> 'promedio')::numeric = 8.0, 'R2 semana cerrada: base congelada al cierre');
  r := public.fn_reporte_areas(wa);
  perform pg_temp.ok((select (e ->> 'base')::int = 3 and (e ->> 'completaron')::int = 1 from jsonb_array_elements(r -> 'areas') e where e ->> 'area_id' = 'T_PRUEBA_UNO')
                     and (select (e ->> 'base')::int = 1 from jsonb_array_elements(r -> 'areas') e where e ->> 'area_id' = 'T_PRUEBA_DOS')
                     and (r ->> 'sin_area')::int = 2, 'R2 por área (y quienes no tienen área)');
  r := public.fn_reporte_preguntas(wa);
  perform pg_temp.ok((r #>> '{0,respuestas}')::int = 4 and (r #>> '{0,aciertos}')::int = 25 and r #>> '{0,error_comun}' = 'Lo abro', 'R2 aciertos por pregunta y error más común');
  r := public.fn_resumen();
  perform pg_temp.ok((r #>> '{semana,base}')::int = 6 and not (r ->> 'equipo')::boolean and r -> 'pendientes' is not null and r -> 'ia' is not null, 'R2 resumen con alcance completo');
  perform pg_temp.ok(jsonb_array_length(r #> '{pendientes,sin_capacitacion}') = 2 and jsonb_array_length(r #> '{pendientes,sorteos}') >= 1, 'R2 pendientes: semanas sin capacitación y sorteo por ejecutar');

  -- R3 · Supervisor: solo su equipo, sin puntajes individuales, promedio oculto con menos de 5
  perform pg_temp.como(b1);
  r := public.fn_reporte_semanas(8);
  x := (select e from jsonb_array_elements(r) e where (e ->> 'id')::uuid = wa);
  perform pg_temp.ok((x ->> 'base')::int = 3 and (x ->> 'completaron')::int = 1 and x -> 'promedio' = 'null'::jsonb and (x ->> 'promedio_oculto')::boolean,
                     'R3 equipo de 3: el promedio se oculta (menos de 5 completaron)');
  r := public.fn_mi_equipo();
  perform pg_temp.ok(jsonb_array_length(r -> 'personas') = 3 and not exists (select 1 from jsonb_array_elements(r -> 'personas') e where e ->> 'nombre' = 'Colaborador Cuatro'), 'R3 solo su equipo');
  perform pg_temp.ok((select (e ->> 'capsulas')::int from jsonb_array_elements(r -> 'personas') e where e ->> 'codigo' = 'K-1') = 5
                     and r::text not like '%puntos%' and r::text not like '%"score"%', 'R3 cápsulas por persona, sin puntajes');
  r := public.fn_resumen();
  perform pg_temp.ok((r ->> 'equipo')::boolean and r -> 'pendientes' = 'null'::jsonb and r -> 'ia' = 'null'::jsonb and r -> 'errores' = 'null'::jsonb, 'R3 su resumen no muestra pendientes, costos ni preguntas');
  perform pg_temp.como(b2);
  perform pg_temp.ok(jsonb_array_length(public.fn_mi_equipo() -> 'personas') = 1, 'R3 otro supervisor ve solo a su persona');

  -- R4 · Alertas e IA
  perform pg_temp.como(a2);
  perform pg_temp.ok(jsonb_typeof(public.fn_reporte_alertas()) = 'array' and jsonb_typeof(public.fn_reporte_ia()) = 'array', 'R4 reportes de alertas e IA disponibles');
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_resumen()', '42501', 'R4 anónimo no ve nada');
  perform pg_temp.yo();

  raise notice '== Pruebas de reportes: todas correctas (% comprobaciones) ==', current_setting('t360.n', true);
end $$;

rollback;
