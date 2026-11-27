-- REVERSIÓN de 11_reportes.sql. Solo quita funciones de lectura: no borra datos.
begin;
drop function if exists public.fn_mi_equipo(), public.fn_resumen(), public.fn_reporte_ia(), public.fn_reporte_alertas(), public.fn_reporte_preguntas(uuid),
  public.fn_reporte_areas(uuid), public.fn_reporte_semanas(int), app.indicadores_semana(public.training_weeks, text), app.en_alcance(public.profiles),
  app.exigir_reportes(), app.ve_todos();
delete from app.schema_migrations where version = '11';
commit;
