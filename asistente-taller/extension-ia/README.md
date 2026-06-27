# Asistente de Taller IA — Ficha de Trabajo (v0.2)

Extensión de Chrome que lee el procedimiento que tienes abierto en ALLDATA y, usando **la IA de bajo costo que tú conectes**, genera una **Ficha de Trabajo**: labor time, partes (con dependencias), fluidos, specs de torque, pasos con sus advertencias y alertas de TSB.

Esta es la versión real y funcional. Tú pones tu propia API key, así el taller paga solo por lo que usa.

---

## 1. Instalar la extensión

1. Abre `chrome://extensions`.
2. Activa **"Modo de desarrollador"** (arriba a la derecha).
3. **"Cargar extensión sin empaquetar"** → selecciona esta carpeta `extension-ia`.

## 2. Conectar una IA (una sola vez)

1. Haz clic en el ícono de la extensión → **"Abrir configuración de IA"**.
2. Elige proveedor y pega tu **API key**. Opciones económicas:

   | Proveedor | URL base | Modelo sugerido |
   |---|---|---|
   | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
   | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
   | OpenRouter | `https://openrouter.ai/api/v1` | el que elijas |
   | Anthropic (Claude) | *(no aplica)* | `claude-haiku-4-5-20251001` |

   > Para conseguir la API key: crea una cuenta en el proveedor elegido y genera una clave en su panel. Suele costar centavos por ficha.

3. **"Guardar y probar conexión"**. Si ves *"✓ Conexión exitosa"*, ya está.

## 3. Usar en un trabajo real

1. En ALLDATA, abre un procedimiento (ej. *Timing Chain › Removal and Replacement*).
2. Abajo a la derecha aparece el botón **"🔧 Generar ficha de trabajo"**. Púlsalo.
3. La extensión lee el texto, lo manda a tu IA y abre la **Ficha de Trabajo** en un panel lateral.

---

## Cómo probar el concepto (lo que pediste: 1 trabajo de punta a punta)

Toma **un trabajo que conozcas bien** (la cadena de distribución de la F-150 sirve). Genera la ficha y compárala con lo que tú, como experto, sabes que debería decir:

- ¿El labor time coincide con el de *Parts & Labor*?
- ¿Detectó que hay que drenar refrigerante y por eso lo listó como material?
- ¿Ordenó bien los pasos y conservó los avisos (NOTICE/CAUTION)?
- ¿Sugirió revisar TSB antes de reemplazar?

Con ese resultado real decidimos si ajustamos el *prompt*, cambiamos de modelo, o escalamos.

---

## Notas y límites (honestidad)

- **Extracción del texto:** la extensión toma el contenedor con más texto de la página. Si ALLDATA usa un HTML particular y agarra texto de más (menús) o de menos, hay que afinar el selector en `content.js` (función `extractProcedureText`, está marcada con un comentario). Esto se calibra mirando la página real una vez.
- **Privacidad / legal:** al generar una ficha, el texto del procedimiento se envía a tu proveedor de IA. Confirma con ALLDATA que aceptan este uso antes de desplegarlo a todo el taller (ver `../Como-funciona-el-motor-de-IA.md` y la nota de viabilidad).
- **No inventa datos:** la IA tiene instrucción de dejar vacío lo que no aparezca en el texto, para no fabricar torques ni capacidades. Aun así, **verifica siempre los valores críticos** contra la fuente.
- **Restringir a ALLDATA:** hoy corre en todas las páginas para facilitar pruebas. Para producción, en `manifest.json` cambia los `"<all_urls>"` por `"*://*.alldata.com/*"` (deja el de `host_permissions` que cubre la API si tu proveedor está en otro dominio).

## Archivos

| Archivo | Qué hace |
|---|---|
| `manifest.json` | Configuración de la extensión. |
| `options.html` / `options.js` | Panel para conectar la IA (proveedor, key, modelo). |
| `popup.html` / `popup.js` | Estado y acceso a la configuración. |
| `content.js` | Extrae el texto, pide la ficha y la pinta en el panel. |
| `background.js` | Llama a la IA (OpenAI-compatible o Anthropic) y devuelve JSON. |
| `ficha.css` | Estilos del botón y del panel. |

---

## Modo automático (v0.3)

La extensión ahora muestra una **barrita de estado** abajo a la derecha y puede **pre-procesar la ficha sola**:

- Cuando el técnico abre un procedimiento y se queda en él unos **4 segundos**, la extensión genera la ficha **en segundo plano** (sin tapar la vista).
- La barrita indica el estado: gris (en espera) → amarillo "Procesando ficha…" → verde "✓ Ficha lista".
- Al hacer clic en **"Ver ficha ⚡"**, la ficha aparece al instante porque ya estaba lista.
- Cada página se procesa **una sola vez** (caché), así no se gasta de más en la IA.
- El interruptor **"Auto"** en la barrita activa/desactiva el pre-procesado (se recuerda).
- **"Herramientas"** abre el panel con Traducir y Filtrar (sin IA) y el botón de ficha manual.

Para controlar el costo: el modo Auto solo procesa páginas con suficiente texto (procedimientos reales), espera el retardo, y no repite páginas ya procesadas.

---

## Interfaz v0.4 — panel unificado movible

Ahora todo vive en **un solo panel** que puedes acomodar como quieras:

- **Arrástralo** tomándolo de la barra azul de arriba.
- **Redimensiónalo** desde la esquina inferior derecha (la manijita).
- **Plégalo/despliégalo** con el botón ▾ del encabezado (queda solo la barra de título, sin estorbar).
- **Recuerda** dónde lo dejaste y de qué tamaño (por sitio).
- Tres **pestañas**: **Ficha ⚡** (IA), **Traducir** y **Filtrar** (sin IA).
- La ficha se muestra **dentro del panel** (con scroll), así que ya no tapa ALLDATA ni hay que cerrarla para leer atrás.
- El **puntito** del encabezado indica el estado del modo Auto: gris (espera) → amarillo (procesando) → verde (ficha lista). El interruptor **Auto** está en la pestaña Ficha.

### ¿Funciona en otra PC (la del taller)?
Sí, en cualquier Chrome de escritorio. Pero recuerda que en cada PC hay que, una sola vez:
1. **Cargar la extensión** ahí también (copiar la carpeta `extension-ia` o el .zip y "Cargar extensión sin empaquetar"), y
2. **Volver a poner la API key** de DeepSeek en la configuración (las llaves se guardan por navegador, no viajan solas).

---

## v0.5 — Ficha por tipo de página + fuente

- La ficha **detecta el tipo de página**:
  - **Código (DTC)**: muestra Causas probables, **Arreglos más reportados (rankeados)**, TSBs a revisar, y Pasos de diagnóstico sugeridos.
  - **Procedimiento**: pasos, partes (con dependencias), fluidos y specs.
- **Etiqueta de fuente en cada dato**: 📄 **ALLDATA** (textual de la página) vs 🤖 **IA** (sugerencia del asistente). Para que el técnico nunca confunda lo verificado con lo inferido.
