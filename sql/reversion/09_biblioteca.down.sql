-- REVERSIÓN de 09_biblioteca.sql. SOLO en desarrollo y con autorización: BORRA el registro de documentos, su texto, fuentes y vínculos.
-- Los ARCHIVOS del bucket "documentos" no se borran desde SQL: vacíe el bucket en Supabase → Storage antes de eliminarlo.
begin;
do $do$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists t360_documentos_subir on storage.objects;
    drop policy if exists t360_documentos_leer on storage.objects;
  end if;
end $do$;
drop function if exists public.fn_desvincular(uuid), public.fn_vincular(jsonb), public.fn_vinculos(text, uuid), public.fn_fuente_validar(uuid, text, text),
  public.fn_fuente_guardar(jsonb), public.fn_fuentes(text), public.fn_dominio_guardar(jsonb), public.fn_dominios(), app.purgar_temporales(),
  public.fn_doc_buscar(text, uuid), public.fn_doc_estado(uuid, text, text), public.fn_doc_version_completar(uuid, jsonb), public.fn_doc_version_iniciar(uuid, jsonb),
  public.fn_doc_guardar(jsonb), public.fn_doc(uuid), public.fn_docs(boolean), app.doc_puede_subir(text), app.dominio_confiable(text), app.dominio_de(text), app.extension_de(text);
drop table if exists public.content_source_links;
drop table if exists public.external_sources;
drop table if exists public.trusted_domains;
drop table if exists public.document_chunks;
alter table if exists public.knowledge_documents drop constraint if exists knowledge_documents_version_fk;
drop table if exists public.document_versions;
drop table if exists public.knowledge_documents;
delete from app.schema_migrations where version = '09';
commit;
