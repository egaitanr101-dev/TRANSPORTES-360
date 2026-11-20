/* TRANSPORTES 360 — Ingreso y activación de cuenta (D-02).
   El código de empleado IDENTIFICA; la contraseña personal AUTENTICA. Nunca son lo mismo. */
(function (T) {
  'use strict';
  const { h } = T;

  function campo(id, etiqueta, tipo, placeholder, autocomplete, ayuda) {
    return h('div', { class: 'field' },
      h('label', { for: id }, etiqueta),
      h('input', { id, name: id, type: tipo, placeholder, autocomplete, required: true, autocapitalize: tipo === 'text' ? 'characters' : false, spellcheck: 'false' }),
      ayuda ? h('span', { class: 'hint' }, ayuda) : null);
  }

  function pantalla(modo) {
    const activar = modo === 'activar';
    const error = h('p', { class: 'form-error', role: 'alert' });
    const boton = h('button', { class: 'btn primary block', type: 'submit' }, activar ? 'Activar y entrar' : 'Ingresar');
    const tab = (m, t) => h('button', { type: 'button', role: 'tab', 'aria-selected': m === modo ? 'true' : 'false', onclick: () => T.enrutador.ir(m) }, t);

    const form = h('form', { class: 'stack', novalidate: true, onsubmit: enviar },
      campo('codigo', 'Código de empleado', 'text', 'Ej. TR-0417', 'username', activar ? null : 'Personal administrativo: puede ingresar con su correo.'),
      activar ? campo('activacion', 'Código de activación', 'text', '8 caracteres', 'one-time-code', 'Viene en la tarjeta que le entregaron en persona. Sirve una sola vez y vence en la fecha indicada en la tarjeta.') : null,
      campo('contrasena', activar ? 'Cree su contraseña' : 'Contraseña', 'password', activar ? 'Mínimo 8 caracteres' : '', activar ? 'new-password' : 'current-password', activar ? 'No use su código de empleado ni su fecha de nacimiento.' : null),
      activar ? campo('repetir', 'Repita la contraseña', 'password', '', 'new-password') : null,
      error, boton);

    async function enviar(e) {
      e.preventDefault();
      error.textContent = '';
      const v = (n) => (form.elements[n] ? form.elements[n].value : '');
      boton.disabled = true;
      try {
        T.col.usuario = activar
          ? await T.api.activar(v('codigo'), v('activacion'), v('contrasena'), v('repetir'))
          : await T.api.ingresar(v('codigo'), v('contrasena'));
        T.enrutador.ir('inicio');
      } catch (err) {
        error.textContent = T.ui.mensajeDe(err);
        boton.disabled = false;
      }
    }

    const r = T.limpiar(document.getElementById('app'));
    r.append(
      h('header', { class: 'topbar' }, T.col.marca()),
      h('main', { class: 'login stack' },
        h('div', { class: 'tabs', role: 'tablist' }, tab('ingreso', 'Ingresar'), tab('activar', 'Activar mi cuenta')),
        form,
        !activar ? h('p', { class: 'small muted' }, '¿Olvidó su contraseña? Pídale a su supervisor un nuevo código de activación.') : null,
        h('p', { class: 'small muted' }, 'Su código de empleado lo identifica, pero no es su contraseña.'),
        T.api.ayudaDemo ? h('div', { class: 'note small' }, T.api.ayudaDemo) : null));
    form.elements.codigo.focus();
  }

  T.enrutador.registrar('ingreso', () => pantalla('ingreso'));
  T.enrutador.registrar('activar', () => pantalla('activar'));
})(window.T360);
