/* TRANSPORTES 360 — Semana: las 5 cápsulas con su estado. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('semana', async () => {
    T.col.cargando('semana');
    const s = await T.api.semana();
    if (!s) {
      T.col.pagina('semana', h('h1', null, 'Semana'), h('p', { class: 'muted' }, 'Aún no hay una capacitación publicada esta semana.'));
      return;
    }
    T.col.pagina('semana',
      h('h1', null, 'Semana ' + s.numero),
      h('p', { class: 'muted' }, s.tema + ' · ' + s.rango),
      h('ul', { class: 'list' }, s.capsulas.map(c => {
        const cls = c.estado === 'completada' ? 'done' : c.estado === 'hoy' ? 'today' : 'locked';
        const derecha = c.estado === 'completada' ? h('span', { class: 'chip good' }, icon('check', 'sm'), c.puntos != null ? c.puntos + '/2' : 'Hecha')
          : c.estado === 'hoy' ? h('span', { class: 'chip gold' }, 'Hoy')
            : h('span', { class: 'chip' }, icon('lock', 'sm'), c.nombre);
        const cuerpo = [h('span', { class: 'day' }, c.dia), h('span', { class: 'grow' }, h('span', { class: 'title' }, c.titulo), h('span', { class: 'small muted' }, c.nombre + ' · ' + c.etapa)), derecha];
        const abrir = c.estado === 'hoy' || (c.estado === 'completada' && c.dia === s.hoy);
        return h('li', null, abrir ? h('a', { class: 'item ' + cls, href: '#capsula/' + encodeURIComponent(c.id) }, cuerpo) : h('div', { class: 'item ' + cls }, cuerpo));
      })),
      h('div', { class: 'note' }, 'Cada cápsula queda disponible hasta el ' + s.cierre + '. Para participar en el sorteo hay que completar las 5.'));
  });
})(window.T360);
