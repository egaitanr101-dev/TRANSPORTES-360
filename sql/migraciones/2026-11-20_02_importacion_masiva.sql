-- =============================================================================
-- TRANSPORTES 360 · Migración 2026-11-20_02 — Importación masiva de colaboradores (D-02, variante aprobada)
-- El administrador sube su lista; la Edge Function admin-usuarios crea los usuarios en Auth y luego llama a
-- fn_importar_completar, que en UNA llamada: asigna área (creándola si no existe) y supervisor, y emite un
-- código de activación distinto por persona, con vigencia larga para entregarlo impreso (por defecto 14 días).
-- Crea: app.area_id_de(text), public.fn_importar_completar(jsonb, int), parámetro activation_hours_masiva.
-- Modifica: nada existente. Reversible: drop de las dos funciones y delete del parámetro.
-- =============================================================================
begin;

/** Identificador estable para un área a partir de su nombre: "Distribución GAM" → "DISTRIBUCION_GAM". */
create or replace function app.area_id_de(p_nombre text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(x) >= 2 then x else 'AREA_' || x end
  -- translate antes y después de upper(): en bases con configuración regional "C", upper() no convierte las tildes
  from (select left(trim(both '_' from regexp_replace(
          translate(upper(translate(trim(coalesce(p_nombre, '')), 'áéíóúüñ', 'aeiouun')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
          '[^A-Z0-9]+', '_', 'g')), 20) as x) s
$$;

/** Completa un lote de colaboradores recién creados en Auth. Solo administradores (usuarios.gestionar).
    p_filas: [{ id, area?, supervisor? }]  (supervisor = correo o código de un supervisor/administrador activo)
    Devuelve: [{ id, codigo, nombre, area, supervisor, codigo_activacion, vence, aviso }]  — los códigos se ven UNA vez. */
create or replace function public.fn_importar_completar(p_filas jsonb, p_horas int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor  public.profiles := app.actor();
  v_horas  int;
  f        jsonb;
  v_perfil public.profiles;
  v_area   text;
  v_sup    uuid;
  v_txt    text;
  v_aviso  text;
  v_codigo text;
  v_vence  timestamptz;
  v_res    jsonb := '[]'::jsonb;
begin
  perform app.exigir('usuarios.gestionar');
  perform app.validar(jsonb_typeof(p_filas) = 'array' and jsonb_array_length(p_filas) between 1 and 200, 'Envíe entre 1 y 200 filas por lote.');
  v_horas := coalesce(p_horas, (select (s.value #>> '{}')::int from public.app_settings s where s.key = 'activation_hours_masiva'), 336);
  perform app.validar(v_horas between 24 and 720, 'La vigencia del código debe estar entre 1 y 30 días.');

  for f in select * from jsonb_array_elements(p_filas) loop
    v_aviso := null; v_area := null; v_sup := null;
    select * into v_perfil from public.profiles where id = (f ->> 'id')::uuid for update;
    perform app.validar(found and v_perfil.role_id = 'COLABORADOR', 'Una fila no corresponde a un colaborador.');

    -- Área: se busca por nombre; si no existe se crea
    v_txt := nullif(trim(f ->> 'area'), '');
    if v_txt is not null then
      select a.id into v_area from public.areas a where lower(a.name) = lower(v_txt) limit 1;
      if v_area is null then
        v_area := app.area_id_de(v_txt);
        insert into public.areas (id, name) values (v_area, v_txt) on conflict (id) do nothing;
      end if;
    end if;

    -- Supervisor: por correo o por código; debe estar activo y ser supervisor o administrador
    v_txt := nullif(trim(f ->> 'supervisor'), '');
    if v_txt is not null then
      select s.id into v_sup from public.profiles s
       where s.is_active and s.role_id in ('SUPERVISOR', 'ADMIN', 'ADMIN_PRINCIPAL')
         and (s.email = lower(v_txt) or s.employee_code = upper(v_txt))
       limit 1;
      if v_sup is null then v_aviso := 'Supervisor no encontrado: ' || v_txt; end if;
    end if;

    update public.profiles set area_id = coalesce(v_area, area_id), supervisor_id = coalesce(v_sup, supervisor_id)
     where id = v_perfil.id;

    -- Código de activación (revoca cualquier código anterior sin usar)
    update public.account_activations set revoked_at = now()
     where profile_id = v_perfil.id and used_at is null and revoked_at is null;
    v_codigo := app.codigo_activacion();
    insert into public.account_activations (profile_id, code_hash, expires_at, issued_by)
    values (v_perfil.id, extensions.crypt(v_codigo, extensions.gen_salt('bf', 8)), now() + make_interval(hours => v_horas), v_actor.id)
    returning expires_at into v_vence;

    v_res := v_res || jsonb_build_object(
      'id', v_perfil.id, 'codigo', v_perfil.employee_code, 'nombre', v_perfil.full_name,
      'area', (select a.name from public.areas a where a.id = coalesce(v_area, v_perfil.area_id)),
      'supervisor', (select s.full_name from public.profiles s where s.id = coalesce(v_sup, v_perfil.supervisor_id)),
      'codigo_activacion', v_codigo, 'vence', v_vence, 'aviso', v_aviso);
  end loop;

  perform app.auditar('IMPORTACION_COLABORADORES', 'profile', null,
                      jsonb_build_object('cantidad', jsonb_array_length(p_filas), 'vigencia_horas', v_horas));   -- nunca los códigos
  return v_res;
end $$;

revoke execute on function app.area_id_de(text) from public, anon, authenticated;
revoke execute on function public.fn_importar_completar(jsonb, int) from public, anon;
grant execute on function public.fn_importar_completar(jsonb, int) to authenticated;

insert into public.app_settings (key, value, is_public) values ('activation_hours_masiva', '336', false)
on conflict (key) do nothing;

insert into app.schema_migrations (version, description)
values ('2026-11-20_02', 'Importación masiva de colaboradores con códigos de activación de 14 días')
on conflict (version) do nothing;

commit;
