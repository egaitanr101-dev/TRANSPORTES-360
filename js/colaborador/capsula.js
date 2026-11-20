/* TRANSPORTES 360 — Cápsula visual e interactiva por tarjetas + evaluación.
 * La cápsula es una lista de BLOQUES (tabla capsule_blocks): portada · escenario · revelar · detecta ·
 * historia · infografia · compromiso · evaluacion. Un solo renderizador sirve para todos los temas.
 * Las actividades NO suman puntos: solo cuentan las 2 preguntas, que corrige el servidor. */
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
    historias(zona, c);
  });

  function historias(cont, c) {
    const bloques = c.bloques;
    let actual = 0, visto = 0;
    const voz = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const act = { escenario: null, volteadas: new Set(), detectadas: new Set(), compromisos: new Set() };
    const ev = { respuestas: {}, resultado: null, practica: !!c.intentoOficial, enviando: false, clave: T.uuid() };

    const segmentos = h('div', { class: 'segs', role: 'tablist', 'aria-label': 'Avance de la cápsula' });
    const tarjeta = h('section', { class: 'story-card', 'aria-live': 'polite' });
    const btnAnt = h('button', { class: 'btn', onclick: () => ir(actual - 1) }, icon('back', 'sm'), 'Anterior');
    const btnSig = h('button', { class: 'btn primary', onclick: () => ir(actual + 1) });
    const btnVoz = voz ? h('button', { class: 'btn ghost small listen', onclick: escuchar, 'aria-pressed': 'false' }, icon('speaker', 'sm'), 'Escuchar') : null;

    T.limpiar(cont).append(
      h('div', { class: 'story-top' },
        h('div', { class: 'row between' }, h('span', { class: 'small muted' }, 'Día ' + c.dia + ' de 5 · ' + c.etapa + ' · ' + c.minutos + ' min'), btnVoz),
        segmentos),
      tarjeta,
      h('div', { class: 'story-nav' }, btnAnt, btnSig));

    // Deslizar con el dedo y flechas del teclado
    let x0 = null, y0 = null;
    tarjeta.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    tarjeta.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(actual + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    cont.tabIndex = -1;
    cont.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') ir(actual + 1);
      if (e.key === 'ArrowLeft') ir(actual - 1);
    });

    function ir(i) {
      if (i < 0 || i >= bloques.length) return;
      if (voz) { voz.cancel(); btnVoz.setAttribute('aria-pressed', 'false'); }
      actual = i; visto = Math.max(visto, i);
      pintar();
      window.scrollTo(0, 0);
    }

    function pintar() {
      T.limpiar(segmentos).append(...bloques.map((b, i) => h('button', {
        class: 'seg' + (i < actual ? ' done' : i === actual ? ' now' : ''), role: 'tab',
        'aria-selected': i === actual ? 'true' : 'false', 'aria-label': 'Tarjeta ' + (i + 1) + ' de ' + bloques.length,
        disabled: i > visto, onclick: () => ir(i)
      })));
      const b = bloques[actual];
      T.poner(tarjeta, (RENDER[b.tipo] || (() => [h('p', null, 'Contenido no disponible.')]))(b));
      btnAnt.disabled = actual === 0;
      btnSig.classList.toggle('hidden', actual === bloques.length - 1);
      T.limpiar(btnSig).append(actual === bloques.length - 2 ? 'Ir a la evaluación' : 'Siguiente', icon('chevron', 'sm'));
    }

    // Lectura en voz alta con la voz del teléfono (Web Speech API): sin costo, sin librerías, sin servidor.
    function escuchar() {
      if (voz.speaking) { voz.cancel(); btnVoz.setAttribute('aria-pressed', 'false'); return; }
      const u = new SpeechSynthesisUtterance((tarjeta.innerText || '').replace(/\s+/g, ' ').trim());
      const voces = voz.getVoices();
      u.voice = voces.find(v => /^es[-_](CR|MX|US|419)/i.test(v.lang)) || voces.find(v => /^es/i.test(v.lang)) || null;
      u.lang = u.voice ? u.voice.lang : 'es-CR';
      u.rate = 0.95;
      u.onend = () => btnVoz.setAttribute('aria-pressed', 'false');
      btnVoz.setAttribute('aria-pressed', 'true');
      voz.speak(u);
    }

    const RENDER = {
      portada: (b) => [
        h('img', { class: 'story-img', src: b.imagen, alt: b.alt, width: 360, height: 220, decoding: 'async' }),
        h('h1', null, b.titulo),
        h('p', { class: 'lead' }, b.objetivo),
        h('div', { class: 'note warn small' }, icon('alert', 'sm'), ' Por su seguridad, no use la aplicación mientras conduce. Puede escuchar la cápsula con el botón "Escuchar" cuando esté detenido.')
      ],

      escenario: (b) => {
        const e = act.escenario;
        return [
          h('div', { class: 'kicker-ink' }, '¿Qué haría usted?'),
          h('div', { class: 'phone-mock' }, h('div', { class: 'msg-head' }, icon('phone', 'sm'), b.remitente), h('div', { class: 'bubble' }, b.mensaje)),
          h('p', { class: 'q' }, b.pregunta),
          h('div', { class: 'choices' }, b.opciones.map((o, i) => h('button', {
            class: 'choice' + (e === i ? (o.segura ? ' safe' : ' risky') : ''), 'aria-pressed': e === i ? 'true' : 'false',
            onclick: () => { act.escenario = i; pintar(); }
          }, o.t))),
          e != null ? h('div', { class: 'feedback ' + (b.opciones[e].segura ? 'ok' : 'ko'), role: 'status' }, b.opciones[e].reaccion) : null,
          h('p', { class: 'small muted' }, 'Esta actividad no cuenta para el puntaje. Es para pensar antes de seguir.')
        ];
      },

      revelar: (b) => [
        h('div', { class: 'kicker-ink' }, 'Toque cada tarjeta'),
        h('h2', null, b.titulo),
        h('div', { class: 'flips' }, b.tarjetas.map((t, i) => {
          const on = act.volteadas.has(i);
          return h('button', { class: 'flip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => { on ? act.volteadas.delete(i) : act.volteadas.add(i); pintar(); } },
            h('span', { class: 'flip-inner' },
              h('span', { class: 'flip-face front', 'aria-hidden': on ? 'true' : false }, h('span', { class: 'flip-ico bad' }, icon('x')), h('strong', null, t.error), h('span', { class: 'small' }, 'Toque para ver cómo evitarlo')),
              h('span', { class: 'flip-face back', 'aria-hidden': on ? false : 'true' }, h('span', { class: 'flip-ico good' }, icon('check')), h('span', null, t.solucion))));
        })),
        h('p', { class: 'small muted' }, act.volteadas.size + ' de ' + b.tarjetas.length + ' revisadas')
      ],

      detecta: (b) => {
        const total = b.partes.filter(p => p.senal).length;
        const n = act.detectadas.size;
        return [
          h('div', { class: 'kicker-ink' }, 'Detecte las señales'),
          h('h2', null, b.titulo),
          h('p', null, 'Toque las ' + total + ' partes del mensaje que deberían ponerle en alerta.'),
          h('div', { class: 'phone-mock' },
            h('div', { class: 'msg-head' }, icon('phone', 'sm'), b.remitente, h('span', { class: 'chip crit', style: 'margin-left:auto' }, n + '/' + total)),
            // Texto en línea que se puede tocar: span con rol de botón (un <button> no fluye como texto)
            h('div', { class: 'bubble' }, b.partes.map((p, i) => {
              if (!p.senal) return h('span', null, p.t);
              const marcar = () => { act.detectadas.add(i); pintar(); };
              return h('span', {
                class: 'spot' + (act.detectadas.has(i) ? ' found' : ''), role: 'button', tabindex: '0', 'aria-pressed': act.detectadas.has(i) ? 'true' : 'false',
                onclick: marcar, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marcar(); } }
              }, p.t);
            }))),
          h('ul', { class: 'found-list' }, b.partes.map((p, i) => (p.senal && act.detectadas.has(i)) ? h('li', null, icon('alert', 'sm'), h('span', null, h('strong', null, '"' + p.t.trim() + '": '), p.senal)) : null)),
          n === total ? h('div', { class: 'feedback ok', role: 'status' }, '¡Excelente! Encontró todas las señales. ' + b.cierre)
            : h('button', { class: 'btn ghost small', onclick: () => { b.partes.forEach((p, i) => p.senal && act.detectadas.add(i)); pintar(); } }, 'Mostrar todas las señales')
        ];
      },

      historia: (b) => [
        h('div', { class: 'kicker-ink' }, 'Un caso real'),
        h('h2', null, b.titulo),
        h('img', { class: 'story-img', src: b.imagen, alt: b.alt, width: 360, height: 150, decoding: 'async' }),
        h('ol', { class: 'steps' }, b.pasos.map(p => h('li', null, p)))
      ],

      infografia: (b) => [
        h('div', { class: 'kicker-ink' }, 'Para recordar y compartir'),
        h('img', { class: 'story-img', src: b.imagen, alt: b.alt, width: 360, height: 400, decoding: 'async' }),
        h('div', { class: 'row wrap' },
          h('a', { class: 'btn wa', href: 'https://wa.me/?text=' + encodeURIComponent(b.compartir), target: '_blank', rel: 'noopener noreferrer' }, icon('share', 'sm'), 'Compartir por WhatsApp'),
          h('a', { class: 'btn', href: b.imagen, download: 'transportes360-infografia.svg' }, 'Guardar imagen'))
      ],

      compromiso: (b) => [
        h('div', { class: 'kicker-ink' }, 'Mi compromiso'),
        h('p', { class: 'closing' }, b.cierre),
        h('p', null, 'Elija lo que va a poner en práctica (opcional):'),
        h('div', { class: 'stack' }, b.opciones.map((o, i) => h('label', { class: 'opt' },
          h('input', { type: 'checkbox', checked: act.compromisos.has(i), onchange: (e) => { e.target.checked ? act.compromisos.add(i) : act.compromisos.delete(i); } }),
          h('span', null, o)))),
        h('p', { class: 'source' }, b.fuente)
      ],

      evaluacion: () => { const caja = h('div'); evaluacion(caja); return [caja]; }
    };

    // ---------- Evaluación: el servidor corrige; aquí solo se muestran las opciones y la respuesta recibida ----------
    function evaluacion(caja) {
      T.limpiar(caja);
      const res = ev.resultado;
      caja.append(h('div', { class: 'row between' },
        h('h2', { style: 'margin:0' }, ev.practica ? 'Práctica (no cuenta)' : 'Evaluación'), h('span', { class: 'chip' }, c.preguntas.length + ' preguntas')));
      if (c.intentoOficial && !res) {
        caja.append(h('div', { class: 'note', style: 'margin-top:.6rem' }, 'Su resultado oficial de esta cápsula: ' + c.intentoOficial.puntaje + '/' + c.preguntas.length + '. Puede practicar las veces que quiera; no cambia su resultado.'));
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
              h('input', { type: 'radio', name: q.id, value: o.id, checked: elegida === o.id, disabled: !!res || ev.enviando, onchange: () => { ev.respuestas[q.id] = o.id; evaluacion(caja); } }),
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
            ev.enviando = true; evaluacion(caja);
            try {
              ev.resultado = await T.api.responderCapsula(c.id, ev.respuestas, ev.clave);
              if (ev.resultado.tipo === 'OFICIAL') c.intentoOficial = { puntaje: ev.resultado.puntaje };
            } catch (e) { T.ui.error(e); }
            ev.enviando = false; evaluacion(caja);
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
          h('button', { class: 'btn', onclick: () => { ev.practica = true; ev.resultado = null; ev.respuestas = {}; ev.clave = T.uuid(); evaluacion(caja); } }, 'Practicar de nuevo'),
          h('a', { class: 'btn ghost', href: '#inicio' }, 'Ir al inicio')));
    }

    pintar();
  }
})(window.T360);
