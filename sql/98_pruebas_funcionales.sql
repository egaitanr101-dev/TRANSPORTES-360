-- =============================================================================
-- TRANSPORTES 360 · 98_pruebas_funcionales.sql  (iteración 1: identidad)
-- Datos ficticios dentro de una transacción que termina en ROLLBACK: no deja nada.
-- En Supabase: solo en el proyecto de desarrollo y en un envío separado.
-- =============================================================================
begin;
-- SOLO PRUEBAS. Funciones temporales (pg_temp) para simular usuarios y verificar resultados.
-- Van dentro del archivo para que funcione igual en psql y en el SQL Editor de Supabase; desaparecen al cerrar la sesión.

/** Simula una petición de la API como el usuario p (null = anónimo). */
create function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p, 'role', 'authenticated')::text end, true);
  if p is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;

/** Simula una llamada del servidor (Edge Function con service_role). */
create function pg_temp.servidor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role';
end $$;

/** Vuelve al rol administrador de la base (postgres). */
create function pg_temp.yo() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'OK  %', msg;
end $$;

/** Ejecuta sql y exige que falle con el código (HINT) o SQLSTATE esperado. */
create function pg_temp.falla(sql text, esperado text, msg text) returns void language plpgsql as $$
declare v_hint text; v_state text; v_msg text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate, v_msg = message_text;
    if esperado is null or v_hint = esperado or v_state = esperado then
      raise notice 'OK  % (rechazado: %)', msg, coalesce(nullif(v_hint, ''), v_state);
      return;
    end if;
    raise exception 'FALLÓ: % → error inesperado % / % / %', msg, v_state, v_hint, v_msg;
  end;
  raise exception 'FALLÓ: % → no hubo error', msg;
end $$;

insert into public.areas (id, name) values ('DIS_GAM', 'Distribución GAM'), ('RUTAS', 'Rutas rurales');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}', '{}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'super@t360.test',     '{"role":"SUPERVISOR","full_name":"Sergio Supervisor"}', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'tr-0417@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"tr-0417","full_name":"María Fernández"}', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'tr-0500@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"TR-0500","full_name":"Carlos Mora"}', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'raro@t360.test',      '{"role":"SUPERUSUARIO"}', '{"role":"ADMIN","full_name":"Intruso"}');

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  b1 uuid := '00000000-0000-0000-0000-0000000000b1'; c1 uuid := '00000000-0000-0000-0000-0000000000c1';
  c2 uuid := '00000000-0000-0000-0000-0000000000c2'; d1 uuid := '00000000-0000-0000-0000-0000000000d1';
  r jsonb; r2 jsonb; cod text; cod2 text; n int; p public.profiles;
