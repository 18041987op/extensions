# Asistente de Taller — Prototipo (Fase 1)

Extensión de Chrome que **traduce al español** y **filtra/resalta** la información en pantalla, para que los técnicos pierdan menos tiempo buscando y leyendo en ALLDATA. Todo ocurre dentro del navegador: **no envía nada a internet**.

> Esto es una **prueba de concepto** para validar la idea con 1–2 técnicos antes de invertir más. Lee primero `../Viabilidad-Asistente-Diagnostico.md`, sobre todo la sección legal de ALLDATA.

---

## Cómo instalarla (modo desarrollador, sin tienda)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa el interruptor **"Modo de desarrollador"** (arriba a la derecha).
3. Haz clic en **"Cargar extensión sin empaquetar"** (*Load unpacked*).
4. Selecciona esta carpeta `extension`.
5. Listo: verás el ícono de la extensión y, al abrir cualquier página, el panel 🔧 en la esquina superior derecha.

Para actualizar después de editar el código: vuelve a `chrome://extensions` y pulsa el botón de recargar (↻) sobre la tarjeta de la extensión.

---

## Cómo probarla

- **Sin ALLDATA:** abre el archivo `pagina-de-prueba.html` (incluido) en Chrome. Es una página de ejemplo en inglés que simula un procedimiento y una tabla de *labor times*. Prueba traducir y filtrar ahí.
- **Con ALLDATA:** inicia sesión normal en ALLDATA. El panel aparecerá encima. Escribe el motor o año en el filtro (ej. `2.5L`) y usa **Modo enfoque**.

---

## Notas importantes

**Traducción.** Usa el traductor integrado de Chrome (gratis, sin claves, el texto no sale del equipo). Requiere **Chrome de escritorio reciente**. La primera vez descarga un modelo de idioma (puede tardar unos segundos). Si tu Chrome no lo tiene, el panel te avisará; en ese caso habría que conectar una API externa (DeepL/Google) — ver el documento de viabilidad, sección 4.

**Dominios.** La extensión ahora se activa **solo en ALLDATA** (`*://*.alldata.com/*`) — el panel ya no aparece en otras páginas. Esto cubre `my.alldata.com`, `app.alldata.com` y cualquier otro subdominio de ALLDATA. Si alguna vez quieres volver a probarla en cualquier página, cambia en `manifest.json` los dos `"*://*.alldata.com/*"` por `"<all_urls>"`. Nota: el archivo `pagina-de-prueba.html` ya no mostrará el panel automáticamente porque no es un dominio de ALLDATA; para probar el panel sin ALLDATA, usa temporalmente `<all_urls>`.

**ALLDATA.** Esta versión solo lee y reorganiza lo que ya está en tu pantalla (no copia ni guarda nada). Aun así, **confirma con ALLDATA** que permiten herramientas de traducción/accesibilidad sobre su plataforma antes de desplegarla a todo el taller.

---

## Estructura de archivos

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Configuración de la extensión (permisos, en qué páginas corre). |
| `content.js` | El cerebro: panel flotante, traducción, filtro y modo enfoque. |
| `content.css` | Estilos del panel. |
| `popup.html` | Lo que ves al hacer clic en el ícono de la extensión. |
| `pagina-de-prueba.html` | Página de ejemplo en inglés para probar sin ALLDATA. |

## Próximos pasos (Fase 2+)

- Accesos directos a las otras fuentes que más consultan (foros, TSBs, decodificar VIN).
- Glosario del taller para traducciones consistentes en jerga técnica.
- Resumir procedimientos largos ("dame los 5 pasos clave").
