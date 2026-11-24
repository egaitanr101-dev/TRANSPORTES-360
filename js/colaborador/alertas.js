/* TRANSPORTES 360 — ALERTAS 360: lista, detalle y confirmación de lectura; y consejos breves.
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
          h('span', { class: 'grow' }, h('span', { class: 'title' }, a.titulo),
            h('span', { class: 'small muted' }, T.prioridad.texto(a.prioridad) + ' · ' + T.fechas.corta(a.publica) + ' · vence ' + T.fechas.corta(a.vence))),
          a.confirmada ? h('span', { class: 'chip good' }, icon('check', 'sm'), 'Leída') : h('span', { class: 'chip high' }, 'Confirmar')))))
        : h('p', { class: 'muted' }, 'No hay alertas vigentes.'),
      h('p', null, h('a', { class: 'btn', href: '#consejos' }, 'Ver consejos breves')));
  });

  T.enrutador.registrar('alerta', async (id) => {
    T.col.cargando('alertas');
    const a = await T.api.alerta(id);
    const zona = h('div');
    const pintarConfirmacion = () => T.poner(zona, a.confirmada
      ? h('div', { class: 'feedback ok', role: 'status' }, '✔ Usted confirmó la lectura de esta alerta' + (a.confirmada_el ? ' el ' + T.fechas.hora(a.confirmada_el) : '.'))
      : h('button', {
        class: 'btn primary block', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const r = await T.api.confirmarAlerta(a.id, a.version);
            a.confirmada = true; a.confirmada_el = r.confirmada_el;
            T.col.pendientes = Math.max(0, T.col.pendientes - 1);
            T.col.refrescarNav('alertas');
            pintarConfirmacion();
          } catch (err) {
            T.ui.error(err);
            // Cambió o dejó de estar vigente mientras la leía: se vuelve a cargar para que lea lo actual
            if (err.codigo === 'VALIDACION') T.enrutador.recargar();
            else if (err.codigo === 'NO_ENCONTRADO') T.enrutador.ir('alertas');
            else pintarConfirmacion();
          }
        }
      }, icon('check', 'sm'), 'Confirmo que leí esta alerta'));
    pintarConfirmacion();

    T.col.pagina('alertas',
      h('a', { class: 'back', href: '#alertas' }, icon('back', 'sm'), 'Alertas'),
      h('article', { class: 'stack' }, T.alertaVista(a), zona,
        h('p', { class: 'small muted' }, 'La confirmación se registra con fecha y hora. Abrir un enlace de WhatsApp no cuenta como lectura.')));
  });

  T.enrutador.registrar('consejos', async () => {
    T.col.cargando('inicio');
    const lista = await T.api.consejos();
    T.col.pagina('inicio',
      h('a', { class: 'back', href: '#inicio' }, icon('back', 'sm'), 'Inicio'),
      h('h1', null, 'Consejos breves'),
      lista.length ? h('div', { class: 'stack' }, lista.map(c => T.consejoVista(c))) : h('p', { class: 'muted' }, 'Todavía no hay consejos publicados.'));
  });

  T.enrutador.registrar('consejo', async (id) => {
    T.col.cargando('inicio');
    const c = (await T.api.consejos()).find(x => x.id === id);
    T.col.pagina('inicio',
      h('a', { class: 'back', href: '#consejos' }, icon('back', 'sm'), 'Consejos'),
      c ? T.consejoVista(c) : h('p', { class: 'muted' }, 'Ese consejo ya no está vigente.'));
  });
})(window.T360);
