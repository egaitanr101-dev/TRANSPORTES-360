-- =============================================================================
-- TRANSPORTES 360 · 09_biblioteca.sql  (Fase 3 · iteración 6: biblioteca documental y fuentes)
-- Crea: knowledge_documents, document_versions, document_chunks (búsqueda de texto completo en español, D-12),
--       trusted_domains, external_sources, content_source_links y sus RPC. En Supabase: bucket PRIVADO "documentos"
--       con sus políticas (se omite donde no existe el esquema storage, como en las pruebas locales).
-- Modifica: nada existente. Reversión: sql/reversion/09_biblioteca.down.sql
-- Reglas (MODELO_DATOS §5.6–5.7, RIESGOS R-03, R-41, R-50, R-52, R-54):
--   * Bucket privado; se descarga solo con URL firmada de vida corta, y solo quien gestiona documentos.
--   * Un archivo solo se puede subir a la ruta que el servidor reservó para esa versión. Nada se reemplaza ni se borra:
--     una versión nueva es otro archivo. El mismo archivo (misma huella SHA-256) no se procesa dos veces.
--   * RESTRINGIDO nunca se puede usar con IA. Clasificación obligatoria al subir.
--   * Las fuentes externas solo son https; las valida alguien distinto de quien las registró (salvo único validador).
-- =============================================================================
begin;

create table public.knowledge_documents (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(trim(title)) between 3 and 200),
  category_id        uuid references public.knowledge_categories (id),
  description        text not null default '' check (char_length(description) <= 1000),
  doc_type           text not null check (doc_type in ('PROCEDIMIENTO', 'POLITICA', 'MANUAL', 'REGLAMENTO', 'GUIA', 'INTERNO', 'CAPACITACION', 'OTRO')),
  access_level       text not null check (access_level in ('COLABORADORES', 'ADMIN', 'RESTRINGIDO')),
  origin             text not null default '' check (char_length(origin) <= 200),
  status             text not null default 'ACTIVO' check (status in ('ACTIVO', 'ARCHIVADO', 'OBSOLETO')),
  valid_from         date,
  valid_until        date check (valid_until is null or valid_from is null or valid_until >= valid_from),
  is_temporary       boolean not null default false,
  purge_after        timestamptz,
  ai_allowed         boolean not null default false,
  current_version_id uuid,
  created_by         uuid not null references public.profiles (id),
  updated_by         uuid not null references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint documento_restringido_sin_ia check (not (access_level = 'RESTRINGIDO' and ai_allowed)),
  constraint documento_temporal_purga check (is_temporary = (purge_after is not null))
);
create index knowledge_documents_category_idx on public.knowledge_documents (category_id);
create index knowledge_documents_created_by_idx on public.knowledge_documents (created_by);
create index knowledge_documents_updated_by_idx on public.knowledge_documents (updated_by);
create trigger knowledge_documents_updated_at before update on public.knowledge_documents for each row execute function app.tg_updated_at();

