# Cómo funciona la "Ficha de Trabajo" por dentro

La maqueta (`ficha-de-trabajo-demo.html`) muestra el **resultado**. Esta nota explica **cómo se genera** y la decisión técnica más importante que tienes que tomar.

## El problema cambió (y es bueno)

El primer prototipo solo traducía y resaltaba. Eso lo hace un *content script* sencillo, sin inteligencia. Pero lo que tú quieres —deducir partes por dependencias, ordenar pasos con sus advertencias, identificar que un trabajo requiere drenar un fluido, avisar de revisar un TSB— **no es buscar texto, es entenderlo.** Eso requiere un modelo de IA (un LLM). Ese es el salto de concepto importante.

## La tubería (pipeline), en 4 pasos

1. **Leer la pantalla.** La extensión toma el texto del procedimiento que ALLDATA ya muestra (igual que antes, del lado del cliente). También puede seguir las referencias internas — ej. "Remove the engine front cover" — para leer ese sub-procedimiento y descubrir que *ahí* se drena el refrigerante.

2. **Mandarlo a la IA con instrucciones precisas.** Se le pasa el texto a un LLM con una instrucción tipo: *"De este procedimiento de reparación, extrae en formato estructurado: labor time, lista de partes, fluidos con tipo y cantidad, especificaciones de torque, pasos en orden con sus NOTICE/CAUTION, y si menciona depender de otro procedimiento que requiera drenar/remover algo, lístalo como dependencia."*

3. **Recibir datos estructurados (JSON).** La IA devuelve algo limpio y predecible: `{ laborTime, parts[], fluids[], specs[], steps[], alerts[] }`. Esto es lo que llena la ficha.

4. **Pintar la ficha y conservar los enlaces.** Cada dato guarda de qué sección de ALLDATA salió, para que el técnico pueda ir a la fuente con un clic.

## La decisión clave: ¿dónde corre la IA?

Aquí está el verdadero cruce de caminos, y tiene una cara técnica y una legal.

**Opción A — IA en el dispositivo (Prompt API de Chrome / Gemini Nano).**
El modelo corre dentro del navegador del técnico. El contenido de ALLDATA **nunca sale del equipo**.
- A favor: máxima privacidad y el menor riesgo legal con ALLDATA (no hay "extracción" a un tercero); gratis.
- En contra: los modelos en el dispositivo son más limitados; el razonamiento de dependencias complejas ("para A → B → drenar C") puede quedarse corto. Solo en Chrome de escritorio reciente.

**Opción B — IA en la nube (Claude, GPT, etc.).**
La extensión envía el texto a un modelo potente vía API.
- A favor: mucho mejor para razonar dependencias, resumir y deducir partes; es lo que hace brillar tu idea.
- En contra: el texto de ALLDATA **viaja a un tercero**. Esto es exactamente el punto sensible de los términos de uso de ALLDATA. Tiene costo por uso (manejable para un taller, pero existe).

**Recomendación práctica:** prototipar la lógica con la Opción B para validar que la ficha sale buena (es donde se ve el valor real), pero **antes de desplegarla en el taller, confirmar con ALLDATA** si aceptan que su contenido se procese con una IA externa para uso interno del técnico. Si dicen que no, se replantea hacia la Opción A (en el dispositivo) aunque sea menos potente. Esta conversación con ALLDATA no es opcional: define qué versión puedes usar legalmente.

## Lo que la maqueta NO resuelve todavía (honestidad)

- Los valores reales (labor time, torques, capacidades) salen de ALLDATA en vivo; en la maqueta son de ejemplo.
- Seguir referencias internas de forma confiable (que la extensión "entre" al sub-procedimiento de la tapa frontal) es trabajo de ingeniería real, no trivial.
- La calidad del razonamiento de partes depende del modelo elegido (ver decisión arriba).

## Próximo paso sugerido

Tomar **un solo trabajo real** (este de la cadena de distribución sirve) y construir la tubería de punta a punta para ese caso: leer la página real, pasarla por la IA, y comparar la ficha generada contra lo que tú, como experto, sabes que debería decir. Si en un caso real funciona, se escala. Si no, ajustamos el prompt y el modelo antes de invertir más.
