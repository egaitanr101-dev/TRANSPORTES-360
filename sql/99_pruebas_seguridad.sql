-- =============================================================================
-- TRANSPORTES 360 · 99_pruebas_seguridad.sql  (iteración 1: identidad)
-- Intenta lo que NO debería poderse hacer desde la API. Termina en ROLLBACK.
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

insert into public.areas (id, name) values ('DIS_GAM', 'Distribución GAM');
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'super@t360.test',     '{"role":"SUPERVISOR","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'tr-0417@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"TR-0417","full_name":"María Fernández"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'tr-0500@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"TR-0500","full_name":"Carlos Mora"}');
update public.profiles set is_active = true where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1');
update public.profiles set is_active = true, supervisor_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-0000000000c1';
insert into public.account_activations (profile_id, code_hash, issued_by)
values ('00000000-0000-0000-0000-0000000000c2', extensions.crypt('ABCD-EFGH', extensions.gen_salt('bf', 8)), '00000000-0000-0000-0000-0000000000a2');
do $$ begin perform app.auditar('PRUEBA', 'x', '1', '{}'::jsonb, '00000000-0000-0000-0000-0000000000a2'); end $$;

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  b1 uuid := '00000000-0000-0000-0000-0000000000b1'; c1 uuid := '00000000-0000-0000-0000-0000000000c1';
  c2 uuid := '00000000-0000-0000-0000-0000000000c2'; n int;