create table public.document_versions (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.knowledge_documents (id),
  version_label     text not null check (char_length(trim(version_label)) between 1 and 40),
  storage_path      text not null unique,
  file_name         text not null check (char_length(file_name) between 1 and 200),
  mime_type         text not null check (mime_type in ('application/pdf', 'text/plain',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  size_bytes        int not null check (size_bytes between 1 and 26214400),
  sha256            text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'SUBIENDO' check (processing_status in ('SUBIENDO', 'LISTO', 'SIN_TEXTO', 'ERROR')),
  page_count        int check (page_count between 0 and 5000),
  chunk_count       int not null default 0,
  note              text check (char_length(note) <= 300),
  uploaded_by       uuid not null references public.profiles (id),
  uploaded_at       timestamptz not null default now(),
  completed_at      timestamptz,
  unique (document_id, sha256)
);
create index document_versions_uploaded_by_idx on public.document_versions (uploaded_by);
alter table public.knowledge_documents add constraint knowledge_documents_version_fk foreign key (current_version_id) references public.document_versions (id);
create index knowledge_documents_version_idx on public.knowledge_documents (current_version_id);

create table public.document_chunks (
  id            bigint generated always as identity primary key,
  version_id    uuid not null references public.document_versions (id),
  chunk_index   int not null check (chunk_index >= 0),
  section_title text not null default '' check (char_length(section_title) <= 200),
  content       text not null check (char_length(content) between 1 and 4000),
  tsv           tsvector generated always as (to_tsvector('pg_catalog.spanish'::regconfig, section_title || ' ' || content)) stored,
  unique (version_id, chunk_index)
);
create index document_chunks_tsv_idx on public.document_chunks using gin (tsv);
create trigger document_chunks_inmutable before update or delete on public.document_chunks for each row execute function app.tg_inmutable();

create table public.trusted_domains (
  domain       text primary key check (domain ~ '^([a-z0-9-]+\.)+[a-z]{2,}$'),
  entity_name  text not null check (char_length(trim(entity_name)) between 2 and 160),
  country      text not null default 'CR' check (country ~ '^[A-Z]{2}$|^INT$'),
  reliability  text not null check (reliability in ('OFICIAL', 'RECONOCIDA')),
  is_active    boolean not null default true,
  validated_by uuid not null references public.profiles (id),
  validated_at timestamptz not null default now()
);
create index trusted_domains_validated_by_idx on public.trusted_domains (validated_by);

create table public.external_sources (
  id                uuid primary key default gen_random_uuid(),
  entity_name       text not null check (char_length(trim(entity_name)) between 2 and 160),
  resource_title    text not null check (char_length(trim(resource_title)) between 3 and 300),
  url               text not null unique check (url ~ '^https://[^\s<>"]+$' and char_length(url) <= 500),
  domain            text not null,
  published_on      date,
  consulted_on      date not null,
  category_id       uuid references public.knowledge_categories (id),
  validation_status text not null default 'PENDIENTE' check (validation_status in ('PENDIENTE', 'VALIDADA', 'RECHAZADA')),
  notes             text not null default '' check (char_length(notes) <= 500),
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  validated_by      uuid references public.profiles (id),
  validated_at      timestamptz
);
create index external_sources_category_idx on public.external_sources (category_id);
create index external_sources_created_by_idx on public.external_sources (created_by);
create index external_sources_validated_by_idx on public.external_sources (validated_by);

create table public.content_source_links (
  id                  uuid primary key default gen_random_uuid(),
  week_id             uuid references public.training_weeks (id) on delete cascade,
  alert_id            uuid references public.alerts (id) on delete cascade,
  tip_id              uuid references public.tips (id) on delete cascade,
  external_source_id  uuid references public.external_sources (id),
  document_version_id uuid references public.document_versions (id),
  page_or_section     text not null default '' check (char_length(page_or_section) <= 100),
  excerpt             text not null default '' check (char_length(excerpt) <= 500),
  created_by          uuid not null references public.profiles (id),
  created_at          timestamptz not null default now(),
  constraint vinculo_un_contenido check (num_nonnulls(week_id, alert_id, tip_id) = 1),
  constraint vinculo_una_fuente check (num_nonnulls(external_source_id, document_version_id) = 1)
);
create unique index content_source_links_unico_idx on public.content_source_links
  (coalesce(week_id, alert_id, tip_id), coalesce(external_source_id, document_version_id));
create index content_source_links_week_idx on public.content_source_links (week_id);
create index content_source_links_alert_idx on public.content_source_links (alert_id);
create index content_source_links_tip_idx on public.content_source_links (tip_id);
create index content_source_links_source_idx on public.content_source_links (external_source_id);
create index content_source_links_version_idx on public.content_source_links (document_version_id);
create index content_source_links_created_by_idx on public.content_source_links (created_by);

alter table public.knowledge_documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_chunks enable row level security;
alter table public.trusted_domains enable row level security;
alter table public.external_sources enable row level security;
alter table public.content_source_links enable row level security;
revoke all on public.knowledge_documents, public.document_versions, public.document_chunks, public.trusted_domains,
              public.external_sources, public.content_source_links from public, anon, authenticated;

/* ===================== Utilidades ===================== */
create or replace function app.extension_de(p_mime text)
returns text language sql immutable set search_path = '' as $$
  select case p_mime when 'application/pdf' then 'pdf' when 'text/plain' then 'txt'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx' else 'pptx' end
$$;

/** Dominio de una URL https (en minúsculas, sin "www."). */
create or replace function app.dominio_de(p_url text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(substring(p_url from '^https://([^/:?#]+)')), '^www\.', '')
$$;

/** ¿El dominio (o uno de sus padres) está registrado y activo? Devuelve el dominio de confianza que lo cubre. */
create or replace function app.dominio_confiable(p_dominio text)
returns text language sql stable security definer set search_path = '' as $$
  select t.domain from public.trusted_domains t
   where t.is_active and (p_dominio = t.domain or p_dominio like '%.' || t.domain)
   order by char_length(t.domain) desc limit 1
$$;

/** Usado por la política de Storage: solo se sube a la ruta reservada, por quien la reservó, mientras está "subiendo". */
create or replace function app.doc_puede_subir(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.tiene_permiso('documentos.gestionar') and exists (
    select 1 from public.document_versions v where v.storage_path = p_ruta and v.processing_status = 'SUBIENDO' and v.uploaded_by = auth.uid())
$$;

/* ===================== Biblioteca ===================== */
create or replace function public.fn_docs(p_temporales boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir('documentos.gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.title, 'tipo', d.doc_type, 'acceso', d.access_level, 'estado', d.status,
      'categoria', k.name, 'ia', d.ai_allowed, 'temporal', d.is_temporary, 'vigente_hasta', d.valid_until,
      'vencido', d.valid_until is not null and d.valid_until < app.hoy_cr(),
      'version', v.version_label, 'procesado', v.processing_status, 'fragmentos', v.chunk_count, 'archivo', v.file_name, 'actualizado', d.updated_at) order by d.updated_at desc)
    from public.knowledge_documents d
    left join public.knowledge_categories k on k.id = d.category_id
    left join public.document_versions v on v.id = d.current_version_id
   where d.is_temporary = coalesce(p_temporales, false)), '[]'::jsonb);
end $$;

create or replace function public.fn_doc(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.knowledge_documents;
begin
  perform app.exigir('documentos.gestionar');
  select * into d from public.knowledge_documents where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Documento no encontrado.'); end if;
  return jsonb_build_object('id', d.id, 'titulo', d.title, 'category_id', d.category_id, 'descripcion', d.description, 'tipo', d.doc_type, 'acceso', d.access_level,
    'origen', d.origin, 'estado', d.status, 'vigente_desde', d.valid_from, 'vigente_hasta', d.valid_until, 'temporal', d.is_temporary, 'purga', d.purge_after,
    'ia', d.ai_allowed, 'version_actual', d.current_version_id,
    'versiones', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'etiqueta', v.version_label, 'archivo', v.file_name, 'tipo', app.extension_de(v.mime_type), 'tamano', v.size_bytes,
        'sha256', v.sha256, 'estado', v.processing_status, 'paginas', v.page_count, 'fragmentos', v.chunk_count, 'nota', v.note, 'ruta', v.storage_path,
        'subido_por', p.full_name, 'subido', v.uploaded_at) order by v.uploaded_at desc)
      from public.document_versions v join public.profiles p on p.id = v.uploaded_by where v.document_id = d.id), '[]'::jsonb),
    'usos', (select count(*) from public.content_source_links l join public.document_versions v on v.id = l.document_version_id where v.document_id = d.id));
