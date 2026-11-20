/* TRANSPORTES 360 — Panel: cierre y sorteo semanal (MAPA_FUNCIONAL §9).
   Todo ocurre en el servidor (fn_cerrar_semana, fn_ejecutar_sorteo, fn_anular_sorteo): aquí solo se muestra
   y se pide confirmación. Un único sorteo vigente por semana; repetir la orden devuelve el ya registrado. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);

  function partes(iso) { return String(iso || '').slice(0, 10).split('-').map(Number); }
  function fecha(iso) { const [, m, d] = partes(iso); return d + ' ' + MESES[m - 1]; }
  /** Número de semana ISO (lunes a domingo), igual que extract(week) de PostgreSQL. */
  function numSemana(iso) {
    const [a, m, d] = partes(iso);
    const t = new Date(Date.UTC(a, m - 1, d));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  }
  function hoyCR() { return new Date().toLocaleDateString('en-CA', { timeZone: T.config.zonaHoraria }); }
  function fechaHora(ts) { return ts ? new Date(ts).toLocaleString('es-CR', { timeZone: T.config.zonaHoraria, dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
  async function sha256(texto) {
    if (!(window.crypto && crypto.subtle)) return null;   // requiere https o localhost
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  }
  function fila(k, v) { return h('tr', null, h('th', { style: 'width:38%' }, k), h('td', null, v)); }

  async function accion(boton, fn, mensaje) {
    boton.disabled = true;
    try { await fn(); if (mensaje) T.ui.aviso(mensaje); T.enrutador.recargar(); }
    catch (e) { boton.disabled = false; T.ui.error(e); }
  }

  T.enrutador.registrar('sorteo', async (id) => {
    T.adm.cargando('sorteo');
    const semanas = await T.api.semanasSorteo();
    if (!semanas.length) {
      T.adm.marco('sorteo', h('header', null, h('h1', null, 'Cierre y sorteo')),
        h('div', { class: 'card' }, h('p', { style: 'margin:0' }, 'Todavía no hay semanas publicadas. Cuando una semana aprobada termine (domingo 11:59 p. m.), aquí podrá cerrarla y ejecutar su sorteo.')));
      return;
    }
    const hoy = hoyCR();
    const elegida = semanas.find(s => s.id === id) || semanas.find(s => s.week_end < hoy) || semanas[0];
    const d = await T.api.sorteoSemana(elegida.id);
    const w = d.semana;
    const n = numSemana(w.week_start);
    const s = d.sorteo;

    const selector = h('select', { 'aria-label': 'Semana', style: 'max-width:100%', onchange: (e) => T.enrutador.ir('sorteo/' + e.target.value) },
      semanas.map(x => h('option', { value: x.id, selected: x.id === elegida.id },
        'Semana ' + numSemana(x.week_start) + ' · ' + fecha(x.week_start) + ' al ' + fecha(x.week_end) + ' · ' + x.titulo)));
    const chip = w.cerrada ? h('span', { class: 'chip good' }, 'Cerrada · resultados congelados')
      : w.puede_cerrar ? h('span', { class: 'chip gold' }, 'Terminó · lista para cerrar')
      : h('span', { class: 'chip' }, 'En curso');

    const cuerpo = [];
    if (!w.cerrada && !w.puede_cerrar) {
      cuerpo.push(h('div', { class: 'note' }, 'Esta semana termina el domingo ' + fecha(w.week_end) + ' a las 11:59 p. m. El cierre y el sorteo se habilitan a partir del lunes siguiente.'));
    }
    if (w.puede_cerrar) {
      const b = h('button', { class: 'btn primary', disabled: !puede('semana.cerrar') }, icon('lock', 'sm'), 'Cerrar semana');
      b.addEventListener('click', () => {
        if (window.confirm('¿Cerrar la semana ' + n + '? Se congelan los resultados de todos los colaboradores y ya no se aceptan respuestas oficiales.')) {
          accion(b, () => T.api.cerrarSemana(w.id), 'Semana cerrada. Resultados congelados.');
        }
      });
      cuerpo.push(h('section', { class: 'card' }, h('h2', null, 'Paso 1 · Cerrar la semana'),
        h('p', null, 'Al cerrar se calculan y congelan los resultados: cápsulas completadas, puntos y quién participa en el sorteo. Después ya no cambian.'),
        b));
    }
    if (w.cerrada) {
      const pct = d.base ? Math.round(d.completaron * 100 / d.base) : 0;
      cuerpo.push(h('div', { class: 'grid4' },
        T.adm.kpi(String(d.completaron), 'Completaron 5 de 5', 'de ' + d.base + ' colaboradores (' + pct + ' %) · ' + d.participaron + ' hicieron al menos 1'),
        T.adm.kpi(d.maximo == null ? '—' : String(d.maximo), 'Puntuación máxima real', 'sin mínimo fijo'),
        T.adm.kpi(String(d.elegibles.length), d.maximo == null ? 'Participantes' : 'Empatados con ' + d.maximo, d.elegibles.length ? 'misma probabilidad: 1 de ' + d.elegibles.length : 'sorteo desierto'),
        T.adm.kpi(String(d.excluidos), 'Completaron sin participar', 'inactivos o con acceso a respuestas (D-07)')));
      cuerpo.push(h('div', { class: 'note', style: 'margin-top:1rem' }, 'Reglas: solo participa quien completó las 5 evaluaciones; entran todos los que tienen la puntuación máxima real; sin ventaja por rapidez ni por orden; un único ganador y un único sorteo vigente por semana.'));
      if (!s) cuerpo.push(bloqueEjecutar(d, n));
      else cuerpo.push(bloqueSorteo(d, s, n));
      cuerpo.push(h('details', { class: 'card', style: 'margin-top:1rem' },
        h('summary', null, 'Lista de participantes (' + d.elegibles.length + '), ordenada por identificador'),
        d.elegibles.length ? h('table', { class: 't', style: 'margin-top:.5rem' },
          h('thead', null, h('tr', null, h('th', null, 'Posición'), h('th', null, 'Código'), h('th', null, 'Nombre'), h('th', null, 'Puntos'))),
          h('tbody', null, d.elegibles.map((e, i) => h('tr', null, h('td', null, String(i)), h('td', null, e.codigo || '—'), h('td', null, e.nombre), h('td', null, String(e.puntos))))))
          : h('p', { class: 'muted' }, 'Nadie completó las 5 cápsulas.')));
    }
    if (d.anulados && d.anulados.length) {
      cuerpo.push(h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Sorteos anulados'),
        h('ul', { class: 'checks' }, d.anulados.map(a => h('li', null, icon('history', 'sm'),
          h('span', null, 'Ejecutado ' + fechaHora(a.fecha) + (a.ganador ? ' (ganador: ' + a.ganador + ')' : ' (desierto)') +
            ' · anulado ' + fechaHora(a.anulado) + ' por ' + (a.anuladoPor || '—') + '. Motivo: ' + a.motivo))))));
    }

    T.adm.marco('sorteo',
      h('header', null, h('div', null, h('h1', null, 'Cierre y sorteo · Semana ' + n),
        h('p', { class: 'muted', style: 'margin:0' }, w.titulo + ' · ' + fecha(w.week_start) + ' al ' + fecha(w.week_end) + ' · ', chip))),
      h('div', { class: 'field', style: 'margin-bottom:1rem' }, h('label', null, 'Semana'), selector),
      cuerpo);
  });

  function bloqueEjecutar(d, n) {
    const cont = h('div', { style: 'margin-top:1rem' });
    const b = h('button', { class: 'btn primary', disabled: !puede('sorteo.ejecutar') }, icon('gift', 'sm'), d.elegibles.length ? 'Ejecutar sorteo oficial' : 'Registrar sorteo desierto');
    const conf = h('div', { class: 'card hidden', style: 'margin-top:1rem;border-color:var(--gold)' },
      h('h3', null, '¿Ejecutar el sorteo oficial de la semana ' + n + '?'),
      h('p', { class: 'small' }, d.elegibles.length
        ? 'Se elegirá un único ganador entre ' + (d.elegibles.length === 1 ? 'el único participante' : 'los ' + d.elegibles.length + ' empatados') + ' con ' + d.maximo + ' puntos, con bytes aleatorios del servidor. El resultado queda registrado y no se puede repetir; una corrección requiere anulación por el administrador principal, con motivo.'
        : 'Nadie completó las 5 cápsulas: el sorteo de esta semana quedará registrado como desierto.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: (e) => accion(e.currentTarget, () => T.api.ejecutarSorteo(d.semana.id), 'Sorteo registrado.') }, 'Sí, ejecutar'),
        h('button', { class: 'btn', onclick: () => conf.classList.add('hidden') }, 'Cancelar')));
    b.addEventListener('click', () => conf.classList.remove('hidden'));
    T.poner(cont, h('div', { class: 'row' }, b), conf);
    return cont;
  }

  function bloqueSorteo(d, s, n) {
    const cont = h('div');
    const bytes = s.bytes || '';
    const valor = bytes.length >= 8 ? parseInt(bytes.slice(-8), 16) : null;
    const posicion = valor == null || !s.n ? null : valor % s.n;
    const verif = h('span', { class: 'small muted' }, 'Verificando…');

    const anular = h('div');
    if (puede('sorteo.anular')) {
      const motivo = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Explique por qué se anula (mínimo 10 caracteres). Queda en la auditoría.' });
      const form = h('div', { class: 'card hidden', style: 'margin-top:1rem;border-color:var(--crit)' },
        h('h3', null, 'Anular este sorteo'),
        h('p', { class: 'small' }, 'El sorteo anulado se conserva con su evidencia. Después podrá ejecutar uno nuevo, que quedará enlazado a este.'),
        h('div', { class: 'field' }, h('label', null, 'Motivo'), motivo),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onclick: (e) => {
            if (motivo.value.trim().length < 10) { T.ui.aviso('Escriba el motivo (mínimo 10 caracteres).', 'error'); return; }
            accion(e.currentTarget, () => T.api.anularSorteo(s.id, motivo.value.trim()), 'Sorteo anulado.');
          } }, 'Anular sorteo'),
          h('button', { class: 'btn', onclick: () => form.classList.add('hidden') }, 'Cancelar')));
      T.poner(anular, h('div', { class: 'row', style: 'margin-top:1rem' },
        h('button', { class: 'btn ghost', onclick: () => form.classList.remove('hidden') }, 'Anular (procedimiento auditado)')), form);
    }

    T.poner(cont,
      s.estado === 'OFICIAL'
        ? h('div', { class: 'winner', style: 'margin-top:1rem' },
            h('div', { class: 'small', style: 'opacity:.8' }, 'GANADOR OFICIAL · SEMANA ' + n),
            h('div', { class: 'name' }, s.ganador ? s.ganador.nombre : '—'),
            h('div', null, (s.ganador && s.ganador.codigo ? s.ganador.codigo + ' · ' : '') + s.maximo + ' de 10 puntos'))
        : h('div', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Sorteo desierto'), h('p', { style: 'margin:0' }, 'Nadie completó las 5 cápsulas esta semana.')),
      s.estado === 'OFICIAL' ? h('p', { class: 'small muted' }, 'Coordine la entrega del premio. El nombre solo aparece para los compañeros en la app si la persona ganadora lo autoriza.') : null,
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Evidencia registrada'),
        h('table', { class: 't' }, h('tbody', null,
          fila('Estado', s.estado + (s.reemplaza ? ' · reemplaza un sorteo anulado' : '')),
          fila('Fecha y hora', fechaHora(s.fecha)), fila('Ejecutado por', s.ejecutadoPor || '—'),
          s.estado === 'OFICIAL' ? [
            fila('Puntuación máxima real', String(s.maximo)), fila('Participantes (n)', String(s.n)),
            fila('Bytes aleatorios del servidor', h('span', { class: 'mono' }, bytes)),
            fila('Valor usado (últimos 4 bytes)', String(valor) + (bytes.length > 8 ? ' · ' + (bytes.length / 8 - 1) + ' valor(es) descartado(s) por rechazo, sin sesgo' : '')),
            fila('Posición ganadora', String(posicion) + ' = valor mod ' + s.n),
            fila('SHA-256 de la lista ordenada', h('span', { class: 'mono' }, s.hash)),
            fila('Verificación en este navegador', verif)] : null,
          fila('Algoritmo', s.algoritmo)))),
      anular);

    if (s.estado === 'OFICIAL') {
      (async () => {
        const huella = await sha256(d.elegibles.map(e => e.id).join('\n') + '\n' + s.maximo);
        const enPos = d.elegibles[posicion];
        if (huella == null) { T.poner(verif, 'No disponible en este navegador.'); return; }
        const ok = huella === s.hash && enPos && s.ganador && enPos.codigo === s.ganador.codigo && enPos.nombre === s.ganador.nombre;
        T.poner(verif, h('span', { class: 'chip ' + (ok ? 'good' : 'crit') }, ok ? '✔ La huella y la posición coinciden con la lista' : '✖ No coincide: revise la auditoría'));
      })();
    }
    return cont;
  }
})(window.T360);
