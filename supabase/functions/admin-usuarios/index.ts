// =============================================================================
// Edge Function "admin-usuarios" — Alta de usuarios (requiere service_role, que NUNCA va al navegador).
// Patrón tomado de ArreoPrime (admin-invitar): quien llama se valida en la base con SU identidad, y los cambios
// de rol/área pasan por las mismas RPC auditadas (fn_admin_usuario_guardar, fn_emitir_activacion).
//
// Acciones (POST JSON):
//   { accion: "crear_colaborador", codigo_empleado, nombre, area_id?, supervisor_id? }
//       → crea el usuario de Auth con un correo técnico derivado del código (sin buzón real) y una contraseña
//         aleatoria que nadie conoce; el perfil nace inactivo y se emite un código de activación (se muestra UNA vez).
//   { accion: "invitar_personal", correo, nombre, rol: SUPERVISOR|ADMIN|ADMIN_PRINCIPAL, area_id? }
//       → invitación por correo (requiere SMTP configurado en Supabase) y perfil activo con el rol indicado.
//
// Se despliega CON verificación de JWT (solo usuarios con sesión).
// Variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (automáticas),
//            APP_ORIGINS (orígenes permitidos separados por coma), APP_URL y COLABORADORES_DOMINIO
//            (debe coincidir con js/config.js → dominioColaboradores). Sin variables: entorno local de desarrollo.
// =============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ORIGENES = (Deno.env.get('APP_ORIGINS') ?? 'http://localhost:5610').split(',').map((o) => o.trim()).filter(Boolean);
const APP_URL = Deno.env.get('APP_URL') ?? ORIGENES[0];
const DOMINIO = Deno.env.get('COLABORADORES_DOMINIO') ?? 'colaboradores.t360.invalid';
const RE_CODIGO = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES_PERSONAL = ['SUPERVISOR', 'ADMIN', 'ADMIN_PRINCIPAL'];

/** Cabeceras CORS calculadas por petición (nunca compartidas entre peticiones simultáneas). */
function corsDe(req: Request): { permitido: boolean; cabeceras: Record<string, string> } {
  const origen = req.headers.get('Origin') ?? '';
  const permitido = ORIGENES.includes(origen);
  return {
    permitido,
    cabeceras: {
      'Access-Control-Allow-Origin': permitido ? origen : ORIGENES[0],
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  };
}
function contrasenaAleatoria(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, '').slice(0, 40);
}

Deno.serve(async (req: Request) => {
  const { permitido, cabeceras } = corsDe(req);
  const respuesta = (cuerpo: unknown, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cabeceras, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabeceras });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);
  if (!permitido) return respuesta({ error: 'Origen no permitido' }, 403);

  const url = Deno.env.get('SUPABASE_URL')!;
  const autorizacion = req.headers.get('Authorization') ?? '';
  if (!autorizacion.startsWith('Bearer ')) return respuesta({ error: 'No autenticado' }, 401);

  // Cliente con la identidad de quien llama: la base de datos decide qué puede hacer.
  const llamante = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: perfil, error: ePerfil } = await llamante.rpc('fn_mi_perfil');
  const permisos: string[] = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  if (ePerfil || !permisos.includes('usuarios.gestionar')) return respuesta({ error: 'No autorizado' }, 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const cuerpo = await req.json().catch(() => null);
  const accion = String(cuerpo?.accion ?? '');
  const nombre = String(cuerpo?.nombre ?? '').trim();
  const area = cuerpo?.area_id ? String(cuerpo.area_id) : null;
  if (nombre.length < 3) return respuesta({ error: 'El nombre debe tener al menos 3 caracteres.' }, 400);

  if (accion === 'crear_colaborador') {
    const codigo = String(cuerpo?.codigo_empleado ?? '').trim().toUpperCase();
    if (!RE_CODIGO.test(codigo)) return respuesta({ error: 'Código de empleado no válido (letras, números y guiones).' }, 400);
    const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
      email: codigo.toLowerCase() + '@' + DOMINIO,
      password: contrasenaAleatoria(),           // nadie la conoce: la cuenta solo se usa tras canjear el código
      email_confirm: true,
      app_metadata: { role: 'COLABORADOR', employee_code: codigo, full_name: nombre },
    });
    if (eCrear || !creado?.user) {
      const duplicado = /already|registered|exists/i.test(eCrear?.message ?? '');
      return respuesta({ error: duplicado ? 'Ya existe un usuario con ese código de empleado.' : 'No se pudo crear el usuario: ' + (eCrear?.message ?? '') }, duplicado ? 409 : 400);
    }
    const id = creado.user.id;
    const cambios: Record<string, unknown> = {};
    if (area) cambios.area_id = area;
    if (cuerpo?.supervisor_id) cambios.supervisor_id = String(cuerpo.supervisor_id);
    if (Object.keys(cambios).length) {
      const { error } = await llamante.rpc('fn_admin_usuario_guardar', { p_usuario: id, p: cambios });
      if (error) return respuesta({ error: error.message, usuario_id: id, nota: 'Usuario creado; revise área y supervisor.' }, 400);
    }
    const { data: act, error: eAct } = await llamante.rpc('fn_emitir_activacion', { p_usuario: id });
    if (eAct) return respuesta({ error: eAct.message, usuario_id: id, nota: 'Usuario creado; genere el código desde la lista.' }, 400);
    return respuesta({ id, codigo_activacion: act.codigo, vence: act.vence });
  }

  if (accion === 'invitar_personal') {
    const correo = String(cuerpo?.correo ?? '').trim().toLowerCase();
    const rol = String(cuerpo?.rol ?? '');
    if (!RE_CORREO.test(correo)) return respuesta({ error: 'Correo no válido.' }, 400);
    if (!ROLES_PERSONAL.includes(rol)) return respuesta({ error: 'Rol no válido.' }, 400);
    if (rol !== 'SUPERVISOR' && !permisos.includes('usuarios.gestionar_staff')) return respuesta({ error: 'Solo el administrador principal invita administradores.' }, 403);
    const { data: inv, error: eInv } = await admin.auth.admin.inviteUserByEmail(correo, { redirectTo: APP_URL + '/admin.html' });
    if (eInv || !inv?.user) return respuesta({ error: 'No se pudo enviar la invitación. Revise la configuración de correo (SMTP) en Supabase.' }, 400);
    // El perfil nace inactivo y sin rol; se completa con la RPC auditada, con la identidad de quien invita.
    const { error } = await llamante.rpc('fn_admin_usuario_guardar', {
      p_usuario: inv.user.id, p: { full_name: nombre, role_id: rol, area_id: area, is_active: true },
    });
    if (error) return respuesta({ error: error.message, usuario_id: inv.user.id, nota: 'Invitación enviada; perfil pendiente de completar.' }, 400);
    return respuesta({ id: inv.user.id, correo });
  }

  return respuesta({ error: 'Acción no válida' }, 400);
});
