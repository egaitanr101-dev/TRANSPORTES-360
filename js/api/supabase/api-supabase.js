/* TRANSPORTES 360 — Implementación de T360.api contra Supabase (proyecto TRANSPORTES-360).
 * ITERACIÓN 1: sesión, ingreso con código o correo, activación de cuenta, perfil y usuarios.
 * Lo que pertenece a iteraciones siguientes devuelve datos vacíos (pantallas con "aún no hay…")
 * o NO_IMPLEMENTADO, para que nadie confunda una pantalla vacía con datos reales.
 * Las reglas las aplica la base de datos (RLS + RPC); este archivo no decide permisos. */
(function (T) {
  'use strict';
  const RE_CODIGO = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

  T.apiSupabase = {
    crear(cfg) {
      const cliente = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });

      /** Traduce errores de PostgREST / Auth / red al formato de T360 (código estable + mensaje). */
      function traducir(error) {
        if (!error) return T.error('DESCONOCIDO', 'Error desconocido');
        const codigo = error.hint && /^[A-Z_]+$/.test(error.hint) ? error.hint : null;
        if (codigo) return T.error(codigo, error.message);
        if (error.code === '42501' || error.status === 403) return T.error('NO_AUTORIZADO', error.message);
        if (error.status === 401) return T.error('NO_AUTENTICADO', error.message);
        if (/fetch|network|Failed to/i.test(error.message || '')) return T.error('RED', error.message);
        return T.error('DESCONOCIDO', error.message);
      }
      async function rpc(nombre, args) {
        const { data, error } = await cliente.rpc(nombre, args || {});
        if (error) throw traducir(error);
        return data;
      }
      /** Llama una Edge Function y devuelve su JSON; los errores HTTP traen { error } con un mensaje para el usuario. */
      async function funcion(nombre, cuerpo) {
        const { data, error } = await cliente.functions.invoke(nombre, { body: cuerpo });
        if (!error) return data;
        let mensaje = 'No se pudo completar la operación.';
        try { const j = await error.context.json(); if (j && j.error) mensaje = j.error; } catch (e) { /* sin cuerpo */ }
        throw T.error(error.context && error.context.status >= 500 ? 'DESCONOCIDO' : 'VALIDACION', mensaje);
      }
      function correoDe(identificador) {
        const v = String(identificador || '').trim();
        if (v.includes('@')) return v.toLowerCase();                       // personal administrativo
        const codigo = v.toUpperCase();
        if (!RE_CODIGO.test(codigo)) throw T.error('VALIDACION', 'Revise su código de empleado.');
        return codigo.toLowerCase() + '@' + T.config.dominioColaboradores; // colaborador: correo técnico, sin buzón
      }
      function usuarioDe(p) {
        return { id: p.id, nombre: p.nombre, iniciales: p.iniciales || '?', codigo: p.codigo || '', area: p.area || 'Sin área', rol: p.rol, rolNombre: p.rol_nombre, permisos: p.permisos || [] };
      }
      async function perfil() {
        try { return usuarioDe(await rpc('fn_mi_perfil')); }
        catch (e) { if (e.codigo === 'NO_AUTENTICADO') await cliente.auth.signOut(); throw e; }
      }

      const api = {
        modo: 'SUPABASE',
        cliente,

        // ---------- Sesión ----------
        async sesion() {
          const { data } = await cliente.auth.getSession();
          if (!data || !data.session) return null;
          try { return await perfil(); } catch (e) { return null; }
        },
        async ingresar(identificador, contrasena) {
          if (String(contrasena || '').length < 8) throw T.error('VALIDACION', 'Revise su código de empleado y su contraseña (mínimo 8 caracteres).');
          const { error } = await cliente.auth.signInWithPassword({ email: correoDe(identificador), password: contrasena });
          if (error) throw T.error(/fetch|network/i.test(error.message) ? 'RED' : 'VALIDACION', 'Código o contraseña incorrectos.');
          try { return await perfil(); }
          catch (e) { throw T.error('VALIDACION', 'Su cuenta todavía no está activa. Use "Activar mi cuenta" o consulte a su supervisor.'); }
        },
        async activar(codigo, codigoActivacion, contrasena, repetir) {
          if (contrasena !== repetir) throw T.error('VALIDACION', 'Las contraseñas no coinciden.');
          await funcion('activar-cuenta', { codigo_empleado: codigo, codigo_activacion: codigoActivacion, contrasena });
          return api.ingresar(codigo, contrasena);
        },
        async salir() { await cliente.auth.signOut(); },
        async aceptarPrivacidad() { await rpc('fn_aceptar_privacidad'); },

        // ---------- Colaborador (contenido: iteración 2 en adelante) ----------
        async inicio() {
          const usuario = await perfil();
          const { data: cats, error } = await cliente.from('knowledge_categories').select('name, icon').eq('is_active', true).order('sort_order');
          if (error) throw traducir(error);
          return { usuario, semana: null, alertasPendientes: [], consejo: null, reconocimientos: [], categorias: (cats || []).map(c => ({ icono: c.icon, nombre: c.name })) };
        },
        async semana() { await perfil(); return null; },
        async alertas() { await perfil(); return []; },
        async historial() { await perfil(); return { semanas: [], alertas: { confirmadas: 0, total: 0 } }; },

        // ---------- Panel ----------
        async adminSesion() {
          const { data } = await cliente.auth.getSession();
          if (!data || !data.session) throw T.error('NO_AUTENTICADO', 'Sin sesión');
          const u = await perfil();
          const PANEL = ['usuarios.gestionar', 'contenido.crear_editar', 'reportes.ver', 'usuarios.restablecer_equipo'];
          if (!u.permisos.some(p => PANEL.includes(p))) { await cliente.auth.signOut(); throw T.error('NO_AUTORIZADO', 'Sin acceso al panel'); }
          return { id: u.id, nombre: u.nombre, rol: u.rolNombre, permisos: u.permisos };
        },
        async adminIngresar(correo, contrasena) {
          const { error } = await cliente.auth.signInWithPassword({ email: String(correo || '').trim().toLowerCase(), password: contrasena });
          if (error) throw T.error('VALIDACION', 'Correo o contraseña incorrectos.');
          return api.adminSesion();
        },
        async usuarios() { return rpc('fn_usuarios_listar'); },
        async areas() {
          const { data, error } = await cliente.from('areas').select('id, name').eq('is_active', true).order('name');
          if (error) throw traducir(error);
          return (data || []).map(a => ({ id: a.id, nombre: a.name }));
        },
        async crearColaborador(d) {
          const r = await funcion('admin-usuarios', { accion: 'crear_colaborador', codigo_empleado: d.codigo, nombre: d.nombre, area_id: d.area || null, supervisor_id: d.supervisor || null });
          return { id: r.id, codigo: r.codigo_activacion, vence: r.vence };
        },
        async invitarPersonal(d) {
          return funcion('admin-usuarios', { accion: 'invitar_personal', correo: d.correo, nombre: d.nombre, rol: d.rol, area_id: d.area || null });
        },
        async emitirActivacion(id) { return rpc('fn_emitir_activacion', { p_usuario: id }); },
        async guardarUsuario(id, cambios) { return rpc('fn_admin_usuario_guardar', { p_usuario: id, p: cambios }); }
      };

      const PENDIENTES = ['capsula', 'responderCapsula', 'alerta', 'confirmarAlerta', 'resumen', 'generarBorrador', 'borrador', 'sorteoSemana', 'ejecutarSorteo'];
      for (const m of PENDIENTES) api[m] = () => Promise.reject(T.error('NO_IMPLEMENTADO', 'Pendiente de su iteración: ' + m));
      return api;
    }
  };
})(window.T360);
