-- =============================================================================
-- TRANSPORTES 360 · 01_base.sql
-- Crea: esquemas app y reporting, registro de migraciones, funciones de error y
--       validación, trigger genérico de updated_at.
-- Modifica: nada existente. Reversión: sql/reversion/01_base.down.sql
-- Requiere: extensión pgcrypto en el esquema extensions (Supabase la trae).
-- =============================================================================
begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;        -- funciones internas: NO se expone en la API
create schema if not exists reporting;  -- vistas de indicadores (iteración 8)
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;   -- necesario para evaluar políticas RLS que usan app.*

-- Registro de migraciones aplicadas (se aplican desde el SQL Editor, un archivo por envío)
create table if not exists app.schema_migrations (
  version     text primary key,
  description text not null,
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user
);
alter table app.schema_migrations enable row level security;
revoke all on app.schema_migrations from public, anon, authenticated;

-- Las funciones nuevas en public NO son ejecutables por defecto: cada RPC se habilita explícitamente.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

/* ---------- Errores con código estable (el frontend los traduce a mensajes claros) ----------
   42501 = insufficient_privilege; P0001 = validación; P0002 = no encontrado. El código va en HINT. */
create or replace function app.error(p_codigo text, p_mensaje text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using
    errcode = case p_codigo when 'NO_AUTORIZADO' then '42501' when 'NO_AUTENTICADO' then '42501' when 'NO_ENCONTRADO' then 'P0002' else 'P0001' end,
    message = p_mensaje,
    hint = p_codigo;
end $$;

create or replace function app.validar(p_condicion boolean, p_mensaje text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_condicion is distinct from true then
    perform app.error('VALIDACION', p_mensaje);
  end if;
end $$;

create or replace function app.tg_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

/** Impide modificar o borrar filas (bitácoras, resultados cerrados, sorteos). */
create or replace function app.tg_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'Registro inmutable: ' || tg_table_name, hint = 'INMUTABLE';
end $$;

grant execute on function app.error(text, text), app.validar(boolean, text) to authenticated, service_role;

insert into app.schema_migrations (version, description) values ('01', 'Base: esquemas, migraciones, errores')
on conflict (version) do nothing;

commit;
