/* TRANSPORTES 360 — Cápsula visual e interactiva por tarjetas (prototipo, Fase 2).
   La cápsula es una lista de BLOQUES con un tipo y sus datos (tabla capsule_blocks en el modelo).
   El mismo renderizador sirve para cualquier tema: la IA o el administrador solo llenan los datos.
   Tipos: portada · escenario · revelar · detecta · historia · infografia · compromiso · evaluacion
   Las actividades NO suman puntos: solo cuentan las 2 preguntas de la evaluación. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  T.capsulaInteractiva = function (cont, capsula, dibujarEvaluacion) {
    const bloques = capsula.bloques;
    let actual = 0;
    let visto = 0;
    const voz = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const estado = { escenario: null, volteadas: new Set(), detectadas: new Set(), compromisos: new Set() };

    const segmentos = h('div', { class: 'segs', role: 'tablist', 'aria-label': 'Avance de la cápsula' });
    const tarjeta = h('section', { class: 'story-card', 'aria-live': 'polite' });
    const btnAnt = h('button', { class: 'btn', onclick: () => ir(actual - 1) }, icon('back', 'sm'), 'Anterior');
    const btnSig = h('button', { class: 'btn primary', onclick: () => ir(actual + 1) }, 'Siguiente', icon('chevron', 'sm'));
    const btnVoz = voz ? h('button', { class: 'btn ghost small listen', onclick: escuchar, 'aria-pressed': 'false' }, icon('speaker', 'sm'), 'Escuchar') : null;

    T.limpiar(cont).append(
      h('div', { class: 'story-top' },
        h('div', { class: 'row between' },
          h('span', { class: 'small muted' }, 'Día ' + capsula.dia + ' de 5 · ' + capsula.etapa + ' · ' + capsula.minutos + ' min'),
          btnVoz),
        segmentos),
      tarjeta,
      h('div', { class: 'story-nav' }, btnAnt, btnSig));

    // Deslizar con el dedo (horizontal) para avanzar o retroceder
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
      if (voz) { voz.cancel(); if (btnVoz) btnVoz.setAttribute('aria-pressed', 'false'); }
      actual = i;
      visto = Math.max(visto, i);
      pintar();
      cont.scrollIntoView({ block: 'start', behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    function pintar() {
      T.limpiar(segmentos).append(...bloques.map((b, i) => h('button', {
        class: 'seg' + (i < actual ? ' done' : i === actual ? ' now' : ''), role: 'tab',
        'aria-selected': i === actual ? 'true' : 'false', 'aria-label': 'Tarjeta ' + (i + 1) + ' de ' + bloques.length,
        disabled: i > visto, onclick: () => ir(i)
      })));
      const b = bloques[actual];
      T.limpiar(tarjeta).append(...(RENDER[b.tipo] || (() => [h('p', null, 'Bloque no soportado')]))(b));
      btnAnt.disabled = actual === 0;
      const esUltimo = actual === bloques.length - 1;
      btnSig.classList.toggle('hidden', esUltimo);
      if (actual === bloques.length - 2) T.limpiar(btnSig).append('Ir a la evaluación', icon('chevron', 'sm'));
      else T.limpiar(btnSig).append('Siguiente', icon('chevron', 'sm'));
    }

    // ---------- Lectura en voz alta (Web Speech API del teléfono, sin costo ni librerías) ----------
    function escuchar() {
      if (voz.speaking) { voz.cancel(); btnVoz.setAttribute('aria-pressed', 'false'); return; }
      const texto = (tarjeta.innerText || '').replace(/\s+/g, ' ').trim();
      const u = new SpeechSynthesisUtterance(texto);
      const voces = voz.getVoices();
      u.voice = voces.find(v => /^es[-_](CR|MX|US|419)/i.test(v.lang)) || voces.find(v => /^es/i.test(v.lang)) || null;
      u.lang = u.voice ? u.voice.lang : 'es-CR';
      u.rate = 0.95;
      u.onend = () => btnVoz.setAttribute('aria-pressed', 'false');
      btnVoz.setAttribute('aria-pressed', 'true');
      voz.speak(u);
    }

    // ---------- Renderizadores por tipo de bloque ----------
    const RENDER = {
      portada: (b) => [
        h('img', { class: 'story-img', src: b.imagen, alt: b.alt, width: 360, height: 220, decoding: 'async' }),
        h('h1', null, b.titulo),
        h('p', { class: 'lead' }, b.objetivo),
        h('div', { class: 'note warn small' }, icon('alert', 'sm'), ' Por su seguridad, no use la aplicación mientras conduce. Puede escuchar la cápsula con el botón "Escuchar" cuando esté detenido.')
      ],

      escenario: (b) => {
        const elegida = estado.escenario;
        return [
          h('div', { class: 'kicker-ink' }, '¿Qué haría usted?'),
          h('div', { class: 'phone-mock' }, h('div', { class: 'msg-head' }, icon('phone', 'sm'), b.remitente), h('div', { class: 'bubble' }, b.mensaje)),
          h('p', { class: 'q' }, b.pregunta),
          h('div', { class: 'choices' }, b.opciones.map((o, i) => h('button', {
            class: 'choice' + (elegida === i ? (o.segura ? ' safe' : ' risky') : ''),
            'aria-pressed': elegida === i ? 'true' : 'false',
            onclick: () => { estado.escenario = i; pintar(); }
          }, o.t))),
          elegida != null ? h('div', { class: 'feedback ' + (b.opciones[elegida].segura ? 'ok' : 'ko'), role: 'status' }, b.opciones[elegida].reaccion) : null,
          h('p', { class: 'small muted' }, 'Esta actividad no cuenta para el puntaje. Es para pensar antes de seguir.')
        ];
      },

      revelar: (b) => [
        h('div', { class: 'kicker-ink' }, 'Toque cada tarjeta'),
        h('h2', null, b.titulo),
        h('div', { class: 'flips' }, b.tarjetas.map((t, i) => {
          const vuelta = estado.volteadas.has(i);
          return h('button', {
            class: 'flip' + (vuelta ? ' on' : ''), 'aria-pressed': vuelta ? 'true' : 'false',
            onclick: () => { vuelta ? estado.volteadas.delete(i) : estado.volteadas.add(i); pintar(); }
          },
          h('span', { class: 'flip-inner' },
            h('span', { class: 'flip-face front' }, h('span', { class: 'flip-ico bad' }, icon('x')), h('strong', null, t.error), h('span', { class: 'small' }, 'Toque para ver cómo evitarlo')),
            h('span', { class: 'flip-face back' }, h('span', { class: 'flip-ico good' }, icon('check')), h('span', null, t.solucion))));
        })),
        h('p', { class: 'small muted' }, estado.volteadas.size + ' de ' + b.tarjetas.length + ' revisadas')
      ],

      detecta: (b) => {
        const total = b.partes.filter(p => p.senal).length;
        const hallas = estado.detectadas.size;
        const completo = hallas === total;
        return [
          h('div', { class: 'kicker-ink' }, 'Detecte las señales'),
          h('h2', null, b.titulo),
          h('p', null, 'Toque las ' + total + ' partes del mensaje que deberían ponerle en alerta.'),
          h('div', { class: 'phone-mock' },
            h('div', { class: 'msg-head' }, icon('phone', 'sm'), b.remitente, h('span', { class: 'chip crit', style: 'margin-left:auto' }, hallas + '/' + total)),
            // Texto en línea que se puede tocar: span con rol de botón (un <button> no fluye como texto)
            h('div', { class: 'bubble' }, b.partes.map((p, i) => {
              if (!p.senal) return h('span', null, p.t);
              const marcar = () => { estado.detectadas.add(i); pintar(); };
              return h('span', {
                class: 'spot' + (estado.detectadas.has(i) ? ' found' : ''), role: 'button', tabindex: '0',
                'aria-pressed': estado.detectadas.has(i) ? 'true' : 'false', onclick: marcar,
                onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marcar(); } }
              }, p.t);
            }))),
          h('ul', { class: 'found-list' }, b.partes.map((p, i) => (p.senal && estado.detectadas.has(i)) ? h('li', null, icon('alert', 'sm'), h('span', null, h('strong', null, '"' + p.t.trim() + '": '), p.senal)) : null)),
          completo ? h('div', { class: 'feedback ok', role: 'status' }, '¡Excelente! Encontró todas las señales. ' + b.cierre)
            : h('button', { class: 'btn ghost small', onclick: () => { b.partes.forEach((p, i) => p.senal && estado.detectadas.add(i)); pintar(); } }, 'Mostrar todas las señales')
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
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          h('a', { class: 'btn wa', href: 'https://wa.me/?text=' + encodeURIComponent(b.compartir), target: '_blank', rel: 'noopener' }, icon('share', 'sm'), 'Compartir por WhatsApp'),
          h('a', { class: 'btn', href: b.imagen, download: 'transportes360-infografia.svg' }, 'Guardar imagen'))
      ],

      compromiso: (b) => [
        h('div', { class: 'kicker-ink' }, 'Mi compromiso'),
        h('p', { class: 'closing' }, b.cierre),
        h('p', null, 'Elija lo que va a poner en práctica (opcional):'),
        h('div', { class: 'stack' }, b.opciones.map((o, i) => h('label', { class: 'opt' },
          h('input', { type: 'checkbox', checked: estado.compromisos.has(i), onchange: (e) => { e.target.checked ? estado.compromisos.add(i) : estado.compromisos.delete(i); } }),
          h('span', null, o)))),
        h('p', { class: 'source' }, b.fuente)
      ],

      evaluacion: () => {
        const caja = h('div');
        dibujarEvaluacion(caja);
        return [caja];
      }
    };

    pintar();
  };
})(window.T360);
