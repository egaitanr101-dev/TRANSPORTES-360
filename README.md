# TRANSPORTES 360

**Aprende · Cuídate · Protégete · Crece** — plataforma de aprendizaje, prevención y bienestar para los colaboradores de Transportes (Grupo CIISA / Belca Food Service).

| | |
|---|---|
| Estado | Fase 3: iteraciones 1 (identidad, activación, importación masiva), 2 (capacitación semanal), 3 (cierre y sorteo), 4 (alertas y consejos) 5 (generador con IA, apagado y sin clave) 6 (biblioteca y fuentes) y 7 (campañas y calendario) aplicadas en Supabase ([docs/ITERACION_1.md](docs/ITERACION_1.md), [docs/ITERACION_2.md](docs/ITERACION_2.md), [docs/ITERACION_3.md](docs/ITERACION_3.md), [docs/ITERACION_4.md](docs/ITERACION_4.md), [docs/ITERACION_5.md](docs/ITERACION_5.md), [docs/ITERACION_6.md](docs/ITERACION_6.md), [docs/ITERACION_7.md](docs/ITERACION_7.md)). Sigue: reportes, tareas programadas y PWA (iteración 8) |
| Tecnología | HTML + CSS + JavaScript sin compilación, sin npm. Backend: Supabase (Auth, PostgreSQL con RLS, Storage, Edge Functions) |
| Proyecto Supabase | `TRANSPORTES-360` (conectado). Modo demostración con datos ficticios: agregar `?demo=1` a la dirección |

## Cómo abrirla en este equipo

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\servidor-local.ps1
```

- App del colaborador: `http://localhost:5610/` (conectada a Supabase). Demostración: `http://localhost:5610/?demo=1` con el código **TR-0417** y cualquier contraseña de 8 caracteres o más (para "Activar mi cuenta", el código **DEMO-2026**).
- Panel administrativo: `http://localhost:5610/admin.html` (demostración: `admin.html?demo=1`)
- Prototipo de diseño de la Fase 2: `http://localhost:5610/prototipo/`

El servidor solo escucha en `localhost`, no instala nada y no sirve las carpetas `docs/`, `sql/`, `supabase/` ni `tools/`.

## Probar la base de datos en local

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\probar-sql-local.ps1 -PgBin "<carpeta bin de PostgreSQL 17>"
```

Aplica `sql/01`–`10` y las migraciones sobre una simulación de Supabase y ejecuta todas las pruebas (`sql/91`–`99`).

## Estructura

```
index.html · admin.html      Entradas: colaborador (móvil) y panel
css/                         tokens · base · colaborador · admin
js/config.js                 Configuración PÚBLICA (URL + clave publicable). Nunca secretos
js/core/                     dom (sin innerHTML) · ui (errores) · enrutador
js/api/                      api.js elige DEMO o SUPABASE · mock/ (solo DEMO) · supabase/
js/colaborador/ · js/admin/  Pantallas
js/vendor/                   supabase-js 2.45.4 (versión fija, local)
assets/img/                  Ilustraciones propias (SVG)
docs/                        Auditoría, plan, mapa funcional, modelo de datos, riesgos, diseño, iteraciones
sql/                         Migraciones numeradas, pruebas (91–99), reversión y arranque; local/ solo para pruebas
supabase/functions/          Edge Functions (activar-cuenta, admin-usuarios, ia-generar)
tools/                       Servidor local y pruebas SQL locales
prototipo/                   Referencia de diseño de la Fase 2
```

## Reglas del proyecto

1. **Ningún secreto en el repositorio ni en el navegador**: claves de IA y `service_role` solo en Supabase Secrets.
2. **El servidor decide**: permisos, corrección de evaluaciones, cierre y sorteo ocurren en PostgreSQL / Edge Functions.
3. **Nunca `innerHTML`** con datos: todo texto pasa por `T360.h()` / `textContent`.
4. **Cambios de base de datos** solo con migraciones revisadas y autorizadas (docs/FASE2_DISENO.md §6).
5. **La IA nunca publica**: todo contenido pasa por revisión y aprobación humana.

Documentación: [docs/](docs/) — empezar por [docs/FASE2_DISENO.md](docs/FASE2_DISENO.md).
