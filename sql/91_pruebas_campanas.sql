-- =============================================================================
-- TRANSPORTES 360 · 91_pruebas_campanas.sql  (iteración 7: campañas y calendario editorial)
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

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'k-50@colaboradores.t360.invalid', '{"role":"SUPERVISOR","employee_code":"K-50","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'k-1@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-1","full_name":"Colaborador Uno"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'k-2@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-2","full_name":"Colaborador Dos"}');
insert into public.areas (id, name) values ('T_PRUEBA_UNO', 'Prueba Uno'), ('T_PRUEBA_DOS', 'Prueba Dos');
update public.profiles set is_active = (id::text like '00000000-0000-0000-0000-0000000000%');
update public.profiles set area_id = 'T_PRUEBA_UNO' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set area_id = 'T_PRUEBA_DOS' where id = '00000000-0000-0000-0000-0000000000c2';

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  s1 uuid := '00000000-0000-0000-0000-0000000000b1'; c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  v_hoy date := app.hoy_cr(); v_lunes date := date_trunc('week', app.hoy_cr())::date;
  k_seg uuid; k_dig uuid; k_fin uuid; camp uuid; w_pasada uuid; w_actual uuid; al uuid; al2 uuid; tp uuid; tp2 uuid; it uuid; r jsonb; q uuid; i int; d uuid;
