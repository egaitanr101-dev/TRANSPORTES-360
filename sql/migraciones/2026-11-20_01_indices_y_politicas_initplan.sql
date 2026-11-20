-- =============================================================================
-- TRANSPORTES 360 · Migración 2026-11-20_01 — Recomendaciones del asesor de rendimiento de Supabase
-- Crea: 3 índices en claves foráneas sin índice.
-- Modifica: recrea las políticas de 04_seguridad.sql envolviendo auth.uid() y app.tiene_permiso()
--           en (select …) para que se evalúen una vez por consulta y no por cada fila. Misma lógica.
-- Reversible: sí (volver a las políticas de 04_seguridad.sql y borrar los índices).
-- =============================================================================
begin;

create index if not exists account_activations_issued_by_idx on public.account_activations (issued_by);
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);

drop policy if exists areas_select on public.areas;
create policy areas_select on public.areas for select to authenticated
  using (is_active or (select app.tiene_permiso('usuarios.gestionar')));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select app.tiene_permiso('usuarios.gestionar'))
  or (supervisor_id = (select auth.uid())
      and ((select app.tiene_permiso('equipo.ver_participacion')) or (select app.tiene_permiso('usuarios.restablecer_equipo')))));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select app.tiene_permiso('auditoria.ver')));

drop policy if exists categorias_select on public.knowledge_categories;
create policy categorias_select on public.knowledge_categories for select to authenticated
  using (is_active or (select app.tiene_permiso('contenido.crear_editar')));

drop policy if exists temas_select on public.topic_catalog;
create policy temas_select on public.topic_catalog for select to authenticated
  using ((select app.tiene_permiso('contenido.crear_editar')));

drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated
  using (is_public or (select app.tiene_permiso('config.parametros')));

insert into app.schema_migrations (version, description)
values ('2026-11-20_01', 'Índices en FK y políticas con (select …) según el asesor de rendimiento')
on conflict (version) do nothing;

commit;
