/* TRANSPORTES 360 — Panel: generador de contenido con IA.
   La IA solo produce un BORRADOR; nada se publica sin revisión y aprobación humana (MAPA_FUNCIONAL §5–6).
   Las claves de IA nunca pasan por el navegador: la generación ocurre en la Edge Function ia-generar. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  function campo(etq, control, ayuda, full) {
    return h('div', { class: 'field' + (full ? ' full' : '') }, h('label', null, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null);
  }
  function sel(nombre, opciones, valor) { return h('select', { name: nombre }, opciones.map(o => h('option', { selected: o === valor }, o))); }

  T.enrutador.registrar('generador', () => {
    const estado = h('div', { class: 'note hidden', role: 'status' });
    const boton = h('button', { class: 'btn primary', type: 'submit' }, icon('spark', 'sm'), 'Generar borrador');
    const form = h('form', { class: 'card', novalidate: true, onsubmit: generar },
      h('div', { class: 'form-grid' },
        campo('Tipo de contenido', sel('tipo', ['Capacitación semanal (5 cápsulas, 10 preguntas)', 'Alerta 360', 'Consejo breve', 'Plan de campaña'])),
        campo('Categoría', sel('categoria', ['Seguridad y trabajo', 'Salud y bienestar', 'Educación financiera', 'Seguridad digital y prevención de estafas', 'Desarrollo personal y familiar', 'Cultura y crecimiento profesional'], 'Seguridad y trabajo')),
        campo('Tema principal', h('input', { name: 'tema', value: 'Fatiga y somnolencia al volante: señales y pausas', maxlength: 140 }), '⚠ Tema similar impartido en la semana 46. Se recomienda otro enfoque o esperar 3 meses.', true),
        campo('Objetivo', h('input', { name: 'objetivo', value: 'Reconocer las señales de fatiga y saber cuándo detenerse', maxlength: 200 }), null, true),
        campo('Público objetivo', sel('publico', ['Choferes y ayudantes', 'Todo el personal', 'Supervisores'])),
        campo('Área', sel('area', ['Todas', 'Distribución GAM', 'Rutas rurales', 'Centro de distribución'])),
        campo('Nivel de dificultad', sel('dificultad', ['Básico', 'Intermedio', 'Avanzado'], 'Básico')),
        campo('Semana de publicación', h('input', { name: 'semana', type: 'week', value: '2026-W49' })),
        campo('Documentos permanentes', h('div', { class: 'doclist' },
          ['Reglamento interno de jornadas (v2)', 'Procedimiento de inspección diaria (v4)', 'Guía de conducción defensiva (v1)'].map((d, i) =>
            h('label', null, h('input', { type: 'checkbox', name: 'docs', value: d, checked: i !== 0 }), d))), 'Solo se envían a la IA los fragmentos relevantes, nunca el documento completo. Los documentos RESTRINGIDO no aparecen aquí.', true),
        campo('Documentos temporales', h('input', { name: 'temporales', type: 'file', accept: '.pdf,.docx,.xlsx,.pptx,.txt', multiple: true }), 'Solo para esta generación. Se eliminan a los 30 días y no pasan a la biblioteca.', true),
        campo('Buscar en fuentes externas', sel('externas', ['Sí, solo dominios confiables registrados (12)', 'No'])),
        campo('Proveedor y modelo', sel('modelo', ['Anthropic · claude-opus-5-5 (recomendado)', 'Anthropic · claude-sonnet-5-5 (más económico)', 'OpenAI · (se configura en la iteración 5)'])),
        campo('Estilo de comunicación', sel('estilo', ['Cercano y profesional', 'Formal', 'Motivacional'])),
        campo('Actividades de la cápsula', sel('actividades', ['Variadas: escenario, tarjetas, detectar señales', 'Solo tarjetas y escenario', 'Solo texto + evaluación'])),
        campo('Contexto e instrucciones adicionales', h('textarea', { name: 'instrucciones', maxlength: 1500, placeholder: 'Ej. incluir ejemplos de rutas largas nocturnas y turnos de madrugada.' }), 'Este texto es una instrucción para la IA: no incluya datos personales.', true)),
      h('div', { class: 'row between wrap', style: 'margin-top:1rem' },
        h('div', { class: 'small muted' }, 'Estimado: ~US$ 0,50 con claude-opus-5-5 · Tope mensual restante: US$ 17,60', h('br'), 'El costo real (tokens) se registra al terminar.'),
        boton),
      h('div', { style: 'margin-top:1rem' }, estado));

    async function generar(e) {
      e.preventDefault();
      boton.disabled = true;
      estado.classList.remove('hidden');
      try {
        const datos = { tema: form.elements.tema.value, objetivo: form.elements.objetivo.value };
        await T.api.generarBorrador(datos, (paso) => T.limpiar(estado).append(h('strong', null, 'Estado: '), paso));
        estado.append(' · ', h('a', { href: '#revision' }, 'Abrir borrador'));
      } catch (err) {
        T.limpiar(estado).append(T.ui.mensajeDe(err));
      }
      boton.disabled = false;
    }

    T.adm.marco('generador',
      h('header', null, h('div', null, h('h1', null, 'Generador de contenido con IA'), h('p', { class: 'muted', style: 'margin:0' }, 'La IA crea un borrador. Nada se publica sin revisión y aprobación humana.'))),
      T.config.modo === 'DEMO' ? h('div', { class: 'note warn', style: 'margin-bottom:1rem' }, 'Modo demostración: la generación es una simulación; no se llama a ningún proveedor de IA ni se generan costos.') : null,
      form);
  });
})(window.T360);
