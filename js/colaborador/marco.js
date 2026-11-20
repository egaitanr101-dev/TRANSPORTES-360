/* TRANSPORTES 360 — Marco de la app del colaborador: barra superior, navegación inferior, perfil. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const raiz = () => document.getElementById('app');

  T.col = {
    usuario: null,
    pendientes: 0,

    marca() {
      return h('div', { class: 'brand' }, T.logo(34), h('div', null, T.config.nombreApp, h('small', null, T.config.lema.toUpperCase())));
    },

    topbar() {
      const u = T.col.usuario;
      return h('header', { class: 'topbar' }, T.col.marca(),
        u ? h('button', { class: 'avatar', 'aria-label': 'Mi perfil', onclick: T.col.abrirPerfil }, u.iniciales) : null);
    },

    bottomnav(activa) {
      const it = (ruta, ic, txt, extra) => h('a', { href: '#' + ruta, class: activa === ruta ? 'active' : '', 'aria-current': activa === ruta ? 'page' : false }, icon(ic), txt, extra);
      const n = T.col.pendientes;
      return h('nav', { class: 'bottomnav', 'aria-label': 'Navegación principal' },
        it('inicio', 'home', 'Inicio'),
        it('semana', 'week', 'Semana'),
        it('alertas', 'bell', 'Alertas', n ? h('span', { class: 'count', 'aria-label': n + ' pendientes' }, n) : null),
        it('historial', 'history', 'Mi historial'));
    },

    /** Pinta una pantalla estándar (barra superior + contenido + navegación inferior). Devuelve el <main>. */
    pagina(activa, ...contenido) {
      const r = T.limpiar(raiz());
      const main = h('main', { class: 'main', id: 'contenido' }, ...contenido);
      r.append(T.col.topbar(), main, T.col.bottomnav(activa));
      window.scrollTo(0, 0);
      return main;
    },

    cargando(activa) { return T.col.pagina(activa, T.ui.cargando()); },

    /** Vuelve a pintar la navegación inferior (por ejemplo, cuando cambia el contador de alertas). */
    refrescarNav(activa) {
      const actual = document.querySelector('.bottomnav');
      if (actual) actual.replaceWith(T.col.bottomnav(activa));
    },

    abrirPerfil() {
      const u = T.col.usuario;
      if (!u) return;
      const cerrar = () => fondo.remove();
      const fondo = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === fondo) cerrar(); } },
        h('div', { class: 'sheet stack', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mi perfil' },
          h('div', { class: 'row' }, h('span', { class: 'avatar' }, u.iniciales),
            h('div', null, h('strong', null, u.nombre), h('br'), h('span', { class: 'small muted' }, u.codigo + ' · ' + u.area))),
          h('button', { class: 'btn block', onclick: () => T.ui.aviso('Cambio de contraseña: disponible en la iteración 1.') }, 'Cambiar contraseña'),
          h('button', { class: 'btn block', onclick: () => T.ui.aviso('Aviso de privacidad: pendiente del texto de Legal (R-70).') }, 'Aviso de privacidad'),
          h('button', { class: 'btn navy block', onclick: async () => { cerrar(); await T.api.salir(); T.col.usuario = null; T.enrutador.ir('ingreso'); } }, 'Cerrar sesión'),
          h('button', { class: 'btn ghost block', onclick: cerrar }, 'Cerrar'),
          h('p', { class: 'small muted', style: 'text-align:center;margin:0' }, T.config.nombreApp + ' · ' + T.config.version)));
      document.body.appendChild(fondo);
    },

    prioridadTexto(p) { return { INFORMATIVA: 'Informativa', PREVENTIVA: 'Preventiva', ALTA: 'Alta', CRITICA: 'Crítica' }[p] || p; },
    prioridadClase(p) { return { INFORMATIVA: 'info', PREVENTIVA: 'warn', ALTA: 'high', CRITICA: 'crit' }[p] || ''; }
  };
})(window.T360);
