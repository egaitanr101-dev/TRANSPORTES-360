/* TRANSPORTES 360 — Panel: biblioteca documental y fuentes (iteración 6).
 * Biblioteca: clasificación obligatoria, versiones (el mismo archivo no se repite), texto extraído en el navegador,
 * búsqueda en español y descarga con enlace firmado de un minuto. Fuentes: dominios confiables, registro y validación
 * por otra persona. Vínculos: cada semana, alerta o consejo muestra sus fuentes (T.fuentesDe).
 * Todas las reglas las aplica el servidor; aquí solo se ayuda y se muestran sus mensajes. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const TIPOS = { PROCEDIMIENTO: 'Procedimiento', POLITICA: 'Política', MANUAL: 'Manual', REGLAMENTO: 'Reglamento', GUIA: 'Guía', INTERNO: 'Documento interno', CAPACITACION: 'Material de capacitación', OTRO: 'Otro' };
  const ACCESO = { COLABORADORES: ['good', 'Para colaboradores'], ADMIN: ['info', 'Solo administración'], RESTRINGIDO: ['crit', 'Restringido'] };
  const PROCESO = { SUBIENDO: ['warn', 'Subida incompleta'], LISTO: ['good', 'Texto listo'], SIN_TEXTO: ['warn', 'Sin texto'], ERROR: ['crit', 'Error'] };
  const FUENTE = { PENDIENTE: ['warn', 'Pendiente'], VALIDADA: ['good', 'Validada'], RECHAZADA: ['crit', 'Rechazada'], VIGENTE: ['good', 'Documento vigente'], NO_VIGENTE: ['crit', 'Documento no vigente'] };
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);
  const chip = (mapa, v) => { const [c, t] = mapa[v] || ['', v]; return h('span', { class: 'chip ' + c }, t); };
  const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB';
  let nCampo = 0;
  const campo = (etq, control, ayuda, lleno) => { control.id = control.id || 'dc-' + (++nCampo); return h('div', { class: 'field' + (lleno ? ' full' : '') }, h('label', { for: control.id }, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null); };
  const sel = (ops, valor) => h('select', null, ops.map(([v, t]) => h('option', { value: v, selected: v === valor }, t)));
  const tabla = (cols, filas) => h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', null, h('tr', null, cols.map(c => h('th', null, c)))), h('tbody', null, filas)));

  async function accion(boton, fn, aviso, error) {
    if (error) error.textContent = '';
    boton.disabled = true;
    try { const valor = await fn(); if (aviso) T.ui.aviso(aviso); return { valor }; }
    catch (e) { if (error) error.textContent = T.ui.mensajeDe(e); else T.ui.error(e); boton.disabled = false; return null; }
  }

  // ---------- Pestañas ----------
  const VISTAS = [['biblioteca', 'Biblioteca'], ['buscar', 'Buscar'], ['fuentes', 'Fuentes externas'], ['dominios', 'Dominios confiables'], ['temporales', 'Temporales']];
  T.enrutador.registrar('documentos', async (vista) => {
    vista = VISTAS.some(v => v[0] === vista) ? vista : 'biblioteca';
    T.adm.cargando('documentos');
    const tabs = h('div', { class: 'capsule-tabs', role: 'tablist' }, VISTAS.map(([v, t]) => h('button', { role: 'tab', 'aria-selected': v === vista ? 'true' : 'false', onclick: () => T.enrutador.ir('documentos/' + v) }, t)));
    const cuerpo = await ({ biblioteca: vBiblioteca, temporales: vBiblioteca, buscar: vBuscar, fuentes: vFuentes, dominios: vDominios })[vista](vista);
    T.adm.marco('documentos',
      h('header', null, h('div', null, h('h1', null, 'Biblioteca y fuentes'), h('p', { class: 'muted', style: 'margin:0' }, 'Documentos de la empresa y fuentes externas validadas, para sustentar el contenido.')),
        puede('documentos.gestionar') ? h('a', { class: 'btn primary', href: '#documento/nuevo' }, icon('doc', 'sm'), 'Nuevo documento') : null),
      tabs, cuerpo);
  });

  async function vBiblioteca(vista) {
    if (!puede('documentos.gestionar')) return h('p', { class: 'muted' }, 'No tiene permiso para gestionar documentos.');
    const docs = await T.api.docs(vista === 'temporales');
    return h('section', { class: 'card' },
      vista === 'temporales' ? h('div', { class: 'note', style: 'margin-bottom:1rem' }, 'Documentos de una sola generación: se eliminan a los 30 días y no aparecen en la biblioteca ni en las búsquedas.') : null,
      docs.length ? tabla(['Documento', 'Acceso', 'Versión', 'Texto', ''], docs.map(d => h('tr', null,
        h('td', null, h('strong', null, d.titulo), h('br'), h('span', { class: 'small muted' }, (TIPOS[d.tipo] || d.tipo) + (d.categoria ? ' · ' + d.categoria : '') + (d.estado !== 'ACTIVO' ? ' · ' + d.estado.toLowerCase() : '') + (d.vencido ? ' · vigencia vencida' : ''))),
        h('td', null, chip(ACCESO, d.acceso), d.ia ? h('span', { class: 'chip' }, 'Usable con IA') : null),
        h('td', null, d.version || '—'), h('td', null, d.procesado ? chip(PROCESO, d.procesado) : '—', d.fragmentos ? h('span', { class: 'small muted' }, ' ' + d.fragmentos + ' fragmentos') : null),
        h('td', null, h('a', { class: 'btn', style: 'min-height:38px', href: '#documento/' + encodeURIComponent(d.id) }, 'Abrir')))))
        : h('p', { class: 'muted', style: 'margin:0' }, vista === 'temporales' ? 'No hay documentos temporales.' : 'Todavía no hay documentos. Use "Nuevo documento".'));
  }

  async function vBuscar() {
    if (!puede('documentos.gestionar')) return h('p', { class: 'muted' }, 'No tiene permiso para gestionar documentos.');
    const entrada = h('input', { type: 'search', maxlength: 200, placeholder: 'Ej. distancia de frenado con lluvia', 'aria-label': 'Buscar en los documentos' });
    const res = h('div');
    const buscar = async (e) => {
      e.preventDefault();
      T.poner(res, T.ui.cargando());
      try {
        const r = await T.api.docBuscar(entrada.value);
        T.poner(res, r.length ? h('ul', { class: 'checks' }, r.map(x => h('li', null, icon('doc', 'sm'), h('span', null,
          h('a', { href: '#documento/' + encodeURIComponent(x.documento) }, x.titulo), ' · ', x.version, x.seccion ? ' · ' + x.seccion : '', x.vencido ? ' · vigencia vencida' : '',
          h('br'), h('span', { class: 'small' }, x.extracto)))))
          : h('p', { class: 'muted' }, 'Sin resultados. Solo se busca en la versión vigente de los documentos activos con texto.'));
      } catch (err) { T.poner(res, h('p', { class: 'form-error' }, T.ui.mensajeDe(err))); }
    };
    return h('section', { class: 'card' }, h('form', { class: 'row wrap', onsubmit: buscar }, h('div', { class: 'field', style: 'flex:1;min-width:220px' }, entrada), h('button', { class: 'btn primary', type: 'submit' }, 'Buscar')),
      h('p', { class: 'small muted' }, 'Las palabras entre «comillas» del resultado coinciden con lo que buscó.'), res);
  }

  async function vFuentes() {
    const lista = await T.api.fuentes(null);
    const error = h('p', { class: 'form-error', role: 'alert' });
    const ent = h('input', { type: 'text', maxlength: 160 }), tit = h('input', { type: 'text', maxlength: 300 }), url = h('input', { type: 'url', maxlength: 500, placeholder: 'https://' });
    const nueva = puede('contenido.crear_editar') ? h('section', { class: 'card', style: 'margin-bottom:1rem' }, h('h2', null, 'Registrar una fuente'),
      h('div', { class: 'form-grid' }, campo('Entidad', ent), campo('Título del recurso', tit), campo('Dirección (https)', url, 'Se valida aparte: quien la registra no la valida.', true)), error,
      h('button', { class: 'btn primary', style: 'margin-top:.75rem', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.fuenteGuardar({ entidad: ent.value, titulo: tit.value, url: url.value }), 'Fuente registrada.', error)) T.enrutador.recargar(); } }, 'Registrar')) : null;
    const decidir = (f, estado) => async (e) => {
      const notas = estado === 'RECHAZADA' ? window.prompt('¿Por qué se rechaza?') : null;
      if (estado === 'RECHAZADA' && notas == null) return;
      if (await accion(e.currentTarget, () => T.api.fuenteValidar(f.id, estado, notas), estado === 'VALIDADA' ? 'Fuente validada.' : 'Fuente rechazada.')) T.enrutador.recargar();
    };
    return h('div', null, nueva,
      h('section', { class: 'card' }, lista.length ? tabla(['Fuente', 'Dominio', 'Estado', ''], lista.map(f => h('tr', null,
        h('td', null, h('strong', null, f.entidad), ' · ', f.titulo, h('br'), h('a', { class: 'small', href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.url), h('br'),
          h('span', { class: 'small muted' }, 'Registrada por ' + f.registrada_por + (f.validada_por ? ' · revisada por ' + f.validada_por : '') + (f.usos ? ' · usada ' + f.usos + ' vez/veces' : '') + (f.notas ? ' · ' + f.notas : ''))),
        h('td', null, f.dominio_confiable ? h('span', { class: 'chip good' }, 'Confiable') : h('span', { class: 'chip warn' }, 'Dominio no registrado'), h('br'), h('span', { class: 'small muted' }, f.dominio)),
        h('td', null, chip(FUENTE, f.estado)),
        h('td', null, puede('fuentes.validar') && f.estado === 'PENDIENTE' ? h('div', { class: 'row' }, h('button', { class: 'btn', style: 'min-height:38px', onclick: decidir(f, 'VALIDADA') }, 'Validar'), h('button', { class: 'btn ghost', style: 'min-height:38px', onclick: decidir(f, 'RECHAZADA') }, 'Rechazar')) : null))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay fuentes registradas.')));
  }

  async function vDominios() {
    const lista = await T.api.dominios();
    const error = h('p', { class: 'form-error', role: 'alert' });
    const dom = h('input', { type: 'text', maxlength: 120, placeholder: 'ministeriodesalud.go.cr' }), ent = h('input', { type: 'text', maxlength: 160 });
    const conf = sel([['OFICIAL', 'Oficial (gobierno u organismo)'], ['RECONOCIDA', 'Reconocida']], 'OFICIAL');
    return h('div', null,
      h('div', { class: 'note', style: 'margin-bottom:1rem' }, 'La lista la arma una persona, revisando cada dominio. No se carga automáticamente ni la propone la IA.'),
      puede('fuentes.validar') ? h('section', { class: 'card', style: 'margin-bottom:1rem' }, h('h2', null, 'Agregar dominio'),
        h('div', { class: 'form-grid' }, campo('Dominio', dom, 'Cubre también sus subdominios.'), campo('Entidad', ent), campo('Tipo', conf)), error,
        h('button', { class: 'btn primary', style: 'margin-top:.75rem', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.dominioGuardar({ dominio: dom.value, entidad: ent.value, confiabilidad: conf.value }), 'Dominio agregado.', error)) T.enrutador.recargar(); } }, 'Agregar')) : null,
      h('section', { class: 'card' }, lista.length ? tabla(['Dominio', 'Entidad', 'Tipo', 'Revisado por', ''], lista.map(d => h('tr', null,
        h('td', null, h('strong', null, d.dominio)), h('td', null, d.entidad), h('td', null, d.confiabilidad === 'OFICIAL' ? 'Oficial' : 'Reconocida'), h('td', null, d.validado_por + ' · ' + T.fechas.corta(d.validado)),
        h('td', null, puede('fuentes.validar') ? h('button', { class: 'btn ghost', style: 'min-height:38px', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.dominioGuardar(Object.assign({}, d, { activo: !d.activo })), d.activo ? 'Dominio desactivado.' : 'Dominio activado.')) T.enrutador.recargar(); } }, d.activo ? 'Desactivar' : 'Activar') : (d.activo ? 'Activo' : 'Inactivo')))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay dominios confiables.')));
  }

  // ---------- Documento ----------
  T.enrutador.registrar('documento', async (id) => {
    T.adm.cargando('documentos');
    const nuevo = !id || id === 'nuevo';
    const [categorias, d] = await Promise.all([T.api.categorias(), nuevo ? null : T.api.doc(id)]);
    const s = d || { titulo: '', tipo: 'PROCEDIMIENTO', acceso: '', category_id: '', descripcion: '', origen: '', vigente_desde: '', vigente_hasta: '', ia: false, temporal: false, versiones: [], estado: 'ACTIVO', usos: 0 };
    const error = h('p', { class: 'form-error', role: 'alert' });
    const f = {
      titulo: h('input', { type: 'text', maxlength: 200, value: s.titulo }),
      tipo: sel(Object.entries(TIPOS), s.tipo),
      acceso: sel([['', 'Elija…'], ['COLABORADORES', 'Para colaboradores (se puede compartir)'], ['ADMIN', 'Solo administración'], ['RESTRINGIDO', 'Restringido (datos personales o sensibles)']], s.acceso),
      categoria: sel([['', 'Sin categoría']].concat(categorias.map(c => [c.id, c.nombre])), s.category_id || ''),
      origen: h('input', { type: 'text', maxlength: 200, value: s.origen, placeholder: 'Ej. Departamento de Salud Ocupacional' }),
      desde: h('input', { type: 'date', value: s.vigente_desde || '' }), hasta: h('input', { type: 'date', value: s.vigente_hasta || '' }),
      descripcion: h('textarea', { maxlength: 1000, rows: 2 }, s.descripcion || ''),
      ia: h('input', { type: 'checkbox', checked: !!s.ia }), temporal: h('input', { type: 'checkbox', checked: !!s.temporal, disabled: !nuevo && !s.temporal })
    };
    const avisoIA = h('span', { class: 'hint' });
    const revisar = () => { const r = f.acceso.value === 'RESTRINGIDO'; f.ia.disabled = r; if (r) f.ia.checked = false; avisoIA.textContent = r ? 'Un documento restringido nunca se envía a la IA.' : 'Solo se envían a la IA los fragmentos relevantes, nunca el documento completo.'; };
    f.acceso.addEventListener('change', revisar); revisar();
    const datos = () => ({ id: s.id, titulo: f.titulo.value, tipo: f.tipo.value, acceso: f.acceso.value, category_id: f.categoria.value, origen: f.origen.value, vigente_desde: f.desde.value, vigente_hasta: f.hasta.value, descripcion: f.descripcion.value, ia: f.ia.checked, temporal: f.temporal.checked });

    // Subir una versión
    const archivo = h('input', { type: 'file', accept: '.pdf,.docx,.xlsx,.pptx,.txt' });
    const etiqueta = h('input', { type: 'text', maxlength: 40, placeholder: 'Ej. 2026 o v3' });
    const estadoSubida = h('div');
    const botonSubir = h('button', { class: 'btn primary', onclick: async (e) => {
      const b = e.currentTarget; error.textContent = '';
      if (!archivo.files[0]) { error.textContent = 'Elija un archivo.'; return; }
      b.disabled = true;
      try {
        T.poner(estadoSubida, h('p', { class: 'small' }, 'Leyendo el archivo en su navegador…'));
        const x = await T.extraer(archivo.files[0]);
        T.poner(estadoSubida, h('p', { class: 'small' }, 'Subiendo ' + kb(x.tamano) + ' · ' + x.fragmentos.length + ' fragmentos de texto…'));
        const r = await T.api.docSubir(s.id, archivo.files[0], x, etiqueta.value);
        T.ui.aviso(r.ya_existia ? 'Ese archivo ya estaba registrado en este documento.' : r.estado === 'LISTO' ? 'Versión registrada con ' + r.fragmentos + ' fragmentos de texto.' : 'Versión registrada sin texto.');
        T.enrutador.recargar();
      } catch (err) { T.limpiar(estadoSubida); error.textContent = T.ui.mensajeDe(err); b.disabled = false; }
    } }, icon('doc', 'sm'), 'Subir versión');

    const descargar = (v) => async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const url = await T.api.docDescargar(v.ruta); window.open(url, '_blank', 'noopener'); } catch (err) { T.ui.error(err); }
      b.disabled = false;
    };
    const cambiarEstado = (estado, texto) => async (e) => {
      const motivo = window.prompt(texto); if (motivo == null) return;
      if (await accion(e.currentTarget, () => T.api.docEstado(s.id, estado, motivo), 'Documento actualizado.', error)) T.enrutador.recargar();
    };

    T.adm.marco('documentos',
      h('a', { class: 'back', href: '#documentos' + (s.temporal ? '/temporales' : '') }, icon('back', 'sm'), 'Biblioteca'),
      h('header', null, h('div', null, h('h1', null, nuevo ? 'Nuevo documento' : s.titulo),
        nuevo ? null : h('div', { class: 'row wrap' }, chip(ACCESO, s.acceso), s.estado !== 'ACTIVO' ? h('span', { class: 'chip crit' }, s.estado === 'OBSOLETO' ? 'Obsoleto' : 'Archivado') : null, s.temporal ? h('span', { class: 'chip' }, 'Temporal · se elimina ' + T.fechas.corta(s.purga)) : null, s.usos ? h('span', { class: 'chip' }, 'Citado ' + s.usos + ' vez/veces') : null))),
      error,
      h('section', { class: 'card' }, h('h2', null, 'Datos del documento'),
        h('div', { class: 'note', style: 'margin-bottom:.75rem' }, 'No suba planillas, sanciones, expedientes ni otros datos personales. Si es inevitable, clasifíquelo como Restringido.'),
        h('div', { class: 'form-grid' }, campo('Título', f.titulo, null, true), campo('Tipo', f.tipo), campo('Acceso (obligatorio)', f.acceso), campo('Categoría', f.categoria), campo('Origen', f.origen),
          campo('Vigente desde', f.desde), campo('Vigente hasta', f.hasta, 'Si vence, se marca al buscar y al citarlo.'), campo('Descripción', f.descripcion, null, true),
          h('label', { class: 'row small full', style: 'min-height:44px' }, f.ia, 'Se puede usar como insumo de la IA'), avisoIA,
          nuevo ? h('label', { class: 'row small full', style: 'min-height:44px' }, f.temporal, 'Temporal: solo para una generación; se elimina a los 30 días') : null),
        h('div', { class: 'row wrap', style: 'margin-top:.75rem' },
          h('button', { class: 'btn primary', onclick: async (e) => { const r = await accion(e.currentTarget, () => T.api.docGuardar(datos()), 'Datos guardados.', error); if (r) T.enrutador.ir('documento/' + r.valor); } }, 'Guardar datos'),
          !nuevo && s.temporal ? h('button', { class: 'btn', onclick: async (e) => { if (window.confirm('¿Pasarlo a la biblioteca permanente? Quedará registrado.') && await accion(e.currentTarget, () => T.api.docGuardar(Object.assign(datos(), { temporal: false })), 'Ahora es permanente.', error)) T.enrutador.recargar(); } }, 'Volver permanente') : null,
          !nuevo && s.estado === 'ACTIVO' ? h('button', { class: 'btn ghost', onclick: cambiarEstado('OBSOLETO', '¿Por qué queda obsoleto? (por ejemplo, lo reemplazó otro)') }, 'Marcar obsoleto') : null,
          !nuevo && s.estado === 'ACTIVO' ? h('button', { class: 'btn ghost', onclick: cambiarEstado('ARCHIVADO', '¿Por qué se archiva?') }, 'Archivar') : null,
          !nuevo && s.estado !== 'ACTIVO' ? h('button', { class: 'btn ghost', onclick: cambiarEstado('ACTIVO', '¿Por qué se reactiva?') }, 'Reactivar') : null)),
      nuevo ? h('p', { class: 'muted' }, 'Guarde los datos para poder subir el archivo.') : [
        s.estado === 'ACTIVO' ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Subir una versión'),
          h('p', { class: 'small muted' }, 'PDF, Word, Excel, PowerPoint o texto, hasta 25 MB. El texto se extrae en este navegador; el archivo se guarda en un espacio privado. Los PDF se guardan, pero todavía no se busca dentro de ellos.'),
          h('div', { class: 'form-grid' }, campo('Archivo', archivo), campo('Nombre de la versión (opcional)', etiqueta)), estadoSubida,
          h('div', { class: 'row', style: 'margin-top:.75rem' }, botonSubir)) : null,
        h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Versiones'), s.versiones.length
          ? tabla(['Versión', 'Archivo', 'Texto', 'Subida', ''], s.versiones.map(v => h('tr', null,
            h('td', null, h('strong', null, v.etiqueta), v.id === s.version_actual ? h('span', { class: 'chip good' }, 'Vigente') : null),
            h('td', null, v.archivo, h('br'), h('span', { class: 'small muted' }, v.tipo.toUpperCase() + ' · ' + kb(v.tamano) + (v.paginas ? ' · ' + v.paginas + ' pág./hojas' : ''))),
            h('td', null, chip(PROCESO, v.estado), v.fragmentos ? h('span', { class: 'small muted' }, ' ' + v.fragmentos) : null, v.nota ? h('div', { class: 'small muted' }, v.nota) : null),
            h('td', null, v.subido_por + ' · ' + T.fechas.corta(v.subido)),
            h('td', null, v.estado !== 'SUBIENDO' ? h('button', { class: 'btn', style: 'min-height:38px', onclick: descargar(v) }, 'Descargar') : null))))
          : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay archivos.'))]);
  });

  // ---------- Fuentes de un contenido (para los editores de semana, alerta y consejo) ----------
  /** Sección "Fuentes" de un contenido ya guardado. tipo: 'semana' | 'alerta' | 'consejo'. */
  T.fuentesDe = function (tipo, id) {
    const caja = h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Fuentes vinculadas'), T.ui.cargando());
    const error = h('p', { class: 'form-error', role: 'alert' });
    async function pintar() {
      try {
        const [lista, fuentes] = await Promise.all([T.api.vinculos(tipo, id), T.api.fuentes('VALIDADA')]);
        const editable = puede('contenido.crear_editar');
        const elegir = sel([['', 'Elija una fuente validada…']].concat(fuentes.map(f => ['f:' + f.id, f.entidad + ' · ' + f.titulo])), '');
        const docs = puede('documentos.gestionar') ? await T.api.docs(false).catch(() => []) : [];
        docs.filter(d => d.estado === 'ACTIVO' && d.procesado === 'LISTO').forEach(d => elegir.append(h('option', { value: 'd:' + d.id }, 'Documento: ' + d.titulo + ' (' + d.version + ')')));
        const seccion = h('input', { type: 'text', maxlength: 100, placeholder: 'Página o sección (opcional)', 'aria-label': 'Página o sección' });
        const extracto = h('textarea', { maxlength: 500, rows: 2, placeholder: 'Para documentos: copie el texto exacto que sustenta el contenido (opcional). El servidor verifica que esté en el documento.', 'aria-label': 'Extracto' });
        T.poner(caja, h('h2', null, 'Fuentes vinculadas'),
          lista.length ? h('ul', { class: 'checks' }, lista.map(x => h('li', null, icon(x.tipo === 'documento' ? 'doc' : 'shield', 'sm'),
            h('span', { style: 'flex:1' }, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.nombre) : x.nombre, ' ', chip(FUENTE, x.estado),
              x.seccion ? ' · ' + x.seccion : '', x.extracto ? h('div', { class: 'small muted' }, '«' + x.extracto + '»') : null),
            editable ? h('button', { class: 'btn ghost', style: 'min-height:38px', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.desvincular(x.id), 'Fuente quitada.', error)) pintar(); } }, 'Quitar') : null)))
            : h('p', { class: 'small muted' }, 'Sin fuentes vinculadas.'),
          error,
          editable ? h('div', { class: 'stack', style: 'margin-top:.5rem' }, h('div', { class: 'field' }, elegir), h('div', { class: 'field' }, seccion), h('div', { class: 'field' }, extracto),
            h('div', null, h('button', { class: 'btn', onclick: async (e) => {
              if (!elegir.value) { error.textContent = 'Elija una fuente.'; return; }
              const [k, v] = elegir.value.split(':');
              if (await accion(e.currentTarget, () => T.api.vincular({ tipo, id, fuente_id: k === 'f' ? v : null, documento_id: k === 'd' ? v : null, seccion: seccion.value, extracto: extracto.value }), 'Fuente vinculada.', error)) pintar();
            } }, 'Vincular'))) : null,
          fuentes.length || docs.length ? null : h('p', { class: 'small muted' }, h('a', { href: '#documentos/fuentes' }, 'Registre y valide fuentes'), ' para poder vincularlas.'));
      } catch (e) { T.poner(caja, h('h2', null, 'Fuentes vinculadas'), h('p', { class: 'form-error' }, T.ui.mensajeDe(e))); }
    }
    pintar();
    return caja;
  };
})(window.T360);
