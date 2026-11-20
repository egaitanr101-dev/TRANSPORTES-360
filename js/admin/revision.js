/* TRANSPORTES 360 — Panel: revisión y aprobación de un borrador.
   Regla de cuatro ojos: quien solicitó o editó el borrador no puede aprobarlo (MAPA_FUNCIONAL §6).
   El servidor vuelve a validar esta regla; el botón deshabilitado es solo una ayuda visual. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('revision', async () => {
    T.adm.cargando('revision');
    const b = await T.api.borrador();
    const autor = T.adm.usuario && b.solicitadoPor === T.adm.usuario.id;
    const cuerpo = h('div');
    const tabs = h('div', { class: 'capsule-tabs', role: 'tablist' });
    let actual = 0;

    const pintar = () => {
      T.limpiar(tabs).append(...b.capsulas.map((c, i) => h('button', { role: 'tab', 'aria-selected': i === actual ? 'true' : 'false', onclick: () => { actual = i; pintar(); } }, (i + 1) + ' · ' + c.dia)));
      const c = b.capsulas[actual];
      T.poner(cuerpo, h('h3', null, c.titulo),
        c.preguntas ? [
          h('p', null, h('strong', null, 'Objetivo: '), c.objetivo),
          h('p', null, c.intro),
          h('p', { class: 'small muted' }, '… tarjetas de la cápsula (portada, escenario, errores, detectar señales, caso, infografía, compromiso), editables y con vista previa en teléfono.'),
          c.preguntas.map((q, qi) => h('div', { class: 'card', style: 'margin-top:.75rem' },
            h('strong', null, 'Pregunta ' + (qi + 1) + '. '), q.t,
            h('ul', { class: 'checks', style: 'margin-top:.5rem' }, q.o.map((o, oi) => h('li', { class: oi === q.c ? 'ok' : '' },
              oi === q.c ? icon('check', 'sm') : h('span', { style: 'width:18px;flex:none' }),
              String.fromCharCode(65 + oi) + ') ' + o + (oi === q.c ? '  ← respuesta correcta' : '')))))),
          h('p', { class: 'small muted', style: 'margin-top:.6rem' }, 'Fuentes: 2 fragmentos de la "Guía de finanzas personales (v1)", pág. 4 y 7 · 1 recurso de un dominio oficial (validado).')
        ] : h('p', { class: 'muted' }, 'En la demostración solo se detalla la cápsula 1.'));
    };
    pintar();

    T.adm.marco('revision',
      h('header', null,
        h('div', null, h('h1', null, 'Semana ' + b.semana + ' · ' + b.tema),
          h('p', { class: 'muted', style: 'margin:0' }, b.categoria + ' · versión ' + b.version + ' · ', h('span', { class: 'chip warn' }, 'Pendiente de revisión'))),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', onclick: () => T.ui.aviso('Edición de borradores: iteración 2.') }, 'Editar (crea versión 2)'),
          h('button', { class: 'btn', onclick: () => T.ui.aviso('Solicitud de corrección: iteración 2.') }, 'Solicitar corrección'),
          h('button', { class: 'btn primary', disabled: autor, title: autor ? 'Usted solicitó esta generación: debe aprobarla otra persona' : false }, icon('check', 'sm'), 'Aprobar y programar'))),
      autor ? h('div', { class: 'note warn', style: 'margin-bottom:1rem' }, 'Usted solicitó este borrador, así que debe aprobarlo otra persona (regla de cuatro ojos).') : null,
      h('p', { class: 'small muted' }, b.meta),
      h('div', { class: 'grid2' },
        h('section', { class: 'card' }, h('h2', null, 'Validación automática'),
          h('ul', { class: 'checks' }, b.validacion.map(v => h('li', { class: v.ok ? 'ok' : 'wr' }, icon(v.ok ? 'check' : 'alert', 'sm'), v.texto)))),
        h('section', { class: 'card' }, h('h2', null, 'Lista de verificación · ' + b.categoria),
          h('div', { class: 'stack small' }, b.checklist.map(t => h('label', { class: 'row' }, h('input', { type: 'checkbox' }), t))))),
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Contenido'), tabs, cuerpo));
  });
})(window.T360);
