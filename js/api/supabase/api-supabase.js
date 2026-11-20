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
        // Restricciones de la base (campo vacío, demasiado largo, formato): mensaje claro en vez del técnico
        if (['23514', '23502', '22P02', '22001', '23505'].includes(error.code)) return T.error('VALIDACION', 'Revise los datos: hay un campo vacío, repetido o demasiado largo.');
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
        return { id: p.id, nombre: p.nombre, iniciales: p.iniciales || '?', codigo: p.codigo || '', area: p.area || 'Sin área', rol: p.rol, rolNombre: p.rol_nombre, permisos: p.permisos || [], privacidadAceptada: !!p.privacidad_aceptada };
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

        // ---------- Colaborador ----------
        async inicio() {
          const usuario = await perfil();
          const [semana, cats] = await Promise.all([
            rpc('fn_semana_actual'),
            cliente.from('knowledge_categories').select('name, icon').eq('is_active', true).order('sort_order')
          ]);
          if (cats.error) throw traducir(cats.error);
          return { usuario, semana: semana || null, alertasPendientes: [], consejo: null, reconocimientos: [], categorias: (cats.data || []).map(c => ({ icono: c.icon, nombre: c.name })) };
        },
        async semana() { return (await rpc('fn_semana_actual')) || null; },
        async capsula(id) { return rpc('fn_capsula', { p_id: id }); },
        async responderCapsula(id, respuestas, clave) { return rpc('fn_responder_capsula', { p_capsula: id, p_respuestas: respuestas, p_clave: clave }); },
        async alertas() { await perfil(); return []; },
        async historial() {
          const r = await rpc('fn_mi_historial');
          return { semanas: r.semanas || [], alertas: { confirmadas: 0, total: 0 } };
        },

        // ---------- Panel: capacitación semanal ----------
        async categorias() {
          const { data, error } = await cliente.from('knowledge_categories').select('id, name, is_active').order('sort_order');
          if (error) throw traducir(error);
          return (data || []).map(c => ({ id: c.id, nombre: c.name, activa: c.is_active }));
        },
        async semanasAdmin() { return rpc('fn_admin_semanas'); },
        async semanaAdmin(id) { return rpc('fn_admin_semana', { p_id: id }); },
        async guardarSemana(datos) { return rpc('fn_admin_semana_guardar', { p: datos }); },
        async enviarSemana(id) { return rpc('fn_admin_semana_enviar', { p_id: id }); },
        async devolverSemana(id, comentario) { return rpc('fn_admin_semana_devolver', { p_id: id, p_comentario: comentario }); },
        async aprobarSemana(id, comentario) { return rpc('fn_admin_semana_aprobar', { p_id: id, p_comentario: comentario || null }); },
        async archivarSemana(id, comentario) { return rpc('fn_admin_semana_archivar', { p_id: id, p_comentario: comentario || null }); },
        async eliminarSemana(id) { return rpc('fn_admin_semana_eliminar', { p_id: id }); },

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
        /** Un lote (máx. 50). Devuelve { creados: [{ id, codigo, nombre, area, supervisor, codigo_activacion, vence, aviso }], omitidos: [{ codigo, motivo }] } */
        async importarColaboradores(filas, horas) {
          return funcion('admin-usuarios', {
            accion: 'importar_colaboradores', horas,
            filas: filas.map(f => ({ codigo_empleado: f.codigo, nombre: f.nombre, area: f.area || null, supervisor: f.supervisor || null }))
          });
        },
        async guardarUsuario(id, cambios) { return rpc('fn_admin_usuario_guardar', { p_usuario: id, p: cambios }); }
      };

      const PENDIENTES = ['alerta', 'confirmarAlerta', 'resumen', 'generarBorrador', 'borrador', 'sorteoSemana', 'ejecutarSorteo'];
      for (const m of PENDIENTES) api[m] = () => Promise.reject(T.error('NO_IMPLEMENTADO', 'Pendiente de su iteración: ' + m));
      return api;
    }
  };
})(window.T360);
