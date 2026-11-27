# TRANSPORTES 360 — Iteración 7: campañas y calendario editorial

| Campo | Valor |
|---|---|
| Fecha | 2026-11-27 |
| Estado | **Aplicada en `TRANSPORTES-360`**: 42 comprobaciones en local y en Supabase, sin dejar datos. Panel y tarjeta del colaborador probados en modo demostración |
| Reglas | MAPA_FUNCIONAL §11 (campañas) y §13 (calendario) |

## 1. Qué incluye

| Pieza | Detalle |
|---|---|
| `sql/10_campanas_calendario.sql` | `campaigns`, `campaign_items` (semana, alerta o consejo existentes), `editorial_plan` (plan por semana), parámetros `rotacion_categorias` y `repeticion_meses`. Administra por RPC el catálogo de temas que ya existía (`topic_catalog`) |
| Panel → **Calendario editorial** | 8 semanas (con navegación): plan, capacitación real, rotación sugerida, campañas y avisos. Al planificar una semana: sugerencias de temas del catálogo y las preguntas con más errores de esa categoría |
| Panel → **Catálogo de temas** | Ideas por categoría; se sugieren las no usadas en 6 meses |
| Panel → **Campañas** | Nombre, mensaje, fechas, categoría; agregar o quitar semanas, alertas y consejos; hacer visible u ocultar; archivar |
| App | Tarjeta de la campaña en curso en el inicio, con enlaces a sus elementos |

## 2. Reglas

- **Una campaña solo agrupa.** No publica, no cambia el estado de nada, no suma puntos ni altera el sorteo.
- **El colaborador solo ve lo que ya podía ver**: dentro de una campaña aparecen únicamente las semanas publicadas, las alertas vigentes de su área y los consejos publicados. Una campaña sin nada visible para esa persona no aparece.
- **Visibilidad:** la decide quien aprueba contenido, aplicando cuatro ojos: quien editó la campaña no la hace visible, salvo que sea la única persona que puede. Si cambian el nombre, el mensaje o las fechas, se oculta hasta volver a aprobarla.
- **Avisos del calendario:**
  - misma categoría dos semanas seguidas;
  - tema parecido (mismas palabras, en español) a uno impartido en los últimos 3 meses (configurable).
- **Rotación:** el orden de categorías lo define quien aprueba contenido; por defecto, las 6 categorías en su orden.
- **Sugerencias sin IA ni costo.** Las propuestas con IA (MAPA_FUNCIONAL §13) quedan pendientes: requieren cambiar el generador, que ya existe.

## 3. Pruebas (`sql/91_pruebas_campanas.sql`, 42 comprobaciones)

- **Permisos, fechas y duración máxima de un año.**
- **Elementos:** se agregan sin publicar, sin repetir y solo si existen.
- **Visibilidad:**
  - cuatro ojos, y lo no aprobado o de otra área nunca se muestra;
  - editar el texto oculta la campaña, pero cambiar solo la categoría no;
  - las campañas futuras y las archivadas no se ven.
- **Calendario:** plan y semana real, avisos de tema parecido y de categoría repetida, rotación y vaciado del plan.
- **Sugerencias:** temas no usados; preguntas con más errores, contando solo intentos oficiales y con un mínimo de 5 respuestas.
- **Acceso:** el acceso directo a las tablas y el anónimo están cerrados.

## 4. Corrección en las herramientas

El script de pruebas locales solo aplicaba los archivos `05` a `09`. Ahora aplica de `05` a `79`, sin incluir la plantilla `80_arranque_admin.sql`.
