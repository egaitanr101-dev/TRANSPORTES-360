-- =============================================================================
-- TRANSPORTES 360 · 80_arranque_admin.sql — PLANTILLA, se ejecuta UNA vez y a mano.
-- Activa al primer administrador principal y crea las áreas reales.
-- Antes: crear el usuario en Supabase → Authentication → Users → Add user → Create new user
--        (correo + contraseña + "Auto Confirm User"). El trigger t360_nuevo_usuario crea su perfil inactivo.
-- Reemplace los valores entre <...> antes de ejecutar. No contiene contraseñas ni claves.
-- =============================================================================
begin;

-- Áreas reales de la operación (ejemplos: reemplazar por las verdaderas)
insert into public.areas (id, name) values
  ('<AREA_1>', '<Nombre del área 1>'),
  ('<AREA_2>', '<Nombre del área 2>')
on conflict (id) do nothing;

-- Primer administrador principal
update public.profiles
   set role_id = 'ADMIN_PRINCIPAL', full_name = '<Nombre completo>', is_active = true
 where email = lower('<correo del administrador>');

-- Verificación: debe devolver exactamente 1 fila
select id, full_name, email, role_id, is_active from public.profiles where role_id = 'ADMIN_PRINCIPAL';

insert into public.audit_logs (action, entity_type, details)
values ('ARRANQUE_ADMIN', 'profile', jsonb_build_object('nota', 'Activación inicial desde el SQL Editor'));

commit;
