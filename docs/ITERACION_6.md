# TRANSPORTES 360 — Iteración 6: biblioteca documental y fuentes

| Campo | Valor |
|---|---|
| Fecha | 2026-11-27 |
| Estado | **Aplicada en `TRANSPORTES-360`**: 45 comprobaciones en local y 51 en Supabase (con las de Storage), sin dejar datos. Panel probado en modo demostración; la subida real de un archivo con su sesión queda por recorrer |
| Decisiones | D-11 (extracción en el navegador; **PDF pendiente**), D-12 (texto completo de PostgreSQL, sin pgvector) |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/09_biblioteca.sql` | Documentos (tipo, **acceso obligatorio**, vigencia, uso con IA, temporal), versiones con huella SHA-256, fragmentos de texto con búsqueda en español, dominios confiables, fuentes externas y vínculos de fuente con cada semana, alerta o consejo |
| Storage | Bucket **privado** `documentos` (25 MB por archivo; solo PDF, Word, Excel, PowerPoint y texto). Solo se puede subir a la ruta que el servidor reservó para esa versión; solo quien gestiona documentos descarga, con enlace firmado de 1 minuto. Nada se reemplaza ni se borra desde la app |
| Panel → **Biblioteca y fuentes** | Biblioteca, buscador, fuentes externas (registrar, validar o rechazar), dominios confiables y documentos temporales |
| Editores | Las semanas, alertas y consejos muestran **Fuentes vinculadas**: solo fuentes validadas o documentos vigentes; si se cita un extracto, el servidor comprueba que esté en el documento |
| `js/admin/extraer.js` | Lee Word, PowerPoint y Excel **en el navegador**, con el lector ZIP de la librería de Excel que ya estaba en el proyecto. **Sin dependencias nuevas**. El archivo no se envía a ningún servicio para leerlo |

## 2. Reglas

- **Clasificación obligatoria.** Un documento RESTRINGIDO nunca se puede marcar para IA. El formulario advierte que no se suban planillas ni datos personales.
- **Versiones.** El mismo archivo (misma huella) no se registra dos veces. Al subir una versión nueva, la anterior se conserva y deja de buscarse. Un documento obsoleto o archivado no aparece en búsquedas, y sus vínculos se marcan "no vigente".
- **Temporales.** Se eliminan a los 30 días, salvo que estén citados. El borrado automático corresponde a la iteración 8; la función que lo hace ya está lista (`app.purgar_temporales`). Los archivos en Storage se borrarán desde la tarea programada.
- **Fuentes externas.** Solo `https`. Quien registra una fuente no la valida, salvo que sea la única persona que puede (queda marcado). Si cambia la dirección, la entidad o el título, la fuente vuelve a pendiente.
- **Dominios confiables.** Los agrega una persona, nunca la IA, y cubren sus subdominios.
- **Texto de los documentos = datos.** Se muestra como texto plano; una instrucción o un código dentro de un documento no se ejecuta (probado con `<img onerror>` e "ignore las reglas").

## 3. Pruebas

- `sql/92_pruebas_biblioteca.sql`: 45 comprobaciones en local y 51 en Supabase. Las 6 adicionales son de Storage: no se sube fuera de la ruta reservada, un colaborador no ve ni sube archivos, y el bucket es privado de 25 MB.
- La reversión se probó en local.
- En el navegador: extracción de los 5 formatos, archivo dañado, formato no permitido, división en fragmentos y recorrido completo del panel en demostración.

## 4. Decisiones que le corresponden

1. **PDF (D-11).** Hoy un PDF se guarda, pero no se busca dentro de él. Opciones:
   - **(a)** pdf.js, una librería gratuita de Mozilla (unos 1,3 MB, en `js/vendor`). Lee PDF con texto; no lee escaneos.
   - **(b)** Leerlo con Claude: también lee escaneos, pero cuesta dinero por página.
   - **(c)** Dejarlo así.
   Agregar una librería o usar la IA requiere su autorización.
2. **Alertas con fuente validada (R-43).** Hoy una alerta exige escribir una fuente, pero no exige que esté **validada** y vinculada. Exigirlo implica cambiar `fn_admin_alerta_aprobar`, que ya existe.
3. **Documentos como insumo de la IA.** Para que el generador use los fragmentos de los documentos marcados "usable con IA", hay que cambiar la función `ia-generar` y `fn_srv_ia_paso_iniciar`, que ya existen.

## 5. Pendiente

Vista de documentos para colaboradores (la clasificación ya está lista), borrado programado (iteración 8) y lectura de PDF (decisión 1).
