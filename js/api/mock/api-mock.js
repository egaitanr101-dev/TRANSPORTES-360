/* TRANSPORTES 360 — T360.api en modo DEMO: simula el contrato de las RPC de Supabase.
 * Reglas que imita del servidor real:
 *  - sin sesión → NO_AUTENTICADO;
 *  - las preguntas llegan sin la respuesta correcta y con opciones en orden propio de cada usuario;
 *  - la corrección ocurre aquí ("servidor"); el primer envío es OFICIAL, los siguientes PRÁCTICA (D-04);
 *  - la misma clave de idempotencia devuelve el mismo resultado (reintentos de red);
 *  - el sorteo es único por semana e idempotente, con aleatoriedad criptográfica y rechazo (sin Math.random).
 * Todo vive en memoria: al recargar la página, el estado de la demostración vuelve al inicio. */
(function (T) {
  'use strict';
  const D = T.mockDatos;
  const S = D.servidor;
  const espera = (ms) => new Promise(r => setTimeout(r, ms == null ? 120 : ms));
  const copia = (o) => JSON.parse(JSON.stringify(o));
  const RE_CODIGO = /^[A-Z0-9-]{2,20}$/;
  const CLAVE_SESION = 't360.demo.sesion';

  const estado = {
    sesion: leerSesion(),
    intentos: {},          // capsulaId → { puntaje }  (intento OFICIAL)
    idempotencia: {},      // clave → resultado
    vistas: new Set(),
    confirmadas: new Map(D.alertas.filter(a => a.confirmada).map(a => [a.id, 'antes'])),
    sorteos: {},
    semanas: []
  };

  // La sesión de la demo se recuerda solo en esta pestaña (sessionStorage), con try/catch por navegación privada.
  function leerSesion() { try { return sessionStorage.getItem(CLAVE_SESION) === '1'; } catch (e) { return false; } }
  function guardarSesion(v) {
    estado.sesion = v;
    try { if (v) sessionStorage.setItem(CLAVE_SESION, '1'); else sessionStorage.removeItem(CLAVE_SESION); } catch (e) { /* sin almacenamiento */ }
  }
  function exigirSesion() { if (!estado.sesion) throw T.error('NO_AUTENTICADO', 'Sin sesión'); }

  // Orden de opciones estable por usuario y pregunta (el servidor lo guarda en capsule_attempts.option_order)
  function barajar(lista, semilla) {
    let x = 0;
    for (const ch of semilla) x = (Math.imul(x, 31) + ch.charCodeAt(0)) | 0;
    const rnd = () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function semanaActual() {
    const s = copia(D.semana);
    for (const c of s.capsulas) {
      if (c.dia < s.hoy) c.estado = 'completada';
      else if (c.dia === s.hoy) { c.estado = estado.intentos[c.id] ? 'completada' : 'hoy'; if (estado.intentos[c.id]) c.puntos = estado.intentos[c.id].puntaje; }
      else c.estado = 'bloqueada';
    }
    s.completadas = s.capsulas.filter(c => c.estado === 'completada').length;
    s.puntos = s.capsulas.reduce((t, c) => t + (c.puntos || 0), 0);
    return s;
  }

  function validarContrasena(contrasena, codigo) {
    if (String(contrasena || '').length < 8) throw T.error('VALIDACION', 'La contraseña debe tener al menos 8 caracteres.');
    if (String(contrasena).toUpperCase().includes(codigo)) throw T.error('VALIDACION', 'La contraseña no puede contener su código de empleado.');
  }

  T.apiMock = {
    modo: 'DEMO',
    ayudaDemo: 'Demostración: código TR-0417 y cualquier contraseña de 8 caracteres o más. Para activar, use el código DEMO-2026.',

    // ---------- Sesión ----------
    async sesion() { await espera(20); return estado.sesion ? copia(D.usuario) : null; },

    async ingresar(codigo, contrasena) {
      await espera();
      codigo = String(codigo || '').trim().toUpperCase();
      if (!RE_CODIGO.test(codigo) || String(contrasena || '').length < 8) throw T.error('VALIDACION', 'Revise su código de empleado y su contraseña (mínimo 8 caracteres).');
      // Mismo mensaje para código inexistente o contraseña errónea: no revela qué códigos existen.
      if (codigo !== D.usuario.codigo) throw T.error('VALIDACION', 'Código o contraseña incorrectos.');
      guardarSesion(true);
      return copia(D.usuario);
    },

    async activar(codigo, codigoActivacion, contrasena, repetir) {
      await espera();
      codigo = String(codigo || '').trim().toUpperCase();
      if (codigo !== D.usuario.codigo || String(codigoActivacion || '').trim().toUpperCase() !== S.codigoActivacionDemo) {
        throw T.error('VALIDACION', 'El código de activación no es válido o ya venció. Pida uno nuevo a su supervisor.');
      }
      validarContrasena(contrasena, codigo);
      if (contrasena !== repetir) throw T.error('VALIDACION', 'Las contraseñas no coinciden.');
      guardarSesion(true);
      return copia(D.usuario);
    },

    async salir() { await espera(30); guardarSesion(false); },

    // ---------- Colaborador ----------
    async inicio() {
      exigirSesion(); await espera();
      const pendientes = D.alertas.filter(a => !estado.confirmadas.has(a.id));
      return copia({
        usuario: D.usuario, semana: semanaActual(),
        alertasPendientes: pendientes.map(a => ({ id: a.id, titulo: a.titulo, prioridad: a.prioridad })),
        consejo: D.consejo, categorias: D.categorias, reconocimientos: D.reconocimientos
      });
    },

    async semana() { exigirSesion(); await espera(); return semanaActual(); },

    async capsula(id) {
      exigirSesion(); await espera();
      const c = D.capsulas[id];
      if (!c) throw T.error('NO_ENCONTRADO', 'Cápsula no disponible.');
      estado.vistas.add(id);
      const r = copia(c);
      r.preguntas.forEach(q => { q.opciones = barajar(q.opciones, D.usuario.id + q.id); });
      r.intentoOficial = estado.intentos[id] ? { puntaje: estado.intentos[id].puntaje } : null;
      r.semana = { numero: D.semana.numero, tema: D.semana.tema };
      return r;
    },

    async responderCapsula(id, respuestas, claveIdempotencia) {
      exigirSesion(); await espera(250);
      if (claveIdempotencia && estado.idempotencia[claveIdempotencia]) return copia(estado.idempotencia[claveIdempotencia]);
      const c = D.capsulas[id];
      if (!c) throw T.error('NO_ENCONTRADO', 'Cápsula no disponible.');
      const resultados = c.preguntas.map(q => {
        const sel = respuestas && respuestas[q.id];
        if (!q.opciones.some(o => o.id === sel)) throw T.error('VALIDACION', 'Debe responder las 2 preguntas.');
        const k = S.claves[q.id];
        const ok = sel === k.correcta;
        return { pregunta_id: q.id, seleccionada: sel, correcta_id: k.correcta, es_correcta: ok, mensaje: ok ? k.explicacion : k.incorrecta };
      });
      const puntaje = resultados.filter(r => r.es_correcta).length;
      const tipo = estado.intentos[id] ? 'PRACTICA' : 'OFICIAL';
      if (tipo === 'OFICIAL') estado.intentos[id] = { puntaje };
      const res = { tipo, puntaje, total: c.preguntas.length, resultados };
      if (claveIdempotencia) estado.idempotencia[claveIdempotencia] = res;
      return copia(res);
    },

    async alertas() {
      exigirSesion(); await espera();
      return copia(D.alertas.map(a => ({ id: a.id, titulo: a.titulo, prioridad: a.prioridad, categoria: a.categoria, fecha: a.fecha, vence: a.vence, confirmada: estado.confirmadas.has(a.id) })));
    },

    async alerta(id) {
      exigirSesion(); await espera();
      const a = D.alertas.find(x => x.id === id);
      if (!a) throw T.error('NO_ENCONTRADO', 'Alerta no encontrada.');
      const r = copia(a);
      r.confirmada = estado.confirmadas.has(id);
      return r; // en Supabase: registra viewed_at (vista ≠ confirmada)
    },

    async confirmarAlerta(id) {
      exigirSesion(); await espera();
      if (!D.alertas.some(a => a.id === id)) throw T.error('NO_ENCONTRADO', 'Alerta no encontrada.');
      if (!estado.confirmadas.has(id)) estado.confirmadas.set(id, new Date().toISOString());
      return { confirmada: true };
    },

    async historial() {
      exigirSesion(); await espera();
      const s = semanaActual();
      const actual = { semana: s.numero, tema: s.tema, estado: 'En curso', capsulas: s.completadas, puntos: s.puntos };
      return copia({
        semanas: [actual].concat(D.historial),
        alertas: { confirmadas: estado.confirmadas.size, total: D.alertas.length }
      });
    },

    async aceptarPrivacidad() { exigirSesion(); await espera(); },

    // ---------- Panel: capacitación semanal (simula fn_admin_semana_*; reglas principales) ----------
    async categorias() { await espera(); return D.categorias.map((c, i) => ({ id: 'cat-' + i, nombre: c.nombre, activa: true })); },
    async semanasAdmin() {
      await espera();
      return copia(estado.semanas.map(s => ({ id: s.id, week_start: s.week_start, titulo: s.titulo, categoria: (D.categorias[Number(String(s.category_id).slice(4))] || {}).nombre, estado: s.estado, version: s.version, editor: D.admin.nombre, completas: s.capsulas.length, publica: s.publica || null })));
    },
    async semanaAdmin(id) {
      await espera();
      const s = estado.semanas.find(x => x.id === id);
      if (!s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      return copia(Object.assign({ editor: D.admin.nombre, historial: s.historial, bloqueada: false }, s));
    },
    async guardarSemana(p) {
      await espera(250);
      if (new Date(p.week_start + 'T12:00:00').getDay() !== 1) throw T.error('VALIDACION', 'La semana debe empezar un lunes.');
      if (!String(p.titulo || '').trim()) throw T.error('VALIDACION', 'Escriba el tema de la semana.');
      if (estado.semanas.some(x => x.week_start === p.week_start && x.id !== p.id && x.estado !== 'ARCHIVADO')) throw T.error('VALIDACION', 'Ya existe una capacitación para esa semana.');
      let s = p.id ? estado.semanas.find(x => x.id === p.id) : null;
      if (p.id && !s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      if (!s) { s = { id: 'sem-' + Date.now(), estado: 'BORRADOR', version: 0, historial: [] }; estado.semanas.push(s); s.historial.push({ fecha: new Date().toISOString(), de: null, a: 'BORRADOR', actor: D.admin.nombre }); }
      else if (!['BORRADOR', 'REQUIERE_CORRECCION', 'PENDIENTE_REVISION', 'PROGRAMADO'].includes(s.estado)) throw T.error('VALIDACION', 'Esta semana ya no se puede editar.');
      if (s.estado === 'PROGRAMADO' || s.estado === 'PENDIENTE_REVISION') { s.estado = 'PENDIENTE_REVISION'; s.publica = null; }
      Object.assign(s, copia({ week_start: p.week_start, category_id: p.category_id, titulo: p.titulo, objetivo: p.objetivo || '', capsulas: p.capsulas || [] }));
      s.version += 1;
      return s.id;
    },
    async enviarSemana(id) {
      await espera();
      const s = estado.semanas.find(x => x.id === id);
      if (!['BORRADOR', 'REQUIERE_CORRECCION'].includes(s.estado)) throw T.error('VALIDACION', 'Solo un borrador o una semana devuelta se envía a revisión.');
      if (s.capsulas.length !== 5) throw T.error('VALIDACION', 'La semana debe tener 5 cápsulas (lunes a viernes); tiene ' + s.capsulas.length + '.');
      for (const c of s.capsulas) {
        if (!c.bloques.length) throw T.error('VALIDACION', 'Una cápsula no tiene contenido.');
        if (c.preguntas.length !== 2 || c.preguntas.some(q => q.opciones.length < 3 || q.correcta == null)) throw T.error('VALIDACION', 'Cada cápsula necesita 2 preguntas con 3 o 4 opciones y una respuesta correcta.');
      }
      s.historial.push({ fecha: new Date().toISOString(), de: s.estado, a: 'PENDIENTE_REVISION', actor: D.admin.nombre });
      s.estado = 'PENDIENTE_REVISION';
      return { estado: s.estado };
    },
    async devolverSemana(id, comentario) {
      await espera();
      if (String(comentario || '').trim().length < 5) throw T.error('VALIDACION', 'Explique qué se debe corregir.');
      const s = estado.semanas.find(x => x.id === id);
      s.historial.push({ fecha: new Date().toISOString(), de: s.estado, a: 'REQUIERE_CORRECCION', comentario, actor: D.admin.nombre });
      s.estado = 'REQUIERE_CORRECCION';
      return { estado: s.estado };
    },
    async aprobarSemana(id, comentario) {
      await espera();
      const s = estado.semanas.find(x => x.id === id);
      if (s.estado !== 'PENDIENTE_REVISION') throw T.error('VALIDACION', 'Solo se aprueba una semana pendiente de revisión.');
      // En la demostración el mismo usuario edita y aprueba: se marca como "aprobador único", igual que en el servidor
      s.historial.push({ fecha: new Date().toISOString(), de: s.estado, a: 'PROGRAMADO', comentario, actor: D.admin.nombre });
      s.estado = 'PROGRAMADO'; s.publica = s.week_start + 'T00:00:00-06:00';
      return { estado: s.estado, publica: s.publica, aprobador_unico: true };
    },
    async archivarSemana(id) { await espera(); const s = estado.semanas.find(x => x.id === id); s.historial.push({ fecha: new Date().toISOString(), de: s.estado, a: 'ARCHIVADO', actor: D.admin.nombre }); s.estado = 'ARCHIVADO'; return { estado: s.estado }; },
    async eliminarSemana(id) {
      await espera();
      const s = estado.semanas.find(x => x.id === id);
      if (!['BORRADOR', 'REQUIERE_CORRECCION'].includes(s.estado)) throw T.error('VALIDACION', 'Solo se elimina un borrador que nunca fue aprobado; archive las demás.');
      estado.semanas = estado.semanas.filter(x => x.id !== id);
    },

    // ---------- Panel (en DEMO no pide ingreso; en Supabase exige sesión y permisos) ----------
    async adminSesion() { await espera(20); return copia(D.admin); },
    async adminIngresar() { await espera(); return copia(D.admin); },

    async usuarios() {
      await espera();
      return copia(D.usuarios.map(u => Object.assign({}, u, {
        activacion: u.activacion === 'PENDIENTE' && new Date(u.activacion_vence) <= new Date() ? 'VENCIDA' : u.activacion
      })));
    },
    async areas() { await espera(); return copia(D.areas); },

    async crearColaborador(d) {
      await espera(300);
      const codigo = String(d.codigo || '').trim().toUpperCase();
      if (!RE_CODIGO.test(codigo)) throw T.error('VALIDACION', 'Código de empleado no válido (letras, números y guiones).');
      if (String(d.nombre || '').trim().length < 3) throw T.error('VALIDACION', 'El nombre debe tener al menos 3 caracteres.');
      if (D.usuarios.some(u => u.codigo === codigo)) throw T.error('VALIDACION', 'Ya existe un usuario con ese código de empleado.');
      const area = D.areas.find(a => a.id === d.area);
      const sup = D.usuarios.find(u => u.id === d.supervisor);
      const nuevo = { id: 'u-demo-' + codigo.toLowerCase(), nombre: String(d.nombre).trim(), codigo, correo: null, rol: 'COLABORADOR', area: area ? area.nombre : null, supervisor: sup ? sup.nombre : null, activo: false, activacion: 'SIN_CODIGO', activacion_vence: null };
      D.usuarios.push(nuevo);
      const act = await T.apiMock.emitirActivacion(nuevo.id);
      return { id: nuevo.id, codigo: act.codigo, vence: act.vence };
    },

    /** Simula admin-usuarios → importar_colaboradores + fn_importar_completar (un lote de hasta 50). */
    async importarColaboradores(filas, horas) {
      await espera(400);
      if (!Array.isArray(filas) || filas.length < 1 || filas.length > 50) throw T.error('VALIDACION', 'Envíe entre 1 y 50 filas por lote.');
      const creados = [], omitidos = [];
      for (const f of filas) {
        const codigo = String(f.codigo || '').trim().toUpperCase();
        const nombre = String(f.nombre || '').trim();
        if (!RE_CODIGO.test(codigo)) { omitidos.push({ codigo, motivo: 'Código no válido' }); continue; }
        if (nombre.length < 3) { omitidos.push({ codigo, motivo: 'Nombre no válido' }); continue; }
        if (D.usuarios.some(u => u.codigo === codigo)) { omitidos.push({ codigo, motivo: 'Ya existe' }); continue; }
        let area = null;
        if (f.area) {
          area = D.areas.find(a => a.nombre.toLowerCase() === String(f.area).trim().toLowerCase());
          if (!area) { area = { id: String(f.area).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 20), nombre: String(f.area).trim() }; D.areas.push(area); }
        }
        const s = f.supervisor ? String(f.supervisor).trim().toLowerCase() : '';
        const sup = s ? D.usuarios.find(u => u.activo && u.rol !== 'COLABORADOR' && ((u.correo || '') === s || (u.codigo || '').toLowerCase() === s)) : null;
        const u = { id: 'u-demo-' + codigo.toLowerCase(), nombre, codigo, correo: null, rol: 'COLABORADOR', area: area ? area.nombre : null, supervisor: sup ? sup.nombre : null, activo: false, activacion: 'SIN_CODIGO', activacion_vence: null };
        D.usuarios.push(u);
        const act = await T.apiMock.emitirActivacion(u.id);
        const vence = new Date(Date.now() + (horas || 336) * 3600 * 1000).toISOString();
        u.activacion_vence = vence;
        creados.push({ id: u.id, codigo, nombre, area: u.area, supervisor: u.supervisor, codigo_activacion: act.codigo, vence, aviso: s && !sup ? 'Supervisor no encontrado: ' + f.supervisor : null });
      }
      return { creados, omitidos };
    },

    async invitarPersonal(d) {
      await espera(300);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.correo || ''))) throw T.error('VALIDACION', 'Correo no válido.');
      if (String(d.nombre || '').trim().length < 3) throw T.error('VALIDACION', 'El nombre debe tener al menos 3 caracteres.');
      if (d.rol !== 'SUPERVISOR' && !D.admin.permisos.includes('usuarios.gestionar_staff')) throw T.error('NO_AUTORIZADO', 'Solo el administrador principal invita administradores.');
      const area = D.areas.find(a => a.id === d.area);
      D.usuarios.push({ id: 'u-demo-' + Date.now(), nombre: d.nombre.trim(), codigo: null, correo: d.correo.toLowerCase(), rol: d.rol, area: area ? area.nombre : null, supervisor: null, activo: true, activacion: 'SIN_CODIGO', activacion_vence: null });
      return { correo: d.correo };
    },

    /** Simula fn_emitir_activacion: alfabeto sin ambiguos, bytes criptográficos con rechazo, vence en 72 h. */
    async emitirActivacion(id) {
      await espera();
      const u = D.usuarios.find(x => x.id === id);
      if (!u) throw T.error('NO_ENCONTRADO', 'Usuario no encontrado.');
      if (u.rol !== 'COLABORADOR') throw T.error('VALIDACION', 'Los códigos de activación son solo para colaboradores; el personal administrativo usa su correo.');
      const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let r = '';
      const b = new Uint8Array(1);
      while (r.length < 8) { crypto.getRandomValues(b); if (b[0] < 248) r += alfabeto[b[0] % 31]; }
      const codigo = r.slice(0, 4) + '-' + r.slice(4);
      const vence = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
      u.activacion = 'PENDIENTE'; u.activacion_vence = vence;
      return { codigo, vence };
    },

    async guardarUsuario(id, cambios) {
      await espera();
      const u = D.usuarios.find(x => x.id === id);
      if (!u) throw T.error('NO_ENCONTRADO', 'Usuario no encontrado.');
      if (id === D.admin.id && cambios.is_active === false) throw T.error('VALIDACION', 'No puede desactivar su propia cuenta.');
      if (cambios.is_active === true && u.rol === 'COLABORADOR' && u.activacion !== 'ACTIVADA') throw T.error('VALIDACION', 'El colaborador debe activar su cuenta con su código de activación.');
      if ('is_active' in cambios) u.activo = !!cambios.is_active;
      return { id, activo: u.activo };
    },
    async resumen() { await espera(); return copia(D.resumen); },
    async borrador() { await espera(); return copia(D.borrador); },

    async generarBorrador(form, alAvanzar) {
      if (!form || !String(form.tema || '').trim()) throw T.error('VALIDACION', 'Escriba el tema principal.');
      const pasos = ['EN_COLA · solicitud registrada (clave de idempotencia asignada)', 'EN_GENERACION · recuperando 14 fragmentos de 2 documentos', 'EN_GENERACION · investigando en 12 dominios confiables', 'EN_GENERACION · redactando 5 cápsulas con sus actividades', 'VALIDANDO · estructura, claves de respuesta y fuentes', 'GENERADO · borrador listo para revisión'];
      for (const p of pasos) { if (alAvanzar) alAvanzar(p); await espera(600); }
      return { borrador_id: D.borrador.id };
    },

    async sorteoSemana(n) {
      await espera();
      const s = D.sorteo[n];
      if (!s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      const r = copia(s);
      r.elegibles.sort((a, b) => a.id.localeCompare(b.id));
      r.sorteo = estado.sorteos[n] ? copia(estado.sorteos[n]) : null;
      return r;
    },

    async ejecutarSorteo(n) {
      await espera(300);
      if (estado.sorteos[n]) return Object.assign(copia(estado.sorteos[n]), { yaExistia: true });   // idempotente
      const s = D.sorteo[n];
      if (!s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      const lista = s.elegibles.slice().sort((a, b) => a.id.localeCompare(b.id));
      const total = lista.length;
      const limite = Math.floor(0x100000000 / total) * total;
      const buf = new Uint32Array(1);
      let valor, intentos = 0;
      do { crypto.getRandomValues(buf); valor = buf[0]; intentos++; } while (valor >= limite);
      let hash = '(requiere https o localhost)';
      if (crypto.subtle) {
        const bytes = new TextEncoder().encode(lista.map(e => e.id).join('\n') + '\n' + s.maximo);
        hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      }
      estado.sorteos[n] = {
        estado: 'OFICIAL', ganador: lista[valor % total], maximo: s.maximo, n: total, valor, intentos, posicion: valor % total,
        hash, algoritmo: 'v1-rejection-u32', ejecutadoPor: D.admin.nombre,
        fecha: new Date().toLocaleString('es-CR', { timeZone: T.config.zonaHoraria })
      };
      return copia(estado.sorteos[n]);
    }
  };
})(window.T360);
