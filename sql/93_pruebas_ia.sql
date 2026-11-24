-- =============================================================================
-- TRANSPORTES 360 · 93_pruebas_ia.sql  (iteración 5: generador con IA). NO llama a ningún proveedor.
-- Datos ficticios (solo identificadores 00000000-…). Termina en ROLLBACK (en Supabase: con un error final a propósito).
-- =============================================================================
begin;

create function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated')::text end, true);
  if p is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;
create function pg_temp.servidor() returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', '', true); execute 'set local role service_role'; end $$;
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

create function pg_temp.pedido(p_tipo text, p_prov text default 'anthropic', p_modelo text default 'claude-opus-5-5') returns jsonb language sql as $$
  select jsonb_build_object('tipo', p_tipo, 'category_id', (select id from public.knowledge_categories where slug = 'seguridad_digital'), 'tema', 'Mensajes falsos en el teléfono', 'proveedor', p_prov, 'modelo', p_modelo)
$$;
create function pg_temp.plan() returns jsonb language sql as $$
  select jsonb_build_object('titulo', 'Mensajes falsos', 'objetivo', 'Reconocer mensajes falsos', 'capsulas',
    (select jsonb_agg(jsonb_build_object('dia', d, 'titulo', 'Cápsula ' || d, 'objetivo', 'Objetivo ' || d, 'enfoque', 'Enfoque del día ' || d)) from generate_series(1, 5) d))
$$;
create function pg_temp.capsula(d int) returns jsonb language sql as $$
  select jsonb_build_object('titulo', 'Cápsula ' || d, 'objetivo', 'Objetivo ' || d, 'minutos', 4,
    'bloques', jsonb_build_array(
      '{"tipo":"portada","titulo":"Portada","objetivo":"Qué va a aprender"}'::jsonb,
      '{"tipo":"escenario","remitente":"","mensaje":"Le llega un mensaje","pregunta":"¿Qué haría usted?","opciones":[{"t":"Ignorar","segura":true,"reaccion":"Bien"},{"t":"Abrir","segura":false,"reaccion":"Riesgo"}]}'::jsonb,
      '{"tipo":"detecta","titulo":"Señales","remitente":"Banco","partes":[{"t":"Hola","senal":""},{"t":"Urgente","senal":"Presión"},{"t":"Abra","senal":"Enlace"}],"cierre":""}'::jsonb,
      '{"tipo":"compromiso","cierre":"Cuídese siempre","opciones":["Verificar","Reportar"]}'::jsonb),
    'preguntas', (select jsonb_agg(jsonb_build_object('texto', 'Pregunta ' || d || '.' || n, 'opciones', jsonb_build_array('Opción A', 'Opción B larga', 'Opción C'), 'correcta', 1, 'explicacion', 'Porque sí', 'retro', 'Revise')) from generate_series(1, 2) n))
$$;
create function pg_temp.bien(p_salida jsonb, p_in int default 3000, p_out int default 5000) returns jsonb language sql as $$
  select jsonb_build_object('salida', p_salida, 'input_tokens', p_in, 'output_tokens', p_out, 'stop_reason', 'end_turn')
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin3@t360.test',    '{"role":"ADMIN","full_name":"Aldo Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'k-50@colaboradores.t360.invalid', '{"role":"SUPERVISOR","employee_code":"K-50","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'k-1@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-1","full_name":"Colaborador Uno"}');
update public.profiles set is_active = (id::text like '00000000-0000-0000-0000-0000000000%');

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2'; a3 uuid := '00000000-0000-0000-0000-0000000000a3';
  s1 uuid := '00000000-0000-0000-0000-0000000000b1'; c1 uuid := '00000000-0000-0000-0000-0000000000c1';
  v_lunes date := date_trunc('week', app.hoy_cr())::date + 70; clave uuid := gen_random_uuid();
  j uuid; k uuid; r jsonb; q jsonb; v_sem uuid; d int; g0 numeric;
