/* TRANSPORTES 360 — Extracción de texto en el navegador del administrador (D-11), sin enviar el archivo a nadie.
   TXT directo; DOCX y PPTX con el lector ZIP de SheetJS (ya incluido en js/vendor, sin dependencias nuevas) y el
   lector XML del navegador; XLSX con SheetJS. PDF: pendiente (requiere una librería o la IA; ver ITERACION_6).
   El texto se trata como DATOS: nunca se inserta como HTML. */
(function (T) {
  'use strict';
  const MIME = {
    pdf: 'application/pdf', txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  const MAX = 25 * 1024 * 1024;

  function cargarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/xlsx-0.20.3.full.min.js';
      s.onload = ok; s.onerror = () => mal(T.error('RED', 'No se pudo cargar el lector de documentos.'));
      document.head.appendChild(s);
    });
  }

  async function sha256(buf) {
    if (!(window.crypto && crypto.subtle)) throw T.error('VALIDACION', 'Este navegador no puede calcular la huella del archivo (use https o localhost).');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Agrupa piezas {seccion, texto} en fragmentos de hasta ~1500 caracteres (máximo 3500), sin mezclar secciones. */
  function fragmentar(piezas) {
    const out = [];
    let actual = null;
    const cerrar = () => { if (actual && actual.texto.trim()) out.push(actual); actual = null; };
    for (const p of piezas) {
      let t = String(p.texto || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
      if (!t) continue;
      const seccion = String(p.seccion || '').trim().slice(0, 200);
      if (actual && (actual.seccion !== seccion || actual.texto.length + t.length > 1500)) cerrar();
      while (t.length > 3500) { cerrar(); out.push({ seccion, texto: t.slice(0, 3500) }); t = t.slice(3500); }
      if (!actual) actual = { seccion, texto: t };
      else actual.texto += '\n' + t;
    }
    cerrar();
    return out;
  }

  function xml(bytes) {
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw T.error('VALIDACION', 'El archivo está dañado o no es un documento de Office.');
    return doc;
  }
  /** Busca una parte del ZIP por el final de su ruta (las rutas internas pueden empezar con "Root Entry/" o "/"). */
  function entrada(zip, ruta) {
    const fin = '/' + ruta.toLowerCase();
    const i = zip.FullPaths.findIndex(p => ('/' + p.toLowerCase()).endsWith(fin));
    const e = i >= 0 ? zip.FileIndex[i] : null;
    return e && e.content && e.content.length ? e.content : null;
  }

  function docx(zip) {
    const cuerpo = entrada(zip, 'word/document.xml');
    if (!cuerpo) throw T.error('VALIDACION', 'No parece un documento de Word (.docx).');
    const piezas = []; let seccion = '';
    for (const p of xml(cuerpo).getElementsByTagName('w:p')) {
      const texto = Array.from(p.getElementsByTagName('w:t'), t => t.textContent).join('');
      const estilo = (p.getElementsByTagName('w:pStyle')[0] || { getAttribute: () => '' }).getAttribute('w:val') || '';
      if (/^(heading|t[ií]tulo|title)/i.test(estilo) && texto.trim()) { seccion = texto.trim(); continue; }
      piezas.push({ seccion, texto });
    }
    return { piezas, paginas: null };
  }

  function pptx(zip) {
    const diapos = zip.FullPaths.map(r => (r.match(/ppt\/slides\/slide(\d+)\.xml$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
    if (!diapos.length) throw T.error('VALIDACION', 'No parece una presentación de PowerPoint (.pptx).');
    const piezas = [];
    for (const n of diapos) {
      const d = xml(entrada(zip, 'ppt/slides/slide' + n + '.xml'));
      for (const p of d.getElementsByTagName('a:p')) piezas.push({ seccion: 'Diapositiva ' + n, texto: Array.from(p.getElementsByTagName('a:t'), t => t.textContent).join('') });
    }
    return { piezas, paginas: diapos.length };
  }

  function xlsx(buf) {
    const libro = window.XLSX.read(buf, { type: 'array' });
    const piezas = [];
    for (const nombre of libro.SheetNames) {
      const filas = window.XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: false, defval: '' });
      for (const f of filas) { const t = f.map(c => String(c).trim()).filter(Boolean).join(' · '); if (t) piezas.push({ seccion: 'Hoja ' + nombre, texto: t }); }
    }
    return { piezas, paginas: libro.SheetNames.length };
  }

  /** Lee el archivo y devuelve todo lo necesario para registrar la versión. No sube nada. */
  T.extraer = async function (archivo) {
    const ext = String(archivo.name || '').toLowerCase().split('.').pop();
    if (!MIME[ext]) throw T.error('VALIDACION', 'Formatos permitidos: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx) y texto (.txt).');
    if (archivo.size > MAX) throw T.error('VALIDACION', 'El archivo supera 25 MB.');
    if (!archivo.size) throw T.error('VALIDACION', 'El archivo está vacío.');
    const buf = await archivo.arrayBuffer();
    const base = { mime: MIME[ext], ext, nombre: archivo.name, tamano: archivo.size, sha256: await sha256(buf) };
    let r = { piezas: [], paginas: null }, nota = null;
    if (ext === 'txt') {
      const texto = new TextDecoder('utf-8').decode(buf);
      r.piezas = texto.split(/\n\s*\n/).map(t => ({ seccion: '', texto: t }));
    } else if (ext === 'pdf') {
      nota = 'PDF: la extracción de texto está pendiente de autorización (librería o IA). El archivo se guarda, pero no se busca.';
    } else {
      await cargarSheetJS();
      if (ext === 'xlsx') r = xlsx(buf);
      else {
        let zip;
        try { zip = window.XLSX.CFB.read(new Uint8Array(buf), { type: 'array' }); } catch (e) { throw T.error('VALIDACION', 'El archivo está dañado o no es un documento de Office.'); }
        r = ext === 'docx' ? docx(zip) : pptx(zip);
      }
    }
    const fragmentos = fragmentar(r.piezas);
    if (!fragmentos.length && !nota) nota = 'No se encontró texto (¿es una imagen escaneada?).';
    return Object.assign(base, { paginas: r.paginas, fragmentos, nota });
  };
  T.extraer.fragmentar = fragmentar;
})(window.T360);
