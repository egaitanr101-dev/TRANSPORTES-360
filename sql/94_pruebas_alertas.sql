-- =============================================================================
-- TRANSPORTES 360 · 94_pruebas_alertas.sql  (iteración 4: ALERTAS 360 y consejos)
-- Datos ficticios (solo identificadores 00000000-…). Termina en ROLLBACK (en Supabase: con un error final a propósito).
-- Desactiva temporalmente a los usuarios reales para que no alteren los conteos ni la regla de cuatro ojos: todo se revierte.
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
    if v_hint = esperado or v_state = esperado then raise notice 'OK  % (rechazado)', msg; return; end if;
    raise exception 'FALLÓ: % → error inesperado % / % / %', msg, v_state, v_hint, v_msg;
  end;
  raise exception 'FALLÓ: % → no hubo error', msg;
end $$;
create function pg_temp.alerta(p_prioridad text, p_titulo text) returns jsonb language sql as $$
  select jsonb_build_object('category_id', (select id from public.knowledge_categories where slug = 'seguridad_digital'), 'prioridad', p_prioridad, 'titulo', p_titulo,
    'descripcion', 'Descripción de prueba de la alerta', 'riesgo', 'Riesgo de prueba', 'recomendaciones', jsonb_build_array('Haga esto', ' ', 'Evite aquello'),
    'fuente', 'Entidad de prueba', 'fuente_url', 'https://ejemplo.test/aviso', 'vence', now() + interval '10 days')
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin3@t360.test',    '{"role":"ADMIN","full_name":"Aldo Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'k-50@colaboradores.t360.invalid', '{"role":"SUPERVISOR","employee_code":"K-50","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'k-1@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-1","full_name":"Colaborador Uno"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'k-2@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-2","full_name":"Colaborador Dos"}');
insert into public.areas (id, name) values ('T_PRUEBA_UNO', 'Prueba Uno'), ('T_PRUEBA_DOS', 'Prueba Dos');
update public.profiles set is_active = (id::text like '00000000-0000-0000-0000-0000000000%');
update public.profiles set area_id = 'T_PRUEBA_UNO' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set area_id = 'T_PRUEBA_DOS' where id = '00000000-0000-0000-0000-0000000000c2';

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2'; a3 uuid := '00000000-0000-0000-0000-0000000000a3';
  s1 uuid := '00000000-0000-0000-0000-0000000000b1'; c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  x uuid; y uuid; z uuid; t uuid; t2 uuid; r jsonb; e timestamptz; f timestamptz; v_cat uuid;
begin
  select id into v_cat from public.knowledge_categories where slug = 'seguridad_digital';

  -- A1 · Permisos y borradores
  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_admin_alertas()', 'NO_AUTORIZADO', 'A1 colaborador no usa el panel');
  perform pg_temp.falla(format('select public.fn_admin_alerta_guardar(%L)', '{}'), 'NO_AUTORIZADO', 'A1 colaborador no crea alertas');
  perform pg_temp.como(s1);
  perform pg_temp.falla('select public.fn_admin_alertas()', 'NO_AUTORIZADO', 'A1 supervisor tampoco');
  perform pg_temp.como(a2);
  x := public.fn_admin_alerta_guardar(jsonb_build_object('category_id', v_cat, 'prioridad', 'ALTA', 'titulo', 'Borrador incompleto'));
  perform pg_temp.falla(format('select public.fn_admin_alerta_enviar(%L)', x), 'VALIDACION', 'A1 incompleta no se envía');
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Mensajes falsos') || jsonb_build_object('id', x, 'fuente', ''));
  perform pg_temp.falla(format('select public.fn_admin_alerta_enviar(%L)', x), 'VALIDACION', 'A1 sin fuente no se envía');
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Mensajes falsos') || jsonb_build_object('id', x, 'vence', null));
  perform pg_temp.falla(format('select public.fn_admin_alerta_enviar(%L)', x), 'VALIDACION', 'A1 sin vencimiento no se envía');
  perform pg_temp.falla(format('select public.fn_admin_alerta_guardar(%L)', pg_temp.alerta('ALTA', 'Enlace malo') || '{"fuente_url":"javascript:alert(1)"}'), '23514', 'A1 solo enlaces https');
  perform pg_temp.falla(format('select public.fn_admin_alerta_guardar(%L)', pg_temp.alerta('URGENTE', 'Prioridad mala')), '23514', 'A1 prioridad válida');
  perform pg_temp.falla(format('select public.fn_admin_alerta_guardar(%L)', pg_temp.alerta('ALTA', 'Área mala') || '{"areas":["NO_EXISTE"]}'), 'VALIDACION', 'A1 área existente');
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Mensajes falsos') || jsonb_build_object('id', x));
  r := public.fn_admin_alerta(x);
  perform pg_temp.ok(jsonb_array_length(r -> 'recomendaciones') = 2 and r ->> 'estado' = 'BORRADOR' and (r ->> 'version')::int = 1, 'A1 borrador guardado y limpio');

  -- A2 · Revisión: cuatro ojos, fuente verificada, texto leído
  perform public.fn_admin_alerta_enviar(x);
  e := (public.fn_admin_alerta(x) ->> 'editado')::timestamptz;
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, true)', x, e), 'VALIDACION', 'A2 quien editó no aprueba');
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, false)', x, e), 'VALIDACION', 'A2 exige verificar la fuente');
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, null)', x, e), 'VALIDACION', 'A2 fuente sin responder tampoco');
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, true)', x, e - interval '1 second'), 'VALIDACION', 'A2 si cambió, se vuelve a leer');
  perform pg_temp.falla(format('select public.fn_admin_alerta_devolver(%L, ''x'')', x), 'VALIDACION', 'A2 devolver exige explicación');
  perform public.fn_admin_alerta_devolver(x, 'Aclarar el riesgo');
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, true)', x, e), 'VALIDACION', 'A2 devuelta no se aprueba');
  perform public.fn_admin_alerta_enviar(x);
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_alertas() = '[]'::jsonb, 'A2 sin aprobar no es visible');
  perform pg_temp.como(a2);
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Mensajes falsos') || jsonb_build_object('id', x));
  perform pg_temp.ok(public.fn_admin_alerta(x) ->> 'estado' = 'BORRADOR', 'A2 editar durante la revisión la devuelve a borrador');
  perform public.fn_admin_alerta_enviar(x);
  perform pg_temp.como(a3);
  e := (public.fn_admin_alerta(x) ->> 'editado')::timestamptz;
  r := public.fn_admin_alerta_aprobar(x, e, true, 'Fuente revisada');
  perform pg_temp.ok(r ->> 'estado' = 'PUBLICADO' and not (r ->> 'aprobador_unico')::boolean, 'A2 otra persona aprueba');

  -- A3 · Publicada → vista → confirmada
  perform pg_temp.como(c1);
  r := public.fn_alertas();
  perform pg_temp.ok(jsonb_array_length(r) = 1 and not (r #>> '{0,vista}')::boolean and not (r #>> '{0,confirmada}')::boolean, 'A3 visible, sin vista ni confirmación');
  perform pg_temp.falla(format('select public.fn_confirmar_alerta(%L, 1)', x), 'VALIDACION', 'A3 no se confirma sin abrirla');
  r := public.fn_alerta(x);
  perform pg_temp.ok(r ->> 'riesgo' = 'Riesgo de prueba' and not (r ->> 'confirmada')::boolean, 'A3 abrirla no es confirmarla');
  perform pg_temp.ok((public.fn_alertas() #>> '{0,vista}')::boolean, 'A3 queda vista');
  perform pg_temp.falla(format('select public.fn_confirmar_alerta(%L, 2)', x), 'VALIDACION', 'A3 solo la versión vigente');
  r := public.fn_confirmar_alerta(x, 1);
  perform pg_temp.ok((r ->> 'confirmada')::boolean, 'A3 confirmada');
  perform pg_temp.ok(public.fn_confirmar_alerta(x, 1) = r, 'A3 confirmar de nuevo conserva la fecha');
  perform pg_temp.como(a2);
  r := public.fn_admin_alerta(x);
  perform pg_temp.ok((r #>> '{vigente,seguimiento,audiencia}')::int = 6 and (r #>> '{vigente,seguimiento,vistas}')::int = 1 and (r #>> '{vigente,seguimiento,confirmadas}')::int = 1
                     and jsonb_array_length(r #> '{vigente,pendientes}') = 5, 'A3 seguimiento: 1 de 6 y 5 pendientes');

  -- A4 · Evidencia e inmutabilidad
  perform pg_temp.yo();
  perform pg_temp.falla('update public.alert_publications set title = ''Otro título''', 'INMUTABLE', 'A4 lo publicado no se reescribe');
  perform pg_temp.falla('delete from public.alert_publications', 'INMUTABLE', 'A4 lo publicado no se borra');
  perform pg_temp.falla('update public.alert_acknowledgements set acknowledged_at = null', 'INMUTABLE', 'A4 la confirmación no se quita');
  perform pg_temp.falla('update public.alert_acknowledgements set acknowledged_at = now() + interval ''1 day''', 'INMUTABLE', 'A4 la fecha no se cambia');
  perform pg_temp.falla('delete from public.alert_acknowledgements', 'INMUTABLE', 'A4 la evidencia no se borra');

  -- A5 · Versión nueva: la anterior sigue visible hasta aprobar; luego exige confirmar de nuevo
  perform pg_temp.como(a2);
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Mensajes falsos, versión dos') || jsonb_build_object('id', x));
  r := public.fn_admin_alerta(x);
  perform pg_temp.ok((r ->> 'version')::int = 2 and r ->> 'estado' = 'BORRADOR' and (r #>> '{vigente,version}')::int = 1, 'A5 borrador 2, vigente 1');
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_alertas() #>> '{0,titulo}' = 'Mensajes falsos' and (public.fn_alertas() #>> '{0,confirmada}')::boolean, 'A5 el colaborador sigue viendo la aprobada');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_admin_alerta_eliminar(%L)', x), 'VALIDACION', 'A5 una alerta que fue aprobada no se elimina');
  perform public.fn_admin_alerta_enviar(x);
  perform pg_temp.como(a3);
  perform public.fn_admin_alerta_aprobar(x, (public.fn_admin_alerta(x) ->> 'editado')::timestamptz, true);
  perform pg_temp.como(c1);
  r := public.fn_alertas();
  perform pg_temp.ok((r #>> '{0,version}')::int = 2 and not (r #>> '{0,confirmada}')::boolean, 'A5 la versión 2 exige confirmar de nuevo');
  perform pg_temp.falla(format('select public.fn_confirmar_alerta(%L, 1)', x), 'VALIDACION', 'A5 la versión anterior ya no se confirma');

  -- A6 · Críticas: solo el administrador principal, aunque la nueva versión baje la prioridad
  perform pg_temp.como(a2);
  y := public.fn_admin_alerta_guardar(pg_temp.alerta('CRITICA', 'Alerta crítica'));
  perform public.fn_admin_alerta_enviar(y);
  perform pg_temp.como(a3);
  e := (public.fn_admin_alerta(y) ->> 'editado')::timestamptz;
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, true)', y, e), 'NO_AUTORIZADO', 'A6 un administrador no aprueba una crítica');
  perform pg_temp.como(a1);
  r := public.fn_admin_alerta_aprobar(y, e, true);
  perform pg_temp.ok(not (r ->> 'aprobador_unico')::boolean, 'A6 la aprueba el principal');
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_alertas() #>> '{0,prioridad}' = 'CRITICA', 'A6 la crítica va primero');
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_admin_alerta_archivar(%L, ''Ya no aplica'')', y), 'NO_AUTORIZADO', 'A6 un administrador no retira una crítica vigente');
  perform pg_temp.como(a2);
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('INFORMATIVA', 'Alerta crítica rebajada') || jsonb_build_object('id', y));
  perform public.fn_admin_alerta_enviar(y);
  perform pg_temp.como(a3);
  e := (public.fn_admin_alerta(y) ->> 'editado')::timestamptz;
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, true)', y, e), 'NO_AUTORIZADO', 'A6 bajar la prioridad no evita al principal');
  perform pg_temp.como(a1);
  z := public.fn_admin_alerta_guardar(pg_temp.alerta('CRITICA', 'Crítica del principal'));
  perform public.fn_admin_alerta_enviar(z);
  r := public.fn_admin_alerta_aprobar(z, (public.fn_admin_alerta(z) ->> 'editado')::timestamptz, true);
  perform pg_temp.ok((r ->> 'aprobador_unico')::boolean, 'A6 único que puede aprobar críticas: permitido y marcado');
  perform public.fn_admin_alerta_archivar(z, 'Fin de la prueba');
  perform pg_temp.como(a2);
  z := public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Editada por dos'));
  perform pg_temp.como(a3);
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('ALTA', 'Editada por dos') || jsonb_build_object('id', z));
  perform public.fn_admin_alerta_enviar(z);
  perform pg_temp.como(a2);
  e := (public.fn_admin_alerta(z) ->> 'editado')::timestamptz;
  perform pg_temp.falla(format('select public.fn_admin_alerta_aprobar(%L, %L, true)', z, e), 'VALIDACION', 'A6 tampoco aprueba quien la editó antes');

  -- A7 · Audiencia por área, programación, vencimiento y retiro
  perform pg_temp.como(a2);
  z := public.fn_admin_alerta_guardar(pg_temp.alerta('PREVENTIVA', 'Solo área uno') || '{"areas":["T_PRUEBA_UNO"]}');
  perform public.fn_admin_alerta_enviar(z);
  perform pg_temp.como(a3);
  perform public.fn_admin_alerta_aprobar(z, (public.fn_admin_alerta(z) ->> 'editado')::timestamptz, true);
  r := public.fn_admin_alerta(z);
  perform pg_temp.ok((r #>> '{vigente,seguimiento,audiencia}')::int = 1, 'A7 audiencia de un área');
  perform pg_temp.como(c1);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.fn_alertas()) q where q ->> 'titulo' = 'Solo área uno'), 'A7 su área la ve');
  perform pg_temp.como(c2);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.fn_alertas()) q where q ->> 'titulo' = 'Solo área uno'), 'A7 otra área no la ve');
  perform pg_temp.falla(format('select public.fn_alerta(%L)', z), 'NO_ENCONTRADO', 'A7 ni con el enlace directo');
  perform pg_temp.como(a2);
  perform public.fn_admin_alerta_guardar(pg_temp.alerta('PREVENTIVA', 'Solo área uno, futura') || jsonb_build_object('id', z, 'areas', jsonb_build_array('T_PRUEBA_UNO'), 'publica', now() + interval '2 days'));
  perform public.fn_admin_alerta_enviar(z);
  perform pg_temp.como(a3);
  perform public.fn_admin_alerta_aprobar(z, (public.fn_admin_alerta(z) ->> 'editado')::timestamptz, true);
  perform pg_temp.como(c1);
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.fn_alertas()) q where q ->> 'titulo' = 'Solo área uno'), 'A7 la versión programada no reemplaza antes de su fecha');
  perform pg_temp.yo();
  insert into public.alert_publications (alert_id, version, category_id, priority, title, description, risk, recommendations, source, publish_at, expires_at, approved_by)
  values (z, 99, v_cat, 'ALTA', 'Vencida', 'd', 'r', '["a"]', 'f', now() - interval '2 days', now() - interval '1 day', a1);
  perform pg_temp.como(c1);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.fn_alertas()) q where (q ->> 'id')::uuid = z), 'A7 vencida deja de mostrarse y no revive la anterior');
  perform pg_temp.falla(format('select public.fn_alerta(%L)', z), 'NO_ENCONTRADO', 'A7 vencida no se abre');
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_admin_alerta_archivar(%L, '''')', x), 'VALIDACION', 'A7 retirar exige motivo');
  perform public.fn_admin_alerta_archivar(x, 'Ya no aplica');
  perform pg_temp.como(c1);
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.fn_alertas()) q where (q ->> 'id')::uuid = x), 'A7 retirada deja de mostrarse');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.alert_acknowledgements where alert_id = x and acknowledged_at is not null) = 1, 'A7 la evidencia se conserva');

  -- A8 · Consejos
  perform pg_temp.como(a2);
  t := public.fn_admin_consejo_guardar(jsonb_build_object('category_id', v_cat, 'titulo', 'Consejo uno'));
  perform pg_temp.falla(format('select public.fn_admin_consejo_enviar(%L)', t), 'VALIDACION', 'A8 consejo vacío no se envía');
  perform pg_temp.falla(format('select public.fn_admin_consejo_guardar(%L)', jsonb_build_object('category_id', v_cat, 'titulo', 'Largo', 'texto', repeat('x', 601))), '23514', 'A8 máximo 600 caracteres');
  perform public.fn_admin_consejo_guardar(jsonb_build_object('id', t, 'category_id', v_cat, 'titulo', 'Consejo uno', 'texto', 'Revise sus llantas en frío', 'fuente', 'Manual', 'compartir', 'Revise sus llantas'));
  perform public.fn_admin_consejo_enviar(t);
  perform pg_temp.falla(format('select public.fn_admin_consejo_aprobar(%L, %L)', t, public.fn_admin_consejo(t) ->> 'editado'), 'VALIDACION', 'A8 cuatro ojos');
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_consejos() = '[]'::jsonb, 'A8 sin aprobar no es visible');
  perform pg_temp.como(a3);
  perform public.fn_admin_consejo_aprobar(t, (public.fn_admin_consejo(t) ->> 'editado')::timestamptz);
  t2 := public.fn_admin_consejo_guardar(jsonb_build_object('category_id', v_cat, 'titulo', 'Consejo dos', 'texto', 'Tome agua cada hora', 'fuente', 'Manual'));
  perform public.fn_admin_consejo_enviar(t2);
  perform pg_temp.como(a2);
  perform public.fn_admin_consejo_aprobar(t2, (public.fn_admin_consejo(t2) ->> 'editado')::timestamptz);
  perform pg_temp.como(c1);
  r := public.fn_consejos();
  perform pg_temp.ok(jsonb_array_length(r) = 2 and (select count(*) from jsonb_array_elements(r) q where (q ->> 'hoy')::boolean) = 1, 'A8 dos visibles y uno solo es el de hoy');
  perform pg_temp.como(a2);
  perform public.fn_admin_consejo_guardar(jsonb_build_object('id', t, 'category_id', v_cat, 'titulo', 'Consejo uno v2', 'texto', 'Revise sus llantas en frío', 'fuente', 'Manual'));
  perform pg_temp.ok((public.fn_admin_consejo(t) ->> 'version')::int = 2, 'A8 editar lo aprobado crea versión');
  perform pg_temp.falla(format('select public.fn_admin_consejo_eliminar(%L)', t), 'VALIDACION', 'A8 no se elimina lo que fue aprobado');
  perform public.fn_admin_consejo_archivar(t2, 'Ya no aplica');
  perform pg_temp.como(c1);
  perform pg_temp.ok(public.fn_consejos() = '[]'::jsonb, 'A8 editado o retirado deja de mostrarse');

  -- A9 · Acceso directo y anónimo
  perform pg_temp.falla('select count(*) from public.alerts', '42501', 'A9 alertas solo por RPC');
  perform pg_temp.falla('select count(*) from public.alert_publications', '42501', 'A9 publicaciones solo por RPC');
  perform pg_temp.falla('select count(*) from public.alert_acknowledgements', '42501', 'A9 evidencia solo por RPC');
  perform pg_temp.falla('select count(*) from public.tips', '42501', 'A9 consejos solo por RPC');
  perform pg_temp.falla('select * from app.alertas_vigentes()', '42501', 'A9 funciones internas cerradas');
  perform pg_temp.falla(format('select public.fn_admin_alerta(%L)', y), 'NO_AUTORIZADO', 'A9 colaborador no ve el seguimiento de otros');
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_alertas()', '42501', 'A9 anónimo no ve alertas');
  perform pg_temp.falla('select public.fn_consejos()', '42501', 'A9 anónimo no ve consejos');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.audit_logs where action = 'ALERTA_APROBADA') >= 5, 'A9 aprobaciones auditadas');

  raise notice '== Pruebas de alertas y consejos: todas correctas ==';
end $$;

rollback;
