/* TRANSPORTES 360 — Panel: cierre y sorteo semanal (MAPA_FUNCIONAL §9).
   Un único ganador y un único sorteo oficial por semana; la ejecución es idempotente y ocurre en el servidor. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const SEMANA = 46;

  T.enrutador.registrar('sorteo', async () => {
    T.adm.cargando('sorteo');
    const d = await T.api.sorteoSemana(SEMANA);
    const resultado = h('div');
    const ejecutar = h('button', { class: 'btn primary', onclick: confirmar }, icon('gift', 'sm'), d.sorteo ? 'Ver sorteo registrado' : 'Ejecutar sorteo oficial');
    const confirmacion = h('div', { class: 'card hidden', style: 'margin-top:1rem;border-color:var(--gold)' },
      h('h3', null, '¿Ejecutar el sorteo oficial de la semana ' + d.semana + '?'),
      h('p', { class: 'small' }, 'Se elegirá un único ganador entre los ' + d.elegibles.length + ' empatados con ' + d.maximo + ' puntos. El resultado queda registrado y no se puede repetir. Una corrección posterior requiere anulación por el administrador principal, con motivo.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: correr }, 'Sí, ejecutar'), h('button', { class: 'btn', onclick: () => confirmacion.classList.add('hidden') }, 'Cancelar')));

    function confirmar() { if (d.sorteo) pintar(d.sorteo, true); else confirmacion.classList.remove('hidden'); }

    async function correr(e) {
      e.currentTarget.disabled = true;
      confirmacion.classList.add('hidden');
      try {
        const s = await T.api.ejecutarSorteo(d.semana);
        d.sorteo = s;
        pintar(s, !!s.yaExistia);
        T.limpiar(ejecutar).append(icon('gift', 'sm'), 'Ver sorteo registrado');
      } catch (err) { T.ui.error(err); }
    }

    function fila(k, v) { return h('tr', null, h('th', { style: 'width:40%' }, k), h('td', null, v)); }
    function pintar(s, repetido) {
      T.poner(resultado,
        repetido ? h('div', { class: 'note', style: 'margin:1rem 0' }, 'Ya existe un sorteo oficial para esta semana. Se muestra el resultado registrado: no se ejecutó otro.') : null,
        h('div', { class: 'winner', style: 'margin-top:1rem' },
          h('div', { class: 'small', style: 'opacity:.8' }, 'GANADOR OFICIAL · SEMANA ' + d.semana),
          h('div', { class: 'name' }, s.ganador.nombre), h('div', null, s.ganador.codigo + ' · ' + s.maximo + ' de 10 puntos')),
        h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Evidencia registrada'),
          h('table', { class: 't' }, h('tbody', null,
            fila('Estado', s.estado), fila('Fecha y hora', s.fecha), fila('Ejecutado por', s.ejecutadoPor),
            fila('Puntuación máxima real', String(s.maximo)), fila('Empatados elegibles (n)', String(s.n)),
            fila('Valor aleatorio (32 bits)', s.valor + ' · intentos: ' + s.intentos),
            fila('Posición ganadora', s.posicion + ' = valor mod n'),
            fila('SHA-256 de la lista ordenada', h('span', { class: 'mono' }, s.hash)),
            fila('Algoritmo', s.algoritmo + (T.config.modo === 'DEMO' ? ' (demostración en el navegador; en producción: gen_random_bytes en PostgreSQL)' : ''))))));
    }

    T.adm.marco('sorteo',
      h('header', null, h('div', null, h('h1', null, 'Cierre y sorteo · Semana ' + d.semana),
        h('p', { class: 'muted', style: 'margin:0' }, d.tema + ' · cerrada el ' + d.cerrada + ' · ', h('span', { class: 'chip good' }, 'Resultados congelados')))),
      h('div', { class: 'grid4' },
        T.adm.kpi(String(d.completaron), 'Completaron 5 de 5', 'de ' + d.activos + ' activos (' + Math.round(d.completaron * 100 / d.activos) + ' %)'),
        T.adm.kpi(String(d.maximo), 'Puntuación máxima real', 'sin mínimo fijo'),
        T.adm.kpi(String(d.elegibles.length), 'Empatados con ' + d.maximo, 'misma probabilidad: 1 de ' + d.elegibles.length),
        T.adm.kpi(String(d.excluidos), 'Excluidos', 'administradores con acceso a respuestas (D-07)')),
      h('div', { class: 'note', style: 'margin-top:1rem' }, 'Reglas: solo participa quien completó las 5 evaluaciones; entran todos los que tienen la puntuación máxima real; sin ventaja por rapidez ni por orden; un único ganador y un único sorteo oficial por semana.'),
      h('div', { class: 'row', style: 'margin-top:1rem' }, ejecutar),
      confirmacion,
      resultado,
      h('details', { class: 'card', style: 'margin-top:1rem' }, h('summary', null, 'Lista de elegibles (' + d.elegibles.length + '), ordenada por identificador'),
        h('table', { class: 't', style: 'margin-top:.5rem' },
          h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Código'), h('th', null, 'Nombre'), h('th', null, 'Puntos'))),
          h('tbody', null, d.elegibles.map((e, i) => h('tr', null, h('td', null, i), h('td', null, e.codigo), h('td', null, e.nombre), h('td', null, String(d.maximo))))))));
    if (d.sorteo) pintar(d.sorteo, false);
  });
})(window.T360);
