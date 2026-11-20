/* TRANSPORTES 360 — Prototipo del panel administrativo (Fase 2). DATOS FICTICIOS.
   La generación con IA, la validación y el sorteo son SIMULACIONES visuales: en la aplicación real
   ocurren en el servidor (Edge Function ia-generar y fn_ejecutar_sorteo en PostgreSQL). */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const raiz = document.getElementById('admin');
  const yo = { nombre: 'Ana Solís', rol: 'Administrador' };

  const MENU = [
    ['Operación', [['resumen', 'chart', 'Resumen'], ['calendario', 'calendar', 'Calendario editorial']]],
    ['Contenido', [['generador', 'spark', 'Generador IA'], ['revision', 'audit', 'Revisión y aprobación'], ['alertas', 'alert', 'ALERTAS 360'], ['documentos', 'doc', 'Biblioteca y fuentes']]],
    ['Semana', [['sorteo', 'gift', 'Cierre y sorteo']]],
    ['Administración', [['usuarios', 'users', 'Usuarios'], ['config', 'gear', 'Proveedores IA y parámetros'], ['auditoria', 'history', 'Auditoría']]]
  ];
  const PANTALLAS = { resumen: vResumen, generador: vGenerador, revision: vRevision, sorteo: vSorteo };

  function marco(activa, ...contenido) {
    T.limpiar(raiz);
    const nav = h('nav', { 'aria-label': 'Menú del panel' });
    const sel = h('select', { 'aria-label': 'Ir a', onchange: (e) => { location.hash = '#' + e.target.value; } });
    for (const [grupo, items] of MENU) {
      nav.append(h('div', { class: 'group' }, grupo));
      const og = h('optgroup', { label: grupo });
      for (const [ruta, ic, txt] of items) {
        const lista = PANTALLAS[ruta] ? txt : txt + ' (Fase 3)';
        nav.append(h('a', { href: '#' + ruta, class: ruta === activa ? 'active' : '', 'aria-current': ruta === activa ? 'page' : false }, icon(ic, 'sm'), lista));
        og.append(h('option', { value: ruta, selected: ruta === activa }, lista));
      }
      sel.append(og);
    }
    raiz.append(
      h('aside', { class: 'side' }, h('div', { class: 'brand' }, T.logo(34), h('div', null, 'TRANSPORTES 360', h('small', null, 'PANEL ADMINISTRATIVO'))), nav,
        h('div', { class: 'group' }, 'Sesión'), h('div', { class: 'small', style: 'padding:0 .7rem' }, yo.nombre, h('br'), h('span', { style: 'opacity:.7' }, yo.rol))),
      h('div', null,
        h('div', { class: 'admin-mobile-top' }, h('div', { class: 'brand' }, T.logo(30), 'T360'), sel),
        h('main', { class: 'content' }, ...contenido)));
    window.scrollTo(0, 0);
  }

  // ---------- Resumen ----------
  function kpi(valor, etiqueta, den) {
    return h('div', { class: 'card kpi' }, h('div', { class: 'value' }, valor), h('div', { class: 'label' }, etiqueta), den ? h('div', { class: 'den' }, den) : null);
  }
  function vResumen() {
    marco('resumen',
      h('header', null, h('div', null, h('h1', null, 'Resumen · Semana 47'), h('p', { class: 'muted', style: 'margin:0' }, 'Prevención de estafas digitales · 17 al 23 de noviembre · día 4 de 5')),
        h('a', { class: 'btn primary', href: '#generador' }, icon('spark', 'sm'), 'Generar semana 49')),
      h('div', { class: 'grid4' },
        kpi('79 %', 'Participación semanal', '112 de 142 colaboradores activos con ≥ 1 cápsula'),
        kpi('61 %', 'Al día (4 de 4 cápsulas)', '87 de 142'),
        kpi('62 %', 'Confirmación de la alerta activa', '88 de 142 · 54 pendientes'),
        kpi('US$ 2,40', 'Costo IA del mes (estimado)', '6 generaciones · tope US$ 20')),
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
            h('tbody', null,
              h('tr', null, h('td', null, 'C2·P1 · Contraseña segura'), h('td', null, '54 % (58 de 107)')),
              h('tr', null, h('td', null, 'C3·P2 · Enlace acortado'), h('td', null, '63 % (63 de 100)')),
              h('tr', null, h('td', null, 'C1·P2 · Ingeniería social'), h('td', null, '71 % (80 de 112)')))),
          h('p', { class: 'small muted', style: 'margin:.6rem 0 0' }, 'Estas preguntas alimentan las sugerencias de temas del calendario.'))),
      h('p', { class: 'small muted', style: 'margin-top:1rem' }, 'Cada porcentaje muestra su numerador y su denominador. Definiciones en MAPA_FUNCIONAL §14.'));
  }

  // ---------- Generador ----------
  function campo(etq, control, ayuda, full) {
    return h('div', { class: 'field' + (full ? ' full' : '') }, h('label', null, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null);
  }
  function sel(opciones, valor) { return h('select', null, opciones.map(o => h('option', { selected: o === valor }, o))); }

  function vGenerador() {
    const estado = h('div', { class: 'note hidden', role: 'status' });
    const boton = h('button', { class: 'btn primary', type: 'submit' }, icon('spark', 'sm'), 'Generar borrador');
    const form = h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); simular(); } },
      h('div', { class: 'form-grid' },
        campo('Tipo de contenido', sel(['Capacitación semanal (5 cápsulas, 10 preguntas)', 'Alerta 360', 'Consejo breve', 'Plan de campaña'])),
        campo('Categoría', sel(['Seguridad y trabajo', 'Salud y bienestar', 'Educación financiera', 'Seguridad digital y prevención de estafas', 'Desarrollo personal y familiar', 'Cultura y crecimiento profesional'], 'Seguridad y trabajo')),
        campo('Tema principal', h('input', { value: 'Fatiga y somnolencia al volante: señales y pausas' }), '⚠ Tema similar impartido en la semana 46. Se recomienda otro enfoque o esperar 3 meses.', true),
        campo('Objetivo', h('input', { value: 'Reconocer las señales de fatiga y saber cuándo detenerse' }), null, true),
        campo('Público objetivo', sel(['Choferes y ayudantes', 'Todo el personal', 'Supervisores'])),
        campo('Área', sel(['Todas', 'Distribución GAM', 'Rutas rurales', 'Centro de distribución'])),
        campo('Nivel de dificultad', sel(['Básico', 'Intermedio', 'Avanzado'], 'Básico')),
        campo('Semana de publicación', h('input', { type: 'week', value: '2026-W49' })),
        campo('Documentos permanentes', h('div', { class: 'doclist' },
          ['Reglamento interno de jornadas (v2)', 'Procedimiento de inspección diaria (v4)', 'Guía de conducción defensiva (v1)'].map((d, i) =>
            h('label', null, h('input', { type: 'checkbox', checked: i !== 0 }), d))), 'Solo se envían a la IA los fragmentos relevantes, nunca el documento completo. Los documentos RESTRINGIDO no aparecen aquí.', true),
        campo('Documentos temporales', h('input', { type: 'file', accept: '.pdf,.docx,.xlsx,.pptx,.txt', multiple: true }), 'Solo para esta generación. Se eliminan a los 30 días y no pasan a la biblioteca.', true),
        campo('Buscar en fuentes externas', sel(['Sí, solo dominios confiables registrados (12)', 'No'])),
        campo('Proveedor y modelo', sel(['Anthropic · claude-opus-5-5 (recomendado)', 'Anthropic · claude-sonnet-5-5 (más económico)', 'OpenAI · (se configura en Fase 3)'])),
        campo('Estilo de comunicación', sel(['Cercano y profesional', 'Formal', 'Motivacional'])),
        campo('Estilo visual', sel(['Infografía simple', 'Tarjetas', 'Diagrama de pasos'])),
        campo('Contexto e instrucciones adicionales', h('textarea', { placeholder: 'Ej. incluir ejemplos de rutas largas nocturnas y turnos de madrugada.' }), 'Este texto es una instrucción para la IA: no incluya datos personales.', true)),
      h('div', { class: 'row between', style: 'margin-top:1rem;flex-wrap:wrap' },
        h('div', { class: 'small muted' }, 'Estimado: ~US$ 0,50 con claude-opus-5-5 · Tope mensual restante: US$ 17,60', h('br'), 'El costo real (tokens) se registra al terminar.'),
        boton),
      h('div', { style: 'margin-top:1rem' }, estado));

    function simular() {
      boton.disabled = true;
      const pasos = ['EN_COLA · solicitud registrada (clave de idempotencia asignada)', 'EN_GENERACION · recuperando 14 fragmentos de 2 documentos', 'EN_GENERACION · investigando en 12 dominios confiables', 'EN_GENERACION · redactando 5 cápsulas', 'VALIDANDO · estructura, claves de respuesta y fuentes', 'GENERADO · borrador listo para revisión'];
      estado.classList.remove('hidden');
      let i = 0;
      const tick = () => {
        T.limpiar(estado).append(h('strong', null, 'Estado: '), pasos[i]);
        if (++i < pasos.length) setTimeout(tick, 650);
        else { estado.append(' · ', h('a', { href: '#revision' }, 'Abrir borrador')); boton.disabled = false; }
      };
      tick();
    }

    marco('generador',
      h('header', null, h('div', null, h('h1', null, 'Generador de contenido con IA'), h('p', { class: 'muted', style: 'margin:0' }, 'La IA crea un borrador. Nada se publica sin revisión y aprobación humana.'))),
      form);
  }

  // ---------- Revisión ----------
  const borrador = {
    semana: 48, tema: 'Manejo responsable de deudas', categoria: 'Educación financiera', version: 1,
    meta: 'Generado por Anthropic · claude-opus-5-5 · 19 nov 14:32 · solicitado por Ana Solís · 41 s · 24 180 tokens de entrada / 17 950 de salida · US$ 0,46 (estimado)',
    capsulas: [
      { dia: 'Lunes', titulo: '¿Qué es una deuda y cuándo se vuelve un problema?' },
      { dia: 'Martes', titulo: 'Cómo leer las condiciones de un crédito o una tarjeta' },
      { dia: 'Miércoles', titulo: 'Casos: el préstamo rápido y la compra a plazos' },
      { dia: 'Jueves', titulo: 'Señales de sobreendeudamiento' },
      { dia: 'Viernes', titulo: 'Plan para salir de deudas, paso a paso' }
    ],
    detalle: {
      objetivo: 'Distinguir una deuda manejable de una que pone en riesgo el presupuesto familiar.',
      intro: 'Endeudarse no es malo por sí mismo: muchas familias compran casa o vehículo a crédito. El problema empieza cuando las cuotas ya no caben en el presupuesto.',
      preguntas: [
        { t: 'Rafael paga cada mes cuotas que suman casi la mitad de su salario y usa la tarjeta para comprar comida a fin de mes. ¿Qué indica esta situación?', o: ['Que administra bien su crédito.', 'Una señal de que la deuda está afectando su presupuesto.', 'Que debería pedir otro préstamo para ponerse al día.'], c: 1 },
        { t: '¿Cuál es el primer paso recomendado para saber si una deuda es manejable?', o: ['Anotar ingresos y gastos del mes, incluidas todas las cuotas.', 'Esperar a que el banco avise.', 'Pedir un aumento del límite de la tarjeta.'], c: 0 }
      ]
    }
  };

  function vRevision() {
    const cuerpo = h('div');
    let actual = 0;
    const tabs = h('div', { class: 'capsule-tabs', role: 'tablist' });
    const pintar = () => {
      T.limpiar(tabs).append(...borrador.capsulas.map((c, i) => h('button', { role: 'tab', 'aria-selected': i === actual ? 'true' : 'false', onclick: () => { actual = i; pintar(); } }, (i + 1) + ' · ' + c.dia)));
      const c = borrador.capsulas[actual];
      T.limpiar(cuerpo).append(
        h('h3', null, c.titulo),
        actual === 0 ? [
          h('p', null, h('strong', null, 'Objetivo: '), borrador.detalle.objetivo),
          h('p', null, borrador.detalle.intro),
          h('p', { class: 'small muted' }, '… desarrollo, ejemplo, recomendaciones y mensaje final (editables).'),
          borrador.detalle.preguntas.map((q, qi) => h('div', { class: 'card', style: 'margin-top:.75rem' },
            h('strong', null, 'Pregunta ' + (qi + 1) + '. '), q.t,
            h('ul', { class: 'checks', style: 'margin-top:.5rem' }, q.o.map((o, oi) => h('li', { class: oi === q.c ? 'ok' : '' }, oi === q.c ? icon('check', 'sm') : h('span', { style: 'width:18px' }), String.fromCharCode(65 + oi) + ') ' + o + (oi === q.c ? '  ← respuesta correcta' : '')))))),
          h('p', { class: 'small muted', style: 'margin-top:.6rem' }, 'Fuentes: 2 fragmentos de la "Guía de finanzas personales (v1)", pág. 4 y 7 · 1 recurso de un dominio oficial (validado).')
        ] : h('p', { class: 'muted' }, 'Contenido de la cápsula ' + (actual + 1) + ' (en el prototipo solo se detalla la cápsula 1).'));
    };
    pintar();

    const autor = true; // quien solicitó la generación es el mismo usuario → regla de cuatro ojos
    marco('revision',
      h('header', null,
        h('div', null, h('h1', null, 'Semana ' + borrador.semana + ' · ' + borrador.tema), h('p', { class: 'muted', style: 'margin:0' }, borrador.categoria + ' · versión ' + borrador.version + ' · ', h('span', { class: 'chip warn' }, 'Pendiente de revisión'))),
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          h('button', { class: 'btn' }, 'Editar (crea versión 2)'),
          h('button', { class: 'btn' }, 'Solicitar corrección'),
          h('button', { class: 'btn primary', disabled: autor, title: autor ? 'Usted solicitó esta generación: debe aprobarla otra persona' : '' }, icon('check', 'sm'), 'Aprobar y programar'))),
      autor ? h('div', { class: 'note warn', style: 'margin-bottom:1rem' }, 'Usted solicitó este borrador, así que debe aprobarlo otra persona (regla de cuatro ojos, MAPA_FUNCIONAL §6).') : null,
      h('p', { class: 'small muted' }, borrador.meta),
      h('div', { class: 'grid2' },
        h('section', { class: 'card' }, h('h2', null, 'Reporte de validación automática'),
          h('ul', { class: 'checks' },
            h('li', { class: 'ok' }, icon('check', 'sm'), '5 cápsulas, de lunes a viernes, con la etapa pedagógica correcta'),
            h('li', { class: 'ok' }, icon('check', 'sm'), '10 preguntas · 3 opciones cada una · 1 sola respuesta correcta'),
            h('li', { class: 'ok' }, icon('check', 'sm'), 'Campos obligatorios completos · longitudes aptas para teléfono'),
            h('li', { class: 'ok' }, icon('check', 'sm'), '9 de 10 fuentes verificadas (el fragmento existe y contiene la cita)'),
            h('li', { class: 'wr' }, icon('alert', 'sm'), '1 enlace no aparece en los resultados de búsqueda: marcado como no verificado (cápsula 4)'),
            h('li', { class: 'ok' }, icon('check', 'sm'), 'Sin conflictos entre documentos'))),
        h('section', { class: 'card' }, h('h2', null, 'Lista de verificación · Educación financiera'),
          h('div', { class: 'stack small' },
            ...['No recomienda productos, entidades ni inversiones específicas', 'No promete rendimientos ni resultados', 'Remite a una entidad oficial o a un profesional cuando corresponde', 'Los montos y plazos son ejemplos claramente ficticios', 'Ninguna pregunta tiene dos respuestas defendibles']
              .map(t => h('label', { class: 'row' }, h('input', { type: 'checkbox' }), t))))),
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Contenido'), tabs, cuerpo));
  }

  // ---------- Cierre y sorteo ----------
  const elegibles = Array.from({ length: 23 }, (_, i) => ({ id: 'u' + String(1000 + i * 37).padStart(5, '0'), codigo: 'TR-' + String(101 + i * 13).padStart(4, '0'), nombre: ['J. Rodríguez', 'M. Vargas', 'L. Mora', 'K. Jiménez', 'A. Rojas', 'D. Castro', 'S. Araya', 'P. Solano', 'E. Quesada', 'R. Alfaro'][i % 10] }));
  let sorteo = null;

  function vSorteo() {
    const resultado = h('div');
    const ejecutar = h('button', { class: 'btn primary', onclick: confirmar }, icon('gift', 'sm'), 'Ejecutar sorteo oficial');
    const confirmacion = h('div', { class: 'card hidden', style: 'margin-top:1rem;border-color:var(--gold)' },
      h('h3', null, '¿Ejecutar el sorteo oficial de la semana 46?'),
      h('p', { class: 'small' }, 'Se elegirá un único ganador entre los 23 empatados con 9 puntos. El resultado queda registrado y no se puede repetir. Una corrección posterior requiere anulación por el administrador principal, con motivo.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: ejecutarSorteo }, 'Sí, ejecutar'), h('button', { class: 'btn', onclick: () => confirmacion.classList.add('hidden') }, 'Cancelar')));

    function confirmar() {
      if (sorteo) { pintarResultado(true); return; }
      confirmacion.classList.remove('hidden');
    }
    async function ejecutarSorteo() {
      confirmacion.classList.add('hidden');
      const lista = elegibles.slice().sort((a, b) => a.id.localeCompare(b.id));
      const r = T.aleatorioUniforme(lista.length);
      const hash = crypto.subtle ? await T.sha256Hex(lista.map(e => e.id + ':9').join('\n')) : '(requiere https o localhost)';
      sorteo = { ganador: lista[r.indice], r, hash, fecha: new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) };
      pintarResultado(false);
    }
    function pintarResultado(repetido) {
      T.limpiar(resultado).append(
        repetido ? h('div', { class: 'note', style: 'margin:1rem 0' }, 'Ya existe un sorteo oficial para esta semana. Se muestra el resultado registrado: no se ejecutó otro.') : null,
        h('div', { class: 'winner', style: 'margin-top:1rem' },
          h('div', { class: 'small', style: 'opacity:.8' }, 'GANADOR OFICIAL · SEMANA 46'),
          h('div', { class: 'name' }, sorteo.ganador.nombre), h('div', null, sorteo.ganador.codigo + ' · 9 de 10 puntos')),
        h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Evidencia registrada'),
          h('table', { class: 't' }, h('tbody', null,
            fila('Estado', 'OFICIAL'), fila('Fecha y hora', sorteo.fecha), fila('Ejecutado por', yo.nombre),
            fila('Puntuación máxima real', '9'), fila('Empatados elegibles (n)', String(elegibles.length)),
            fila('Valor aleatorio (32 bits)', String(sorteo.r.valor) + ' · intentos: ' + sorteo.r.intentos),
            fila('Posición ganadora', String(sorteo.r.indice) + ' = valor mod n'),
            fila('SHA-256 de la lista ordenada', h('span', { class: 'mono' }, sorteo.hash)),
            fila('Algoritmo', 'v1-rejection-u32 (en producción: gen_random_bytes en PostgreSQL)')))));
      ejecutar.textContent = 'Ver sorteo registrado';
    }
    function fila(k, v) { return h('tr', null, h('th', { style: 'width:40%' }, k), h('td', null, v)); }

    marco('sorteo',
      h('header', null, h('div', null, h('h1', null, 'Cierre y sorteo · Semana 46'), h('p', { class: 'muted', style: 'margin:0' }, 'Fatiga y somnolencia al volante · cerrada el domingo 16 nov, 23:59 · ', h('span', { class: 'chip good' }, 'Resultados congelados')))),
      h('div', { class: 'grid4' },
        kpi('97', 'Completaron 5 de 5', 'de 142 activos (68 %)'),
        kpi('9', 'Puntuación máxima real', 'nadie obtuvo 10 esta semana'),
        kpi('23', 'Empatados con 9', 'misma probabilidad: 1 de 23'),
        kpi('4', 'Excluidos', 'administradores con acceso a respuestas (D-07)')),
      h('div', { class: 'note', style: 'margin-top:1rem' }, 'Reglas: solo participa quien completó las 5 evaluaciones; entran todos los que tienen la puntuación máxima real (sin mínimo fijo); sin ventaja por rapidez ni por orden; un único ganador y un único sorteo oficial por semana.'),
      h('div', { class: 'row', style: 'margin-top:1rem' }, ejecutar),
      confirmacion,
      resultado,
      h('details', { class: 'card', style: 'margin-top:1rem' }, h('summary', null, 'Lista de elegibles (23), ordenada por identificador'),
        h('table', { class: 't', style: 'margin-top:.5rem' }, h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Código'), h('th', null, 'Nombre'), h('th', null, 'Puntos'))),
          h('tbody', null, elegibles.slice().sort((a, b) => a.id.localeCompare(b.id)).map((e, i) => h('tr', null, h('td', null, i), h('td', null, e.codigo), h('td', null, e.nombre), h('td', null, '9')))))));
    if (sorteo) pintarResultado(false);
  }

  function enrutar() {
    const ruta = (location.hash || '#resumen').slice(1);
    (PANTALLAS[ruta] || (() => marco(ruta, h('h1', null, 'Pantalla prevista para la Fase 3'), h('p', { class: 'muted' }, 'En este prototipo se muestran: Resumen, Generador IA, Revisión y aprobación, y Cierre y sorteo.'))))();
  }
  window.addEventListener('hashchange', enrutar);
  enrutar();
})(window.T360);
