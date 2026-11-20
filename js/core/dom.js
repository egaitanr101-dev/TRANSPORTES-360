/* TRANSPORTES 360 — Utilidades de DOM.
   REGLA DE SEGURIDAD (R-30): todo texto se inserta como nodo de texto (textContent), nunca con innerHTML.
   El contenido generado por IA, los documentos y los nombres son datos no confiables. */
window.T360 = window.T360 || {};
(function (T) {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';

  /** h('div', {class: 'x', onclick: fn}, 'texto', nodo) → elemento. */
  T.h = function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') throw new Error('innerHTML no está permitido');
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  T.limpiar = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /** Reemplaza el contenido de el con los hijos dados, ignorando null/false (el append nativo los escribiría como texto). */
  T.poner = function (el, ...hijos) {
    T.limpiar(el);
    for (const c of hijos.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  // Íconos de trazo propios (24×24)
  const ICONOS = {
    home: ['M3 11l9-7 9 7', 'M5 10v10h5v-6h4v6h5V10'],
    week: ['M4 6h16v14H4z', 'M4 10h16', 'M9 3v4', 'M15 3v4'],
    bell: ['M6 16V11a6 6 0 0112 0v5l2 2H4z', 'M10 20a2 2 0 004 0'],
    history: ['M4 12a8 8 0 108-8 8 8 0 00-6 2.7', 'M4 4v4h4', 'M12 8v4l3 2'],
    check: ['M5 12l5 5L20 7'],
    x: ['M6 6l12 12', 'M18 6L6 18'],
    share: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 13v6h14v-6'],
    clock: ['M12 21a9 9 0 110-18 9 9 0 010 18z', 'M12 7v5l3 2'],
    back: ['M15 5l-7 7 7 7'],
    chevron: ['M9 5l7 7-7 7'],
    lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 018 0v3'],
    star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
    shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
    heart: ['M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z'],
    coin: ['M12 21a9 9 0 110-18 9 9 0 010 18z', 'M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5', 'M12 6v2', 'M12 16v2'],
    phone: ['M8 3h8v18H8z', 'M11 18h2'],
    family: ['M8 11a3 3 0 100-6 3 3 0 000 6z', 'M16 11a3 3 0 100-6 3 3 0 000 6z', 'M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6', 'M14 14.3A6 6 0 0122 20'],
    growth: ['M4 19h16', 'M6 15l4-4 3 3 5-6', 'M14 8h4v4'],
    alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17v.5'],
    doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
    users: ['M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5', 'M17 4.5a3.5 3.5 0 010 6.5', 'M19 14c1.6.9 2.5 2.7 2.5 6'],
    spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6 6l2.5 2.5', 'M15.5 15.5L18 18', 'M18 6l-2.5 2.5', 'M8.5 15.5L6 18'],
    gift: ['M4 10h16v10H4z', 'M3 7h18v3H3z', 'M12 7v13', 'M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1z'],
    chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
    gear: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
    speaker: ['M4 9h4l5-4v14l-5-4H4z', 'M16 9a4 4 0 010 6', 'M18.5 6.5a8 8 0 010 11'],
    audit: ['M9 4h6v3H9z', 'M6 6h12v15H6z', 'M9 12l2 2 4-4'],
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 14h2', 'M12 14h2', 'M16 14h2', 'M8 17h2']
  };
  T.icon = function icon(nombre, extra) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'icon' + (extra ? ' ' + extra : ''));
    s.setAttribute('aria-hidden', 'true');
    for (const d of ICONOS[nombre] || []) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    }
    return s;
  };

  /** Marca provisional TRANSPORTES 360 (anillo 360°), hasta tener el logo oficial (D-13). */
  T.logo = function logo(size) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 48 48');
    s.setAttribute('width', size || 34);
    s.setAttribute('height', size || 34);
    s.setAttribute('aria-hidden', 'true');
    const add = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); s.appendChild(e); return e; };
    add('circle', { cx: 24, cy: 24, r: 21, fill: 'none', stroke: '#f0b020', 'stroke-width': 4, 'stroke-dasharray': '110 22', transform: 'rotate(-60 24 24)' });
    add('path', { d: 'M38.5 10.5l3.5-1-1 3.6', fill: 'none', stroke: '#f0b020', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const t = add('text', { x: 24, y: 29, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#ffffff', 'font-family': 'Segoe UI, Arial, sans-serif' });
    t.textContent = '360';
    return s;
  };

  /** Ilustración de flotilla (SVG propio, sin derechos de terceros). */
  T.flotilla = function flotilla() {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 240 90');
    s.setAttribute('class', 'fleet');
    s.setAttribute('aria-hidden', 'true');
    const camion = (x, y, k) => {
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
      g.setAttribute('fill', '#ffffff');
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', 'M0 10h70v34H0zM72 20h20l12 12v12H72zM78 24v8h18l-8-8z');
      g.appendChild(p);
      for (const cx of [14, 30, 86]) {
        const c = document.createElementNS(SVG, 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', 46); c.setAttribute('r', 7);
        c.setAttribute('fill', '#0b1d3a'); c.setAttribute('stroke', '#ffffff'); c.setAttribute('stroke-width', 3);
        g.appendChild(c);
      }
      s.appendChild(g);
    };
    camion(4, 26, .78);
    camion(118, 18, 1.05);
    return s;
  };

  /** Identificador aleatorio para claves de idempotencia (UUID v4 del navegador). */
  T.uuid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const x = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  };
})(window.T360);
