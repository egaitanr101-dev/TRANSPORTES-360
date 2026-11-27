-- REVERSIÓN de 10_campanas_calendario.sql. SOLO en desarrollo y con autorización: BORRA campañas y el calendario editorial.
-- No toca el contenido agrupado (semanas, alertas, consejos) ni el catálogo de temas (topic_catalog es de 03_catalogos).
begin;
drop function if exists public.fn_tema_guardar(jsonb), public.fn_temas(uuid), public.fn_calendario_sugerencias(uuid), public.fn_calendario_configurar(uuid[], int),
  public.fn_calendario_guardar(date, jsonb), public.fn_calendario(date, int), public.fn_campanas_activas(), public.fn_campana_quitar(uuid),
  public.fn_campana_agregar(uuid, text, uuid), public.fn_campana_archivar(uuid), public.fn_campana_visible(uuid, boolean), public.fn_campana_guardar(jsonb),
  public.fn_campana(uuid), public.fn_campanas(), app.campana_elementos_visibles(uuid, uuid), app.temas_parecidos(text, text);
drop table if exists public.editorial_plan;
drop table if exists public.campaign_items;
drop table if exists public.campaigns;
delete from public.app_settings where key in ('rotacion_categorias', 'repeticion_meses');
delete from app.schema_migrations where version = '10';
commit;
