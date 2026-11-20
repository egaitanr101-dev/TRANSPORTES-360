-- =============================================================================
-- TRANSPORTES 360 · 04_seguridad.sql
-- Crea: funciones de autorización (app.*), triggers de perfiles y de alta desde
--       Supabase Auth, RPC de identidad y usuarios, y las políticas RLS de las
--       tablas de 02 y 03.
-- Modifica: agrega un trigger AFTER INSERT en auth.users (t360_nuevo_usuario) que
--           crea el perfil INACTIVO de cada usuario nuevo. No altera nada más de auth.
-- Reversión: sql/reversion/04_seguridad.down.sql
-- Regla: el rol y los permisos se leen SIEMPRE del perfil de auth.uid(), nunca de
--        valores enviados por el navegador.
-- =============================================================================
begin;

/* ===================== Autorización centralizada ===================== */
create or replace function app.permiso_de(p_usuario uuid, p_permiso text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = p_usuario and p.is_active and rp.permission_id = p_permiso)
$$;

create or replace function app.tiene_permiso(p_permiso text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.permiso_de(auth.uid(), p_permiso)
$$;

/** Perfil activo del usuario autenticado, o error NO_AUTENTICADO. */
create or replace function app.actor()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles where id = auth.uid() and is_active;
  if not found then perform app.error('NO_AUTENTICADO', 'Sesión no válida o usuario inactivo.'); end if;
  return v;
end $$;

create or replace function app.exigir(p_permiso text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.actor();
  if not app.tiene_permiso(p_permiso) then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
end $$;

create or replace function app.auditar(p_accion text, p_tipo text, p_id text, p_detalle jsonb, p_actor uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (coalesce(p_actor, auth.uid()), p_accion, p_tipo, p_id, coalesce(p_detalle, '{}'::jsonb))
$$;

/* ===================== Códigos de activación ===================== */
/** 8 caracteres sin ambiguos (sin 0/O, 1/I/L), con bytes criptográficos y rechazo para evitar sesgo. Formato XXXX-XXXX. */
create or replace function app.codigo_activacion()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 símbolos
  r text := '';
  b int;
begin
  while char_length(r) < 8 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 248 then                                                -- 248 = 8 × 31: sin sesgo de módulo
      r := r || substr(alfabeto, (b % 31) + 1, 1);
    end if;
  end loop;
  return substr(r, 1, 4) || '-' || substr(r, 5, 4);
end $$;

/** Acepta el código con o sin guion, espacios o minúsculas. Devuelve XXXX-XXXX o null. */
create or replace function app.normalizar_codigo(p text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(x) = 8 then substr(x, 1, 4) || '-' || substr(x, 5, 4) end
  from (select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g') as x) s
$$;

/* ===================== Triggers de perfiles ===================== */
create or replace function app.tg_profiles_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.employee_code := nullif(upper(trim(new.employee_code)), '');
  new.email := nullif(lower(trim(new.email)), '');
  new.full_name := trim(new.full_name);
  -- D-07: participa en el sorteo quien puede responder evaluaciones y NO puede ver las respuestas correctas
  new.draw_eligible := new.role_id is not null
    and exists (select 1 from public.role_permissions where role_id = new.role_id and permission_id = 'evaluacion.responder')
    and not exists (select 1 from public.role_permissions where role_id = new.role_id and permission_id = 'contenido.crear_editar');
  if new.is_active then
    new.deactivated_at := null;
  elsif tg_op = 'UPDATE' and old.is_active then
    new.deactivated_at := now();
  end if;
  return new;
end $$;
create trigger profiles_normalizar before insert or update on public.profiles for each row execute function app.tg_profiles_normalizar();

/** Alta de perfil desde Supabase Auth. Rol, código y nombre se toman de raw_app_meta_data,
    que SOLO puede escribir el servidor con la service_role (Edge Function admin-usuarios).
    raw_user_meta_data es editable por el usuario: no se usa para autorizar. El perfil nace INACTIVO. */
create or replace function app.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rol    text := new.raw_app_meta_data ->> 'role';
  v_codigo text := new.raw_app_meta_data ->> 'employee_code';
  v_nombre text := coalesce(nullif(trim(new.raw_app_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1));
begin
  if v_rol is not null and not exists (select 1 from public.roles where id = v_rol) then v_rol := null; end if;
  insert into public.profiles (id, employee_code, full_name, role_id, email, is_active)
  values (new.id, v_codigo,
          case when char_length(coalesce(v_nombre, '')) >= 3 then v_nombre else 'Usuario ' || left(new.id::text, 8) end,
          v_rol,
          case when v_rol = 'COLABORADOR' then null else new.email end,   -- el correo técnico del colaborador no se guarda en el perfil
          false)
  on conflict (id) do nothing;
  return new;
end $$;
create or replace trigger t360_nuevo_usuario after insert on auth.users for each row execute function app.tg_nuevo_usuario();

/* ===================== RPC: identidad ===================== */
create or replace function public.fn_mi_perfil()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles := app.actor();
begin
  return jsonb_build_object(
    'id', v.id,
    'nombre', v.full_name,
    'iniciales', upper(left(split_part(v.full_name, ' ', 1), 1) || left(split_part(v.full_name, ' ', 2), 1)),
    'codigo', v.employee_code,
    'rol', v.role_id,
    'rol_nombre', (select r.name from public.roles r where r.id = v.role_id),
    'area', (select a.name from public.areas a where a.id = v.area_id),
    'privacidad_aceptada', v.privacy_accepted_at is not null,
    'permisos', coalesce((select jsonb_agg(rp.permission_id order by rp.permission_id) from public.role_permissions rp where rp.role_id = v.role_id), '[]'::jsonb));
end $$;

create or replace function public.fn_aceptar_privacidad()
returns void language plpgsql security definer set search_path = '' as $$
declare v public.profiles := app.actor();
begin
  if v.privacy_accepted_at is null then
    update public.profiles set privacy_accepted_at = now() where id = v.id;
    perform app.auditar('PRIVACIDAD_ACEPTADA', 'profile', v.id::text, '{}'::jsonb);
  end if;
end $$;

/* ===================== RPC: usuarios ===================== */
create or replace function public.fn_usuarios_listar()
returns table (id uuid, nombre text, codigo text, correo text, rol text, area text, supervisor text,
               activo boolean, activacion text, activacion_vence timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v public.profiles := app.actor();
  v_todos boolean := app.tiene_permiso('usuarios.gestionar');
begin
  if not v_todos and not app.tiene_permiso('usuarios.restablecer_equipo') and not app.tiene_permiso('equipo.ver_participacion') then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
  return query
  select p.id, p.full_name, p.employee_code, p.email, p.role_id, a.name, s.full_name, p.is_active,
         case
           when act.id is not null and act.expires_at > now() and act.failed_attempts < 5 then 'PENDIENTE'
           when exists (select 1 from public.account_activations u where u.profile_id = p.id and u.used_at is not null) then 'ACTIVADA'
           when act.id is not null then 'VENCIDA'
           else 'SIN_CODIGO'
         end,
         act.expires_at
  from public.profiles p
  left join public.areas a on a.id = p.area_id
  left join public.profiles s on s.id = p.supervisor_id
  left join public.account_activations act on act.profile_id = p.id and act.used_at is null and act.revoked_at is null
  where v_todos or p.supervisor_id = v.id
  order by p.full_name;
end $$;

/** Cambia nombre, rol, área, supervisor y estado. Toda modificación queda en auditoría con antes/después. */
create or replace function public.fn_admin_usuario_guardar(p_usuario uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles := app.actor();
  v_old   public.profiles;
  v_new   public.profiles;
  v_staff constant text[] := array['ADMIN', 'ADMIN_PRINCIPAL'];
begin
  perform app.exigir('usuarios.gestionar');
  perform app.validar(jsonb_typeof(p) = 'object', 'Datos no válidos.');
  perform app.validar(not (p ? 'employee_code'), 'El código de empleado no se puede cambiar desde aquí.');

  select * into v_old from public.profiles where id = p_usuario for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Usuario no encontrado.'); end if;
  v_new := v_old;
  if p ? 'full_name'     then v_new.full_name     := trim(p ->> 'full_name'); end if;
  if p ? 'role_id'       then v_new.role_id       := nullif(p ->> 'role_id', ''); end if;
  if p ? 'area_id'       then v_new.area_id       := nullif(p ->> 'area_id', ''); end if;
  if p ? 'supervisor_id' then v_new.supervisor_id := nullif(p ->> 'supervisor_id', '')::uuid; end if;
  if p ? 'is_active'     then v_new.is_active     := (p ->> 'is_active')::boolean; end if;

  if p_usuario = v_actor.id then
    perform app.validar(v_new.role_id is not distinct from v_old.role_id, 'No puede cambiar su propio rol.');
    perform app.validar(v_new.is_active, 'No puede desactivar su propia cuenta.');
  end if;
  if (v_old.role_id = any (v_staff) or v_new.role_id = any (v_staff)) and not app.tiene_permiso('usuarios.gestionar_staff') then
    perform app.error('NO_AUTORIZADO', 'Solo el administrador principal gestiona administradores.');
  end if;
  perform app.validar(char_length(coalesce(v_new.full_name, '')) >= 3, 'El nombre debe tener al menos 3 caracteres.');
  perform app.validar(v_new.role_id is null or exists (select 1 from public.roles r where r.id = v_new.role_id), 'Rol no válido.');
  perform app.validar(v_new.role_id is distinct from 'COLABORADOR' or v_new.employee_code is not null, 'Un colaborador necesita código de empleado.');
  perform app.validar(v_new.area_id is null or exists (select 1 from public.areas a where a.id = v_new.area_id and a.is_active), 'Área no válida.');
  perform app.validar(v_new.supervisor_id is null or exists (
      select 1 from public.profiles s where s.id = v_new.supervisor_id and s.id <> p_usuario and s.is_active
        and s.role_id in ('SUPERVISOR', 'ADMIN', 'ADMIN_PRINCIPAL')), 'Supervisor no válido.');
  perform app.validar(not v_new.is_active or v_new.role_id is not null, 'Asigne un rol antes de activar la cuenta.');
  if v_new.is_active and not v_old.is_active and v_new.role_id = 'COLABORADOR' then
    perform app.validar(exists (select 1 from public.account_activations x where x.profile_id = p_usuario and x.used_at is not null),
                        'El colaborador debe activar su cuenta con su código de activación.');
  end if;

  update public.profiles
     set full_name = v_new.full_name, role_id = v_new.role_id, area_id = v_new.area_id,
         supervisor_id = v_new.supervisor_id, is_active = v_new.is_active
   where id = p_usuario
  returning * into v_new;

  perform app.auditar('USUARIO_ACTUALIZADO', 'profile', p_usuario::text, jsonb_build_object(
    'antes',   jsonb_build_object('nombre', v_old.full_name, 'rol', v_old.role_id, 'area', v_old.area_id, 'supervisor', v_old.supervisor_id, 'activo', v_old.is_active),
    'despues', jsonb_build_object('nombre', v_new.full_name, 'rol', v_new.role_id, 'area', v_new.area_id, 'supervisor', v_new.supervisor_id, 'activo', v_new.is_active)));
  return jsonb_build_object('id', v_new.id, 'rol', v_new.role_id, 'activo', v_new.is_active);
end $$;

/** Emite un código de activación de un solo uso. Lo devuelve UNA vez, en claro, para entregarlo en persona.
    Administradores: cualquier colaborador. Supervisores: solo su propio equipo. Revoca el código anterior. */
create or replace function public.fn_emitir_activacion(p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor  public.profiles := app.actor();
  v_obj    public.profiles;
  v_codigo text;
  v_horas  int;
  v_vence  timestamptz;
begin
  select * into v_obj from public.profiles where id = p_usuario for update;
  if not found then perform app.error('NO_ENCONTRADO', 'Usuario no encontrado.'); end if;
  -- "is not distinct from": con supervisor_id NULL la comparación con "=" daría NULL y el IF dejaría pasar
  if not (app.tiene_permiso('usuarios.gestionar')
          or (app.tiene_permiso('usuarios.restablecer_equipo') and v_obj.supervisor_id is not distinct from v_actor.id)) then
    perform app.error('NO_AUTORIZADO', 'No autorizado para esta operación.');
  end if;
  perform app.validar(p_usuario <> v_actor.id, 'No puede emitirse un código a sí mismo.');
  perform app.validar(v_obj.role_id = 'COLABORADOR', 'Los códigos de activación son solo para colaboradores; el personal administrativo usa su correo.');

  update public.account_activations set revoked_at = now()
   where profile_id = p_usuario and used_at is null and revoked_at is null;

  select (s.value #>> '{}')::int into v_horas from public.app_settings s where s.key = 'activation_hours';
  v_codigo := app.codigo_activacion();
  insert into public.account_activations (profile_id, code_hash, expires_at, issued_by)
  values (p_usuario, extensions.crypt(v_codigo, extensions.gen_salt('bf', 8)), now() + make_interval(hours => coalesce(v_horas, 72)), v_actor.id)
  returning expires_at into v_vence;

  perform app.auditar('ACTIVACION_EMITIDA', 'profile', p_usuario::text, jsonb_build_object('vence', v_vence));   -- nunca el código
  return jsonb_build_object('codigo', v_codigo, 'vence', v_vence);
end $$;

/* ===================== RPC solo para el servidor (Edge Function activar-cuenta, service_role) ===================== */
/** Verifica código de empleado + código de activación. No consume el código. Cada fallo suma un intento (máx. 5).
    Devuelve siempre el mismo motivo genérico ante cualquier fallo: no revela si el código de empleado existe. */
create or replace function public.fn_srv_verificar_activacion(p_codigo_empleado text, p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_perfil public.profiles;
  v_act    public.account_activations;
  v_norm   text := app.normalizar_codigo(p_codigo);
begin
  select * into v_perfil from public.profiles where employee_code = upper(trim(p_codigo_empleado));
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_act from public.account_activations
   where profile_id = v_perfil.id and used_at is null and revoked_at is null for update;
  if not found or v_act.expires_at <= now() or v_act.failed_attempts >= 5 then return jsonb_build_object('ok', false); end if;
  if v_norm is null or extensions.crypt(v_norm, v_act.code_hash) <> v_act.code_hash then
    update public.account_activations set failed_attempts = failed_attempts + 1 where id = v_act.id;
    perform app.auditar('ACTIVACION_FALLIDA', 'profile', v_perfil.id::text, jsonb_build_object('intentos', v_act.failed_attempts + 1), v_perfil.id);
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_perfil.id, 'activation_id', v_act.id, 'employee_code', v_perfil.employee_code);
end $$;

/** Consume el código y activa la cuenta. Se llama DESPUÉS de fijar la contraseña en Auth. */
create or replace function public.fn_srv_confirmar_activacion(p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_act public.account_activations;
begin
  select * into v_act from public.account_activations where id = p_activation_id for update;
  if not found or v_act.used_at is not null or v_act.revoked_at is not null or v_act.expires_at <= now() then
    perform app.error('VALIDACION', 'Código de activación no válido o vencido.');
  end if;
  update public.account_activations set used_at = now() where id = p_activation_id;
  update public.profiles set is_active = true where id = v_act.profile_id;
  perform app.auditar('CUENTA_ACTIVADA', 'profile', v_act.profile_id::text, '{}'::jsonb, v_act.profile_id);
  return jsonb_build_object('ok', true, 'user_id', v_act.profile_id);
end $$;

/* ===================== Políticas RLS (tablas de 02 y 03) ===================== */
grant select on public.roles, public.permissions, public.role_permissions, public.areas, public.profiles,
               public.audit_logs, public.knowledge_categories, public.topic_catalog, public.app_settings to authenticated;

create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy areas_select on public.areas for select to authenticated using (is_active or app.tiene_permiso('usuarios.gestionar'));
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or app.tiene_permiso('usuarios.gestionar')
  or (supervisor_id = auth.uid() and (app.tiene_permiso('equipo.ver_participacion') or app.tiene_permiso('usuarios.restablecer_equipo'))));
create policy audit_logs_select on public.audit_logs for select to authenticated using (app.tiene_permiso('auditoria.ver'));
create policy categorias_select on public.knowledge_categories for select to authenticated using (is_active or app.tiene_permiso('contenido.crear_editar'));
create policy temas_select on public.topic_catalog for select to authenticated using (app.tiene_permiso('contenido.crear_editar'));
create policy settings_select on public.app_settings for select to authenticated using (is_public or app.tiene_permiso('config.parametros'));
-- account_activations: sin políticas a propósito → nadie la lee desde la API.

/* ===================== Ejecución de funciones ===================== */
revoke execute on all functions in schema app from public, anon;
grant execute on function app.permiso_de(uuid, text), app.tiene_permiso(text) to authenticated;   -- usadas por las políticas

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.fn_mi_perfil(), public.fn_aceptar_privacidad(), public.fn_usuarios_listar(),
                          public.fn_admin_usuario_guardar(uuid, jsonb), public.fn_emitir_activacion(uuid) to authenticated;
grant execute on function public.fn_srv_verificar_activacion(text, text), public.fn_srv_confirmar_activacion(uuid) to service_role;

insert into app.schema_migrations (version, description) values ('04', 'Seguridad: autorización, alta desde Auth, RPC de identidad, RLS')
on conflict (version) do nothing;

commit;
