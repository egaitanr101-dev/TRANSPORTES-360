/* TRANSPORTES 360 — ALERTAS 360: lista, detalle y confirmación de lectura.
   Publicada → vista (abrió el detalle) → confirmada (tocó el botón). Un enlace de WhatsApp no es lectura. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('alertas', async () => {
    T.col.cargando('alertas');
    const lista = await T.api.alertas();
    T.col.pendientes = lista.filter(a => !a.confirmada).length;
    T.col.pagina('alertas',
      h('h1', null, 'ALERTAS 360'),
      h('p', { class: 'muted' }, 'Información importante que no espera a la capacitación semanal.'),
      lista.length ? h('ul', { class: 'list' }, lista.map(a => h('li', null,
        h('a', { class: 'item', href: '#alerta/' + encodeURIComponent(a.id) },
          h('span', { class: 'prio ' + a.prioridad }),
          h('span', { class: 'grow' }, h('span', { class: 'title' }, a.titulo), h('span', { class: 'small muted' }, T.col.prioridadTexto(a.prioridad) + ' · ' + a.fecha + ' · vence ' + a.vence)),
          a.confirmada ? h('span', { class: 'chip good' }, icon('check', 'sm'), 'Leída') : h('span', { class: 'chip high' }, 'Confirmar')))))
        : h('p', { class: 'muted' }, 'No hay alertas vigentes.'));
  });

  T.enrutador.registrar('alerta', async (id) => {
    T.col.cargando('alertas');
    const a = await T.api.alerta(id);
    const zona = h('div');
    const pintarConfirmacion = () => T.limpiar(zona).append(a.confirmada
      ? h('div', { class: 'feedback ok', role: 'status' }, '✔ Usted confirmó la lectura de esta alerta.')
      : h('button', {
        class: 'btn primary block', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            await T.api.confirmarAlerta(a.id);
            a.confirmada = true;
            T.col.pendientes = Math.max(0, T.col.pendientes - 1);
            T.col.refrescarNav('alertas');
          } catch (err) { T.ui.error(err); }
          pintarConfirmacion();
        }
      }, icon('check', 'sm'), 'Confirmo que leí esta alerta'));
    pintarConfirmacion();

    T.col.pagina('alertas',
      h('a', { class: 'back', href: '#alertas' }, icon('back', 'sm'), 'Alertas'),
      h('article', { class: 'stack' },
        h('div', { class: 'row wrap' }, h('span', { class: 'chip ' + T.col.prioridadClase(a.prioridad) }, 'Prioridad ' + T.col.prioridadTexto(a.prioridad)), h('span', { class: 'chip' }, a.categoria)),
        h('h1', null, a.titulo),
        h('p', { class: 'small muted' }, 'Publicada ' + a.fecha + ' · Vigente hasta ' + a.vence),
        h('p', null, a.descripcion),
        h('div', { class: 'card' }, h('div', { class: 'block-label' }, 'Riesgo'), h('p', { style: 'margin:0' }, a.riesgo)),
        h('div', null, h('h2', null, 'Qué hacer'), h('ul', { class: 'checklist' }, a.recomendaciones.map(t => h('li', null, icon('check', 'sm'), h('span', null, t))))),
        h('p', { class: 'source' }, a.fuente),
        zona,
        h('p', { class: 'small muted' }, 'La confirmación se registra con fecha y hora. Abrir un enlace de WhatsApp no cuenta como lectura.')));
  });
})(window.T360);
