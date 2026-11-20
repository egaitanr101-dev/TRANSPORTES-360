/* TRANSPORTES 360 — Renderizador compartido de la cápsula por tarjetas (app del colaborador y vista previa del panel).
 * Bloques: portada · texto · escenario · revelar · detecta · historia · infografia · compromiso. La evaluación
 * siempre es la última tarjeta y la dibuja quien llama (opciones.evaluacion), porque la corrección es del servidor.
 * Todo el texto entra por T.h() (textContent): el contenido es dato, nunca HTML. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const SEGURA = /^(assets\/img\/[\w.-]+\.(svg|png|jpe?g|webp)|https:\/\/[\w.-]+\.supabase\.co\/storage\/[\w/%.?=&-]+)$/i;
  const img = (src, alt, w, hgt) => src && SEGURA.test(src) ? h('img', { class: 'story-img', src, alt: alt || '', width: w, height: hgt, decoding: 'async' }) : null;
  const lista = (v) => Array.isArray(v) ? v.filter(x => x != null && String(x).trim() !== '') : [];

  /** cont: elemento destino; c: { dia, etapa, minutos, bloques }; opciones: { evaluacion(caja), etiquetaFinal } */
  T.capsulaVista = function (cont, c, opciones) {
    // La evaluación siempre va al final y la agrega el renderizador (se ignora un bloque "evaluacion" explícito)
    const bloques = (c.bloques || []).filter(b => b && b.tipo !== 'evaluacion').concat([{ tipo: '__evaluacion' }]);
    let actual = 0, visto = 0;
    const voz = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const act = { escenario: null, volteadas: new Set(), detectadas: new Set(), compromisos: new Set() };

    const segmentos = h('div', { class: 'segs', role: 'tablist', 'aria-label': 'Avance de la cápsula' });
    const tarjeta = h('section', { class: 'story-card', 'aria-live': 'polite' });
    const btnAnt = h('button', { class: 'btn', onclick: () => ir(actual - 1) }, icon('back', 'sm'), 'Anterior');
    const btnSig = h('button', { class: 'btn primary', onclick: () => ir(actual + 1) });
    const btnVoz = voz ? h('button', { class: 'btn ghost small listen', onclick: escuchar, 'aria-pressed': 'false' }, icon('speaker', 'sm'), 'Escuchar') : null;

    T.limpiar(cont).append(
      h('div', { class: 'story-top' },
        h('div', { class: 'row between' }, h('span', { class: 'small muted' }, 'Día ' + c.dia + ' de 5 · ' + (c.etapa || '') + ' · ' + (c.minutos || 4) + ' min'), btnVoz || h('span')),
        segmentos),
      tarjeta,
      h('div', { class: 'story-nav' }, btnAnt, btnSig));

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
      if (cont.scrollIntoView) cont.scrollIntoView({ block: 'start' });
    }

    function pintar() {
      T.poner(segmentos, bloques.map((b, i) => h('button', {
        class: 'seg' + (i < actual ? ' done' : i === actual ? ' now' : ''), role: 'tab',
        'aria-selected': i === actual ? 'true' : 'false', 'aria-label': 'Tarjeta ' + (i + 1) + ' de ' + bloques.length,
        disabled: i > visto, onclick: () => ir(i)
      })));
      const b = bloques[actual];
      T.poner(tarjeta, (RENDER[b.tipo] || (() => [h('p', { class: 'muted' }, 'Contenido no disponible.')]))(b));
      btnAnt.disabled = actual === 0;
      btnSig.classList.toggle('hidden', actual === bloques.length - 1);
      T.poner(btnSig, actual === bloques.length - 2 ? (opciones.etiquetaFinal || 'Ir a la evaluación') : 'Siguiente', icon('chevron', 'sm'));
    }

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
        img(b.imagen, b.alt, 360, 220),
        h('h1', null, b.titulo || c.titulo || ''),
        b.objetivo ? h('p', { class: 'lead' }, b.objetivo) : null,
        h('div', { class: 'note warn small' }, icon('alert', 'sm'), ' Por su seguridad, no use la aplicación mientras conduce. Puede escuchar la cápsula con el botón "Escuchar" cuando esté detenido.')
      ],

      texto: (b) => [
        b.titulo ? h('h2', null, b.titulo) : null,
        lista(b.parrafos).map(p => h('p', null, p)),
        lista(b.puntos).length ? h('ul', { class: 'checklist' }, lista(b.puntos).map(t => h('li', null, icon('check', 'sm'), h('span', null, t)))) : null
      ],

      escenario: (b) => {
        const e = act.escenario, ops = lista(b.opciones);
        return [
          h('div', { class: 'kicker-ink' }, '¿Qué haría usted?'),
          b.mensaje ? h('div', { class: 'phone-mock' }, h('div', { class: 'msg-head' }, icon('phone', 'sm'), b.remitente || 'Mensaje'), h('div', { class: 'bubble' }, b.mensaje)) : null,
          h('p', { class: 'q' }, b.pregunta || ''),
          h('div', { class: 'choices' }, ops.map((o, i) => h('button', {
            class: 'choice' + (e === i ? (o.segura ? ' safe' : ' risky') : ''), 'aria-pressed': e === i ? 'true' : 'false',
            onclick: () => { act.escenario = i; pintar(); }
          }, o.t))),
          e != null && ops[e] ? h('div', { class: 'feedback ' + (ops[e].segura ? 'ok' : 'ko'), role: 'status' }, ops[e].reaccion || '') : null,
          h('p', { class: 'small muted' }, 'Esta actividad no cuenta para el puntaje. Es para pensar antes de seguir.')
        ];
      },

      revelar: (b) => {
        const tarjetas = lista(b.tarjetas);
        return [
          h('div', { class: 'kicker-ink' }, 'Toque cada tarjeta'),
          b.titulo ? h('h2', null, b.titulo) : null,
          h('div', { class: 'flips' }, tarjetas.map((t, i) => {
            const on = act.volteadas.has(i);
            return h('button', { class: 'flip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => { on ? act.volteadas.delete(i) : act.volteadas.add(i); pintar(); } },
              h('span', { class: 'flip-inner' },
                h('span', { class: 'flip-face front', 'aria-hidden': on ? 'true' : false }, h('span', { class: 'flip-ico bad' }, icon('x')), h('strong', null, t.error), h('span', { class: 'small' }, 'Toque para ver cómo evitarlo')),
                h('span', { class: 'flip-face back', 'aria-hidden': on ? false : 'true' }, h('span', { class: 'flip-ico good' }, icon('check')), h('span', null, t.solucion))));
          })),
          h('p', { class: 'small muted' }, act.volteadas.size + ' de ' + tarjetas.length + ' revisadas')
        ];
      },

      detecta: (b) => {
        const partes = lista(b.partes);
        const total = partes.filter(p => p.senal).length;
        const n = [...act.detectadas].length;
        return [
          h('div', { class: 'kicker-ink' }, 'Detecte las señales'),
          b.titulo ? h('h2', null, b.titulo) : null,
          h('p', null, 'Toque las ' + total + ' partes del mensaje que deberían ponerle en alerta.'),
          h('div', { class: 'phone-mock' },
            h('div', { class: 'msg-head' }, icon('phone', 'sm'), b.remitente || 'Mensaje', h('span', { class: 'chip crit', style: 'margin-left:auto' }, n + '/' + total)),
            h('div', { class: 'bubble' }, partes.map((p, i) => {
              if (!p.senal) return h('span', null, p.t + ' ');
              const marcar = () => { act.detectadas.add(i); pintar(); };
              return [h('span', {
                class: 'spot' + (act.detectadas.has(i) ? ' found' : ''), role: 'button', tabindex: '0', 'aria-pressed': act.detectadas.has(i) ? 'true' : 'false',
                onclick: marcar, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); marcar(); } }
              }, p.t), ' '];
            }))),
          h('ul', { class: 'found-list' }, partes.map((p, i) => (p.senal && act.detectadas.has(i)) ? h('li', null, icon('alert', 'sm'), h('span', null, h('strong', null, '"' + String(p.t).trim() + '": '), p.senal)) : null)),
          n >= total && total > 0 ? h('div', { class: 'feedback ok', role: 'status' }, '¡Excelente! Encontró todas las señales. ' + (b.cierre || ''))
            : h('button', { class: 'btn ghost small', onclick: () => { partes.forEach((p, i) => p.senal && act.detectadas.add(i)); pintar(); } }, 'Mostrar todas las señales')
        ];
      },

      historia: (b) => [
        h('div', { class: 'kicker-ink' }, 'Un caso real'),
        b.titulo ? h('h2', null, b.titulo) : null,
        img(b.imagen, b.alt, 360, 150),
        h('ol', { class: 'steps' }, lista(b.pasos).map(p => h('li', null, p)))
      ],

      infografia: (b) => [
        h('div', { class: 'kicker-ink' }, 'Para recordar y compartir'),
        img(b.imagen, b.alt, 360, 400),
        lista(b.puntos).length ? h('ol', { class: 'steps' }, lista(b.puntos).map(p => h('li', null, p))) : null,
        h('div', { class: 'row wrap' },
          b.compartir ? h('a', { class: 'btn wa', href: 'https://wa.me/?text=' + encodeURIComponent(b.compartir), target: '_blank', rel: 'noopener noreferrer' }, icon('share', 'sm'), 'Compartir por WhatsApp') : null,
          b.imagen && SEGURA.test(b.imagen) ? h('a', { class: 'btn', href: b.imagen, download: 'transportes360-infografia' }, 'Guardar imagen') : null)
      ],

      compromiso: (b) => [
        h('div', { class: 'kicker-ink' }, 'Mi compromiso'),
        b.cierre ? h('p', { class: 'closing' }, b.cierre) : null,
        lista(b.opciones).length ? [
          h('p', null, 'Elija lo que va a poner en práctica (opcional):'),
          h('div', { class: 'stack' }, lista(b.opciones).map((o, i) => h('label', { class: 'opt' },
            h('input', { type: 'checkbox', checked: act.compromisos.has(i), onchange: (e) => { e.target.checked ? act.compromisos.add(i) : act.compromisos.delete(i); } }),
            h('span', null, o))))] : null,
        b.fuente ? h('p', { class: 'source' }, b.fuente) : null
      ],

      __evaluacion: () => { const caja = h('div'); opciones.evaluacion(caja); return [caja]; }
    };

    pintar();
  };
})(window.T360);
