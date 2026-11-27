/* TRANSPORTES 360 — Panel: reportes (iteración 8) y "Mi equipo" del supervisor (D-09).
   Cada cifra con numerador y denominador. Exportar a Excel usa la librería que ya está en js/vendor (en este navegador). */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const pct = (a, b) => b ? Math.round(a * 100 / b) + ' %' : '—';
  const fecha = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const puede = (p) => ((T.adm.usuario && T.adm.usuario.permisos) || []).includes(p);
  const tabla = (cols, filas) => h('div', { style: 'overflow-x:auto' }, h('table', { class: 't' }, h('thead', null, h('tr', null, cols.map(c => h('th', null, c)))), h('tbody', null, filas)));

  function cargarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/xlsx-0.20.3.full.min.js';
      s.onload = ok; s.onerror = () => mal(T.error('RED', 'No se pudo cargar el generador de Excel.'));
      document.head.appendChild(s);
    });
  }
  /** Descarga un .xlsx con las filas dadas (objetos con encabezados en español). */
  async function exportar(nombre, filas) {
    try {
      await cargarSheetJS();
      const libro = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(libro, window.XLSX.utils.json_to_sheet(filas), 'Reporte');
      window.XLSX.writeFile(libro, 'transportes360-' + nombre + '-' + new Date().toLocaleDateString('en-CA') + '.xlsx');
    } catch (e) { T.ui.error(e); }
  }
  const botonExcel = (nombre, filas) => h('button', { class: 'btn', disabled: !filas.length, onclick: () => exportar(nombre, filas) }, icon('doc', 'sm'), 'Exportar a Excel');

  const VISTAS = [['semanas', 'Semanas'], ['areas', 'Por área'], ['preguntas', 'Preguntas'], ['alertas', 'Alertas'], ['ia', 'IA']];
  T.enrutador.registrar('reportes', async (vista, extra) => {
    vista = VISTAS.some(v => v[0] === vista) ? vista : 'semanas';
    T.adm.cargando('reportes');
    const tabs = h('div', { class: 'capsule-tabs', role: 'tablist' }, VISTAS.map(([v, t]) => h('button', { role: 'tab', 'aria-selected': v === vista ? 'true' : 'false', onclick: () => T.enrutador.ir('reportes/' + v) }, t)));
    let cuerpo;
    try { cuerpo = await ({ semanas: vSemanas, areas: vAreas, preguntas: vPreguntas, alertas: vAlertas, ia: vIA })[vista](extra); }
    catch (e) { cuerpo = h('p', { class: 'form-error' }, T.ui.mensajeDe(e)); }
    T.adm.marco('reportes',
      h('header', null, h('div', null, h('h1', null, 'Reportes'), h('p', { class: 'muted', style: 'margin:0' }, 'Base: personas que responden evaluaciones (colaboradores y supervisores) activas; en semanas cerradas, la base congelada al cierre.'))),
      tabs, cuerpo);
  });

  async function vSemanas() {
    const r = await T.api.reporteSemanas(12);
    const filas = r.map(s => ({ Semana: s.numero, Lunes: fecha(s.lunes), Tema: s.titulo, Categoria: s.categoria, Estado: s.en_curso ? 'En curso' : s.cerrada ? 'Cerrada' : 'Terminada sin cerrar',
      Base: s.base, Abrieron: s.ingresaron, Participaron: s.participaron, Completaron: s.completaron, 'Puntaje promedio': s.promedio == null ? '' : s.promedio }));
    return h('section', { class: 'card' }, h('div', { class: 'row between wrap' }, h('h2', null, 'Últimas semanas'), botonExcel('semanas', filas)),
      r.length ? tabla(['Semana', 'Tema', 'Participación', 'Completaron', 'Abrieron', 'Promedio'], r.map(s => h('tr', null,
        h('td', null, h('strong', null, 'S' + s.numero), h('br'), h('span', { class: 'small muted' }, fecha(s.lunes) + (s.en_curso ? ' · en curso' : s.cerrada ? ' · cerrada' : ''))),
        h('td', null, s.titulo, h('div', { class: 'small muted' }, s.categoria)),
        h('td', null, pct(s.participaron, s.base), h('div', { class: 'small muted' }, s.participaron + ' de ' + s.base)),
        h('td', null, pct(s.completaron, s.base), h('div', { class: 'small muted' }, s.completaron + ' de ' + s.base)),
        h('td', null, pct(s.ingresaron, s.base), h('div', { class: 'small muted' }, s.ingresaron + ' de ' + s.base)),
        h('td', null, s.promedio != null ? s.promedio + ' / 10' : s.promedio_oculto ? 'Oculto (< 5)' : '—'),
        h('td', null, puede('contenido.crear_editar') ? h('a', { class: 'btn', style: 'min-height:36px', href: '#reportes/preguntas/' + encodeURIComponent(s.id) }, 'Preguntas') : null))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay semanas publicadas.'));
  }

  async function elegirSemana(vista, id) {
    const semanas = await T.api.reporteSemanas(26);
    const elegida = semanas.find(s => s.id === id) || semanas[0];
    const sel = h('select', { 'aria-label': 'Semana', onchange: (e) => T.enrutador.ir('reportes/' + vista + '/' + e.target.value) },
      semanas.map(s => h('option', { value: s.id, selected: elegida && s.id === elegida.id }, 'S' + s.numero + ' · ' + fecha(s.lunes) + ' · ' + s.titulo)));
    return { elegida, selector: h('div', { class: 'field', style: 'margin-bottom:1rem;max-width:520px' }, sel) };
  }

  async function vAreas(id) {
    const { elegida, selector } = await elegirSemana('areas', id);
    if (!elegida) return h('p', { class: 'muted' }, 'Todavía no hay semanas publicadas.');
    const r = await T.api.reporteAreas(elegida.id);
    const filas = r.areas.map(a => ({ Area: a.area, Base: a.base, Abrieron: a.ingresaron, Participaron: a.participaron, Completaron: a.completaron, 'Puntaje promedio': a.promedio == null ? '' : a.promedio }));
    return h('section', { class: 'card' }, selector, h('div', { class: 'row between wrap' }, h('h2', null, 'Por área · S' + elegida.numero), botonExcel('areas-S' + elegida.numero, filas)),
      r.areas.length ? tabla(['Área', 'Participación', 'Completaron', 'Promedio'], r.areas.map(a => h('tr', null, h('td', null, a.area),
        h('td', null, pct(a.participaron, a.base) + ' (' + a.participaron + ' de ' + a.base + ')'), h('td', null, pct(a.completaron, a.base) + ' (' + a.completaron + ' de ' + a.base + ')'),
        h('td', null, a.promedio != null ? a.promedio + ' / 10' : '—')))) : h('p', { class: 'muted' }, 'No hay áreas con personas.'),
      r.sin_area ? h('p', { class: 'small muted' }, r.sin_area + ' persona(s) activas no tienen área asignada y no aparecen aquí.') : null);
  }

  async function vPreguntas(id) {
    const { elegida, selector } = await elegirSemana('preguntas', id);
    if (!elegida) return h('p', { class: 'muted' }, 'Todavía no hay semanas publicadas.');
    const r = await T.api.reportePreguntas(elegida.id);
    const filas = r.map(q => ({ Dia: q.dia, Capsula: q.capsula, Pregunta: q.pregunta, Respuestas: q.respuestas, Correctas: q.correctas, 'Aciertos %': q.aciertos == null ? '' : q.aciertos, 'Error mas comun': q.error_comun || '' }));
    return h('section', { class: 'card' }, selector, h('div', { class: 'row between wrap' }, h('h2', null, 'Aciertos por pregunta · S' + elegida.numero), botonExcel('preguntas-S' + elegida.numero, filas)),
      h('p', { class: 'small muted' }, 'Solo respuestas oficiales (el primer envío). La práctica no cuenta.'),
      r.length ? tabla(['Día', 'Pregunta', 'Aciertos', 'Error más común'], r.map(q => h('tr', null, h('td', null, String(q.dia)),
        h('td', null, q.pregunta, h('div', { class: 'small muted' }, q.capsula)), h('td', null, q.aciertos != null ? q.aciertos + ' % (' + q.correctas + ' de ' + q.respuestas + ')' : 'Sin respuestas'),
        h('td', null, q.error_comun || '—')))) : h('p', { class: 'muted' }, 'Esta semana no tiene preguntas.'));
  }

  async function vAlertas() {
    const r = await T.api.reporteAlertas();
    const filas = r.map(a => ({ Alerta: a.titulo, Prioridad: a.prioridad, Version: a.version, Publicada: fecha(a.publica), Vence: fecha(a.vence), Vigente: a.vigente ? 'Sí' : 'No', Audiencia: a.audiencia, Abrieron: a.vistas, Confirmaron: a.confirmadas }));
    return h('section', { class: 'card' }, h('div', { class: 'row between wrap' }, h('h2', null, 'Lectura de alertas'), botonExcel('alertas', filas)),
      h('p', { class: 'small muted' }, 'Vigentes y vencidas en los últimos 30 días, por su última versión. Abrir no es confirmar.'),
      r.length ? tabla(['Alerta', 'Confirmaron', 'Abrieron', 'Vence'], r.map(a => h('tr', null,
        h('td', null, h('a', { href: '#alerta/' + encodeURIComponent(a.id) }, a.titulo), h('div', { class: 'small muted' }, T.prioridad.texto(a.prioridad) + ' · v' + a.version + (a.vigente ? ' · vigente' : ' · vencida'))),
        h('td', null, pct(a.confirmadas, a.audiencia) + ' (' + a.confirmadas + ' de ' + a.audiencia + ')'), h('td', null, a.vistas + ' de ' + a.audiencia), h('td', null, fecha(a.vence)))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'No hay alertas publicadas en los últimos 30 días.'));
  }

  async function vIA() {
    const r = await T.api.reporteIA();
    const filas = r.map(m => ({ Mes: m.mes, Solicitudes: m.solicitudes, Simulaciones: m.simuladas, Generadas: m.generadas, 'Convertidas en borrador': m.convertidas, Aprobadas: m.aprobadas, 'Costo estimado USD': Number(m.costo_usd) }));
    return h('section', { class: 'card' }, h('div', { class: 'row between wrap' }, h('h2', null, 'Uso de IA'), botonExcel('ia', filas)),
      h('p', { class: 'small muted' }, 'Costo estimado con los precios registrados en el panel; la factura real está en la consola del proveedor.'),
      r.length ? tabla(['Mes', 'Solicitudes', 'Generadas', 'Aprobadas', 'Costo'], r.map(m => h('tr', null, h('td', null, m.mes), h('td', null, m.solicitudes + (m.simuladas ? ' (' + m.simuladas + ' simulación)' : '')),
        h('td', null, String(m.generadas)), h('td', null, m.aprobadas + ' de ' + m.generadas + ' (' + pct(m.aprobadas, m.generadas) + ')'), h('td', null, 'US$ ' + Number(m.costo_usd).toFixed(2) + (m.costo_estimado ? ' *' : '')))))
        : h('p', { class: 'muted', style: 'margin:0' }, 'Todavía no hay solicitudes de IA.'),
      r.some(m => m.costo_estimado) ? h('p', { class: 'small muted' }, '* Incluye pasos sin datos de consumo: se contó su costo máximo.') : null);
  }

  // ---------- Mi equipo (supervisor) ----------
  T.enrutador.registrar('equipo', async () => {
    T.adm.cargando('equipo');
    const d = await T.api.miEquipo();
    const s = d.semana;
    const filas = d.personas.map(p => ({ Codigo: p.codigo || '', Nombre: p.nombre, Area: p.area || '', Activo: p.activo ? 'Sí' : 'No', 'Cuenta activada': p.activada ? 'Sí' : 'No', 'Capsulas esta semana': p.capsulas == null ? '' : p.capsulas, 'Alertas sin confirmar': p.alertas_pendientes }));
    T.adm.marco('equipo',
      h('header', null, h('div', null, h('h1', null, 'Mi equipo'), h('p', { class: 'muted', style: 'margin:0' }, s ? 'Semana ' + s.numero + ' · ' + s.titulo + ' · día ' + s.dia + ' de 5 · cierra el domingo ' + fecha(s.cierra) : 'No hay una capacitación publicada esta semana.')),
        botonExcel('equipo', filas)),
      h('div', { class: 'note', style: 'margin-bottom:1rem' }, 'Usted ve la participación de su equipo, no los puntajes de cada persona (decisión D-09). Los promedios del grupo se muestran solo si lo completaron 5 personas o más.'),
      h('section', { class: 'card' }, d.personas.length ? tabla(['Persona', 'Cápsulas', 'Alertas', 'Cuenta'], d.personas.map(p => h('tr', null,
        h('td', null, h('strong', null, p.nombre), h('div', { class: 'small muted' }, (p.codigo || '') + (p.area ? ' · ' + p.area : '') + (p.activo ? '' : ' · inactivo'))),
        h('td', null, p.capsulas == null ? '—' : h('span', { class: 'chip ' + (p.capsulas >= 5 ? 'good' : p.capsulas > 0 ? 'warn' : '') }, p.capsulas + ' de 5')),
        h('td', null, p.alertas_pendientes ? h('span', { class: 'chip high' }, p.alertas_pendientes + ' sin confirmar') : h('span', { class: 'chip good' }, 'Al día')),
        h('td', null, p.activada ? 'Activada' : h('a', { href: '#usuarios' }, 'Sin activar'))))) : h('p', { class: 'muted', style: 'margin:0' }, 'No tiene personas asignadas como supervisor.')),
      d.semanas.length ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Semanas anteriores (equipo)'),
        tabla(['Semana', 'Participación', 'Completaron', 'Promedio'], d.semanas.map(w => h('tr', null, h('td', null, 'S' + w.numero + ' · ' + w.titulo),
          h('td', null, pct(w.participaron, w.base) + ' (' + w.participaron + ' de ' + w.base + ')'), h('td', null, pct(w.completaron, w.base) + ' (' + w.completaron + ' de ' + w.base + ')'),
          h('td', null, w.promedio != null ? w.promedio + ' / 10' : w.promedio_oculto ? 'Oculto (< 5)' : '—'))))) : null);
  });
})(window.T360);
