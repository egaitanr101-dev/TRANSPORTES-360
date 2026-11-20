-- =============================================================================
-- TRANSPORTES 360 · 97_pruebas_importacion.sql  (migración 2026-11-20_02: importación masiva)
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

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',  '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'super@t360.test',  '{"role":"SUPERVISOR","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'e-100@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"E-100","full_name":"Uno Prueba"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'e-101@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"E-101","full_name":"Dos Prueba"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'e-102@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"E-102","full_name":"Tres Prueba"}');
update public.profiles set is_active = true where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1');
insert into public.areas (id, name) values ('DIS_GAM', 'Distribución GAM');

do $$
declare
  a2 uuid := '00000000-0000-0000-0000-0000000000a2'; b1 uuid := '00000000-0000-0000-0000-0000000000b1';
  r jsonb; n int;
begin
  perform pg_temp.ok(app.area_id_de('Distribución Rutas Rurales') = 'DISTRIBUCION_RUTAS_R' and app.area_id_de('  Almacén / Frío ') = 'ALMACEN_FRIO'
                     and app.area_id_de('X') = 'AREA_X', 'I1 identificador de área estable desde el nombre');

  perform pg_temp.como(a2);
  r := public.fn_importar_completar('[
    {"id":"00000000-0000-0000-0000-0000000000e1","area":"distribución gam","supervisor":"SUPER@t360.test"},
    {"id":"00000000-0000-0000-0000-0000000000e2","area":"Rutas Rurales","supervisor":"nadie@t360.test"},
    {"id":"00000000-0000-0000-0000-0000000000e3"}]', null);
  perform pg_temp.yo();

  perform pg_temp.ok(jsonb_array_length(r) = 3, 'I2 devuelve las 3 filas');
  perform pg_temp.ok((select bool_and(e ->> 'codigo_activacion' ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$') from jsonb_array_elements(r) e), 'I2 un código por persona');
  perform pg_temp.ok((select count(distinct e ->> 'codigo_activacion') from jsonb_array_elements(r) e) = 3, 'I2 códigos distintos');
  perform pg_temp.ok((select area_id = 'DIS_GAM' and supervisor_id = b1 from public.profiles where employee_code = 'E-100'), 'I3 área existente por nombre (sin distinguir mayúsculas) y supervisor por correo');
  perform pg_temp.ok((select area_id = 'RUTAS_RURALES' and supervisor_id is null from public.profiles where employee_code = 'E-101'), 'I4 área nueva creada; supervisor inexistente queda vacío');
  perform pg_temp.ok((select e ->> 'aviso' from jsonb_array_elements(r) e where e ->> 'codigo' = 'E-101') like 'Supervisor no encontrado%', 'I4 aviso de supervisor no encontrado');
  perform pg_temp.ok((select bool_and(expires_at between now() + interval '335 hours' and now() + interval '337 hours') from public.account_activations), 'I5 vigencia por defecto de 14 días');
  perform pg_temp.ok(not exists (select 1 from public.audit_logs where details::text ~ '[A-Z2-9]{4}-[A-Z2-9]{4}'), 'I6 los códigos no quedan en la auditoría');
  perform pg_temp.ok(exists (select 1 from public.audit_logs where action = 'IMPORTACION_COLABORADORES' and actor_id = a2), 'I6 importación auditada');

  -- El código emitido en lote sirve para activar (mismo canje que el individual)
  execute 'set local role service_role';
  perform pg_temp.ok((public.fn_srv_verificar_activacion('E-102', (select e ->> 'codigo_activacion' from jsonb_array_elements(r) e where e ->> 'codigo' = 'E-102')) ->> 'ok')::boolean,
                     'I7 el código del lote se canjea normalmente');
  perform pg_temp.yo();

  -- Reimportar revoca el código anterior
  perform pg_temp.como(a2);
  r := public.fn_importar_completar('[{"id":"00000000-0000-0000-0000-0000000000e1"}]', 48);
  perform pg_temp.yo();
  select count(*) into n from public.account_activations where profile_id = '00000000-0000-0000-0000-0000000000e1' and used_at is null and revoked_at is null;
  perform pg_temp.ok(n = 1 and (select expires_at < now() + interval '49 hours' from public.account_activations where profile_id = '00000000-0000-0000-0000-0000000000e1' and revoked_at is null), 'I8 reimportar deja un solo código vigente, con la vigencia pedida');

  -- Seguridad
  perform pg_temp.como(b1);
  perform pg_temp.falla('select public.fn_importar_completar(''[{"id":"00000000-0000-0000-0000-0000000000e3"}]'')', 'NO_AUTORIZADO', 'I9 un supervisor no importa');
  perform pg_temp.como(a2);
  perform pg_temp.falla('select public.fn_importar_completar(''[{"id":"00000000-0000-0000-0000-0000000000b1"}]'')', 'VALIDACION', 'I9 no se emiten códigos a personal administrativo');
  perform pg_temp.falla('select public.fn_importar_completar(''[]'')', 'VALIDACION', 'I9 lote vacío rechazado');
  perform pg_temp.falla('select public.fn_importar_completar(''[{"id":"00000000-0000-0000-0000-0000000000e3"}]'', 2000)', 'VALIDACION', 'I9 vigencia mayor a 30 días rechazada');
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_importar_completar(''[]'')', '42501', 'I9 anónimo no ejecuta');
  perform pg_temp.yo();

  raise notice '== Pruebas de importación masiva: todas correctas ==';
end $$;

rollback;
