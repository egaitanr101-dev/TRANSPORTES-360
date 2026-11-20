-- =============================================================================
-- TRANSPORTES 360 · 03_catalogos.sql
-- Crea: knowledge_categories, topic_catalog, app_settings.
-- Inserta: roles, permisos y matriz rol-permiso (MAPA_FUNCIONAL §2 con D-07 y D-09),
--          6 categorías iniciales y parámetros por defecto (D-04, D-05, D-06).
-- Modifica: nada existente. Reversión: sql/reversion/03_catalogos.down.sql
-- =============================================================================
begin;

create table public.knowledge_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z_]{3,40}$'),
  name        text not null check (char_length(trim(name)) >= 3),
  description text,
  icon        text not null default 'shield',
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger knowledge_categories_updated_at before update on public.knowledge_categories for each row execute function app.tg_updated_at();

create table public.topic_catalog (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.knowledge_categories (id),
  title       text not null check (char_length(trim(title)) >= 3),
  description text,
  tags        text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index topic_catalog_titulo_idx on public.topic_catalog (category_id, lower(title));

create table public.app_settings (
  key        text primary key check (key ~ '^[a-z_]{3,40}$'),
  value      jsonb not null,
  is_public  boolean not null default false,   -- legible por cualquier usuario autenticado
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_categories enable row level security;
alter table public.topic_catalog enable row level security;
alter table public.app_settings enable row level security;
revoke all on public.knowledge_categories, public.topic_catalog, public.app_settings from public, anon, authenticated;

-- ---------- Roles ----------
insert into public.roles (id, name, is_staff, sort_order) values
  ('COLABORADOR', 'Colaborador', false, 1),
  ('SUPERVISOR', 'Supervisor', true, 2),
  ('ADMIN', 'Administrador', true, 3),
  ('ADMIN_PRINCIPAL', 'Administrador principal', true, 4);

-- ---------- Permisos ----------
insert into public.permissions (id, description) values
  ('contenido.ver_publicado', 'Consultar contenido publicado'),
  ('evaluacion.responder', 'Responder evaluaciones semanales (participa en el sorteo)'),
  ('resultados.ver_propios', 'Consultar sus resultados e historial'),
  ('alerta.confirmar_lectura', 'Confirmar la lectura de alertas'),
  ('equipo.ver_participacion', 'Ver participación y promedios de su equipo (sin puntajes individuales, D-09)'),
  ('contenido.crear_editar', 'Crear y editar contenido; ve las respuestas correctas (excluye del sorteo, D-07)'),
  ('contenido.aprobar', 'Aprobar y programar contenido'),
  ('ia.generar', 'Solicitar generaciones con IA'),
  ('alerta.aprobar_critica', 'Aprobar alertas críticas'),
  ('documentos.gestionar', 'Gestionar la biblioteca documental'),
  ('fuentes.validar', 'Validar fuentes externas'),
  ('campanas.gestionar', 'Gestionar campañas'),
  ('semana.cerrar', 'Cerrar la semana de capacitación'),
  ('sorteo.ejecutar', 'Ejecutar el sorteo semanal'),
  ('sorteo.anular', 'Anular un sorteo (procedimiento auditado)'),
  ('reportes.ver', 'Ver reportes e indicadores'),
  ('usuarios.gestionar', 'Crear y administrar colaboradores y supervisores'),
  ('usuarios.restablecer_equipo', 'Emitir códigos de activación para su propio equipo'),
  ('usuarios.gestionar_staff', 'Crear y administrar administradores'),
  ('ia.configurar_proveedores', 'Configurar proveedores y modelos de IA'),
  ('config.parametros', 'Cambiar parámetros generales'),
  ('auditoria.ver', 'Consultar la auditoría completa');

-- ---------- Matriz rol × permiso ----------
insert into public.role_permissions (role_id, permission_id)
select 'COLABORADOR', p from unnest(array['contenido.ver_publicado', 'evaluacion.responder', 'resultados.ver_propios', 'alerta.confirmar_lectura']) p
union all
select 'SUPERVISOR', p from unnest(array['contenido.ver_publicado', 'evaluacion.responder', 'resultados.ver_propios', 'alerta.confirmar_lectura',
                                          'equipo.ver_participacion', 'reportes.ver', 'usuarios.restablecer_equipo']) p
union all
select 'ADMIN', p from unnest(array['contenido.ver_publicado', 'resultados.ver_propios', 'alerta.confirmar_lectura', 'equipo.ver_participacion',
                                     'contenido.crear_editar', 'contenido.aprobar', 'ia.generar', 'documentos.gestionar', 'fuentes.validar',
                                     'campanas.gestionar', 'semana.cerrar', 'sorteo.ejecutar', 'reportes.ver', 'usuarios.gestionar']) p
union all
select 'ADMIN_PRINCIPAL', id from public.permissions where id <> 'evaluacion.responder';

-- ---------- Categorías iniciales (administrables; no quedan fijas en el frontend) ----------
insert into public.knowledge_categories (slug, name, icon, sort_order) values
  ('seguridad_trabajo', 'Seguridad y trabajo', 'shield', 1),
  ('salud_bienestar', 'Salud y bienestar', 'heart', 2),
  ('educacion_financiera', 'Educación financiera', 'coin', 3),
  ('seguridad_digital', 'Seguridad digital y prevención de estafas', 'phone', 4),
  ('desarrollo_personal', 'Desarrollo personal y familiar', 'family', 5),
  ('cultura_crecimiento', 'Cultura y crecimiento profesional', 'growth', 6);

-- ---------- Parámetros (decisiones aprobadas) ----------
insert into public.app_settings (key, value, is_public) values
  ('attempt_policy', '{"oficial": "primer_envio", "practica": true}', true),      -- D-04
  ('feedback_mode', '"inmediata"', true),                                          -- D-05
  ('week_close', '{"isodow": 7, "hora": "23:59", "zona": "America/Costa_Rica"}', true), -- D-06
  ('ai_enabled', 'false', false),
  ('activation_hours', '72', false);

insert into app.schema_migrations (version, description) values ('03', 'Catálogos: roles, permisos, categorías, parámetros')
on conflict (version) do nothing;

commit;
