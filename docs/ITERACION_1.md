# TRANSPORTES 360 — Iteración 1: identidad e ingreso

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Estado | **Aplicado en `TRANSPORTES-360` el 2026-11-20** (por el conector oficial de Supabase, a pedido del usuario). Pendientes del usuario: configuración de Auth, su usuario administrador y las áreas reales (§3.1) |
| Decisiones aplicadas | D-02 (código + contraseña con activación), D-07 (exclusión del sorteo), D-09 (supervisor sin puntajes individuales) |

## 1. Qué incluye

| Pieza | Archivo | Qué hace |
|---|---|---|
| Base | `sql/01_base.sql` | Esquemas `app` (no expuesto) y `reporting`, registro de migraciones, errores con código estable, triggers genéricos. Las funciones nuevas no son ejecutables por defecto |
| Identidad | `sql/02_identidad.sql` | `roles`, `permissions`, `role_permissions`, `areas`, `profiles`, `account_activations`, `audit_logs`. **RLS activa y sin privilegios desde el primer momento** |
| Catálogos | `sql/03_catalogos.sql` | 4 roles, 22 permisos y su matriz; 6 categorías; parámetros de D-04, D-05 y D-06 |
| Seguridad | `sql/04_seguridad.sql` | Autorización (`app.tiene_permiso`, `app.exigir`), alta de perfil desde Auth (trigger en `auth.users`), RPC `fn_mi_perfil`, `fn_aceptar_privacidad`, `fn_usuarios_listar`, `fn_admin_usuario_guardar`, `fn_emitir_activacion`, canje solo para el servidor, y políticas RLS |
| Pruebas | `sql/98_…`, `sql/99_…` | 25 pruebas funcionales y 33 de seguridad; terminan en `ROLLBACK`. `sql/local/00_simulacion_supabase.sql` solo se usa en local, **nunca en Supabase** |
| Reversión | `sql/reversion/0N_….down.sql` | Deshace cada archivo (probado: deja la base sin rastro y se puede volver a aplicar) |
| Arranque | `sql/80_arranque_admin.sql` | Plantilla para activar al primer administrador principal y crear las áreas reales |
| Edge Function | `supabase/functions/activar-cuenta` | Pública: canjea el código y fija la contraseña (service_role solo en el servidor) |
| Edge Function | `supabase/functions/admin-usuarios` | Crea colaboradores (con código de activación) e invita personal administrativo |
| Frontend | `js/api/supabase/api-supabase.js`, `js/admin/usuarios.js`, `js/admin/arranque.js` | Ingreso con código o correo, activación, pantalla de usuarios, ingreso al panel con correo |

> Cambio respecto de FASE2_DISENO §6.4: las políticas RLS de cada módulo van **en el mismo archivo del módulo** (no en un `11_rls` aparte). Así ninguna tabla queda expuesta entre dos archivos.

### Cómo funciona el ingreso del colaborador

1. El administrador crea al colaborador en **Panel → Usuarios → Nuevo colaborador** (código de empleado, nombre, área, supervisor).
2. La plataforma crea su usuario en Supabase Auth con un **correo técnico** `codigo@colaboradores.t360.invalid` (sin buzón; nunca recibe correos) y una contraseña aleatoria que nadie conoce.
3. Se muestra **una sola vez** un código de activación `XXXX-XXXX` (72 h, un solo uso, máx. 5 intentos). Se entrega en persona.
4. El colaborador abre la app → **Activar mi cuenta** → código de empleado + código de activación + su contraseña.
5. Luego ingresa con **código de empleado + contraseña**. Si la olvida, su supervisor o un administrador le genera un código nuevo.

## 2. Resultados de las pruebas locales (PostgreSQL 17.6)

`powershell -NoProfile -ExecutionPolicy Bypass -File tools\probar-sql-local.ps1 -PgBin <carpeta bin de PostgreSQL>`

