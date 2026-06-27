# Asistente SA — Tekmetric (v0.2)

Extensión de Chrome para los **Service Advisors**. Se activa **solo en Tekmetric** y se adapta a la pantalla en la que estás. Tema con los colores de Tekmetric (navy + teal). Todo ocurre en el navegador; nada se envía a un servidor (la única excepción es la revisión de gramática, que usa la IA que tú conectes).

## Qué hace, según dónde estés

**En el Job Board (kanban de estados):**
- Conteo por columna (Estimates / En progreso / Completados).
- Cuántos ROs llevan más de X días en el sistema (umbral configurable).
- Lista de los ROs más viejos por antigüedad ("Created X ago").

**En el Tech Board (kanban por técnico):**
- Cuántos ROs tiene cada técnico.
- El RO más viejo de cada técnico.

**Dentro de un RO (auditoría del ticket):**
- ✓/!/✕ por cada punto: **VIN** presente (17 caracteres), **email**, **teléfono** y **dirección** del cliente, **Promise Time** definido, **placa**, **notas del RO**.
- Trabajos: cuántos **jobs aprobados** y si alguno **requiere autorización**, si hay **labor time** cargado, aviso de posible **parte en cantidad 0**, y revisión de **fluidos**.
- **Revisión de gramática** de las notas de los técnicos (botón) — requiere conectar una IA (opcional).

**Siempre:**
- Registra qué SA abre cada RO (quién, qué RO, hora). Exportable a CSV.
- Botón **✕** para cerrar el panel (vuelve con el botón flotante 🔧) y se puede mover/redimensionar.

## Instalar

1. `chrome://extensions` → **Modo de desarrollador** → **Cargar extensión sin empaquetar** → carpeta `extension-sa-tekmetric`.
2. Entra a `shop.tekmetric.com`. El panel **Asistente SA** aparece arriba/derecha.
3. **Cada vez que recargues la extensión, refresca la pestaña de Tekmetric (F5).**

## Uso

- Abre el Job Board, el Tech Board o un RO y pulsa **Analizar pantalla** (también se auto-analiza al abrir).
- **Tu nombre:** en Ajustes, si arriba sale "—" o un nombre incorrecto.
- **Gramática con IA:** Ajustes → "Configurar la IA…" (puedes usar la misma clave del Asistente de Taller IA).

## Calibración

Tekmetric arma su pantalla con JavaScript. La lectura se basa en los textos visibles (RO#, "Created X ago", "VIN", "Email", "Promise Time", etc.). Si algún número no cuadra, pulsa **Diag.** en la pestaña Tablero y mándame lo que muestra para afinar los patrones.

Lo más fiable son los datos del cliente y del vehículo en la auditoría del RO (vienen etiquetados en el sidebar). Lo de "jobs/partes" es best-effort y puede necesitar ajuste fino contra tu pantalla real.

## Privacidad

- El registro de aperturas y tu nombre se guardan en `chrome.storage.local` de **esta** computadora.
- La revisión de gramática envía SOLO el texto de las notas a la IA que tú configures (con tu propia clave).

## Fase siguiente (cuando quieras)

- Registro **compartido en la nube** para que todos los SA vean lo mismo y avisar de ROs abiertos por dos personas.
- Lectura más profunda de jobs/partes/fluidos vía la **API oficial de Tekmetric** (más estable que leer la pantalla).
- Semáforo de SLA por antigüedad y alertas de ROs estancados.
