/* TRANSPORTES 360 — Mi historial: solo los datos propios (RLS por auth.uid()). */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('historial', async () => {
    T.col.cargando('historial');
    const d = await T.api.historial();
    T.col.pagina('historial',
      h('h1', null, 'Mi historial'),
      h('div', { class: 'note' }, icon('lock', 'sm'), ' Sus puntajes solo los ve usted y el equipo de administración.'),
      d.semanas.length ? null : h('p', { class: 'muted' }, 'Todavía no hay semanas registradas.'),
      h('ul', { class: 'list' }, d.semanas.map(s => h('li', null,
        h('div', { class: 'item' },
          h('span', { class: 'day' }, s.semana),
          h('span', { class: 'grow' }, h('span', { class: 'title' }, s.tema),
            h('span', { class: 'small muted' }, s.estado + ' · ' + s.capsulas + ' de 5 cápsulas' +
              (s.estado === 'Cerrada' ? (s.capsulas === 5 ? ' · participó en el sorteo' : ' · no participó en el sorteo') : ''))),
          h('span', { class: 'row', style: 'flex-direction:column;gap:.25rem;align-items:flex-end' },
            h('strong', null, s.puntos + '/10'),
            s.insignia ? h('span', { class: 'chip gold' }, s.insignia) : null))))),
      h('div', { class: 'card' }, h('h2', null, 'Alertas'),
        h('p', { style: 'margin:0' }, d.alertas.confirmadas + ' de ' + d.alertas.total + ' alertas vigentes confirmadas.')));
  });
})(window.T360);