end $$;

/** Crea o actualiza los datos del documento (no el archivo). */
create or replace function public.fn_doc_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); d public.knowledge_documents; v_temp boolean := coalesce((p ->> 'temporal')::boolean, false); v_era boolean;
begin
  perform app.exigir('documentos.gestionar');
  perform app.validar(p ->> 'acceso' in ('COLABORADORES', 'ADMIN', 'RESTRINGIDO'), 'Clasifique el acceso del documento.');
  perform app.validar(not (p ->> 'acceso' = 'RESTRINGIDO' and coalesce((p ->> 'ia')::boolean, false)), 'Un documento RESTRINGIDO no se puede usar con IA.');
  if nullif(p ->> 'id', '') is null then
    insert into public.knowledge_documents (title, doc_type, access_level, is_temporary, purge_after, created_by, updated_by)
    values (trim(p ->> 'titulo'), p ->> 'tipo', p ->> 'acceso', v_temp, case when v_temp then now() + interval '30 days' end, v_actor.id, v_actor.id) returning * into d;
  else
    select * into d from public.knowledge_documents where id = (p ->> 'id')::uuid for update;
    if not found then perform app.error('NO_ENCONTRADO', 'Documento no encontrado.'); end if;
    perform app.validar(d.is_temporary = v_temp or not v_temp, 'Un documento permanente no se vuelve temporal.');
  end if;
  v_era := d.is_temporary;
  update public.knowledge_documents set
    title = trim(p ->> 'titulo'), category_id = nullif(p ->> 'category_id', '')::uuid, description = trim(coalesce(p ->> 'descripcion', '')),
    doc_type = p ->> 'tipo', access_level = p ->> 'acceso', origin = trim(coalesce(p ->> 'origen', '')),
    valid_from = nullif(p ->> 'vigente_desde', '')::date, valid_until = nullif(p ->> 'vigente_hasta', '')::date,
    ai_allowed = coalesce((p ->> 'ia')::boolean, false), is_temporary = v_temp, purge_after = case when v_temp then coalesce(purge_after, now() + interval '30 days') end,
    updated_by = v_actor.id
  where id = d.id returning * into d;
  perform app.auditar(case when v_era and not v_temp then 'DOCUMENTO_PERMANENTE' else 'DOCUMENTO_GUARDADO' end, 'knowledge_document', d.id::text,
                      jsonb_build_object('acceso', d.access_level, 'ia', d.ai_allowed, 'temporal', d.is_temporary));
  return d.id;
