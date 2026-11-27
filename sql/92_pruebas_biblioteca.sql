-- =============================================================================
-- TRANSPORTES 360 · 92_pruebas_biblioteca.sql  (iteración 6: biblioteca documental y fuentes)
-- Datos ficticios (solo identificadores 00000000-…). Termina en ROLLBACK (en Supabase: con un error final a propósito).
-- En Supabase también prueba las políticas de Storage (en local no existe ese esquema y esa parte se omite).
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
create function pg_temp.archivo(p_sha text) returns jsonb language sql as $$
  select jsonb_build_object('nombre', 'Manual.docx', 'mime', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'tamano', 2048, 'sha256', p_sha)
$$;
/** En Supabase simula la subida del archivo a Storage (como el usuario, para que se apliquen las políticas). */
create function pg_temp.subir(p_ruta text) returns void language plpgsql as $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'insert into storage.objects (bucket_id, name, owner) values (''documentos'', $1, auth.uid())' using p_ruta;
  end if;
end $$;

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
  sha1 text := repeat('a', 64); sha2 text := repeat('b', 64); sha3 text := repeat('c', 64);
  d uuid; t uuid; r jsonb; v1 jsonb; v2 jsonb; f uuid; g uuid; al uuid; l uuid; v_cat uuid; hay_storage boolean := to_regclass('storage.objects') is not null; v_hoy date := app.hoy_cr();
