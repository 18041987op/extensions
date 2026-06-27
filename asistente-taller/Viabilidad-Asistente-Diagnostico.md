# Asistente de diagnóstico para el taller — Análisis de viabilidad

**Autor:** Preparado para Osman
**Fecha:** Junio 2026
**Objetivo:** Evaluar si una extensión de Google Chrome puede reducir el tiempo que los técnicos pasan buscando, leyendo y traduciendo información en ALLDATA, y definir la forma más segura y realista de construirla.

---

## 1. El problema, en una frase

Cada búsqueda en ALLDATA (procedimiento de reparación, diagrama, *labor time*) consume minutos del técnico, y el contenido en inglés añade una capa extra de esfuerzo para un equipo que trabaja mejor en español. Multiplicado por decenas de búsquedas al día y varios técnicos, eso es tiempo facturable perdido.

Según lo que indicaste, el tiempo se va en cuatro frentes a la vez: **buscar y navegar, leer e interpretar, el idioma inglés, y saltar entre ALLDATA y otras fuentes**. Eso es importante porque significa que el mayor valor no está en una sola función mágica, sino en quitar fricción en varios puntos del mismo flujo.

---

## 2. ¿Es legal? Lo que tienes que verificar antes de invertir

Esta es la pregunta más importante y la que más puede frenar el proyecto, así que va primero.

**El riesgo no es "construir una extensión", es qué hace la extensión con el contenido de ALLDATA.** Hay dos enfoques con perfiles de riesgo muy distintos:

**Enfoque A — Solo lado del cliente (bajo riesgo).** La extensión únicamente lee y reorganiza lo que ALLDATA ya mostró en la pantalla del técnico, que ya inició sesión con una cuenta válida y pagada. Traduce el texto visible, resalta lo relevante, oculta el ruido. No copia el contenido a ningún servidor externo, no lo guarda, no lo redistribuye. Esto se parece mucho a una herramienta de accesibilidad (como un lector de pantalla o un traductor de página), y es defendible.

**Enfoque B — Extracción a un servidor (alto riesgo).** La extensión envía el contenido de ALLDATA a un servidor propio o a una API externa para procesarlo, almacenarlo o construir tu propia base de datos. Esto casi con seguridad viola los términos de uso de ALLDATA, puede considerarse *scraping* y redistribución de contenido licenciado, y pone en riesgo la cuenta del taller e incluso exposición legal.

**Recomendación:** Construir solo bajo el Enfoque A. Y antes de desplegarlo en producción, hacer dos cosas concretas:

1. Leer el contrato/Términos de Uso de tu suscripción a ALLDATA, buscando cláusulas sobre "automated access", "scraping", "modificación de la interfaz" o "uso de software de terceros".
2. Si hay cualquier ambigüedad, escribir a ALLDATA y preguntar directamente si permiten una herramienta de traducción/accesibilidad que opere sobre la pantalla del usuario autenticado. Tener su respuesta por escrito te protege.

> No pude encontrar los términos exactos de ALLDATA en una búsqueda pública, por eso esta verificación directa es indispensable y no algo que se pueda asumir.

Una nota de matiz sobre la traducción: incluso en el Enfoque A, si usas una API de traducción *en la nube* (Google, DeepL), técnicamente el texto visible viaja a ese proveedor para traducirse. Por eso la opción más limpia es la **traducción integrada de Chrome**, que traduce dentro del propio navegador sin enviar el texto a terceros (ver sección 4).

---

## 3. ¿Es técnicamente posible? Sí, y encaja bien con tu setup

Una extensión de Chrome puede hacer todo lo que describes, porque corre dentro de la misma pestaña donde el técnico ya tiene ALLDATA abierto:

- **Leer la página:** un *content script* tiene acceso al texto y la estructura de lo que se muestra. Puede encontrar la sección de *labor times*, el procedimiento, el diagrama.
- **Filtrar y resaltar:** puede atenuar lo irrelevante (otros motores, otros años) y resaltar lo que coincide con el vehículo que el técnico está atendiendo.
- **Traducir:** puede traducir el texto visible al español al vuelo.
- **Superponer una interfaz:** un panel flotante con un buscador y botones, siempre visible encima de ALLDATA.

Que el taller use Chrome en escritorio es ideal: la API de traducción integrada de Chrome funciona precisamente en Chrome de escritorio (no en móvil), así que tu entorno es el mejor caso posible.

