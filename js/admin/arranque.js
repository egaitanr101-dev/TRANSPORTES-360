/* TRANSPORTES 360 — Arranque del panel administrativo.
   En modo DEMO entra directo con un administrador ficticio. Con Supabase (iteración 1) exigirá
   ingreso con correo + contraseña y el permiso correspondiente, validado en el servidor. */
(function (T) {
  'use strict';
  const raiz = document.getElementById('admin');
  const banner = T.ui.bannerDemo();
  if (banner) document.body.insertBefore(banner, raiz);
  raiz.appendChild(T.ui.cargando());

  T.listo.then(async () => {
    T.adm.usuario = await T.api.adminSesion();
    T.enrutador.defecto('resumen').iniciar();
  }).catch(e => {
    T.limpiar(raiz).append(T.h('main', { class: 'content' }, T.h('h1', null, 'Panel no disponible'), T.h('p', { class: 'muted' }, T.ui.mensajeDe(e))));
  });
})(window.T360);