begin
  select id into v_cat from public.knowledge_categories where slug = 'seguridad_trabajo';

  -- B1 · Permisos y clasificación
  perform pg_temp.como(c1);
  perform pg_temp.falla('select public.fn_docs()', 'NO_AUTORIZADO', 'B1 colaborador no ve la biblioteca');
  perform pg_temp.como(s1);
  perform pg_temp.falla('select public.fn_doc_buscar(''frenos'')', 'NO_AUTORIZADO', 'B1 supervisor tampoco');
  perform pg_temp.como(a2);
  perform pg_temp.falla('select public.fn_doc_guardar(''{"titulo": "Sin clasificar", "tipo": "MANUAL"}'')', 'VALIDACION', 'B1 clasificación obligatoria');
  perform pg_temp.falla('select public.fn_doc_guardar(''{"titulo": "Planilla", "tipo": "INTERNO", "acceso": "RESTRINGIDO", "ia": true}'')', 'VALIDACION', 'B1 RESTRINGIDO nunca con IA');
  d := public.fn_doc_guardar(jsonb_build_object('titulo', 'Manual de manejo defensivo', 'tipo', 'MANUAL', 'acceso', 'COLABORADORES', 'ia', true, 'category_id', v_cat, 'vigente_hasta', v_hoy + 365));

  -- B2 · Versiones: ruta reservada, huella única, texto y búsqueda
  v1 := public.fn_doc_version_iniciar(d, pg_temp.archivo(sha1));
  perform pg_temp.ok(v1 ->> 'ruta' = d || '/' || (v1 ->> 'id') || '.docx' and not (v1 ->> 'ya_existia')::boolean, 'B2 ruta reservada por el servidor');
  perform pg_temp.ok((public.fn_doc_version_iniciar(d, pg_temp.archivo(sha1)) ->> 'id') = v1 ->> 'id', 'B2 el mismo archivo no se duplica');
  perform pg_temp.falla(format('select public.fn_doc_version_iniciar(%L, %L)', d, pg_temp.archivo(sha2) || '{"mime": "application/x-msdownload"}'), '23514', 'B2 solo tipos permitidos');
  perform pg_temp.falla(format('select public.fn_doc_version_iniciar(%L, %L)', d, pg_temp.archivo(sha2) || '{"tamano": 30000000}'), '23514', 'B2 máximo 25 MB');
  if hay_storage then
    perform pg_temp.falla(format('select public.fn_doc_version_completar(%L, %L)', v1 ->> 'id', '{"fragmentos": []}'), 'VALIDACION', 'B2 sin archivo en Storage no se completa');
  end if;
  perform pg_temp.subir(v1 ->> 'ruta');
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_doc_version_completar(%L, %L)', v1 ->> 'id', '{"fragmentos": []}'), 'VALIDACION', 'B2 solo quien subió completa');
  perform pg_temp.como(a2);
  r := public.fn_doc_version_completar((v1 ->> 'id')::uuid, jsonb_build_object('paginas', 3, 'fragmentos', jsonb_build_array(
         jsonb_build_object('seccion', 'Frenado', 'texto', 'Mantenga una distancia de frenado de cuatro segundos cuando la carretera está mojada.'),
         jsonb_build_object('seccion', '', 'texto', '   '),
         jsonb_build_object('seccion', 'Fatiga', 'texto', 'Deténgase a descansar cada dos horas de conducción continua.'))));
  perform pg_temp.ok(r ->> 'estado' = 'LISTO' and (r ->> 'fragmentos')::int = 2, 'B2 texto registrado (vacíos descartados)');
  perform pg_temp.ok((public.fn_doc_version_completar((v1 ->> 'id')::uuid, '{"fragmentos": []}') ->> 'ya_existia')::boolean, 'B2 completar dos veces no cambia nada');
  r := public.fn_doc_buscar('distancias de frenado mojada');
  perform pg_temp.ok(jsonb_array_length(r) = 1 and r #>> '{0,seccion}' = 'Frenado' and r #>> '{0,extracto}' like '%«%', 'B2 búsqueda en español (plurales y marcas)');
  perform pg_temp.ok(public.fn_doc_buscar('') = '[]'::jsonb and public.fn_doc_buscar('xyzzy inexistente') = '[]'::jsonb, 'B2 búsqueda vacía o sin resultados');
  v2 := public.fn_doc_version_iniciar(d, pg_temp.archivo(sha2) || '{"etiqueta": "2027"}');
  perform pg_temp.subir(v2 ->> 'ruta');
  perform public.fn_doc_version_completar((v2 ->> 'id')::uuid, '{"fragmentos": [{"seccion": "Pausas", "texto": "Haga pausas activas en cada parada de entrega."}]}');
  perform pg_temp.ok(public.fn_doc_buscar('frenado') = '[]'::jsonb and jsonb_array_length(public.fn_doc_buscar('pausas')) = 1, 'B2 solo se busca en la versión vigente');
  r := public.fn_doc(d);
  perform pg_temp.ok(jsonb_array_length(r -> 'versiones') = 2 and r ->> 'version_actual' = v2 ->> 'id', 'B2 se conservan las dos versiones');
  perform pg_temp.yo();
  perform pg_temp.falla('update public.document_chunks set content = ''alterado''', 'INMUTABLE', 'B2 los fragmentos no se alteran');
  perform pg_temp.como(a2);

  -- B3 · Sin texto, archivar, temporales
  t := public.fn_doc_guardar('{"titulo": "Escaneo de prueba", "tipo": "OTRO", "acceso": "ADMIN", "temporal": true}');
  v1 := public.fn_doc_version_iniciar(t, jsonb_build_object('nombre', 'escaneo.pdf', 'mime', 'application/pdf', 'tamano', 5000, 'sha256', sha3));
  perform pg_temp.subir(v1 ->> 'ruta');
  r := public.fn_doc_version_completar((v1 ->> 'id')::uuid, '{"fragmentos": [], "nota": "PDF: extracción pendiente"}');
  perform pg_temp.ok(r ->> 'estado' = 'SIN_TEXTO', 'B3 PDF sin texto queda marcado, no se inventa');
  perform pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.fn_docs()) x where (x ->> 'id')::uuid = t)
                     and exists (select 1 from jsonb_array_elements(public.fn_docs(true)) x where (x ->> 'id')::uuid = t), 'B3 los temporales van aparte');
  perform pg_temp.falla(format('select public.fn_doc_guardar(%L)', jsonb_build_object('id', d, 'titulo', 'Manual', 'tipo', 'MANUAL', 'acceso', 'ADMIN', 'temporal', true)), 'VALIDACION', 'B3 un permanente no se vuelve temporal');
  perform pg_temp.yo();
  update public.knowledge_documents set purge_after = now() - interval '1 day' where id = t;
  perform pg_temp.ok(cardinality(app.purgar_temporales()) = 1, 'B3 purga devuelve la ruta del archivo a borrar');
  perform pg_temp.ok(not exists (select 1 from public.knowledge_documents where id = t), 'B3 los temporales vencidos se purgan');
  perform pg_temp.como(a2);
  perform pg_temp.falla(format('select public.fn_doc_estado(%L, ''OBSOLETO'', '''')', d), 'VALIDACION', 'B3 archivar exige motivo');

  -- B4 · Dominios confiables y fuentes externas
  perform pg_temp.como(s1);
  perform pg_temp.falla('select public.fn_dominio_guardar(''{"dominio": "cso.go.cr", "entidad": "CSO", "confiabilidad": "OFICIAL"}'')', 'NO_AUTORIZADO', 'B4 sin permiso no registra dominios');
  perform pg_temp.como(a3);
  perform pg_temp.falla('select public.fn_dominio_guardar(''{"dominio": "no es un dominio", "entidad": "X", "confiabilidad": "OFICIAL"}'')', 'VALIDACION', 'B4 dominio con formato válido');
  perform public.fn_dominio_guardar('{"dominio": "https://www.Ejemplo-Oficial.test", "entidad": "Entidad oficial de prueba", "confiabilidad": "OFICIAL"}');
  perform pg_temp.ok(public.fn_dominios() #>> '{0,dominio}' = 'ejemplo-oficial.test', 'B4 dominio normalizado');
  perform pg_temp.como(a2);
  perform pg_temp.falla('select public.fn_fuente_guardar(''{"entidad": "X", "titulo": "Aviso", "url": "http://inseguro.test/a"}'')', 'VALIDACION', 'B4 solo https');
  f := public.fn_fuente_guardar('{"entidad": "Entidad oficial", "titulo": "Aviso sobre estafas", "url": "https://avisos.ejemplo-oficial.test/estafas"}');
  g := public.fn_fuente_guardar('{"entidad": "Blog", "titulo": "Opinión", "url": "https://blog.cualquiera.test/x"}');
  perform pg_temp.falla('select public.fn_fuente_guardar(''{"entidad": "Otra", "titulo": "Duplicada", "url": "https://blog.cualquiera.test/x"}'')', 'VALIDACION', 'B4 la misma URL no se registra dos veces');
  r := public.fn_fuentes();
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = f and x ->> 'dominio_confiable' = 'ejemplo-oficial.test')
                     and exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = g and x -> 'dominio_confiable' = 'null'::jsonb), 'B4 reconoce subdominios de dominios confiables');
  perform pg_temp.falla(format('select public.fn_fuente_validar(%L, ''VALIDADA'')', f), 'VALIDACION', 'B4 quien la registró no la valida');
  perform pg_temp.como(a3);
  perform pg_temp.falla(format('select public.fn_fuente_validar(%L, ''RECHAZADA'')', g), 'VALIDACION', 'B4 rechazar exige motivo');
  perform public.fn_fuente_validar(g, 'RECHAZADA', 'No es una fuente oficial');
  r := public.fn_fuente_validar(f, 'VALIDADA');
  perform pg_temp.ok(not (r ->> 'validador_unico')::boolean and (r ->> 'dominio_confiable')::boolean, 'B4 otra persona valida');
  perform pg_temp.como(a2);
  perform public.fn_fuente_guardar(jsonb_build_object('id', f, 'entidad', 'Entidad oficial', 'titulo', 'Aviso sobre estafas', 'url', 'https://avisos.ejemplo-oficial.test/estafas', 'notas', 'Revisado'));
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.fn_fuentes('VALIDADA')) x where (x ->> 'id')::uuid = f), 'B4 cambiar solo notas no la invalida');
  perform public.fn_fuente_guardar(jsonb_build_object('id', g, 'entidad', 'Blog', 'titulo', 'Opinión corregida', 'url', 'https://blog.cualquiera.test/x'));
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(public.fn_fuentes('PENDIENTE')) x where (x ->> 'id')::uuid = g), 'B4 cambiar el contenido la devuelve a pendiente');

  -- B5 · Vínculos de fuente a contenido
  al := public.fn_admin_alerta_guardar(jsonb_build_object('category_id', v_cat, 'prioridad', 'ALTA', 'titulo', 'Alerta con fuente'));
  perform pg_temp.falla(format('select public.fn_vincular(%L)', jsonb_build_object('tipo', 'alerta', 'id', al, 'fuente_id', g)), 'VALIDACION', 'B5 no se vincula una fuente sin validar');
  l := public.fn_vincular(jsonb_build_object('tipo', 'alerta', 'id', al, 'fuente_id', f));
  perform pg_temp.falla(format('select public.fn_vincular(%L)', jsonb_build_object('tipo', 'alerta', 'id', al, 'fuente_id', f)), 'VALIDACION', 'B5 sin vínculos repetidos');
  perform pg_temp.falla(format('select public.fn_vincular(%L)', jsonb_build_object('tipo', 'alerta', 'id', al, 'documento_id', d, 'extracto', 'Texto que el documento nunca dijo')), 'VALIDACION', 'B5 extracto inventado rechazado');
  perform public.fn_vincular(jsonb_build_object('tipo', 'alerta', 'id', al, 'documento_id', d, 'seccion', 'Pausas', 'extracto', 'haga  PAUSAS activas en cada parada'));
  r := public.fn_vinculos('alerta', al);
  perform pg_temp.ok(jsonb_array_length(r) = 2 and r #>> '{0,estado}' = 'VALIDADA' and r #>> '{1,estado}' = 'VIGENTE', 'B5 fuentes del contenido con su estado');
  perform pg_temp.como(c1);
  perform pg_temp.falla(format('select public.fn_vinculos(''alerta'', %L)', al), 'NO_AUTORIZADO', 'B5 colaborador no ve ni edita vínculos');
  perform pg_temp.como(a2);
  perform public.fn_desvincular(l);
  perform pg_temp.ok(jsonb_array_length(public.fn_vinculos('alerta', al)) = 1, 'B5 desvincular');
  perform public.fn_doc_estado(d, 'OBSOLETO', 'Reemplazado por otro manual');
  perform pg_temp.ok(public.fn_vinculos('alerta', al) #>> '{0,estado}' = 'NO_VIGENTE' and public.fn_doc_buscar('pausas') = '[]'::jsonb, 'B5 un documento obsoleto se marca y deja de buscarse');

  -- B6 · Acceso directo, anónimo y Storage
  perform pg_temp.falla('select count(*) from public.knowledge_documents', '42501', 'B6 documentos solo por RPC');
  perform pg_temp.falla('select count(*) from public.document_chunks', '42501', 'B6 texto solo por RPC');
  perform pg_temp.falla('select count(*) from public.external_sources', '42501', 'B6 fuentes solo por RPC');
  if hay_storage then
    perform pg_temp.falla('insert into storage.objects (bucket_id, name, owner) values (''documentos'', ''cualquier/ruta.pdf'', auth.uid())', '42501', 'B6 Storage: no se sube fuera de la ruta reservada');
    perform pg_temp.ok((select count(*) from storage.objects where bucket_id = 'documentos' and name like d || '/%') = 2, 'B6 Storage: quien gestiona documentos los ve');
    perform pg_temp.como(c1);
    perform pg_temp.ok((select count(*) from storage.objects where bucket_id = 'documentos') = 0, 'B6 Storage: un colaborador no ve ningún archivo');
    perform pg_temp.falla(format('insert into storage.objects (bucket_id, name, owner) values (''documentos'', %L, auth.uid())', d || '/x.pdf'), '42501', 'B6 Storage: un colaborador no sube');
    perform pg_temp.yo();
    perform pg_temp.ok((select not public and file_size_limit = 26214400 from storage.buckets where id = 'documentos'), 'B6 Storage: bucket privado de 25 MB');
  end if;
  perform pg_temp.como(null);
  perform pg_temp.falla('select public.fn_docs()', '42501', 'B6 anónimo no ve nada');
  perform pg_temp.yo();
  perform pg_temp.ok((select count(*) from public.audit_logs where action like 'DOCUMENTO%' or action like 'FUENTE%' or action like 'DOMINIO%') >= 8, 'B6 todo auditado');

  raise notice '== Pruebas de biblioteca y fuentes: todas correctas (% comprobaciones) ==', current_setting('t360.n', true);
end $$;

rollback;
