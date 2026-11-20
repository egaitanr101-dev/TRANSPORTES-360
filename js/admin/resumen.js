/* TRANSPORTES 360 — Panel: resumen de la semana. Cada indicador muestra numerador y denominador (MAPA_FUNCIONAL §14). */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('resumen', async () => {
    T.adm.cargando('resumen');
    const d = await T.api.resumen();
    T.adm.marco('resumen',
      h('header', null,
        h('div', null, h('h1', null, d.titulo), h('p', { class: 'muted', style: 'margin:0' }, d.subtitulo)),
        h('a', { class: 'btn primary', href: '#generador' }, icon('spark', 'sm'), 'Generar semana 49')),
      h('div', { class: 'grid4' }, d.kpis.map(k => T.adm.kpi(k.valor, k.etiqueta, k.den))),
      h('div', { class: 'grid2', style: 'margin-top:1rem' },
        h('section', { class: 'card' }, h('h2', null, 'Pendientes'),
          h('ul', { class: 'checks' },
            h('li', null, icon('audit', 'sm'), h('span', null, h('a', { href: '#revision' }, 'Semana 48 · Manejo responsable de deudas'), ' — pendiente de revisión')),
            h('li', null, icon('alert', 'sm'), h('span', null, 'Alerta "Mensajes falsos que se hacen pasar por bancos" vence el 30 nov')),
            h('li', null, icon('calendar', 'sm'), h('span', null, 'Semana 49 sin tema asignado')),
            h('li', null, icon('gift', 'sm'), h('span', null, h('a', { href: '#sorteo' }, 'Sorteo de la semana 46'), ' — listo para ejecutar')))),
        h('section', { class: 'card' }, h('h2', null, 'Preguntas con más errores (S47)'),
          h('table', { class: 't' },
            h('thead', null, h('tr', null, h('th', null, 'Pregunta'), h('th', null, 'Aciertos'))),
            h('tbody', null, d.errores.map(e => h('tr', null, h('td', null, e.pregunta), h('td', null, e.aciertos))))),
          h('p', { class: 'small muted', style: 'margin:.6rem 0 0' }, 'Estas preguntas alimentan las sugerencias de temas del calendario.'))));
  });
})(window.T360);
