-- =============================================================================
-- TRANSPORTES 360 · 96_pruebas_capacitacion.sql  (iteración 2: capacitación semanal)
-- Datos ficticios. Termina en ROLLBACK (en Supabase: con un error final a propósito).
-- =============================================================================
begin;

create function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated')::text end, true);
  if p is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;
create function pg_temp.yo() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); end $$;
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is distinct from true then raise exception 'FALLÓ: %', msg; end if; raise notice 'OK  %', msg; end $$;
create function pg_temp.falla(sql text, esperado text, msg text) returns void language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin execute sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if esperado is null or v_hint = esperado or v_state = esperado then raise notice 'OK  % (rechazado)', msg; return; end if;
    raise exception 'FALLÓ: % → error inesperado % / % / %', msg, v_state, v_hint, v_msg;
  end;
  raise exception 'FALLÓ: % → no hubo error', msg;
end $$;

/** Semana de prueba: 5 cápsulas con un bloque de texto y 2 preguntas; la opción correcta es la segunda (índice 1). */
create function pg_temp.semana(p_lunes date, p_titulo text) returns jsonb language sql as $$
  select jsonb_build_object('week_start', p_lunes, 'category_id', (select id from public.knowledge_categories where slug = 'seguridad_digital'),
    'titulo', p_titulo, 'objetivo', 'Objetivo de prueba',
    'capsulas', (select jsonb_agg(jsonb_build_object('dia', d, 'titulo', 'Cápsula ' || d, 'objetivo', 'Objetivo ' || d, 'minutos', 4,
        'bloques', jsonb_build_array(jsonb_build_object('tipo', 'texto', 'titulo', 'Contenido', 'parrafos', jsonb_build_array('Texto de prueba'))),
        'preguntas', (select jsonb_agg(jsonb_build_object('texto', 'Pregunta ' || d || '.' || n, 'opciones', jsonb_build_array('Opción A', 'Opción B', 'Opción C'),
                                                          'correcta', 1, 'explicacion', 'Bien explicado', 'retro', 'Revise el contenido'))
                      from generate_series(1, 2) n))) from generate_series(1, 5) d))
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'k-1@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-1","full_name":"Colaborador Uno"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'k-2@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-2","full_name":"Colaborador Dos"}');
update public.profiles set is_active = true where id::text like '00000000-0000-0000-0000-0000000000%';   -- solo usuarios de prueba
update public.profiles set privacy_accepted_at = now() where id = '00000000-0000-0000-0000-0000000000c1';

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  v_hoy date := app.hoy_cr();
  v_lunes date := date_trunc('week', app.hoy_cr())::date;
  v_sem uuid; v_fut uuid; r jsonb; r2 jsonb; v_cap uuid; v_q1 uuid; v_q2 uuid; v_ok1 uuid; v_ok2 uuid; v_mal uuid; n int;
  v_resp jsonb; v_clave uuid := gen_random_uuid();