begin
  -- G1 · Permisos, apagada por defecto, parámetros
  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_ia_estado()', 'NO_AUTORIZADO', 'G1 colaborador no usa la IA');
  perform pg_temp.como(s1);
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip'), clave), 'NO_AUTORIZADO', 'G1 supervisor tampoco');
  perform pg_temp.como(a2);
  r := public.fn_ia_estado();
  perform pg_temp.ok(not (r ->> 'encendida')::boolean and r::text not like '%API_KEY%', 'G1 apagada por defecto y sin nombres de secretos');
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip'), clave), 'VALIDACION', 'G1 apagada: no acepta solicitudes con costo');
  perform pg_temp.falla('select public.fn_ia_configurar(''{"encendida": true}'')', 'NO_AUTORIZADO', 'G1 solo el principal la enciende');
  perform pg_temp.como(a1);
  perform pg_temp.falla('select public.fn_ia_configurar(''{"mes_usd": 9999}'')', 'VALIDACION', 'G1 tope razonable');
  perform pg_temp.falla('select public.fn_ia_configurar(''{"modelo": {"proveedor": "anthropic", "modelo": "claude-opus-5-5", "salida": 0}}'')', 'VALIDACION', 'G1 el precio no puede ser cero');
  perform public.fn_ia_configurar('{"encendida": true, "mes_usd": 10, "dia_trabajos": 6}');

  -- G2 · Solicitud: validaciones, datos personales, idempotencia
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip') || '{"instrucciones": "Escriba a juan@correo.com"}', clave), 'VALIDACION', 'G2 rechaza correos');
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip') || '{"instrucciones": "Llame al 8888-7777"}', clave), 'VALIDACION', 'G2 rechaza teléfonos');
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip') || '{"tema": "x"}', clave), 'VALIDACION', 'G2 exige tema');
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip', 'openai', 'cualquiera'), clave), 'VALIDACION', 'G2 modelo habilitado');
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('libro'), clave), 'VALIDACION', 'G2 tipo conocido');
  r := public.fn_ia_solicitar(pg_temp.pedido('weekly_training'), clave);
  j := (r ->> 'id')::uuid;
  perform pg_temp.ok((r ->> 'maximo_usd')::numeric = round(6 * 12000 * 4 / 1000000.0 + (8000 + 5 * 16000) * 20 / 1000000.0, 4), 'G2 costo máximo calculado: ' || (r ->> 'maximo_usd'));
  perform pg_temp.ok((public.fn_ia_solicitar(pg_temp.pedido('weekly_training'), clave) ->> 'id')::uuid = j, 'G2 la misma clave no duplica');
  perform pg_temp.falla(format('select public.fn_srv_ia_paso_iniciar(%L, %L)', j, a2), '42501', 'G2 los pasos solo los ejecuta el servidor');

  -- G3 · Pasos: orden, uno a la vez, reserva, costo real, reintento
  perform pg_temp.servidor();
  perform pg_temp.falla(format('select public.fn_srv_ia_paso_iniciar(%L, %L)', j, a3), 'NO_AUTORIZADO', 'G3 otro usuario no avanza la solicitud');
  r := public.fn_srv_ia_paso_iniciar(j, a2);
  perform pg_temp.ok(r ->> 'paso' = 'plan' and (r ->> 'max_tokens')::int = 8000 and r ->> 'modelo' = 'claude-opus-5-5', 'G3 empieza por el plan');
  perform pg_temp.falla(format('select public.fn_srv_ia_paso_iniciar(%L, %L)', j, a2), 'VALIDACION', 'G3 un paso a la vez');
  perform pg_temp.yo();
  perform pg_temp.ok(app.ia_gasto_mes() = 0.2080, 'G3 la reserva cuenta en el tope: ' || app.ia_gasto_mes());
  perform pg_temp.servidor();
  q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien(pg_temp.plan() || '{"titulo": "Vea https://inventado.com"}', 1000, 2000));
  perform pg_temp.ok(not (q ->> 'ok')::boolean and (q ->> 'costo_usd')::numeric = 0.0440 and q ->> 'estado' = 'EN_GENERACION', 'G3 enlace inventado: se rechaza, cuesta lo real y se puede reintentar');
  perform pg_temp.falla(format('select public.fn_srv_ia_paso_terminar(%L, %L)', r ->> 'paso_id', pg_temp.bien(pg_temp.plan())), 'VALIDACION', 'G3 un paso cerrado no se reescribe');
  r := public.fn_srv_ia_paso_iniciar(j, a2);
  perform pg_temp.ok((r ->> 'intento')::int = 2 and r ->> 'error_anterior' like '%enlaces%', 'G3 el reintento conoce el error anterior');
  q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien(pg_temp.plan()));
  perform pg_temp.ok((q ->> 'ok')::boolean, 'G3 plan correcto');
  r := public.fn_srv_ia_paso_iniciar(j, a2);
  perform pg_temp.ok(r ->> 'paso' = 'dia1' and r #>> '{plan,titulo}' = 'Mensajes falsos', 'G3 la cápsula 1 recibe el plan');
  q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, '{"error": "Corte de red"}');
  perform pg_temp.ok((q ->> 'costo_usd')::numeric = 0.3680, 'G3 sin datos de consumo se cuenta la reserva completa');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_ia_convertir(%L, %L)', j, v_lunes), 'VALIDACION', 'G3 incompleta no se convierte');
  perform pg_temp.servidor();
  for d in 1..5 loop
    r := public.fn_srv_ia_paso_iniciar(j, a2);
    q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien(pg_temp.capsula(d)));
  end loop;
  perform pg_temp.ok(q ->> 'estado' = 'GENERADO' and jsonb_array_length(r -> 'preguntas_previas') = 8, 'G3 completa; la última conoce las 8 preguntas anteriores');
  perform pg_temp.ok((public.fn_srv_ia_paso_iniciar(j, a2) ->> 'terminado')::boolean, 'G3 no se repite lo ya generado');

  -- G4 · Conversión a borrador
  perform pg_temp.como(a2);
  r := public.fn_ia_trabajo(j);
  perform pg_temp.ok(r #>> '{informe,advertencias}' like '%misma posición%' and r #>> '{informe,advertencias}' like '%más larga%' and r #>> '{informe,advertencias}' like '%fuente%', 'G4 informe con advertencias para el revisor');
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_ia_convertir(%L, %L)', j, v_lunes), 'NO_AUTORIZADO', 'G4 solo quien la pidió la convierte');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_ia_convertir(%L)', j), 'VALIDACION', 'G4 exige la semana');
  r := public.fn_ia_convertir(j, v_lunes);
  v_sem := (r ->> 'id')::uuid;
  perform pg_temp.ok((public.fn_ia_convertir(j, v_lunes) ->> 'id')::uuid = v_sem, 'G4 convertir dos veces no duplica');
  q := public.fn_admin_semana(v_sem);
  perform pg_temp.ok(q ->> 'estado' = 'BORRADOR' and jsonb_array_length(q -> 'capsulas') = 5 and (q #>> '{capsulas,4,preguntas,1,correcta}')::int = 1, 'G4 crea un BORRADOR completo');
  perform pg_temp.ok(q #>> '{capsulas,0,bloques,3,fuente}' = '' and q #>> '{capsulas,0,bloques,0,imagen}' = '', 'G4 sin fuentes ni imágenes inventadas');
  perform public.fn_admin_semana_enviar(v_sem);
  perform pg_temp.falla(format('select public.fn_admin_semana_aprobar(%L)', v_sem), 'VALIDACION', 'G4 quien la pidió no la aprueba');
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_semana_actual() is null or (public.fn_semana_actual() ->> 'id')::uuid <> v_sem, 'G4 nada queda publicado');

  -- G5 · Alerta y consejo: la fuente la pone una persona
  perform pg_temp.como(a2);
  k := (public.fn_ia_solicitar(pg_temp.pedido('alert'), gen_random_uuid()) ->> 'id')::uuid;
  perform pg_temp.servidor();
  r := public.fn_srv_ia_paso_iniciar(k, a2);
  perform public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien('{"titulo":"Alerta de prueba","descripcion":"Descripción de prueba","riesgo":"Riesgo","recomendaciones":["Haga esto"]}'));
  perform pg_temp.como(a2);
  r := public.fn_ia_convertir(k);
  perform pg_temp.falla(format('select public.fn_admin_alerta_enviar(%L)', r ->> 'id'), 'VALIDACION', 'G5 la alerta de la IA no se envía sin fuente');
  perform pg_temp.ok(public.fn_admin_alerta((r ->> 'id')::uuid) ->> 'prioridad' = 'PREVENTIVA', 'G5 la IA no decide prioridades altas');

  -- G6 · Simulación: funciona apagada, no cuesta y no se convierte
  perform pg_temp.como(a1);
  perform public.fn_ia_configurar('{"encendida": false}');
  perform pg_temp.como(a2);
  k := (public.fn_ia_solicitar(pg_temp.pedido('tip', 'simulado', 'simulado'), gen_random_uuid()) ->> 'id')::uuid;
  perform pg_temp.yo(); g0 := app.ia_gasto_mes(); perform pg_temp.servidor();
  r := public.fn_srv_ia_paso_iniciar(k, a2);
  q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien('{"titulo":"Consejo","texto":"Texto de ejemplo suficiente","compartir":""}'));
  perform pg_temp.ok(q ->> 'estado' = 'GENERADO' and (q ->> 'costo_usd')::numeric = 0, 'G6 simulación sin costo');
  perform pg_temp.yo(); perform pg_temp.ok(app.ia_gasto_mes() = g0, 'G6 no suma al gasto');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_ia_convertir(%L)', k), 'VALIDACION', 'G6 una simulación no se convierte en contenido');

  -- G7 · Apagar a mitad, tope mensual, límite diario, fallos y cancelación
  perform pg_temp.como(a1);
  perform public.fn_ia_configurar('{"encendida": true}');
  perform pg_temp.como(a2);
  k := (public.fn_ia_solicitar(pg_temp.pedido('tip'), gen_random_uuid()) ->> 'id')::uuid;
  perform pg_temp.como(a1);
  perform public.fn_ia_configurar('{"encendida": false}');
  perform pg_temp.servidor();
  perform pg_temp.falla(format('select public.fn_srv_ia_paso_iniciar(%L, %L)', k, a2), 'VALIDACION', 'G7 apagar detiene lo pendiente');
  perform pg_temp.como(a1);
  perform public.fn_ia_configurar('{"encendida": true, "mes_usd": 1}');
  perform pg_temp.servidor();
  perform pg_temp.falla(format('select public.fn_srv_ia_paso_iniciar(%L, %L)', k, a2), 'VALIDACION', 'G7 el tope mensual bloquea antes de gastar');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('weekly_training'), gen_random_uuid()), 'VALIDACION', 'G7 no acepta lo que no cabe en el tope');
  perform pg_temp.como(a1);
  perform public.fn_ia_configurar('{"mes_usd": 50}');
  perform pg_temp.servidor();
  r := public.fn_srv_ia_paso_iniciar(k, a2);
  q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, '{"error": "Clave no configurada", "sin_cobro": true, "definitivo": true}');
  perform pg_temp.ok(q ->> 'estado' = 'FALLIDO' and (q ->> 'costo_usd')::numeric = 0, 'G7 un fallo previo a la llamada no cuesta y cierra la solicitud');
  perform pg_temp.como(a2);
  k := (public.fn_ia_solicitar(pg_temp.pedido('tip'), gen_random_uuid()) ->> 'id')::uuid;
  perform pg_temp.servidor();
  for d in 1..3 loop
    r := public.fn_srv_ia_paso_iniciar(k, a2);
    q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien('{"titulo":"x"}'));
  end loop;
  perform pg_temp.ok(q ->> 'estado' = 'FALLIDO', 'G7 tres intentos como máximo');
  perform pg_temp.como(a2);
  k := (public.fn_ia_solicitar(pg_temp.pedido('tip'), gen_random_uuid()) ->> 'id')::uuid;
  perform pg_temp.falla(format('select public.fn_ia_solicitar(%L, %L)', pg_temp.pedido('tip'), gen_random_uuid()), 'VALIDACION', 'G7 límite diario');
  perform pg_temp.servidor();
  r := public.fn_srv_ia_paso_iniciar(k, a2);
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_ia_cancelar(%L)', k), 'NO_AUTORIZADO', 'G7 otro administrador no la cancela');
  perform pg_temp.como(a2);
  perform public.fn_ia_cancelar(k);
  perform pg_temp.servidor();
  q := public.fn_srv_ia_paso_terminar((r ->> 'paso_id')::uuid, pg_temp.bien('{"titulo":"Consejo","texto":"Texto de ejemplo suficiente","compartir":""}'));
  perform pg_temp.ok(q ->> 'estado' = 'CANCELADO' and (q ->> 'costo_usd')::numeric > 0, 'G7 lo cancelado no revive, pero el costo se registra');
  perform pg_temp.yo();
  insert into public.generation_jobs (id, content_type, payload, category_id, provider_id, model_id, idempotency_key, requested_by, status)
    select '00000000-0000-0000-0000-00000000f001', 'tip', '{"tema":"x"}', category_id, 'anthropic', 'claude-sonnet-5-5', gen_random_uuid(), a2, 'EN_GENERACION' from public.generation_jobs where id = k;
  insert into public.generation_steps (job_id, step, attempt, reserved_usd, started_at) values ('00000000-0000-0000-0000-00000000f001', 'consejo', 1, 0.06, now() - interval '5 minutes');
  perform pg_temp.servidor();
  r := public.fn_srv_ia_paso_iniciar('00000000-0000-0000-0000-00000000f001', a2);
  perform pg_temp.yo();
  perform pg_temp.ok((r ->> 'intento')::int = 2 and (select status = 'FALLIDO' and cost_estimated and cost_usd = 0.06 from public.generation_steps where job_id = '00000000-0000-0000-0000-00000000f001' and attempt = 1), 'G7 un paso colgado se cierra contando su reserva');

  -- G8 · Validador
  perform pg_temp.ok(app.ia_validar('dia1', pg_temp.capsula(1)) = '{}', 'G8 cápsula correcta');
  perform pg_temp.ok(app.ia_validar('dia1', null) <> '{}' and app.ia_validar('dia1', '[]') <> '{}' and app.ia_validar('dia1', '{"bloques":"x","preguntas":3}') <> '{}', 'G8 estructuras absurdas no rompen el validador');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{preguntas,0,correcta}', '3')) <> '{}', 'G8 respuesta correcta inexistente');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{preguntas,0,opciones}', '["Igual","igual ","Otra"]')) <> '{}', 'G8 opciones repetidas');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{preguntas}', (pg_temp.capsula(1) -> 'preguntas') - 1)) <> '{}', 'G8 exactamente 2 preguntas');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{bloques,1,opciones,1,segura}', 'true')) <> '{}', 'G8 escenario sin opción riesgosa');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{bloques,2,partes,1,senal}', '""')) <> '{}', 'G8 detecta con una sola señal');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{bloques,1,tipo}', '"html"')) <> '{}', 'G8 tipo de tarjeta no permitido');
  perform pg_temp.ok(app.ia_validar('dia1', jsonb_set(pg_temp.capsula(1), '{bloques,0,tipo}', '"texto"')) <> '{}', 'G8 la portada va primero');
  perform pg_temp.ok(app.ia_validar('plan', jsonb_set(pg_temp.plan(), '{capsulas}', (pg_temp.plan() -> 'capsulas') - 4)) <> '{}', 'G8 plan con 4 cápsulas');
  perform pg_temp.ok(app.ia_validar('consejo', jsonb_build_object('titulo', 'Título', 'texto', repeat('x', 601), 'compartir', '')) <> '{}', 'G8 consejo muy largo');

  -- G9 · Tema repetido y acceso directo
  perform pg_temp.como(a2);
  perform pg_temp.ok(jsonb_array_length(public.fn_ia_tema_repetido('Los mensajes falsos')) = 1 and public.fn_ia_tema_repetido('Presupuesto familiar') = '[]'::jsonb, 'G9 avisa temas parecidos');
  perform pg_temp.falla('select * from public.generation_jobs', '42501', 'G9 trabajos solo por RPC');
  perform pg_temp.falla('select * from public.generation_steps', '42501', 'G9 pasos solo por RPC');
  perform pg_temp.falla('select * from public.ai_providers', '42501', 'G9 proveedores solo por RPC');
  perform pg_temp.falla('select * from public.ai_models', '42501', 'G9 modelos solo por RPC');
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_ia_trabajos()', '42501', 'G9 anónimo no ve nada');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.audit_logs where action like 'IA\_%') >= 10, 'G9 todo auditado');

  raise notice '== Pruebas del generador con IA: todas correctas ==';
end $$;

rollback;