end $$;

/** Reserva la ruta para subir un archivo. Si el mismo archivo ya está en el documento, lo devuelve sin duplicarlo. */
create or replace function public.fn_doc_version_iniciar(p_doc uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); d public.knowledge_documents; v public.document_versions; v_id uuid := gen_random_uuid();
begin
  perform app.exigir('documentos.gestionar');
  select * into d from public.knowledge_documents where id = p_doc for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Documento no encontrado.'); end if;
  perform app.validar(d.status = 'ACTIVO', 'El documento está archivado u obsoleto.');
  select * into v from public.document_versions where document_id = d.id and sha256 = lower(p ->> 'sha256');
  if found then return jsonb_build_object('id', v.id, 'ruta', v.storage_path, 'estado', v.processing_status, 'ya_existia', true); end if;
  insert into public.document_versions (id, document_id, version_label, storage_path, file_name, mime_type, size_bytes, sha256, uploaded_by)
  values (v_id, d.id, trim(coalesce(nullif(p ->> 'etiqueta', ''), 'v' || ((select count(*) from public.document_versions where document_id = d.id) + 1))),
          d.id || '/' || v_id || '.' || app.extension_de(p ->> 'mime'), left(trim(p ->> 'nombre'), 200), p ->> 'mime', (p ->> 'tamano')::int, lower(p ->> 'sha256'), v_actor.id)
  returning * into v;
  return jsonb_build_object('id', v.id, 'ruta', v.storage_path, 'estado', v.processing_status, 'ya_existia', false);
end $$;

/** Registra el texto extraído en el navegador del administrador (D-11) y deja la versión como vigente.
    Exige que el archivo ya esté en Storage. Sin texto (PDF o escaneo) queda como SIN_TEXTO: se guarda, pero no se busca. */
