-- REVERSIÓN de 02_identidad.sql. SOLO en desarrollo y con autorización: BORRA perfiles, activaciones y auditoría.
-- Los usuarios de Supabase Auth (auth.users) NO se borran: se eliminan aparte desde Authentication → Users.
begin;
drop table if exists public.audit_logs;
drop table if exists public.account_activations;
drop table if exists public.profiles;
drop table if exists public.areas;
drop table if exists public.role_permissions;
drop table if exists public.permissions;
drop table if exists public.roles;
delete from app.schema_migrations where version = '02';
commit;
