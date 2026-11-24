/* TRANSPORTES 360 — Panel: generador de contenido con IA (iteración 5).
   La IA solo produce un BORRADOR; nada se publica sin revisión y aprobación humana (MAPA_FUNCIONAL §5–6).
   Las claves nunca pasan por el navegador: cada paso lo ejecuta la Edge Function ia-generar.
   El servidor decide si se puede gastar; aquí se pide confirmación con el costo máximo antes de empezar. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const TIPOS = { weekly_training: 'Capacitación semanal (5 cápsulas, 10 preguntas)', alert: 'Alerta 360', tip: 'Consejo breve' };
  const ESTADOS = { EN_COLA: ['', 'Sin empezar'], EN_GENERACION: ['warn', 'En proceso'], GENERADO: ['good', 'Generado: falta convertirlo'], FALLIDO: ['crit', 'Falló'], CANCELADO: ['', 'Cancelado'], CONVERTIDO: ['good', 'Convertido en borrador'] };
  const PASOS = { plan: 'Plan de la semana', dia1: 'Cápsula del lunes', dia2: 'Cápsula del martes', dia3: 'Cápsula del miércoles', dia4: 'Cápsula del jueves', dia5: 'Cápsula del viernes', alerta: 'Alerta', consejo: 'Consejo' };
  const ETAPAS = ['Introducción', 'Conocimiento práctico', 'Aplicación', 'Prevención', 'Integración'];
  const usd = (n) => 'US$ ' + Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const chip = (e) => { const [c, t] = ESTADOS[e] || ['', e]; return h('span', { class: 'chip ' + c }, t); };
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);

  let nCampo = 0;
  function campo(etq, control, ayuda, lleno) {
    control.id = 'ge-' + (++nCampo);
    return h('div', { class: 'field' + (lleno ? ' full' : '') }, h('label', { for: control.id }, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null);
  }
  const sel = (nombre, ops, valor) => h('select', { name: nombre }, ops.map(([v, t]) => h('option', { value: v, selected: v === valor }, t)));

  // ---------- Formulario y lista ----------
  T.enrutador.registrar('generador', async () => {
    T.adm.cargando('generador');
    const [est, categorias, trabajos] = await Promise.all([T.api.iaEstado(), T.api.categorias(), T.api.iaTrabajos()]);
    const modelos = est.modelos.filter(m => m.habilitado && (m.proveedor === 'simulado' || est.encendida));
    const clave = T.uuid();     // la misma mientras no se envíe: un doble toque no crea dos solicitudes
    const error = h('p', { class: 'form-error', role: 'alert' });
    const aviso = h('span', { class: 'hint' });
    const costo = h('div', { class: 'small muted' });
    const tema = h('input', { name: 'tema', type: 'text', maxlength: 140, required: true, onchange: revisarTema });
    const selTipo = sel('tipo', Object.entries(TIPOS), 'weekly_training');
    const selModelo = h('select', { name: 'modelo' }, modelos.map(m => h('option', { value: m.proveedor + '|' + m.modelo, selected: m.defecto }, m.nombre)));
    [selTipo, selModelo].forEach(x => x.addEventListener('change', pintarCosto));
    const boton = h('button', { class: 'btn primary', type: 'submit' }, icon('spark', 'sm'), 'Crear solicitud');

    const elegido = () => modelos.find(m => m.proveedor + '|' + m.modelo === selModelo.value) || {};
    function pintarCosto() {
      const m = elegido(), max = Number((m.maximo || {})[selTipo.value] || 0);
      T.poner(costo, max ? 'Costo máximo posible: ' + usd(max) + ' (lo normal es bastante menos).' : 'Sin costo: es una simulación, no llama a ningún proveedor.', h('br'),
        'Este mes: ' + usd(est.gastado_usd) + ' de ' + usd(est.mes_usd) + ' · Hoy: ' + est.trabajos_hoy + ' de ' + est.dia_trabajos + ' solicitudes.');
    }
    async function revisarTema() {
      aviso.textContent = '';
      if (tema.value.trim().length < 5) return;
      try {
        const r = await T.api.iaTemaRepetido(tema.value.trim());
        if (r.length) aviso.textContent = '⚠ Tema parecido al de la semana ' + r[0].semana + ' («' + r[0].titulo + '»). Considere otro enfoque.';
      } catch (e) { /* es solo una ayuda */ }
    }

    const form = h('form', { class: 'card', novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); error.textContent = ''; boton.disabled = true;
      const f = form.elements, m = elegido();
      try {
        const r = await T.api.iaSolicitar({ tipo: f.tipo.value, category_id: f.categoria.value, tema: f.tema.value, objetivo: f.objetivo.value, publico: f.publico.value,
          dificultad: f.dificultad.value, estilo: f.estilo.value, instrucciones: f.instrucciones.value, proveedor: m.proveedor, modelo: m.modelo }, clave);
        T.enrutador.ir('trabajo/' + r.id);
      } catch (err) { error.textContent = T.ui.mensajeDe(err); boton.disabled = false; }
    } },
      h('div', { class: 'form-grid' },
        campo('Tipo de contenido', selTipo),
        campo('Categoría', sel('categoria', categorias.filter(c => c.activa).map(c => [c.id, c.nombre]))),
        h('div', { class: 'field full' }, h('label', { for: 'ge-tema' }, 'Tema'), Object.assign(tema, { id: 'ge-tema' }), aviso),
        campo('Objetivo (opcional)', h('input', { name: 'objetivo', type: 'text', maxlength: 300 }), null, true),
        campo('Público', h('input', { name: 'publico', type: 'text', maxlength: 80, value: 'Todo el personal de transportes' })),
        campo('Nivel', sel('dificultad', [['BASICO', 'Básico'], ['INTERMEDIO', 'Intermedio'], ['AVANZADO', 'Avanzado']])),
        campo('Estilo', sel('estilo', [['CERCANO', 'Cercano y profesional'], ['FORMAL', 'Formal'], ['MOTIVACIONAL', 'Motivacional']])),
        campo('Modelo', selModelo, est.encendida ? null : 'La IA está apagada: solo está disponible la simulación.'),
        campo('Indicaciones adicionales (opcional)', h('textarea', { name: 'instrucciones', maxlength: 1500, rows: 3, placeholder: 'Ej. incluir ejemplos de rutas largas nocturnas.' }), 'Este texto se envía al proveedor de IA: no incluya nombres, correos, teléfonos ni cédulas.', true)),
      error,
      h('div', { class: 'row between wrap', style: 'margin-top:1rem' }, costo, boton));
    pintarCosto();

    T.adm.marco('generador',
      h('header', null, h('div', null, h('h1', null, 'Generador de contenido con IA'), h('p', { class: 'muted', style: 'margin:0' }, 'La IA crea un borrador. Nada se publica sin revisión y aprobación humana.'))),
      T.config.modo === 'DEMO' ? h('div', { class: 'note', style: 'margin-bottom:1rem' }, 'Modo demostración: no se llama a ningún proveedor ni se generan costos.') : null,
      est.encendida && est.claves && !est.claves.anthropic ? h('div', { class: 'note', style: 'margin-bottom:1rem' }, 'La IA está encendida, pero falta la clave de Anthropic en Supabase: las solicitudes con costo fallarán sin cobrarse.') : null,
      form,
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Solicitudes recientes'), trabajos.length
        ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Tema', 'Tipo', 'Estado', 'Costo', ''].map(x => h('th', null, x)))),
          h('tbody', null, trabajos.map(j => h('tr', null, h('td', null, h('strong', null, j.tema), h('br'), h('span', { class: 'small muted' }, j.solicitado_por + ' · ' + T.fechas.hora(j.creado))),
            h('td', null, TIPOS[j.tipo].split(' (')[0]), h('td', null, chip(j.estado), j.proveedor === 'simulado' ? h('span', { class: 'chip' }, 'Simulación') : null),
            h('td', null, usd(j.costo_usd)), h('td', null, h('a', { class: 'btn', style: 'min-height:38px', href: '#trabajo/' + encodeURIComponent(j.id) }, 'Abrir')))))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay solicitudes.')));
  });

  // ---------- Seguimiento de una solicitud ----------
  T.enrutador.registrar('trabajo', async (id) => {
    T.adm.cargando('generador');
    let [j, est] = await Promise.all([T.api.iaTrabajo(id), T.api.iaEstado()]);
    const cuerpo = h('div');
    const mensaje = h('p', { class: 'form-error', role: 'alert' });
    let corriendo = false;
    const visible = () => location.hash === '#trabajo/' + encodeURIComponent(id) || location.hash === '#trabajo/' + id;

    /** Ejecuta pasos hasta terminar o hasta el primer problema: reintentar lo decide una persona. */
    async function generar() {
      const m = est.modelos.find(x => x.proveedor === j.proveedor && x.modelo === j.modelo) || {};
      if (j.proveedor !== 'simulado' && !window.confirm('Se llamará a ' + (m.nombre || j.modelo) + ' y tendrá un costo.\nMáximo posible de toda la solicitud: ' + usd((m.maximo || {})[j.tipo]) + '.\n¿Continuar?')) return;
      corriendo = true; mensaje.textContent = ''; pintar();
      try {
        for (;;) {
          const r = await T.api.iaPaso(j.id);
          j = await T.api.iaTrabajo(id);
          if (!visible()) return;             // salió de la pantalla: se puede continuar después
          if (r.terminado || !r.ok) { if (!r.ok) mensaje.textContent = (r.errores || []).join(' · ') || 'El paso no se completó.'; break; }
          pintar();
        }
      } catch (e) {
        mensaje.textContent = T.ui.mensajeDe(e);
        try { j = await T.api.iaTrabajo(id); } catch (e2) { /* se conserva lo mostrado */ }
      }
      corriendo = false;
      if (visible()) pintar();
    }

    function verTarjetas(p, dia) {
      const marco = h('div', { class: 'telefono' });
      const fondo = h('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === fondo) fondo.remove(); } },
        h('div', { class: 'stack', style: 'max-width:420px;width:100%' },
          h('div', { class: 'row between' }, h('strong', { style: 'color:#fff' }, PASOS[p.paso]), h('button', { class: 'btn', onclick: () => fondo.remove() }, 'Cerrar')), marco));
      document.body.appendChild(fondo);
      const s = p.resultado;
      if (p.paso === 'alerta') T.poner(marco, h('article', { class: 'stack' }, T.alertaVista(Object.assign({ prioridad: 'PREVENTIVA', categoria: j.categoria, fuente: '(la agrega una persona)' }, s))));
      else if (p.paso === 'consejo') T.poner(marco, T.consejoVista(Object.assign({ categoria: j.categoria }, s)));
      else T.capsulaVista(marco, { dia, etapa: ETAPAS[dia - 1], minutos: s.minutos, titulo: s.titulo, bloques: s.bloques }, {
        evaluacion: (caja) => caja.append(h('h2', null, 'Evaluación (vista del revisor)'), ...s.preguntas.map((q, i) => h('div', { class: 'quiz-q' }, h('strong', null, (i + 1) + '. ' + q.texto),
          q.opciones.map((o, k) => h('div', { class: 'opt' + (k === q.correcta ? ' correct' : '') }, h('span', null, o + (k === q.correcta ? '  ✔ correcta' : '')))), h('div', { class: 'feedback ok' }, q.explicacion), h('div', { class: 'small muted' }, 'Si falla: ' + q.retro)))) });
    }

    function lunes() {
      const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: T.config.zonaHoraria }) + 'T12:00:00');
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7);
      return Array.from({ length: 12 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i * 7); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); });
    }
    function bloqueConvertir() {
      if (j.proveedor === 'simulado') return h('div', { class: 'note', style: 'margin-top:1rem' }, 'Es una simulación: sirve para probar el proceso y no se convierte en contenido.');
      if (!j.mio) return h('div', { class: 'note', style: 'margin-top:1rem' }, 'Solo ' + j.solicitado_por + ', quien lo pidió, puede convertirlo en borrador.');
      const semana = j.tipo === 'weekly_training' ? h('select', { 'aria-label': 'Semana' }, lunes().map(l => h('option', { value: l }, 'Semana del lunes ' + l.split('-').reverse().join('/')))) : null;
      return h('section', { class: 'card', style: 'margin-top:1rem;border-color:var(--gold)' }, h('h2', null, 'Convertir en borrador'),
        h('p', { class: 'small' }, 'Se crea como BORRADOR para corregirlo. Usted, que lo pidió, no podrá aprobarlo si hay otra persona que pueda hacerlo.'),
        semana ? h('div', { class: 'field' }, h('label', null, 'Semana de publicación'), semana) : null,
        h('div', { class: 'row', style: 'margin-top:.75rem' }, h('button', { class: 'btn primary', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true; mensaje.textContent = '';
          try {
            const r = await T.api.iaConvertir(j.id, semana ? semana.value : null);
            T.ui.aviso('Borrador creado. Revíselo y complete la fuente.');
            T.enrutador.ir(({ weekly_training: 'semana/', alert: 'alerta/', tip: 'consejo/' })[r.tipo] + r.id);
          } catch (err) { mensaje.textContent = T.ui.mensajeDe(err); b.disabled = false; }
        } }, 'Crear borrador')));
    }

    function pintar() {
      const fallo = j.pasos.find(p => p.estado === 'FALLIDO');
      const abierto = ['EN_COLA', 'EN_GENERACION'].includes(j.estado);
      const acc = [];
      if (j.mio && abierto) acc.push(h('button', { class: 'btn primary', disabled: corriendo, onclick: generar }, icon('spark', 'sm'), corriendo ? 'Generando… (hasta 2 minutos por paso)' : fallo ? 'Reintentar' : j.listos ? 'Continuar' : 'Generar'));
      if ((j.mio || puede('ia.configurar_proveedores')) && ['EN_COLA', 'EN_GENERACION', 'FALLIDO'].includes(j.estado)) acc.push(h('button', { class: 'btn ghost', disabled: corriendo, onclick: async (e) => {
        if (!window.confirm('¿Cancelar esta solicitud? Lo ya cobrado queda registrado.')) return;
        e.currentTarget.disabled = true;
        try { await T.api.iaCancelar(j.id); T.enrutador.recargar(); } catch (err) { T.ui.error(err); pintar(); }
      } }, 'Cancelar'));
      T.poner(cuerpo,
        acc.length ? h('div', { class: 'row wrap' }, acc) : null, mensaje,
        h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Pasos (' + j.listos + ' de ' + j.total + ')'),
          h('ul', { class: 'checks' }, j.pasos.map(p => h('li', null,
            icon(p.estado === 'OK' ? 'check' : p.estado === 'FALLIDO' ? 'x' : 'clock', 'sm'),
            h('span', { style: 'flex:1' }, h('strong', null, PASOS[p.paso]), p.estado === 'FALLIDO' ? h('span', { class: 'small', style: 'color:var(--crit)' }, ' · ' + p.error) : p.estado === 'EN_CURSO' ? ' · en curso' : '',
              p.costo_usd > 0 ? h('span', { class: 'small muted' }, ' · ' + usd(p.costo_usd) + (p.estimado ? ' (máximo: no se supo el consumo)' : '') + (p.intento > 1 ? ' · intento ' + p.intento : '')) : null),
            p.resultado && p.paso !== 'plan' ? h('button', { class: 'btn', style: 'min-height:38px', onclick: () => verTarjetas(p, Number(p.paso.slice(3))) }, 'Ver') : null))),
          h('p', { class: 'small muted', style: 'margin-bottom:0' }, 'Costo registrado: ' + usd(j.costo_usd) + '. Si cierra esta pantalla, puede continuar después sin repetir lo ya generado.')),
        j.informe && ['GENERADO', 'CONVERTIDO'].includes(j.estado) ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Antes de aprobar, revise'), h('ul', { class: 'checks' }, j.informe.advertencias.map(a => h('li', null, icon('alert', 'sm'), h('span', null, a))))) : null,
        j.estado === 'GENERADO' ? bloqueConvertir() : null,
        j.estado === 'CONVERTIDO' ? h('p', null, h('a', { class: 'btn', href: '#' + ({ weekly_training: 'semana/', alert: 'alerta/', tip: 'consejo/' })[j.tipo] + encodeURIComponent(j.contenido_id) }, 'Abrir el borrador')) : null);
    }

    T.adm.marco('generador',
      h('a', { class: 'back', href: '#generador' }, icon('back', 'sm'), 'Generador'),
      h('header', null, h('div', null, h('h1', null, j.tema), h('div', { class: 'row wrap' }, h('span', { class: 'chip' }, TIPOS[j.tipo].split(' (')[0]), h('span', { class: 'chip' }, j.modelo), h('span', { class: 'chip' }, 'Pedido por ' + j.solicitado_por)))),
      cuerpo);
    pintar();
  });

  // ---------- Proveedores IA y parámetros ----------
  T.enrutador.registrar('config', async () => {
    T.adm.cargando('config');
    const est = await T.api.iaEstado();
    const editable = puede('ia.configurar_proveedores');
    const mensaje = h('p', { class: 'form-error', role: 'alert' });
    const guardar = async (boton, p, aviso) => { mensaje.textContent = ''; boton.disabled = true; try { await T.api.iaConfigurar(p); T.ui.aviso(aviso); T.enrutador.recargar(); } catch (e) { mensaje.textContent = T.ui.mensajeDe(e); boton.disabled = false; window.scrollTo(0, 0); } };
    const num = (v, extra) => h('input', Object.assign({ type: 'number', min: 0, step: 'any', value: String(v), disabled: !editable }, extra || {}));
    const tope = num(est.mes_usd, { max: 500 }), dia = num(est.dia_trabajos, { max: 50, step: 1 });
    const anthropic = est.claves ? (est.claves.anthropic ? h('span', { class: 'chip good' }, 'Clave configurada') : h('span', { class: 'chip warn' }, 'Falta la clave')) : h('span', { class: 'chip' }, 'No se pudo consultar');
    T.adm.marco('config',
      h('header', null, h('div', null, h('h1', null, 'Proveedores IA y parámetros'), h('p', { class: 'muted', style: 'margin:0' }, 'Las claves se guardan solo en Supabase (Edge Functions → Secrets). Aquí nunca se escriben ni se muestran.'))),
      editable ? null : h('div', { class: 'note' }, 'Solo el administrador principal puede cambiar estos valores.'),
      mensaje,
      h('section', { class: 'card' }, h('h2', null, 'Interruptor'),
        h('div', { class: 'row wrap' }, h('span', { class: 'chip ' + (est.encendida ? 'good' : '') }, est.encendida ? 'IA encendida' : 'IA apagada'), 'Anthropic:', anthropic),
        h('p', { class: 'small muted' }, 'Apagada, no se puede llamar a ningún proveedor con costo. La simulación siempre está disponible.'),
        editable ? h('button', { class: 'btn' + (est.encendida ? '' : ' primary'), onclick: (e) => { if (est.encendida || window.confirm('Al encenderla, los administradores podrán generar contenido con costo, hasta el tope mensual. ¿Encender?')) guardar(e.currentTarget, { encendida: !est.encendida }, est.encendida ? 'IA apagada.' : 'IA encendida.'); } }, est.encendida ? 'Apagar la IA' : 'Encender la IA') : null),
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Topes'),
        h('p', { class: 'small muted' }, 'Este mes: ' + usd(est.gastado_usd) + ' de ' + usd(est.mes_usd) + '. Antes de cada llamada se reserva su costo máximo; si no cabe, no se llama.'),
        h('div', { class: 'form-grid' }, campo('Tope mensual (US$)', tope), campo('Solicitudes por persona y día', dia)),
        editable ? h('button', { class: 'btn primary', style: 'margin-top:.75rem', onclick: (e) => guardar(e.currentTarget, { mes_usd: Number(tope.value), dia_trabajos: Math.round(Number(dia.value)) }, 'Topes guardados.') }, 'Guardar topes') : null),
      h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Modelos'),
        h('p', { class: 'small muted' }, 'Precios en dólares por millón de tokens. Verifíquelos en la página oficial del proveedor antes de encender la IA: el costo se calcula con ellos.'),
        est.modelos.filter(m => m.proveedor !== 'simulado').map(m => {
          const en = num(m.entrada), sa = num(m.salida);
          return h('div', { style: 'border-top:1px solid var(--border);padding:.75rem 0' },
            h('div', { class: 'row wrap' }, h('strong', null, m.nombre), h('span', { class: 'chip' }, m.proveedor_nombre), m.defecto ? h('span', { class: 'chip gold' }, 'Por defecto') : null, m.habilitado ? null : h('span', { class: 'chip' }, 'Deshabilitado'), h('span', { class: 'small muted' }, 'Precio revisado el ' + m.precio_del)),
            h('div', { class: 'form-grid', style: 'margin-top:.5rem' }, campo('Entrada', en), campo('Salida', sa)),
            editable ? h('div', { class: 'row wrap', style: 'margin-top:.5rem' },
              h('button', { class: 'btn', onclick: (e) => guardar(e.currentTarget, { modelo: { proveedor: m.proveedor, modelo: m.modelo, entrada: Number(en.value), salida: Number(sa.value) } }, 'Precios guardados.') }, 'Guardar precios'),
              m.defecto ? null : h('button', { class: 'btn', onclick: (e) => guardar(e.currentTarget, { modelo: { proveedor: m.proveedor, modelo: m.modelo, defecto: true } }, 'Modelo por defecto cambiado.') }, 'Usar por defecto'),
              h('button', { class: 'btn ghost', onclick: (e) => guardar(e.currentTarget, { modelo: { proveedor: m.proveedor, modelo: m.modelo, habilitado: !m.habilitado } }, 'Modelo actualizado.') }, m.habilitado ? 'Deshabilitar' : 'Habilitar')) : null);
        }),
        h('p', { class: 'small muted', style: 'margin:0' }, 'OpenAI: pendiente (decisión D-10, Anthropic primero).')));
  });
})(window.T360);
