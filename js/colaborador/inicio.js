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
    // La de hoy; si ya la hizo, la más antigua que quedó pendiente (puede ponerse al día hasta el domingo)
    const hoy = s ? (s.capsulas.find(c => c.estado === 'hoy') || s.capsulas.find(c => c.estado === 'pendiente')) : null;
    const pend = d.alertasPendientes;

    T.col.pagina('inicio',
      h('p', { class: 'muted small', style: 'margin:0' }, 'Hola, ' + d.usuario.nombre.split(' ')[0]),
      !s ? h('section', { class: 'hero', 'aria-labelledby': 'tit-semana' },
        T.flotilla(),
        h('div', { class: 'kicker' }, T.config.lema),
        h('h1', { id: 'tit-semana' }, 'Bienvenido a TRANSPORTES 360'),
        h('p', { style: 'position:relative;margin:0' }, 'Aún no hay una capacitación publicada esta semana. Cuando esté lista, aparecerá aquí.')) :
      h('section', { class: 'hero', 'aria-labelledby': 'tit-semana' },
        T.flotilla(),
        h('div', { class: 'kicker' }, 'Semana ' + s.numero + ' · ' + s.categoria),
        h('h1', { id: 'tit-semana' }, s.tema),
        h('div', { class: 'dots', role: 'img', 'aria-label': s.capsulas.filter(c => c.estado === 'completada').length + ' de 5 cápsulas completadas' },
          s.capsulas.map(c => h('span', { class: 'dot ' + (c.estado === 'completada' ? 'done' : c.estado === 'hoy' ? 'today' : '') }))),
        hoy
          ? [h('p', { class: 'small', style: 'opacity:.85;position:relative' }, (hoy.estado === 'hoy' ? 'Cápsula de hoy · ' : 'Pendiente · ') + hoy.nombre),
            h('a', { class: 'btn primary', href: '#capsula/' + encodeURIComponent(hoy.id) }, hoy.titulo, icon('chevron', 'sm'))]
          : h('p', { style: 'position:relative;margin:0' }, '✔ Completó la cápsula de hoy. ¡Nos vemos mañana!')),
      pend.length ? h('a', { class: 'alert-strip' + (pend[0].prioridad === 'CRITICA' ? ' crit' : ''), href: '#alerta/' + encodeURIComponent(pend[0].id) },
        icon('alert'), h('span', { style: 'flex:1' }, (pend.length === 1 ? '1 alerta por confirmar: ' : pend.length + ' alertas por confirmar: ') + pend[0].titulo), icon('chevron', 'sm')) : null,
      (d.premios || []).slice(0, 1).map(tarjetaPremio),
      d.consejo ? [T.consejoVista(d.consejo, 'Consejo del día · 30 s'), h('p', { class: 'small' }, h('a', { href: '#consejos' }, 'Ver todos los consejos'))] : null,
      h('div', { class: 'section-title' }, h('h2', null, 'Aprenda sobre')),
      h('div', { class: 'cats' }, d.categorias.map(c => h('div', { class: 'cat' }, icon(c.icono), c.nombre))),
      d.reconocimientos.length ? [
        h('div', { class: 'section-title' }, h('h2', null, 'Reconocimientos')),
        h('div', { class: 'badges' }, d.reconocimientos.map(r => h('div', { class: 'card badge' },
          h('div', { class: 'medal' }, icon(r.icono)), h('div', { class: 'small' }, h('strong', null, r.titulo), h('br'), r.detalle)))),
        h('p', { class: 'small muted' }, 'El ganador aparece solo si autorizó que se publique su nombre.')] : null);
  });

  /** El ganador decide si su nombre se muestra a los compañeros (D-08). Por defecto, no. */
  function tarjetaPremio(p) {
    const ayuda = h('span', { class: 'small muted' });
    const casilla = h('input', { type: 'checkbox', checked: p.publico });
    const pintar = () => T.poner(ayuda, casilla.checked ? 'Sus compañeros verán su nombre y la inicial de su apellido.' : 'Su nombre no se muestra a los compañeros.');
    casilla.addEventListener('change', async () => {
      casilla.disabled = true;
      try { await T.api.reconocimientoPublico(p.id, casilla.checked); T.ui.aviso('Preferencia guardada.'); }
      catch (e) { casilla.checked = !casilla.checked; T.ui.error(e); }
      casilla.disabled = false;
      pintar();
    });
    pintar();
    return h('section', { class: 'card', style: 'border-color:var(--gold)', 'aria-labelledby': 'tit-premio' },
      h('div', { class: 'row', style: 'gap:.75rem;align-items:flex-start;flex-wrap:nowrap' },
        h('div', { class: 'medal' }, icon('gift')),
        h('div', { style: 'min-width:0' }, h('h2', { id: 'tit-premio', style: 'margin:0' }, '¡Ganó el sorteo de la semana ' + p.semana + '!'),
          h('p', { class: 'small', style: 'margin:.25rem 0 0' }, p.tema + '. El equipo de administración le contactará para entregarle el premio.'))),
      h('label', { class: 'row small', style: 'margin-top:.5rem;min-height:48px' }, casilla, 'Mostrar mi nombre en Reconocimientos'),
      ayuda);
  }
})(window.T360);
