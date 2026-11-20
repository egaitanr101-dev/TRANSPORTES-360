# TRANSPORTES 360 — Auditoría técnica (Fase 1)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-20 |
| Alcance | Carpeta local `APP TRANSPORTES 360`, entorno del equipo y proyecto vecino `APP TICKETS CARNICO` (ArreoPrime) como referencia reutilizable |
| Método | Solo lectura. Sin conexión a Supabase ni a ningún servicio remoto. Sin instalar nada. Las claves se ocultaron al leer los archivos. |
| Estado | **Proyecto nuevo** (confirmado por el usuario el 2026-11-20): no hay código ni base de datos de TRANSPORTES 360 que auditar. |

Documentos relacionados: [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md) · [MAPA_FUNCIONAL.md](MAPA_FUNCIONAL.md) · [MODELO_DATOS_PROPUESTO.md](MODELO_DATOS_PROPUESTO.md) · [RIESGOS_Y_SEGURIDAD.md](RIESGOS_Y_SEGURIDAD.md)

---

## 1. Hallazgo principal

La carpeta del proyecto estaba **vacía** (ni archivos visibles, ni ocultos, ni marcadores de OneDrive solo en la nube). Se buscó "TRANSPORTES 360" en todo `11-DATA TRANSPORTES CARNICO` y carpetas con "360" o "capacita" en OneDrive, Escritorio, Documentos y Descargas: no existe otra copia.

Consecuencias:

1. Las reglas del prompt maestro pensadas para un proyecto existente ("no reconstruir", "conservar funcionalidades", "migraciones aditivas sobre tablas existentes") **no tienen objeto todavía**. Se aplican desde el primer commit en adelante.
2. La regla "ya existe un proyecto de Supabase creado y conectado" **no se pudo confirmar** al inicio de la auditoría. El único proyecto Supabase documentado en el equipo era el de ArreoPrime (`arreoprime-desk-dev`, según `docs/FASE-4-DESARROLLO.md` §5 de esa aplicación). **Actualización 2026-11-20:** el usuario informó que creó un proyecto dedicado llamado **`TRANSPORTES-360`** (D-01 resuelta). Su contenido y configuración aún no se han verificado (§3).
3. Lo que sí existe y tiene valor es **ArreoPrime**, una aplicación de la misma organización, con la misma tecnología pedida (HTML + CSS + JS sin frameworks + Supabase) y buenas prácticas de seguridad ya probadas. Se propone reutilizar sus **patrones**, no su base de datos.

## 2. Inventario del entorno local

| Elemento | Estado verificado | Implicación |
|---|---|---|
| Carpeta del proyecto | En OneDrive (`D:\OneDrive - El Arreo\...`), vacía | OneDrive sincroniza, pero **no es control de versiones**. Riesgo de conflictos y de subir secretos por error. |
| Git | **No instalado** | No hay historial ni posibilidad de revertir. Necesario antes de escribir código (D-14). |
| Supabase CLI | No instalado | Las migraciones y Edge Functions se pueden aplicar desde el panel web; el CLI simplifica el despliegue de funciones. |
| Node / npm / Deno | No instalados | Coherente con la regla "sin npm". Deno solo se necesitaría para probar Edge Functions localmente. |
| psql | No instalado en el PATH | — |
| PostgreSQL 17 + PostgREST | Hay binarios en carpetas temporales de sesiones anteriores (`AppData\Local\Temp\claude\...`), usados por ArreoPrime | Sirven para pruebas locales de SQL, pero **pueden borrarse** en cualquier limpieza de temporales. Conviene una ubicación estable. |
| Python | Solo el acceso directo de Microsoft Store | No usable. No es necesario. |

## 3. Supabase

| Aspecto | Resultado |
|---|---|
| Proyecto de TRANSPORTES 360 | **`TRANSPORTES-360`**, proyecto dedicado creado por el usuario (informado el 2026-11-20). **No consultado todavía.** En la carpeta local no hay URL, configuración ni SQL |
| Tablas, columnas, relaciones, índices, restricciones | Se espera un proyecto vacío. **Pendiente de confirmar** con las consultas de PLAN §2 |
| Funciones, triggers, políticas RLS | Pendiente de confirmar (PLAN §2) |
| Buckets, Auth, Edge Functions, extensiones | Pendiente de confirmar (PLAN §2): región, plan, extensiones disponibles, autorregistro, *exposed schemas*, respaldos |
| Proyecto ArreoPrime (`arreoprime-desk-dev`) | Existe según su documentación (49 tablas, 27 RPC, 68 políticas RLS). **No se consultó en remoto.** |

### 3.1 Por qué no conviene instalar TRANSPORTES 360 en el proyecto de ArreoPrime

