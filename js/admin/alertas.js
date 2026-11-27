/* TRANSPORTES 360 — Panel: ALERTAS 360 y consejos breves (iteración 4).
 * Mismo flujo para ambos: guardar → enviar a revisión → aprobar (cuatro ojos) / devolver → retirar.
 * Una alerta publicada que se edita crea una versión nueva; la aprobada sigue visible hasta aprobar la nueva.
 * Todas las reglas las valida el servidor; aquí solo se ayuda a completar bien y se muestran sus mensajes. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const ESTADOS = {
    BORRADOR: ['', 'Borrador'], PENDIENTE_REVISION: ['warn', 'Pendiente de revisión'], REQUIERE_CORRECCION: ['crit', 'Requiere corrección'],
    PUBLICADO: ['good', 'Aprobada'], ARCHIVADO: ['', 'Retirada']
  };
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);
  const chip = (e) => { const [c, t] = ESTADOS[e] || ['', e]; return h('span', { class: 'chip ' + c }, t); };
  const chipPrioridad = (p) => h('span', { class: 'chip ' + T.prioridad.clase(p) }, T.prioridad.texto(p));

  /** Vigencia real: programada, vigente o vencida (independiente del borrador que se esté editando). */
  function vigencia(x, vigente) {
    if (x.estado === 'ARCHIVADO' || !x.publica) return null;
    const ahora = Date.now();
    if (vigente != null ? vigente : (new Date(x.publica) <= ahora && (!x.vence || new Date(x.vence) > ahora))) return h('span', { class: 'chip good' }, 'Vigente');
    if (new Date(x.publica) > ahora) return h('span', { class: 'chip info' }, 'Programada ' + T.fechas.corta(x.publica));
    if (x.vence && new Date(x.vence) <= ahora) return h('span', { class: 'chip' }, 'Vencida');
    return null;
  }

  // ---------- Lista ----------
  T.enrutador.registrar('alertas', async (vista) => {
    T.adm.cargando('alertas');
    const consejos = vista === 'consejos';
    const lista = await (consejos ? T.api.consejosAdmin() : T.api.alertasAdmin());
    const tab = (ruta, txt, activa) => h('button', { role: 'tab', 'aria-selected': activa ? 'true' : 'false', onclick: () => T.enrutador.ir(ruta) }, txt);
    const tabla = (cols, filas) => h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', null, h('tr', null, cols.map(c => h('th', null, c)))), h('tbody', null, filas)));
    const abrir = (ruta, id) => h('a', { class: 'btn', style: 'min-height:38px', href: '#' + ruta + '/' + encodeURIComponent(id) }, 'Abrir');
    T.adm.marco('alertas',
      h('header', null,
        h('div', null, h('h1', null, consejos ? 'Consejos breves' : 'ALERTAS 360'),
          h('p', { class: 'muted', style: 'margin:0' }, consejos ? 'De 30 a 60 segundos, sin evaluación. Cada día se muestra uno en el inicio de la app.' : 'Riesgos que no esperan a la capacitación semanal. Las críticas las aprueba el administrador principal.')),
        puede('contenido.crear_editar') ? h('a', { class: 'btn primary', href: consejos ? '#consejo/nuevo' : '#alerta/nueva' }, icon(consejos ? 'star' : 'alert', 'sm'), consejos ? 'Nuevo consejo' : 'Nueva alerta') : null),
      h('div', { class: 'capsule-tabs', role: 'tablist' }, tab('alertas', 'Alertas', !consejos), tab('alertas/consejos', 'Consejos', consejos)),
      h('section', { class: 'card' }, !lista.length
        ? h('p', { class: 'muted', style: 'margin:0' }, consejos ? 'Todavía no hay consejos.' : 'Todavía no hay alertas.')
        : consejos
          ? tabla(['Consejo', 'Categoría', 'Estado', 'Editado por', ''], lista.map(c => h('tr', null, h('td', null, h('strong', null, c.titulo)), h('td', null, c.categoria || '—'),
              h('td', null, h('div', { class: 'row wrap' }, chip(c.estado), c.estado === 'PUBLICADO' ? vigencia(c) : null)), h('td', null, c.editor || '—'), h('td', null, abrir('consejo', c.id)))))
          : tabla(['Alerta', 'Prioridad', 'Estado', 'Confirmaron', 'Vence', ''], lista.map(a => h('tr', null, h('td', null, h('strong', null, a.titulo), h('br'), h('span', { class: 'small muted' }, (a.categoria || '') + ' · versión ' + a.version)),
              h('td', null, chipPrioridad(a.prioridad)), h('td', null, h('div', { class: 'row wrap' }, chip(a.estado), vigencia(a, a.vigente ? true : null))),
              h('td', null, a.seguimiento ? a.seguimiento.confirmadas + ' de ' + a.seguimiento.audiencia : '—'), h('td', null, a.vence ? T.fechas.corta(a.vence) : '—'), h('td', null, abrir('alerta', a.id)))))));
  });

  // ---------- Editor (alerta o consejo) ----------
  const TIPO = {
    alerta: {
      volver: 'alertas', nombre: 'alerta', nueva: 'Nueva alerta',
      vacio: () => ({ prioridad: 'PREVENTIVA', titulo: '', descripcion: '', riesgo: '', recomendaciones: [], fuente: '', fuente_url: '', areas: null, publica: null, vence: null }),
      api: { leer: 'alertaAdmin', guardar: 'guardarAlerta', enviar: 'enviarAlerta', devolver: 'devolverAlerta', archivar: 'archivarAlerta', eliminar: 'eliminarAlerta' }
    },
    consejo: {
      volver: 'alertas/consejos', nombre: 'consejo', nueva: 'Nuevo consejo',
      vacio: () => ({ titulo: '', texto: '', compartir: '', fuente: '', publica: null, vence: null }),
      api: { leer: 'consejoAdmin', guardar: 'guardarConsejo', enviar: 'enviarConsejo', devolver: 'devolverConsejo', archivar: 'archivarConsejo', eliminar: 'eliminarConsejo' }
    }
  };

  async function editor(tipo, id) {
    const def = TIPO[tipo], esAlerta = tipo === 'alerta';
    T.adm.cargando('alertas');
    const nuevo = !id || id === 'nueva' || id === 'nuevo';
    const [categorias, areas, datos] = await Promise.all([T.api.categorias(), esAlerta ? T.api.areas() : [], nuevo ? null : T.api[def.api.leer](id)]);
    const s = Object.assign(def.vacio(), { category_id: (categorias.find(c => c.activa) || {}).id, estado: 'BORRADOR', version: 1, historial: [] }, datos || {});
    const editable = s.estado !== 'ARCHIVADO' && puede('contenido.crear_editar');
    let sucio = false;

    const mensaje = h('p', { class: 'form-error', role: 'alert' });
    const acciones = h('div', { class: 'row wrap', style: 'margin-top:1rem' });
    const zona = h('div');          // formularios de motivo / aprobación
    const marcar = () => { if (!sucio) { sucio = true; T.limpiar(zona); pintarAcciones(); } };

    let n = 0;
    const campo = (etq, control, ayuda, lleno) => { const k = 'ca-' + (++n); control.id = k; return h('div', { class: 'field' + (lleno ? ' full' : '') }, h('label', { for: k }, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null); };
    const texto = (k, max) => h('input', { type: 'text', maxlength: max, value: s[k] || '', disabled: !editable, oninput: (e) => { s[k] = e.target.value; marcar(); } });
    const area = (k, max, filas) => h('textarea', { maxlength: max, rows: filas || 3, disabled: !editable, oninput: (e) => { s[k] = e.target.value; marcar(); } }, s[k] || '');
    const cuando = (k) => h('input', { type: 'datetime-local', value: T.fechas.aCampo(s[k]), disabled: !editable, onchange: (e) => { s[k] = T.fechas.deCampo(e.target.value); marcar(); } });
    const lista = (k, ops) => h('select', { disabled: !editable, onchange: (e) => { s[k] = e.target.value; marcar(); } }, ops.map(([v, t]) => h('option', { value: v, selected: v === s[k] }, t)));

    async function ejecutar(boton, fn, exito) {
      mensaje.textContent = ''; boton.disabled = true;
      try { const r = await fn(); if (exito) exito(r); }
      catch (e) { mensaje.textContent = T.ui.mensajeDe(e); boton.disabled = false; window.scrollTo(0, 0); }
    }
    async function guardar() {
      if (!s.titulo.trim()) throw T.error('VALIDACION', 'Escriba el título.');
      const p = esAlerta
        ? { category_id: s.category_id, prioridad: s.prioridad, titulo: s.titulo, descripcion: s.descripcion, riesgo: s.riesgo, recomendaciones: s.recomendaciones, fuente: s.fuente, fuente_url: s.fuente_url, areas: s.areas && s.areas.length ? s.areas : null, publica: s.publica, vence: s.vence }
        : { category_id: s.category_id, titulo: s.titulo, texto: s.texto, compartir: s.compartir, fuente: s.fuente, publica: s.publica, vence: s.vence };
      if (s.id) p.id = s.id;
      const nid = await T.api[def.api.guardar](p);
      s.id = nid; sucio = false;
      return nid;
    }
    const recargar = (nid) => T.enrutador.ir(tipo + '/' + encodeURIComponent(nid || s.id));
    const listo = (aviso) => () => { T.ui.aviso(aviso); recargar(); };

    /** Formulario con motivo obligatorio (devolver, retirar). */
    function pedirMotivo(titulo, boton, fn, aviso) {
      const t = h('textarea', { rows: 3, maxlength: 500, 'aria-label': titulo });
      T.poner(zona, h('div', { class: 'card', style: 'margin-top:1rem;border-color:var(--crit)' }, h('h2', null, titulo), h('div', { class: 'field' }, t),
        h('div', { class: 'row', style: 'margin-top:.75rem' },
          h('button', { class: 'btn primary', onclick: (e) => ejecutar(e.currentTarget, () => fn(t.value.trim()), listo(aviso)) }, boton),
          h('button', { class: 'btn', onclick: () => T.limpiar(zona) }, 'Cancelar'))));
      t.focus();
    }
    function pedirAprobacion() {
      const fuente = h('input', { type: 'checkbox' });
      const com = h('input', { type: 'text', maxlength: 300, 'aria-label': 'Comentario' });
      T.poner(zona, h('div', { class: 'card', style: 'margin-top:1rem;border-color:var(--gold)' }, h('h2', null, 'Aprobar y publicar'),
        h('p', { class: 'small' }, s.publica && new Date(s.publica) > Date.now() ? 'Se publicará el ' + T.fechas.hora(s.publica) + '.' : 'Se publicará de inmediato para ' + (esAlerta && s.areas && s.areas.length ? 'las áreas elegidas.' : 'todos.')),
        esAlerta ? h('label', { class: 'row', style: 'min-height:48px' }, fuente, 'Verifiqué la fuente y el contenido coincide con ella') : null,
        h('div', { class: 'field' }, h('label', null, 'Comentario (opcional)'), com),
        h('div', { class: 'row', style: 'margin-top:.75rem' },
          h('button', { class: 'btn primary', onclick: (e) => ejecutar(e.currentTarget,
            () => esAlerta ? T.api.aprobarAlerta(s.id, s.editado, fuente.checked, com.value.trim() || null) : T.api.aprobarConsejo(s.id, s.editado, com.value.trim() || null),
            (r) => { T.ui.aviso(r.aprobador_unico ? 'Aprobado (como única persona que puede aprobarlo; queda registrado).' : 'Aprobado.'); recargar(); }) }, icon('check', 'sm'), 'Aprobar'),
          h('button', { class: 'btn', onclick: () => T.limpiar(zona) }, 'Cancelar'))));
    }

    function pintarAcciones() {
      const b = [], a = def.api;
      const revisa = puede('contenido.aprobar') && s.estado === 'PENDIENTE_REVISION';
      if (editable) b.push(h('button', { class: 'btn primary', onclick: (e) => ejecutar(e.currentTarget, guardar, (nid) => { T.ui.aviso('Guardado.'); recargar(nid); }) }, 'Guardar' + (sucio ? ' *' : '')));
      if (editable && ['BORRADOR', 'REQUIERE_CORRECCION'].includes(s.estado)) b.push(h('button', { class: 'btn', onclick: (e) => ejecutar(e.currentTarget, async () => { const nid = sucio || !s.id ? await guardar() : s.id; await T.api[a.enviar](nid); return nid; }, (nid) => { T.ui.aviso('Enviado a revisión.'); recargar(nid); }) }, 'Enviar a revisión'));
      if (revisa) {
        b.push(h('button', { class: 'btn primary', disabled: sucio, title: sucio ? 'Guarde antes de aprobar' : false, onclick: pedirAprobacion }, icon('check', 'sm'), 'Aprobar y publicar'));
        b.push(h('button', { class: 'btn', onclick: () => pedirMotivo('¿Qué se debe corregir?', 'Devolver', (m) => T.api[a.devolver](s.id, m), 'Devuelto para corrección.') }, 'Devolver'));
      }
      if (s.id && s.estado !== 'ARCHIVADO' && s.aprobada && puede('contenido.aprobar')) b.push(h('button', { class: 'btn ghost', onclick: () => pedirMotivo('¿Por qué se retira? Dejará de verse de inmediato.', 'Retirar', (m) => T.api[a.archivar](s.id, m), 'Retirado.') }, 'Retirar'));
      if (s.id && !s.aprobada && ['BORRADOR', 'REQUIERE_CORRECCION'].includes(s.estado) && puede('contenido.crear_editar')) b.push(h('button', { class: 'btn ghost', onclick: (e) => { if (window.confirm('¿Eliminar este borrador? No se puede deshacer.')) ejecutar(e.currentTarget, () => T.api[a.eliminar](s.id), () => { T.ui.aviso('Borrador eliminado.'); T.enrutador.ir(def.volver); }); } }, 'Eliminar borrador'));
      b.push(h('button', { class: 'btn ghost', onclick: vistaPrevia }, icon('phone', 'sm'), 'Vista previa'));
      T.poner(acciones, b);
    }

    function vistaPrevia() {
      const cat = (categorias.find(c => c.id === s.category_id) || {}).nombre;
      const fondo = h('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === fondo) fondo.remove(); } },
        h('div', { class: 'stack', style: 'max-width:420px;width:100%' },
          h('div', { class: 'row between' }, h('strong', { style: 'color:#fff' }, 'Vista previa'), h('button', { class: 'btn', onclick: () => fondo.remove() }, 'Cerrar')),
          h('div', { class: 'telefono' }, esAlerta
            ? h('article', { class: 'stack' }, T.alertaVista(Object.assign({}, s, { categoria: cat, recomendaciones: s.recomendaciones.filter(x => x.trim()) })), h('button', { class: 'btn primary block', disabled: true }, 'Confirmo que leí esta alerta'))
            : T.consejoVista(Object.assign({}, s, { categoria: cat })))));
      document.body.appendChild(fondo);
    }

    const avisos = [];
    if (esAlerta && s.vigente && s.estado !== 'PUBLICADO') avisos.push(h('div', { class: 'note', style: 'margin-top:1rem' }, 'Los colaboradores siguen viendo la versión ' + s.vigente.version + ' («' + s.vigente.titulo + '») hasta que se apruebe la versión ' + s.version + '.'));
    if (editable && s.estado === 'PUBLICADO') avisos.push(h('div', { class: 'note', style: 'margin-top:1rem' }, esAlerta ? 'Si guarda cambios se crea una versión nueva que debe aprobarse y que cada colaborador tendrá que confirmar otra vez.' : 'Si guarda cambios, el consejo deja de verse hasta que se apruebe de nuevo.'));
    if (editable && s.estado === 'PENDIENTE_REVISION') avisos.push(h('div', { class: 'note', style: 'margin-top:1rem' }, 'Está en revisión. Si guarda cambios vuelve a borrador y usted ya no podrá aprobarlo.'));

    const marcaArea = (a) => h('label', { class: 'row small', style: 'min-height:40px' }, h('input', { type: 'checkbox', checked: (s.areas || []).includes(a.id), disabled: !editable, onchange: (e) => {
      const set = new Set(s.areas || []); if (e.target.checked) set.add(a.id); else set.delete(a.id); s.areas = set.size ? [...set] : null; marcar(); } }), a.nombre);

    const formulario = esAlerta ? [
      campo('Prioridad', lista('prioridad', T.prioridad.lista.map(p => [p, T.prioridad.texto(p)])), 'Crítica: la aprueba únicamente el administrador principal.'),
      campo('Categoría', lista('category_id', categorias.filter(c => c.activa || c.id === s.category_id).map(c => [c.id, c.nombre]))),
      campo('Título', texto('titulo', 140), null, true),
      campo('¿Qué está pasando?', area('descripcion', 2000, 4), null, true),
      campo('Riesgo', area('riesgo', 1000, 2), null, true),
      campo('Qué hacer (una recomendación por línea, de 1 a 8)', h('textarea', { rows: 5, maxlength: 2600, disabled: !editable, oninput: (e) => { s.recomendaciones = e.target.value.split('\n'); marcar(); } }, s.recomendaciones.join('\n')), null, true),
      campo('Fuente (entidad o documento)', texto('fuente', 300), 'Obligatoria: quien aprueba debe verificarla.'),
      campo('Enlace de la fuente (https, opcional)', texto('fuente_url', 500)),
      campo('Publicar desde (vacío = al aprobar)', cuando('publica'), 'Hora de Costa Rica.'),
      campo('Vigente hasta', cuando('vence'), 'Obligatorio. Al vencer deja de mostrarse.'),
      h('fieldset', { class: 'field full', style: 'border:1px solid var(--border);border-radius:12px;padding:.5rem 1rem' }, h('legend', { class: 'small' }, 'Para quién (sin marcar = todas las áreas)'),
        areas.length ? h('div', { class: 'row wrap' }, areas.map(marcaArea)) : h('span', { class: 'hint' }, 'Todavía no hay áreas registradas: se publica para todos.'))
    ] : [
      campo('Categoría', lista('category_id', categorias.filter(c => c.activa || c.id === s.category_id).map(c => [c.id, c.nombre]))),
      campo('Título', texto('titulo', 100)),
      campo('Consejo (máximo 600 caracteres)', area('texto', 600, 5), null, true),
      campo('Texto para compartir por WhatsApp (opcional)', area('compartir', 300, 2), 'Vacío = título y consejo.', true),
      campo('Fuente', texto('fuente', 300), 'Obligatoria.'),
      campo('Publicar desde (vacío = al aprobar)', cuando('publica'), 'Hora de Costa Rica.'),
      campo('Vigente hasta (opcional)', cuando('vence'))
    ];

    const v = esAlerta ? s.vigente : null;
    T.adm.marco('alertas',
      h('a', { class: 'back', href: '#' + def.volver }, icon('back', 'sm'), esAlerta ? 'Alertas' : 'Consejos'),
      h('header', null, h('div', null, h('h1', null, nuevo ? def.nueva : s.titulo), h('div', { class: 'row wrap' }, chip(s.estado), h('span', { class: 'chip' }, 'Versión ' + s.version), esAlerta ? chipPrioridad(s.prioridad) : null, v ? h('span', { class: 'chip good' }, 'Vigente: versión ' + v.version) : null))),
      mensaje, avisos, acciones, zona,
      v ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Lectura de la versión ' + v.version),
        h('div', { class: 'grid4' }, T.adm.kpi(String(v.seguimiento.audiencia), 'Deben leerla', 'personas activas'), T.adm.kpi(String(v.seguimiento.vistas), 'La abrieron', 'no equivale a confirmar'),
          T.adm.kpi(String(v.seguimiento.confirmadas), 'Confirmaron', v.seguimiento.audiencia ? Math.round(v.seguimiento.confirmadas * 100 / v.seguimiento.audiencia) + ' %' : ''), T.adm.kpi(String(v.pendientes.length), 'Pendientes', '')),
        v.pendientes.length ? h('details', { style: 'margin-top:.75rem' }, h('summary', null, 'Quiénes faltan (' + v.pendientes.length + ')'),
          h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Código', 'Nombre', 'Área', 'La abrió'].map(x => h('th', null, x)))),
            h('tbody', null, v.pendientes.map(p => h('tr', null, h('td', null, p.codigo || '—'), h('td', null, p.nombre), h('td', null, p.area || '—'), h('td', null, p.vista ? 'Sí' : 'No'))))))) : null) : null,
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('div', { class: 'form-grid' }, formulario)),
      s.id && T.fuentesDe ? T.fuentesDe(esAlerta ? 'alerta' : 'consejo', s.id) : null,
      s.historial.length ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Historial'), h('ul', { class: 'checks' }, s.historial.slice().reverse().map(x => h('li', null, icon('history', 'sm'),
        h('span', null, T.fechas.hora(x.fecha) + ' · v' + x.version + ' · ' + (ESTADOS[x.a] || ['', x.a])[1] + ' · ' + (x.actor || '') + (x.comentario ? ' — «' + x.comentario + '»' : '')))))) : null);
    pintarAcciones();
  }

  T.enrutador.registrar('alerta', (id) => editor('alerta', id));
  T.enrutador.registrar('consejo', (id) => editor('consejo', id));
})(window.T360);
