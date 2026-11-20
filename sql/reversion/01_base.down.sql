-- REVERSIÓN de 01_base.sql. SOLO en desarrollo y con autorización. Requiere haber revertido antes 04, 03 y 02.
-- No elimina la extensión pgcrypto (Supabase la trae y otros objetos pueden usarla).
begin;
alter default privileges in schema public grant execute on functions to public;
drop function if exists app.tg_inmutable();
drop function if exists app.tg_updated_at();
drop function if exists app.validar(boolean, text);
drop function if exists app.error(text, text);
drop table if exists app.schema_migrations;
drop schema if exists reporting;
drop schema if exists app;
commit;
