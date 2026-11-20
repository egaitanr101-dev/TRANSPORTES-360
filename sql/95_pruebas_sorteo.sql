-- =============================================================================
-- TRANSPORTES 360 · 95_pruebas_sorteo.sql  (iteración 3: cierre de semana y sorteo)
-- Datos ficticios (solo identificadores 00000000-…). Termina en ROLLBACK (en Supabase: con un error final a propósito).
-- Las semanas pasadas y los intentos se insertan directamente como postgres para simular semanas ya vividas.
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

/** Semana ya publicada (programada en el pasado) con 5 cápsulas. */
create function pg_temp.semana_pasada(p_lunes date, p_titulo text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.training_weeks (week_start, category_id, title, status, publish_at, created_by, updated_by, approved_by, approved_at)
  values (p_lunes, (select id from public.knowledge_categories where slug = 'seguridad_digital'), p_titulo, 'PROGRAMADO',
          (p_lunes::timestamp at time zone 'America/Costa_Rica'), '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000a1', now())
  returning id into v;
  insert into public.capsules (week_id, day_number, title) select v, d, 'Cápsula ' || d from generate_series(1, 5) d;
  return v;
end $$;

/** n cápsulas oficiales respondidas con un total de p puntos (2 por cápsula, lo que sobra en las primeras). */
create function pg_temp.intentos(p_semana uuid, p_usuario uuid, n int, p int) returns void language sql as $$
  insert into public.capsule_attempts (capsule_id, week_id, user_id, attempt_type, score, total, idempotency_key)
  select c.id, p_semana, p_usuario, 'OFICIAL', least(2, greatest(0, p - 2 * (c.day_number - 1))), 2, gen_random_uuid()
    from public.capsules c where c.week_id = p_semana and c.day_number <= n
$$;

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'principal@t360.test', '{"role":"ADMIN_PRINCIPAL","full_name":"Paula Principal"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@t360.test',     '{"role":"ADMIN","full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'k-50@colaboradores.t360.invalid', '{"role":"SUPERVISOR","employee_code":"K-50","full_name":"Sergio Supervisor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'k-1@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-1","full_name":"Colaborador Uno"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'k-2@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-2","full_name":"Colaborador Dos"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'k-3@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-3","full_name":"Colaborador Tres"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'k-4@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-4","full_name":"Colaborador Cuatro"}'),
  ('00000000-0000-0000-0000-0000000000c5', 'k-5@colaboradores.t360.invalid', '{"role":"COLABORADOR","employee_code":"K-5","full_name":"Colaborador Cinco"}');
update public.profiles set is_active = true where id::text like '00000000-0000-0000-0000-0000000000%' and id <> '00000000-0000-0000-0000-0000000000c5';

do $$
declare
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  s1 uuid := '00000000-0000-0000-0000-0000000000b1';
  c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  c3 uuid := '00000000-0000-0000-0000-0000000000c3'; c4 uuid := '00000000-0000-0000-0000-0000000000c4';
  c5 uuid := '00000000-0000-0000-0000-0000000000c5';
  v_lunes date := date_trunc('week', app.hoy_cr())::date;
  wa uuid; wb uuid; wc uuid; wd uuid; we uuid;
  r jsonb; r2 jsonb; d public.weekly_draws; d2 public.weekly_draws; v_ids uuid[]; v_hash text; v_idx int; v_len int;
  v_cnt int[]; i int; x int; v_rec uuid; v_ganador_a uuid;
begin
  wa := pg_temp.semana_pasada(v_lunes - 7, 'Semana A');
  wb := pg_temp.semana_pasada(v_lunes - 14, 'Semana B');
  wc := pg_temp.semana_pasada(v_lunes - 21, 'Semana C');
  wd := pg_temp.semana_pasada(v_lunes, 'Semana en curso');
  we := pg_temp.semana_pasada(v_lunes - 28, 'Semana E');
  -- Semana A: máximo real 9 (empatan c1, c2 y el supervisor). c3 sacó 7; c4 no terminó (8 en 4); c5 sacó 10 pero está inactivo.
  perform pg_temp.intentos(wa, c1, 5, 9); perform pg_temp.intentos(wa, c2, 5, 9); perform pg_temp.intentos(wa, s1, 5, 9);
  perform pg_temp.intentos(wa, c3, 5, 7); perform pg_temp.intentos(wa, c4, 4, 8); perform pg_temp.intentos(wa, c5, 5, 10);
  -- Semana B: c1 perfecto (10/10), c2 con 8. Semana C: nadie participó.
  perform pg_temp.intentos(wb, c1, 5, 10); perform pg_temp.intentos(wb, c2, 5, 8);

  -- S1 · Permisos y cuándo se puede cerrar
  perform pg_temp.como(c1);
  perform pg_temp.falla(format('select public.fn_cerrar_semana(%L)', wa), 'NO_AUTORIZADO', 'S1 colaborador no cierra semanas');
  perform pg_temp.falla(format('select public.fn_ejecutar_sorteo(%L)', wa), 'NO_AUTORIZADO', 'S1 colaborador no sortea');
  perform pg_temp.como(s1);
  perform pg_temp.falla(format('select public.fn_admin_sorteo(%L)', wa), 'NO_AUTORIZADO', 'S1 supervisor no ve la lista de empatados');
  perform pg_temp.falla(format('select public.fn_ejecutar_sorteo(%L)', wa), 'NO_AUTORIZADO', 'S1 supervisor no sortea');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_cerrar_semana(%L)', wd), 'VALIDACION', 'S1 la semana en curso no se cierra antes del domingo');
  perform pg_temp.falla(format('select public.fn_ejecutar_sorteo(%L)', wd), 'VALIDACION', 'S1 ni se sortea');
  r := public.fn_admin_sorteo(wa);
  perform pg_temp.ok((r #>> '{semana,puede_cerrar}')::boolean and not (r #>> '{semana,cerrada}')::boolean and r -> 'sorteo' = 'null'::jsonb, 'S1 semana A lista para cerrar');

  -- S2 · Cierre: resultados congelados e idempotente
  r := public.fn_cerrar_semana(wa);
  perform pg_temp.ok((r ->> 'cerrada')::boolean and not (r ->> 'ya_estaba')::boolean, 'S2 semana A cerrada');
  r := public.fn_cerrar_semana(wa);
  perform pg_temp.ok((r ->> 'ya_estaba')::boolean, 'S2 cerrar de nuevo no repite');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.weekly_results where week_id = wa and user_id::text like '00000000-%') = 6, 'S2 base: 5 activos que responden + el inactivo que participó (sin administradores)');
  perform pg_temp.ok((select eligible and score = 9 and completed_all from public.weekly_results where week_id = wa and user_id = s1), 'S2 supervisor participa (D-07)');
  perform pg_temp.ok((select not eligible and not completed_all and score = 8 from public.weekly_results where week_id = wa and user_id = c4), 'S2 incompleto no participa');
  perform pg_temp.ok((select not eligible and completed_all and score = 10 from public.weekly_results where week_id = wa and user_id = c5), 'S2 inactivo no participa');
  perform pg_temp.ok((select capsules_completed = 4 from public.weekly_results where week_id = wa and user_id = c4)
                     and (select capsules_completed = 5 and score = 7 from public.weekly_results where week_id = wa and user_id = c3), 'S2 cápsulas y puntos contados');
  perform pg_temp.ok((select closed_at is not null and status = 'PUBLICADO' from public.training_weeks where id = wa), 'S2 semana marcada como cerrada');
  perform pg_temp.falla(format('update public.weekly_results set score = 10 where week_id = %L', wa), 'INMUTABLE', 'S2 resultados inmutables');
  perform pg_temp.falla(format('delete from public.weekly_results where week_id = %L', wa), 'INMUTABLE', 'S2 resultados no se borran');

  -- S3 · Panel: máximo REAL y empatados
  perform pg_temp.como(a2);
  r := public.fn_admin_sorteo(wa);
  perform pg_temp.ok((r ->> 'maximo')::int = 9, 'S3 máximo real 9 (no cuenta el 10 del inactivo)');
  perform pg_temp.ok((select array_agg((e ->> 'id')::uuid order by (e ->> 'id')::uuid) from jsonb_array_elements(r -> 'elegibles') e)
                     = (select array_agg(u order by u) from unnest(array[s1, c1, c2]) u), 'S3 empatados: c1, c2 y supervisor');
  perform pg_temp.ok((r ->> 'excluidos')::int >= 1 and (r ->> 'completaron')::int >= 5, 'S3 completaron y excluidos');

  -- S4 · Sorteo: idempotente y verificable
  r := public.fn_ejecutar_sorteo(wa);
  perform pg_temp.ok(not (r ->> 'ya_existia')::boolean, 'S4 sorteo ejecutado');
  r2 := public.fn_ejecutar_sorteo(wa);
  perform pg_temp.ok((r2 ->> 'ya_existia')::boolean and r2 ->> 'id' = r ->> 'id', 'S4 repetir devuelve el mismo sorteo (sin volver a sortear)');
  perform pg_temp.yo();
  select * into d from public.weekly_draws where id = (r ->> 'id')::uuid;
  perform pg_temp.ok(d.status = 'OFICIAL' and d.max_score = 9 and d.eligible_count = 3 and d.winner_user_id = any (array[s1, c1, c2]), 'S4 ganador entre los empatados');
  perform pg_temp.ok((select count(*) from public.draw_entries where draw_id = d.id) = 3, 'S4 3 participaciones registradas');
  select array_agg(user_id order by position) into v_ids from public.draw_entries where draw_id = d.id;
  v_hash := encode(extensions.digest(array_to_string(v_ids, E'\n') || E'\n' || '9', 'sha256'), 'hex');
  perform pg_temp.ok(v_hash = d.eligible_list_sha256, 'S4 la huella de la lista se puede recalcular');
  v_len := length(d.random_bytes);
  perform pg_temp.ok(v_len >= 4 and v_len % 4 = 0, 'S4 bytes aleatorios guardados');
  v_idx := (((get_byte(d.random_bytes, v_len - 4)::bigint << 24) | (get_byte(d.random_bytes, v_len - 3)::bigint << 16)
            | (get_byte(d.random_bytes, v_len - 2)::bigint << 8) | get_byte(d.random_bytes, v_len - 1)::bigint) % 3)::int;
  perform pg_temp.ok(v_ids[v_idx + 1] = d.winner_user_id, 'S4 el ganador se recalcula con los bytes publicados');
  perform pg_temp.ok(exists (select 1 from public.recognitions where week_id = wa and user_id = d.winner_user_id and type = 'GANADOR_SORTEO' and not is_public),
                     'S4 reconocimiento de ganador, privado por defecto');
  perform pg_temp.ok((select count(*) from public.audit_logs where action = 'SORTEO_EJECUTADO' and entity_id = d.id::text) = 1, 'S4 auditado una sola vez');

  -- S5 · Inmutabilidad
  perform pg_temp.falla(format('update public.weekly_draws set winner_user_id = %L where id = %L', c3, d.id), 'INMUTABLE', 'S5 no se cambia el ganador');
  perform pg_temp.falla(format('update public.weekly_draws set status = ''ANULADO'' where id = %L', d.id), 'INMUTABLE', 'S5 no se anula sin motivo ni responsable');
  perform pg_temp.falla(format('delete from public.weekly_draws where id = %L', d.id), 'INMUTABLE', 'S5 no se borra');
  perform pg_temp.falla(format('delete from public.draw_entries where draw_id = %L', d.id), 'INMUTABLE', 'S5 participaciones inmutables');
  perform pg_temp.falla(format('insert into public.weekly_draws (week_id, status, eligible_count, algorithm_version, executed_by) values (%L, ''DESIERTO'', 0, ''x'', %L)', wa, a2),
                        '23505', 'S5 un solo sorteo vigente por semana');

  -- S6 · Anulación auditada y nuevo sorteo enlazado
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_anular_sorteo(%L, ''Error en la lista de participantes'')', d.id), 'NO_AUTORIZADO', 'S6 solo el principal anula');
  perform pg_temp.como(a1);
  perform pg_temp.falla(format('select public.fn_anular_sorteo(%L, ''corto'')', d.id), 'VALIDACION', 'S6 la anulación exige motivo');
  r := public.fn_anular_sorteo(d.id, 'Error en la lista de participantes');
  perform pg_temp.ok(r ->> 'estado' = 'ANULADO', 'S6 sorteo anulado');
  perform pg_temp.falla(format('select public.fn_anular_sorteo(%L, ''Segunda anulación del mismo'')', d.id), 'VALIDACION', 'S6 no se anula dos veces');
  r := public.fn_ejecutar_sorteo(wa);
  perform pg_temp.yo();
  select * into d2 from public.weekly_draws where id = (r ->> 'id')::uuid;
  perform pg_temp.ok(d2.status = 'OFICIAL' and d2.replaces_draw_id = d.id and d2.id <> d.id, 'S6 nuevo sorteo enlazado al anulado');
  perform pg_temp.ok((select status = 'ANULADO' and annul_reason = 'Error en la lista de participantes' and winner_user_id = d.winner_user_id
                        from public.weekly_draws where id = d.id), 'S6 el anulado conserva su evidencia');
  perform pg_temp.ok(exists (select 1 from public.audit_logs where action = 'SORTEO_ANULADO' and entity_id = d.id::text), 'S6 anulación auditada');
  perform pg_temp.como(a2);
  r := public.fn_admin_sorteo(wa);
  perform pg_temp.ok(jsonb_array_length(r -> 'anulados') = 1 and (r #>> '{sorteo,id}')::uuid = d2.id and r #>> '{sorteo,reemplaza}' = d.id::text, 'S6 el panel muestra vigente y anulado');
  v_ganador_a := d2.winner_user_id;
  if d.winner_user_id <> d2.winner_user_id then
    perform pg_temp.como(d.winner_user_id);
    r := public.fn_reconocimientos();
    perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(r -> 'propios') e where e ->> 'tipo' = 'GANADOR_SORTEO' and e ->> 'tema' = 'Semana A'),
                       'S6 el ganador anulado ya no ve la insignia');
  else
    raise notice 'OK  S6 (el nuevo sorteo repitió ganador; insignia vigente)';
  end if;

  -- S7 · Cierre perezoso al sortear, semana perfecta y sorteo desierto
  perform pg_temp.como(a2);
  r := public.fn_ejecutar_sorteo(wb);
  perform pg_temp.yo();
  select * into d from public.weekly_draws where id = (r ->> 'id')::uuid;
  perform pg_temp.ok(d.status = 'OFICIAL' and d.winner_user_id = c1 and d.max_score = 10 and d.eligible_count = 1, 'S7 sortear cierra la semana; único máximo gana');
  perform pg_temp.ok((select closed_at is not null from public.training_weeks where id = wb), 'S7 semana B cerrada al sortear');
  perform pg_temp.ok(exists (select 1 from public.recognitions where week_id = wb and user_id = c1 and type = 'SEMANA_PERFECTA'), 'S7 insignia de semana perfecta');
  perform pg_temp.ok(not exists (select 1 from public.recognitions where week_id = wb and user_id = c2), 'S7 sin insignia con 8');
  perform pg_temp.como(a2);
  r := public.fn_ejecutar_sorteo(wc);
  perform pg_temp.yo();
  perform pg_temp.ok((select status = 'DESIERTO' and winner_user_id is null and eligible_count = 0 from public.weekly_draws where id = (r ->> 'id')::uuid), 'S7 sin participantes: desierto');
  perform pg_temp.como(a2);
  r := public.fn_admin_sorteo(wc);
  perform pg_temp.ok(r #>> '{sorteo,estado}' = 'DESIERTO' and r -> 'maximo' = 'null'::jsonb and jsonb_array_length(r -> 'elegibles') = 0, 'S7 el panel muestra el desierto');

  -- S8 · Reconocimientos y consentimiento (D-08)
  perform pg_temp.como(c1);
  r := public.fn_reconocimientos();
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r -> 'propios') e where e ->> 'tipo' = 'SEMANA_PERFECTA')
                     and exists (select 1 from jsonb_array_elements(r -> 'propios') e where e ->> 'tipo' = 'GANADOR_SORTEO' and e ->> 'tema' = 'Semana B'), 'S8 el ganador ve sus reconocimientos');
  select (e ->> 'id')::uuid into v_rec from jsonb_array_elements(r -> 'propios') e where e ->> 'tipo' = 'GANADOR_SORTEO' and e ->> 'tema' = 'Semana B';
  perform pg_temp.como(c2);
  r := public.fn_reconocimientos();
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(r -> 'ganadores') e where e ->> 'nombre' like 'Colaborador U%'), 'S8 sin consentimiento el nombre no se muestra');
  perform pg_temp.falla(format('select public.fn_reconocimiento_publico(%L, true)', v_rec), 'NO_ENCONTRADO', 'S8 nadie más decide por el ganador');
  perform pg_temp.como(c1);
  perform public.fn_reconocimiento_publico(v_rec, true);
  perform pg_temp.como(c2);
  r := public.fn_reconocimientos();
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r -> 'ganadores') e where e ->> 'nombre' = 'Colaborador U.'), 'S8 con consentimiento se muestra nombre e inicial');
  perform pg_temp.ok(r::text not like '%K-1%' and r::text not like '%Colaborador Uno%', 'S8 nunca el nombre completo ni el código');

  -- S9 · Historial del colaborador
  perform pg_temp.como(c1);
  r := public.fn_mi_historial();
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r -> 'semanas') e where e ->> 'tema' = 'Semana A' and (e ->> 'participo')::boolean and e ->> 'estado' = 'Cerrada'),
                     'S9 historial: participó en el sorteo de la semana A');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r -> 'semanas') e where e ->> 'tema' = 'Semana B' and e ->> 'insignia' = 'Semana perfecta'), 'S9 historial con insignia');
  perform pg_temp.como(c4);
  r := public.fn_mi_historial();
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r -> 'semanas') e where e ->> 'tema' = 'Semana A' and not (e ->> 'participo')::boolean), 'S9 incompleto: no participó');

  -- S10 · Acceso directo a las tablas y anónimo
  perform pg_temp.como(c1);
  perform pg_temp.falla('select count(*) from public.weekly_draws', '42501', 'S10 sorteos solo por RPC');
  perform pg_temp.falla('select count(*) from public.weekly_results', '42501', 'S10 resultados solo por RPC');
  perform pg_temp.falla('select count(*) from public.recognitions', '42501', 'S10 reconocimientos solo por RPC');
  perform pg_temp.falla('select app.indice_aleatorio(3)', '42501', 'S10 el colaborador no usa el generador');
  perform pg_temp.como(null);
  perform pg_temp.falla(format('select public.fn_ejecutar_sorteo(%L)', wa), '42501', 'S10 anónimo no sortea');
  perform pg_temp.falla('select public.fn_reconocimientos()', '42501', 'S10 anónimo no ve reconocimientos');
  perform pg_temp.yo();

  -- S11 · Cierre programado de semanas vencidas
  x := app.cerrar_semanas_vencidas();
  perform pg_temp.ok(x >= 1 and (select closed_at is not null and closed_by is null from public.training_weeks where id = we), 'S11 cierre automático');
  perform pg_temp.ok((select closed_at is null from public.training_weeks where id = wd), 'S11 la semana en curso sigue abierta');

  -- S12 · Uniformidad del generador (6000 extracciones entre 3: cada una entre 1800 y 2200, ±5 desviaciones)
  v_cnt := array[0, 0, 0];
  for i in 1..6000 loop
    x := (app.indice_aleatorio(3)).indice;
    v_cnt[x + 1] := v_cnt[x + 1] + 1;
  end loop;
  perform pg_temp.ok(v_cnt[1] between 1800 and 2200 and v_cnt[2] between 1800 and 2200 and v_cnt[3] between 1800 and 2200,
                     format('S12 uniforme: %s / %s / %s', v_cnt[1], v_cnt[2], v_cnt[3]));
  perform pg_temp.ok((select bool_and((app.indice_aleatorio(1)).indice = 0) from generate_series(1, 50)), 'S12 con un solo participante siempre gana');
  perform pg_temp.ok((select bool_and(z.indice between 0 and 6 and length(z.bytes) % 4 = 0) from generate_series(1, 500), lateral app.indice_aleatorio(7) z), 'S12 rango y bytes correctos');

  raise notice '== Pruebas de cierre y sorteo: todas correctas ==';
end $$;

rollback;