create or replace function public.fn_doc_version_completar(p_version uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.document_versions; f jsonb; n int := 0; v_total int := 0; v_estado text;
begin
  perform app.exigir('documentos.gestionar');
  select * into v from public.document_versions where id = p_version for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Versión no encontrada.'); end if;
  if v.processing_status <> 'SUBIENDO' then return jsonb_build_object('estado', v.processing_status, 'fragmentos', v.chunk_count, 'ya_existia', true); end if;
  perform app.validar(v.uploaded_by = auth.uid(), 'Solo quien subió el archivo completa su registro.');
  if to_regclass('storage.objects') is not null then
    perform app.validar(exists (select 1 from storage.objects o where o.bucket_id = 'documentos' and o.name = v.storage_path), 'El archivo todavía no se subió.');
  end if;
  perform app.validar(jsonb_typeof(coalesce(p -> 'fragmentos', '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(p -> 'fragmentos', '[]'::jsonb)) <= 3000, 'Demasiados fragmentos.');
  for f in select * from jsonb_array_elements(coalesce(p -> 'fragmentos', '[]'::jsonb)) loop
    if char_length(trim(coalesce(f ->> 'texto', ''))) = 0 then continue; end if;
    perform app.validar(char_length(f ->> 'texto') <= 4000 and char_length(coalesce(f ->> 'seccion', '')) <= 200, 'Un fragmento es demasiado largo.');
    v_total := v_total + char_length(f ->> 'texto');
    insert into public.document_chunks (version_id, chunk_index, section_title, content) values (v.id, n, trim(coalesce(f ->> 'seccion', '')), trim(f ->> 'texto'));
    n := n + 1;
  end loop;
  perform app.validar(v_total <= 3000000, 'El texto extraído es demasiado grande.');
  v_estado := case when n > 0 then 'LISTO' else 'SIN_TEXTO' end;
  update public.document_versions set processing_status = v_estado, chunk_count = n, completed_at = now(),
         page_count = nullif(p ->> 'paginas', '')::int, note = left(nullif(trim(p ->> 'nota'), ''), 300)
   where id = v.id returning * into v;
  update public.knowledge_documents set current_version_id = v.id, updated_by = auth.uid() where id = v.document_id;
  perform app.auditar('DOCUMENTO_VERSION', 'knowledge_document', v.document_id::text, jsonb_build_object('version', v.version_label, 'sha256', v.sha256, 'fragmentos', n));
  return jsonb_build_object('estado', v.processing_status, 'fragmentos', n, 'ya_existia', false);
end $$;

create or replace function public.fn_doc_estado(p_id uuid, p_estado text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.knowledge_documents;
begin
  perform app.exigir('documentos.gestionar');
  perform app.validar(p_estado in ('ACTIVO', 'ARCHIVADO', 'OBSOLETO'), 'Estado no válido.');
  perform app.validar(char_length(trim(coalesce(p_motivo, ''))) >= 5, 'Explique el motivo.');
  update public.knowledge_documents set status = p_estado, updated_by = auth.uid() where id = p_id returning * into d;
  if not found then perform app.error('NO_ENCONTRADO', 'Documento no encontrado.'); end if;
  perform app.auditar('DOCUMENTO_' || p_estado, 'knowledge_document', d.id::text, jsonb_build_object('motivo', trim(p_motivo)));
end $$;

/** Búsqueda en la versión vigente de los documentos activos (texto completo en español). */
create or replace function public.fn_doc_buscar(p_texto text, p_categoria uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q tsquery := websearch_to_tsquery('pg_catalog.spanish', left(coalesce(p_texto, ''), 200));
begin
  perform app.exigir('documentos.gestionar');
  if numnode(q) = 0 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(r order by (r ->> 'rango')::real desc) from (
    select jsonb_build_object('documento', d.id, 'titulo', d.title, 'version', v.version_label, 'seccion', c.section_title, 'acceso', d.access_level, 'ia', d.ai_allowed,
             'vencido', d.valid_until is not null and d.valid_until < app.hoy_cr(), 'fragmento', c.chunk_index,
             'extracto', ts_headline('pg_catalog.spanish', c.content, q, 'StartSel=«,StopSel=»,MaxWords=40,MinWords=15,MaxFragments=2'),
             'rango', ts_rank(c.tsv, q)) as r
      from public.document_chunks c
      join public.document_versions v on v.id = c.version_id
      join public.knowledge_documents d on d.current_version_id = v.id
     where c.tsv @@ q and d.status = 'ACTIVO' and not d.is_temporary and (p_categoria is null or d.category_id = p_categoria)
     order by ts_rank(c.tsv, q) desc limit 30) x), '[]'::jsonb);
end $$;

/** Borra los documentos temporales vencidos (para el proceso programado de la iteración 8). Los archivos en Storage
    se borran con la API de Storage; aquí se devuelven sus rutas. Nunca borra uno que esté citado como fuente. */
create or replace function app.purgar_temporales()
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_rutas text[]; v_docs uuid[];
begin
  select array_agg(d.id) into v_docs from public.knowledge_documents d
   where d.is_temporary and d.purge_after < now()
     and not exists (select 1 from public.content_source_links l join public.document_versions v on v.id = l.document_version_id where v.document_id = d.id);
  if v_docs is null then return '{}'; end if;
  select array_agg(storage_path) into v_rutas from public.document_versions where document_id = any (v_docs);
  update public.knowledge_documents set current_version_id = null where id = any (v_docs);
  alter table public.document_chunks disable trigger document_chunks_inmutable;
  delete from public.document_chunks where version_id in (select id from public.document_versions where document_id = any (v_docs));
  alter table public.document_chunks enable trigger document_chunks_inmutable;
  delete from public.document_versions where document_id = any (v_docs);
  delete from public.knowledge_documents where id = any (v_docs);
  perform app.auditar('DOCUMENTOS_TEMPORALES_PURGADOS', 'knowledge_document', 'temporales', jsonb_build_object('cantidad', cardinality(v_docs)), null);
  return coalesce(v_rutas, '{}');
end $$;

/* ===================== Dominios y fuentes ===================== */
create or replace function public.fn_dominios()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('dominio', t.domain, 'entidad', t.entity_name, 'pais', t.country, 'confiabilidad', t.reliability, 'activo', t.is_active,
      'validado_por', p.full_name, 'validado', t.validated_at) order by t.entity_name) from public.trusted_domains t join public.profiles p on p.id = t.validated_by), '[]'::jsonb);
end $$;

/** Un dominio entra a la lista solo por decisión de una persona (nunca desde la IA). */
create or replace function public.fn_dominio_guardar(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_dom text := regexp_replace(lower(trim(p ->> 'dominio')), '^(https?://)?(www\.)?', '');
begin
  perform app.exigir('fuentes.validar');
  perform app.validar(v_dom ~ '^([a-z0-9-]+\.)+[a-z]{2,}$', 'Escriba solo el dominio, por ejemplo ministeriodesalud.go.cr.');
  insert into public.trusted_domains (domain, entity_name, country, reliability, is_active, validated_by)
  values (v_dom, trim(p ->> 'entidad'), coalesce(nullif(p ->> 'pais', ''), 'CR'), p ->> 'confiabilidad', coalesce((p ->> 'activo')::boolean, true), auth.uid())
  on conflict (domain) do update set entity_name = excluded.entity_name, country = excluded.country, reliability = excluded.reliability,
         is_active = excluded.is_active, validated_by = excluded.validated_by, validated_at = now();
  perform app.auditar('DOMINIO_CONFIABLE', 'trusted_domain', v_dom, p);
end $$;

create or replace function public.fn_fuentes(p_estado text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'entidad', f.entity_name, 'titulo', f.resource_title, 'url', f.url, 'dominio', f.domain,
      'dominio_confiable', app.dominio_confiable(f.domain), 'publicada', f.published_on, 'consultada', f.consulted_on, 'categoria', k.name, 'estado', f.validation_status,
      'notas', f.notes, 'registrada_por', c.full_name, 'mia', f.created_by = auth.uid(), 'validada_por', v.full_name, 'validada', f.validated_at,
      'usos', (select count(*) from public.content_source_links l where l.external_source_id = f.id)) order by f.created_at desc)
    from public.external_sources f
    left join public.knowledge_categories k on k.id = f.category_id
    join public.profiles c on c.id = f.created_by
    left join public.profiles v on v.id = f.validated_by
   where p_estado is null or f.validation_status = p_estado), '[]'::jsonb);
