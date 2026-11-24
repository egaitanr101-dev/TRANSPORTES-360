/* TRANSPORTES 360 — Cómo se ven una alerta y un consejo. Lo usan la app del colaborador y la vista previa del panel.
   Todo el texto pasa por T.h (textContent); los enlaces de fuente solo se aceptan si son https. */
(function (T) {
  'use strict';
  const { h, icon } = T;
  const TEXTO = { INFORMATIVA: 'Informativa', PREVENTIVA: 'Preventiva', ALTA: 'Alta', CRITICA: 'Crítica' };
  const CLASE = { INFORMATIVA: 'info', PREVENTIVA: 'warn', ALTA: 'high', CRITICA: 'crit' };

  T.prioridad = { lista: Object.keys(TEXTO), texto: (p) => TEXTO[p] || p, clase: (p) => CLASE[p] || '' };

  T.fechas = {
    /** "18 nov 2026" en hora de Costa Rica */
    corta(ts) { return ts ? new Date(ts).toLocaleDateString('es-CR', { timeZone: T.config.zonaHoraria, day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
    hora(ts) { return ts ? new Date(ts).toLocaleString('es-CR', { timeZone: T.config.zonaHoraria, dateStyle: 'medium', timeStyle: 'short' }) : ''; },
    /** Valor de <input type="datetime-local"> en hora de Costa Rica (UTC−6 todo el año) */
    aCampo(ts) { return ts ? new Date(ts).toLocaleString('sv-SE', { timeZone: T.config.zonaHoraria }).slice(0, 16).replace(' ', 'T') : ''; },
    deCampo(v) { return v ? v + ':00-06:00' : null; }
  };

  T.alertaVista = function (a) {
    const segura = a.fuente_url && /^https:\/\/[^\s<>"]+$/.test(a.fuente_url);
    return [
      h('div', { class: 'row wrap' }, h('span', { class: 'chip ' + T.prioridad.clase(a.prioridad) }, 'Prioridad ' + T.prioridad.texto(a.prioridad)), a.categoria ? h('span', { class: 'chip' }, a.categoria) : null),
      h('h1', null, a.titulo),
      h('p', { class: 'small muted' }, (a.publica ? 'Publicada ' + T.fechas.corta(a.publica) + ' · ' : '') + (a.vence ? 'Vigente hasta ' + T.fechas.hora(a.vence) : '')),
      h('p', { style: 'white-space:pre-line' }, a.descripcion),
      h('div', { class: 'card' }, h('div', { class: 'block-label' }, 'Riesgo'), h('p', { style: 'margin:0;white-space:pre-line' }, a.riesgo)),
      h('div', null, h('h2', null, 'Qué hacer'), h('ul', { class: 'checklist' }, (a.recomendaciones || []).map(t => h('li', null, icon('check', 'sm'), h('span', null, t))))),
      h('p', { class: 'source' }, 'Fuente: ' + (a.fuente || '—'), segura ? [' · ', h('a', { href: a.fuente_url, target: '_blank', rel: 'noopener noreferrer' }, 'Ver fuente')] : null)
    ];
  };

  /** Texto para WhatsApp. El enlace (si la app ya tiene dirección pública) lleva al consejo dentro de la app. */
  T.textoCompartir = function (c) {
    const base = c.compartir || (c.titulo + '\n' + c.texto);
    const enlace = T.config.urlPublica ? '\n' + T.config.urlPublica.replace(/\/+$/, '') + '/#consejo/' + encodeURIComponent(c.id) : '';
    return base + enlace;
  };

  T.consejoVista = function (c, etiqueta) {
    return h('section', { class: 'card tip' },
      h('div', { class: 'label' }, etiqueta || c.categoria || 'Consejo breve · 30 s'),
      h('h2', null, c.titulo),
      h('p', { style: 'white-space:pre-line' }, c.texto),
      c.fuente ? h('p', { class: 'source' }, 'Fuente: ' + c.fuente) : null,
      h('a', { class: 'btn wa', href: 'https://wa.me/?text=' + encodeURIComponent(T.textoCompartir(c)), target: '_blank', rel: 'noopener noreferrer' }, icon('share', 'sm'), 'Compartir por WhatsApp'));
  };
})(window.T360);