- **Funcionales (25):** alta inactiva desde Auth; rol solo desde `app_metadata`; elegibilidad del sorteo; asignación auditada; código sin caracteres ambiguos, guardado como hash y ausente de la auditoría; revocación del código anterior; canje con y sin guion; reutilización bloqueada; 5 intentos; vencimiento; respuesta genérica; supervisor limitado a su equipo; perfil y permisos; aviso de privacidad; listado por alcance; ascenso a administrador solo por el principal.
- **Seguridad (33):** anónimo sin acceso; colaborador ve solo su perfil; escrituras directas bloqueadas; nadie lee los hashes de activación; canje solo con service_role; auditoría inmutable incluso para el dueño de la base; administrador no gestiona administradores ni se modifica a sí mismo; usuario inactivo rechazado; todas las tablas con RLS; todas las funciones `SECURITY DEFINER` con `search_path` fijo; ninguna función ejecutable por anónimo; ninguna tabla con escritura directa.
- **Error encontrado y corregido por las pruebas:** un supervisor podía emitir códigos para colaboradores **sin supervisor asignado** (comparación con NULL). Corregido en `fn_emitir_activacion`.

**No probado todavía** (requiere el proyecto real): las Edge Functions (Deno no está instalado aquí), el inicio de sesión real con Supabase Auth, que Auth acepte el dominio técnico `.invalid` y el envío de invitaciones por correo.

## 3.1 Lo aplicado en `TRANSPORTES-360` (2026-11-20)

| Paso | Resultado |
|---|---|
| Revisión previa (solo lectura) | Proyecto vacío: sin tablas propias, funciones, triggers, políticas, buckets, usuarios, migraciones ni Edge Functions. `pgcrypto` instalado. Región us-west-2, PostgreSQL 17 |
| Migraciones `01`–`04` | Aplicadas sin errores (`app.schema_migrations`: 01, 02, 03, 04) |
| Pruebas en Supabase | **25 funcionales y 33 de seguridad correctas**. Cada suite termina con un error a propósito para revertir todo: no quedó ningún dato (0 usuarios, 0 perfiles) |
| Asesores de Supabase | Seguridad: solo avisos esperados (2 tablas con RLS y sin políticas a propósito; 5 RPC ejecutables por usuarios autenticados, que validan permisos por dentro). Rendimiento: se aplicó la migración `sql/migraciones/2026-11-20_01_indices_y_politicas_initplan.sql` (3 índices y políticas con `(select …)`), verificada con 12 comprobaciones de políticas |
| Edge Functions | `activar-cuenta` (sin verificación de JWT) y `admin-usuarios` (con verificación), activas. Sin variables definidas usan el origen de desarrollo `http://localhost:5610` y el dominio técnico `colaboradores.t360.invalid` |
| App | `js/config.js` apunta al proyecto (URL y clave pública `anon`). Prueba real sin crear datos: ingreso falso rechazado por Supabase Auth; activación falsa rechazada por la Edge Function con el mensaje genérico; el panel pide correo y contraseña |
| Modo demostración | Sigue disponible agregando `?demo=1` a la dirección |

### Lo que falta y solo puede hacer usted

1. **Authentication → Sign In / Providers → Email:** desactivar **"Allow new users to sign up"**. Mientras esté activo, alguien podría registrarse: su perfil nacería inactivo y sin rol (no vería nada), pero no debe quedar abierto.
2. **Authentication → Policies / Passwords:** contraseña mínima de **8** caracteres.
3. **Authentication → Users → Add user → Create new user:** su correo, una contraseña que solo usted conozca y *Auto Confirm User*.
4. Decirme su **correo de administrador** y las **áreas reales**: con eso ejecuto `sql/80_arranque_admin.sql` y queda como administrador principal.
5. Prueba de punta a punta: crear un colaborador de prueba desde el panel, activarlo en la app y confirmar que Supabase acepta el dominio técnico.

## 3. Pasos originales para aplicarlo manualmente (referencia)