end $$;

create or replace function public.fn_fuente_guardar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles := app.actor(); f public.external_sources; v_url text := trim(p ->> 'url');
begin
  perform app.exigir('contenido.crear_editar');
  perform app.validar(v_url ~ '^https://[^\s<>"]+$', 'La dirección debe empezar con https://');
  if nullif(p ->> 'id', '') is null then
    perform app.validar(not exists (select 1 from public.external_sources where url = v_url), 'Esa fuente ya está registrada.');
    insert into public.external_sources (entity_name, resource_title, url, domain, consulted_on, created_by)
    values (trim(p ->> 'entidad'), trim(p ->> 'titulo'), v_url, app.dominio_de(v_url), coalesce(nullif(p ->> 'consultada', '')::date, app.hoy_cr()), v_actor.id) returning * into f;
  else
    select * into f from public.external_sources where id = (p ->> 'id')::uuid for update;
    if not found then perform app.error('NO_ENCONTRADO', 'Fuente no encontrada.'); end if;
  end if;
  -- Cambiar el contenido de una fuente la devuelve a PENDIENTE: hay que validarla de nuevo
  update public.external_sources set entity_name = trim(p ->> 'entidad'), resource_title = trim(p ->> 'titulo'), url = v_url, domain = app.dominio_de(v_url),
         published_on = nullif(p ->> 'publicada', '')::date, consulted_on = coalesce(nullif(p ->> 'consultada', '')::date, consulted_on),
         category_id = nullif(p ->> 'category_id', '')::uuid, notes = trim(coalesce(p ->> 'notas', '')),
         validation_status = case when url is distinct from v_url or entity_name is distinct from trim(p ->> 'entidad') or resource_title is distinct from trim(p ->> 'titulo') then 'PENDIENTE' else validation_status end,
         validated_by = case when url is distinct from v_url or entity_name is distinct from trim(p ->> 'entidad') or resource_title is distinct from trim(p ->> 'titulo') then null else validated_by end
   where id = f.id returning * into f;
  perform app.auditar('FUENTE_GUARDADA', 'external_source', f.id::text, jsonb_build_object('url', f.url, 'estado', f.validation_status));
  return f.id;
