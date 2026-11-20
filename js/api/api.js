/* TRANSPORTES 360 — Selección de la implementación de T360.api según T360.config.modo.
 *   DEMO     → js/api/mock      (datos ficticios en memoria; simula al servidor)
 *   SUPABASE → js/api/supabase  (proyecto TRANSPORTES-360; RPC con RLS)
 * Las pantallas solo usan T360.api (siempre funciones async), por eso no cambian entre modos.
 *
 * Los archivos del modo DEMO se cargan SOLO en modo DEMO: así la simulación de respuestas correctas
 * nunca se descarga en modo SUPABASE, donde la corrección ocurre exclusivamente en el servidor (R-02). */
(function (T) {
  'use strict';
  const base = document.currentScript.src.replace(/api\.js(\?.*)?$/, '');

  function cargar(ruta) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = base + ruta;
      s.onload = ok;
      s.onerror = () => mal(T.error('RED', 'No se pudo cargar ' + ruta));
      document.head.appendChild(s);
    });
  }

  T.listo = (async () => {
    if (T.config.modo === 'SUPABASE') {
      await cargar('../vendor/supabase-js-2.45.4.js');
      await cargar('supabase/api-supabase.js');
      T.api = T.apiSupabase.crear(T.config.supabase);
    } else {
      await cargar('mock/datos.js');
      await cargar('mock/api-mock.js');
      T.api = T.apiMock;
    }
    return T.api;
  })();
})(window.T360);
