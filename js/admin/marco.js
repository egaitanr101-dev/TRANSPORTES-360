/* TRANSPORTES 360 — Marco del panel administrativo: menú lateral (escritorio) y selector (teléfono).
   Los permisos reales se validan en el servidor; el menú solo ordena la navegación. */
(function (T) {
  'use strict';
  const { h, icon } = T;

  const MENU = [
    ['Operación', [['resumen', 'chart', 'Resumen'], ['calendario', 'calendar', 'Calendario editorial']]],
    ['Contenido', [['generador', 'spark', 'Generador IA'], ['revision', 'audit', 'Revisión y aprobación'], ['alertas', 'alert', 'ALERTAS 360'], ['documentos', 'doc', 'Biblioteca y fuentes']]],
    ['Semana', [['sorteo', 'gift', 'Cierre y sorteo']]],
    ['Administración', [['usuarios', 'users', 'Usuarios'], ['config', 'gear', 'Proveedores IA y parámetros'], ['auditoria', 'history', 'Auditoría']]]
  ];
  const DISPONIBLES = new Set(['resumen', 'generador', 'revision', 'sorteo']);

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
        h('p', { class: 'muted' }, 'Esta sección forma parte del plan (PLAN_IMPLEMENTACION §8). Por ahora están disponibles: Resumen, Generador IA, Revisión y aprobación, y Cierre y sorteo.'));
    }
  };

  for (const [, items] of MENU) for (const [ruta] of items) if (!DISPONIBLES.has(ruta)) T.enrutador.registrar(ruta, () => T.adm.pendiente(ruta));
})(window.T360);
