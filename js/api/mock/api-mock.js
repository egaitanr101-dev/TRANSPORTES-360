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
    sorteos: {},           // semanaId → { cerrada, vigente, anulados }
    premios: D.premios.map(p => Object.assign({}, p)),
    semanas: [],
    editorial: { alerta: [], consejo: [] },
    ia: { encendida: false, mes_usd: 10, dia_trabajos: 10, trabajos: [] },
    biblio: { docs: [], fuentes: [], dominios: [], vinculos: [] },
    campanas: [], plan: {}, rotacion: [0, 3, 1, 2].map(i => 'cat-' + i), meses: 3, temas: []
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
        alertasPendientes: pendientes,
        consejo: D.consejo, campanas: campanasVisibles(), categorias: D.categorias, reconocimientos: D.reconocimientos, premios: estado.premios
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
      return copia(D.alertas.map(a => ({ id: a.id, titulo: a.titulo, prioridad: a.prioridad, categoria: a.categoria, version: a.version, publica: a.publica, vence: a.vence, confirmada: estado.confirmadas.has(a.id) })));
    },

    async alerta(id) {
      exigirSesion(); await espera();
      const a = D.alertas.find(x => x.id === id);
      if (!a) throw T.error('NO_ENCONTRADO', 'Alerta no encontrada.');
      const r = copia(a);
      r.confirmada = estado.confirmadas.has(id);
      return r; // en Supabase: registra viewed_at (vista ≠ confirmada)
    },

    async consejos() { exigirSesion(); await espera(); return copia([D.consejo]); },

    async confirmarAlerta(id) {
      exigirSesion(); await espera();
      if (!D.alertas.some(a => a.id === id)) throw T.error('NO_ENCONTRADO', 'Alerta no encontrada.');
      if (!estado.confirmadas.has(id)) estado.confirmadas.set(id, new Date().toISOString());
      return { confirmada: true, confirmada_el: estado.confirmadas.get(id) };
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

    // ---------- Panel: alertas y consejos (simula fn_admin_alerta_* y fn_admin_consejo_*; reglas principales) ----------
    async alertasAdmin() { await espera(); return copia(estado.editorial.alerta.map(resumenEditorial)); },
    async alertaAdmin(id) { await espera(); return copia(buscar('alerta', id)); },
    async guardarAlerta(p) { await espera(); return guardarEditorial('alerta', p); },
    async enviarAlerta(id) { await espera(); const a = buscar('alerta', id); const falta = !String(a.descripcion || '').trim() || !String(a.riesgo || '').trim() || !(a.recomendaciones || []).some(x => x.trim()) || !String(a.fuente || '').trim() || !a.vence; if (falta) throw T.error('VALIDACION', 'Complete descripción, riesgo, recomendaciones, fuente y vencimiento.'); return pasar(a, 'PENDIENTE_REVISION'); },
    async devolverAlerta(id, c) { await espera(); return pasar(buscar('alerta', id), 'REQUIERE_CORRECCION', motivo(c)); },
    async aprobarAlerta(id, editado, fuente, c) { await espera(); if (!fuente) throw T.error('VALIDACION', 'Confirme que verificó la fuente antes de aprobar.'); return aprobarEditorial(buscar('alerta', id), c, true); },
    async archivarAlerta(id, c) { await espera(); const a = buscar('alerta', id); a.vigente = null; return pasar(a, 'ARCHIVADO', motivo(c)); },
    async eliminarAlerta(id) { await espera(); estado.editorial.alerta = estado.editorial.alerta.filter(x => x.id !== id); },
    async consejosAdmin() { await espera(); return copia(estado.editorial.consejo.map(resumenEditorial)); },
    async consejoAdmin(id) { await espera(); return copia(buscar('consejo', id)); },
    async guardarConsejo(p) { await espera(); return guardarEditorial('consejo', p); },
    async enviarConsejo(id) { await espera(); const t = buscar('consejo', id); if (String(t.texto || '').trim().length < 10 || !String(t.fuente || '').trim()) throw T.error('VALIDACION', 'Escriba el consejo y su fuente.'); return pasar(t, 'PENDIENTE_REVISION'); },
    async devolverConsejo(id, c) { await espera(); return pasar(buscar('consejo', id), 'REQUIERE_CORRECCION', motivo(c)); },
    async aprobarConsejo(id, editado, c) { await espera(); return aprobarEditorial(buscar('consejo', id), c, false); },
    async archivarConsejo(id, c) { await espera(); return pasar(buscar('consejo', id), 'ARCHIVADO', motivo(c)); },
    async eliminarConsejo(id) { await espera(); estado.editorial.consejo = estado.editorial.consejo.filter(x => x.id !== id); },

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
    // ---------- Panel: reportes (cifras ficticias de demostración) ----------
    async resumen() {
      await espera();
      return copia({ equipo: false, semana: { id: 'sem-47', titulo: D.semana.tema, numero: 47, dia: 4, lunes: '2026-11-16', base: 142, ingresaron: 118, participaron: 112, completaron: 87, promedio: 8.4, promedio_oculto: false },
        alerta: { titulo: 'Mensajes falsos que se hacen pasar por bancos', version: 1, vence: '2026-11-30T18:00:00-06:00', audiencia: 142, vistas: 101, confirmadas: 88 },
        ia: { gastado_usd: estado.ia.trabajos.length ? 0 : 0, tope_usd: estado.ia.mes_usd, encendida: estado.ia.encendida },
        pendientes: { revision: estado.semanas.filter(s => s.estado === 'PENDIENTE_REVISION').length, sin_capacitacion: ['2026-11-30'], sorteos: [{ id: 'sem-46', titulo: 'Fatiga y somnolencia al volante', lunes: '2026-11-09' }], alertas_por_vencer: [], fuentes: 0 },
        errores: [{ pregunta: 'C2·P1 · Contraseña segura', respuestas: 107, correctas: 58, aciertos: 54 }, { pregunta: 'C3·P2 · Enlace acortado', respuestas: 100, correctas: 63, aciertos: 63 }] });
    },
    async reporteSemanas() { await espera(); return copia([{ id: 'sem-47', numero: 47, lunes: '2026-11-16', titulo: D.semana.tema, categoria: 'Seguridad digital', en_curso: true, cerrada: false, base: 142, ingresaron: 118, participaron: 112, completaron: 87, promedio: 8.4 },
      { id: 'sem-46', numero: 46, lunes: '2026-11-09', titulo: 'Fatiga y somnolencia al volante', categoria: 'Seguridad y trabajo', en_curso: false, cerrada: false, base: 142, ingresaron: 130, participaron: 121, completaron: 97, promedio: 8.9 }]); },
    async reporteAreas() { await espera(); return copia({ areas: D.areas.map((a, i) => ({ area: a.nombre, area_id: a.id, base: 50 - i * 8, ingresaron: 40 - i * 6, participaron: 38 - i * 6, completaron: 30 - i * 5, promedio: 8.5 - i * 0.3 })), sin_area: 3 }); },
    async reportePreguntas() { await espera(); return copia([{ dia: 2, capsula: 'Contraseñas', pregunta: 'C2·P1 · Contraseña segura', respuestas: 107, correctas: 58, aciertos: 54, error_comun: 'La fecha de nacimiento' }]); },
    async reporteAlertas() { await espera(); return copia(D.alertas.map(a => ({ id: a.id, titulo: a.titulo, prioridad: a.prioridad, version: 1, publica: a.publica, vence: a.vence, vigente: true, audiencia: 142, vistas: 101, confirmadas: 88 }))); },
    async reporteIA() { await espera(); return copia([{ mes: '2026-11', solicitudes: estado.ia.trabajos.length, simuladas: estado.ia.trabajos.filter(j => j.proveedor === 'simulado').length, generadas: estado.ia.trabajos.filter(j => j.estado === 'GENERADO').length, convertidas: 0, aprobadas: 0, costo_usd: 0, costo_estimado: false }]); },
    async miEquipo() { await espera(); return copia({ semana: { titulo: D.semana.tema, numero: 47, dia: 4, cierra: '2026-11-22' }, personas: D.usuarios.filter(u => u.rol === 'COLABORADOR').map((u, i) => ({ nombre: u.nombre, codigo: u.codigo, area: u.area, activo: u.activo, activada: u.activacion === 'ACTIVADA', capsulas: [4, 2, 0, 3][i % 4], alertas_pendientes: i % 2 })), semanas: [] }); },

    // ---------- Panel: campañas y calendario (en memoria) ----------
    async campanas() { await espera(); return copia(estado.campanas.map(c => Object.assign({}, c, { estado: c.archivada ? 'ARCHIVADA' : hoyISO() < c.desde ? 'PLANIFICADA' : hoyISO() > c.hasta ? 'TERMINADA' : 'EN_CURSO', elementos: c.items.length, categoria: nombreCat(c.category_id) }))); },
    async campana(id) {
      await espera();
      const c = campanaMock(id);
      const usados = new Set(c.items.map(i => i.ref));
      const cand = estado.semanas.map(s => ({ tipo: 'semana', ref: s.id, titulo: s.titulo, estado: s.estado })).concat(estado.editorial.alerta.map(a => ({ tipo: 'alerta', ref: a.id, titulo: a.titulo, estado: a.estado })), estado.editorial.consejo.map(t => ({ tipo: 'consejo', ref: t.id, titulo: t.titulo, estado: t.estado })));
      return copia(Object.assign({}, c, { elementos: c.items, candidatos: cand.filter(x => !usados.has(x.ref) && x.estado !== 'ARCHIVADO') }));
    },
    async campanaGuardar(p) {
      await espera();
      if (!p.desde || !p.hasta || p.hasta < p.desde) throw T.error('VALIDACION', 'Revise las fechas: el fin no puede ser antes del inicio.');
      if (String(p.nombre || '').trim().length < 3) throw T.error('VALIDACION', 'Escriba el nombre.');
      let c = p.id ? campanaMock(p.id) : null;
      if (!c) { c = { id: 'camp-' + Date.now(), items: [], visible: false, archivada: false }; estado.campanas.unshift(c); }
      const cambia = c.nombre !== p.nombre || c.descripcion !== p.descripcion || c.desde !== p.desde || c.hasta !== p.hasta;
      Object.assign(c, { nombre: p.nombre.trim(), descripcion: p.descripcion || '', category_id: p.category_id || null, desde: p.desde, hasta: p.hasta, visible: c.visible && !cambia });
      return c.id;
    },
    // En la demostración la misma persona edita y hace visible: se permite como única aprobadora, igual que en el servidor
    async campanaVisible(id, v) { await espera(); Object.assign(campanaMock(id), { visible: !!v, visible_por: v ? D.admin.nombre : null }); },
    async campanaArchivar(id) { await espera(); Object.assign(campanaMock(id), { archivada: true, visible: false }); },
    async campanaAgregar(id, tipo, ref) {
      await espera();
      const c = campanaMock(id);
      if (c.items.some(i => i.ref === ref)) throw T.error('VALIDACION', 'Ese elemento ya está en la campaña.');
      const o = tipo === 'semana' ? estado.semanas.find(s => s.id === ref) : estado.editorial[tipo].find(x => x.id === ref);
      c.items.push({ id: 'it-' + Date.now(), tipo, ref, titulo: o.titulo, estado: o.estado });
    },
    async campanaQuitar(itemId) { await espera(); for (const c of estado.campanas) c.items = c.items.filter(i => i.id !== itemId); },
    async calendario(desde, semanas) {
      await espera();
      const out = [];
      for (let i = 0; i < (semanas || 8); i++) {
        const l = sumarDias(desde, i * 7), plan = estado.plan[l] || null;
        const idx = Math.floor((new Date(l + 'T12:00:00') - new Date('2026-01-05T12:00:00')) / 6048e5);
        const rot = estado.rotacion.length ? estado.rotacion[((idx % estado.rotacion.length) + estado.rotacion.length) % estado.rotacion.length] : null;
        const real = estado.semanas.find(s => s.week_start === l && s.estado !== 'ARCHIVADO');
        const previo = estado.plan[sumarDias(l, -7)];
        out.push({ lunes: l, numero: semanaISO(l), plan: plan && Object.assign({ categoria: nombreCat(plan.category_id) }, plan),
          semana: real ? { id: real.id, titulo: real.titulo, estado: real.estado } : null,
          campanas: estado.campanas.filter(c => !c.archivada && sumarDias(l, 6) >= c.desde && l <= c.hasta).map(c => ({ id: c.id, nombre: c.nombre })),
          rotacion: rot ? { category_id: rot, categoria: nombreCat(rot) } : null,
          avisos: plan && previo && plan.category_id && plan.category_id === previo.category_id ? ['Misma categoría que la semana anterior.'] : [] });
      }
      return copia({ rotacion: estado.rotacion, repeticion_meses: estado.meses, semanas: out });
    },
    async calendarioGuardar(lunes, p) { await espera(); if (!p.category_id && !p.tema && !p.notas) delete estado.plan[lunes]; else estado.plan[lunes] = { category_id: p.category_id || null, tema: p.tema || '', notas: p.notas || '' }; },
    async calendarioConfigurar(rot, meses) { await espera(); if (!rot.length || new Set(rot).size !== rot.length) throw T.error('VALIDACION', 'Revise la rotación: cada categoría una vez.'); estado.rotacion = rot.slice(); estado.meses = meses; },
    async calendarioSugerencias(cat) { await espera(); return copia({ temas: estado.temas.filter(t => t.category_id === cat && t.activo), errores: [] }); },
    async temas() { await espera(); return copia(estado.temas.map(t => Object.assign({}, t, { categoria: nombreCat(t.category_id) }))); },
    async temaGuardar(p) { await espera(); if (String(p.titulo || '').trim().length < 3) throw T.error('VALIDACION', 'Escriba el tema (de 3 a 140 caracteres).'); const t = p.id && estado.temas.find(x => x.id === p.id); if (t) Object.assign(t, { activo: p.activo !== false }); else estado.temas.push({ id: 'tema-' + Date.now(), category_id: p.category_id, titulo: p.titulo.trim(), activo: true }); },

    // ---------- Panel: biblioteca y fuentes (en memoria; los archivos no se guardan en ninguna parte) ----------
    async docs(temporales) { await espera(); return copia(estado.biblio.docs.filter(d => !!d.temporal === !!temporales).map(d => { const v = d.versiones.find(x => x.id === d.version_actual) || {}; return Object.assign({}, d, { version: v.etiqueta, procesado: v.estado, fragmentos: v.fragmentos, archivo: v.archivo, categoria: null }); })); },
    async doc(id) { await espera(); return copia(docMock(id)); },
    async docGuardar(p) {
      await espera();
      if (!['COLABORADORES', 'ADMIN', 'RESTRINGIDO'].includes(p.acceso)) throw T.error('VALIDACION', 'Clasifique el acceso del documento.');
      if (String(p.titulo || '').trim().length < 3) throw T.error('VALIDACION', 'Escriba el título.');
      let d = p.id ? docMock(p.id) : null;
      if (!d) { d = { id: 'doc-' + Date.now(), versiones: [], estado: 'ACTIVO', usos: 0, version_actual: null }; estado.biblio.docs.unshift(d); }
      Object.assign(d, copia(p), { id: d.id, ia: p.acceso === 'RESTRINGIDO' ? false : !!p.ia, purga: p.temporal ? new Date(Date.now() + 30 * 864e5).toISOString() : null });
      return d.id;
    },
    async docSubir(docId, archivo, x, etiqueta) {
      await espera(300);
      const d = docMock(docId), ya = d.versiones.find(v => v.sha256 === x.sha256);
      if (ya) return { estado: ya.estado, ya_existia: true, fragmentos: ya.fragmentos };
      const v = { id: 'ver-' + Date.now(), etiqueta: etiqueta || 'v' + (d.versiones.length + 1), archivo: x.nombre, tipo: x.ext, tamano: x.tamano, sha256: x.sha256, estado: x.fragmentos.length ? 'LISTO' : 'SIN_TEXTO', paginas: x.paginas, fragmentos: x.fragmentos.length, nota: x.nota, ruta: '(demostración)', subido_por: D.admin.nombre, subido: new Date().toISOString(), texto: x.fragmentos };
      d.versiones.unshift(v); d.version_actual = v.id;
      return { estado: v.estado, fragmentos: v.fragmentos, ya_existia: false };
    },
    async docEstado(id, est, motivo) { await espera(); if (String(motivo || '').trim().length < 5) throw T.error('VALIDACION', 'Explique el motivo.'); docMock(id).estado = est; },
    async docBuscar(texto) {
      await espera();
      const palabras = String(texto || '').toLowerCase().split(/\s+/).filter(p => p.length > 2);
      if (!palabras.length) return [];
      const out = [];
      for (const d of estado.biblio.docs) {
        const v = d.versiones.find(x => x.id === d.version_actual);
        if (!v || d.estado !== 'ACTIVO' || d.temporal) continue;
        v.texto.forEach((f, i) => { if (palabras.some(p => f.texto.toLowerCase().includes(p))) out.push({ documento: d.id, titulo: d.titulo, version: v.etiqueta, seccion: f.seccion, fragmento: i, extracto: f.texto.slice(0, 240), vencido: false }); });
      }
      return out.slice(0, 30);
    },
    async docDescargar() { await espera(); throw T.error('VALIDACION', 'En la demostración los archivos no se guardan.'); },
    async dominios() { await espera(); return copia(estado.biblio.dominios); },
    async dominioGuardar(p) {
      await espera();
      const dom = String(p.dominio || '').toLowerCase().trim().replace(/^(https?:\/\/)?(www\.)?/, '');
      if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(dom)) throw T.error('VALIDACION', 'Escriba solo el dominio, por ejemplo ministeriodesalud.go.cr.');
      const ya = estado.biblio.dominios.find(x => x.dominio === dom);
      const nuevo = { dominio: dom, entidad: p.entidad, confiabilidad: p.confiabilidad, activo: p.activo !== false, validado_por: D.admin.nombre, validado: new Date().toISOString() };
      if (ya) Object.assign(ya, nuevo); else estado.biblio.dominios.push(nuevo);
    },
    async fuentes(est) { await espera(); return copia(estado.biblio.fuentes.filter(f => !est || f.estado === est).map(f => Object.assign({}, f, { dominio_confiable: estado.biblio.dominios.some(x => x.activo && (f.dominio === x.dominio || f.dominio.endsWith('.' + x.dominio))) ? f.dominio : null }))); },
    async fuenteGuardar(p) {
      await espera();
      if (!/^https:\/\/[^\s<>"]+$/.test(String(p.url || '').trim())) throw T.error('VALIDACION', 'La dirección debe empezar con https://');
      const url = p.url.trim();
      if (estado.biblio.fuentes.some(f => f.url === url)) throw T.error('VALIDACION', 'Esa fuente ya está registrada.');
      const f = { id: 'fue-' + Date.now(), entidad: p.entidad, titulo: p.titulo, url, dominio: url.replace(/^https:\/\/(www\.)?/, '').split(/[/:?#]/)[0].toLowerCase(), estado: 'PENDIENTE', registrada_por: D.admin.nombre, mia: true, usos: 0, notas: '' };
      estado.biblio.fuentes.unshift(f);
      return f.id;
    },
    // En la demostración la misma persona registra y valida: se permite como única validadora, igual que en el servidor
    async fuenteValidar(id, est, notas) { await espera(); if (est === 'RECHAZADA' && String(notas || '').trim().length < 5) throw T.error('VALIDACION', 'Explique por qué se rechaza.'); Object.assign(estado.biblio.fuentes.find(f => f.id === id), { estado: est, validada_por: D.admin.nombre, notas: notas || '' }); return { estado: est, validador_unico: true }; },
    async vinculos(tipo, id) { await espera(); return copia(estado.biblio.vinculos.filter(v => v.tipo_contenido === tipo && v.contenido === id)); },
    async vincular(p) {
      await espera();
      const f = p.fuente_id ? estado.biblio.fuentes.find(x => x.id === p.fuente_id) : null, d = p.documento_id ? docMock(p.documento_id) : null;
      if (f && f.estado !== 'VALIDADA') throw T.error('VALIDACION', 'Solo se vinculan fuentes validadas.');
      const v = d && d.versiones.find(x => x.id === d.version_actual);
      const ext = String(p.extracto || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (d && ext && !v.texto.some(t => t.texto.toLowerCase().replace(/\s+/g, ' ').includes(ext))) throw T.error('VALIDACION', 'El extracto no aparece en el documento. Copie el texto tal como está.');
      if (estado.biblio.vinculos.some(x => x.contenido === p.id && x.fuente === (p.fuente_id || p.documento_id))) throw T.error('VALIDACION', 'Esa fuente ya está vinculada.');
      estado.biblio.vinculos.push({ id: 'vin-' + Date.now(), tipo_contenido: p.tipo, contenido: p.id, fuente: p.fuente_id || p.documento_id, tipo: f ? 'externa' : 'documento', nombre: f ? f.entidad + ' · ' + f.titulo : d.titulo + ' (' + v.etiqueta + ')', url: f ? f.url : null, estado: f ? 'VALIDADA' : 'VIGENTE', seccion: p.seccion || '', extracto: p.extracto || '' });
    },
    async desvincular(id) { await espera(); estado.biblio.vinculos = estado.biblio.vinculos.filter(v => v.id !== id); },

    // ---------- Panel: generador con IA (simulado: nunca llama a un proveedor) ----------
    async iaEstado() {
      await espera();
      const i = estado.ia;
      return copia({ encendida: i.encendida, mes_usd: i.mes_usd, dia_trabajos: i.dia_trabajos, gastado_usd: 0, trabajos_hoy: i.trabajos.length, claves: { anthropic: false }, modelos: [
        { proveedor: 'anthropic', proveedor_nombre: 'Anthropic (Claude)', modelo: 'claude-opus-5-5', nombre: 'Claude Opus 5.5', defecto: true, habilitado: true, entrada: 4, salida: 20, precio_del: '2026-11-24', maximo: { weekly_training: 2.048, alert: 0.208, tip: 0.128 } },
        { proveedor: 'simulado', proveedor_nombre: 'Simulación (sin costo)', modelo: 'simulado', nombre: 'Simulación · ejemplo fijo', defecto: false, habilitado: true, entrada: 0, salida: 0, precio_del: '2026-11-24', maximo: { weekly_training: 0, alert: 0, tip: 0 } }] });
    },
    async iaConfigurar(p) { await espera(); for (const k of ['encendida', 'mes_usd', 'dia_trabajos']) if (k in p) estado.ia[k] = p[k]; },
    async iaTemaRepetido(tema) { await espera(); return /fatiga|estafa/i.test(tema) ? [{ semana: 46, titulo: 'Fatiga y somnolencia al volante', fecha: '2026-11-09' }] : []; },
    async iaSolicitar(p, clave) {
      await espera();
      const ya = estado.ia.trabajos.find(j => j.clave === clave);
      if (ya) return { id: ya.id, ya_existia: true };
      if (String(p.tema || '').trim().length < 5) throw T.error('VALIDACION', 'Escriba el tema (de 5 a 140 caracteres).');
      if (/[^\s@]+@[^\s@]+\.[^\s@]+|[0-9]([ .-]?[0-9]){7,}/.test([p.tema, p.objetivo, p.publico, p.instrucciones].join(' '))) throw T.error('VALIDACION', 'No incluya correos, teléfonos ni números de identificación: el texto se envía al proveedor de IA.');
      const pasos = ({ weekly_training: ['plan', 'dia1', 'dia2', 'dia3', 'dia4', 'dia5'], alert: ['alerta'], tip: ['consejo'] })[p.tipo];
      const j = { id: 'ia-' + Date.now(), clave, tipo: p.tipo, tema: p.tema.trim(), estado: 'EN_COLA', proveedor: p.proveedor, modelo: p.modelo, solicitado_por: D.admin.nombre, mio: true, creado: new Date().toISOString(),
        contenido_id: null, total: pasos.length, listos: 0, costo_usd: 0, informe: null, categoria: (D.categorias[Number(String(p.category_id).slice(4))] || {}).nombre, pasos: pasos.map(x => ({ paso: x, estado: 'PENDIENTE', costo_usd: 0 })) };
      estado.ia.trabajos.unshift(j);
      return { id: j.id, ya_existia: false };
    },
    async iaTrabajos() { await espera(); return copia(estado.ia.trabajos); },
    async iaTrabajo(id) { await espera(); return copia(trabajoIA(id)); },
    async iaPaso(id) {
      await espera(350);
      const j = trabajoIA(id), p = j.pasos.find(x => x.estado !== 'OK');
      if (j.proveedor !== 'simulado') { p.estado = 'FALLIDO'; p.error = 'La demostración no llama a proveedores de IA.'; j.estado = 'FALLIDO'; return { terminado: true, estado: j.estado, ok: false, errores: [p.error] }; }
      const e = D.ejemploCapsula, t = '[SIMULACIÓN] ' + j.tema;
      p.resultado = p.paso === 'plan' ? { titulo: t, objetivo: 'Objetivo de ejemplo.' }
        : p.paso === 'alerta' ? { titulo: t, descripcion: 'Descripción de ejemplo.', riesgo: 'Riesgo de ejemplo.', recomendaciones: ['Recomendación de ejemplo.'] }
        : p.paso === 'consejo' ? { titulo: t, texto: 'Texto de ejemplo.', compartir: '' }
        : { titulo: t, objetivo: e.objetivo, minutos: e.minutos, bloques: e.bloques, preguntas: e.preguntas };
      p.estado = 'OK'; j.listos += 1; j.estado = j.listos === j.total ? 'GENERADO' : 'EN_GENERACION';
      if (j.estado === 'GENERADO') j.informe = { advertencias: ['La IA no consultó documentos ni fuentes externas: el revisor debe verificar el contenido y agregar la fuente.'] };
      return { terminado: j.estado === 'GENERADO', estado: j.estado, ok: true, errores: [], paso: p.paso };
    },
    async iaCancelar(id) { await espera(); trabajoIA(id).estado = 'CANCELADO'; },
    async iaConvertir() { await espera(); throw T.error('VALIDACION', 'Una simulación no se convierte en contenido: sirve solo para probar el proceso.'); },

    // ---------- Panel: cierre y sorteo (simula fn_admin_sorteo, fn_cerrar_semana, fn_ejecutar_sorteo, fn_anular_sorteo) ----------
    async semanasSorteo() {
      await espera();
      return Object.entries(D.sorteo).map(([id, s]) => ({ id, titulo: s.titulo, week_start: s.week_start, week_end: s.week_end, estado: 'PUBLICADO' }));
    },
    async sorteoSemana(id) {
      await espera();
      const s = D.sorteo[id];
      if (!s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      const e = estadoSorteo(id);
      const cerrada = !!e.cerrada;
      return copia({
        semana: { id, titulo: s.titulo, week_start: s.week_start, week_end: s.week_end, cerrada, cerrada_el: e.cerrada || null, puede_cerrar: !cerrada && !s.enCurso },
        base: cerrada ? s.base : null, participaron: cerrada ? s.participaron : 0, completaron: cerrada ? s.completaron : 0, excluidos: cerrada ? s.excluidos : 0,
        maximo: cerrada ? s.maximo : null,
        elegibles: cerrada ? s.elegibles.slice().sort((a, b) => (a.id < b.id ? -1 : 1)) : [],
        sorteo: e.vigente, anulados: e.anulados
      });
    },
    async cerrarSemana(id) {
      await espera(250);
      const s = D.sorteo[id], e = estadoSorteo(id);
      if (!s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      if (e.cerrada) return { cerrada: true, ya_estaba: true };
      if (s.enCurso) throw T.error('VALIDACION', 'La semana termina el domingo ' + s.week_end.slice(8) + ' a las 11:59 p. m.; todavía no se puede cerrar.');
      e.cerrada = new Date().toISOString();
      return { cerrada: true, ya_estaba: false, resultados: s.base };
    },
    async ejecutarSorteo(id) {
      await espera(300);
      const s = D.sorteo[id], e = estadoSorteo(id);
      if (!s) throw T.error('NO_ENCONTRADO', 'Semana no encontrada.');
      if (e.vigente) return { id: e.vigente.id, ya_existia: true };              // idempotente
      if (!e.cerrada) await T.apiMock.cerrarSemana(id);                           // cierre perezoso
      const lista = s.elegibles.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
      const total = lista.length;
      const limite = Math.floor(0x100000000 / total) * total;                     // rechazo: sin sesgo de módulo
      const buf = new Uint32Array(1);
      let valor, hex = '';
      do { crypto.getRandomValues(buf); valor = buf[0]; hex += valor.toString(16).padStart(8, '0'); } while (valor >= limite);
      let hash = '(requiere https o localhost)';
      if (crypto.subtle) {
        const bytes = new TextEncoder().encode(lista.map(x => x.id).join('\n') + '\n' + s.maximo);
        hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      }
      const g = lista[valor % total];
      e.vigente = {
        id: 'draw-' + Date.now(), estado: 'OFICIAL', maximo: s.maximo, n: total, fecha: new Date().toISOString(), ejecutadoPor: D.admin.nombre,
        ganador: { codigo: g.codigo, nombre: g.nombre }, bytes: hex, hash, algoritmo: 'v1-rejection-u32 (demostración: bytes del navegador)',
        reemplaza: e.anulados.length ? e.anulados[e.anulados.length - 1].id : null
      };
      return { id: e.vigente.id, ya_existia: false };
    },
    async anularSorteo(idSorteo, motivo) {
      await espera(250);
      if (String(motivo || '').trim().length < 10) throw T.error('VALIDACION', 'Explique el motivo de la anulación (mínimo 10 caracteres).');
      const e = Object.values(estado.sorteos).find(x => x.vigente && x.vigente.id === idSorteo);
      if (!e) throw T.error('VALIDACION', 'Ese sorteo ya está anulado.');
      const v = e.vigente;
      e.anulados.push({ id: v.id, fecha: v.fecha, anulado: new Date().toISOString(), motivo: String(motivo).trim(), ganador: v.ganador.nombre, anuladoPor: D.admin.nombre });
      e.vigente = null;
      return { estado: 'ANULADO' };
    },

    // ---------- Colaborador: consentimiento del ganador (D-08) ----------
    async reconocimientoPublico(id, publico) {
      exigirSesion(); await espera();
      const p = estado.premios.find(x => x.id === id);
      if (!p) throw T.error('NO_ENCONTRADO', 'Reconocimiento no encontrado.');
      p.publico = !!publico;
    }
  };

  function buscar(tipo, id) { const x = estado.editorial[tipo].find(e => e.id === id); if (!x) throw T.error('NO_ENCONTRADO', 'No encontrado.'); return x; }
  function motivo(c) { if (String(c || '').trim().length < 5) throw T.error('VALIDACION', 'Escriba el motivo (mínimo 5 caracteres).'); return c.trim(); }
  function resumenEditorial(x) { return Object.assign({}, x, { categoria: (D.categorias[Number(String(x.category_id).slice(4))] || {}).nombre, vigente: !!x.vigente, seguimiento: x.vigente ? x.vigente.seguimiento : null, publica: x.vigente ? x.vigente.publica : x.publica, vence: x.vence }); }
  function pasar(x, a, comentario) { x.historial.push({ fecha: new Date().toISOString(), version: x.version, de: x.estado, a, comentario, actor: D.admin.nombre }); x.estado = a; return { estado: a }; }
  function guardarEditorial(tipo, p) {
    let x = p.id ? buscar(tipo, p.id) : null;
    if (!x) { x = { id: tipo + '-' + Date.now(), estado: 'BORRADOR', version: 1, historial: [], aprobada: false, vigente: null }; estado.editorial[tipo].push(x); pasar(x, 'BORRADOR'); }
    else if (x.estado === 'PUBLICADO') { x.version += 1; pasar(x, 'BORRADOR', 'Nueva versión'); }
    else if (x.estado === 'PENDIENTE_REVISION') pasar(x, 'BORRADOR', 'Editado durante la revisión');
    Object.assign(x, copia(p), { id: x.id, editado: new Date().toISOString(), editor: D.admin.nombre });
    if (x.recomendaciones) x.recomendaciones = x.recomendaciones.map(r => r.trim()).filter(Boolean);
    return x.id;
  }
  // En la demostración la misma persona edita y aprueba: se marca como única aprobadora, igual que en el servidor
  function aprobarEditorial(x, comentario, alerta) {
    if (x.estado !== 'PENDIENTE_REVISION') throw T.error('VALIDACION', 'Solo se aprueba lo que está pendiente de revisión.');
    pasar(x, 'PUBLICADO', comentario); x.aprobada = true; x.publica = x.publica || new Date().toISOString();
    if (alerta) x.vigente = { version: x.version, prioridad: x.prioridad, titulo: x.titulo, publica: x.publica, vence: x.vence, seguimiento: { audiencia: D.usuarios.filter(u => u.codigo).length, vistas: 0, confirmadas: 0 }, pendientes: D.usuarios.filter(u => u.codigo).map(u => ({ codigo: u.codigo, nombre: u.nombre, area: u.area, vista: false })) };
    return { estado: x.estado, publica: x.publica, aprobador_unico: true };
  }
  function campanaMock(id) { const c = estado.campanas.find(x => x.id === id); if (!c) throw T.error('NO_ENCONTRADO', 'Campaña no encontrada.'); return c; }
  function campanasVisibles() { return estado.campanas.filter(c => c.visible && !c.archivada && c.desde <= hoyISO() && hoyISO() <= c.hasta).map(c => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion, hasta: c.hasta, elementos: c.items.filter(i => i.tipo === 'consejo' ? estado.editorial.consejo.some(x => x.id === i.ref && x.estado === 'PUBLICADO') : i.tipo === 'alerta' ? estado.editorial.alerta.some(x => x.id === i.ref && x.vigente) : estado.semanas.some(s => s.id === i.ref && s.estado === 'PUBLICADO')).map(i => ({ tipo: i.tipo, id: i.ref, titulo: i.titulo })) })).filter(c => c.elementos.length); }
  function hoyISO() { return new Date().toLocaleDateString('en-CA', { timeZone: T.config.zonaHoraria }); }
  function sumarDias(iso, n) { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); }
  function semanaISO(iso) { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); }
  function nombreCat(id) { return id ? (D.categorias[Number(String(id).slice(4))] || {}).nombre || null : null; }
  function docMock(id) { const d = estado.biblio.docs.find(x => x.id === id); if (!d) throw T.error('NO_ENCONTRADO', 'Documento no encontrado.'); return d; }
  function trabajoIA(id) { const j = estado.ia.trabajos.find(x => x.id === id); if (!j) throw T.error('NO_ENCONTRADO', 'Solicitud no encontrada.'); return j; }
  function estadoSorteo(id) { return estado.sorteos[id] || (estado.sorteos[id] = { cerrada: null, vigente: null, anulados: [] }); }
})(window.T360);
