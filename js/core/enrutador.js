/* TRANSPORTES 360 — Enrutador por hash (#ruta/parametro). Sin dependencias.
   La guardia decide, antes de cada pantalla, si hace falta sesión (y a dónde redirigir). */
(function (T) {
  'use strict';
  const rutas = {};
  let porDefecto = 'inicio';
  let guardia = null;
  let alError = null;   // manejador opcional por aplicación (p. ej. el panel muestra "próximamente")

  async function resolver() {
    const destino = (location.hash || '').slice(1) || porDefecto;
    const [base, ...params] = destino.split('/');
    try {
      if (guardia) {
        const redir = await guardia(base);
        if (redir && redir !== base) { location.replace('#' + redir); return; }
      }
      await (rutas[base] || rutas[porDefecto])(...params.map(decodeURIComponent));
    } catch (e) {
      if (alError && alError(e, base)) return;
      if (e && e.codigo === 'NO_AUTENTICADO') { location.replace('#ingreso'); return; }
      T.ui.error(e);
    }
  }

  T.enrutador = {
    registrar(ruta, fn) { rutas[ruta] = fn; return this; },
    defecto(ruta) { porDefecto = ruta; return this; },
    guardia(fn) { guardia = fn; return this; },
    alError(fn) { alError = fn; return this; },
    ir(ruta) { if (location.hash === '#' + ruta) resolver(); else location.hash = '#' + ruta; },
    recargar: resolver,
    iniciar() { window.addEventListener('hashchange', resolver); return resolver(); }
  };
})(window.T360);