begin
  -- C1 · Borrador incompleto permitido; envío a revisión exige semana completa
  perform pg_temp.como(a2);
  v_sem := public.fn_admin_semana_guardar(jsonb_build_object('week_start', v_lunes, 'category_id', (select id from public.knowledge_categories where slug = 'seguridad_digital'), 'titulo', 'Semana incompleta'));
  perform pg_temp.falla(format('select public.fn_admin_semana_enviar(%L)', v_sem), 'VALIDACION', 'C1 no se envía una semana sin 5 cápsulas');
  perform pg_temp.falla(format('select public.fn_admin_semana_guardar(%L)', pg_temp.semana(v_lunes, 'Duplicada')), 'VALIDACION', 'C1 una sola capacitación por semana');
  perform pg_temp.falla(format('select public.fn_admin_semana_guardar(%L)', pg_temp.semana(v_lunes + 1, 'Martes')), 'VALIDACION', 'C1 la semana empieza un lunes');

  -- C2 · Guardar completa, enviar, cuatro ojos
  v_sem := public.fn_admin_semana_guardar(pg_temp.semana(v_lunes, 'Prevención de estafas') || jsonb_build_object('id', v_sem));
  r := public.fn_admin_semana(v_sem);
  perform pg_temp.ok(jsonb_array_length(r -> 'capsulas') = 5 and (r #>> '{capsulas,0,preguntas,0,correcta}')::int = 1, 'C2 el panel ve las 5 cápsulas y la clave');
  perform public.fn_admin_semana_enviar(v_sem);
  perform pg_temp.falla(format('select public.fn_admin_semana_aprobar(%L)', v_sem), 'VALIDACION', 'C2 quien editó no aprueba');
  perform pg_temp.como(a1);
  perform pg_temp.falla(format('select public.fn_admin_semana_devolver(%L, ''x'')', v_sem), 'VALIDACION', 'C2 devolver exige explicación');
  r := public.fn_admin_semana_aprobar(v_sem, 'Revisado');
  perform pg_temp.ok(r ->> 'estado' = 'PROGRAMADO' and not (r ->> 'aprobador_unico')::boolean, 'C2 otro administrador aprueba y queda programada');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.approval_history where entity_id = v_sem) = 3, 'C2 historial: creación, envío y aprobación');

  -- C3 · Colaborador: semana actual, cápsula sin clave, orden de opciones propio
  perform pg_temp.como(c1);
  r := public.fn_semana_actual();
  perform pg_temp.ok((r ->> 'id')::uuid = v_sem and jsonb_array_length(r -> 'capsulas') = 5, 'C3 ve la semana en curso');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(r -> 'capsulas') e where e ->> 'estado' = 'bloqueada')
                     = (select count(*) from generate_series(1, 5) d where v_lunes + (d - 1) > v_hoy), 'C3 días futuros bloqueados');
  v_cap := (r #>> '{capsulas,0,id}')::uuid;   -- lunes: siempre disponible
  r := public.fn_capsula(v_cap);
  perform pg_temp.ok(r::text not like '%correcta%' and r::text not like '%explicacion%' and r::text not like '%Bien explicado%', 'C3 la cápsula NO trae la respuesta correcta');
  perform pg_temp.ok(jsonb_array_length(r -> 'bloques') = 1 and jsonb_array_length(r -> 'preguntas') = 2, 'C3 bloques y 2 preguntas');
  v_q1 := (r #>> '{preguntas,0,id}')::uuid; v_q2 := (r #>> '{preguntas,1,id}')::uuid;
  perform pg_temp.yo();
  select o.id into v_ok1 from public.question_options o where o.question_id = v_q1 and o.position = 2;
  select o.id into v_ok2 from public.question_options o where o.question_id = v_q2 and o.position = 2;
  select o.id into v_mal from public.question_options o where o.question_id = v_q2 and o.position = 1;
  perform pg_temp.ok(exists (select 1 from public.capsule_views where capsule_id = v_cap and user_id = c1), 'C3 vista registrada');

  -- C4 · Responder: aviso de privacidad, oficial, idempotencia, práctica
  perform pg_temp.como(c2);
  perform pg_temp.falla(format('select public.fn_responder_capsula(%L, %L, %L)', v_cap, jsonb_build_object(v_q1, v_ok1, v_q2, v_ok2), gen_random_uuid()), 'VALIDACION', 'C4 sin aviso de privacidad no responde');
  perform pg_temp.como(c1);
  perform pg_temp.falla(format('select public.fn_responder_capsula(%L, %L, %L)', v_cap, jsonb_build_object(v_q1, v_ok1), gen_random_uuid()), 'VALIDACION', 'C4 debe responder las 2');
  v_resp := public.fn_responder_capsula(v_cap, jsonb_build_object(v_q1, v_ok1, v_q2, v_mal), v_clave);
  perform pg_temp.ok(v_resp ->> 'tipo' = 'OFICIAL' and (v_resp ->> 'puntaje')::int = 1 and (v_resp #>> '{resultados,1,correcta_id}')::uuid = v_ok2
                     and v_resp #>> '{resultados,1,mensaje}' = 'Revise el contenido', 'C4 oficial 1/2 con retroalimentación inmediata');
  r2 := public.fn_responder_capsula(v_cap, jsonb_build_object(v_q1, v_ok1, v_q2, v_ok2), v_clave);
  perform pg_temp.ok(r2 = v_resp, 'C4 misma clave: mismo resultado (reintento de red)');
  r2 := public.fn_responder_capsula(v_cap, jsonb_build_object(v_q1, v_ok1, v_q2, v_ok2), gen_random_uuid());
  perform pg_temp.ok(r2 ->> 'tipo' = 'PRACTICA' and (r2 ->> 'puntaje')::int = 2, 'C4 segundo envío es práctica');
  r := public.fn_semana_actual();
  perform pg_temp.ok((r #>> '{capsulas,0,estado}') = 'completada' and (r #>> '{capsulas,0,puntos}')::int = 1, 'C4 la semana refleja el puntaje oficial');
  r := public.fn_mi_historial();
  perform pg_temp.ok((r #>> '{semanas,0,puntos}')::int = 1 and (r #>> '{semanas,0,capsulas}')::int = 1, 'C4 historial con puntos oficiales');
  perform pg_temp.yo();
  perform pg_temp.ok((select locked_at is not null from public.capsules where id = v_cap), 'C4 la cápsula queda bloqueada');
  perform pg_temp.ok((select count(*) from public.capsule_attempts where user_id = c1) = 2, 'C4 2 intentos (oficial + práctica)');

  -- C5 · Bloqueo de edición y protección de resultados
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_admin_semana_guardar(%L)', pg_temp.semana(v_lunes, 'Cambio') || jsonb_build_object('id', v_sem)), 'VALIDACION', 'C5 no se edita con respuestas');
  perform pg_temp.falla(format('select public.fn_admin_semana_eliminar(%L)', v_sem), 'VALIDACION', 'C5 no se elimina lo aprobado');
  perform pg_temp.como(a1);
  perform pg_temp.falla(format('select public.fn_admin_semana_archivar(%L)', v_sem), 'VALIDACION', 'C5 no se archiva una semana en curso');
  perform pg_temp.yo();
  perform pg_temp.falla('update public.capsule_attempts set score = 2', 'INMUTABLE', 'C5 intentos inmutables');
  perform pg_temp.falla('delete from public.attempt_answers', 'INMUTABLE', 'C5 respuestas inmutables');

  -- C6 · Semana futura: invisible hasta su lunes; editar lo programado lo devuelve a revisión
  perform pg_temp.como(a2);
  v_fut := public.fn_admin_semana_guardar(pg_temp.semana(v_lunes + 7, 'Semana futura'));
  perform public.fn_admin_semana_enviar(v_fut);
  perform pg_temp.como(a1);
  perform public.fn_admin_semana_aprobar(v_fut, null);
  perform pg_temp.como(a2);
  perform public.fn_admin_semana_guardar(pg_temp.semana(v_lunes + 7, 'Semana futura v2') || jsonb_build_object('id', v_fut));
  perform pg_temp.yo();
  perform pg_temp.ok((select status = 'PENDIENTE_REVISION' and publish_at is null and approved_by is null and version = 2 from public.training_weeks where id = v_fut),
                     'C6 editar lo programado lo devuelve a revisión');
  select c.id into v_cap from public.capsules c where c.week_id = v_fut and c.day_number = 1;
  perform pg_temp.como(c1);
  perform pg_temp.falla(format('select public.fn_capsula(%L)', v_cap), 'NO_ENCONTRADO', 'C6 cápsula de semana no publicada invisible');
  perform pg_temp.yo();
  select c.id into v_cap from public.capsules c where c.week_id = v_sem and c.day_number = 1;

  -- C7 · Aprobador único (principal solo) y permisos
  perform pg_temp.yo();
  -- Solo queda a1 como aprobador activo (en Supabase incluye a los administradores reales; todo se revierte al final)
  update public.profiles set is_active = false where id <> a1 and role_id in ('ADMIN', 'ADMIN_PRINCIPAL');
  perform pg_temp.como(a1);
  perform public.fn_admin_semana_guardar(pg_temp.semana(v_lunes + 7, 'Semana futura v3') || jsonb_build_object('id', v_fut));
  r := public.fn_admin_semana_aprobar(v_fut, 'Único aprobador');
  perform pg_temp.ok((r ->> 'aprobador_unico')::boolean, 'C7 el principal, único aprobador, aprueba lo propio (queda marcado)');
  perform pg_temp.yo();
  update public.profiles set is_active = true where id = a2;

  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_admin_semanas()', 'NO_AUTORIZADO', 'C8 colaborador no usa el panel');
  perform pg_temp.falla(format('select public.fn_admin_semana(%L)', v_sem), 'NO_AUTORIZADO', 'C8 colaborador no ve la clave');
  perform pg_temp.falla('select count(*) from public.question_answer_keys', '42501', 'C8 tabla de claves inaccesible');
  perform pg_temp.falla('select count(*) from public.capsules', '42501', 'C8 tablas de contenido solo por RPC');
  perform pg_temp.falla('select count(*) from public.capsule_attempts', '42501', 'C8 intentos solo por RPC');
  perform pg_temp.como(a1);
  perform pg_temp.falla(format('select public.fn_responder_capsula(%L, ''{}'', %L)', v_cap, gen_random_uuid()), 'NO_AUTORIZADO', 'C8 administrador no responde (D-07)');
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_semana_actual()', '42501', 'C8 anónimo no ve nada');
  perform pg_temp.yo();

  raise notice '== Pruebas de capacitación semanal: todas correctas ==';
end $$;

rollback;
