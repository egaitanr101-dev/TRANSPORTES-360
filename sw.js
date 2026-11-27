/* TRANSPORTES 360 — Service worker de la app del colaborador (PWA, iteración 8).
 * Guarda SOLO los archivos de la aplicación (pantallas, estilos, código, imágenes propias) para que abra rápido
 * y se pueda instalar. NUNCA guarda respuestas de Supabase: ni contenido, ni puntajes, ni datos personales.
 * Las respuestas a las evaluaciones exigen conexión. El panel (admin.html) no se guarda.
 * Al cambiar algún archivo de la lista, suba VERSION para que todos reciban la versión nueva. */
'use strict';
const VERSION = 't360-app-0.8.0';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/tokens.css', 'css/base.css', 'css/colaborador.css',
  'js/config.js', 'js/core/dom.js', 'js/core/ui.js', 'js/core/enrutador.js', 'js/core/capsula-vista.js', 'js/core/alerta-vista.js',
  'js/api/api.js', 'js/api/supabase/api-supabase.js', 'js/vendor/supabase-js-2.45.4.js',
  'js/colaborador/marco.js', 'js/colaborador/ingreso.js', 'js/colaborador/inicio.js', 'js/colaborador/semana.js',
  'js/colaborador/capsula.js', 'js/colaborador/alertas.js', 'js/colaborador/historial.js', 'js/colaborador/arranque.js',
  'assets/img/portada-estafas.svg', 'assets/img/ejemplo-luis.svg', 'assets/img/infografia-estafas.svg',
  'assets/icons/icono-192.png', 'assets/icons/icono-512.png', 'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('t360-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos propios y solo lectura. Supabase y cualquier otro dominio pasan directo a la red, sin guardarse.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // El panel y la simulación de demostración no se guardan.
  if (/admin\.html$|\/js\/admin\/|\/js\/api\/mock\//.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    // Pantalla: primero la red (para tener siempre la versión vigente); sin conexión, la guardada.
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }
  if (!ARCHIVOS.some(a => url.pathname.endsWith('/' + a.replace('./', '')))) return;
  // Archivos de la app: la copia guardada al instante y, en segundo plano, se actualiza desde la red.
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const guardada = await c.match(req);
    const red = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => guardada);
    return guardada || red;
  }));
});
