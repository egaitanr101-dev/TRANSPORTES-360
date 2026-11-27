# TRANSPORTES 360 — Iteración 8: reportes, "Mi equipo", PWA y tareas programadas

| Campo | Valor |
|---|---|
| Fecha | 2026-11-27 |
| Estado | **Reportes aplicados en `TRANSPORTES-360`**: 19 comprobaciones en local y en Supabase. PWA y pantallas probadas en modo demostración. **Tareas programadas y QR: preparados, sin aplicar, a la espera de su autorización** |
| Decisiones | MAPA_FUNCIONAL §14, D-09 (supervisor sin puntajes individuales) |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/11_reportes.sql` | Solo funciones de lectura: resumen, semanas, por área, preguntas, alertas, IA y "Mi equipo". No crea tablas ni toca datos |
| Panel → **Resumen** | Ahora con datos reales (antes era de demostración): participación, finalización, ingreso y promedio de la semana; alerta principal; gasto de IA; pendientes (revisión, semanas sin capacitación, sorteos por ejecutar, alertas por vencer, fuentes por validar). Es la pantalla de inicio del panel |
| Panel → **Reportes** | Semanas, por área, aciertos por pregunta (con el error más común), lectura de alertas y uso de IA, cada uno **exportable a Excel** (con la librería que ya estaba; el archivo se arma en el navegador) |
| Panel → **Mi equipo** | Para supervisores: su gente, cápsulas hechas esta semana, alertas sin confirmar y cuentas sin activar. **Sin puntajes individuales** |
| App instalable (PWA) | `manifest.webmanifest`, íconos y `sw.js`. Se puede "agregar a la pantalla de inicio"; abre rápido |
| Recordatorio en la app | Aviso de cápsulas atrasadas: se pueden hacer hasta el domingo y el sorteo exige las 5 |

## 2. Reglas de los reportes

- **Numerador y denominador** en todo indicador.
- **Base:** personas que responden evaluaciones (colaboradores y supervisores, D-07), activas. En semanas cerradas, la base congelada al cierre, que incluye a quien participó y luego fue desactivado. MAPA §14 decía "rol Colaborador"; se incluyen también los supervisores porque también responden y concursan.
- **"Abrieron"** = abrieron al menos una cápsula de la semana (vista registrada). Las sesiones iniciadas no se cuentan.
- **Alcance:**
  - quien gestiona usuarios ve a toda la organización;
  - un supervisor ve solo a su equipo y no ve: reporte por área, preguntas (traen la respuesta correcta), costos de IA ni pendientes.
- **Promedios con menos de 5 personas:** si lo completaron menos de 5, el supervisor no ve el promedio (con tan pocos se adivinan los puntajes individuales).

## 3. PWA: qué guarda y qué no

- El service worker guarda **solo los archivos de la aplicación**. **Nunca** guarda respuestas de Supabase (contenido, puntajes, datos personales), ni el panel, ni la simulación.
- Sin conexión, la app muestra "Sin conexión" en lugar de errores. Las respuestas solo se envían con conexión.
- Funciona en `https` o en `localhost`. Comprobado: 29 archivos guardados, ninguno de Supabase ni del panel.
- **Al publicar una versión nueva**, hay que subir el número `VERSION` en `sw.js`. Mientras tanto, la primera apertura puede mostrar la versión anterior.
- El ícono es provisional, con la marca actual, hasta tener el logo oficial (D-13).

## 4. Requiere su autorización (no aplicado)

1. **Tareas programadas** (`sql/pendientes/12_tareas_programadas.sql`):
   - activa la extensión `pg_cron` de Supabase, que hoy no está instalada;
   - cierra automáticamente las semanas cada lunes a las 00:05 (hora de Costa Rica);
   - **no** ejecuta el sorteo, que sigue a cargo de una persona;
   - sin costo en el plan actual; se revierte con una línea.
2. **Borrado automático de documentos temporales.** Necesita la API de Storage (una Edge Function programada), no solo SQL.
3. **Códigos QR** para el acceso a la app y los carteles. Requieren una librería nueva (licencia MIT, archivo local).
4. **Recordatorios fuera de la app** (correo o WhatsApp). Requieren un proveedor de envío (SMTP o API), con costo y datos de contacto.

## 5. Pruebas (`sql/90_pruebas_reportes.sql`, 19 comprobaciones)

- **Permisos:** colaborador sin acceso; supervisor sin reporte por área, preguntas ni IA.
- **Cifras de la semana en curso y de la cerrada:** base, participación, finalización, ingreso y promedio.
- **Por área**, incluidas las personas sin área.
- **Preguntas:** aciertos y error más común.
- **Resumen y sus pendientes.**
- **Supervisor:** solo su equipo, sin puntajes y con el promedio oculto cuando lo completaron menos de 5.
- **Anónimo:** sin acceso.

La reversión se probó en local.