begin
  select id into k_seg from public.knowledge_categories where slug = 'seguridad_trabajo';
  select id into k_dig from public.knowledge_categories where slug = 'seguridad_digital';
  select id into k_fin from public.knowledge_categories where slug = 'educacion_financiera';

  -- Contenido de partida (insertado directamente: lo publicado ya pasó por su propio flujo)
  insert into public.training_weeks (week_start, category_id, title, status, publish_at, created_by, updated_by)
  values (v_lunes - 14, k_dig, 'Prevención de estafas por mensaje', 'PROGRAMADO', now() - interval '14 days', a2, a2) returning id into w_pasada;
  insert into public.training_weeks (week_start, category_id, title, status, created_by, updated_by)
  values (v_lunes + 7, k_seg, 'Pausas activas en ruta', 'BORRADOR', a2, a2) returning id into w_actual;
  perform pg_temp.como(a2);
  al := public.fn_admin_alerta_guardar(jsonb_build_object('category_id', k_dig, 'prioridad', 'ALTA', 'titulo', 'Mensajes falsos de bancos', 'descripcion', 'Descripción de la alerta', 'riesgo', 'Riesgo',
          'recomendaciones', jsonb_build_array('No abra enlaces'), 'fuente', 'Entidad', 'vence', now() + interval '10 days', 'areas', jsonb_build_array('T_PRUEBA_UNO')));
  al2 := public.fn_admin_alerta_guardar(jsonb_build_object('category_id', k_dig, 'prioridad', 'ALTA', 'titulo', 'Borrador sin aprobar', 'fuente', 'Entidad'));
  perform public.fn_admin_alerta_enviar(al);
  tp := public.fn_admin_consejo_guardar(jsonb_build_object('category_id', k_dig, 'titulo', 'Revise el remitente', 'texto', 'Antes de responder, revise quién envía', 'fuente', 'Manual'));
  perform public.fn_admin_consejo_enviar(tp);
  tp2 := public.fn_admin_consejo_guardar(jsonb_build_object('category_id', k_dig, 'titulo', 'Consejo en borrador', 'texto', 'Todavía no aprobado', 'fuente', 'Manual'));
  perform pg_temp.como(a1);
  perform public.fn_admin_alerta_aprobar(al, (public.fn_admin_alerta(al) ->> 'editado')::timestamptz, true);
  perform public.fn_admin_consejo_aprobar(tp, (public.fn_admin_consejo(tp) ->> 'editado')::timestamptz);

  -- K1 · Permisos y validaciones de campaña
  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_campanas()', 'NO_AUTORIZADO', 'K1 colaborador no gestiona campañas');
  perform pg_temp.como(s1);
  perform pg_temp.falla(format('select public.fn_campana_guardar(%L)', jsonb_build_object('nombre', 'X', 'desde', v_hoy, 'hasta', v_hoy)), 'NO_AUTORIZADO', 'K1 supervisor tampoco');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_campana_guardar(%L)', jsonb_build_object('nombre', 'Mes de la seguridad digital', 'desde', v_hoy, 'hasta', v_hoy - 1)), 'VALIDACION', 'K1 fin antes del inicio');
  perform pg_temp.falla(format('select public.fn_campana_guardar(%L)', jsonb_build_object('nombre', 'Muy larga', 'desde', v_hoy, 'hasta', v_hoy + 400)), 'VALIDACION', 'K1 máximo un año');
  camp := public.fn_campana_guardar(jsonb_build_object('nombre', 'Mes de la seguridad digital', 'descripcion', 'Cuídese de las estafas', 'category_id', k_dig, 'desde', v_hoy - 3, 'hasta', v_hoy + 20));

  -- K2 · Elementos: se agregan sin cambiar su estado
  perform public.fn_campana_agregar(camp, 'alerta', al);
  perform public.fn_campana_agregar(camp, 'alerta', al2);
  perform public.fn_campana_agregar(camp, 'consejo', tp);
  perform public.fn_campana_agregar(camp, 'consejo', tp2);
  it := public.fn_campana_agregar(camp, 'semana', w_pasada);
  perform pg_temp.falla(format('select public.fn_campana_agregar(%L, ''alerta'', %L)', camp, al), 'VALIDACION', 'K2 sin elementos repetidos');
  perform pg_temp.falla(format('select public.fn_campana_agregar(%L, ''consejo'', %L)', camp, gen_random_uuid()), 'NO_ENCONTRADO', 'K2 el elemento debe existir');
  perform pg_temp.falla(format('select public.fn_campana_agregar(%L, ''video'', %L)', camp, al), 'VALIDACION', 'K2 tipo conocido');
  r := public.fn_campana(camp);
  perform pg_temp.ok(jsonb_array_length(r -> 'elementos') = 5 and public.fn_admin_alerta(al2) ->> 'estado' = 'BORRADOR' and public.fn_admin_consejo(tp2) ->> 'estado' = 'BORRADOR', 'K2 agregar no publica nada');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(r -> 'candidatos') x where (x ->> 'ref')::uuid in (al, tp)) and exists (select 1 from jsonb_array_elements(r -> 'candidatos') x where (x ->> 'ref')::uuid = w_actual), 'K2 candidatos sin los ya agregados');

  -- K3 · Visibilidad para colaboradores
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_campanas_activas() = '[]'::jsonb, 'K3 sin aprobar no se ve');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_campana_visible(%L, true)', camp), 'VALIDACION', 'K3 quien la editó no la hace visible (cuatro ojos)');
  perform pg_temp.como(s1);
  perform pg_temp.falla(format('select public.fn_campana_visible(%L, true)', camp), 'NO_AUTORIZADO', 'K3 sin permiso de aprobar no se hace visible');
  perform pg_temp.como(a1);
  perform public.fn_campana_visible(camp, true);
  perform pg_temp.como(c1);
  r := public.fn_campanas_activas();
  perform pg_temp.ok(jsonb_array_length(r) = 1 and jsonb_array_length(r #> '{0,elementos}') = 3, 'K3 su área ve 3 elementos: alerta, consejo y semana publicados');
  perform pg_temp.ok(r::text not like '%Borrador sin aprobar%' and r::text not like '%Consejo en borrador%', 'K3 lo no aprobado nunca aparece');
  perform pg_temp.como(c2);
  r := public.fn_campanas_activas();
  perform pg_temp.ok(jsonb_array_length(r #> '{0,elementos}') = 2 and r::text not like '%Mensajes falsos%', 'K3 otra área no ve la alerta de un área ajena');
  perform pg_temp.como(a2);
  perform public.fn_campana_guardar(jsonb_build_object('id', camp, 'nombre', 'Mes de la seguridad digital', 'descripcion', 'Texto cambiado', 'category_id', k_dig, 'desde', v_hoy - 3, 'hasta', v_hoy + 20));
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_campanas_activas() = '[]'::jsonb, 'K3 editar el texto la oculta hasta aprobarla de nuevo');
  perform pg_temp.como(a1);
  perform public.fn_campana_visible(camp, true);
  perform pg_temp.como(a2);
  perform public.fn_campana_guardar(jsonb_build_object('id', camp, 'nombre', 'Mes de la seguridad digital', 'descripcion', 'Texto cambiado', 'category_id', k_seg, 'desde', v_hoy - 3, 'hasta', v_hoy + 20));
  perform pg_temp.ok((public.fn_campana(camp) ->> 'visible')::boolean, 'K3 cambiar solo la categoría no la oculta');
  perform public.fn_campana_quitar(it);
  perform pg_temp.ok(jsonb_array_length(public.fn_campana(camp) -> 'elementos') = 4, 'K3 quitar un elemento');
  d := public.fn_campana_guardar(jsonb_build_object('nombre', 'Campaña futura', 'desde', v_hoy + 30, 'hasta', v_hoy + 40));
  perform public.fn_campana_agregar(d, 'consejo', tp);
  perform pg_temp.como(a1);
  perform public.fn_campana_visible(d, true);
  perform pg_temp.como(c1);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.fn_campanas_activas()) x where (x ->> 'id')::uuid = d), 'K3 una campaña futura no se ve todavía');
  perform pg_temp.como(a2);
  perform public.fn_campana_archivar(camp);
  perform pg_temp.falla(format('select public.fn_campana_agregar(%L, ''semana'', %L)', camp, w_actual), 'VALIDACION', 'K3 archivada no recibe elementos');
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_campanas_activas() = '[]'::jsonb, 'K3 archivada deja de verse');

  -- K4 · Calendario: plan, semana real, rotación y avisos
  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_calendario()', 'NO_AUTORIZADO', 'K4 colaborador no ve el calendario');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_calendario_guardar(%L, %L)', v_lunes + 1, '{}'), 'VALIDACION', 'K4 la semana empieza un lunes');
  perform public.fn_calendario_guardar(v_lunes, jsonb_build_object('category_id', k_dig, 'tema', 'Estafas por mensaje de texto'));
  perform public.fn_calendario_guardar(v_lunes + 14, jsonb_build_object('category_id', k_seg, 'tema', 'Uso del cinturón'));
  r := public.fn_calendario(v_lunes - 7, 8);
  perform pg_temp.ok(jsonb_array_length(r -> 'semanas') = 8 and (r #>> '{semanas,0,lunes}')::date = v_lunes - 7, 'K4 8 semanas desde el lunes pedido');
  perform pg_temp.ok(r #>> '{semanas,1,plan,tema}' = 'Estafas por mensaje de texto' and r #>> '{semanas,2,semana,titulo}' = 'Pausas activas en ruta', 'K4 plan y semana real en su lugar');
  perform pg_temp.ok(r #>> '{semanas,1,avisos}' like '%Tema parecido a «Prevención de estafas por mensaje»%', 'K4 avisa un tema parecido de las últimas semanas');
  perform pg_temp.ok(r #>> '{semanas,3,avisos}' like '%Misma categoría%', 'K4 avisa la misma categoría dos semanas seguidas');
  perform pg_temp.ok(r #> '{semanas,4,rotacion,categoria}' is not null, 'K4 sugiere la categoría según la rotación');
  perform pg_temp.ok(jsonb_array_length(r #> '{semanas,1,campanas}') = 0, 'K4 las campañas archivadas no salen en el calendario');
  perform public.fn_calendario_guardar(v_lunes + 14, '{}');
  perform pg_temp.ok(public.fn_calendario(v_lunes + 14, 1) #> '{semanas,0,plan}' = 'null'::jsonb, 'K4 vaciar la semana borra el plan');
  perform pg_temp.falla(format('select public.fn_calendario(%L, 30)', v_lunes), 'VALIDACION', 'K4 máximo 26 semanas');

  -- K5 · Rotación configurable
  perform pg_temp.falla(format('select public.fn_calendario_configurar(%L, 3)', array[k_fin, k_fin]), 'VALIDACION', 'K5 sin categorías repetidas');
  perform pg_temp.falla(format('select public.fn_calendario_configurar(%L, 0)', array[k_fin]), 'VALIDACION', 'K5 meses válidos');
  perform public.fn_calendario_configurar(array[k_fin, k_seg], 6);
  r := public.fn_calendario(v_lunes, 2);
  perform pg_temp.ok((r ->> 'repeticion_meses')::int = 6 and (r #>> '{semanas,0,rotacion,category_id}')::uuid in (k_fin, k_seg)
                     and r #>> '{semanas,0,rotacion,category_id}' <> r #>> '{semanas,1,rotacion,category_id}', 'K5 la rotación alterna las categorías elegidas');

  -- K6 · Catálogo de temas y sugerencias (sin IA)
  perform public.fn_tema_guardar(jsonb_build_object('category_id', k_dig, 'titulo', 'Estafas por mensaje'));
  perform public.fn_tema_guardar(jsonb_build_object('category_id', k_dig, 'titulo', 'Contraseñas seguras'));
  perform pg_temp.falla(format('select public.fn_tema_guardar(%L)', jsonb_build_object('category_id', k_dig, 'titulo', 'contraseñas SEGURAS')), 'VALIDACION', 'K6 sin temas repetidos');
  r := public.fn_calendario_sugerencias(k_dig);
  perform pg_temp.ok(jsonb_array_length(r -> 'temas') = 1 and r #>> '{temas,0,titulo}' = 'Contraseñas seguras', 'K6 sugiere solo temas no usados en 6 meses');
  -- Preguntas con más errores: 6 respuestas oficiales a una pregunta de la semana pasada, 1 correcta
  perform pg_temp.yo();
  insert into public.capsules (week_id, day_number, title) values (w_pasada, 1, 'Cápsula') returning id into d;
  insert into public.capsule_questions (capsule_id, position, prompt) values (d, 1, '¿Qué hace ante un enlace desconocido?') returning id into q;
  insert into public.question_options (question_id, position, label) values (q, 1, 'Lo abro'), (q, 2, 'No lo abro');
  for i in 1..6 loop
    with a as (insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, total, idempotency_key)
               values (d, w_pasada, (array[c1, c2, s1, a1, a2, c1])[i], case when i = 6 then 'PRACTICA' else 'OFICIAL' end, 0, 1, gen_random_uuid()) returning id)
    insert into public.attempt_answers (attempt_id, question_id, selected_option_id, is_correct)
    select a.id, q, (select id from public.question_options where question_id = q and position = case when i = 1 then 2 else 1 end), i = 1 from a;
  end loop;
  perform pg_temp.como(a2);
  r := public.fn_calendario_sugerencias(k_dig);
  perform pg_temp.ok(jsonb_array_length(r -> 'errores') = 1 and (r #>> '{errores,0,aciertos}')::int = 20 and (r #>> '{errores,0,respuestas}')::int = 5, 'K6 preguntas con más errores (solo oficiales, mínimo 5)');
  perform pg_temp.ok(jsonb_array_length(public.fn_temas(k_dig)) = 2, 'K6 catálogo de temas');

  -- K7 · Acceso directo y anónimo
  perform pg_temp.falla('select count(*) from public.campaigns', '42501', 'K7 campañas solo por RPC');
  perform pg_temp.falla('select count(*) from public.editorial_plan', '42501', 'K7 calendario solo por RPC');
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_campanas_activas()', '42501', 'K7 anónimo no ve campañas');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.audit_logs where action like 'CAMPANA%' or action like 'CALENDARIO%') >= 10, 'K7 todo auditado');

  raise notice '== Pruebas de campañas y calendario: todas correctas (% comprobaciones) ==', current_setting('t360.n', true);
end $$;

rollback;
