-- =============================================================================
-- TRANSPORTES 360 · 02_identidad.sql
-- Crea: roles, permissions, role_permissions, areas, profiles, account_activations,
--       audit_logs (+ índices y restricciones).
-- Modifica: nada existente. Reversión: sql/reversion/02_identidad.down.sql
-- Decisiones: D-02 (código de empleado + contraseña personal), D-07 (exclusión del sorteo).
-- =============================================================================
begin;

create table public.roles (
  id         text primary key check (id ~ '^[A-Z_]{3,30}$'),
  name       text not null,
  is_staff   boolean not null default false,     -- personal administrativo (ingresa con correo)
  sort_order smallint not null default 0
);
comment on table public.roles is 'COLABORADOR, SUPERVISOR, ADMIN, ADMIN_PRINCIPAL.';

create table public.permissions (
  id          text primary key check (id ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role_id       text not null references public.roles (id) on delete cascade,
  permission_id text not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.areas (
  id        text primary key check (id ~ '^[A-Z0-9_]{2,20}$'),
  name      text not null check (char_length(trim(name)) >= 2),
  is_active boolean not null default true
);

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete restrict,
  employee_code       text unique check (employee_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  full_name           text not null check (char_length(trim(full_name)) >= 3),
  role_id             text references public.roles (id),
  area_id             text references public.areas (id),
  supervisor_id       uuid references public.profiles (id),
  email               text unique check (email is null or email = lower(email)),
  is_active           boolean not null default false,
  draw_eligible       boolean not null default false,   -- lo calcula un trigger (D-07)
  privacy_accepted_at timestamptz,
  deactivated_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint perfil_activo_con_rol check (not is_active or role_id is not null),
  constraint colaborador_con_codigo check (role_id is distinct from 'COLABORADOR' or employee_code is not null),
  constraint no_es_su_supervisor check (supervisor_id is distinct from id)
);
comment on table public.profiles is 'Perfil autorizado. Rol, área y estado solo cambian por fn_admin_usuario_guardar; nunca desde el navegador.';
create index profiles_role_idx on public.profiles (role_id) where is_active;
create index profiles_area_idx on public.profiles (area_id);
create index profiles_supervisor_idx on public.profiles (supervisor_id);

create table public.account_activations (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id),
  code_hash       text not null,                                  -- bcrypt; el código en claro nunca se guarda
  expires_at      timestamptz not null default now() + interval '72 hours',
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  issued_by       uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  used_at         timestamptz,
  revoked_at      timestamptz,
  constraint activacion_usada_o_revocada check (used_at is null or revoked_at is null)
);
create unique index account_activations_vigente_idx on public.account_activations (profile_id) where used_at is null and revoked_at is null;
comment on table public.account_activations is 'Códigos de activación de un solo uso (72 h, máx. 5 intentos). Sin acceso desde el navegador.';

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  actor_id    uuid,
  action      text not null check (action ~ '^[A-Z_]{3,60}$'),
  entity_type text,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb
);
create index audit_logs_ts_idx on public.audit_logs (ts desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create trigger audit_logs_inmutable before update or delete on public.audit_logs for each row execute function app.tg_inmutable();

create trigger profiles_updated_at before update on public.profiles for each row execute function app.tg_updated_at();

-- Protegidas desde el primer momento: RLS activa y sin privilegios para anon/authenticated.
-- Las políticas y los permisos de lectura se otorgan en 04_seguridad.sql.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.account_activations enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.roles, public.permissions, public.role_permissions, public.areas, public.profiles,
              public.account_activations, public.audit_logs from public, anon, authenticated;

insert into app.schema_migrations (version, description) values ('02', 'Identidad: roles, permisos, áreas, perfiles, activaciones, auditoría')
on conflict (version) do nothing;

commit;
