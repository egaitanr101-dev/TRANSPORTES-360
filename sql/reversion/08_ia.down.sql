-- REVERSIÓN de 08_ia.sql. SOLO en desarrollo y con autorización: BORRA solicitudes, borradores de IA y el registro de costos.
-- No toca el contenido que ya se convirtió (semanas, alertas, consejos).
begin;
drop function if exists public.fn_srv_ia_paso_terminar(uuid, jsonb), public.fn_srv_ia_paso_iniciar(uuid, uuid), public.fn_ia_convertir(uuid, date), public.fn_ia_cancelar(uuid),
  public.fn_ia_trabajo(uuid), public.fn_ia_trabajos(), app.ia_resumen(public.generation_jobs), public.fn_ia_solicitar(jsonb, uuid), public.fn_ia_tema_repetido(text),
  public.fn_ia_configurar(jsonb), public.fn_ia_estado(), app.ia_informe(uuid), app.ia_validar(text, jsonb), app.ia_validar_bloque(jsonb), app.ia_lista(jsonb, int, int, int),
  app.ia_largo(jsonb, text, int, int), app.ia_limite(text), app.ia_encendida(), app.ia_gasto_mes(), app.ia_reserva(text, text, text), app.ia_max_tokens(text), app.ia_pasos(text);
drop table if exists public.generation_steps;
drop table if exists public.generation_jobs;
drop table if exists public.ai_models;
drop table if exists public.ai_providers;
delete from public.app_settings where key = 'ai_limits';
delete from app.schema_migrations where version = '08';
commit;
