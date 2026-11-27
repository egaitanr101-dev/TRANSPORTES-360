-- TRANSPORTES 360 · Huella del esquema (Fase 4). Solo lectura.
-- Compara la base de pruebas local con Supabase: si cada huella coincide, las pruebas locales aplican a Supabase.
-- Cubre los esquemas public y app: funciones (código, seguridad, search_path), columnas, restricciones, índices,
-- triggers, políticas RLS, RLS activado y permisos de anon / authenticated / service_role.
with
fn as (select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k,
              md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g') || p.prosecdef::text || coalesce(array_to_string(p.proconfig, ','), '')
                  || has_function_privilege('anon', p.oid, 'execute')::text || has_function_privilege('authenticated', p.oid, 'execute')::text) v
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'app') and p.prokind = 'f'),
col as (select table_schema || '.' || table_name || '.' || column_name k, md5(data_type || is_nullable || coalesce(regexp_replace(column_default, '\s+', '', 'g'), '') || coalesce(generation_expression, '')) v
          from information_schema.columns where table_schema in ('public', 'app')),
con as (select n.nspname || '.' || c.conrelid::regclass::text || '.' || c.conname k, md5(pg_get_constraintdef(c.oid)) v
          from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public', 'app')),
idx as (select schemaname || '.' || indexname k, md5(indexdef) v from pg_indexes where schemaname in ('public', 'app')),
trg as (select n.nspname || '.' || t.tgrelid::regclass::text || '.' || t.tgname k, md5(pg_get_triggerdef(t.oid)) v
          from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'app') and not t.tgisinternal),
pol as (select schemaname || '.' || tablename || '.' || policyname k, md5(cmd || array_to_string(roles, ',') || coalesce(qual, '') || coalesce(with_check, '')) v
          from pg_policies where schemaname in ('public', 'app')),
rls as (select n.nspname || '.' || c.relname k, md5(c.relrowsecurity::text) v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'app') and c.relkind = 'r'),
prv as (select table_schema || '.' || table_name || '.' || grantee k, md5(string_agg(privilege_type, ',' order by privilege_type)) v
          from information_schema.role_table_grants where table_schema in ('public', 'app') and grantee in ('anon', 'authenticated') group by 1)
select 'funciones' que, count(*) n, md5(string_agg(k || '=' || v, ';' order by k)) huella from fn
union all select 'columnas', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from col
union all select 'restricciones', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from con
union all select 'indices', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from idx
union all select 'triggers', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from trg
union all select 'politicas', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from pol
union all select 'rls', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from rls
union all select 'permisos_tablas', count(*), md5(string_agg(k || '=' || v, ';' order by k)) from prv
order by 1;
