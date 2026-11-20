/* TRANSPORTES 360 — Cápsula del colaborador: tarjetas (T.capsulaVista) + evaluación corregida por el servidor.
 * Las actividades NO suman puntos: solo cuentan las 2 preguntas. Antes de la primera respuesta se pide aceptar
 * el aviso de privacidad (R-70), porque se registran datos de desempeño. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.enrutador.registrar('capsula', async (id) => {
    const r = T.limpiar(document.getElementById('app'));
    r.append(T.col.topbar(), h('main', { class: 'main' }, T.ui.cargando()));
    const c = await T.api.capsula(id);
    T.limpiar(r);
    const zona = h('main', { class: 'main story' });
    r.append(
      h('header', { class: 'topbar' },
        h('a', { class: 'avatar outline', href: '#inicio', 'aria-label': 'Cerrar cápsula' }, icon('x', 'sm')),
        h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'small', style: 'opacity:.75' }, 'Semana ' + c.semana.numero + ' · ' + c.semana.tema),
          h('strong', null, c.titulo))),
      zona);
    window.scrollTo(0, 0);
    const ev = { respuestas: {}, resultado: null, practica: !!c.intentoOficial, enviando: false, clave: T.uuid() };
    T.capsulaVista(zona, c, { evaluacion: (caja) => evaluacion(caja, c, ev) });
  });

  /** Aviso de privacidad (texto provisional hasta la revisión de Legal, R-70). Devuelve true si lo acepta. */
  function pedirPrivacidad() {
    return new Promise((resolver) => {
      const cerrar = (v) => { fondo.remove(); resolver(v); };
      const fondo = h('div', { class: 'sheet-backdrop' },
        h('div', { class: 'sheet stack', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Aviso de privacidad' },
          h('h2', null, 'Aviso de privacidad'),
          h('p', { class: 'small' }, 'Para participar, TRANSPORTES 360 registra su nombre, número de empleado, área, sus respuestas, puntajes y las alertas que confirme. Se usan para su capacitación, el sorteo semanal y reportes de la empresa.'),
          h('p', { class: 'small' }, 'Sus puntajes los ve usted y el equipo de administración. Su supervisor ve solo si participó y promedios del equipo. No se comparten fuera de la empresa.'),
          h('p', { class: 'small muted' }, 'Texto provisional, pendiente de revisión legal.'),
          h('button', { class: 'btn primary block', onclick: () => cerrar(true) }, 'Acepto'),
          h('button', { class: 'btn ghost block', onclick: () => cerrar(false) }, 'Ahora no')));
      document.body.appendChild(fondo);
    });
  }

  function evaluacion(caja, c, ev) {
    T.limpiar(caja);
    const res = ev.resultado;
    caja.append(h('div', { class: 'row between' },
      h('h2', { style: 'margin:0' }, ev.practica ? 'Práctica (no cuenta)' : 'Evaluación'), h('span', { class: 'chip' }, c.preguntas.length + ' preguntas')));
    if (c.intentoOficial && !res) {
      caja.append(h('div', { class: 'note', style: 'margin-top:.6rem' }, 'Su resultado oficial de esta cápsula: ' + c.intentoOficial.puntaje + '/' + c.preguntas.length + '. Puede practicar las veces que quiera; no cambia su resultado.'));
    } else if (!res && c.abierta === false) {
      caja.append(h('div', { class: 'note', style: 'margin-top:.6rem' }, 'La semana ya cerró: sus respuestas ahora son de práctica.'));
    } else if (!res) {
      caja.append(h('p', { class: 'small muted', style: 'margin-top:.4rem' }, 'Su primer envío es el oficial. Después puede practicar las veces que quiera, sin que cuente.'));
    }

    c.preguntas.forEach((q, i) => {
      const r = res && res.resultados.find(x => x.pregunta_id === q.id);
      const elegida = ev.respuestas[q.id];
      const bloque = h('div', { class: 'quiz-q' }, h('fieldset', null, h('legend', null, (i + 1) + '. ' + q.texto),
        q.opciones.map(o => {
          let cls = 'opt';
          if (r && o.id === r.correcta_id) cls += ' correct';
          else if (r && o.id === elegida) cls += ' wrong';
          return h('label', { class: cls },
            h('input', { type: 'radio', name: q.id, value: o.id, checked: elegida === o.id, disabled: !!res || ev.enviando, onchange: () => { ev.respuestas[q.id] = o.id; evaluacion(caja, c, ev); } }),
            h('span', null, o.texto));
        })));
      if (r) bloque.append(h('div', { class: 'feedback ' + (r.es_correcta ? 'ok' : 'ko'), role: 'status' }, h('strong', null, r.es_correcta ? '✔ ' : '✖ '), r.mensaje));
      caja.append(bloque);
    });

    if (!res) {
      const completas = c.preguntas.every(q => ev.respuestas[q.id]);
      caja.append(h('button', {
        class: 'btn primary block', style: 'margin-top:1rem', disabled: !completas || ev.enviando,
        onclick: async () => {
          const u = T.col.usuario;
          if (u && u.privacidadAceptada === false) {
            if (!(await pedirPrivacidad())) return;
            try { await T.api.aceptarPrivacidad(); u.privacidadAceptada = true; } catch (e) { T.ui.error(e); return; }
          }
          ev.enviando = true; evaluacion(caja, c, ev);
          try {
            ev.resultado = await T.api.responderCapsula(c.id, ev.respuestas, ev.clave);
            if (ev.resultado.tipo === 'OFICIAL') c.intentoOficial = { puntaje: ev.resultado.puntaje };
          } catch (e) { T.ui.error(e); }
          ev.enviando = false; evaluacion(caja, c, ev);
        }
      }, ev.enviando ? 'Enviando…' : (ev.practica ? 'Revisar mis respuestas' : 'Enviar respuestas')));
      return;
    }

    const oficial = res.tipo === 'OFICIAL';
    caja.append(
      h('div', { class: 'card score', style: 'margin-top:1rem' },
        h('div', { class: 'big' }, res.puntaje + '/' + res.total),
        h('div', null, h('strong', null, oficial ? '¡Cápsula completada!' : 'Resultado de práctica'), h('br'),
          h('span', { class: 'small muted' }, oficial ? 'Resultado oficial guardado.' : 'No modifica su resultado oficial.'))),
      h('div', { class: 'row wrap', style: 'margin-top:.75rem' },
        h('button', { class: 'btn', onclick: () => { ev.practica = true; ev.resultado = null; ev.respuestas = {}; ev.clave = T.uuid(); evaluacion(caja, c, ev); } }, 'Practicar de nuevo'),
        h('a', { class: 'btn ghost', href: '#inicio' }, 'Ir al inicio')));
  }
})(window.T360);
