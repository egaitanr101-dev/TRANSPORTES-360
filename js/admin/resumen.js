/* TRANSPORTES 360 — Panel: resumen. Cada indicador muestra numerador y denominador (MAPA_FUNCIONAL §14).
   Un supervisor ve solo a su equipo y sin puntajes individuales (D-09); lo decide el servidor (fn_resumen). */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const pct = (a, b) => b ? Math.round(a * 100 / b) + ' %' : '—';
  const fecha = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
  const usd = (n) => 'US$ ' + Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** KPI de una semana, reutilizado por Reportes. */
  T.kpisSemana = function (s) {
    return [
      T.adm.kpi(pct(s.participaron, s.base), 'Participación', s.participaron + ' de ' + s.base + ' hicieron al menos 1 cápsula'),
      T.adm.kpi(pct(s.completaron, s.base), 'Completaron 5 de 5', s.completaron + ' de ' + s.base),
      T.adm.kpi(pct(s.ingresaron, s.base), 'Abrieron alguna cápsula', s.ingresaron + ' de ' + s.base),
      T.adm.kpi(s.promedio != null ? String(s.promedio) + ' / 10' : '—', 'Puntaje promedio', s.promedio_oculto ? 'Oculto: lo completaron menos de 5 personas' : s.completaron ? 'de quienes completaron 5 de 5' : 'nadie ha completado todavía')
    ];
  };

  T.enrutador.registrar('resumen', async () => {
    T.adm.cargando('resumen');
    const d = await T.api.resumen();
    const s = d.semana, p = d.pendientes;
    const pendientes = [];
    if (p) {
      if (p.revision) pendientes.push(h('li', null, icon('audit', 'sm'), h('span', null, h('a', { href: '#revision' }, p.revision + ' contenido(s) pendiente(s) de revisión'))));
      p.sin_capacitacion.forEach(l => pendientes.push(h('li', null, icon('calendar', 'sm'), h('span', null, 'La semana del ' + fecha(l) + ' no tiene capacitación aprobada · ', h('a', { href: '#calendario' }, 'calendario')))));
      p.sorteos.forEach(x => pendientes.push(h('li', null, icon('gift', 'sm'), h('span', null, h('a', { href: '#sorteo/' + encodeURIComponent(x.id) }, 'Cierre y sorteo: ' + x.titulo), ' (semana del ' + fecha(x.lunes) + ')'))));
      p.alertas_por_vencer.forEach(a => pendientes.push(h('li', null, icon('alert', 'sm'), h('span', null, 'Alerta «' + a.titulo + '» vence el ' + T.fechas.corta(a.vence)))));
      if (p.fuentes) pendientes.push(h('li', null, icon('shield', 'sm'), h('span', null, h('a', { href: '#documentos/fuentes' }, p.fuentes + ' fuente(s) por validar'))));
    }
    T.adm.marco('resumen',
      h('header', null, h('div', null, h('h1', null, d.equipo ? 'Resumen de mi equipo' : 'Resumen'),
        h('p', { class: 'muted', style: 'margin:0' }, s ? 'Semana ' + s.numero + ' · ' + s.titulo + ' · día ' + s.dia + ' de 5' : 'No hay una capacitación publicada esta semana.')),
        h('a', { class: 'btn', href: d.equipo ? '#equipo' : '#reportes' }, icon('chart', 'sm'), d.equipo ? 'Ver mi equipo' : 'Ver reportes')),
      s ? h('div', { class: 'grid4' }, T.kpisSemana(s)) : null,
      h('div', { class: 'grid2', style: 'margin-top:1rem' },
        d.alerta ? h('section', { class: 'card' }, h('h2', null, 'Alerta principal'), h('p', { style: 'margin:.25rem 0' }, d.alerta.titulo),
          h('p', { class: 'small muted', style: 'margin:0' }, 'Confirmaron ' + d.alerta.confirmadas + ' de ' + d.alerta.audiencia + ' (' + pct(d.alerta.confirmadas, d.alerta.audiencia) + ') · la abrieron ' + d.alerta.vistas + ' · vence ' + T.fechas.corta(d.alerta.vence))) : null,
        d.ia ? h('section', { class: 'card' }, h('h2', null, 'IA este mes'), h('p', { style: 'margin:.25rem 0' }, usd(d.ia.gastado_usd) + ' de ' + usd(d.ia.tope_usd)),
          h('p', { class: 'small muted', style: 'margin:0' }, (d.ia.encendida ? 'Encendida' : 'Apagada') + ' · costo estimado con los precios registrados, no la factura')) : null,
        p ? h('section', { class: 'card' }, h('h2', null, 'Pendientes'), pendientes.length ? h('ul', { class: 'checks' }, pendientes) : h('p', { class: 'muted', style: 'margin:0' }, 'Nada pendiente.')) : null,
        d.errores && d.errores.length ? h('section', { class: 'card' }, h('h2', null, 'Preguntas con más errores'),
          h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Pregunta'), h('th', null, 'Aciertos'))),
            h('tbody', null, d.errores.map(e => h('tr', null, h('td', null, e.pregunta), h('td', null, e.aciertos + ' % (' + e.correctas + ' de ' + e.respuestas + ')'))))),
          h('p', { class: 'small muted', style: 'margin:.6rem 0 0' }, 'Solo preguntas con 5 respuestas oficiales o más.')) : null));
  });
})(window.T360);
