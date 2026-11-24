/* TRANSPORTES 360 — Configuración PÚBLICA del frontend.
 *
 * Para conectar a Supabase (iteración 1) se completan "url" y "anonKey" (Project Settings → API).
 * Ambos valores son públicos por diseño: la seguridad la aplican RLS y las funciones del servidor.
 * NUNCA colocar aquí la service_role, contraseñas, ni claves de OpenAI/Anthropic: esas viven
 * solo en los Secrets de Supabase Edge Functions.
 *
 * Con url vacía la aplicación funciona en modo DEMO (datos ficticios en memoria, sin red).
 * Agregar ?demo=1 a la dirección fuerza el modo DEMO aunque haya url.
 */
window.T360 = window.T360 || {};

T360.config = {
  nombreApp: 'TRANSPORTES 360',
  lema: 'Aprende · Cuídate · Protégete · Crece',
  version: '0.4.0 · Fase 3 · iteración 4',
  zonaHoraria: 'America/Costa_Rica',
  supabase: {
    // Proyecto TRANSPORTES-360 (conectado el 2026-11-20). Ambos valores son PÚBLICOS por diseño:
    // la clave "anon" solo identifica el proyecto; los datos los protegen RLS y las funciones del servidor.
    url: 'https://edtxothslyrdjhcybcjf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdHhvdGhzbHlyZGpoY3liY2pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzUyNTUsImV4cCI6MjExMDc1MTI1NX0.oyzjvdYOpGZ76SYC8AjBxfOezxNbDEl5JF1JKDIN6Fg'
  },
  // Dirección pública de la app (se imprime en las tarjetas de activación). Vacía = la dirección actual.
  urlPublica: '',
  // Correo técnico de los colaboradores en Supabase Auth: <código>@<dominio>. No tiene buzón ni recibe correos.
  // DEBE coincidir con la variable COLABORADORES_DOMINIO de la Edge Function admin-usuarios.
  dominioColaboradores: 'colaboradores.t360.invalid'
};

T360.config.modo = T360.config.supabase.url ? 'SUPABASE' : 'DEMO';
if (/[?&]demo=1\b/.test(location.search)) T360.config.modo = 'DEMO';