Revisado en los SQL locales de ArreoPrime (`sql/02_tablas.sql`, `sql/07_triggers.sql`):

| Conflicto | Detalle |
|---|---|
| Nombres de tablas en `public` | ArreoPrime ya usa `perfiles`, `roles`, `permisos`, `categorias`, `colaboradores`, `notificaciones`, `auditoria`, `configuracion`. TRANSPORTES 360 necesita conceptos con el mismo nombre y otro significado. |
| Trigger sobre `auth.users` | `apd_nuevo_usuario` crea un perfil de ArreoPrime por **cada** usuario nuevo de Auth. `perfiles.correo` es `NOT NULL UNIQUE`, así que un colaborador sin correo (por ejemplo, registrado por teléfono) **haría fallar la creación de su usuario**. |
| Población distinta | ArreoPrime: personal administrativo invitado por correo. TRANSPORTES 360: choferes y ayudantes en el teléfono. Mezclarlos complica RLS, recuperación de cuentas y auditoría. |
| Riesgo cruzado | Un error de RLS o una clave de IA en un proyecto compartido expondría también los datos financieros de ArreoPrime (faltantes, liquidaciones). |

Recomendación: **proyecto Supabase dedicado** para TRANSPORTES 360 (D-01). **Resuelto:** el usuario creó `TRANSPORTES-360`. No se instalará nada de T360 en el proyecto de ArreoPrime.

## 4. Activos reutilizables de ArreoPrime (como patrón, copiando con autorización)

| Activo (ruta en `APP TICKETS CARNICO`) | Qué aporta | Cómo reutilizarlo | Precaución |
|---|---|---|---|
| Estructura sin compilación: `index.html` + `css/` + `js/core`, `js/modules`, `js/ui`, `js/api` | SPA con enrutador por `#/ruta`, módulos por pantalla, sin npm | Misma estructura de carpetas | Separar la app del colaborador y el panel administrativo (D-16) |
| `js/api/api.js` + `js/api/mock` + `js/api/supabase` | Tres modos (DEMO, SUPABASE, LOCAL) detrás de una sola interfaz `APD.api` | Permite construir y mostrar pantallas sin tocar la base de datos | Los datos DEMO deben ser ficticios |
| `js/config.js` | Configuración pública documentada: solo URL y clave publicable, con advertencia de no poner la `service_role` | Mismo archivo y mismo comentario | No reutilizar la URL ni la clave de ArreoPrime |
| `js/vendor/supabase-js-2.45.4.js` | Librería con versión fija, servida localmente (sin CDN) | Copiar el archivo | Revisar si hay una versión más reciente en Fase 2 |
| `css/tokens.css` | Identidad Grupo CIISA / El Arreo (marino `#0b1d3a`, dorado `#F0B020`), reglas de contraste, modo oscuro | Base de la paleta de TRANSPORTES 360 | Definir la identidad propia de T360 / Belca (D-13) |
| `assets/login-camiones.jpg`, `assets/logo-el-arreo.png` | Imagen de flotilla y logo | Posible fondo de inicio | **Confirmar derechos de uso** y si corresponde la marca El Arreo |
| `sql/04_funciones_seguridad.sql` | `app.error`, `app.validar`, `app.permiso_de`, `app.tiene_permiso`, `app.exigir`, `app.actor`, todas `security definer` con `search_path = ''` | Mismo patrón: una sola fuente de verdad de permisos en el servidor | Adaptar a los roles de T360 |
| `sql/07_triggers.sql` | `tg_inmutable` (tablas que no se modifican), `tg_actualizado_at`, alta de perfil desde `raw_app_meta_data` (no editable por el usuario) | Base del historial inmutable, la auditoría y el sorteo | — |
| `sql/02_tablas.sql` → `auditoria` | Bitácora con actor, acción, detalle y `jsonb` | Modelo de `audit_logs` | Agregar entidad genérica |
| `supabase/functions/admin-invitar/index.ts` | Edge Function que usa la `service_role` solo en el servidor, valida al llamante con una RPC y restringe CORS a un origen | Patrón para activación de cuentas e IA | — |
| `sql/98_pruebas_funcionales.sql`, `sql/99_pruebas_seguridad.sql` | Pruebas SQL que terminan en `ROLLBACK` | Mismo enfoque para RLS, puntuación y sorteo | — |
| `tools/servidor-local.ps1`, `tools/entorno-pruebas.ps1` | Servidor local en `localhost` sin instalar nada; entorno PostgreSQL + PostgREST con JWT de prueba | Desarrollo local sin tocar Supabase | Ver observación 4.1 |
| `sql/11_cron.sql` | Tarea `pg_cron` cada 5 minutos | Cierre de semana y vencimiento de alertas | Verificar que `pg_cron` esté habilitado |