end $$;

/** Validar o rechazar. Quien la registró no la valida, salvo que sea la única persona que puede (queda marcado). */
create or replace function public.fn_fuente_validar(p_id uuid, p_estado text, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.external_sources; v_unico boolean;
begin
  perform app.exigir('fuentes.validar');
  perform app.validar(p_estado in ('VALIDADA', 'RECHAZADA'), 'Decisión no válida.');
  select * into f from public.external_sources where id = p_id for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Fuente no encontrada.'); end if;
  if p_estado = 'RECHAZADA' then perform app.validar(char_length(trim(coalesce(p_notas, ''))) >= 5, 'Explique por qué se rechaza.'); end if;
  v_unico := app.cuatro_ojos(array[f.created_by], 'fuentes.validar');
  update public.external_sources set validation_status = p_estado, validated_by = auth.uid(), validated_at = now(),
         notes = case when nullif(trim(p_notas), '') is null then notes else left(trim(p_notas), 500) end where id = f.id;
  perform app.auditar('FUENTE_' || p_estado, 'external_source', f.id::text, jsonb_build_object('url', f.url, 'dominio_confiable', app.dominio_confiable(f.domain), 'validador_unico', v_unico));
  return jsonb_build_object('estado', p_estado, 'validador_unico', v_unico, 'dominio_confiable', app.dominio_confiable(f.domain) is not null);
end $$;

/* ===================== Fuentes de cada contenido ===================== */
create or replace function public.fn_vinculos(p_tipo text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_editorial();
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'tipo', case when l.external_source_id is null then 'documento' else 'externa' end,
      'nombre', coalesce(f.entity_name || ' · ' || f.resource_title, d.title || ' (' || v.version_label || ')'), 'url', f.url,
      'estado', coalesce(f.validation_status, case when d.status = 'ACTIVO' and d.current_version_id = v.id then 'VIGENTE' else 'NO_VIGENTE' end),
      'seccion', l.page_or_section, 'extracto', l.excerpt) order by l.created_at)
    from public.content_source_links l
    left join public.external_sources f on f.id = l.external_source_id
    left join public.document_versions v on v.id = l.document_version_id
    left join public.knowledge_documents d on d.id = v.document_id
   where (p_tipo = 'semana' and l.week_id = p_id) or (p_tipo = 'alerta' and l.alert_id = p_id) or (p_tipo = 'consejo' and l.tip_id = p_id)), '[]'::jsonb);
end $$;

/** Vincula una fuente a una semana, alerta o consejo. Solo fuentes VALIDADAS o documentos vigentes y activos;
    el extracto de un documento debe aparecer en su texto (no se aceptan citas inventadas). */