El "saltar entre fuentes" también es resoluble: el mismo panel puede tener accesos directos para abrir una búsqueda paralela (foros técnicos, TSBs, el VIN decodificado) en una pestaña lateral, para que el técnico no pierda el hilo.

---

## 4. Cómo resolver la traducción (la decisión clave)

Tienes tres caminos, de menor a mayor costo y complejidad:

**Opción 1 — Traductor integrado de Chrome (recomendado para empezar).** Chrome trae una API de traducción con un modelo de IA que corre dentro del navegador. Ventajas: gratis, el texto no sale del equipo (mejor para privacidad y para el riesgo con ALLDATA), y no necesitas gestionar claves de API. Limitaciones: solo escritorio, la primera vez descarga el modelo de idioma, y la calidad es buena pero no siempre perfecta en jerga muy técnica.

**Opción 2 — API de traducción en la nube (DeepL / Google).** Mejor calidad en algunos casos y más control. Desventajas: cuesta por volumen, requiere gestionar una clave de API, y el texto viaja a un tercero (revisar punto legal de la sección 2).

**Opción 3 — Modelo de IA con glosario propio (a futuro).** Una IA a la que le enseñas tu glosario del taller (cómo traduces "tie rod end", "labor time", "torque spec") para que las traducciones sean consistentes con cómo hablan tus técnicos. Es lo más potente para "interpretar", no solo traducir, pero es la opción más cara y la dejaría para una fase 2.

**Mi recomendación:** empezar con la Opción 1 para el prototipo (cero costo, cero claves, encaja con el lado legal), y solo escalar a la 2 o la 3 si la calidad no alcanza.

---

## 5. Costos realistas

- **Prototipo / fase 1 (lado del cliente + traductor de Chrome):** $0 en herramientas. El único costo es tu tiempo de desarrollo (o el de un desarrollador). Como ya programas algo, es un buen proyecto de aprendizaje.
- **Si pasas a API en la nube:** DeepL y Google cobran por carácter; para un taller, probablemente decenas de dólares al mes, no cientos, pero depende del volumen.
- **Si publicas en la Chrome Web Store:** una cuota única de registro de desarrollador (~$5). No es obligatorio publicar: puedes instalarla en "modo desarrollador" en las máquinas del taller sin pasar por la tienda.
- **Mantenimiento:** ALLDATA puede cambiar su interfaz, y eso puede romper el filtrado/resaltado (la traducción es más robusta). Cuenta con revisarla de vez en cuando.

---

## 6. Enfoque recomendado, por fases

**Fase 1 — Prueba de concepto (lo que te entrego hoy).** Una extensión mínima que: (a) muestra un panel flotante sobre ALLDATA, (b) traduce el texto visible al español con el traductor de Chrome, y (c) resalta/filtra contenido según una palabra clave (ej. el motor o año). Sirve para que tú y un par de técnicos lo prueben y validen si el concepto realmente ahorra tiempo.

**Fase 2 — Ajuste al flujo real.** Con el feedback, afinar qué se filtra, agregar accesos directos a las otras fuentes que más consultan, y mejorar la traducción si hace falta.

**Fase 3 — Inteligencia.** Glosario del taller, resúmenes de procedimientos largos ("dame los 5 pasos clave"), y quizá guardar las búsquedas frecuentes. Aquí es donde se ataca de verdad el "leer e interpretar".

---

## 7. Riesgos y cómo mitigarlos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Términos de uso de ALLDATA | Alto — podrían suspender la cuenta | Quedarse en el Enfoque A (solo cliente) y confirmar por escrito con ALLDATA |
| ALLDATA cambia su interfaz | Medio — rompe el filtrado | Diseño tolerante a cambios; revisar periódicamente |
| Calidad de traducción en jerga técnica | Medio | Empezar con Chrome, escalar a glosario propio si hace falta |
| Adopción de los técnicos | Medio — si estorba, no lo usan | Probar con 1–2 técnicos antes de desplegar a todos |
| Privacidad / datos del cliente | Bajo-Medio | Traducir en el navegador (sin enviar a terceros) |

---

## 8. Conclusión

La idea es buena y el problema es real y cuantificable en tiempo facturable. **Es técnicamente viable y tu entorno (Chrome de escritorio) es el ideal.** El único obstáculo serio es el legal con ALLDATA, y se neutraliza manteniendo todo del lado del cliente y confirmando con ALLDATA por escrito.

El siguiente paso lógico es probar el prototipo que te dejo junto a este documento, idealmente con un técnico real frente a ALLDATA, y medir si de verdad ahorra tiempo antes de invertir más.
