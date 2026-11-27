-- =============================================================================
-- TRANSPORTES 360 · 13_ajustes_fase4.sql  (Fase 4: validación)
-- Crea: un índice que cubre la clave foránea (question_id, correct_option_id) de question_answer_keys, señalado por el
--       asesor de rendimiento de Supabase. Modifica: nada existente. (El número 12 queda para las tareas programadas,
--       sql/pendientes/12_tareas_programadas.sql, que esperan autorización.)
-- Reversión: drop index if exists public.question_answer_keys_opcion_idx; delete from app.schema_migrations where version = '13';
-- =============================================================================
begin;

create index if not exists question_answer_keys_opcion_idx on public.question_answer_keys (question_id, correct_option_id);

insert into app.schema_migrations (version, description) values ('13', 'Fase 4: índice de la clave foránea de question_answer_keys')
on conflict (version) do nothing;

commit;
