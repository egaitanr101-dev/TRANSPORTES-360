/* TRANSPORTES 360 — Errores y avisos de interfaz.
   Los errores llevan un código estable (como en el servidor: NO_AUTENTICADO, NO_AUTORIZADO, VALIDACION,
   NO_ENCONTRADO, NO_IMPLEMENTADO). Al usuario se le muestra un mensaje claro, nunca detalles internos. */
(function (T) {
  'use strict';
  const { h } = T;

  T.error = function (codigo, mensaje) {
    const e = new Error(mensaje);
    e.codigo = codigo;
    return e;
  };

  const MENSAJES = {
    NO_AUTENTICADO: 'Su sesión terminó. Ingrese de nuevo.',
    NO_AUTORIZADO: 'No tiene permiso para esta acción.',
    NO_ENCONTRADO: 'No encontramos lo que buscaba.',
    NO_IMPLEMENTADO: 'Esta función estará disponible en una próxima versión.',
    RED: 'No hay conexión. Revise su señal e intente de nuevo.'
  };

  T.ui = {
    mensajeDe(e) {
      if (e && e.codigo === 'VALIDACION') return e.message;
      return (e && MENSAJES[e.codigo]) || 'Ocurrió un problema. Intente de nuevo en un momento.';
    },
    aviso(texto, tipo) {
      const previo = document.querySelector('.toast');
      if (previo) previo.remove();
      const t = h('div', { class: 'toast' + (tipo === 'error' ? ' error' : ''), role: tipo === 'error' ? 'alert' : 'status' }, texto);
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 4500);
    },
    error(e) {
      if (window.console) console.warn('[T360]', e && e.codigo, e && e.message);
      T.ui.aviso(T.ui.mensajeDe(e), 'error');
    },
    cargando() { return h('div', { class: 'loading', role: 'status' }, 'Cargando…'); },
    bannerDemo() {
      return T.config.modo === 'DEMO'
        ? h('div', { class: 'demo-banner' }, 'MODO DEMOSTRACIÓN · datos ficticios · sin conexión a Supabase')
        : null;
    }
  };
})(window.T360);
