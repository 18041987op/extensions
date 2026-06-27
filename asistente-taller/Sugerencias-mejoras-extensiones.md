# Sugerencias de mejora — Asistente de Taller (Técnicos / ALLDATA y SA / Tekmetric)

Documento de ideas para que las dos extensiones rindan mejor para cada grupo. Ordenadas por impacto vs. esfuerzo: **rápidas** primero, **a futuro** al final.

---

## A. Extensión de Técnicos (ALLDATA)

Hoy hace: traducir al español, filtrar/resaltar y (versión IA) generar una "ficha de trabajo". Ya quedó restringida a `*.alldata.com`.

### Mejoras rápidas (alto impacto, poco esfuerzo)
- **Glosario del taller fijo.** Un diccionario de jerga (ej. *spark plug → bujía*, *bleed → purgar*) que fuerce traducciones consistentes. Evita que la IA o el traductor cambien el término según la página.
- **Recordar la última búsqueda/motor.** Que el filtro recuerde el último `2.5L`, `P0420`, etc. del vehículo en curso, para no reescribirlo en cada pantalla.
- **Botón "Resumir en 5 pasos".** Para procedimientos largos: que la IA dé los pasos clave + torques + advertencias arriba, y el detalle abajo. (La ficha ya apunta a esto; faltaría un modo "ultra-corto".)
- **Atajo de teclado** para abrir/cerrar el panel (ej. Alt+A), útil con las manos ocupadas.

### Mejoras medianas
- **Caché de fichas por vehículo + procedimiento.** Si dos técnicos abren el mismo procedimiento, reusar la ficha (ahorra llamadas de IA = menos costo). Hoy se cachea por sesión; pasarlo a `chrome.storage` lo haría persistente.
- **Modo "solo lo que cambió por año/motor".** Resaltar diferencias entre submodelos para no leer todo.
- **Decodificador de VIN** integrado y accesos directos a las fuentes que más consultan (TSBs, foros).
- **Indicador de costo de IA.** Mostrar cuántas fichas se generaron hoy / costo aproximado, para controlar el gasto del taller.

### A futuro
- **Glosario que aprende** de las correcciones del técnico.
- **Historial de procedimientos** consultados por vehículo (útil si vuelve el mismo carro).

### Riesgo a vigilar
- **Términos de uso de ALLDATA.** La extensión solo lee/reorganiza lo que ya está en pantalla, pero conviene confirmar con ALLDATA que permiten herramientas de traducción/accesibilidad encima de su plataforma antes de desplegar a todo el taller. (Ya anotado en el documento de viabilidad.)

---

## B. Extensión de SA (Tekmetric)

Hoy (v1): registra quién abre cada RO, lista pendientes por antigüedad, auto-detecta al SA, exporta CSV. Todo local a cada PC.

### Lo más valioso que sigue (en orden)
1. **Registro compartido en la nube.** Es la mejora #1. Hoy cada PC tiene su propio registro; si dos SA usan computadoras distintas, no se ven entre sí. Con un backend ligero (Supabase o incluso una Google Sheet) todos verían el mismo tablero de "quién tiene qué RO" en tiempo real. Esto habilita casi todo lo demás de esta lista.
2. **Aviso de RO duplicado.** "⚠ Carlos ya tiene abierto el RO #1234." Evita que dos SA trabajen el mismo RO. (Requiere el registro compartido.)
3. **Fecha de creación real del RO.** Hoy ordenamos por la antigüedad que muestra la tarjeta del tablero. Leyendo la fecha exacta de creación desde la página de detalle (ya se intenta guardar en el CSV) se puede ordenar con precisión y mostrar "lleva 3 días 4 h sin avanzar".
4. **Semáforo de antigüedad / SLA.** Verde/amarillo/rojo según cuánto lleva un RO sin tocarse, con un umbral configurable por el taller (ej. rojo a las 48 h).

### Mejoras medianas
- **"Mis ROs" vs "Todos".** Que cada SA filtre el tablero por los ROs que él abrió.
- **Conteo en el ícono (badge).** Mostrar el # de ROs pendientes/rojos directo en el ícono de la extensión, sin abrir nada.
- **Resumen diario automático.** Al final del día, un CSV o correo: cuántos ROs tocó cada SA, cuáles siguen abiertos, cuál es el más viejo.
- **Tiempo de respuesta.** Medir cuánto pasa entre que entra un RO y el primer SA lo abre (métrica de servicio).
- **Notas rápidas por RO.** Que el SA deje una nota corta ("esperando aprobación del cliente") visible para el resto.

### A futuro (potente, más esfuerzo)
- **Integración con la API oficial de Tekmetric** en vez de leer la pantalla. Más estable y con datos completos (estado real, montos, técnico asignado). Requiere credenciales de API del taller y, probablemente, mover parte de la lógica a un backend. Es el camino "serio" si esto crece.
- **Priorización inteligente.** Ordenar no solo por antigüedad sino por: promesa al cliente, monto, si ya está aprobado, si las partes llegaron.
- **Panel de supervisor.** Vista para el manager: carga por SA, ROs estancados, cuellos de botella.

### Decisiones que conviene tomar pronto
- **¿Local o nube?** Casi todo el valor de equipo (no duplicar, ver carga de otros, supervisor) necesita la nube. Si el objetivo es coordinar entre varios SA, vale la pena dar ese paso en Fase 2.
- **¿Identidad por persona o por login de Tekmetric?** Si varios SA comparten un mismo usuario de Tekmetric, la auto-detección los verá como uno solo; ahí conviene que cada quien ponga su nombre en Ajustes, o pasar a logins individuales.

---

## C. Comunes a las dos

- **Auto-actualización.** Hoy se instalan "sin empaquetar" y se actualizan a mano. Para varios equipos, conviene empaquetarlas (o publicarlas en modo privado/empresa) para que se actualicen solas.
- **Pantalla de ayuda de 30 segundos** la primera vez que se abre cada extensión (qué hace, dónde está el panel).
- **Un solo lugar de configuración** si en algún momento conviven varias extensiones del taller.
- **Telemetría mínima y privada** (solo local) para saber qué se usa de verdad y qué no, y así priorizar.
