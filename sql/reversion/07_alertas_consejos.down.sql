-- REVERSIÓN de 07_alertas_consejos.sql. SOLO en desarrollo y con autorización: BORRA alertas, evidencia de lectura y consejos.
-- Restaurar la lista de approval_history exige que no haya historial de alertas o consejos (es inmutable): si lo hay, falla a propósito.
begin;
drop function if exists public.fn_consejos(), public.fn_confirmar_alerta(uuid, int), public.fn_alerta(uuid), public.fn_alertas(),
  public.fn_admin_consejo_eliminar(uuid), public.fn_admin_consejo_archivar(uuid, text), public.fn_admin_consejo_aprobar(uuid, timestamptz, text),
  public.fn_admin_consejo_devolver(uuid, text), public.fn_admin_consejo_enviar(uuid), public.fn_admin_consejo_guardar(jsonb), public.fn_admin_consejo(uuid),
  public.fn_admin_consejos(), public.fn_admin_alerta_eliminar(uuid), public.fn_admin_alerta_archivar(uuid, text),
  public.fn_admin_alerta_aprobar(uuid, timestamptz, boolean, text), public.fn_admin_alerta_devolver(uuid, text), public.fn_admin_alerta_enviar(uuid),
  public.fn_admin_alerta_guardar(jsonb), public.fn_admin_alerta(uuid), public.fn_admin_alertas(),
  app.validar_alerta_completa(public.alerts), app.alerta_seguimiento(uuid, int), app.alertas_vigentes(), app.en_audiencia(text[], text),
  app.exigir_editorial(), app.cuatro_ojos(uuid[], text), app.historial_editorial(text, uuid),
  app.registrar_editorial(text, uuid, int, text, text, text, jsonb);
drop table if exists public.tips;
drop table if exists public.alert_acknowledgements;
drop function if exists app.tg_confirmacion_protegida();
drop table if exists public.alert_publications;
drop table if exists public.alerts;
alter table public.approval_history drop constraint approval_history_entity_type_check;
alter table public.approval_history add constraint approval_history_entity_type_check check (entity_type in ('training_week'));
delete from app.schema_migrations where version = '07';
commit;