create or replace function public.fn_vincular(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ver uuid; v_ext text := trim(coalesce(p ->> 'extracto', ''));
begin
  perform app.exigir('contenido.crear_editar');
  perform app.validar(p ->> 'tipo' in ('semana', 'alerta', 'consejo'), 'Contenido no válido.');
  if nullif(p ->> 'fuente_id', '') is not null then
    perform app.validar(exists (select 1 from public.external_sources where id = (p ->> 'fuente_id')::uuid and validation_status = 'VALIDADA'), 'Solo se vinculan fuentes validadas.');
  else
    select d.current_version_id into v_ver from public.knowledge_documents d
     where d.id = (p ->> 'documento_id')::uuid and d.status = 'ACTIVO' and not d.is_temporary and d.current_version_id is not null;
    perform app.validar(v_ver is not null, 'El documento no está activo o no tiene versión vigente.');
    perform app.validar(v_ext = '' or exists (select 1 from public.document_chunks c where c.version_id = v_ver
                          and position(lower(regexp_replace(v_ext, '\s+', ' ', 'g')) in lower(regexp_replace(c.content, '\s+', ' ', 'g'))) > 0),
                        'El extracto no aparece en el documento. Copie el texto tal como está.');
  end if;
  insert into public.content_source_links (week_id, alert_id, tip_id, external_source_id, document_version_id, page_or_section, excerpt, created_by)
  values (case when p ->> 'tipo' = 'semana' then (p ->> 'id')::uuid end, case when p ->> 'tipo' = 'alerta' then (p ->> 'id')::uuid end,
          case when p ->> 'tipo' = 'consejo' then (p ->> 'id')::uuid end, nullif(p ->> 'fuente_id', '')::uuid, v_ver,
          trim(coalesce(p ->> 'seccion', '')), v_ext, auth.uid())
  returning id into v_id;
  perform app.auditar('FUENTE_VINCULADA', p ->> 'tipo', p ->> 'id', jsonb_build_object('fuente', p ->> 'fuente_id', 'documento', p ->> 'documento_id'));
  return v_id;
exception when unique_violation then
  perform app.error('VALIDACION', 'Esa fuente ya está vinculada.');
end $$;

create or replace function public.fn_desvincular(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('contenido.crear_editar');
  delete from public.content_source_links where id = p_id;
  if not found then perform app.error('NO_ENCONTRADO', 'Vínculo no encontrado.'); end if;
  perform app.auditar('FUENTE_DESVINCULADA', 'content_source_link', p_id::text, '{}'::jsonb);
end $$;

/* ===================== Storage (solo en Supabase) ===================== */
do $do$
begin
  if to_regclass('storage.objects') is null then raise notice 'Sin esquema storage (pruebas locales): se omite el bucket.'; return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos', 'documentos', false, 26214400, array['application/pdf', 'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
  on conflict (id) do nothing;
  execute $p$create policy t360_documentos_subir on storage.objects for insert to authenticated
            with check (bucket_id = 'documentos' and app.doc_puede_subir(name))$p$;
  execute $p$create policy t360_documentos_leer on storage.objects for select to authenticated
            using (bucket_id = 'documentos' and app.tiene_permiso('documentos.gestionar'))$p$;
end $do$;

/* ===================== Ejecución ===================== */
revoke execute on all functions in schema app from public, anon;
grant execute on function app.permiso_de(uuid, text), app.tiene_permiso(text), app.doc_puede_subir(text) to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.fn_docs(boolean), public.fn_doc(uuid), public.fn_doc_guardar(jsonb), public.fn_doc_version_iniciar(uuid, jsonb),
  public.fn_doc_version_completar(uuid, jsonb), public.fn_doc_estado(uuid, text, text), public.fn_doc_buscar(text, uuid), public.fn_dominios(),
  public.fn_dominio_guardar(jsonb), public.fn_fuentes(text), public.fn_fuente_guardar(jsonb), public.fn_fuente_validar(uuid, text, text),
  public.fn_vinculos(text, uuid), public.fn_vincular(jsonb), public.fn_desvincular(uuid) to authenticated;

insert into app.schema_migrations (version, description) values ('09', 'Biblioteca documental, búsqueda de texto, dominios confiables, fuentes validadas y vínculos de fuente')
on conflict (version) do nothing;

commit;