> Cada paso se puede revertir con su archivo de `sql/reversion/`. No pegue claves en el chat.

| # | Dónde | Qué hacer |
|---|---|---|
| 0 | SQL Editor | Ejecutar las **consultas de solo lectura** de PLAN_IMPLEMENTACION §2 y enviarme el resultado (confirma que el proyecto está vacío y que `pgcrypto` existe) |
| 1 | Authentication → Sign In / Providers | Email **habilitado**; **"Allow new users to sign up": desactivado** |
| 2 | Authentication → Policies (o Passwords) | Longitud mínima de contraseña: **8** |
| 3 | SQL Editor | Ejecutar `sql/01_base.sql` (un envío) |
| 4 | SQL Editor | Ejecutar `sql/02_identidad.sql` |
| 5 | SQL Editor | Ejecutar `sql/03_catalogos.sql` |
| 6 | SQL Editor | Ejecutar `sql/04_seguridad.sql` |
| 7 | SQL Editor | Ejecutar `sql/98_pruebas_funcionales.sql` y luego `sql/99_pruebas_seguridad.sql`, **cada uno en un envío separado**. Terminan en `ROLLBACK` y no dejan datos. Si algo falla, el editor muestra "FALLÓ: …" con el nombre de la prueba; si no hay error, pasaron. (Si Supabase no permitiera a `postgres` insertar usuarios de prueba en `auth.users`, se omite este paso: las pruebas ya pasaron en local) |
| 8 | Authentication → Users | Crear su usuario administrador (correo + contraseña + *Auto Confirm User*) |
| 9 | SQL Editor | Completar y ejecutar `sql/80_arranque_admin.sql` (sus áreas reales y su correo) |
| 10 | Edge Functions | Desplegar `activar-cuenta` **sin** verificación de JWT y `admin-usuarios` **con** verificación. Secrets: `APP_ORIGIN`, `APP_URL`, `COLABORADORES_DOMINIO=colaboradores.t360.invalid`. Se puede hacer desde el panel de Supabase (editor de funciones) o con el Supabase CLI (instalarlo requiere su autorización) |
| 11 | `js/config.js` | Completar `supabase.url` y `supabase.anonKey` (públicos). **Esto sí lo puedo hacer yo** cuando me pase la URL del proyecto; la clave publicable puede pegarla usted en el archivo |
| 12 | App | Prueba de punta a punta: panel → crear un colaborador de prueba → activar su cuenta en la app → ingresar |

### Puntos a confirmar en el paso 12

- **Dominio técnico:** si Supabase Auth rechaza `colaboradores.t360.invalid`, se cambia por un subdominio de la empresa (por ejemplo `colaboradores.<dominio-de-la-empresa>`), sin crear buzones. Hay que cambiarlo en `js/config.js` y en el secret `COLABORADORES_DOMINIO`.
- **Invitaciones de personal:** el correo integrado de Supabase está muy limitado. Para invitar supervisores y administradores por correo hay que configurar SMTP (Authentication → Emails). Mientras tanto se crean a mano en Authentication → Users y se activan desde el panel.

## 4. Riesgos de esta iteración

| ID | Riesgo | Control |
|---|---|---|
| R-90 | Fuerza bruta sobre contraseñas de colaboradores | Mínimo 8 caracteres, límites de Auth por IP. Si se observan abusos: una Edge Function de ingreso con bloqueo por código (opción documentada) |
| R-91 | Código de activación interceptado | Un solo uso, 72 h, 5 intentos, entrega en persona; el panel advierte no enviarlo por WhatsApp |
| R-92 | El trigger en `auth.users` falla y bloquea altas | Probado con roles inválidos y metadatos vacíos; si fallara, el alta se rechaza completa (no quedan usuarios sin perfil) |
| R-93 | Repositorio público con la lógica de seguridad | La seguridad no depende de ocultar el código (RLS + servidor). No se suben claves ni datos (R-83) |
