/* ============================================================
   Asistente de Taller — content script (se inyecta en la página)
   ------------------------------------------------------------
   Hace TRES cosas, todas dentro del navegador del técnico:
     1. Traducir el texto visible al español (traductor integrado de Chrome).
     2. Resaltar las coincidencias de una palabra clave (ej. el motor/año).
     3. "Modo enfoque": atenuar lo que NO contiene esa palabra, para
        que el ojo vaya directo a lo relevante.

   No envía nada a ningún servidor. Solo lee y modifica lo que YA está
   en pantalla. (Ver el documento de viabilidad, sección 2.)
   ============================================================ */

(() => {
  // Evita inyectar el panel dos veces si el script corre más de una vez.
  if (document.getElementById("at-panel")) return;

  // Guardamos los textos originales para poder "deshacer" la traducción.
  // Clave = nodo de texto, Valor = texto original en inglés.
  const originalText = new Map();
  let translatedOnce = false;

  /* ---------- 1. Construir el panel flotante ---------- */
  const panel = document.createElement("div");
  panel.id = "at-panel";
  panel.innerHTML = `
    <div class="at-header">
      <span class="at-title">🔧 Asistente de Taller</span>
      <button class="at-toggle" title="Minimizar">—</button>
    </div>
    <div class="at-body">
      <div class="at-section">
        <span class="at-label">Traducir página</span>
        <button class="at-btn at-btn-full" id="at-translate">Traducir al español</button>
        <button class="at-btn at-btn-secondary at-btn-full" id="at-restore" style="margin-top:6px;display:none;">Ver original (inglés)</button>
        <div class="at-status" id="at-translate-status"></div>
      </div>
      <div class="at-section">
        <span class="at-label">Filtrar / resaltar</span>
        <div class="at-row">
          <input class="at-input" id="at-filter-input" placeholder="Ej: 2.5L, 2018, P0420">
          <button class="at-btn" id="at-filter-go">Buscar</button>
        </div>
        <button class="at-btn at-btn-secondary at-btn-full" id="at-focus" style="margin-top:6px;">Modo enfoque (atenuar lo demás)</button>
        <button class="at-btn at-btn-secondary at-btn-full" id="at-clear" style="margin-top:6px;">Limpiar</button>
        <div class="at-status" id="at-filter-status"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Atajos a los elementos del panel
  const $ = (id) => panel.querySelector(id);
  const translateBtn = $("#at-translate");
  const restoreBtn = $("#at-restore");
  const translateStatus = $("#at-translate-status");
  const filterInput = $("#at-filter-input");
  const filterStatus = $("#at-filter-status");

  /* ---------- Panel: minimizar y arrastrar ---------- */
  $(".at-toggle").addEventListener("click", () => {
    panel.classList.toggle("at-collapsed");
  });
  makeDraggable(panel, panel.querySelector(".at-header"));

  /* ---------- Utilidad: recorrer los nodos de texto visibles ----------
     Devuelve los nodos de texto reales (no etiquetas) que el usuario ve,
     saltándose scripts, estilos y nuestro propio panel. */
  function getVisibleTextNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue.trim();
          if (!text) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          // Ignorar nuestro panel, scripts, estilos y elementos ocultos
          if (parent.closest("#at-panel")) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
            return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden")
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  /* ---------- 2. TRADUCIR ----------
     Usa la API de traducción integrada de Chrome (objeto global `Translator`).
     Disponible en Chrome de escritorio reciente. Si no existe, avisamos. */
  translateBtn.addEventListener("click", async () => {
    // ¿Tiene este Chrome la API de traducción integrada?
    if (typeof Translator === "undefined") {
      translateStatus.textContent =
        "⚠ Este Chrome no tiene el traductor integrado. Actualiza Chrome o usa una API externa (ver README).";
      return;
    }

    translateBtn.disabled = true;
    translateStatus.textContent = "Preparando traductor…";

    try {
      // Verificar disponibilidad inglés → español
      const availability = await Translator.availability({
        sourceLanguage: "en",
        targetLanguage: "es",
      });
      if (availability === "unavailable") {
        translateStatus.textContent = "⚠ La traducción en→es no está disponible en este equipo.";
        translateBtn.disabled = false;
        return;
      }

      // Crear el traductor (la primera vez descarga el modelo de idioma)
      const translator = await Translator.create({
        sourceLanguage: "en",
        targetLanguage: "es",
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            translateStatus.textContent =
              "Descargando modelo de idioma… " + Math.round(e.loaded * 100) + "%";
          });
        },
      });

      const nodes = getVisibleTextNodes();
      translateStatus.textContent = `Traduciendo ${nodes.length} fragmentos…`;

      let done = 0;
      for (const node of nodes) {
        const text = node.nodeValue;
        // Guardar el original una sola vez (para poder restaurar)
        if (!originalText.has(node)) originalText.set(node, text);
        try {
          const out = await translator.translate(text);
          node.nodeValue = out;
        } catch (err) {
          // Si un fragmento falla, lo dejamos como estaba y seguimos.
        }
        done++;
        if (done % 10 === 0)
          translateStatus.textContent = `Traduciendo… ${done}/${nodes.length}`;
      }

      translatedOnce = true;
      restoreBtn.style.display = "block";
      translateStatus.textContent = `✓ Listo. ${done} fragmentos traducidos.`;
    } catch (err) {
      translateStatus.textContent = "⚠ Error al traducir: " + err.message;
    } finally {
      translateBtn.disabled = false;
    }
  });

  // Restaurar el texto original en inglés
  restoreBtn.addEventListener("click", () => {
    for (const [node, text] of originalText.entries()) {
      node.nodeValue = text;
    }
    translateStatus.textContent = "Texto original restaurado.";
  });

  /* ---------- 3. FILTRAR / RESALTAR ----------
     Resalta en amarillo todas las apariciones de la palabra y salta a la 1ª. */
  $("#at-filter-go").addEventListener("click", runFilter);
  filterInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runFilter();
  });

  function clearHighlights() {
    document.querySelectorAll("span.at-highlight").forEach((span) => {
      const parent = span.parentNode;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize(); // une de nuevo los nodos de texto partidos
    });
  }

  function runFilter() {
    const term = filterInput.value.trim();
    clearHighlights();
    if (!term) {
      filterStatus.textContent = "Escribe algo para buscar.";
      return;
    }

    const nodes = getVisibleTextNodes();
    const lower = term.toLowerCase();
    let count = 0;
    let firstSpan = null;

    for (const node of nodes) {
      const value = node.nodeValue;
      if (!value.toLowerCase().includes(lower)) continue;

      // Partimos el texto y envolvemos cada coincidencia en un <span> resaltado
      const frag = document.createDocumentFragment();
      let idx = 0;
      let pos;
      const haystack = value.toLowerCase();
      while ((pos = haystack.indexOf(lower, idx)) !== -1) {
        if (pos > idx) frag.appendChild(document.createTextNode(value.slice(idx, pos)));
        const span = document.createElement("span");
        span.className = "at-highlight";
        span.textContent = value.slice(pos, pos + term.length);
        frag.appendChild(span);
        if (!firstSpan) firstSpan = span;
        count++;
        idx = pos + term.length;
      }
      if (idx < value.length) frag.appendChild(document.createTextNode(value.slice(idx)));
      node.parentNode.replaceChild(frag, node);
    }

    if (count > 0) {
      firstSpan.scrollIntoView({ behavior: "smooth", block: "center" });
      filterStatus.textContent = `✓ ${count} coincidencia(s) de "${term}".`;
    } else {
      filterStatus.textContent = `Sin coincidencias para "${term}".`;
    }
  }

  /* ---------- Modo enfoque: atenuar bloques sin la palabra ---------- */
  let focusOn = false;
  $("#at-focus").addEventListener("click", () => {
    const term = filterInput.value.trim().toLowerCase();
    if (!term) {
      filterStatus.textContent = "Escribe una palabra antes de usar el modo enfoque.";
      return;
    }
    // Quitar atenuado anterior
    document.querySelectorAll(".at-dimmed").forEach((el) => el.classList.remove("at-dimmed"));
    focusOn = !focusOn;
    if (!focusOn) {
      filterStatus.textContent = "Modo enfoque desactivado.";
      return;
    }
    // Atenuamos filas de tabla y elementos de lista que no contengan la palabra,
    // que es donde suele estar la info repetida (años, motores, etc.).
    const candidates = document.querySelectorAll("tr, li, .row, p, div");
    let dimmed = 0;
    candidates.forEach((el) => {
      if (el.closest("#at-panel")) return;
      // Solo atenuamos elementos "hoja" con poco texto, para no atenuar contenedores enteros.
      if (el.children.length > 6) return;
      const text = (el.textContent || "").toLowerCase();
      if (text && !text.includes(term)) {
        el.classList.add("at-dimmed");
        dimmed++;
      }
    });
    filterStatus.textContent = `Modo enfoque: ${dimmed} bloque(s) atenuado(s).`;
  });

  /* ---------- Limpiar todo ---------- */
  $("#at-clear").addEventListener("click", () => {
    clearHighlights();
    document.querySelectorAll(".at-dimmed").forEach((el) => el.classList.remove("at-dimmed"));
    focusOn = false;
    filterInput.value = "";
    filterStatus.textContent = "Limpio.";
  });

  /* ---------- Hacer arrastrable el panel desde su encabezado ---------- */
  function makeDraggable(box, handle) {
    let ox = 0, oy = 0, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("at-toggle")) return; // el botón minimizar no arrastra
      dragging = true;
      const rect = box.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      box.style.left = e.clientX - ox + "px";
      box.style.top = e.clientY - oy + "px";
      box.style.right = "auto";
    });
    document.addEventListener("mouseup", () => (dragging = false));
  }
})();