begin
  -- F1 · El alta en Auth crea perfiles INACTIVOS, con rol solo desde app_metadata
  select * into p from public.profiles where id = c1;
  perform pg_temp.ok(p.is_active = false and p.employee_code = 'TR-0417' and p.email is null and p.role_id = 'COLABORADOR', 'F1 colaborador creado inactivo, código en mayúsculas, sin correo técnico');
  perform pg_temp.ok((select role_id is null and full_name = 'raro' from public.profiles where id = d1), 'F1 rol inexistente y user_metadata ignorados');
  perform pg_temp.ok((select email = 'principal@t360.test' from public.profiles where id = a1), 'F1 el personal conserva su correo');

  -- Activación inicial del personal (en Supabase la hace el primer SQL de arranque, PLAN §2)
  update public.profiles set is_active = true where id in (a1, a2, b1);

  -- F2 · D-07: elegibilidad para el sorteo
  perform pg_temp.ok((select draw_eligible from public.profiles where id = c1) and (select draw_eligible from public.profiles where id = b1)
                     and not (select draw_eligible from public.profiles where id = a2) and not (select draw_eligible from public.profiles where id = a1),
                     'F2 colaboradores y supervisores elegibles; administradores excluidos');

  -- F3 · El administrador asigna área y supervisor (queda auditado)
  perform pg_temp.como(a2);
  r := public.fn_admin_usuario_guardar(c1, '{"area_id":"DIS_GAM","supervisor_id":"00000000-0000-0000-0000-0000000000b1"}');
  perform pg_temp.yo();
  perform pg_temp.ok((select area_id = 'DIS_GAM' and supervisor_id = b1 from public.profiles where id = c1), 'F3 área y supervisor asignados');
  perform pg_temp.ok(exists (select 1 from public.audit_logs where action = 'USUARIO_ACTUALIZADO' and entity_id = c1::text and actor_id = a2), 'F3 cambio auditado con antes/después');

  -- F4 · Código de activación: formato, sin caracteres ambiguos, guardado como hash
  perform pg_temp.como(a2);
  r := public.fn_emitir_activacion(c1);
  perform pg_temp.yo();
  cod := r ->> 'codigo';
  perform pg_temp.ok(cod ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$', 'F4 formato XXXX-XXXX sin 0/O/1/I/L: ' || cod);
  perform pg_temp.ok(not exists (select 1 from public.account_activations where code_hash like '%' || cod || '%'), 'F4 el código no se guarda en claro');
  perform pg_temp.ok(not exists (select 1 from public.audit_logs where details::text like '%' || cod || '%'), 'F4 el código no queda en la auditoría');

  -- F5 · Un nuevo código revoca el anterior
  perform pg_temp.como(a2);
  r2 := public.fn_emitir_activacion(c1);
  perform pg_temp.yo();
  cod2 := r2 ->> 'codigo';
  select count(*) into n from public.account_activations where profile_id = c1 and used_at is null and revoked_at is null;
  perform pg_temp.ok(n = 1 and (select count(*) from public.account_activations where profile_id = c1 and revoked_at is not null) = 1, 'F5 un solo código vigente; el anterior queda revocado');

  -- F6 · Canje (Edge Function con service_role): el código viejo no sirve, el nuevo sí (sin guion, en minúsculas)
  perform pg_temp.servidor();
  r := public.fn_srv_verificar_activacion('tr-0417', cod);
  perform pg_temp.yo();
  perform pg_temp.ok(not (r ->> 'ok')::boolean and (select failed_attempts from public.account_activations where profile_id = c1 and used_at is null and revoked_at is null) = 1,
                     'F6 código revocado rechazado y cuenta un intento fallido');
  perform pg_temp.servidor();
  r := public.fn_srv_verificar_activacion(' TR-0417 ', lower(replace(cod2, '-', '')));
  perform pg_temp.ok((r ->> 'ok')::boolean and (r ->> 'user_id')::uuid = c1, 'F6 código vigente aceptado (sin guion y en minúsculas)');
  r := public.fn_srv_confirmar_activacion((r ->> 'activation_id')::uuid);
  perform pg_temp.yo();
  perform pg_temp.ok((select is_active from public.profiles where id = c1), 'F6 cuenta activada al confirmar');
  perform pg_temp.servidor();
  r := public.fn_srv_verificar_activacion('TR-0417', cod2);
  perform pg_temp.yo();
  perform pg_temp.ok(not (r ->> 'ok')::boolean, 'F6 un código usado no se puede volver a usar');

  -- F7 · Máximo 5 intentos fallidos
  perform pg_temp.como(a2);
  cod := public.fn_emitir_activacion(c2) ->> 'codigo';
  perform pg_temp.servidor();
  for i in 1..5 loop perform public.fn_srv_verificar_activacion('TR-0500', 'AAAA-AAAA'); end loop;
  r := public.fn_srv_verificar_activacion('TR-0500', cod);
  perform pg_temp.yo();
  perform pg_temp.ok(not (r ->> 'ok')::boolean, 'F7 tras 5 intentos fallidos el código correcto queda bloqueado');

  -- F8 · Código vencido
  perform pg_temp.como(a2);
  cod := public.fn_emitir_activacion(c2) ->> 'codigo';
  perform pg_temp.yo();
  update public.account_activations set expires_at = now() - interval '1 minute' where profile_id = c2 and used_at is null and revoked_at is null;
  perform pg_temp.servidor();
  r := public.fn_srv_verificar_activacion('TR-0500', cod);
  perform pg_temp.yo();
  perform pg_temp.ok(not (r ->> 'ok')::boolean, 'F8 código vencido rechazado');

  -- F9 · Código de empleado inexistente: misma respuesta genérica
  perform pg_temp.servidor();
  r := public.fn_srv_verificar_activacion('NO-EXISTE', 'ABCD-EFGH');
  perform pg_temp.yo();
  perform pg_temp.ok(r = '{"ok": false}'::jsonb, 'F9 respuesta idéntica: no revela qué códigos existen');

  -- F10 · El supervisor puede emitir códigos solo para su equipo
  perform pg_temp.como(b1);
  r := public.fn_emitir_activacion(c1);
  perform pg_temp.ok(r ? 'codigo', 'F10 supervisor emite código para su equipo');
  perform pg_temp.falla('select public.fn_emitir_activacion(''00000000-0000-0000-0000-0000000000c2'')', 'NO_AUTORIZADO', 'F10 supervisor no emite códigos fuera de su equipo');
  perform pg_temp.yo();

  -- F11 · Mi perfil
  perform pg_temp.como(c1);
  r := public.fn_mi_perfil();
  perform pg_temp.ok(r ->> 'codigo' = 'TR-0417' and r ->> 'iniciales' = 'MF' and r ->> 'area' = 'Distribución GAM'
                     and r -> 'permisos' ? 'evaluacion.responder' and not (r -> 'permisos' ? 'usuarios.gestionar'), 'F11 perfil y permisos efectivos desde el servidor');
  perform public.fn_aceptar_privacidad();
  perform pg_temp.yo();
  perform pg_temp.ok((select privacy_accepted_at is not null from public.profiles where id = c1), 'F11 aviso de privacidad aceptado');

  -- F12 · Listado de usuarios: el administrador ve todos; el supervisor, solo su equipo
  perform pg_temp.como(a2);
  select count(*) into n from public.fn_usuarios_listar();
  perform pg_temp.ok(n = 6, 'F12 administrador ve los 6 usuarios');
  perform pg_temp.como(b1);
  perform pg_temp.ok((select array_agg(codigo) from public.fn_usuarios_listar()) = array['TR-0417'], 'F12 supervisor ve solo a su equipo');
  perform pg_temp.yo();

  -- F13 · Un colaborador sin activar no se activa a mano
  perform pg_temp.como(a2);
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(''00000000-0000-0000-0000-0000000000c2'', ''{"is_active":true}'')', 'VALIDACION', 'F13 no se activa a un colaborador que no canjeó su código');
  perform pg_temp.yo();

  -- F14 · El administrador principal sí gestiona administradores
  perform pg_temp.como(a1);
  r := public.fn_admin_usuario_guardar(b1, '{"role_id":"ADMIN"}');
  perform pg_temp.yo();
  perform pg_temp.ok((select role_id = 'ADMIN' and not draw_eligible from public.profiles where id = b1), 'F14 principal asciende a administrador y queda fuera del sorteo');

  raise notice '== Pruebas funcionales de la iteración 1: todas correctas ==';
end $$;

rollback;
