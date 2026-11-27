/* TRANSPORTES 360 — Panel: calendario editorial y campañas (iteración 7).
 * Calendario: 8 semanas con la categoría y el tema planificados, la semana real, las campañas, la rotación sugerida
 * y avisos de repetición; sugerencias sin IA (temas del catálogo no usados y preguntas con más errores).
 * Campañas: agrupan semanas, alertas y consejos existentes; no publican nada. Quien la editó no la hace visible.
 * Todas las reglas las aplica el servidor; aquí solo se ayuda y se muestran sus mensajes. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const ESTADO_SEMANA = { BORRADOR: 'Borrador', PENDIENTE_REVISION: 'En revisión', REQUIERE_CORRECCION: 'Requiere corrección', PROGRAMADO: 'Aprobada', PUBLICADO: 'Publicada', ARCHIVADO: 'Archivada' };
  const ESTADO_CAMPANA = { PLANIFICADA: ['info', 'Planificada'], EN_CURSO: ['good', 'En curso'], TERMINADA: ['', 'Terminada'], ARCHIVADA: ['', 'Archivada'] };
  const TIPO = { semana: 'Capacitación', alerta: 'Alerta', consejo: 'Consejo' };
  const RUTA = { semana: 'semana/', alerta: 'alerta/', consejo: 'consejo/' };
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);
  const fecha = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m + '/' + a; };
  const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: T.config.zonaHoraria });
  const sumar = (iso, dias) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + dias); return x.toLocaleDateString('en-CA'); };
  const lunesDe = (iso) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toLocaleDateString('en-CA'); };
  let n = 0;
  const campo = (etq, control, ayuda, lleno) => { control.id = control.id || 'ca-' + (++n); return h('div', { class: 'field' + (lleno ? ' full' : '') }, h('label', { for: control.id }, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null); };
  const sel = (ops, valor) => h('select', null, ops.map(([v, t]) => h('option', { value: v, selected: v === valor }, t)));
  async function accion(boton, fn, aviso, error) {
    if (error) error.textContent = '';
    boton.disabled = true;
    try { const valor = await fn(); if (aviso) T.ui.aviso(aviso); return { valor }; }
    catch (e) { if (error) error.textContent = T.ui.mensajeDe(e); else T.ui.error(e); boton.disabled = false; return null; }
  }

  // ---------- Calendario ----------
  T.enrutador.registrar('calendario', async (desde) => {
    T.adm.cargando('calendario');
    const inicio = /^\d{4}-\d{2}-\d{2}$/.test(desde || '') ? lunesDe(desde) : lunesDe(hoy());
    const [cal, categorias] = await Promise.all([T.api.calendario(inicio, 8), T.api.categorias()]);
    const nombreCat = (id) => (categorias.find(c => c.id === id) || {}).nombre || '—';
    const editable = puede('contenido.crear_editar');
    const detalle = h('div');

    function editarSemana(s) {
      const error = h('p', { class: 'form-error', role: 'alert' });
      const cat = sel([['', 'Sin definir']].concat(categorias.filter(c => c.activa).map(c => [c.id, c.nombre])), (s.plan && s.plan.category_id) || (s.rotacion && s.rotacion.category_id) || '');
      const tema = h('input', { type: 'text', maxlength: 140, value: (s.plan && s.plan.tema) || '' });
      const notas = h('textarea', { maxlength: 400, rows: 2 }, (s.plan && s.plan.notas) || '');
      const sug = h('div');
      async function sugerir() {
        T.poner(sug, T.ui.cargando());
        if (!cat.value) { T.limpiar(sug); return; }
        try {
          const r = await T.api.calendarioSugerencias(cat.value);
          T.poner(sug,
            h('h3', null, 'Ideas para ' + nombreCat(cat.value)),
            r.temas.length ? h('div', { class: 'row wrap' }, r.temas.map(t => h('button', { class: 'btn ghost', style: 'min-height:38px', onclick: () => { tema.value = t.titulo; } }, t.titulo)))
              : h('p', { class: 'small muted' }, 'No hay temas del catálogo sin usar en los últimos 6 meses.'),
            r.errores.length ? [h('p', { class: 'small', style: 'margin-bottom:.25rem' }, h('strong', null, 'Preguntas con más errores (12 semanas):')),
              h('ul', { class: 'checks' }, r.errores.map(e => h('li', null, icon('alert', 'sm'), h('span', null, e.aciertos + ' % de aciertos · «' + e.pregunta + '» (' + e.semana + ', ' + e.respuestas + ' respuestas)'))))] : null);
        } catch (e) { T.poner(sug, h('p', { class: 'form-error' }, T.ui.mensajeDe(e))); }
      }
      cat.addEventListener('change', sugerir);
      T.poner(detalle, h('section', { class: 'card', style: 'margin-top:1rem;border-color:var(--gold)' },
        h('h2', null, 'Semana del ' + fecha(s.lunes) + ' (semana ' + s.numero + ')'),
        s.semana ? h('p', { class: 'small' }, 'Ya existe la capacitación «' + s.semana.titulo + '» (' + (ESTADO_SEMANA[s.semana.estado] || s.semana.estado) + ').') : null,
        h('div', { class: 'form-grid' }, campo('Categoría', cat, s.rotacion ? 'Según la rotación: ' + s.rotacion.categoria + '.' : null), campo('Tema', tema), campo('Notas', notas, null, true)),
        error,
        h('div', { class: 'row wrap', style: 'margin-top:.75rem' },
          h('button', { class: 'btn primary', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.calendarioGuardar(s.lunes, { category_id: cat.value, tema: tema.value, notas: notas.value }), 'Plan guardado.', error)) T.enrutador.recargar(); } }, 'Guardar'),
          s.plan ? h('button', { class: 'btn ghost', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.calendarioGuardar(s.lunes, {}), 'Plan quitado.', error)) T.enrutador.recargar(); } }, 'Quitar plan') : null,
          !s.semana && puede('contenido.crear_editar') ? h('a', { class: 'btn', href: '#semana/nueva' }, 'Crear la capacitación') : null,
          puede('ia.generar') ? h('a', { class: 'btn', href: '#generador' }, icon('spark', 'sm'), 'Generar con IA') : null,
          h('button', { class: 'btn ghost', onclick: () => T.limpiar(detalle) }, 'Cerrar')),
        sug));
      sugerir();
      detalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const filas = cal.semanas.map(s => {
      const actual = s.lunes <= hoy() && hoy() <= sumar(s.lunes, 6);
      return h('tr', { style: actual ? 'background:var(--surface-2)' : false },
        h('td', null, h('strong', null, fecha(s.lunes)), h('br'), h('span', { class: 'small muted' }, 'Semana ' + s.numero + (actual ? ' · en curso' : ''))),
        h('td', null, s.plan ? [h('strong', null, s.plan.categoria || 'Sin categoría'), s.plan.tema ? h('div', { class: 'small' }, s.plan.tema) : null] : h('span', { class: 'small muted' }, 'Sin plan')),
        h('td', null, s.semana ? h('a', { href: '#semana/' + encodeURIComponent(s.semana.id) }, s.semana.titulo) : h('span', { class: 'small muted' }, '—'),
          s.semana ? h('div', { class: 'small muted' }, ESTADO_SEMANA[s.semana.estado] || s.semana.estado) : null),
        h('td', null, s.rotacion ? s.rotacion.categoria : '—'),
        h('td', null, s.campanas.map(c => h('a', { class: 'chip info', href: '#campana/' + encodeURIComponent(c.id) }, c.nombre)),
          s.avisos.map(a => h('div', { class: 'small', style: 'color:var(--high)' }, '⚠ ' + a))),
        h('td', null, editable ? h('button', { class: 'btn', style: 'min-height:38px', onclick: () => editarSemana(s) }, 'Planificar') : null));
    });

    // Rotación
    const errorRot = h('p', { class: 'form-error', role: 'alert' });
    const orden = cal.rotacion.slice();
    const listaRot = h('ol', { class: 'checks', style: 'list-style:decimal;padding-left:1.2rem' });
    const meses = h('input', { type: 'number', min: 1, max: 24, step: 1, value: String(cal.repeticion_meses) });
    const agregar = sel([['', 'Agregar categoría…']].concat(categorias.filter(c => c.activa).map(c => [c.id, c.nombre])), '');
    function pintarRot() {
      T.poner(listaRot, orden.map((id, i) => h('li', null, h('span', { style: 'flex:1' }, nombreCat(id)),
        h('button', { class: 'btn ghost', style: 'min-height:34px', disabled: i === 0, 'aria-label': 'Subir', onclick: () => { [orden[i - 1], orden[i]] = [orden[i], orden[i - 1]]; pintarRot(); } }, '↑'),
        h('button', { class: 'btn ghost', style: 'min-height:34px', 'aria-label': 'Quitar', onclick: () => { orden.splice(i, 1); pintarRot(); } }, '✕'))));
    }
    agregar.addEventListener('change', () => { if (agregar.value && !orden.includes(agregar.value)) { orden.push(agregar.value); pintarRot(); } agregar.value = ''; });
    pintarRot();

    T.adm.marco('calendario',
      h('header', null, h('div', null, h('h1', null, 'Calendario editorial'), h('p', { class: 'muted', style: 'margin:0' }, 'Planifique 8 semanas: categoría y tema de cada una. Las campañas y los avisos ayudan a no repetir.')),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#calendario/' + sumar(inicio, -56) }, '← 8 semanas'), h('a', { class: 'btn', href: '#calendario' }, 'Hoy'), h('a', { class: 'btn', href: '#calendario/' + sumar(inicio, 56) }, '8 semanas →'))),
      h('section', { class: 'card' }, h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, ['Semana', 'Plan', 'Capacitación', 'Rotación', 'Campañas y avisos', ''].map(x => h('th', null, x)))), h('tbody', null, filas)))),
      detalle,
      puede('contenido.aprobar') ? h('details', { class: 'card', style: 'margin-top:1rem' }, h('summary', null, 'Rotación de categorías y avisos de repetición'),
        h('p', { class: 'small muted' }, 'La rotación sugiere la categoría de cada semana, en este orden. Se avisa si un tema se parece a otro de los últimos meses indicados.'),
        listaRot, h('div', { class: 'form-grid' }, campo('Agregar a la rotación', agregar), campo('Avisar repeticiones de los últimos (meses)', meses)), errorRot,
        h('button', { class: 'btn primary', style: 'margin-top:.75rem', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.calendarioConfigurar(orden, Number(meses.value)), 'Rotación guardada.', errorRot)) T.enrutador.recargar(); } }, 'Guardar rotación')) : null,
      h('p', { style: 'margin-top:1rem' }, h('a', { class: 'btn', href: '#campanas' }, 'Ver campañas'), ' ', h('a', { class: 'btn', href: '#temas' }, 'Catálogo de temas')));
  });

  // ---------- Catálogo de temas ----------
  T.enrutador.registrar('temas', async () => {
    T.adm.cargando('calendario');
    const [temas, categorias] = await Promise.all([T.api.temas(null), T.api.categorias()]);
    const error = h('p', { class: 'form-error', role: 'alert' });
    const cat = sel(categorias.filter(c => c.activa).map(c => [c.id, c.nombre]), ''), titulo = h('input', { type: 'text', maxlength: 140 });
    T.adm.marco('calendario',
      h('a', { class: 'back', href: '#calendario' }, icon('back', 'sm'), 'Calendario'),
      h('header', null, h('div', null, h('h1', null, 'Catálogo de temas'), h('p', { class: 'muted', style: 'margin:0' }, 'Ideas por categoría. El calendario sugiere las que no se han usado en 6 meses.'))),
      puede('contenido.crear_editar') ? h('section', { class: 'card' }, h('div', { class: 'form-grid' }, campo('Categoría', cat), campo('Tema', titulo)), error,
        h('button', { class: 'btn primary', style: 'margin-top:.75rem', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.temaGuardar({ category_id: cat.value, titulo: titulo.value }), 'Tema agregado.', error)) T.enrutador.recargar(); } }, 'Agregar')) : null,
      h('section', { class: 'card', style: 'margin-top:1rem' }, temas.length ? h('ul', { class: 'checks' }, temas.map(t => h('li', null, icon('star', 'sm'),
        h('span', { style: 'flex:1' }, h('strong', null, t.titulo), ' · ', t.categoria, t.activo ? '' : ' · inactivo'),
        puede('contenido.crear_editar') ? h('button', { class: 'btn ghost', style: 'min-height:34px', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.temaGuardar({ id: t.id, category_id: t.category_id, titulo: t.titulo, activo: !t.activo }), t.activo ? 'Tema desactivado.' : 'Tema activado.')) T.enrutador.recargar(); } }, t.activo ? 'Desactivar' : 'Activar') : null)))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay temas en el catálogo.')));
  });

  // ---------- Campañas ----------
  T.enrutador.registrar('campanas', async () => {
    T.adm.cargando('campanas');
    const lista = await T.api.campanas();
    T.adm.marco('campanas',
      h('header', null, h('div', null, h('h1', null, 'Campañas'), h('p', { class: 'muted', style: 'margin:0' }, 'Agrupan capacitaciones, alertas y consejos bajo un tema. No publican nada ni suman puntos.')),
        puede('campanas.gestionar') ? h('a', { class: 'btn primary', href: '#campana/nueva' }, icon('calendar', 'sm'), 'Nueva campaña') : null),
      h('section', { class: 'card' }, lista.length ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, ['Campaña', 'Fechas', 'Estado', 'Elementos', ''].map(x => h('th', null, x)))),
        h('tbody', null, lista.map(c => { const [cl, t] = ESTADO_CAMPANA[c.estado] || ['', c.estado]; return h('tr', null,
          h('td', null, h('strong', null, c.nombre), c.categoria ? h('div', { class: 'small muted' }, c.categoria) : null),
          h('td', null, fecha(c.desde) + ' al ' + fecha(c.hasta)), h('td', null, h('span', { class: 'chip ' + cl }, t), c.visible ? h('span', { class: 'chip good' }, 'Visible') : null),
          h('td', null, String(c.elementos)), h('td', null, h('a', { class: 'btn', style: 'min-height:38px', href: '#campana/' + encodeURIComponent(c.id) }, 'Abrir'))); }))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay campañas.')));
  });

  T.enrutador.registrar('campana', async (id) => {
    T.adm.cargando('campanas');
    const nueva = !id || id === 'nueva';
    const [categorias, c] = await Promise.all([T.api.categorias(), nueva ? null : T.api.campana(id)]);
    const s = c || { nombre: '', descripcion: '', category_id: '', desde: hoy(), hasta: sumar(hoy(), 30), visible: false, archivada: false, elementos: [], candidatos: [] };
    const editable = puede('campanas.gestionar') && !s.archivada;
    const error = h('p', { class: 'form-error', role: 'alert' });
    const f = { nombre: h('input', { type: 'text', maxlength: 120, value: s.nombre, disabled: !editable }), descripcion: h('textarea', { maxlength: 600, rows: 3, disabled: !editable }, s.descripcion),
      cat: sel([['', 'Sin categoría']].concat(categorias.map(k => [k.id, k.nombre])), s.category_id || ''), desde: h('input', { type: 'date', value: s.desde, disabled: !editable }), hasta: h('input', { type: 'date', value: s.hasta, disabled: !editable }) };
    f.cat.disabled = !editable;
    const candidato = sel([['', 'Elija una capacitación, alerta o consejo…']].concat(s.candidatos.map(x => [x.tipo + ':' + x.ref, TIPO[x.tipo] + ' · ' + x.titulo + ' (' + x.estado.toLowerCase().replace('_', ' ') + ')'])), '');
    T.adm.marco('campanas',
      h('a', { class: 'back', href: '#campanas' }, icon('back', 'sm'), 'Campañas'),
      h('header', null, h('div', null, h('h1', null, nueva ? 'Nueva campaña' : s.nombre),
        nueva ? null : h('div', { class: 'row wrap' }, s.archivada ? h('span', { class: 'chip' }, 'Archivada') : s.visible ? h('span', { class: 'chip good' }, 'Visible para colaboradores' + (s.visible_por ? ' · aprobó ' + s.visible_por : '')) : h('span', { class: 'chip warn' }, 'No visible')))),
      error,
      h('section', { class: 'card' }, h('div', { class: 'form-grid' }, campo('Nombre', f.nombre, null, true), campo('Mensaje para los colaboradores', f.descripcion, 'Si cambia el texto o las fechas de una campaña visible, se oculta hasta aprobarla de nuevo.', true),
          campo('Categoría', f.cat), campo('Desde', f.desde), campo('Hasta', f.hasta)),
        h('div', { class: 'row wrap', style: 'margin-top:.75rem' },
          editable ? h('button', { class: 'btn primary', onclick: async (e) => { const r = await accion(e.currentTarget, () => T.api.campanaGuardar({ id: s.id, nombre: f.nombre.value, descripcion: f.descripcion.value, category_id: f.cat.value, desde: f.desde.value, hasta: f.hasta.value }), 'Campaña guardada.', error); if (r) T.enrutador.ir('campana/' + r.valor); } }, 'Guardar') : null,
          !nueva && !s.archivada && puede('contenido.aprobar') ? h('button', { class: 'btn', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.campanaVisible(s.id, !s.visible), s.visible ? 'Campaña oculta.' : 'Campaña visible para los colaboradores.', error)) T.enrutador.recargar(); } }, s.visible ? 'Ocultar' : 'Hacer visible') : null,
          !nueva && editable ? h('button', { class: 'btn ghost', onclick: async (e) => { if (window.confirm('¿Archivar la campaña? Dejará de verse y no se podrá editar.') && await accion(e.currentTarget, () => T.api.campanaArchivar(s.id), 'Campaña archivada.', error)) T.enrutador.recargar(); } }, 'Archivar') : null)),
      nueva ? h('p', { class: 'muted' }, 'Guarde la campaña para agregarle elementos.') : h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Elementos'),
        h('p', { class: 'small muted' }, 'Los colaboradores solo ven, dentro de la campaña, lo que ya está publicado y vigente para su área.'),
        s.elementos.length ? h('ul', { class: 'checks' }, s.elementos.map(x => h('li', null, icon(x.tipo === 'semana' ? 'week' : x.tipo === 'alerta' ? 'alert' : 'star', 'sm'),
          h('span', { style: 'flex:1' }, TIPO[x.tipo] + ' · ', h('a', { href: '#' + RUTA[x.tipo] + encodeURIComponent(x.ref) }, x.titulo), h('span', { class: 'small muted' }, ' · ' + String(x.estado).toLowerCase().replace('_', ' '))),
          editable ? h('button', { class: 'btn ghost', style: 'min-height:34px', onclick: async (e) => { if (await accion(e.currentTarget, () => T.api.campanaQuitar(x.id), 'Elemento quitado.', error)) T.enrutador.recargar(); } }, 'Quitar') : null)))
          : h('p', { class: 'small muted' }, 'Sin elementos.'),
        editable ? h('div', { class: 'row wrap', style: 'margin-top:.5rem' }, h('div', { class: 'field', style: 'flex:1;min-width:220px' }, candidato),
          h('button', { class: 'btn', onclick: async (e) => { if (!candidato.value) return; const [t, r] = candidato.value.split(':'); if (await accion(e.currentTarget, () => T.api.campanaAgregar(s.id, t, r), 'Elemento agregado.', error)) T.enrutador.recargar(); } }, 'Agregar')) : null));
  });
})(window.T360);