begin
  -- S1 · Sin sesión no se lee ni se ejecuta nada
  perform pg_temp.como(null);
  perform pg_temp.falla('select count(*) from public.profiles', '42501', 'S1 anónimo no lee perfiles');
  perform pg_temp.falla('select public.fn_mi_perfil()', '42501', 'S1 anónimo no ejecuta RPC');
  perform pg_temp.falla('select count(*) from public.knowledge_categories', '42501', 'S1 anónimo no lee categorías');
  perform pg_temp.yo();

  -- S2 · Un colaborador solo ve su propio perfil
  perform pg_temp.como(c1);
  select count(*) into n from public.profiles;
  perform pg_temp.ok(n = 1, 'S2 colaborador ve solo su perfil');

  -- S3 · Escrituras directas bloqueadas (todo cambio pasa por RPC validada)
  perform pg_temp.falla('update public.profiles set role_id = ''ADMIN'' where id = auth.uid()', '42501', 'S3 colaborador no cambia su rol por la API');
  perform pg_temp.falla('insert into public.audit_logs (action) values (''FALSO'')', '42501', 'S3 colaborador no escribe auditoría');
  perform pg_temp.falla('delete from public.profiles', '42501', 'S3 colaborador no borra perfiles');
  perform pg_temp.falla('insert into public.role_permissions values (''COLABORADOR'', ''usuarios.gestionar'')', '42501', 'S3 colaborador no se otorga permisos');
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(auth.uid(), ''{"role_id":"ADMIN"}'')', 'NO_AUTORIZADO', 'S3 colaborador no usa la RPC de administración');
  perform pg_temp.falla('select public.fn_emitir_activacion(''00000000-0000-0000-0000-0000000000c2'')', 'NO_AUTORIZADO', 'S3 colaborador no emite códigos');
  perform pg_temp.falla('select public.fn_usuarios_listar()', 'NO_AUTORIZADO', 'S3 colaborador no lista usuarios');

  -- S4 · Códigos de activación: nadie los lee y solo el servidor los canjea
  perform pg_temp.falla('select count(*) from public.account_activations', '42501', 'S4 colaborador no lee activaciones');
  perform pg_temp.falla('select public.fn_srv_verificar_activacion(''TR-0500'', ''ABCD-EFGH'')', '42501', 'S4 usuario autenticado no canjea códigos directamente');
  perform pg_temp.como(a2);
  perform pg_temp.falla('select count(*) from public.account_activations', '42501', 'S4 ni el administrador lee los hashes');

  -- S5 · Auditoría: solo con permiso, e inmutable
  select count(*) into n from public.audit_logs;
  perform pg_temp.ok(n = 0, 'S5 administrador sin auditoria.ver no la lee');
  perform pg_temp.como(a1);
  select count(*) into n from public.audit_logs;
  perform pg_temp.ok(n >= 1, 'S5 administrador principal sí la lee');
  perform pg_temp.yo();
  perform pg_temp.falla('update public.audit_logs set action = ''BORRADO''', 'INMUTABLE', 'S5 auditoría inmutable incluso para el dueño de la base');
  perform pg_temp.falla('delete from public.audit_logs', 'INMUTABLE', 'S5 auditoría no se borra');

  -- S6 · Un administrador no gestiona administradores ni se modifica a sí mismo
  perform pg_temp.como(a2);
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(''00000000-0000-0000-0000-0000000000b1'', ''{"role_id":"ADMIN"}'')', 'NO_AUTORIZADO', 'S6 administrador no asciende a administrador');
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(''00000000-0000-0000-0000-0000000000a1'', ''{"is_active":false}'')', 'NO_AUTORIZADO', 'S6 administrador no desactiva al principal');
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(auth.uid(), ''{"is_active":false}'')', 'VALIDACION', 'S6 nadie se desactiva a sí mismo');
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(''00000000-0000-0000-0000-0000000000c1'', ''{"employee_code":"X-1"}'')', 'VALIDACION', 'S6 el código de empleado no se cambia por RPC');
  perform pg_temp.como(a1);
  perform pg_temp.falla('select public.fn_admin_usuario_guardar(auth.uid(), ''{"role_id":"COLABORADOR"}'')', 'VALIDACION', 'S6 el principal no cambia su propio rol');

  -- S7 · El supervisor ve su equipo, no a otros
  perform pg_temp.como(b1);
  select count(*) into n from public.profiles;
  perform pg_temp.ok(n = 2, 'S7 supervisor ve su perfil y el de su equipo (2)');

  -- S8 · Un usuario inactivo no opera
  perform pg_temp.como(c2);
  perform pg_temp.falla('select public.fn_mi_perfil()', 'NO_AUTENTICADO', 'S8 usuario inactivo rechazado');
  select count(*) into n from public.knowledge_categories;
  perform pg_temp.ok(n = 6, 'S8 (las categorías activas son lectura pública para autenticados)');

  -- S9 · Parámetros y catálogo de temas
  perform pg_temp.como(c1);
  perform pg_temp.ok(not exists (select 1 from public.app_settings where key = 'ai_enabled'), 'S9 parámetros internos ocultos al colaborador');
  perform pg_temp.ok(exists (select 1 from public.app_settings where key = 'attempt_policy'), 'S9 parámetros públicos visibles');
  select count(*) into n from public.topic_catalog;
  perform pg_temp.ok(n = 0, 'S9 colaborador no lee el catálogo editorial');
  perform pg_temp.yo();

  -- S10 · Revisión estructural
  perform pg_temp.ok(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity), 'S10 todas las tablas de public tienen RLS');
  perform pg_temp.ok(not exists (
      select 1 from pg_proc f join pg_namespace s on s.oid = f.pronamespace
      where s.nspname in ('public', 'app') and f.prosecdef and (f.proconfig is null or not exists (select 1 from unnest(f.proconfig) c where c like 'search_path=%'))),
    'S10 toda función SECURITY DEFINER fija search_path');
  perform pg_temp.ok(not exists (
      select 1 from pg_proc f join pg_namespace s on s.oid = f.pronamespace
      where s.nspname in ('public', 'app') and has_function_privilege('anon', f.oid, 'execute')),
    'S10 anónimo no puede ejecutar ninguna función propia');
  perform pg_temp.ok(not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
    'S10 ninguna tabla admite escrituras directas desde la API');

  raise notice '== Pruebas de seguridad de la iteración 1: todas correctas ==';
end $$;

rollback;
