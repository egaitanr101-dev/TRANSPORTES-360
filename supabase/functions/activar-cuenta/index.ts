// =============================================================================
// Edge Function "activar-cuenta" — El colaborador canjea su código de activación y crea su contraseña (D-02).
//
// Es PÚBLICA (el colaborador aún no tiene sesión): desplegar con  --no-verify-jwt
//   supabase functions deploy activar-cuenta --no-verify-jwt
// Seguridad:
//   - La verificación del código ocurre en la base (fn_srv_verificar_activacion): hash bcrypt, 72 h, máx. 5 intentos.
//   - Ante cualquier fallo responde el MISMO mensaje: no revela si el código de empleado existe.
//   - La contraseña se fija con la service_role (solo en el servidor) y nunca se registra.
//   - Orden: verificar → fijar contraseña → confirmar (si algo falla antes de confirmar, el código sigue vigente).
// Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticas) y APP_ORIGIN (p. ej. https://transportes360.ejemplo.cr)
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ORIGEN = Deno.env.get('APP_ORIGIN') ?? '';
const CORS = {
  'Access-Control-Allow-Origin': ORIGEN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const GENERICO = 'El código de activación no es válido o ya venció. Pida uno nuevo a su supervisor.';
const RE_CODIGO = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

function respuesta(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);
  if (ORIGEN && req.headers.get('Origin') !== ORIGEN) return respuesta({ error: 'Origen no permitido' }, 403);

  const cuerpo = await req.json().catch(() => null);
  const codigo = String(cuerpo?.codigo_empleado ?? '').trim().toUpperCase();
  const activacion = String(cuerpo?.codigo_activacion ?? '').trim();
  const contrasena = String(cuerpo?.contrasena ?? '');

  if (!RE_CODIGO.test(codigo) || activacion.length < 8 || activacion.length > 12) return respuesta({ error: GENERICO }, 400);
  const bytes = new TextEncoder().encode(contrasena).length;
  if (contrasena.length < 8 || bytes > 72) return respuesta({ error: 'La contraseña debe tener al menos 8 caracteres (y no más de 72).' }, 400);
  if (contrasena.toUpperCase().includes(codigo)) return respuesta({ error: 'La contraseña no puede contener su código de empleado.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: v, error: e1 } = await admin.rpc('fn_srv_verificar_activacion', { p_codigo_empleado: codigo, p_codigo: activacion });
  if (e1) return respuesta({ error: 'No se pudo verificar en este momento. Intente de nuevo.' }, 500);
  if (!v?.ok) return respuesta({ error: GENERICO }, 400);

  const { error: e2 } = await admin.auth.admin.updateUserById(v.user_id, { password: contrasena });
  if (e2) return respuesta({ error: 'La contraseña no cumple la política de seguridad. Use una más larga o distinta.' }, 400);

  const { error: e3 } = await admin.rpc('fn_srv_confirmar_activacion', { p_activation_id: v.activation_id });
  if (e3) return respuesta({ error: GENERICO }, 400);

  return respuesta({ ok: true });
});
