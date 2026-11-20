-- REVERSIÓN de 06_cierre_sorteo.sql. SOLO en desarrollo y con autorización: BORRA resultados semanales, sorteos y reconocimientos.
-- Restaura fn_mi_historial a la versión de 05 (volver a ejecutar esa función desde sql/05_capacitacion.sql).
begin;
drop function if exists public.fn_reconocimiento_publico(uuid, boolean);
drop function if exists public.fn_reconocimientos();
drop function if exists public.fn_admin_sorteo(uuid);
drop function if exists public.fn_anular_sorteo(uuid, text);
drop function if exists public.fn_ejecutar_sorteo(uuid);
drop function if exists app.indice_aleatorio(int);
drop function if exists app.cerrar_semanas_vencidas();
drop function if exists public.fn_cerrar_semana(uuid);
drop function if exists app.cerrar_semana(uuid, uuid);
drop table if exists public.recognitions;
drop table if exists public.draw_entries;
drop table if exists public.weekly_draws;
drop function if exists app.tg_sorteo_protegido();
drop table if exists public.weekly_results;
update public.training_weeks set closed_at = null, closed_by = null where closed_at is not null;
delete from app.schema_migrations where version = '06';
commit;
