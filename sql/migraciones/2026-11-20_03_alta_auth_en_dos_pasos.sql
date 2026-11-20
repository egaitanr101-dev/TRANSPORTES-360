-- =============================================================================
-- TRANSPORTES 360 · Migración 2026-11-20_03 — Corrección: alta de usuarios desde Supabase Auth en dos pasos
-- Problema encontrado en producción de desarrollo: Supabase Auth (admin.createUser) INSERTA el usuario sin
-- app_metadata y lo ACTUALIZA milisegundos después con rol, código y nombre. El trigger AFTER INSERT
-- (t360_nuevo_usuario) creaba el perfil sin rol ni código.
-- Crea: app.tg_usuario_metadatos() y el trigger AFTER UPDATE OF raw_app_meta_data en auth.users.
-- Repara: perfiles inactivos y sin rol cuyo usuario de Auth ya trae rol válido en app_metadata (queda auditado).
-- Seguridad: solo completa perfiles NUEVOS (inactivos y sin rol); nunca cambia el rol de un perfil configurado.
--            raw_app_meta_data solo lo escribe el servidor con la service_role.
-- Reversible: drop trigger t360_usuario_metadatos + drop function app.tg_usuario_metadatos.
-- =============================================================================
begin;

create or replace function app.tg_usuario_metadatos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rol    text := new.raw_app_meta_data ->> 'role';
  v_codigo text := nullif(upper(trim(new.raw_app_meta_data ->> 'employee_code')), '');
  v_nombre text := nullif(trim(new.raw_app_meta_data ->> 'full_name'), '');
begin
  if v_rol is null or not exists (select 1 from public.roles where id = v_rol) then return new; end if;
  update public.profiles p
     set role_id = v_rol,
         employee_code = coalesce(p.employee_code, v_codigo),
         full_name = case when char_length(coalesce(v_nombre, '')) >= 3 then v_nombre else p.full_name end,
         email = case when v_rol = 'COLABORADOR' then null else p.email end
   where p.id = new.id and p.role_id is null and not p.is_active;
  return new;
end $$;
revoke execute on function app.tg_usuario_metadatos() from public, anon, authenticated;

create or replace trigger t360_usuario_metadatos
  after update of raw_app_meta_data on auth.users
  for each row when (new.raw_app_meta_data is distinct from old.raw_app_meta_data)
  execute function app.tg_usuario_metadatos();

-- Reparación de perfiles afectados
with afectados as (
  update public.profiles p
     set role_id = u.raw_app_meta_data ->> 'role',
         employee_code = coalesce(p.employee_code, nullif(upper(trim(u.raw_app_meta_data ->> 'employee_code')), '')),
         full_name = case when char_length(coalesce(trim(u.raw_app_meta_data ->> 'full_name'), '')) >= 3 then trim(u.raw_app_meta_data ->> 'full_name') else p.full_name end,
         email = case when u.raw_app_meta_data ->> 'role' = 'COLABORADOR' then null else p.email end
    from auth.users u
   where u.id = p.id and p.role_id is null and not p.is_active
     and exists (select 1 from public.roles r where r.id = u.raw_app_meta_data ->> 'role')
  returning p.id, p.employee_code, p.role_id
)
insert into public.audit_logs (action, entity_type, entity_id, details)
select 'PERFIL_REPARADO', 'profile', a.id::text,
       jsonb_build_object('rol', a.role_id, 'codigo', a.employee_code, 'motivo', 'Alta de Auth en dos pasos (migración 2026-11-20_03)')
  from afectados a;

insert into app.schema_migrations (version, description)
values ('2026-11-20_03', 'Corrección: completar perfiles cuando Auth agrega app_metadata después del alta')
on conflict (version) do nothing;

commit;
