/* TRANSPORTES 360 — Marco del panel administrativo: menú lateral (escritorio) y selector (teléfono).
   Los permisos reales se validan en el servidor; el menú solo ordena la navegación. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  const MENU = [
    ['Operación', [['resumen', 'chart', 'Resumen'], ['reportes', 'chart', 'Reportes'], ['equipo', 'users', 'Mi equipo'], ['calendario', 'calendar', 'Calendario editorial']]],
    ['Contenido', [['capacitacion', 'week', 'Capacitación semanal'], ['revision', 'audit', 'Revisión y aprobación'], ['generador', 'spark', 'Generador IA'], ['alertas', 'alert', 'ALERTAS 360 y consejos'], ['campanas', 'gift', 'Campañas'], ['documentos', 'doc', 'Biblioteca y fuentes']]],
    ['Semana', [['sorteo', 'gift', 'Cierre y sorteo']]],
    ['Administración', [['usuarios', 'users', 'Usuarios'], ['config', 'gear', 'Proveedores IA y parámetros'], ['auditoria', 'history', 'Auditoría']]]
  ];
  const DISPONIBLES = new Set(['resumen', 'capacitacion', 'generador', 'revision', 'alertas', 'documentos', 'calendario', 'campanas', 'reportes', 'equipo', 'sorteo', 'usuarios', 'config']);

  T.adm = {
    usuario: null,

    marco(activa, ...contenido) {
      const raiz = T.limpiar(document.getElementById('admin'));
      const nav = h('nav', { 'aria-label': 'Menú del panel' });
      const sel = h('select', { 'aria-label': 'Ir a', onchange: (e) => T.enrutador.ir(e.target.value) });
      for (const [grupo, items] of MENU) {
        nav.append(h('div', { class: 'group' }, grupo));
        const og = h('optgroup', { label: grupo });
        for (const [ruta, ic, txt] of items) {
          const etiqueta = DISPONIBLES.has(ruta) ? txt : txt + ' (próximamente)';
          nav.append(h('a', { href: '#' + ruta, class: ruta === activa ? 'active' : '', 'aria-current': ruta === activa ? 'page' : false }, icon(ic, 'sm'), etiqueta));
          og.append(h('option', { value: ruta, selected: ruta === activa }, etiqueta));
        }
        sel.append(og);
      }
      const u = T.adm.usuario || { nombre: '', rol: '' };
      const main = h('main', { class: 'content' }, ...contenido);
      raiz.append(
        h('aside', { class: 'side' },
          h('div', { class: 'brand' }, T.logo(34), h('div', null, T.config.nombreApp, h('small', null, 'PANEL ADMINISTRATIVO'))), nav,
          h('div', { class: 'group' }, 'Sesión'), h('div', { class: 'small', style: 'padding:0 .7rem' }, u.nombre, h('br'), h('span', { style: 'opacity:.7' }, u.rol))),
        h('div', null, h('div', { class: 'admin-mobile-top' }, h('div', { class: 'brand' }, T.logo(30), 'T360'), sel), main));
      window.scrollTo(0, 0);
      return main;
    },

    cargando(activa) { return T.adm.marco(activa, T.ui.cargando()); },

    kpi(valor, etiqueta, den) {
      return h('div', { class: 'card kpi' }, h('div', { class: 'value' }, valor), h('div', { class: 'label' }, etiqueta), den ? h('div', { class: 'den' }, den) : null);
    },

    pendiente(ruta) {
      T.adm.marco(ruta, h('h1', null, 'Disponible en una próxima iteración'),
        h('p', { class: 'muted' }, 'Esta sección forma parte del plan (PLAN_IMPLEMENTACION §8). Vea en el menú las secciones que ya están disponibles.'));
    }
  };

  for (const [, items] of MENU) for (const [ruta] of items) if (!DISPONIBLES.has(ruta)) T.enrutador.registrar(ruta, () => T.adm.pendiente(ruta));

  /* Accesibilidad: en cada .field, la etiqueta se asocia a su único campo (for/id); si agrupa varios campos,
     el grupo se nombra con la etiqueta (role=group + aria-labelledby). Así el lector de pantalla dice qué es cada campo. */
  let nAsoc = 0, pendienteAsoc = false;
  function asociar(raiz) {
    raiz.querySelectorAll('.field').forEach(f => {
      const l = f.querySelector(':scope > label');
      if (!l || l.htmlFor) return;
      const cs = f.querySelectorAll('input, select, textarea');
      if (cs.length === 1) { cs[0].id = cs[0].id || 'campo-' + (++nAsoc); l.htmlFor = cs[0].id; }
      else if (cs.length > 1 && !f.hasAttribute('aria-labelledby')) { l.id = l.id || 'grupo-' + (++nAsoc); f.setAttribute('role', 'group'); f.setAttribute('aria-labelledby', l.id); }
    });
  }
  const raizAdmin = document.getElementById('admin');
  if (raizAdmin && window.MutationObserver) {
    new MutationObserver(() => {
      if (pendienteAsoc) return;
      pendienteAsoc = true;
      queueMicrotask(() => { pendienteAsoc = false; asociar(raizAdmin); });
    }).observe(raizAdmin, { childList: true, subtree: true });
  }
})(window.T360);