### 4.1 Observaciones sobre ArreoPrime vistas de paso (no auditada)

- `tools/servidor-local.ps1` línea 112 valida la ruta con `StartsWith($raiz)` sin separador final: una carpeta hermana con el mismo prefijo pasaría la validación. Solo escucha en `localhost`, así que el riesgo es bajo, pero conviene corregirlo antes de copiarlo.
- `.claude/launch.json` apunta a binarios en carpetas temporales que pueden desaparecer.

## 5. Módulos: qué existe, qué falta, qué se reutiliza

| # | Módulo | Estado en T360 | Base reutilizable |
|---|---|---|---|
| 1 | Inicio / Panel principal | No existe | Layout, tokens y componentes de ArreoPrime |
| 2 | Capacitación semanal | No existe | — (lógica nueva) |
| 3 | Generador de contenido con IA | No existe | Patrón de Edge Function |
| 4 | Biblioteca documental | No existe | Patrón de Storage privado + URL firmada (ArreoPrime `evidencias`) |
| 5 | ALERTAS 360 | No existe | Notificaciones de ArreoPrime como referencia |
| 6 | Consejos breves | No existe | — |
| 7 | Campañas especiales | No existe | — |
| 8 | Evaluaciones y resultados | No existe | — |
| 9 | Ranking y reconocimientos | No existe | — |
| 10 | Sorteo semanal | No existe | `tg_inmutable`, auditoría |
| 11 | Historial del colaborador | No existe | — |
| 12 | Panel administrativo | No existe | `js/modules/admin.js` como referencia |
| 13 | Usuarios y permisos | No existe | Roles/permisos + `admin-invitar` |
| 14 | Fuentes de información | No existe | — |
| 15 | Reportes e indicadores | No existe | `reportes.js`, `dashboard.js`, SheetJS |
| 16 | Auditoría y trazabilidad | No existe | `auditoria` + triggers |

## 6. Problemas encontrados

| ID | Problema | Severidad | Acción propuesta |
|---|---|---|---|
| A-01 | ~~No hay proyecto Supabase identificado para T360~~ → proyecto `TRANSPORTES-360` creado; falta verificar su configuración | Media (era bloqueante) | Ejecutar las consultas de solo lectura de PLAN §2 |
| A-02 | Sin control de versiones (Git no instalado) | Alta | D-14: instalar Git y crear repositorio privado antes de escribir código |
| A-03 | El proyecto vive en OneDrive | Media | Mantenerlo, con `.gitignore` y sin secretos en archivos. Evaluar una carpeta fuera de OneDrive para el repositorio |
| A-04 | Entorno de pruebas local en carpetas temporales | Baja | Reubicar PostgreSQL/PostgREST portables en una carpeta estable (fuera del repositorio) |
| A-05 | Identidad gráfica de T360 indefinida | Media | D-13 |
| A-06 | Supuestos del prompt maestro no vigentes (aplicación existente, `index.html` único) | Informativa | Este documento los deja registrados |

## 7. Duplicidades

No hay duplicidades dentro de T360 (no existe código). La duplicidad potencial está **entre aplicaciones**: si se compartiera el proyecto Supabase con ArreoPrime habría dos `perfiles`, dos `roles`, dos `auditoria`, dos `notificaciones` (ver §3.1). En el modelo propuesto también se fusionan entidades del prompt que se solapan (ver MODELO_DATOS_PROPUESTO §2): `content_reviews` + `approval_history`, `topic_history` (pasa a ser una vista) y `weekly_scores` (se calcula al cerrar la semana).

## 8. Oportunidades de mejora

1. **Entregar valor sin IA primero**: capacitación semanal cargada a mano + evaluación + sorteo. La IA se agrega después sobre un flujo editorial que ya funciona (PLAN §8).
2. **Copiar los patrones de seguridad de ArreoPrime**, que ya pasaron 19 pruebas de seguridad en PostgreSQL local.
3. **Publicar sin cron**: el contenido aprobado se vuelve visible por consulta (`publish_at <= now()`); `pg_cron` solo para cierres y vencimientos.
4. **Búsqueda documental con texto completo de PostgreSQL** (configuración `spanish`) antes de incorporar embeddings y pgvector.

## 9. Lo que no se verificó

- Ningún recurso remoto: proyectos de Supabase, cuentas de OpenAI/Anthropic, dominios, hosting.
- El estado real del proyecto `arreoprime-desk-dev` (solo se leyó su documentación local).
- Derechos de uso de las imágenes de ArreoPrime.

## 10. Confirmación

No se modificó, movió ni eliminó ningún archivo existente. No se instaló software, no se ejecutaron migraciones y no se hicieron conexiones remotas. Los únicos archivos creados son los cinco documentos de esta Fase 1 en la carpeta `APP TRANSPORTES 360`.
