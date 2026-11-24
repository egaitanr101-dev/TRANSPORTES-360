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
        if (['23514', '23502', '22P02', '22001', '22007', '22008', '23503', '23505'].includes(error.code)) return T.error('VALIDACION', 'Revise los datos: hay un campo vacío, repetido o demasiado largo.');
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
      /** fn_reconocimientos → tarjetas para el inicio y los premios propios (con su consentimiento de publicación, D-08). */
      function reconocimientosDe(r) {
        const propios = (r && r.propios) || [];
        const tarjetas = ((r && r.ganadores) || []).map(g => ({ icono: 'gift', titulo: 'Ganador S' + g.semana, detalle: g.nombre }))
          .concat(propios.filter(p => p.tipo === 'SEMANA_PERFECTA').map(p => ({ icono: 'star', titulo: 'Semana perfecta', detalle: 'Usted · S' + p.semana })));
        return { reconocimientos: tarjetas, premios: propios.filter(p => p.tipo === 'GANADOR_SORTEO').map(p => ({ id: p.id, semana: p.semana, tema: p.tema, publico: !!p.publico })) };
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
          const [semana, cats, rec, alertas, consejos] = await Promise.all([
            rpc('fn_semana_actual'),
            cliente.from('knowledge_categories').select('name, icon').eq('is_active', true).order('sort_order'),
            rpc('fn_reconocimientos'), rpc('fn_alertas'), rpc('fn_consejos')
          ]);
          if (cats.error) throw traducir(cats.error);
          return Object.assign({ usuario, semana: semana || null, alertasPendientes: alertas.filter(a => !a.confirmada), consejo: consejos.find(c => c.hoy) || null, categorias: (cats.data || []).map(c => ({ icono: c.icon, nombre: c.name })) },
                               reconocimientosDe(rec));
        },
        async reconocimientoPublico(id, publico) { await rpc('fn_reconocimiento_publico', { p_id: id, p_publico: !!publico }); },
        async semana() { return (await rpc('fn_semana_actual')) || null; },
        async capsula(id) { return rpc('fn_capsula', { p_id: id }); },
        async responderCapsula(id, respuestas, clave) { return rpc('fn_responder_capsula', { p_capsula: id, p_respuestas: respuestas, p_clave: clave }); },
        async alertas() { return rpc('fn_alertas'); },
        async alerta(id) { return rpc('fn_alerta', { p_id: id }); },
        async confirmarAlerta(id, version) { return rpc('fn_confirmar_alerta', { p_id: id, p_version: version }); },
        async consejos() { return rpc('fn_consejos'); },
        async historial() {
          const [r, al] = await Promise.all([rpc('fn_mi_historial'), rpc('fn_alertas')]);
          return { semanas: r.semanas || [], alertas: { confirmadas: al.filter(a => a.confirmada).length, total: al.length } };
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

        // ---------- Panel: alertas y consejos ----------
        async alertasAdmin() { return rpc('fn_admin_alertas'); },
        async alertaAdmin(id) { return rpc('fn_admin_alerta', { p_id: id }); },
        async guardarAlerta(p) { return rpc('fn_admin_alerta_guardar', { p }); },
        async enviarAlerta(id) { return rpc('fn_admin_alerta_enviar', { p_id: id }); },
        async devolverAlerta(id, comentario) { return rpc('fn_admin_alerta_devolver', { p_id: id, p_comentario: comentario }); },
        async aprobarAlerta(id, editado, fuente, comentario) { return rpc('fn_admin_alerta_aprobar', { p_id: id, p_editado: editado, p_fuente_verificada: !!fuente, p_comentario: comentario }); },
        async archivarAlerta(id, motivo) { return rpc('fn_admin_alerta_archivar', { p_id: id, p_motivo: motivo }); },
        async eliminarAlerta(id) { return rpc('fn_admin_alerta_eliminar', { p_id: id }); },
        async consejosAdmin() { return rpc('fn_admin_consejos'); },
        async consejoAdmin(id) { return rpc('fn_admin_consejo', { p_id: id }); },
        async guardarConsejo(p) { return rpc('fn_admin_consejo_guardar', { p }); },
        async enviarConsejo(id) { return rpc('fn_admin_consejo_enviar', { p_id: id }); },
        async devolverConsejo(id, comentario) { return rpc('fn_admin_consejo_devolver', { p_id: id, p_comentario: comentario }); },
        async aprobarConsejo(id, editado, comentario) { return rpc('fn_admin_consejo_aprobar', { p_id: id, p_editado: editado, p_comentario: comentario }); },
        async archivarConsejo(id, motivo) { return rpc('fn_admin_consejo_archivar', { p_id: id, p_motivo: motivo }); },
        async eliminarConsejo(id) { return rpc('fn_admin_consejo_eliminar', { p_id: id }); },

        // ---------- Panel: generador con IA ----------
        /** Estado de la base + qué claves existen (la Edge Function responde solo sí o no, nunca su valor). */
        async iaEstado() {
          const [e, f] = await Promise.all([rpc('fn_ia_estado'), funcion('ia-generar', { accion: 'estado' }).catch(() => null)]);
          return Object.assign(e, { claves: f ? f.claves : null });
        },
        async iaConfigurar(p) { return rpc('fn_ia_configurar', { p }); },
        async iaTemaRepetido(tema) { return rpc('fn_ia_tema_repetido', { p_tema: tema }); },
        async iaSolicitar(p, clave) { return rpc('fn_ia_solicitar', { p, p_clave: clave }); },
        async iaTrabajos() { return rpc('fn_ia_trabajos'); },
        async iaTrabajo(id) { return rpc('fn_ia_trabajo', { p_id: id }); },
        async iaPaso(id) { return funcion('ia-generar', { accion: 'paso', trabajo: id }); },
        async iaCancelar(id) { return rpc('fn_ia_cancelar', { p_id: id }); },
        async iaConvertir(id, semana) { return rpc('fn_ia_convertir', { p_id: id, p_semana: semana }); },

        // ---------- Panel: cierre y sorteo ----------
        /** Semanas ya publicadas (las únicas que se cierran y sortean), de la más reciente a la más antigua. */
        async semanasSorteo() {
          const hoy = new Date().toLocaleDateString('en-CA', { timeZone: T.config.zonaHoraria });
          return (await rpc('fn_admin_semanas')).filter(s => ['PROGRAMADO', 'PUBLICADO'].includes(s.estado) && s.week_start <= hoy);
        },
        async sorteoSemana(id) { return rpc('fn_admin_sorteo', { p_semana: id }); },
        async cerrarSemana(id) { return rpc('fn_cerrar_semana', { p_semana: id }); },
        async ejecutarSorteo(id) { return rpc('fn_ejecutar_sorteo', { p_semana: id }); },
        async anularSorteo(id, motivo) { return rpc('fn_anular_sorteo', { p_sorteo: id, p_motivo: motivo }); },

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

      const PENDIENTES = ['resumen'];
      for (const m of PENDIENTES) api[m] = () => Promise.reject(T.error('NO_IMPLEMENTADO', 'Pendiente de su iteración: ' + m));
      return api;
    }
  };
})(window.T360);
