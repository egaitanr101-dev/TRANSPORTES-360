/* TRANSPORTES 360 — Panel: importación masiva de colaboradores (D-02, variante aprobada el 2026-11-20).
 * 1) El administrador sube su lista (Excel o CSV): número de empleado, nombre, área, supervisor.
 * 2) Vista previa con validación antes de crear nada.
 * 3) Creación en lotes de 50 (Edge Function admin-usuarios) con un código de activación distinto por persona.
 * 4) Hoja imprimible: una tarjeta por persona para recortar y entregar en mano.
 * Los códigos se ven SOLO en esta pantalla, justo después de importar: la base guarda únicamente su hash. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const LOTE = 50;
  const RE_CODIGO = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
  // Encabezados aceptados (sin tildes, minúsculas, solo letras)
  const COLUMNAS = {
    codigo: ['numero', 'numerodeempleado', 'numeroempleado', 'codigo', 'codigodeempleado', 'codigoempleado', 'empleado', 'id', 'carne', 'carnet'],
    nombre: ['nombre', 'nombrecompleto', 'colaborador', 'nombreyapellidos', 'empleadonombre'],
    area: ['area', 'departamento', 'depto', 'seccion', 'unidad'],
    supervisor: ['supervisor', 'jefe', 'jefatura', 'correosupervisor', 'supervisorcorreo', 'codigosupervisor']
  };
  const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const fecha = (iso) => new Date(iso).toLocaleDateString('es-CR', { timeZone: T.config.zonaHoraria, day: 'numeric', month: 'long', year: 'numeric' });

  // ---------- Lectura de archivos ----------
  function leerCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const primera = texto.split(/\r?\n/, 1)[0] || '';
    const sep = [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
    const filas = []; let fila = []; let celda = ''; let comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
        else if (c === '"') comillas = false;
        else celda += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) { fila.push(celda); celda = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(celda); filas.push(fila); fila = []; celda = '';
      } else celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas.filter(f => f.some(c => String(c).trim() !== ''));
  }

  function cargarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/xlsx-0.20.3.full.min.js';
      s.onload = ok; s.onerror = () => mal(T.error('RED', 'No se pudo cargar el lector de Excel.'));
      document.head.appendChild(s);
    });
  }

  async function leerArchivo(archivo) {
    if (archivo.size > 5 * 1024 * 1024) throw T.error('VALIDACION', 'El archivo supera 5 MB.');
    const ext = (archivo.name.split('.').pop() || '').toLowerCase();
    if (ext === 'csv' || ext === 'txt') return leerCSV(await archivo.text());
    if (ext === 'xlsx' || ext === 'xls') {
      await cargarSheetJS();
      const libro = window.XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' }).filter(f => f.some(c => String(c).trim() !== ''));
    }
    throw T.error('VALIDACION', 'Use un archivo Excel (.xlsx) o CSV.');
  }

  /** Convierte filas crudas en registros, detectando las columnas por su encabezado. */
  function interpretar(filas, existentes, personal) {
    if (filas.length < 2) throw T.error('VALIDACION', 'El archivo no tiene filas de datos.');
    const enc = filas[0].map(normal);
    const idx = {};
    for (const [campo, nombres] of Object.entries(COLUMNAS)) idx[campo] = enc.findIndex(e => nombres.includes(e));
    if (idx.codigo < 0 || idx.nombre < 0) throw T.error('VALIDACION', 'No encontré las columnas de número de empleado y nombre. Revise los encabezados (use la plantilla).');
    const vistos = new Set();
    return filas.slice(1).map((f, i) => {
      const r = {
        fila: i + 2,
        codigo: String(f[idx.codigo] || '').trim().toUpperCase().replace(/\s+/g, ''),
        nombre: String(f[idx.nombre] || '').trim().replace(/\s+/g, ' '),
        area: idx.area >= 0 ? String(f[idx.area] || '').trim() : '',
        supervisor: idx.supervisor >= 0 ? String(f[idx.supervisor] || '').trim() : ''
      };
      if (!RE_CODIGO.test(r.codigo)) r.error = 'Número de empleado no válido';
      else if (r.nombre.length < 3) r.error = 'Nombre vacío o muy corto';
      else if (vistos.has(r.codigo)) r.error = 'Repetido en el archivo';
      else if (existentes.has(r.codigo)) r.error = 'Ya existe en la plataforma';
      vistos.add(r.codigo);
      if (!r.error && r.supervisor && !personal.has(r.supervisor.toLowerCase())) r.aviso = 'Supervisor no registrado: quedará sin supervisor';
      return r;
    });
  }

  function descargarPlantilla() {
    const csv = '﻿' + ['numero_empleado;nombre_completo;area;supervisor', 'TR-0001;Nombre Apellido Apellido;Distribución GAM;correo.supervisor@empresa.com'].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: 'plantilla-colaboradores-t360.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- Hoja imprimible ----------
  function hojaCodigos(creados) {
    const url = T.config.urlPublica || location.origin;
    return h('section', { class: 'hoja-codigos', 'aria-label': 'Tarjetas de activación para imprimir' },
      creados.map(c => h('article', { class: 'tarjeta-codigo' },
        h('div', { class: 'tc-marca' }, 'TRANSPORTES 360 · Aprende · Cuídate · Protégete · Crece'),
        h('div', { class: 'tc-nombre' }, c.nombre),
        h('div', { class: 'tc-dato' }, 'Número de empleado: ', h('strong', null, c.codigo)),
        h('div', { class: 'tc-etiqueta' }, 'Código de activación'),
        h('div', { class: 'tc-codigo' }, c.codigo_activacion),
        h('div', { class: 'tc-dato' }, 'Vence: ', fecha(c.vence), ' · sirve una sola vez'),
        h('ol', { class: 'tc-pasos' },
          h('li', null, 'Entre a ', h('strong', null, url)),
          h('li', null, 'Toque «Activar mi cuenta»'),
          h('li', null, 'Escriba su número de empleado y este código'),
          h('li', null, 'Cree su contraseña (mínimo 8 caracteres)')),
        h('div', { class: 'tc-aviso' }, 'Código personal: no lo comparta ni lo envíe por WhatsApp.'))));
  }

  // ---------- Pantalla ----------
  T.enrutador.registrar('importar', async () => {
    T.adm.cargando('usuarios');
    const usuarios = await T.api.usuarios();
    const existentes = new Set(usuarios.map(u => u.codigo).filter(Boolean));
    const personal = new Set(usuarios.filter(u => u.activo && u.rol !== 'COLABORADOR').flatMap(u => [u.correo, u.codigo]).filter(Boolean).map(x => x.toLowerCase()));
    let registros = [];
    let resultado = null;

    const vigencia = h('select', { id: 'vigencia' },
      h('option', { value: '168' }, '7 días'), h('option', { value: '336', selected: true }, '14 días'), h('option', { value: '720' }, '30 días'));
    const archivo = h('input', { type: 'file', id: 'archivo', accept: '.xlsx,.xls,.csv' });
    const zona = h('div');
    const protegerSalida = (e) => { if (resultado && resultado.creados.length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', protegerSalida);

    archivo.addEventListener('change', async () => {
      if (!archivo.files[0]) return;
      T.poner(zona, T.ui.cargando());
      try { registros = interpretar(await leerArchivo(archivo.files[0]), existentes, personal); vistaPrevia(); }
      catch (e) { T.poner(zona, h('p', { class: 'form-error' }, T.ui.mensajeDe(e))); }
    });

    function vistaPrevia() {
      const validas = registros.filter(r => !r.error);
      const conError = registros.length - validas.length;
      const boton = h('button', { class: 'btn primary', disabled: !validas.length, onclick: () => importar(validas) }, icon('users', 'sm'), 'Importar ' + validas.length + ' colaboradores');
      T.poner(zona,
        h('div', { class: 'grid4', style: 'margin:1rem 0' },
          T.adm.kpi(String(registros.length), 'Filas leídas'),
          T.adm.kpi(String(validas.length), 'Listas para importar'),
          T.adm.kpi(String(conError), 'Con error (se omiten)'),
          T.adm.kpi(String(registros.filter(r => r.aviso).length), 'Con aviso')),
        h('section', { class: 'card' },
          h('div', { class: 'row between wrap' }, h('h2', { style: 'margin:0' }, 'Vista previa'), boton),
          h('p', { class: 'small muted' }, 'Revise los errores antes de importar. Nada se crea hasta que toque el botón.'),
          h('div', { style: 'overflow-x:auto;max-height:60vh' }, h('table', { class: 't' },
            h('thead', null, h('tr', null, ['Fila', 'Número', 'Nombre', 'Área', 'Supervisor', 'Estado'].map(t => h('th', null, t)))),
            h('tbody', null, registros.slice(0, 500).map(r => h('tr', null,
              h('td', null, r.fila), h('td', { class: 'mono' }, r.codigo), h('td', null, r.nombre), h('td', null, r.area || '—'), h('td', null, r.supervisor || '—'),
              h('td', null, r.error ? h('span', { class: 'chip crit' }, r.error) : r.aviso ? h('span', { class: 'chip warn' }, r.aviso) : h('span', { class: 'chip good' }, 'Lista'))))))),
          registros.length > 500 ? h('p', { class: 'small muted' }, 'Se muestran las primeras 500 filas; se importarán todas las válidas.') : null));
    }

    async function importar(validas) {
      if (!window.confirm('Se crearán ' + validas.length + ' colaboradores y sus códigos de activación. ¿Continuar?')) return;
      archivo.disabled = true; vigencia.disabled = true;
      resultado = { creados: [], omitidos: [] };
      const lotes = Math.ceil(validas.length / LOTE);
      const progreso = h('div', { class: 'note', role: 'status' });
      T.poner(zona, progreso);
      for (let i = 0; i < lotes; i++) {
        T.poner(progreso, 'Importando lote ', String(i + 1), ' de ', String(lotes), '… (', String(resultado.creados.length), ' creados)');
        try {
          const r = await T.api.importarColaboradores(validas.slice(i * LOTE, (i + 1) * LOTE), Number(vigencia.value));
          resultado.creados.push(...(r.creados || []));
          resultado.omitidos.push(...(r.omitidos || []));
        } catch (e) {
          resultado.error = 'Se detuvo en el lote ' + (i + 1) + ': ' + T.ui.mensajeDe(e) + ' Los lotes anteriores sí se crearon; vuelva a subir el archivo para continuar (los existentes se omiten).';
          break;
        }
      }
      mostrarResultado();
    }

    function mostrarResultado() {
      const r = resultado;
      const avisos = r.creados.filter(c => c.aviso);
      T.poner(zona,
        r.error ? h('p', { class: 'form-error' }, r.error) : null,
        h('section', { class: 'card', style: 'border:2px solid var(--gold)' },
          h('h2', null, r.creados.length + ' colaboradores creados con su código de activación'),
          h('p', null, h('strong', null, 'Imprima los códigos ahora: '), 'se muestran una sola vez. Si cierra esta pantalla sin imprimir, tendrá que generar códigos nuevos desde la lista de usuarios.'),
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn primary', disabled: !r.creados.length, onclick: () => window.print() }, 'Imprimir códigos (' + r.creados.length + ')'),
            h('a', { class: 'btn', href: '#usuarios', onclick: (e) => {
              if (r.creados.length && !window.confirm('¿Ya imprimió los códigos? No se volverán a mostrar.')) { e.preventDefault(); return; }
              window.removeEventListener('beforeunload', protegerSalida); resultado = null;
            } }, 'Terminar'))),
        r.omitidos.length ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Omitidos (' + r.omitidos.length + ')'),
          h('table', { class: 't' }, h('tbody', null, r.omitidos.map(o => h('tr', null, h('td', { class: 'mono' }, o.codigo), h('td', null, o.motivo)))))) : null,
        avisos.length ? h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', null, 'Avisos (' + avisos.length + ')'),
          h('table', { class: 't' }, h('tbody', null, avisos.map(c => h('tr', null, h('td', { class: 'mono' }, c.codigo), h('td', null, c.aviso)))))) : null,
        h('h2', { style: 'margin-top:1.5rem' }, 'Vista de impresión'),
        hojaCodigos(r.creados));
    }

    T.adm.marco('usuarios',
      h('header', null,
        h('div', null, h('h1', null, 'Importar lista de colaboradores'),
          h('p', { class: 'muted', style: 'margin:0' }, 'Cada persona recibe un código de activación propio, impreso, para crear su contraseña.')),
        h('a', { class: 'btn', href: '#usuarios' }, icon('back', 'sm'), 'Volver a usuarios')),
      h('section', { class: 'card stack' },
        h('h2', null, '1. Prepare su archivo'),
        h('p', { style: 'margin:0' }, 'Excel (.xlsx) o CSV con estas columnas en la primera fila: ', h('strong', null, 'número de empleado'), ', ', h('strong', null, 'nombre completo'),
          ', y opcionalmente ', h('strong', null, 'área'), ' y ', h('strong', null, 'supervisor'), ' (correo del supervisor ya registrado). Las áreas nuevas se crean solas.'),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: descargarPlantilla }, 'Descargar plantilla')),
        h('h2', null, '2. Súbalo'),
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('label', { for: 'archivo' }, 'Archivo'), archivo),
          h('div', { class: 'field' }, h('label', { for: 'vigencia' }, 'Vigencia de los códigos'), vigencia, h('span', { class: 'hint' }, 'Tiempo para que cada persona active su cuenta. Después, se genera otro código desde Usuarios.'))),
        h('p', { class: 'small muted', style: 'margin:0' }, 'El archivo se lee en su navegador: no se guarda en ningún servidor. Solo se envían número, nombre, área y supervisor.')),
      zona);
  });
})(window.T360);
