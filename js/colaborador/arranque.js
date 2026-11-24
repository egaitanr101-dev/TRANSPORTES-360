/* TRANSPORTES 360 — Arranque de la app del colaborador: espera la API, aplica la guardia de sesión e inicia el enrutador. */
(function (T) {
  'use strict';
  const PUBLICAS = ['ingreso', 'activar'];
  let destino = null;   // enlace que abrió sin sesión (p. ej. un consejo compartido); se retoma al ingresar
  const app = document.getElementById('app');
  const banner = T.ui.bannerDemo();
  if (banner) document.body.insertBefore(banner, app);
  app.appendChild(T.ui.cargando());

  T.listo.then(() => {
    T.enrutador
      .defecto('inicio')
      .guardia(async (ruta) => {
        const u = await T.api.sesion();
        if (!u) {
          T.col.usuario = null;
          if (PUBLICAS.includes(ruta)) return null;
          destino = ['consejo', 'alerta'].includes(ruta) ? location.hash.slice(1) : null;
          return 'ingreso';
        }
        if (!T.col.usuario) T.col.usuario = u;
        if (destino && (ruta === 'inicio' || PUBLICAS.includes(ruta))) { const d = destino; destino = null; return d; }
        return PUBLICAS.includes(ruta) ? 'inicio' : null;
      })
      .iniciar();
  }).catch(e => T.ui.error(e));
})(window.T360);
