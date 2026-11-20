/* TRANSPORTES 360 — Prototipo de la app del colaborador (Fase 2).
   DATOS FICTICIOS. En la aplicación real:
   - el contenido llega por fn_inicio() / fn_capsula() ya filtrado por RLS;
   - las respuestas correctas NUNCA llegan al navegador: fn_responder_capsula corrige en el servidor.
   Aquí la "clave" vive en este archivo solo para poder simular la retroalimentación. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  const usuario = { nombre: 'María Fernández', iniciales: 'MF', codigo: 'TR-0417', area: 'Distribución GAM' };

  const semana = {
    numero: 47, rango: '17 al 23 de noviembre', categoria: 'Seguridad digital',
    tema: 'Prevención de estafas digitales', hoy: 4,
    capsulas: [
      { dia: 1, nombre: 'Lunes', etapa: 'Introducción', titulo: '¿Qué es una estafa digital?', estado: 'completada', puntos: 2 },
      { dia: 2, nombre: 'Martes', etapa: 'Conocimiento práctico', titulo: 'Reglas de oro para proteger sus cuentas', estado: 'completada', puntos: 1 },
      { dia: 3, nombre: 'Miércoles', etapa: 'Aplicación', titulo: 'Casos reales en la ruta y en la casa', estado: 'completada', puntos: 2 },
      { dia: 4, nombre: 'Jueves', etapa: 'Prevención', titulo: 'Errores que nos hacen caer', estado: 'hoy', puntos: null },
      { dia: 5, nombre: 'Viernes', etapa: 'Integración', titulo: 'Caso práctico: la semana de Don Carlos', estado: 'bloqueada', puntos: null }
    ]
  };

  const capsulaHoy = {
    dia: 4, minutos: 4,
    objetivo: 'Identificar los errores más comunes que permiten que una estafa funcione y cómo evitarlos.',
    introduccion: 'Casi todas las estafas digitales tienen algo en común: buscan que actuemos rápido, sin pensar. La prisa, el miedo o una oferta demasiado buena son la puerta de entrada.',
    contenido: [
      'Compartir códigos que llegan por mensaje de texto. Ese código es la llave de su cuenta: ninguna entidad seria se lo va a pedir por WhatsApp o por teléfono.',
      'Abrir enlaces que llegan sin haberlos pedido, aunque parezcan de un banco, una tienda o una empresa de envíos.',
      'Confiar en una captura de pantalla como prueba de pago. Una imagen se puede editar en segundos.',
      'Responder bajo presión: "su cuenta será bloqueada hoy", "última oportunidad", "su familiar tuvo un accidente".'
    ],
    ejemplo: 'Un sábado, Luis recibe un mensaje: "Su cuenta será suspendida. Ingrese aquí para verificar". El enlace se parece al de su banco. En lugar de tocarlo, cierra el mensaje y entra a la aplicación oficial del banco: no había ningún aviso. El mensaje era falso.',
    recomendaciones: [
      'Si le piden un código, una contraseña o un PIN: no lo comparta. Nunca.',
      'Ante la duda, cuelgue y llame usted al número oficial (el que aparece en su tarjeta o en la página oficial).',
      'Antes de entregar mercadería, confirme que el pago ingresó, según el procedimiento de su área.',
      'Tómese un minuto. Las estafas viven de la prisa.'
    ],
    cierre: 'Una pausa de un minuto vale más que cualquier prisa. Cuídese y cuide a su familia: comparta lo que aprendió hoy.',
    fuente: 'Fuente: en el prototipo no se muestran fuentes reales. En la app aparecerá la entidad y el enlace validado.',
    // Bloques visuales e interactivos (tabla capsule_blocks). Ninguno suma puntos.
    bloques: [
      { tipo: 'portada', imagen: 'img/portada-estafas.svg', alt: 'Teléfono que recibe un mensaje con un enlace sospechoso, entre una señal de peligro y un escudo de protección', titulo: 'Errores que nos hacen caer', objetivo: 'Hoy va a aprender a reconocer los errores más comunes que permiten que una estafa funcione, y cómo evitarlos.' },
      {
        tipo: 'escenario', remitente: 'Número desconocido',
        mensaje: 'BANCO: Detectamos un ingreso irregular. Su cuenta será BLOQUEADA HOY. Envíenos el código que le llegó por SMS para protegerla.',
        pregunta: 'Antes de seguir: ¿qué haría primero?',
        opciones: [
          { t: 'Envío el código rápido, para que no me bloqueen.', segura: false, reaccion: 'Es la reacción que buscan los estafadores: la prisa. Con ese código pueden entrar a su cuenta. Siga avanzando para ver cómo evitarlo.' },
          { t: 'No respondo y llamo yo al número oficial del banco.', segura: true, reaccion: '¡Muy bien! Usted controla la llamada y el número. Así se rompe la trampa.' },
          { t: 'Le respondo para preguntar si es real.', segura: false, reaccion: 'Responder abre una conversación en la que le van a presionar. Mejor no responder y verificar usted por el canal oficial.' }
        ]
      },
      {
        tipo: 'revelar', titulo: 'Los 4 errores más comunes',
        tarjetas: [
          { error: 'Compartir códigos que llegan por mensaje', solucion: 'Ese código es la llave de su cuenta. Nadie serio se lo pide por WhatsApp o por teléfono: no lo comparta nunca.' },
          { error: 'Abrir enlaces que no pidió', solucion: 'Entre siempre desde la aplicación oficial o escribiendo usted la dirección.' },
          { error: 'Confiar en una captura de pago', solucion: 'Una imagen se edita en segundos. Confirme que el dinero ingresó, según el procedimiento de su área.' },
          { error: 'Actuar bajo presión', solucion: '"Su cuenta se bloquea hoy", "última oportunidad": la urgencia es la señal. Tómese un minuto.' }
        ]
      },
      {
        tipo: 'detecta', titulo: 'Este mensaje es falso. ¿Por qué?', remitente: '+506 8••• ••12',
        partes: [
          { t: '¡URGENTE! ', senal: 'La urgencia busca que actúe sin pensar.' },
          { t: 'Estimado cliente, ' , senal: 'No dice su nombre: es un mensaje masivo.' },
          { t: 'su cuenta será suspendida en 2 horas. ' },
          { t: 'Verifique aquí: banco-seguro-cr.info/verificar ', senal: 'El enlace no es la dirección oficial del banco.' },
          { t: 'y digite su PIN y el código SMS.', senal: 'Ninguna entidad le pide su PIN o un código por mensaje.' }
        ],
        cierre: 'Cuando vea una sola de estas señales, deténgase.'
      },
      {
        tipo: 'historia', titulo: 'Luis se tomó un minuto', imagen: 'img/ejemplo-luis.svg',
        alt: 'Historia en tres pasos: llega un mensaje falso, Luis se detiene a pensar, revisa en la aplicación oficial y comprueba que no había ningún aviso',
        pasos: [
          'Un sábado, a Luis le llega: "Su cuenta será suspendida. Ingrese aquí para verificar".',
          'El enlace se parece al de su banco, pero en lugar de tocarlo, se detiene.',
          'Entra a la aplicación oficial del banco: no había ningún aviso. El mensaje era falso.'
        ]
      },
      {
        tipo: 'infografia', imagen: 'img/infografia-estafas.svg',
        alt: 'Infografía: 4 reglas para no caer en estafas. 1, no comparta códigos. 2, cuelgue y llame usted al número oficial. 3, confirme que el pago ingresó. 4, tómese un minuto antes de actuar.',
        compartir: 'TRANSPORTES 360 · 4 reglas para no caer en estafas: 1) No comparta códigos ni PIN. 2) Cuelgue y llame usted al número oficial. 3) Confirme que el pago ingresó. 4) Tómese un minuto antes de actuar.'
      },
      {
        tipo: 'compromiso', cierre: 'Una pausa de un minuto vale más que cualquier prisa. Cuídese y cuide a su familia.',
        opciones: ['Hoy le cuento a mi familia sobre los mensajes falsos.', 'No voy a compartir ningún código, aunque me presionen.', 'Antes de entregar, confirmo que el pago ingresó.'],
        fuente: 'Fuente: en el prototipo no se muestran fuentes reales. En la app aparecerá la entidad y el enlace validado.'
      },
      { tipo: 'evaluacion' }
    ],
    preguntas: [
      {
        id: 'q1',
        texto: 'Le llega un WhatsApp de un número que dice ser su banco. Le pide el código que acaba de recibir por mensaje de texto "para proteger su cuenta". ¿Qué hace?',
        opciones: [
          { k: 'A', t: 'Envío el código para que no bloqueen mi cuenta.' },
          { k: 'B', t: 'No comparto el código y llamo yo al número oficial del banco.' },
          { k: 'C', t: 'Le respondo preguntando si de verdad es el banco.' }
        ],
        correcta: 'B',
        explicacion: 'Correcto. El código es la llave de su cuenta y ningún banco lo pide por mensaje. Llamar usted al número oficial es la forma segura de comprobarlo.',
        incorrecta: 'Esa opción le da al estafador lo que busca: el código o una conversación para presionarle. Lo seguro es no compartirlo y llamar usted al número oficial.'
      },
      {
        id: 'q2',
        texto: 'En una entrega, el cliente le muestra en su teléfono un comprobante de SINPE Móvil para pagar. ¿Cuál es la forma segura de actuar?',
        opciones: [
          { k: 'A', t: 'Acepto la captura si se ve oficial.' },
          { k: 'B', t: 'Confirmo que el pago ingresó, según el procedimiento de mi área, antes de entregar.' },
          { k: 'C', t: 'Le pido que me reenvíe la captura por WhatsApp.' }
        ],
        correcta: 'B',
        explicacion: 'Correcto. Una captura de pantalla se puede editar. Lo que vale es la confirmación de que el dinero ingresó.',
        incorrecta: 'Una captura, aunque se vea oficial o la reenvíen, no prueba que el dinero ingresó. Hay que confirmarlo según el procedimiento.'
      }
    ]
  };

  const alertas = [
    {
      id: 'a1', prioridad: 'ALTA', categoria: 'Seguridad digital', titulo: 'Mensajes falsos que se hacen pasar por bancos',
      fecha: '18 nov', vence: '30 nov', confirmada: false,
      descripcion: 'Circulan mensajes de texto y de WhatsApp que imitan avisos bancarios con enlaces a páginas falsas.',
      riesgo: 'Robo de usuario, contraseña y códigos de verificación, con pérdida de dinero.',
      recomendaciones: ['No toque enlaces de mensajes no solicitados.', 'Entre siempre desde la aplicación oficial o escribiendo usted la dirección.', 'Si ya ingresó datos, llame de inmediato a su banco por el número oficial.'],
      fuente: 'Fuente de ejemplo (prototipo). En la app: entidad oficial y enlace validado por un administrador.'
    },
    {
      id: 'a2', prioridad: 'PREVENTIVA', categoria: 'Seguridad y trabajo', titulo: 'Lluvia en carretera: más distancia de frenado',
      fecha: '11 nov', vence: '15 dic', confirmada: true,
      descripcion: 'Con pavimento mojado el vehículo necesita más distancia para detenerse, sobre todo con carga.',
      riesgo: 'Colisiones por alcance y pérdida de control.',
      recomendaciones: ['Aumente la distancia con el vehículo de adelante.', 'Reduzca la velocidad antes de las curvas.', 'Encienda las luces aunque sea de día.'],
      fuente: 'Fuente de ejemplo (prototipo).'
    }
  ];

  const consejo = {
    titulo: '¿Sabías que...?',
    texto: 'Las llantas con la presión correcta ayudan a frenar mejor y a gastar menos combustible. Revíselas en frío y use el valor que indica el fabricante del vehículo.',
    compartir: 'TRANSPORTES 360 · ¿Sabías que...? Las llantas con la presión correcta ayudan a frenar mejor y a gastar menos combustible.'
  };

  const categorias = [
    ['shield', 'Seguridad y trabajo'], ['heart', 'Salud y bienestar'], ['coin', 'Educación financiera'],
    ['phone', 'Seguridad digital'], ['family', 'Desarrollo personal'], ['growth', 'Cultura y crecimiento']
  ];

  const historial = [
    { semana: 47, tema: 'Prevención de estafas digitales', estado: 'En curso', capsulas: 3, puntos: 5 },
    { semana: 46, tema: 'Fatiga y somnolencia al volante', estado: 'Cerrada', capsulas: 5, puntos: 9 },
    { semana: 45, tema: 'Presupuesto familiar', estado: 'Cerrada', capsulas: 5, puntos: 10, insignia: 'Semana perfecta' },
    { semana: 44, tema: 'Hidratación en jornadas largas', estado: 'Cerrada', capsulas: 4, puntos: 7 }
  ];

  const estado = { respuestas: {}, enviado: false, practica: false };

  // ---------- Estructura ----------
  const raiz = document.getElementById('app');

  function topbar() {
    return h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, T.logo(34), h('div', null, 'TRANSPORTES 360', h('small', null, 'APRENDE · CUÍDATE · PROTÉGETE · CRECE'))),
      h('button', { class: 'avatar', 'aria-label': 'Mi perfil', onclick: abrirPerfil }, usuario.iniciales));
  }

  function bottomnav(activa) {
    const pend = alertas.filter(a => !a.confirmada).length;
    const it = (ruta, ic, txt, extra) => h('a', { href: '#' + ruta, class: activa === ruta ? 'active' : '', 'aria-current': activa === ruta ? 'page' : false }, icon(ic), txt, extra);
    return h('nav', { class: 'bottomnav', 'aria-label': 'Navegación principal' },
      it('inicio', 'home', 'Inicio'),
      it('semana', 'week', 'Semana'),
      it('alertas', 'bell', 'Alertas', pend ? h('span', { class: 'count', 'aria-label': pend + ' pendientes' }, pend) : null),
      it('historial', 'history', 'Mi historial'));
  }

  function pagina(activa, ...contenido) {
    T.limpiar(raiz);
    raiz.append(topbar(), h('main', { class: 'main', id: 'contenido' }, ...contenido), bottomnav(activa));
    window.scrollTo(0, 0);
  }

  // ---------- Inicio ----------
  function vistaInicio() {
    const pend = alertas.filter(a => !a.confirmada);
    const hoy = semana.capsulas[semana.hoy - 1];
    pagina('inicio',
      h('p', { class: 'muted small', style: 'margin:0' }, 'Hola, ' + usuario.nombre.split(' ')[0] + ' 👋'),
      h('section', { class: 'hero', 'aria-labelledby': 'tit-semana' },
        T.flotilla(),
        h('div', { class: 'kicker' }, 'Semana ' + semana.numero + ' · ' + semana.categoria),
        h('h1', { id: 'tit-semana' }, semana.tema),
        h('div', { class: 'dots', role: 'img', 'aria-label': '3 de 5 cápsulas completadas' },
          semana.capsulas.map(c => h('span', { class: 'dot ' + (c.estado === 'completada' ? 'done' : c.estado === 'hoy' ? 'today' : '') }))),
        h('p', { class: 'small', style: 'opacity:.85' }, 'Cápsula de hoy · ' + hoy.nombre + ' · ' + capsulaHoy.minutos + ' min'),
        h('a', { class: 'btn primary', href: '#capsula' }, hoy.titulo, icon('chevron', 'sm'))),
      pend.length ? h('button', { class: 'alert-strip', onclick: () => go('alerta/' + pend[0].id) },
        icon('alert'), h('span', { style: 'flex:1' }, pend.length + ' alerta por confirmar: ' + pend[0].titulo), icon('chevron', 'sm')) : null,
      h('section', { class: 'card tip', 'aria-labelledby': 'tit-tip' },
        h('div', { class: 'label' }, 'Consejo breve · 30 s'),
        h('h2', { id: 'tit-tip' }, consejo.titulo),
        h('p', null, consejo.texto),
        h('a', { class: 'btn wa', href: 'https://wa.me/?text=' + encodeURIComponent(consejo.compartir), target: '_blank', rel: 'noopener' }, icon('share', 'sm'), 'Compartir por WhatsApp')),
      h('div', { class: 'section-title' }, h('h2', null, 'Aprenda sobre')),
      h('div', { class: 'cats' }, categorias.map(([ic, n]) => h('div', { class: 'cat' }, icon(ic), n))),
      h('div', { class: 'section-title' }, h('h2', null, 'Reconocimientos')),
      h('div', { class: 'badges' },
        h('div', { class: 'card badge' }, h('div', { class: 'medal' }, icon('gift')), h('div', { class: 'small' }, h('strong', null, 'Ganador S46'), h('br'), 'J. Rodríguez')),
        h('div', { class: 'card badge' }, h('div', { class: 'medal' }, icon('star')), h('div', { class: 'small' }, h('strong', null, 'Semana perfecta'), h('br'), 'Usted · S45')),
        h('div', { class: 'card badge' }, h('div', { class: 'medal' }, icon('check')), h('div', { class: 'small' }, h('strong', null, 'Racha'), h('br'), '3 semanas completas'))),
      h('p', { class: 'small muted' }, 'El ganador aparece solo si autorizó que se publique su nombre.'));
  }

  // ---------- Semana ----------
  function vistaSemana() {
    pagina('semana',
      h('h1', null, 'Semana ' + semana.numero),
      h('p', { class: 'muted' }, semana.tema + ' · ' + semana.rango),
      h('ul', { class: 'list' }, semana.capsulas.map(c => {
        const cls = c.estado === 'completada' ? 'done' : c.estado === 'hoy' ? 'today' : 'locked';
        const derecha = c.estado === 'completada' ? h('span', { class: 'chip good' }, icon('check', 'sm'), 'Hecha')
          : c.estado === 'hoy' ? h('span', { class: 'chip gold' }, 'Hoy')
            : h('span', { class: 'chip' }, icon('lock', 'sm'), 'Viernes');
        const cuerpo = [h('span', { class: 'day' }, c.dia), h('span', { class: 'grow' }, h('span', { class: 'title' }, c.titulo), h('span', { class: 'small muted' }, c.nombre + ' · ' + c.etapa)), derecha];
        return h('li', null, c.estado === 'hoy' ? h('a', { class: 'item ' + cls, href: '#capsula' }, cuerpo) : h('div', { class: 'item ' + cls }, cuerpo));
      })),
      h('div', { class: 'note' }, 'Cada cápsula queda disponible hasta el domingo a las 11:59 p. m. Para participar en el sorteo hay que completar las 5.'));
  }

  // ---------- Cápsula ----------
  // Cápsula por tarjetas (diseño visual e interactivo). La versión de solo texto queda en #capsula-texto para comparar.
  function vistaCapsula() {
    const c = semana.capsulas[semana.hoy - 1];
    T.limpiar(raiz);
    const zona = h('main', { class: 'main story' });
    raiz.append(
      h('header', { class: 'topbar' },
        h('a', { class: 'avatar', href: '#inicio', 'aria-label': 'Cerrar cápsula', style: 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)' }, icon('x', 'sm')),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'small', style: 'opacity:.75' }, 'Semana ' + semana.numero + ' · ' + semana.tema), h('strong', null, c.titulo))),
      zona);
    window.scrollTo(0, 0);
    T.capsulaInteractiva(zona, { dia: c.dia, etapa: c.etapa, minutos: capsulaHoy.minutos, bloques: capsulaHoy.bloques }, dibujarQuiz);
  }

  function vistaCapsulaTexto() {
    const c = semana.capsulas[semana.hoy - 1];
    const quiz = h('section', { class: 'card', 'aria-labelledby': 'tit-eval' });
    pagina('semana',
      h('a', { class: 'back', href: '#inicio' }, icon('back', 'sm'), 'Volver'),
      h('article', { class: 'stack' },
        h('header', { class: 'capsule-head' },
          h('div', { class: 'meta' }, h('span', { class: 'chip gold' }, 'Día ' + c.dia + ' de 5'), h('span', { class: 'chip' }, c.etapa), h('span', { class: 'chip' }, icon('clock', 'sm'), capsulaHoy.minutos + ' min')),
          h('h1', null, c.titulo)),
        h('div', { class: 'card' }, h('div', { class: 'block-label' }, 'Objetivo'), h('p', { style: 'margin:0' }, capsulaHoy.objetivo)),
        h('p', null, capsulaHoy.introduccion),
        h('div', null, h('h2', null, 'Los errores más comunes'),
          h('ul', { class: 'checklist' }, capsulaHoy.contenido.map(t => h('li', null, icon('alert', 'sm'), h('span', null, t))))),
        h('div', { class: 'example' }, h('div', { class: 'block-label' }, 'Ejemplo'), h('p', { style: 'margin:0' }, capsulaHoy.ejemplo)),
        h('div', null, h('h2', null, 'Recomendaciones'),
          h('ul', { class: 'checklist' }, capsulaHoy.recomendaciones.map(t => h('li', null, icon('check', 'sm'), h('span', null, t))))),
        h('p', { class: 'closing' }, capsulaHoy.cierre),
        h('p', { class: 'source' }, capsulaHoy.fuente)),
      quiz);
    dibujarQuiz(quiz);
  }

  function dibujarQuiz(cont) {
    T.limpiar(cont);
    const enviado = estado.enviado;
    cont.append(
      h('div', { class: 'row between' }, h('h2', { id: 'tit-eval', style: 'margin:0' }, estado.practica ? 'Práctica (no cuenta)' : 'Evaluación'), h('span', { class: 'chip' }, '2 preguntas')),
      !enviado && !estado.practica ? h('p', { class: 'small muted', style: 'margin-top:.4rem' }, 'Su primer envío es el oficial. Después puede practicar las veces que quiera, sin que cuente.') : null);

    capsulaHoy.preguntas.forEach((q, i) => {
      const elegida = estado.respuestas[q.id];
      const fs = h('fieldset', null, h('legend', null, (i + 1) + '. ' + q.texto),
        q.opciones.map(o => {
          let cls = 'opt';
          if (enviado && o.k === q.correcta) cls += ' correct';
          else if (enviado && o.k === elegida) cls += ' wrong';
          return h('label', { class: cls },
            h('input', { type: 'radio', name: q.id, value: o.k, checked: elegida === o.k, disabled: enviado, onchange: () => { estado.respuestas[q.id] = o.k; dibujarQuiz(cont); } }),
            h('span', null, o.t));
        }));
      const bloque = h('div', { class: 'quiz-q' }, fs);
      if (enviado) {
        const bien = elegida === q.correcta;
        bloque.append(h('div', { class: 'feedback ' + (bien ? 'ok' : 'ko'), role: 'status' }, h('strong', null, bien ? '✔ ' : '✖ '), bien ? q.explicacion : q.incorrecta));
      }
      cont.append(bloque);
    });

    const completas = capsulaHoy.preguntas.every(q => estado.respuestas[q.id]);
    if (!enviado) {
      cont.append(h('button', {
        class: 'btn primary block', style: 'margin-top:1rem', disabled: !completas,
        onclick: () => { estado.enviado = true; if (!estado.practica) { semana.capsulas[3].estado = 'completada'; } dibujarQuiz(cont); }
      }, estado.practica ? 'Revisar mis respuestas' : 'Enviar respuestas'));
    } else {
      const pts = capsulaHoy.preguntas.filter(q => estado.respuestas[q.id] === q.correcta).length;
      if (!estado.practica) semana.capsulas[3].puntos = pts;
      cont.append(
        h('div', { class: 'card score', style: 'margin-top:1rem' },
          h('div', { class: 'big' }, pts + '/2'),
          h('div', null, h('strong', null, estado.practica ? 'Resultado de práctica' : '¡Cápsula completada!'), h('br'),
            h('span', { class: 'small muted' }, estado.practica ? 'No modifica su resultado oficial.' : 'Resultado oficial guardado. Mañana: cápsula 5.'))),
        h('div', { class: 'row', style: 'margin-top:.75rem;flex-wrap:wrap' },
          h('button', { class: 'btn', onclick: () => { estado.practica = true; estado.enviado = false; estado.respuestas = {}; dibujarQuiz(cont); } }, 'Practicar de nuevo'),
          h('a', { class: 'btn ghost', href: '#inicio' }, 'Ir al inicio')));
    }
  }

  // ---------- Alertas ----------
  function vistaAlertas() {
    pagina('alertas',
      h('h1', null, 'ALERTAS 360'),
      h('p', { class: 'muted' }, 'Información importante que no espera a la capacitación semanal.'),
      h('ul', { class: 'list' }, alertas.map(a => h('li', null,
        h('a', { class: 'item', href: '#alerta/' + a.id },
          h('span', { class: 'prio ' + a.prioridad }),
          h('span', { class: 'grow' }, h('span', { class: 'title' }, a.titulo), h('span', { class: 'small muted' }, chipPrioridadTexto(a.prioridad) + ' · ' + a.fecha + ' · vence ' + a.vence)),
          a.confirmada ? h('span', { class: 'chip good' }, icon('check', 'sm'), 'Leída') : h('span', { class: 'chip high' }, 'Confirmar'))))));
  }

  function chipPrioridadTexto(p) { return { INFORMATIVA: 'Informativa', PREVENTIVA: 'Preventiva', ALTA: 'Alta', CRITICA: 'Crítica' }[p]; }
  function chipPrioridadClase(p) { return { INFORMATIVA: 'info', PREVENTIVA: 'warn', ALTA: 'high', CRITICA: 'crit' }[p]; }

  function vistaAlerta(id) {
    const a = alertas.find(x => x.id === id);
    if (!a) return go('alertas');
    pagina('alertas',
      h('a', { class: 'back', href: '#alertas' }, icon('back', 'sm'), 'Alertas'),
      h('article', { class: 'stack' },
        h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('span', { class: 'chip ' + chipPrioridadClase(a.prioridad) }, 'Prioridad ' + chipPrioridadTexto(a.prioridad)), h('span', { class: 'chip' }, a.categoria)),
        h('h1', null, a.titulo),
        h('p', { class: 'small muted' }, 'Publicada ' + a.fecha + ' · Vigente hasta ' + a.vence),
        h('p', null, a.descripcion),
        h('div', { class: 'card' }, h('div', { class: 'block-label' }, 'Riesgo'), h('p', { style: 'margin:0' }, a.riesgo)),
        h('div', null, h('h2', null, 'Qué hacer'), h('ul', { class: 'checklist' }, a.recomendaciones.map(t => h('li', null, icon('check', 'sm'), h('span', null, t))))),
        h('p', { class: 'source' }, a.fuente),
        a.confirmada
          ? h('div', { class: 'feedback ok', role: 'status' }, '✔ Usted confirmó la lectura de esta alerta.')
          : h('button', { class: 'btn primary block', onclick: () => { a.confirmada = true; vistaAlerta(id); } }, icon('check', 'sm'), 'Confirmo que leí esta alerta'),
        h('p', { class: 'small muted' }, 'La confirmación se registra con fecha y hora. Abrir un enlace de WhatsApp no cuenta como lectura.')));
  }

  // ---------- Historial ----------
  function vistaHistorial() {
    pagina('historial',
      h('h1', null, 'Mi historial'),
      h('div', { class: 'note' }, icon('lock', 'sm'), ' Sus puntajes solo los ve usted y el equipo de administración.'),
      h('ul', { class: 'list' }, historial.map(s => h('li', null,
        h('div', { class: 'item' },
          h('span', { class: 'day' }, s.semana),
          h('span', { class: 'grow' }, h('span', { class: 'title' }, s.tema),
            h('span', { class: 'small muted' }, s.estado + ' · ' + s.capsulas + ' de 5 cápsulas' + (s.estado === 'Cerrada' ? (s.capsulas === 5 ? ' · participó en el sorteo' : ' · no participó en el sorteo') : ''))),
          h('span', { class: 'row', style: 'flex-direction:column;gap:.25rem;align-items:flex-end' },
            h('strong', null, s.puntos + '/10'),
            s.insignia ? h('span', { class: 'chip gold' }, s.insignia) : null))))),
      h('div', { class: 'card' }, h('h2', null, 'Alertas'), h('p', { style: 'margin:0' }, alertas.filter(a => a.confirmada).length + ' de ' + alertas.length + ' alertas vigentes confirmadas.')));
  }

  // ---------- Ingreso / activación ----------
  function vistaIngreso(modo) {
    T.limpiar(raiz);
    const activar = modo === 'activar';
    const tab = (m, t) => h('button', { role: 'tab', 'aria-selected': (m === 'activar') === activar ? 'true' : 'false', onclick: () => vistaIngreso(m) }, t);
    const campos = activar
      ? [
        campo('Código de empleado', 'text', 'Ej. TR-0417', 'username'),
        campo('Código de activación', 'text', '8 caracteres', 'one-time-code', 'Se lo entrega su supervisor en persona. Vence en 72 horas y sirve una sola vez.'),
        campo('Cree su contraseña', 'password', 'Mínimo 8 caracteres', 'new-password', 'No use su código de empleado ni su fecha de nacimiento.'),
        campo('Repita la contraseña', 'password', '', 'new-password')
      ]
      : [
        campo('Código de empleado', 'text', 'Ej. TR-0417', 'username'),
        campo('Contraseña', 'password', '', 'current-password')
      ];
    raiz.append(
      h('div', { class: 'topbar' }, h('div', { class: 'brand' }, T.logo(34), h('div', null, 'TRANSPORTES 360', h('small', null, 'APRENDE · CUÍDATE · PROTÉGETE · CRECE')))),
      h('main', { class: 'login stack' },
        h('div', { class: 'tabs', role: 'tablist' }, tab('ingresar', 'Ingresar'), tab('activar', 'Activar mi cuenta')),
        h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); go('inicio'); } },
          campos,
          h('button', { class: 'btn primary block', type: 'submit' }, activar ? 'Activar y entrar' : 'Ingresar')),
        !activar ? h('p', { class: 'small muted' }, '¿Olvidó su contraseña? Pídale a su supervisor un nuevo código de activación.') : null,
        h('p', { class: 'small muted' }, 'Su código de empleado lo identifica, pero no es su contraseña.')));
  }

  function campo(etiqueta, tipo, placeholder, autocomplete, ayuda) {
    const id = 'f-' + etiqueta.toLowerCase().replace(/[^a-z]+/g, '-');
    return h('div', { class: 'field' },
      h('label', { for: id }, etiqueta),
      h('input', { id, type: tipo, placeholder, autocomplete, required: true }),
      ayuda ? h('span', { class: 'hint' }, ayuda) : null);
  }

  // ---------- Perfil ----------
  function abrirPerfil() {
    const fondo = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === fondo) fondo.remove(); } },
      h('div', { class: 'sheet stack', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mi perfil' },
        h('div', { class: 'row' }, h('span', { class: 'avatar' }, usuario.iniciales), h('div', null, h('strong', null, usuario.nombre), h('br'), h('span', { class: 'small muted' }, usuario.codigo + ' · ' + usuario.area))),
        h('button', { class: 'btn block' }, 'Cambiar contraseña'),
        h('button', { class: 'btn block' }, 'Aviso de privacidad'),
        h('button', { class: 'btn navy block', onclick: () => { fondo.remove(); go('ingreso'); } }, 'Cerrar sesión'),
        h('button', { class: 'btn ghost block', onclick: () => fondo.remove() }, 'Cerrar')));
    document.body.appendChild(fondo);
  }

  // ---------- Enrutador ----------
  function go(ruta) { location.hash = '#' + ruta; }
  function enrutar() {
    const ruta = (location.hash || '#inicio').slice(1);
    const [base, param] = ruta.split('/');
    ({ inicio: vistaInicio, semana: vistaSemana, capsula: vistaCapsula, 'capsula-texto': vistaCapsulaTexto, alertas: vistaAlertas, historial: vistaHistorial, ingreso: () => vistaIngreso('ingresar'), activar: () => vistaIngreso('activar') }[base]
      || (base === 'alerta' ? () => vistaAlerta(param) : vistaInicio))();
  }
  window.addEventListener('hashchange', enrutar);
  enrutar();
})(window.T360);
