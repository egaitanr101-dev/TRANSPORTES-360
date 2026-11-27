/* TRANSPORTES 360 — Arranque de la app del colaborador: espera la API, aplica la guardia de sesión e inicia el enrutador. */
(function (T) {
  'use strict';
  const PUBLICAS = ['ingreso', 'activar'];
  let destino = null;   // enlace que abrió sin sesión (p. ej. un consejo compartido); se retoma al ingresar
  const app = document.getElementById('app');
  const banner = T.ui.bannerDemo();
  if (banner) document.body.insertBefore(banner, app);
  app.appendChild(T.ui.cargando());

  // PWA: el service worker guarda solo los archivos de la app (nunca datos). Requiere https o localhost.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* sin instalación: la app funciona igual */ }));
  }
  // Sin conexión: se avisa en lugar de mostrar errores; las respuestas solo se envían con conexión.
  window.addEventListener('offline', () => T.ui.aviso('Sin conexión. Lo que responda no se enviará hasta que vuelva la señal.', 'error'));
  window.addEventListener('online', () => { T.ui.aviso('Conexión recuperada.'); T.enrutador.recargar(); });
  if (!navigator.onLine) {
    T.poner(app, T.h('main', { class: 'main' }, T.h('h1', null, 'Sin conexión'), T.h('p', { class: 'muted' }, 'TRANSPORTES 360 necesita señal para mostrar su capacitación. Se cargará sola cuando vuelva la conexión.')));
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }

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
