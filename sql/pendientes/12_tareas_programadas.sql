-- =============================================================================
-- TRANSPORTES 360 · 12_tareas_programadas.sql  (iteración 8) — PENDIENTE DE AUTORIZACIÓN. NO SE APLICA SOLO.
-- Activa la extensión pg_cron de Supabase (hoy no está instalada) y programa:
--   * t360-cerrar-semanas: lunes 00:05 hora de Costa Rica (06:05 UTC). Congela los resultados de las semanas que
--     terminaron (app.cerrar_semanas_vencidas, probada en sql/95_pruebas_sorteo.sql S11). NO ejecuta el sorteo:
--     el sorteo lo sigue decidiendo una persona en el panel.
-- Qué cambia: crea el esquema "cron" de Supabase y una tarea. Costo: ninguno en el plan actual.
-- Reversión: select cron.unschedule('t360-cerrar-semanas');  (y, si se desea, drop extension pg_cron;)
-- Pendiente de decidir aparte: borrar los documentos temporales (necesita la API de Storage, no solo SQL).
-- =============================================================================
create extension if not exists pg_cron;

select cron.schedule('t360-cerrar-semanas', '5 6 * * 1', $$select app.cerrar_semanas_vencidas()$$);

insert into app.schema_migrations (version, description) values ('12', 'Tareas programadas: cierre automático de semanas (pg_cron)')
on conflict (version) do nothing;
