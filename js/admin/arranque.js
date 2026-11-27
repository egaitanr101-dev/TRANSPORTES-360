/* TRANSPORTES 360 — Arranque del panel administrativo.
   DEMO: entra directo con un administrador ficticio.
   SUPABASE: exige ingreso con correo + contraseña y un permiso de panel, validado en el servidor (fn_mi_perfil). */
(function (T) {
  'use strict';
  const { h } = T;
  const raiz = document.getElementById('admin');
  const banner = T.ui.bannerDemo();
  if (banner) document.body.insertBefore(banner, raiz);
  raiz.appendChild(T.ui.cargando());

  function ingreso(mensaje) {
    const error = h('p', { class: 'form-error', role: 'alert' }, mensaje || '');
    const form = h('form', { class: 'card stack', novalidate: true, style: 'max-width:420px;margin:10vh auto 0', onsubmit: async (e) => {
      e.preventDefault(); error.textContent = '';
      const b = form.querySelector('button'); b.disabled = true;
      try { T.adm.usuario = await T.api.adminIngresar(form.elements.correo.value, form.elements.contrasena.value); iniciar(); }
      catch (err) { error.textContent = T.ui.mensajeDe(err); b.disabled = false; }
    } },
      h('div', { class: 'brand', style: 'background:var(--navy);color:#fff;padding:.7rem .9rem;border-radius:12px' }, T.logo(36), h('div', null, T.config.nombreApp, h('small', null, 'PANEL ADMINISTRATIVO'))),
      h('div', { class: 'field' }, h('label', { for: 'correo' }, 'Correo'), h('input', { id: 'correo', name: 'correo', type: 'email', autocomplete: 'username', required: true })),
      h('div', { class: 'field' }, h('label', { for: 'contrasena' }, 'Contraseña'), h('input', { id: 'contrasena', name: 'contrasena', type: 'password', autocomplete: 'current-password', required: true })),
      error,
      h('button', { class: 'btn primary block', type: 'submit' }, 'Ingresar'));
    T.poner(raiz, h('div', { style: 'grid-column:1/-1;padding:16px' }, form));
    form.elements.correo.focus();
  }

  function iniciar() {
    T.enrutador
      .defecto('resumen')
      .alError((e, ruta) => {
        if (e && e.codigo === 'NO_IMPLEMENTADO') { T.adm.pendiente(ruta); return true; }
        if (e && e.codigo === 'NO_AUTENTICADO') { ingreso('Su sesión terminó. Ingrese de nuevo.'); return true; }
        return false;
      })
      .iniciar();
  }

  T.listo.then(async () => {
    try { T.adm.usuario = await T.api.adminSesion(); iniciar(); }
    catch (e) {
      if (e.codigo === 'NO_AUTENTICADO') ingreso();
      else if (e.codigo === 'NO_AUTORIZADO') ingreso('Su usuario no tiene acceso al panel administrativo.');
      else throw e;
    }
  }).catch(e => {
    T.poner(raiz, h('main', { class: 'content' }, h('h1', null, 'Panel no disponible'), h('p', { class: 'muted' }, T.ui.mensajeDe(e))));
  });
})(window.T360);
