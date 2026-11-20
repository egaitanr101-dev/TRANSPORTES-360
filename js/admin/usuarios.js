/* TRANSPORTES 360 — Panel: usuarios y códigos de activación (D-02).
   El código de activación se muestra UNA sola vez, para entregarlo en persona; la base solo guarda su hash.
   Los permisos reales los valida el servidor (fn_admin_usuario_guardar, fn_emitir_activacion, admin-usuarios). */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const ROLES = { COLABORADOR: 'Colaborador', SUPERVISOR: 'Supervisor', ADMIN: 'Administrador', ADMIN_PRINCIPAL: 'Administrador principal' };
  const ESTADOS = {
    ACTIVADA: ['good', 'Activada'], PENDIENTE: ['warn', 'Pendiente de activar'], VENCIDA: ['crit', 'Código vencido'], SIN_CODIGO: ['', 'Sin código']
  };
  const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-CR', { timeZone: T.config.zonaHoraria, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  function campo(etq, control, ayuda) {
    return h('div', { class: 'field' }, h('label', null, etq), control, ayuda ? h('span', { class: 'hint' }, ayuda) : null);
  }

  T.enrutador.registrar('usuarios', async () => {
    T.adm.cargando('usuarios');
    const [lista, areas] = await Promise.all([T.api.usuarios(), T.api.areas()]);
    const puede = (p) => (T.adm.usuario.permisos || []).includes(p);
    const gestiona = puede('usuarios.gestionar');
    const supervisores = lista.filter(u => u.activo && ['SUPERVISOR', 'ADMIN', 'ADMIN_PRINCIPAL'].includes(u.rol));
    const revelado = h('div');
    const formularios = h('div');

    /** Muestra el código una sola vez, grande y legible. */
    function mostrarCodigo(nombre, act) {
      T.poner(revelado, h('section', { class: 'card', style: 'margin-bottom:1rem;border:2px solid var(--gold)', role: 'status' },
        h('h2', null, 'Código de activación para ' + nombre),
        h('div', { class: 'mono', style: 'font-size:2rem;font-weight:800;letter-spacing:.12em;margin:.4rem 0' }, act.codigo),
        h('p', { class: 'small' }, 'Entréguelo en persona. Vence el ' + fecha(act.vence) + ' y sirve una sola vez. ', h('strong', null, 'No se volverá a mostrar.')),
        h('p', { class: 'small muted', style: 'margin:0' }, 'No lo envíe por WhatsApp ni por correo. Si se pierde, genere uno nuevo: el anterior queda anulado.'),
        h('div', { class: 'row', style: 'margin-top:.75rem' },
          h('button', { class: 'btn', onclick: () => { T.limpiar(revelado); } }, 'Ya lo entregué'))));
      window.scrollTo(0, 0);
    }

    async function generar(u, boton) {
      boton.disabled = true;
      try {
        const act = await T.api.emitirActivacion(u.id);
        await pintarTabla();
        mostrarCodigo(u.nombre, act);
      } catch (e) { T.ui.error(e); boton.disabled = false; }
    }

    function formColaborador() {
      const error = h('p', { class: 'form-error', role: 'alert' });
      const form = h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); error.textContent = '';
        const v = (n) => form.elements[n].value;
        const b = form.querySelector('button[type=submit]'); b.disabled = true;
        try {
          const r = await T.api.crearColaborador({ codigo: v('codigo'), nombre: v('nombre'), area: v('area'), supervisor: v('supervisor') });
          T.limpiar(formularios);
          await pintarTabla();
          mostrarCodigo(v('nombre'), r);
        } catch (err) { error.textContent = T.ui.mensajeDe(err); b.disabled = false; }
      } },
        h('h2', null, 'Nuevo colaborador'),
        h('div', { class: 'form-grid' },
          campo('Código de empleado', h('input', { name: 'codigo', required: true, maxlength: 20, autocapitalize: 'characters', placeholder: 'Ej. TR-0731' }), 'Lo identifica al ingresar. No es su contraseña.'),
          campo('Nombre completo', h('input', { name: 'nombre', required: true, maxlength: 120 })),
          campo('Área', h('select', { name: 'area' }, h('option', { value: '' }, 'Sin área'), areas.map(a => h('option', { value: a.id }, a.nombre)))),
          campo('Supervisor', h('select', { name: 'supervisor' }, h('option', { value: '' }, 'Sin supervisor'), supervisores.map(s => h('option', { value: s.id }, s.nombre))))),
        error,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Crear y generar código'), h('button', { class: 'btn', type: 'button', onclick: () => T.limpiar(formularios) }, 'Cancelar')));
      T.poner(formularios, form);
      form.elements.codigo.focus();
    }

    function formPersonal() {
      const error = h('p', { class: 'form-error', role: 'alert' });
      const roles = ['SUPERVISOR'].concat(puede('usuarios.gestionar_staff') ? ['ADMIN', 'ADMIN_PRINCIPAL'] : []);
      const form = h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); error.textContent = '';
        const v = (n) => form.elements[n].value;
        const b = form.querySelector('button[type=submit]'); b.disabled = true;
        try {
          await T.api.invitarPersonal({ correo: v('correo'), nombre: v('nombre'), rol: v('rol'), area: v('area') });
          T.limpiar(formularios);
          T.ui.aviso('Invitación enviada a ' + v('correo') + '.');
          await pintarTabla();
        } catch (err) { error.textContent = T.ui.mensajeDe(err); b.disabled = false; }
      } },
        h('h2', null, 'Invitar personal administrativo'),
        h('p', { class: 'small muted', style: 'margin:0' }, 'Recibe un correo para crear su contraseña. Requiere el correo (SMTP) configurado en Supabase.'),
        h('div', { class: 'form-grid' },
          campo('Correo', h('input', { name: 'correo', type: 'email', required: true, maxlength: 160 })),
          campo('Nombre completo', h('input', { name: 'nombre', required: true, maxlength: 120 })),
          campo('Rol', h('select', { name: 'rol' }, roles.map(r => h('option', { value: r }, ROLES[r])))),
          campo('Área', h('select', { name: 'area' }, h('option', { value: '' }, 'Sin área'), areas.map(a => h('option', { value: a.id }, a.nombre))))),
        error,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Enviar invitación'), h('button', { class: 'btn', type: 'button', onclick: () => T.limpiar(formularios) }, 'Cancelar')));
      T.poner(formularios, form);
    }

    const tabla = h('div', { style: 'overflow-x:auto' });
    async function pintarTabla() {
      const datos = await T.api.usuarios();
      T.poner(tabla, h('table', { class: 't' },
        h('thead', null, h('tr', null, ['Nombre', 'Código o correo', 'Rol', 'Área', 'Supervisor', 'Estado', ''].map(t => h('th', null, t)))),
        h('tbody', null, datos.map(u => {
          const [cls, txt] = u.rol === 'COLABORADOR' ? (ESTADOS[u.activacion] || ['', u.activacion]) : (u.activo ? ['good', 'Activo'] : ['', 'Inactivo']);
          const boton = u.rol === 'COLABORADOR' && (gestiona || puede('usuarios.restablecer_equipo'))
            ? h('button', { class: 'btn', style: 'min-height:38px', onclick: (e) => generar(u, e.currentTarget) }, u.activacion === 'ACTIVADA' ? 'Restablecer acceso' : 'Generar código')
            : null;
          return h('tr', null,
            h('td', null, h('strong', null, u.nombre)),
            h('td', { class: 'mono' }, u.codigo || u.correo || ''),
            h('td', null, ROLES[u.rol] || 'Sin rol'),
            h('td', null, u.area || '—'),
            h('td', null, u.supervisor || '—'),
            h('td', null, h('span', { class: 'chip ' + cls }, txt), u.activacion === 'PENDIENTE' ? h('div', { class: 'small muted' }, 'vence ' + fecha(u.activacion_vence)) : null),
            h('td', null, boton));
        }))));
    }
    await pintarTabla();

    T.adm.marco('usuarios',
      h('header', null,
        h('div', null, h('h1', null, 'Usuarios'), h('p', { class: 'muted', style: 'margin:0' }, 'Los colaboradores ingresan con su código de empleado y una contraseña que crean con un código de activación.')),
        gestiona ? h('div', { class: 'row wrap' },
          h('a', { class: 'btn primary', href: '#importar' }, icon('doc', 'sm'), 'Importar lista'),
          h('button', { class: 'btn', onclick: formColaborador }, icon('users', 'sm'), 'Nuevo colaborador'),
          h('button', { class: 'btn', onclick: formPersonal }, 'Invitar personal')) : null),
      revelado,
      formularios,
      h('section', { class: 'card' }, tabla));
  });
})(window.T360);
