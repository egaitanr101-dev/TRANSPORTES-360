/* TRANSPORTES 360 — Datos FICTICIOS del modo DEMO.
 * Este archivo simula lo que guardaría la base de datos. Solo se descarga en modo DEMO (ver js/api/api.js).
 * La sección "servidor" (respuestas correctas, código de activación) representa información que en
 * modo SUPABASE NUNCA llega al navegador. */
(function (T) {
  'use strict';
  const FUENTE_DEMO = 'en el modo demostración no se muestran fuentes reales. En la app aparecerá la entidad y el enlace validado por un administrador.';

  T.mockDatos = {
    usuario: { id: 'u-demo-0417', nombre: 'María Fernández', iniciales: 'MF', codigo: 'TR-0417', area: 'Distribución GAM', rol: 'COLABORADOR', privacidadAceptada: true },
    admin: {
      id: 'u-demo-admin', nombre: 'Ana Solís', rol: 'Administrador',
      permisos: ['contenido.crear_editar', 'contenido.aprobar', 'ia.generar', 'ia.configurar_proveedores', 'reportes.ver', 'sorteo.ejecutar', 'sorteo.anular', 'alerta.aprobar_critica', 'semana.cerrar', 'usuarios.gestionar', 'documentos.gestionar', 'fuentes.validar']
    },
    // Ejemplo de cápsula para precargar el editor ("Usar ejemplo"): la cápsula interactiva de la demostración
    get ejemploCapsula() {
      const c = this.capsulas['cap-47-4'];
      return {
        titulo: c.titulo, objetivo: 'Reconocer los errores más comunes que permiten que una estafa funcione.', minutos: c.minutos,
        bloques: c.bloques.filter(b => b.tipo !== 'evaluacion'),
        preguntas: [
          { texto: c.preguntas[0].texto, opciones: c.preguntas[0].opciones.map(o => o.texto), correcta: 1, explicacion: this.servidor.claves['q-47-4-1'].explicacion, retro: this.servidor.claves['q-47-4-1'].incorrecta },
          { texto: c.preguntas[1].texto, opciones: c.preguntas[1].opciones.map(o => o.texto), correcta: 1, explicacion: this.servidor.claves['q-47-4-2'].explicacion, retro: this.servidor.claves['q-47-4-2'].incorrecta }
        ]
      };
    },

    areas: [{ id: 'DIS_GAM', nombre: 'Distribución GAM' }, { id: 'RUTAS', nombre: 'Rutas rurales' }, { id: 'CEDI', nombre: 'Centro de distribución' }],

    usuarios: [
      { id: 'u-demo-principal', nombre: 'Paula Principal', codigo: null, correo: 'principal@ejemplo.test', rol: 'ADMIN_PRINCIPAL', area: null, supervisor: null, activo: true, activacion: 'SIN_CODIGO', activacion_vence: null },
      { id: 'u-demo-admin', nombre: 'Ana Solís', codigo: null, correo: 'ana.solis@ejemplo.test', rol: 'ADMIN', area: null, supervisor: null, activo: true, activacion: 'SIN_CODIGO', activacion_vence: null },
      { id: 'u-demo-super', nombre: 'Sergio Rojas', codigo: null, correo: 'sergio.rojas@ejemplo.test', rol: 'SUPERVISOR', area: 'Distribución GAM', supervisor: null, activo: true, activacion: 'SIN_CODIGO', activacion_vence: null },
      { id: 'u-demo-0417', nombre: 'María Fernández', codigo: 'TR-0417', correo: null, rol: 'COLABORADOR', area: 'Distribución GAM', supervisor: 'Sergio Rojas', activo: true, activacion: 'ACTIVADA', activacion_vence: null },
      { id: 'u-demo-0500', nombre: 'Carlos Mora', codigo: 'TR-0500', correo: null, rol: 'COLABORADOR', area: 'Distribución GAM', supervisor: 'Sergio Rojas', activo: false, activacion: 'PENDIENTE', activacion_vence: '2026-11-22T18:00:00-06:00' },
      { id: 'u-demo-0612', nombre: 'Luis Vega', codigo: 'TR-0612', correo: null, rol: 'COLABORADOR', area: 'Rutas rurales', supervisor: null, activo: false, activacion: 'SIN_CODIGO', activacion_vence: null }
    ],

    semana: {
      id: 'sem-47', numero: 47, rango: '17 al 23 de noviembre', categoria: 'Seguridad digital',
      tema: 'Prevención de estafas digitales', hoy: 4, cierre: 'domingo a las 11:59 p. m.',
      capsulas: [
        { id: 'cap-47-1', dia: 1, nombre: 'Lunes', etapa: 'Introducción', titulo: '¿Qué es una estafa digital?', puntos: 2 },
        { id: 'cap-47-2', dia: 2, nombre: 'Martes', etapa: 'Conocimiento práctico', titulo: 'Reglas de oro para proteger sus cuentas', puntos: 1 },
        { id: 'cap-47-3', dia: 3, nombre: 'Miércoles', etapa: 'Aplicación', titulo: 'Casos reales en la ruta y en la casa', puntos: 2 },
        { id: 'cap-47-4', dia: 4, nombre: 'Jueves', etapa: 'Prevención', titulo: 'Errores que nos hacen caer' },
        { id: 'cap-47-5', dia: 5, nombre: 'Viernes', etapa: 'Integración', titulo: 'Caso práctico: la semana de Don Carlos' }
      ]
    },

    capsulas: {
      'cap-47-4': {
        id: 'cap-47-4', dia: 4, etapa: 'Prevención', titulo: 'Errores que nos hacen caer', minutos: 4,
        bloques: [
          { tipo: 'portada', imagen: 'assets/img/portada-estafas.svg', alt: 'Teléfono que recibe un mensaje con un enlace sospechoso, entre una señal de peligro y un escudo de protección', titulo: 'Errores que nos hacen caer', objetivo: 'Hoy va a aprender a reconocer los errores más comunes que permiten que una estafa funcione, y cómo evitarlos.' },
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
              { t: 'Estimado cliente, ', senal: 'No dice su nombre: es un mensaje masivo.' },
              { t: 'su cuenta será suspendida en 2 horas. ' },
              { t: 'Verifique aquí: banco-seguro-cr.info/verificar ', senal: 'El enlace no es la dirección oficial del banco.' },
              { t: 'y digite su PIN y el código SMS.', senal: 'Ninguna entidad le pide su PIN o un código por mensaje.' }
            ],
            cierre: 'Cuando vea una sola de estas señales, deténgase.'
          },
          {
            tipo: 'historia', titulo: 'Luis se tomó un minuto', imagen: 'assets/img/ejemplo-luis.svg',
            alt: 'Historia en tres pasos: llega un mensaje falso, Luis se detiene a pensar, revisa en la aplicación oficial y comprueba que no había ningún aviso',
            pasos: [
              'Un sábado, a Luis le llega: "Su cuenta será suspendida. Ingrese aquí para verificar".',
              'El enlace se parece al de su banco, pero en lugar de tocarlo, se detiene.',
              'Entra a la aplicación oficial del banco: no había ningún aviso. El mensaje era falso.'
            ]
          },
          {
            tipo: 'infografia', imagen: 'assets/img/infografia-estafas.svg',
            alt: 'Infografía: 4 reglas para no caer en estafas. 1, no comparta códigos. 2, cuelgue y llame usted al número oficial. 3, confirme que el pago ingresó. 4, tómese un minuto antes de actuar.',
            compartir: 'TRANSPORTES 360 · 4 reglas para no caer en estafas: 1) No comparta códigos ni PIN. 2) Cuelgue y llame usted al número oficial. 3) Confirme que el pago ingresó. 4) Tómese un minuto antes de actuar.'
          },
          {
            tipo: 'compromiso', cierre: 'Una pausa de un minuto vale más que cualquier prisa. Cuídese y cuide a su familia.',
            opciones: ['Hoy le cuento a mi familia sobre los mensajes falsos.', 'No voy a compartir ningún código, aunque me presionen.', 'Antes de entregar, confirmo que el pago ingresó.'],
            fuente: FUENTE_DEMO
          },
          { tipo: 'evaluacion' }
        ],
        // Preguntas tal como las entrega el servidor: SIN la respuesta correcta
        preguntas: [
          {
            id: 'q-47-4-1',
            texto: 'Le llega un WhatsApp de un número que dice ser su banco. Le pide el código que acaba de recibir por mensaje de texto "para proteger su cuenta". ¿Qué hace?',
            opciones: [
              { id: 'o-1a', texto: 'Envío el código para que no bloqueen mi cuenta.' },
              { id: 'o-1b', texto: 'No comparto el código y llamo yo al número oficial del banco.' },
              { id: 'o-1c', texto: 'Le respondo preguntando si de verdad es el banco.' }
            ]
          },
          {
            id: 'q-47-4-2',
            texto: 'En una entrega, el cliente le muestra en su teléfono un comprobante de SINPE Móvil para pagar. ¿Cuál es la forma segura de actuar?',
            opciones: [
              { id: 'o-2a', texto: 'Acepto la captura si se ve oficial.' },
              { id: 'o-2b', texto: 'Confirmo que el pago ingresó, según el procedimiento de mi área, antes de entregar.' },
              { id: 'o-2c', texto: 'Le pido que me reenvíe la captura por WhatsApp.' }
            ]
          }
        ]
      }
    },

    alertas: [
      {
        id: 'al-1', version: 1, prioridad: 'ALTA', categoria: 'Seguridad digital', titulo: 'Mensajes falsos que se hacen pasar por bancos',
        publica: '2026-11-18T08:00:00-06:00', vence: '2026-11-30T18:00:00-06:00', confirmada: false,
        descripcion: 'Circulan mensajes de texto y de WhatsApp que imitan avisos bancarios con enlaces a páginas falsas.',
        riesgo: 'Robo de usuario, contraseña y códigos de verificación, con pérdida de dinero.',
        recomendaciones: ['No toque enlaces de mensajes no solicitados.', 'Entre siempre desde la aplicación oficial o escribiendo usted la dirección.', 'Si ya ingresó datos, llame de inmediato a su banco por el número oficial.'],
        fuente: FUENTE_DEMO
      },
      {
        id: 'al-2', version: 1, prioridad: 'PREVENTIVA', categoria: 'Seguridad y trabajo', titulo: 'Lluvia en carretera: más distancia de frenado',
        publica: '2026-11-11T08:00:00-06:00', vence: '2026-12-15T18:00:00-06:00', confirmada: true,
        descripcion: 'Con pavimento mojado el vehículo necesita más distancia para detenerse, sobre todo con carga.',
        riesgo: 'Colisiones por alcance y pérdida de control.',
        recomendaciones: ['Aumente la distancia con el vehículo de adelante.', 'Reduzca la velocidad antes de las curvas.', 'Encienda las luces aunque sea de día.'],
        fuente: FUENTE_DEMO
      }
    ],

    consejo: {
      id: 'con-1', categoria: 'Seguridad y trabajo', hoy: true, fuente: 'Ejemplo ficticio para la demostración', titulo: '¿Sabías que...?',
      texto: 'Las llantas con la presión correcta ayudan a frenar mejor y a gastar menos combustible. Revíselas en frío y use el valor que indica el fabricante del vehículo.',
      compartir: 'TRANSPORTES 360 · ¿Sabías que...? Las llantas con la presión correcta ayudan a frenar mejor y a gastar menos combustible.'
    },

    categorias: [
      { icono: 'shield', nombre: 'Seguridad y trabajo' }, { icono: 'heart', nombre: 'Salud y bienestar' }, { icono: 'coin', nombre: 'Educación financiera' },
      { icono: 'phone', nombre: 'Seguridad digital' }, { icono: 'family', nombre: 'Desarrollo personal' }, { icono: 'growth', nombre: 'Cultura y crecimiento' }
    ],

    reconocimientos: [
      { icono: 'gift', titulo: 'Ganador S46', detalle: 'J. Rodríguez' },
      { icono: 'star', titulo: 'Semana perfecta', detalle: 'Usted · S45' },
      { icono: 'check', titulo: 'Racha', detalle: '3 semanas completas' }
    ],

    historial: [
      { semana: 46, tema: 'Fatiga y somnolencia al volante', estado: 'Cerrada', capsulas: 5, puntos: 9, participo: true },
      { semana: 45, tema: 'Presupuesto familiar', estado: 'Cerrada', capsulas: 5, puntos: 10, participo: true, insignia: 'Semana perfecta' },
      { semana: 44, tema: 'Hidratación en jornadas largas', estado: 'Cerrada', capsulas: 4, puntos: 7, participo: false }
    ],

    // ---------- Panel ----------
    resumen: {
      titulo: 'Resumen · Semana 47', subtitulo: 'Prevención de estafas digitales · 17 al 23 de noviembre · día 4 de 5',
      kpis: [
        { valor: '79 %', etiqueta: 'Participación semanal', den: '112 de 142 colaboradores activos con ≥ 1 cápsula' },
        { valor: '61 %', etiqueta: 'Al día (4 de 4 cápsulas)', den: '87 de 142' },
        { valor: '62 %', etiqueta: 'Confirmación de la alerta activa', den: '88 de 142 · 54 pendientes' },
        { valor: 'US$ 2,40', etiqueta: 'Costo IA del mes (estimado)', den: '6 generaciones · tope US$ 20' }
      ],
      errores: [
        { pregunta: 'C2·P1 · Contraseña segura', aciertos: '54 % (58 de 107)' },
        { pregunta: 'C3·P2 · Enlace acortado', aciertos: '63 % (63 de 100)' },
        { pregunta: 'C1·P2 · Ingeniería social', aciertos: '71 % (80 de 112)' }
      ]
    },

    // Cierre y sorteo (misma forma que fn_admin_sorteo). La semana 46 ya terminó y está lista para cerrar; la 47 está en curso.
    premios: [{ id: 'rec-45', semana: 45, tema: 'Presupuesto familiar', publico: false }],
    sorteo: {
      'sem-47': { titulo: 'Prevención de estafas digitales', week_start: '2026-11-16', week_end: '2026-11-22', enCurso: true },
      'sem-46': {
        titulo: 'Fatiga y somnolencia al volante', week_start: '2026-11-09', week_end: '2026-11-15',
        base: 142, participaron: 121, completaron: 97, maximo: 9, excluidos: 2,
        elegibles: ['J. Rodríguez', 'M. Vargas', 'L. Mora', 'K. Jiménez', 'A. Rojas', 'D. Castro', 'S. Araya', 'P. Solano', 'E. Quesada', 'R. Alfaro']
          .concat(['J. Rodríguez', 'M. Vargas', 'L. Mora', 'K. Jiménez', 'A. Rojas', 'D. Castro', 'S. Araya', 'P. Solano', 'E. Quesada', 'R. Alfaro', 'J. Rodríguez', 'M. Vargas', 'L. Mora'])
          .map((nombre, i) => ({ id: 'u' + String(1000 + i * 37).padStart(5, '0'), codigo: 'TR-' + String(101 + i * 13).padStart(4, '0'), nombre, puntos: 9 }))
      }
    },

    // ---------- SOLO SERVIDOR (simulado) ----------
    servidor: {
      codigoActivacionDemo: 'DEMO-2026',
      claves: {
        'q-47-4-1': { correcta: 'o-1b', explicacion: 'Correcto. El código es la llave de su cuenta y ningún banco lo pide por mensaje. Llamar usted al número oficial es la forma segura de comprobarlo.', incorrecta: 'Esa opción le da al estafador lo que busca: el código o una conversación para presionarle. Lo seguro es no compartirlo y llamar usted al número oficial.' },
        'q-47-4-2': { correcta: 'o-2b', explicacion: 'Correcto. Una captura de pantalla se puede editar. Lo que vale es la confirmación de que el dinero ingresó.', incorrecta: 'Una captura, aunque se vea oficial o la reenvíen, no prueba que el dinero ingresó. Hay que confirmarlo según el procedimiento.' }
      }
    }
  };
})(window.T360);
