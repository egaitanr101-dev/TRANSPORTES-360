/* TRANSPORTES 360 — Implementación de T360.api contra Supabase.
 * ITERACIÓN 0: solo crea el cliente. Cada función se implementa en su iteración llamando a la RPC
 * correspondiente (MODELO_DATOS_PROPUESTO §8). Mientras tanto devuelve NO_IMPLEMENTADO,
 * para que nadie confunda una pantalla vacía con datos reales. */
(function (T) {
  'use strict';
  const METODOS = [
    // colaborador
    'ingresar', 'activar', 'salir', 'inicio', 'semana', 'capsula', 'responderCapsula', 'alertas', 'alerta', 'confirmarAlerta', 'historial',
    // panel
    'adminSesion', 'resumen', 'generarBorrador', 'borrador', 'sorteoSemana', 'ejecutarSorteo'
  ];

  T.apiSupabase = {
    crear(cfg) {
      const cliente = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const api = { modo: 'SUPABASE', cliente };
      for (const m of METODOS) {
        api[m] = () => Promise.reject(T.error('NO_IMPLEMENTADO', 'Pendiente de la iteración correspondiente: ' + m));
      }
      // La sesión sí se puede consultar desde ya (no requiere tablas propias).
      api.sesion = async () => {
        const { data } = await cliente.auth.getSession();
        return data && data.session ? { id: data.session.user.id } : null;
      };
      return api;
    }
  };
})(window.T360);
