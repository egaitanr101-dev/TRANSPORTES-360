/* TRANSPORTES 360 — Panel: capacitación semanal (iteración 2).
 * Lista de semanas, editor (5 cápsulas, tarjetas por tipo, 2 preguntas con su clave), vista previa en teléfono
 * y flujo editorial: guardar → enviar a revisión → aprobar y programar (cuatro ojos) / devolver → archivar.
 * Todas las reglas las valida el servidor; aquí solo se ayuda a completar bien y se muestran sus mensajes. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const ETAPAS = ['Introducción', 'Conocimiento práctico', 'Aplicación', 'Prevención', 'Integración'];
  const ESTADOS = {
    BORRADOR: ['', 'Borrador'], PENDIENTE_REVISION: ['warn', 'Pendiente de revisión'], REQUIERE_CORRECCION: ['crit', 'Requiere corrección'],
    PROGRAMADO: ['good', 'Aprobada y programada'], PUBLICADO: ['good', 'Publicada'], ARCHIVADO: ['', 'Archivada']
  };
  const IMAGENES = [['', 'Sin imagen'], ['assets/img/portada-estafas.svg', 'Estafas: teléfono y escudo'], ['assets/img/ejemplo-luis.svg', 'Historia en 3 viñetas'], ['assets/img/infografia-estafas.svg', 'Infografía: 4 reglas']];

  // Campos de cada tipo de tarjeta: text, area, lineas (lista de textos), imagen, filas (lista de objetos)
  const TIPOS = {
    portada: { nombre: 'Portada', campos: [['titulo', 'Título', 'text'], ['objetivo', 'Qué va a aprender', 'area'], ['imagen', 'Imagen', 'imagen'], ['alt', 'Descripción de la imagen (accesibilidad)', 'text']] },
    texto: { nombre: 'Texto', campos: [['titulo', 'Título', 'text'], ['parrafos', 'Párrafos (uno por línea)', 'lineas'], ['puntos', 'Lista de puntos (uno por línea, opcional)', 'lineas']] },
    escenario: { nombre: '¿Qué haría usted?', campos: [['remitente', 'Quién envía el mensaje (opcional)', 'text'], ['mensaje', 'Situación o mensaje', 'area'], ['pregunta', 'Pregunta', 'text'],
      ['opciones', 'Opciones (marque las seguras)', 'filas', [['t', 'Opción', 'text'], ['segura', 'Segura', 'check'], ['reaccion', 'Reacción al elegirla', 'text']], 3]] },
    revelar: { nombre: 'Tarjetas para voltear', campos: [['titulo', 'Título', 'text'], ['tarjetas', 'Tarjetas', 'filas', [['error', 'Frente (error o riesgo)', 'text'], ['solucion', 'Reverso (cómo evitarlo)', 'text']], 4]] },
    detecta: { nombre: 'Detecte las señales', campos: [['titulo', 'Título', 'text'], ['remitente', 'Quién envía', 'text'],
      ['partes', 'Partes del mensaje en orden (escriba la señal solo en las sospechosas)', 'filas', [['t', 'Texto', 'text'], ['senal', 'Por qué es una señal', 'text']], 5], ['cierre', 'Mensaje al encontrarlas todas', 'text']] },
    historia: { nombre: 'Caso real', campos: [['titulo', 'Título', 'text'], ['imagen', 'Imagen', 'imagen'], ['alt', 'Descripción de la imagen', 'text'], ['pasos', 'Pasos (uno por línea)', 'lineas']] },
    infografia: { nombre: 'Infografía', campos: [['imagen', 'Imagen', 'imagen'], ['alt', 'Descripción de la imagen', 'text'], ['puntos', 'Puntos clave (uno por línea)', 'lineas'], ['compartir', 'Texto para compartir por WhatsApp', 'area']] },
    compromiso: { nombre: 'Compromiso y cierre', campos: [['cierre', 'Mensaje final', 'area'], ['opciones', 'Compromisos (uno por línea)', 'lineas'], ['fuente', 'Fuente', 'text']] }
  };

  const lunesDe = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); const dia = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dia); return x; };
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fechaCorta = (s) => { const [a, m, d] = String(s).split('-'); return d + '/' + m + '/' + a; };
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);
  const chipEstado = (e) => { const [c, t] = ESTADOS[e] || ['', e]; return h('span', { class: 'chip ' + c }, t); };

  function preguntaVacia() { return { texto: '', opciones: ['', '', '', ''], correcta: null, explicacion: '', retro: '' }; }
  function capsulaVacia(dia) { return { dia, titulo: '', objetivo: '', minutos: 4, bloques: [], preguntas: [preguntaVacia(), preguntaVacia()] }; }
  function bloqueVacio(tipo) {
    const b = { tipo };
    for (const [k, , kind, cols, n] of TIPOS[tipo].campos) {
      if (kind === 'lineas') b[k] = [];
      else if (kind === 'filas') b[k] = Array.from({ length: n || 3 }, () => Object.fromEntries(cols.map(([ck, , ckind]) => [ck, ckind === 'check' ? false : ''])));
      else b[k] = '';
    }
    return b;
  }
  function capsulaCompleta(c) {
    return c.titulo.trim().length >= 3 && c.bloques.length > 0 && c.preguntas.length === 2 &&
      c.preguntas.every(q => q.texto.trim().length >= 5 && q.opciones.filter(o => o.trim()).length >= 3 && q.correcta != null && q.opciones[q.correcta] && q.opciones[q.correcta].trim() &&
        q.explicacion.trim().length >= 3 && q.retro.trim().length >= 3);
  }

  /** Convierte el estado del editor en lo que acepta fn_admin_semana_guardar (omite lo incompleto para que un borrador se guarde). */
  function aPayload(s) {
    const limpio = (b) => {
      const o = { tipo: b.tipo };
      for (const [k, , kind] of TIPOS[b.tipo].campos) {
        if (kind === 'lineas') o[k] = (b[k] || []).map(x => String(x).trim()).filter(Boolean);
        else if (kind === 'filas') o[k] = (b[k] || []).filter(f => Object.values(f).some(v => typeof v === 'string' ? v.trim() : false)).map(f => Object.fromEntries(Object.entries(f).map(([kk, vv]) => [kk, typeof vv === 'string' ? vv.trim() : vv])));
        else o[k] = String(b[k] || '').trim();
      }
      return o;
    };
    return {
      id: s.id || null, week_start: s.week_start, category_id: s.category_id, titulo: s.titulo.trim(), objetivo: s.objetivo.trim(),
      capsulas: s.capsulas.filter(c => c.titulo.trim().length >= 3).map(c => ({
        dia: c.dia, titulo: c.titulo.trim(), objetivo: c.objetivo.trim(), minutos: Number(c.minutos) || 4,
        bloques: c.bloques.map(limpio),
        preguntas: c.preguntas.filter(q => q.texto.trim().length >= 5).map(q => {
          const ops = q.opciones.map(o => o.trim());
          const validas = ops.filter(Boolean);
          const idx = q.correcta != null && ops[q.correcta] ? validas.indexOf(ops[q.correcta]) : -1;
          const conClave = idx >= 0 && q.explicacion.trim().length >= 3 && q.retro.trim().length >= 3;
          return Object.assign({ texto: q.texto.trim(), opciones: validas }, conClave ? { correcta: idx, explicacion: q.explicacion.trim(), retro: q.retro.trim() } : {});
        })
      }))
    };
  }

  // ---------- Lista ----------
  T.enrutador.registrar('capacitacion', async () => {
    T.adm.cargando('capacitacion');
    const semanas = await T.api.semanasAdmin();
    T.adm.marco('capacitacion',
      h('header', null,
        h('div', null, h('h1', null, 'Capacitación semanal'), h('p', { class: 'muted', style: 'margin:0' }, 'Una semana = 5 cápsulas (lunes a viernes) con 2 preguntas cada una.')),
        puede('contenido.crear_editar') ? h('a', { class: 'btn primary', href: '#semana/nueva' }, icon('week', 'sm'), 'Nueva semana') : null),
      h('section', { class: 'card' }, semanas.length
        ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' },
          h('thead', null, h('tr', null, ['Semana', 'Tema', 'Categoría', 'Cápsulas', 'Estado', ''].map(t => h('th', null, t)))),
          h('tbody', null, semanas.map(s => h('tr', null,
            h('td', null, fechaCorta(s.week_start)), h('td', null, h('strong', null, s.titulo)), h('td', null, s.categoria || '—'),
            h('td', null, s.completas + ' / 5'), h('td', null, chipEstado(s.estado)),
            h('td', null, h('a', { class: 'btn', style: 'min-height:38px', href: '#semana/' + encodeURIComponent(s.id) }, 'Abrir')))))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay semanas. Cree la primera con "Nueva semana".')));
  });

  // ---------- Revisión: semanas pendientes de aprobar ----------
  T.enrutador.registrar('revision', async () => {
    T.adm.cargando('revision');
    const pendientes = (await T.api.semanasAdmin()).filter(s => s.estado === 'PENDIENTE_REVISION');
    T.adm.marco('revision',
      h('header', null, h('div', null, h('h1', null, 'Revisión y aprobación'), h('p', { class: 'muted', style: 'margin:0' }, 'Quien editó una semana no puede aprobarla (regla de cuatro ojos).'))),
      h('section', { class: 'card' }, pendientes.length
        ? h('ul', { class: 'checks' }, pendientes.map(s => h('li', null, icon('audit', 'sm'),
          h('span', { style: 'flex:1' }, h('strong', null, s.titulo), ' · semana del ', fechaCorta(s.week_start), ' · editada por ', s.editor || '—'),
          h('a', { class: 'btn', style: 'min-height:38px', href: '#semana/' + encodeURIComponent(s.id) }, 'Revisar'))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'No hay semanas pendientes de revisión.')));
  });

  // ---------- Editor ----------
  T.enrutador.registrar('semana', async (id) => {
    T.adm.cargando('capacitacion');
    const [categorias, datos] = await Promise.all([T.api.categorias(), id && id !== 'nueva' ? T.api.semanaAdmin(id) : Promise.resolve(null)]);
    const s = datos ? JSON.parse(JSON.stringify(datos)) : {
      id: null, week_start: iso(lunesDe(new Date(Date.now() + 7 * 864e5))), category_id: (categorias.find(c => c.activa) || {}).id, titulo: '', objetivo: '',
      estado: 'BORRADOR', version: 0, historial: [], capsulas: []
    };
    s.capsulas = [1, 2, 3, 4, 5].map(d => {
      const c = (s.capsulas || []).find(x => x.dia === d);
      if (!c) return capsulaVacia(d);
      c.preguntas = (c.preguntas || []).map(q => ({ texto: q.texto || '', opciones: (q.opciones || []).concat(['', '', '', '']).slice(0, 4), correcta: q.correcta, explicacion: q.explicacion || '', retro: q.retro || '' }));
      while (c.preguntas.length < 2) c.preguntas.push(preguntaVacia());
      c.bloques = c.bloques || [];
      return c;
    });
    const editable = ['BORRADOR', 'REQUIERE_CORRECCION', 'PENDIENTE_REVISION', 'PROGRAMADO'].includes(s.estado) && !s.bloqueada && puede('contenido.crear_editar');
    let dia = 0;
    let sucio = false;
    const marcar = () => { sucio = true; pintarAcciones(); pintarTabs(); };
    const acciones = h('div', { class: 'row wrap' });
    const tabs = h('div', { class: 'capsule-tabs', role: 'tablist' });
    const panel = h('div');
    const mensaje = h('p', { class: 'form-error', role: 'alert' });

    // Lunes disponibles: semana actual y 16 siguientes (más la guardada, si es anterior)
    const lunes = [];
    for (let i = 0; i <= 16; i++) lunes.push(iso(lunesDe(new Date(Date.now() + i * 7 * 864e5))));
    if (!lunes.includes(s.week_start)) lunes.unshift(s.week_start);

    const campo = (etq, control, ayuda) => h('div', { class: 'field' }, h('label', null, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null);
    const entrada = (obj, k, attrs) => h(attrs && attrs.area ? 'textarea' : 'input', Object.assign({ disabled: !editable, oninput: (e) => { obj[k] = e.target.value; marcar(); } }, attrs || {}, { area: null }), attrs && attrs.area ? String(obj[k] || '') : null);
    const valor = (el, v) => { if (el.tagName !== 'TEXTAREA') el.value = v == null ? '' : v; return el; };

    async function ejecutar(boton, fn, exito) {
      T.limpiar(mensaje);
      boton.disabled = true;
      try { const r = await fn(); if (exito) exito(r); }
      catch (e) { mensaje.textContent = T.ui.mensajeDe(e); boton.disabled = false; window.scrollTo(0, 0); }
    }
    async function guardar() {
      if (!s.titulo.trim()) throw T.error('VALIDACION', 'Escriba el tema de la semana.');
      const nuevoId = await T.api.guardarSemana(aPayload(s));
      sucio = false;
      return nuevoId;
    }
    const recargar = (nuevoId) => { if (nuevoId && nuevoId !== s.id) location.hash = '#semana/' + encodeURIComponent(nuevoId); else T.enrutador.recargar(); };

    function pintarAcciones() {
      const b = [];
      if (editable) b.push(h('button', { class: 'btn primary', onclick: (e) => ejecutar(e.currentTarget, guardar, (nid) => { T.ui.aviso('Semana guardada.'); recargar(nid); }) }, 'Guardar' + (sucio ? ' *' : '')));
      if (editable && ['BORRADOR', 'REQUIERE_CORRECCION'].includes(s.estado)) b.push(h('button', { class: 'btn', onclick: (e) => ejecutar(e.currentTarget, async () => { const nid = sucio || !s.id ? await guardar() : s.id; await T.api.enviarSemana(nid); return nid; }, (nid) => { T.ui.aviso('Enviada a revisión.'); recargar(nid); }) }, 'Enviar a revisión'));
      if (s.id && s.estado === 'PENDIENTE_REVISION' && puede('contenido.aprobar')) {
        b.push(h('button', { class: 'btn primary', disabled: sucio, title: sucio ? 'Guarde antes de aprobar' : false, onclick: (e) => ejecutar(e.currentTarget, () => T.api.aprobarSemana(s.id, window.prompt('Comentario de aprobación (opcional):') || null), (r) => { T.ui.aviso(r.aprobador_unico ? 'Aprobada y programada (como único aprobador).' : 'Aprobada y programada.'); recargar(); }) }, icon('check', 'sm'), 'Aprobar y programar'));
        b.push(h('button', { class: 'btn', onclick: (e) => { const c = window.prompt('¿Qué se debe corregir?'); if (c != null) ejecutar(e.currentTarget, () => T.api.devolverSemana(s.id, c), () => { T.ui.aviso('Devuelta para corrección.'); recargar(); }); } }, 'Devolver'));
      }
      if (s.id && s.estado !== 'ARCHIVADO' && puede('contenido.aprobar')) b.push(h('button', { class: 'btn ghost', onclick: (e) => { if (window.confirm('¿Archivar esta semana? Dejará de verse.')) ejecutar(e.currentTarget, () => T.api.archivarSemana(s.id, null), () => { T.ui.aviso('Archivada.'); location.hash = '#capacitacion'; }); } }, 'Archivar'));
      if (s.id && ['BORRADOR', 'REQUIERE_CORRECCION'].includes(s.estado) && puede('contenido.crear_editar')) b.push(h('button', { class: 'btn ghost', onclick: (e) => { if (window.confirm('¿Eliminar este borrador? No se puede deshacer.')) ejecutar(e.currentTarget, () => T.api.eliminarSemana(s.id), () => { T.ui.aviso('Borrador eliminado.'); location.hash = '#capacitacion'; }); } }, 'Eliminar borrador'));
      b.push(h('button', { class: 'btn ghost', onclick: () => vistaPrevia(s.capsulas[dia]) }, icon('phone', 'sm'), 'Vista previa'));
      T.poner(acciones, b);
    }

    function pintarTabs() {
      T.poner(tabs, s.capsulas.map((c, i) => h('button', { role: 'tab', 'aria-selected': i === dia ? 'true' : 'false', onclick: () => { dia = i; pintarTabs(); pintarCapsula(); } },
        (capsulaCompleta(c) ? '✔ ' : '') + DIAS[i])));
    }

    // ----- Formulario de una tarjeta -----
    function formBloque(c, i) {
      const b = c.bloques[i];
      const def = TIPOS[b.tipo];
      const mover = (d) => { const j = i + d; if (j < 0 || j >= c.bloques.length) return; [c.bloques[i], c.bloques[j]] = [c.bloques[j], c.bloques[i]]; marcar(); pintarCapsula(); };
      const cuerpo = def.campos.map(([k, etq, kind, cols]) => {
        if (kind === 'text') return campo(etq, valor(entrada(b, k, { maxlength: 300 }), b[k]));
        if (kind === 'area') return campo(etq, entrada(b, k, { area: true, maxlength: 1200, rows: 3 }));
        if (kind === 'imagen') return campo(etq, h('select', { disabled: !editable, onchange: (e) => { b[k] = e.target.value; marcar(); } }, IMAGENES.map(([v, t]) => h('option', { value: v, selected: (b[k] || '') === v }, t))), 'Más imágenes con la biblioteca (iteración 6).');
        if (kind === 'lineas') {
          const ta = h('textarea', { disabled: !editable, rows: 4, maxlength: 2000, oninput: (e) => { b[k] = e.target.value.split('\n'); marcar(); } }, (b[k] || []).join('\n'));
          return campo(etq, ta);
        }
        if (kind === 'filas') {
          const filas = b[k] = b[k] || [];
          return h('div', { class: 'field' }, h('label', null, etq),
            h('div', { class: 'stack' }, filas.map((f, fi) => h('div', { class: 'row', style: 'align-items:flex-start' },
              cols.map(([ck, cl, ckind]) => ckind === 'check'
                ? h('label', { class: 'row small', style: 'white-space:nowrap;min-height:48px' }, h('input', { type: 'checkbox', checked: !!f[ck], disabled: !editable, onchange: (e) => { f[ck] = e.target.checked; marcar(); } }), cl)
                : valor(h('input', { placeholder: cl, maxlength: 300, disabled: !editable, style: 'flex:1;min-width:0;min-height:44px;padding:.5rem .7rem;border:1px solid var(--border);border-radius:10px;background:var(--surface)', oninput: (e) => { f[ck] = e.target.value; marcar(); } }), f[ck])),
              editable ? h('button', { class: 'btn ghost', style: 'min-height:44px;padding:0 .6rem', 'aria-label': 'Quitar fila', onclick: () => { filas.splice(fi, 1); marcar(); pintarCapsula(); } }, icon('x', 'sm')) : null))),
            editable && filas.length < 8 ? h('button', { class: 'btn ghost small', style: 'align-self:flex-start', onclick: () => { filas.push(Object.fromEntries(cols.map(([ck, , ckind]) => [ck, ckind === 'check' ? false : '']))); marcar(); pintarCapsula(); } }, '+ Agregar fila') : null);
        }
        return null;
      });
      return h('section', { class: 'card', style: 'margin-top:.75rem' },
        h('div', { class: 'row between wrap' }, h('strong', null, (i + 1) + '. ' + def.nombre),
          editable ? h('div', { class: 'row' },
            h('button', { class: 'btn ghost', style: 'min-height:38px', 'aria-label': 'Subir', disabled: i === 0, onclick: () => mover(-1) }, '↑'),
            h('button', { class: 'btn ghost', style: 'min-height:38px', 'aria-label': 'Bajar', disabled: i === c.bloques.length - 1, onclick: () => mover(1) }, '↓'),
            h('button', { class: 'btn ghost', style: 'min-height:38px', onclick: () => { if (window.confirm('¿Quitar esta tarjeta?')) { c.bloques.splice(i, 1); marcar(); pintarCapsula(); } } }, 'Quitar')) : null),
        h('div', { class: 'form-grid', style: 'margin-top:.5rem' }, cuerpo.map(x => x ? (x.classList.add('full'), x) : null)));
    }

    function formPregunta(c, qi) {
      const q = c.preguntas[qi];
      return h('section', { class: 'card', style: 'margin-top:.75rem' },
        h('strong', null, 'Pregunta ' + (qi + 1)),
        h('div', { class: 'stack', style: 'margin-top:.5rem' },
          campo('Pregunta (situación práctica, una sola respuesta correcta)', entrada(q, 'texto', { area: true, rows: 2, maxlength: 400 })),
          h('div', { class: 'field' }, h('label', null, 'Opciones (mínimo 3) — marque la correcta'),
            h('div', { class: 'stack' }, q.opciones.map((o, oi) => h('div', { class: 'row' },
              h('input', { type: 'radio', name: 'correcta-' + c.dia + '-' + qi, checked: q.correcta === oi, disabled: !editable, 'aria-label': 'Opción correcta', style: 'width:22px;height:22px', onchange: () => { q.correcta = oi; marcar(); } }),
              valor(h('input', { placeholder: String.fromCharCode(65 + oi) + (oi === 3 ? ' (opcional)' : ''), maxlength: 200, disabled: !editable, style: 'flex:1;min-width:0;min-height:44px;padding:.5rem .7rem;border:1px solid var(--border);border-radius:10px;background:var(--surface)', oninput: (e) => { q.opciones[oi] = e.target.value; marcar(); } }), o))))),
          campo('Explicación cuando acierta', entrada(q, 'explicacion', { area: true, rows: 2, maxlength: 500 })),
          campo('Retroalimentación cuando se equivoca', entrada(q, 'retro', { area: true, rows: 2, maxlength: 500 }))));
    }

    function pintarCapsula() {
      const c = s.capsulas[dia];
      const selTipo = h('select', { 'aria-label': 'Tipo de tarjeta' }, Object.entries(TIPOS).map(([k, v]) => h('option', { value: k }, v.nombre)));
      T.poner(panel,
        h('section', { class: 'card' },
          h('h2', null, DIAS[dia] + ' · ' + ETAPAS[dia]),
          h('div', { class: 'form-grid' },
            campo('Título de la cápsula', valor(entrada(c, 'titulo', { maxlength: 140 }), c.titulo)),
            campo('Minutos estimados', valor(entrada(c, 'minutos', { type: 'number', min: 1, max: 15 }), c.minutos)),
            h('div', { class: 'field full' }, h('label', null, 'Objetivo de aprendizaje'), entrada(c, 'objetivo', { area: true, rows: 2, maxlength: 400 }))),
          T.mockDatos && editable ? h('button', { class: 'btn ghost small', style: 'margin-top:.5rem', onclick: () => { Object.assign(c, JSON.parse(JSON.stringify(T.mockDatos.ejemploCapsula)), { dia: c.dia }); c.preguntas.forEach(q => { q.opciones = q.opciones.concat(['', '', '', '']).slice(0, 4); }); marcar(); pintarCapsula(); } }, 'Usar cápsula de ejemplo (demostración)') : null),
        h('h3', { style: 'margin:1rem 0 0' }, 'Tarjetas de contenido (' + c.bloques.length + ')'),
        c.bloques.length ? null : h('p', { class: 'muted small' }, 'Agregue al menos una tarjeta. Recomendado: portada, 2 actividades y un cierre.'),
        c.bloques.map((_, i) => formBloque(c, i)),
        editable ? h('div', { class: 'row wrap', style: 'margin-top:.75rem' }, selTipo, h('button', { class: 'btn', onclick: () => { c.bloques.push(bloqueVacio(selTipo.value)); marcar(); pintarCapsula(); } }, '+ Agregar tarjeta')) : null,
        h('h3', { style: 'margin:1.25rem 0 0' }, 'Evaluación (2 preguntas · solo estas suman puntos)'),
        formPregunta(c, 0), formPregunta(c, 1));
    }

    function vistaPrevia(c) {
      const marco = h('div', { class: 'telefono' });
      const fondo = h('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === fondo) fondo.remove(); } },
        h('div', { class: 'stack', style: 'max-width:420px;width:100%' },
          h('div', { class: 'row between' }, h('strong', { style: 'color:#fff' }, 'Vista previa · ' + DIAS[c.dia - 1]), h('button', { class: 'btn', onclick: () => fondo.remove() }, 'Cerrar')),
          marco));
      document.body.appendChild(fondo);
      const datos = aPayload({ capsulas: [Object.assign({}, c, { titulo: c.titulo.trim().length >= 3 ? c.titulo : 'Sin título' })], titulo: 'x', objetivo: '' }).capsulas[0];
      T.capsulaVista(marco, { dia: c.dia, etapa: ETAPAS[c.dia - 1], minutos: c.minutos, titulo: c.titulo, bloques: datos.bloques }, {
        evaluacion: (caja) => caja.append(h('h2', null, 'Evaluación (vista del revisor)'),
          ...c.preguntas.map((q, qi) => h('div', { class: 'quiz-q' }, h('strong', null, (qi + 1) + '. ' + (q.texto || '(sin pregunta)')),
            q.opciones.filter(o => o.trim()).map((o) => h('div', { class: 'opt' + (q.opciones[q.correcta] === o ? ' correct' : '') }, h('span', null, o + (q.opciones[q.correcta] === o ? '  ✔ correcta' : '')))),
            q.explicacion ? h('div', { class: 'feedback ok' }, q.explicacion) : null)))
      });
    }

    const selSemana = h('select', { disabled: !editable, onchange: (e) => { s.week_start = e.target.value; marcar(); } },
      lunes.map(l => h('option', { value: l, selected: l === s.week_start }, 'Semana del lunes ' + fechaCorta(l))));
    const selCat = h('select', { disabled: !editable, onchange: (e) => { s.category_id = e.target.value; marcar(); } },
      categorias.filter(c => c.activa || c.id === s.category_id).map(c => h('option', { value: c.id, selected: c.id === s.category_id }, c.nombre)));

    pintarAcciones(); pintarTabs(); pintarCapsula();
    T.adm.marco('capacitacion',
      h('header', null,
        h('div', null, h('h1', null, s.id ? s.titulo : 'Nueva semana'),
          h('p', { class: 'muted', style: 'margin:0' }, chipEstado(s.estado), s.id ? ' · versión ' + s.version : '', s.editor ? ' · editada por ' + s.editor : '', s.publica ? ' · se publica el ' + new Date(s.publica).toLocaleString('es-CR', { timeZone: T.config.zonaHoraria }) : '')),
        h('a', { class: 'btn ghost', href: '#capacitacion' }, icon('back', 'sm'), 'Semanas')),
      s.bloqueada ? h('div', { class: 'note warn', style: 'margin-bottom:1rem' }, 'Ya hay respuestas oficiales: la semana no se puede editar.') : null,
      !editable && !s.bloqueada ? h('div', { class: 'note', style: 'margin-bottom:1rem' }, 'Solo lectura.') : null,
      s.estado === 'PROGRAMADO' && editable ? h('div', { class: 'note warn', style: 'margin-bottom:1rem' }, 'Si edita una semana aprobada, vuelve a revisión y deja de estar programada.') : null,
      mensaje,
      acciones,
      h('section', { class: 'card', style: 'margin-top:1rem' },
        h('div', { class: 'form-grid' },
          campo('Semana', selSemana, 'Se publica el lunes a las 00:00 (hora de Costa Rica) una vez aprobada.'),
          campo('Categoría', selCat),
          h('div', { class: 'field full' }, h('label', null, 'Tema de la semana'), valor(entrada(s, 'titulo', { maxlength: 140 }), s.titulo)),
          h('div', { class: 'field full' }, h('label', null, 'Objetivo general'), entrada(s, 'objetivo', { area: true, rows: 2, maxlength: 400 })))),
      h('section', { style: 'margin-top:1rem' }, tabs, panel),
      (s.historial || []).length ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Historial'),
        h('ul', { class: 'checks' }, s.historial.slice().reverse().map(x => h('li', null, icon('history', 'sm'),
          h('span', null, new Date(x.fecha).toLocaleString('es-CR', { timeZone: T.config.zonaHoraria }), ' · ', (ESTADOS[x.a] || ['', x.a])[1], ' · ', x.actor || '', x.comentario ? ' — «' + x.comentario + '»' : ''))))) : null);
  });
})(window.T360);
