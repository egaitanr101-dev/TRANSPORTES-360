/* TRANSPORTES 360 — Inicio del colaborador. Una sola llamada (fn_inicio) para ahorrar datos móviles. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('inicio', async () => {
    T.col.cargando('inicio');
    const d = await T.api.inicio();
    T.col.usuario = d.usuario;
    T.col.pendientes = d.alertasPendientes.length;
    const s = d.semana;
    const hoy = s.capsulas.find(c => c.estado === 'hoy');
    const pend = d.alertasPendientes;

    T.col.pagina('inicio',
      h('p', { class: 'muted small', style: 'margin:0' }, 'Hola, ' + d.usuario.nombre.split(' ')[0]),
      h('section', { class: 'hero', 'aria-labelledby': 'tit-semana' },
        T.flotilla(),
        h('div', { class: 'kicker' }, 'Semana ' + s.numero + ' · ' + s.categoria),
        h('h1', { id: 'tit-semana' }, s.tema),
        h('div', { class: 'dots', role: 'img', 'aria-label': s.completadas + ' de 5 cápsulas completadas' },
          s.capsulas.map(c => h('span', { class: 'dot ' + (c.estado === 'completada' ? 'done' : c.estado === 'hoy' ? 'today' : '') }))),
        hoy
          ? [h('p', { class: 'small', style: 'opacity:.85;position:relative' }, 'Cápsula de hoy · ' + hoy.nombre),
            h('a', { class: 'btn primary', href: '#capsula/' + encodeURIComponent(hoy.id) }, hoy.titulo, icon('chevron', 'sm'))]
          : h('p', { style: 'position:relative;margin:0' }, '✔ Completó la cápsula de hoy. ¡Nos vemos mañana!')),
      pend.length ? h('a', { class: 'alert-strip' + (pend[0].prioridad === 'CRITICA' ? ' crit' : ''), href: '#alerta/' + encodeURIComponent(pend[0].id) },
        icon('alert'), h('span', { style: 'flex:1' }, (pend.length === 1 ? '1 alerta por confirmar: ' : pend.length + ' alertas por confirmar: ') + pend[0].titulo), icon('chevron', 'sm')) : null,
      h('section', { class: 'card tip', 'aria-labelledby': 'tit-tip' },
        h('div', { class: 'label' }, 'Consejo breve · 30 s'),
        h('h2', { id: 'tit-tip' }, d.consejo.titulo),
        h('p', null, d.consejo.texto),
        h('a', { class: 'btn wa', href: 'https://wa.me/?text=' + encodeURIComponent(d.consejo.compartir), target: '_blank', rel: 'noopener noreferrer' }, icon('share', 'sm'), 'Compartir por WhatsApp')),
      h('div', { class: 'section-title' }, h('h2', null, 'Aprenda sobre')),
      h('div', { class: 'cats' }, d.categorias.map(c => h('div', { class: 'cat' }, icon(c.icono), c.nombre))),
      h('div', { class: 'section-title' }, h('h2', null, 'Reconocimientos')),
      h('div', { class: 'badges' }, d.reconocimientos.map(r => h('div', { class: 'card badge' },
        h('div', { class: 'medal' }, icon(r.icono)), h('div', { class: 'small' }, h('strong', null, r.titulo), h('br'), r.detalle)))),
      h('p', { class: 'small muted' }, 'El ganador aparece solo si autorizó que se publique su nombre.'));
  });
})(window.T360);
