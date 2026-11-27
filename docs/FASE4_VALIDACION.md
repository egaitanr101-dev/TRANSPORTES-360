# TRANSPORTES 360 — Fase 4: validación

| Campo | Valor |
|---|---|
| Fecha | 2026-11-27 |
| Resultado | Lo verificable sin su sesión: **aprobado**, con 6 correcciones aplicadas (§2). Lo que requiere su sesión real: guía en §4 |

## 1. Qué se verificó

| Verificación | Resultado |
|---|---|
| **Pruebas de la base** (8 suites: 90 a 99) | Todas correctas en la base local, con las migraciones `01` a `13` |
| **Supabase = lo probado** (`tools/huella-esquema.sql`) | Huellas idénticas en 151 funciones (código, seguridad, `search_path` y permisos), 360 columnas, 250 restricciones, 138 índices, 18 triggers, 9 políticas, 42 tablas con RLS y los permisos de tablas. Supabase ejecuta exactamente el código que pasa las pruebas |
| **Asesor de seguridad de Supabase** | Solo avisos esperados: tablas con RLS y sin políticas, y funciones `SECURITY DEFINER` llamables con sesión. Así es el diseño: todo pasa por funciones que validan el permiso. Pendiente suyo: la protección contra contraseñas filtradas |
| **Asesor de rendimiento** | Una clave foránea sin índice: corregida (`13`). 45 "índices sin usar": normal con la base vacía |
| **Acceso anónimo** | 0 funciones ejecutables sin sesión. Cada una de las ~90 llamadas del panel y la app se contrastó durante la Fase 3 |
| **Código del navegador** | Sin `innerHTML`, `eval` ni `document.write` con datos. Todo enlace que viene de datos se restringe a `https` en la base o en el dibujo. Política CSP estricta en las dos entradas (`script-src 'self'`). Sin datos en `localStorage` propios (solo la sesión de Supabase y la marca de la demostración) |
| **Secretos y datos personales en el repositorio** | Ninguno: sin claves de proveedores, ni `service_role`, ni correos personales |
| **Invitación de administradores** | Un administrador común no puede crear administradores (protegido en la Edge Function y en la base) |
| **Teléfono (375 px)** | 8 pantallas de la app y 17 del panel sin desbordes horizontales |
| **Accesibilidad** | Contraste AA (4,5:1) en modo claro y oscuro en la app y el panel; botones de 44 px; todos los campos con nombre accesible; idioma declarado; un título por pantalla |

## 2. Correcciones de esta fase

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | **La app instalable servía la versión anterior** de los archivos en la primera apertura después de una actualización (se detectó al probar los cambios de esta fase) | `sw.js`: primero la red y la copia guardada solo sin conexión (versión `0.8.1`). Con conexión siempre llega lo último |
| 2 | Texto gris secundario a 4,4:1 (menos que el mínimo de 4,5:1) | `--muted` más oscuro: 5,2:1 |
| 3 | Etiqueta verde ("Leída", puntajes) a 3,9:1 | `--good` más oscuro: 5,7:1 |
| 4 | Contador de alertas en modo oscuro a 2,7:1 | Rojo fijo: 6,6:1 |
| 5 | Botones de perfil y de cerrar cápsula de 38 px; barras de avance de 6 px de alto que además son botones | 44 px; barras con área táctil de 24 px |
| 6 | En el editor de la semana, 6 campos con la etiqueta sin asociar: el lector de pantalla no decía qué era cada campo | En todo el panel, cada etiqueta se asocia sola a su campo (`js/admin/marco.js`) |
| 7 | Clave foránea sin índice | `sql/13_ajustes_fase4.sql` |

## 3. Riesgos conocidos y aceptados (sin cambio)

- **Bloqueo de activación:** quien conozca el código de empleado de otra persona puede agotar sus 5 intentos de activación. No obtiene acceso: el administrador emite un código nuevo.
- **La sesión de Supabase se guarda en el navegador.** Es el comportamiento estándar de supabase-js en una app sin servidor propio (R-16). Se mitiga con la CSP estricta y sin HTML no confiable.
- **Iframes:** la protección contra que otro sitio muestre la app dentro de un iframe (`frame-ancestors`) solo se puede poner como cabecera del servidor. Va en la Fase 5, según dónde se publique.

## 4. Guía de validación con su sesión (lo que no puedo hacer yo)

No ingreso contraseñas. Los pasos con su cuenta los hace usted en `http://localhost:5610/admin.html` (o me avisa y los recorremos juntos en el navegador del panel, con usted ya dentro). Cada paso deja registros reales en Supabase; los de prueba se pueden archivar después.

1. **Ingreso al panel** con su correo: debe abrir en *Resumen* y mostrar "No hay una capacitación publicada esta semana".
2. **Usuarios → Generar código** para E-7241. En otra ventana, `http://localhost:5610/` → *Activar mi cuenta* con E-7241 y ese código. Elija una contraseña de 8 o más caracteres.
3. **Capacitación semanal → Nueva semana** para el próximo lunes. Llénela (o use "Usar ejemplo"), *Vista previa*, *Enviar a revisión* y *Aprobar*: queda marcada como aprobada por "único aprobador".
4. **Alertas:** cree una preventiva con fuente y vencimiento, apruébela. Con E-7241, ábrala y confírmela. En el panel debe decir "1 de 1 confirmaron".
5. **Biblioteca:** suba un Word real; búsquelo por una palabra. Descárguelo (enlace de 1 minuto).
6. **Generador IA → Simulación:** una semana completa. Debe decir "no se convierte en contenido".
7. **Reportes:** revise que las cifras coincidan con lo que hizo.
8. **Teléfono:** abra la app en su celular (misma red, o tras la publicación). Use *Agregar a la pantalla de inicio* y confirme que se ve el ícono.

## 5. Antes de publicar (Fase 5, solo cuando usted lo pida)

| Tema | Acción |
|---|---|
| Supabase Auth | Desactivar el registro libre; contraseña mínima de 8; protección contra contraseñas filtradas; *Site URL* y redirecciones con la dirección pública |
| Edge Functions | Variable `APP_ORIGINS` con la dirección pública (hoy solo acepta `localhost`) |
| `js/config.js` | `urlPublica` (enlaces de WhatsApp y tarjetas de activación) |
| Hosting | HTTPS y cabeceras: `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`; que no sirva `docs/`, `sql/`, `supabase/` ni `tools/` |
| Plan de Supabase | Pago para operación real (copias de seguridad diarias y sin pausa por inactividad; D-15) |
| Legal | Aviso de privacidad y reglamento del sorteo definitivos (hoy los textos son provisionales) |
| Pendientes de su decisión | Tareas programadas (`pg_cron`), QR, avisos fuera de la app, PDF, alertas con fuente validada, documentos para la IA, cuatro ojos en la capacitación |
