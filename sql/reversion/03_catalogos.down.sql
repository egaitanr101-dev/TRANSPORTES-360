-- REVERSIÓN de 03_catalogos.sql. SOLO en desarrollo y con autorización: borra catálogos, parámetros y la matriz de permisos.
begin;
drop table if exists public.app_settings;
drop table if exists public.topic_catalog;
drop table if exists public.knowledge_categories;
delete from public.role_permissions;
delete from public.permissions;
delete from public.roles where not exists (select 1 from public.profiles p where p.role_id = roles.id);
delete from app.schema_migrations where version = '03';
commit;
