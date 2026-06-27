/* ============================================================
   Asistente SA — Tekmetric · content.js  (v0.2)
   ------------------------------------------------------------
   Panel consciente del contexto. Tres situaciones:

     1. JOB BOARD (kanban de estados) → analítica:
        ROs por columna, antigüedad ("Created X ago"), los más viejos,
        ROs por técnico/estado.

     2. TECH BOARD (kanban por técnico) → carga de trabajo:
        cuántos ROs tiene cada técnico y horas asignadas/incompletas.

     3. DENTRO DE UN RO → auditoría del ticket:
        VIN, datos del cliente (tel/email/dirección), promise time,
        jobs aprobados/sin asignar, partes en 0, fluidos, y revisión
        de gramática de las notas (IA opcional).

   Además: registra qué SA abre cada RO (local, exportable a CSV).
   Todo ocurre en el navegador; nada se envía a un servidor
   (salvo la revisión de gramática, que usa la IA que TÚ conectes).
   ============================================================ */

(() => {
  if (document.getElementById("tk-widget")) return;

  /* ---------- Config ---------- */
  const DEFAULTS = {
    roUrlPattern: "/repair-orders?/(\\d+)|/ro/(\\d+)|/repair-order/(\\d+)",
    dedupMinutes: 30,
    pollMs: 1500,
    maxLog: 8000,
    oldRoDays: 3            // umbral para marcar un RO como "viejo"
  };
  const K_ID = "tk_identity", K_LOG = "tk_log", K_CFG = "tk_config";

  let cfg = { ...DEFAULTS };
  let identity = null, hasAI = false;
  let lastLoggedKey = "", lastLoggedAt = 0, lastUrl = location.href;
  let context = "other";

  /* ---------- UI ---------- */
  const w = document.createElement("div");
  w.id = "tk-widget";
  w.innerHTML = `
    <div class="tk-head" id="tk-head">
      <span class="tk-dot" id="tk-dot"></span>
      <span class="tk-ttl">Asistente SA</span>
      <span class="tk-who" id="tk-who"></span>
      <span class="tk-sp"></span>
      <button class="tk-icon" id="tk-collapse" title="Plegar / desplegar">▾</button>
      <button class="tk-icon tk-x" id="tk-close" title="Cerrar (vuelve con el botón flotante)">✕</button>
    </div>
    <div class="tk-tabs" id="tk-tabs">
      <button class="tk-tab active" data-tab="ctx" id="tk-tab-ctx">Tablero</button>
      <button class="tk-tab" data-tab="reg">Registro</button>
      <button class="tk-tab" data-tab="cfg">Ajustes</button>
    </div>
    <div class="tk-bodywrap" id="tk-bodywrap">

      <div class="tk-pane" id="pane-ctx">
        <div class="tk-row">
          <button class="tk-btn tk-primary" id="tk-analyze">Analizar pantalla</button>
          <button class="tk-btn tk-sec" id="tk-diag" title="Ver qué detectó">Diag.</button>
        </div>
        <div class="tk-statusline" id="tk-ctx-st">Abre el Job Board, el Tech Board o un RO y pulsa “Analizar pantalla”.</div>
        <div id="tk-ctx-out"></div>
      </div>

      <div class="tk-pane" id="pane-reg" style="display:none">
        <div class="tk-summary" id="tk-reg-sum"></div>
        <div class="tk-row">
          <button class="tk-btn tk-sec" id="tk-export">Exportar CSV</button>
          <button class="tk-btn tk-sec" id="tk-refresh-log">Actualizar</button>
          <button class="tk-btn tk-danger" id="tk-clear-log">Borrar</button>
        </div>
        <div id="tk-reg-out"></div>
      </div>

      <div class="tk-pane" id="pane-cfg" style="display:none">
        <label class="tk-lbl">Tu nombre (Service Advisor)</label>
        <div class="tk-row">
          <input class="tk-in" id="tk-name-in" placeholder="Ej: Osman">
          <button class="tk-btn" id="tk-name-save">Guardar</button>
        </div>
        <div class="tk-hint" id="tk-id-hint"></div>

        <label class="tk-lbl" style="margin-top:10px">RO “viejo” a partir de (días)</label>
        <input class="tk-in tk-full" id="tk-old-in" type="number" min="1" step="1">

        <label class="tk-lbl" style="margin-top:10px">No re-registrar el mismo RO antes de (min)</label>
        <input class="tk-in tk-full" id="tk-dedup-in" type="number" min="0" step="5">

        <label class="tk-lbl" style="margin-top:10px">Patrón de URL del RO (avanzado)</label>
        <input class="tk-in tk-full" id="tk-pattern-in" placeholder="(por defecto)">

        <div class="tk-divider"></div>
        <label class="tk-lbl">Revisión de gramática con IA (opcional)</label>
        <div class="tk-hint">Para corregir las notas de los técnicos. Usa la IA que tú conectes (la misma clave del Asistente de Taller sirve).</div>
        <button class="tk-btn tk-sec tk-full" id="tk-ai-cfg" style="margin-top:6px">Configurar la IA…</button>
        <div class="tk-statusline" id="tk-ai-st"></div>

        <div class="tk-row" style="margin-top:10px">
          <button class="tk-btn tk-primary" id="tk-cfg-save">Guardar ajustes</button>
          <button class="tk-btn tk-sec" id="tk-cfg-reset">Restablecer</button>
        </div>
        <div class="tk-statusline" id="tk-cfg-st"></div>
      </div>

    </div>
    <div class="tk-resize" id="tk-resize" title="Arrastra para redimensionar"></div>`;
  document.body.appendChild(w);

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Posición / tamaño persistentes ---------- */
  const UIKEY = "tk_ui_v2";
  function loadUI() { try { return JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch (e) { return {}; } }
  function saveUI(p) { try { localStorage.setItem(UIKEY, JSON.stringify(p)); } catch (e) {} }
  let ui = loadUI();
  const DEF_W = 380, DEF_H = 500;
  let width = ui.width || DEF_W, height = ui.height || DEF_H;
  w.style.width = width + "px"; w.style.height = height + "px";
  let left = (typeof ui.left === "number") ? ui.left : Math.max(8, window.innerWidth - width - 16);
  let top = (typeof ui.top === "number") ? ui.top : 90;
  let activeTab = ui.tab || "ctx";
  applyPos();
  if (ui.collapsed) { w.classList.add("tk-collapsed"); $("tk-collapse").textContent = "▴"; }
  if (ui.tab) switchTab(ui.tab);

  function applyPos() {
    left = Math.max(0, Math.min(window.innerWidth - 60, left));
    top = Math.max(0, Math.min(window.innerHeight - 30, top));
    w.style.left = left + "px"; w.style.top = top + "px"; w.style.right = "auto"; w.style.bottom = "auto";
  }
  function persist() { saveUI({ left, top, width, height, collapsed: w.classList.contains("tk-collapsed"), tab: activeTab }); }
  window.addEventListener("resize", applyPos);

  function makeOverlay(cur) { const o = document.createElement("div"); o.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:" + cur + ";"; document.body.appendChild(o); return o; }
  $("tk-head").addEventListener("mousedown", (e) => {
    if (e.target.closest("#tk-collapse") || e.target.closest("#tk-close")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sl = left, st = top; const ov = makeOverlay("move");
    function mm(ev) { left = sl + (ev.clientX - sx); top = st + (ev.clientY - sy); applyPos(); }
    function mu() { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); ov.remove(); persist(); }
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  });
  $("tk-resize").addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height; const ov = makeOverlay("nwse-resize");
    function mm(ev) {
      width = Math.max(300, Math.min(window.innerWidth - left - 4, sw + (ev.clientX - sx)));
      height = Math.max(200, Math.min(window.innerHeight - top - 4, sh + (ev.clientY - sy)));
      w.style.width = width + "px"; w.style.height = height + "px";
    }
    function mu() { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); ov.remove(); persist(); }
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  });
  $("tk-collapse").addEventListener("click", () => { w.classList.toggle("tk-collapsed"); $("tk-collapse").textContent = w.classList.contains("tk-collapsed") ? "▴" : "▾"; persist(); });

  /* Cerrar + mini-botón flotante para reabrir */
  let launcher = null;
  function showLauncher() {
    if (launcher) { launcher.style.display = "flex"; return; }
    launcher = document.createElement("button");
    launcher.id = "tk-launcher"; launcher.title = "Abrir Asistente SA"; launcher.textContent = "🔧";
    launcher.addEventListener("click", () => { w.style.display = ""; launcher.style.display = "none"; });
    document.body.appendChild(launcher);
  }
  $("tk-close").addEventListener("click", (e) => { e.stopPropagation(); w.style.display = "none"; showLauncher(); });

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll("#tk-tabs .tk-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("pane-ctx").style.display = tab === "ctx" ? "block" : "none";
    $("pane-reg").style.display = tab === "reg" ? "block" : "none";
    $("pane-cfg").style.display = tab === "cfg" ? "block" : "none";
    if (tab === "reg") renderLog();
  }
  document.querySelectorAll("#tk-tabs .tk-tab").forEach((b) =>
    b.addEventListener("click", () => { switchTab(b.dataset.tab); if (w.classList.contains("tk-collapsed")) { w.classList.remove("tk-collapsed"); $("tk-collapse").textContent = "▾"; } persist(); }));

  function setDot(state) { $("tk-dot").className = "tk-dot " + (state || "idle"); }

  /* ---------- Storage ---------- */
  // Tras recargar la extensión, esta página queda "huérfana": cualquier
  // llamada a chrome.* lanza "Extension context invalidated". alive() lo
  // detecta y apagamos los timers para no spamear errores (se arregla con F5).
  let tkDead = false;
  function alive() {
    if (tkDead) return false;
    try { if (chrome.runtime && chrome.runtime.id) return true; } catch (e) {}
    tkDead = true;
    return false;
  }
  function getLog(cb) { if (!alive()) return; try { chrome.storage.local.get(K_LOG, (d) => { if (chrome.runtime.lastError) return; cb(Array.isArray(d[K_LOG]) ? d[K_LOG] : []); }); } catch (e) { tkDead = true; } }
  function setLog(arr) { if (!alive()) return; try { chrome.storage.local.set({ [K_LOG]: arr.slice(-cfg.maxLog) }); } catch (e) { tkDead = true; } }

  /* ---------- Identidad ---------- */
  function detectSAName() {
    // En el RO, el sidebar muestra "Service Writer\n<nombre>".
    const T = bodyText();
    let m = T.match(/Service Writer\s*\n?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+){0,2})/);
    if (m) return m[1].trim();
    // El avatar/menú de cuenta arriba a la derecha (iniciales tipo "OP").
    const sels = ['[class*="account"]', '[aria-label*="account" i]', '[class*="avatar"]', 'header [class*="name"]'];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim();
      if (t && t.length >= 2 && t.length <= 40 && /[a-z]/i.test(t) && !/sign|log|menu|account|cuenta/i.test(t)) return t;
    }
    return "";
  }
  function refreshWho() {
    $("tk-who").textContent = "· " + (identity && identity.name ? identity.name : "—");
    if ($("tk-name-in") && identity && identity.name && !$("tk-name-in").value) $("tk-name-in").value = identity.name;
    const hint = $("tk-id-hint");
    if (hint) hint.textContent = identity && identity.source === "auto" ? "Detectado de Tekmetric. Corrígelo si hace falta."
      : identity && identity.source === "manual" ? "Definido manualmente en esta PC." : "Aún sin identificar.";
  }
  function ensureIdentity() {
    if (!alive()) return;
    chrome.storage.local.get(K_ID, (d) => {
      identity = d[K_ID] || null;
      if (!identity || !identity.name) { const a = detectSAName(); if (a) { identity = { name: a, source: "auto", ts: Date.now() }; chrome.storage.local.set({ [K_ID]: identity }); } }
      refreshWho();
    });
  }
  $("tk-name-save").addEventListener("click", () => {
    const v = $("tk-name-in").value.trim(); if (!v) return;
    identity = { name: v, source: "manual", ts: Date.now() };
    chrome.storage.local.set({ [K_ID]: identity }, () => { refreshWho(); $("tk-cfg-st").textContent = "Nombre guardado: " + v; });
  });

  /* ---------- Config IA ---------- */
  function refreshAI() {
    if (!alive()) return;
    chrome.storage.local.get("config", (d) => {
      const c = d.config; hasAI = !!(c && c.apiKey && c.model);
      if ($("tk-ai-st")) $("tk-ai-st").textContent = hasAI ? "IA conectada: " + c.model : "IA no conectada (la gramática quedará deshabilitada).";
    });
  }
  $("tk-ai-cfg").addEventListener("click", () => chrome.runtime.sendMessage({ type: "TK_OPEN_OPTIONS" }));

  function loadCfg(cb) {
    chrome.storage.local.get(K_CFG, (d) => {
      cfg = { ...DEFAULTS, ...(d[K_CFG] || {}) };
      if ($("tk-dedup-in")) $("tk-dedup-in").value = cfg.dedupMinutes;
      if ($("tk-old-in")) $("tk-old-in").value = cfg.oldRoDays;
      if ($("tk-pattern-in")) $("tk-pattern-in").value = cfg.roUrlPattern === DEFAULTS.roUrlPattern ? "" : cfg.roUrlPattern;
      cb && cb();
    });
  }
  $("tk-cfg-save").addEventListener("click", () => {
    const next = {
      dedupMinutes: parseInt($("tk-dedup-in").value, 10) || DEFAULTS.dedupMinutes,
      oldRoDays: parseInt($("tk-old-in").value, 10) || DEFAULTS.oldRoDays,
      roUrlPattern: $("tk-pattern-in").value.trim() || DEFAULTS.roUrlPattern
    };
    chrome.storage.local.set({ [K_CFG]: next }, () => { cfg = { ...DEFAULTS, ...next }; $("tk-cfg-st").textContent = "Ajustes guardados."; });
  });
  $("tk-cfg-reset").addEventListener("click", () => {
    chrome.storage.local.remove(K_CFG, () => { cfg = { ...DEFAULTS }; loadCfg(); $("tk-cfg-st").textContent = "Restablecido."; });
  });

  /* ---------- Utilidades de lectura ---------- */
  function bodyText() {
    // IMPORTANTE: leemos el innerText VIVO (no un clon). Un clon desconectado
    // no tiene layout y pega todo sin saltos de línea. Ocultamos el panel un
    // instante (de forma síncrona, sin parpadeo) para no incluir su texto.
    const wEl = document.getElementById("tk-widget");
    const prev = wEl ? wEl.style.display : null;
    if (wEl) wEl.style.display = "none";
    let t = "";
    try { t = document.body.innerText || ""; } catch (e) { t = document.body.textContent || ""; }
    if (wEl) wEl.style.display = prev || "";
    return t;
  }
  // Valor que sigue a una etiqueta del sidebar; "Add" = campo vacío.
  function valueAfter(T, label) {
    const m = T.match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n?\\s*([^\\n]*)", "i"));
    if (!m) return null;
    const v = (m[1] || "").trim();
    if (!v || /^Add\b/i.test(v)) return null;
    return v;
  }
  function parseAgeMinutes(txt) {
    // "Created 28m ago", "Created 1d ago", "Created 11d ago", "2 days ago", "3 hr"
    const seg = (txt.match(/Created\s+[^\n]+ago/i) || [txt])[0];
    let mins = null;
    const d = seg.match(/(\d+)\s*(?:d\b|day)/i), h = seg.match(/(\d+)\s*(?:h\b|hr|hour)/i), m = seg.match(/(\d+)\s*(?:m\b|min)/i);
    if (d) mins = (mins || 0) + +d[1] * 1440;
    if (h) mins = (mins || 0) + +h[1] * 60;
    if (m && !/\b(am|pm)\b/i.test(seg)) mins = (mins || 0) + +m[1];
    return mins;
  }
  function fmtAge(mins) {
    if (mins == null) return "—";
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60);
    return d > 0 ? d + "d " + h + "h" : (h > 0 ? h + "h" : mins + "m");
  }

  /* ---------- Detección de contexto ---------- */
  function detectContext() {
    const T = bodyText();
    if (/RO\s*#\s*\d+\s*:/.test(T) || (/\bSummary\b/.test(T) && /\bWork-In-Progress\b/.test(T) && /\bEstimate\b/.test(T) && roFromUrl(location.href))) return "ro";
    if (/Tech Board/.test(T) && /Incomplete/.test(T)) return "techboard";
    if (/Job Board/.test(T) || /Estimates\s*\(\d+\)/.test(T)) return "jobboard";
    if (roFromUrl(location.href)) return "ro";
    return "other";
  }

  /* ---------- Escaneo de tarjetas de RO (kanban) ---------- */
  const RO_RE = /RO\s*#\s*(\d{3,8})/i;
  function scanCards() {
    // Para cada RO elegimos el contenedor "tarjeta": el más pequeño que
    // ADEMÁS contenga la antigüedad ("Created … ago"). Así no nos quedamos
    // con el sólo enlace "RO#70402" (que no trae ni fecha ni cliente).
    const byRo = new Map();
    document.querySelectorAll("a, div, li, article, section").forEach((el) => {
      if (el.closest("#tk-widget")) return;
      const tc = el.textContent || "";
      const m = tc.match(RO_RE); if (!m) return;
      const t = (el.innerText || "").trim();
      if (!t || t.length > 1200) return;          // descarta columnas enteras
      const ro = m[1];
      const hasAge = /Created\b[^\n]*ago/i.test(t);
      const score = (hasAge ? 0 : 100000) + t.length; // con-antigüedad y más pequeño gana
      const cur = byRo.get(ro);
      if (!cur || score < cur.score) byRo.set(ro, { ro, txt: t, el, score, hasAge });
    });
    const cards = [...byRo.values()];
    cards.forEach((c) => {
      c.ageMin = parseAgeMinutes(c.txt);
      c.rect = c.el.getBoundingClientRect();
      c.line = cardDetail(c.txt);
    });
    return cards;
  }
  function cardDetail(t) {
    const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
    const skip = /^(RO\s*#|Created\b|Estimate$|Work In Progress$|Work Not Started$|Balance Due$|Completed$|Additional AUTH|Requires Authorization|Sent\b|Not Started\b|Paid$|Viewed|\$|[A-Z]{2}$)/i;
    const cust = lines.find((l) => /\(\d{3}\)\s?\d{3}-\d{4}/.test(l)) || lines.find((l) => !skip.test(l) && /^[A-Za-z]/.test(l) && l.length < 40);
    const veh = lines.find((l) => /\b(19|20)\d{2}\b/.test(l));
    return [cust, veh].filter(Boolean).join(" · ") || lines.slice(0, 2).join(" · ");
  }
  // Asigna cada tarjeta a la columna cuyo encabezado está más cerca en X.
  function assignColumns(cards, headers) {
    cards.forEach((c) => {
      const cx = c.rect.left + c.rect.width / 2;
      let best = null, bd = 1e9;
      headers.forEach((h) => { const d = Math.abs(h.cx - cx); if (d < bd) { bd = d; best = h; } });
      c.column = best ? best.label : "—";
    });
  }
  function findHeaders(patternTest) {
    // Devuelve elementos "encabezado de columna" {label, cx} según un test de texto.
    const out = [];
    document.querySelectorAll("div, span, h1, h2, h3, p").forEach((el) => {
      if (el.closest("#tk-widget")) return;
      if (el.children.length > 3) return;
      const t = (el.innerText || "").trim();
      if (!t || t.length > 40) return;
      const label = patternTest(t);
      if (!label) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.top > 320) return; // encabezados están arriba
      out.push({ label, cx: r.left + r.width / 2, top: r.top });
    });
    // dedup por label quedándonos con el más alto
    const byLabel = new Map();
    out.forEach((h) => { const p = byLabel.get(h.label); if (!p || h.top < p.top) byLabel.set(h.label, h); });
    return [...byLabel.values()];
  }

  /* ---------- Render: Job Board ---------- */
  function renderJobBoard() {
    const T = bodyText();
    const cards = scanCards();
    const headers = findHeaders((t) => {
      const m = t.match(/^(Estimates|Work-In-Progress|Completed)\s*\(\d+\)/i);
      return m ? m[1] : null;
    });
    if (headers.length) assignColumns(cards, headers);

    // Conteos oficiales desde los encabezados
    const counts = {};
    (T.match(/(Estimates|Work-In-Progress|Completed)\s*\((\d+)\)/gi) || []).forEach((s) => {
      const mm = s.match(/(Estimates|Work-In-Progress|Completed)\s*\((\d+)\)/i); if (mm) counts[mm[1]] = +mm[2];
    });

    const wip = cards.filter((c) => /Work[\s-]?In[\s-]?Progress|Work Not Started/i.test(c.column + " " + c.txt) || c.column === "Work-In-Progress");
    const aged = cards.filter((c) => c.ageMin != null).sort((a, b) => b.ageMin - a.ageMin);
    const oldThresh = (cfg.oldRoDays || 3) * 1440;
    const oldCount = aged.filter((c) => c.ageMin >= oldThresh).length;

    let h = '<div class="tk-kpis">';
    h += kpi("Estimates", counts["Estimates"] != null ? counts["Estimates"] : "—");
    h += kpi("En progreso", counts["Work-In-Progress"] != null ? counts["Work-In-Progress"] : "—");
    h += kpi("Completados", counts["Completed"] != null ? counts["Completed"] : "—");
    h += '</div>';
    h += '<div class="tk-statusline"><b>' + cards.length + '</b> tarjetas leídas · <b class="' + (oldCount ? 'tk-warnt' : '') + '">' + oldCount + '</b> con más de ' + (cfg.oldRoDays || 3) + ' días</div>';

    h += sec("Los más viejos en el sistema", '<table class="tk-tbl"><thead><tr><th>RO</th><th>Antig.</th><th>Detalle</th></tr></thead><tbody>' +
      aged.slice(0, 12).map((c) => '<tr class="' + (c.ageMin >= oldThresh ? "old" : "") + '"><td class="tk-ro">#' + esc(c.ro) + '</td><td class="tk-age">' + fmtAge(c.ageMin) + '</td><td class="tk-cardtxt">' + esc(trimLine(c.line)) + '</td></tr>').join("") +
      '</tbody></table>');

    $("tk-ctx-out").innerHTML = h;
    $("tk-ctx-st").innerHTML = "Job Board analizado.";
  }

  /* ---------- Render: Tech Board ---------- */
  function renderTechBoard() {
    const cards = scanCards();
    // Encabezados = nombres de técnico (texto corto, arriba, no numérico ni "Assigned/Complete/Incomplete")
    const headers = findHeaders((t) => {
      if (/^(Assigned|Complete|Incomplete|Unassigned|No Tech Assigned|Tech Board)/i.test(t)) {
        if (/^No Tech Assigned/i.test(t)) return "Sin asignar"; return null;
      }
      if (/\d/.test(t)) return null;
      if (/^[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z.]+){0,2}$/.test(t)) return t; // "Romel Perez"
      return null;
    });
    if (headers.length) assignColumns(cards, headers);

    const byTech = {};
    cards.forEach((c) => { const k = c.column || "—"; (byTech[k] = byTech[k] || []).push(c); });
    const techs = Object.keys(byTech).sort((a, b) => byTech[b].length - byTech[a].length);

    let h = '<div class="tk-statusline"><b>' + cards.length + '</b> ROs en el tablero · <b>' + techs.length + '</b> columnas detectadas</div>';
    h += sec("ROs por técnico", '<table class="tk-tbl"><thead><tr><th>Técnico</th><th>ROs</th><th>Más viejo</th></tr></thead><tbody>' +
      techs.map((t) => {
        const list = byTech[t]; const oldest = list.reduce((mx, c) => (c.ageMin != null && (mx == null || c.ageMin > mx) ? c.ageMin : mx), null);
        return '<tr><td>' + esc(t) + '</td><td class="tk-ro">' + list.length + '</td><td class="tk-age">' + fmtAge(oldest) + '</td></tr>';
      }).join("") + '</tbody></table>');

    // Horas por técnico desde los encabezados (Assigned / Incomplete), si se pueden leer
    const hoursTbl = readTechHours();
    if (hoursTbl) h += sec("Carga (horas)", hoursTbl);

    $("tk-ctx-out").innerHTML = h;
    $("tk-ctx-st").innerHTML = "Tech Board analizado.";
  }
  function readTechHours() {
    // Busca patrones "Assigned  Complete  Incomplete" con tres números debajo.
    const T = bodyText();
    if (!/Assigned[\s\S]{0,40}Incomplete/i.test(T)) return null;
    return '<div class="tk-hint">Las horas Assigned/Complete/Incomplete aparecen en el encabezado de cada técnico en el Tech Board. Revísalas ahí directamente; el conteo de ROs de arriba ya resume la carga.</div>';
  }

  /* ---------- Render: Auditoría del RO ---------- */
  function roFromUrl(url) {
    let re; try { re = new RegExp(cfg.roUrlPattern); } catch (e) { re = new RegExp(DEFAULTS.roUrlPattern); }
    const m = url.match(re); if (!m) return null;
    for (let i = 1; i < m.length; i++) if (m[i]) return m[i]; return null;
  }
  function roHeader() {
    const T = bodyText();
    const m = T.match(/RO\s*#\s*(\d+)\s*:\s*([^\n]+)/);
    return m ? { num: m[1], title: m[2].trim() } : { num: roFromUrl(location.href) || "", title: "" };
  }

  function auditRO() {
    const T = bodyText();
    const checks = [];
    const add = (level, label, detail) => checks.push({ level, label, detail: detail || "" });

    // --- Datos del RO (fiables, del sidebar) ---
    // VIN: 17 caracteres válidos (sin I, O, Q). Sin límites de palabra (el texto puede venir pegado).
    let vin = (T.match(/VIN[#:\s]*\n?\s*([A-HJ-NPR-Z0-9]{17})/i) || [])[1];
    if (!vin) vin = (T.match(/[A-HJ-NPR-Z0-9]{17}/g) || []).find((x) => /[0-9]/.test(x) && /[A-HJ-NPR-Z]/.test(x)) || null;
    add(vin ? "ok" : "fail", "VIN", vin || "no encontrado en el RO");

    const email = (T.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0];
    add(email ? "ok" : "fail", "Email del cliente", email || "falta");

    const phone = (T.match(/\(\d{3}\)\s?\d{3}-\d{4}/) || T.match(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/) || [])[0];
    add(phone ? "ok" : "fail", "Teléfono del cliente", phone || "falta");

    let addr = valueAfter(T, "Address");
    if (addr && !/^\d/.test(addr)) addr = null; // una dirección real empieza con número
    if (!addr) addr = (T.match(/\b\d{1,6}\s+[A-Za-z0-9.\s]+\b(Road|Rd|Street|St|Ave|Avenue|Dr|Drive|Lane|Ln|Blvd|Hwy|Court|Ct|Way|Circle|Cir)\b[^\n]*/i) || [])[0];
    add(addr ? "ok" : "warn", "Dirección del cliente", addr ? trimLine(addr, 40) : "falta");

    const pt = valueAfter(T, "Promise Time");
    add(pt ? "ok" : "warn", "Promise Time", pt || "sin definir");

    const plate = valueAfter(T, "License plate");
    add(plate ? "ok" : "warn", "Placa", plate ? trimLine(plate, 24) : "sin placa");

    const ron = valueAfter(T, "RO Notes");
    add(ron ? "ok" : "warn", "Notas del RO", ron ? "presentes" : "vacías");

    // --- Trabajos y partes (best-effort) ---
    const approved = (T.match(/Approved on /gi) || []).length;
    const needsAuth = (T.match(/Requires Authorization|Additional AUTH|Authorize/gi) || []).length;
    add(approved ? "ok" : "warn", "Jobs aprobados", approved + " aprobado(s)" + (needsAuth ? " · " + needsAuth + " requiere(n) autorización" : ""));

    // Líneas de labor con horas
    const laborHours = (T.match(/\b\d+\.\d{2}\b/g) || []).length;
    add(laborHours ? "ok" : "warn", "Labor time en jobs", laborHours ? "hay tiempos de labor cargados" : "no veo horas de labor (¿job sin tiempo?)");

    // Parte en 0 (qty 0)
    const partZero = /\bQty\b[\s\S]{0,40}\b0\b/i.test(T) || /\n0\s+\$0\.00/.test(T);
    if (partZero) add("warn", "Partes", "posible línea de parte en cantidad 0 — revísala");

    // Fluids
    const fluidsEmpty = /Fluids[\s\S]{0,4}(Filters|Tires|Batteries|Specs)/i.test(T) && !/Fluids[\s\S]{0,120}(qt|oz|gal|liter|litro|cantidad)/i.test(T);
    add(fluidsEmpty ? "warn" : "ok", "Fluidos", fluidsEmpty ? "revisa tipo y cantidad" : "sección con datos");

    // --- Render ---
    const hd = roHeader();
    let h = '<div class="tk-job"><div class="tk-ro">RO #' + esc(hd.num) + '</div><div class="tk-cardtxt">' + esc(trimLine(hd.title, 60)) + '</div></div>';
    const fails = checks.filter((c) => c.level === "fail").length, warns = checks.filter((c) => c.level === "warn").length;
    h += '<div class="tk-statusline">' + (fails ? '<b class="tk-failt">' + fails + ' faltan</b> · ' : '') + (warns ? '<b class="tk-warnt">' + warns + ' por revisar</b> · ' : '') + (checks.length - fails - warns) + ' ok</div>';
    h += '<div class="tk-checks">' + checks.map((c) =>
      '<div class="tk-check ' + c.level + '"><span class="tk-ck">' + (c.level === "ok" ? "✓" : c.level === "fail" ? "✕" : "!") + '</span><div><b>' + esc(c.label) + '</b><div class="tk-ckd">' + esc(c.detail) + '</div></div></div>').join("") + '</div>';

    // Gramática de notas
    const techNotes = extractTechNotes(T);
    if (techNotes.length) {
      h += sec("Notas de técnicos (" + techNotes.length + ")", '<div class="tk-hint">' + (hasAI ? "Pulsa para revisar ortografía/gramática con la IA." : "Conecta la IA en Ajustes para revisar la gramática.") + '</div>' +
        '<button class="tk-btn tk-sec tk-full" id="tk-grammar" ' + (hasAI ? "" : "disabled") + '>Revisar gramática de las notas</button><div id="tk-grammar-out"></div>');
    }

    $("tk-ctx-out").innerHTML = h;
    $("tk-ctx-st").innerHTML = "RO auditado.";
    const gb = $("tk-grammar");
    if (gb) gb.addEventListener("click", () => runGrammar(techNotes));
  }

  function extractTechNotes(T) {
    // Líneas tipo "Note: ..." (notas de los técnicos) y concerns.
    const notes = [];
    (T.match(/Note:\s*[^\n]{6,300}/gi) || []).forEach((n) => { const v = n.replace(/^Note:\s*/i, "").trim(); if (v && !notes.includes(v)) notes.push(v); });
    return notes.slice(0, 12);
  }
  function runGrammar(notes) {
    const out = $("tk-grammar-out");
    out.innerHTML = '<div class="tk-hint">Revisando con la IA…</div>';
    chrome.runtime.sendMessage({ type: "TK_GRAMMAR", notes }, (res) => {
      if (chrome.runtime.lastError) { out.innerHTML = '<div class="tk-hint">La extensión se actualizó. Refresca la página (F5).</div>'; return; }
      if (!res || !res.ok) { out.innerHTML = '<div class="tk-hint">No se pudo revisar: ' + esc(res ? res.error : "desconocido") + '</div>'; return; }
      const items = res.items || [];
      out.innerHTML = '<table class="tk-tbl"><thead><tr><th>Original</th><th>Corregido</th></tr></thead><tbody>' +
        items.map((it) => '<tr><td class="tk-cardtxt">' + esc(it.original) + '</td><td>' + (it.changed ? '<b>' + esc(it.corrected) + '</b>' : '<span class="tk-hint">sin cambios</span>') + '</td></tr>').join("") + '</tbody></table>';
    });
  }

  /* ---------- Helpers de render ---------- */
  function kpi(label, val) { return '<div class="tk-kpi"><div class="tk-kpival">' + esc(val) + '</div><div class="tk-kpilbl">' + esc(label) + '</div></div>'; }
  function sec(title, inner) { return '<div class="tk-sec"><h3>' + esc(title) + '</h3>' + inner + '</div>'; }
  function trimLine(s, n) { s = (s || "").replace(/\s+/g, " ").trim(); n = n || 48; return s.length > n ? s.slice(0, n) + "…" : s; }

  /* ---------- Botón analizar ---------- */
  function analyze() {
    context = detectContext();
    $("tk-tab-ctx").textContent = context === "ro" ? "RO" : "Tablero";
    if (context === "jobboard") renderJobBoard();
    else if (context === "techboard") renderTechBoard();
    else if (context === "ro") auditRO();
    else { $("tk-ctx-out").innerHTML = ""; $("tk-ctx-st").innerHTML = "No reconozco esta pantalla. Abre el <b>Job Board</b>, el <b>Tech Board</b> o un <b>RO</b>."; }
  }
  $("tk-analyze").addEventListener("click", analyze);
  $("tk-diag").addEventListener("click", () => {
    const cards = scanCards();
    const ctx = detectContext(); const ro = roFromUrl(location.href);
    let h = '<div class="tk-diag">';
    h += '<div><b>Contexto:</b> ' + esc(ctx) + '</div>';
    h += '<div><b>URL:</b> ' + esc(location.href) + '</div>';
    h += '<div><b>¿RO en URL?</b> ' + (ro ? "id=" + esc(ro) : "no") + '</div>';
    h += '<div><b>SA:</b> ' + esc(identity && identity.name ? identity.name : "—") + '</div>';
    h += '<div><b>Tarjetas RO detectadas:</b> ' + cards.length + '</div>';
    if (cards[0]) h += '<div><b>Ejemplo:</b> ' + esc(trimLine(cards[0].line, 60)) + ' (' + fmtAge(cards[0].ageMin) + ')</div>';
    h += '</div>';
    $("tk-ctx-out").innerHTML = h; $("tk-ctx-st").textContent = "Diagnóstico.";
  });

  /* ---------- Registro de aperturas de RO ---------- */
  function roNumberFromPage() { const m = bodyText().match(/RO\s*#\s*(\d{2,8})/i); return m ? m[1] : ""; }
  function createdAtFromPage() { const m = bodyText().match(/Time-In\s*\n?\s*([A-Za-z0-9 ,:]{6,30})/i) || bodyText().match(/Created[:\s]+([A-Za-z0-9 ,:/\-]{6,30})/i); return m ? m[1].trim() : ""; }
  function maybeLogRO() {
    if (!alive()) return;
    if (!identity || !identity.name) return;
    const roId = roFromUrl(location.href); if (!roId) return;
    const key = identity.name + "|" + roId, now = Date.now(), windowMs = (cfg.dedupMinutes || 0) * 60000;
    if (key === lastLoggedKey && windowMs > 0 && now - lastLoggedAt < windowMs) return;
    getLog((log) => {
      if (windowMs > 0) { const recent = [...log].reverse().find((e) => e.sa === identity.name && e.roId === roId); if (recent && now - recent.ts < windowMs) { lastLoggedKey = key; lastLoggedAt = recent.ts; return; } }
      log.push({ sa: identity.name, roId, roNumber: roNumberFromPage() || roId, createdAt: createdAtFromPage(), url: location.href, ts: now });
      setLog(log); lastLoggedKey = key; lastLoggedAt = now; setDot("ready");
      if (activeTab === "reg") renderLog();
    });
  }
  (function hookHistory() {
    const fire = () => setTimeout(() => { if (location.href !== lastUrl) lastUrl = location.href; maybeLogRO(); }, 300);
    const _p = history.pushState, _r = history.replaceState;
    history.pushState = function () { const x = _p.apply(this, arguments); fire(); return x; };
    history.replaceState = function () { const x = _r.apply(this, arguments); fire(); return x; };
    window.addEventListener("popstate", fire);
  })();
  const tkTimer = setInterval(() => { if (!alive()) { clearInterval(tkTimer); return; } if (location.href !== lastUrl) lastUrl = location.href; maybeLogRO(); }, DEFAULTS.pollMs);

  function fmtTs(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); } }
  function renderLog() {
    getLog((log) => {
      const sum = $("tk-reg-sum"), out = $("tk-reg-out");
      if (!log.length) { sum.textContent = "Sin registros. Abre un RO y aparecerá aquí."; out.innerHTML = ""; return; }
      const sod = new Date(); sod.setHours(0, 0, 0, 0);
      const today = log.filter((e) => e.ts >= sod.getTime());
      const bySA = {}; today.forEach((e) => bySA[e.sa] = (bySA[e.sa] || 0) + 1);
      sum.innerHTML = '<b>' + today.length + '</b> aperturas hoy · <b>' + new Set(today.map((e) => e.roId)).size + '</b> ROs distintos' +
        (Object.keys(bySA).length ? '<div class="tk-sub">' + Object.keys(bySA).map((k) => esc(k) + " (" + bySA[k] + ")").join(" · ") + '</div>' : '');
      out.innerHTML = '<table class="tk-tbl"><thead><tr><th>RO</th><th>SA</th><th>Abierto</th></tr></thead><tbody>' +
        [...log].slice(-60).reverse().map((e) => '<tr><td class="tk-ro">' + esc(e.roNumber || e.roId) + '</td><td>' + esc(e.sa) + '</td><td class="tk-when">' + esc(fmtTs(e.ts)) + '</td></tr>').join("") + '</tbody></table>';
    });
  }
  $("tk-refresh-log").addEventListener("click", renderLog);
  $("tk-clear-log").addEventListener("click", () => { if (confirm("¿Borrar TODO el registro local de esta PC?")) { setLog([]); renderLog(); } });
  $("tk-export").addEventListener("click", () => {
    getLog((log) => {
      if (!log.length) { alert("No hay registros."); return; }
      const head = ["fecha_hora", "SA", "RO", "RO_id", "creado_en", "url"];
      const lines = [head.join(",")];
      log.forEach((e) => lines.push([fmtTs(e.ts), e.sa, e.roNumber || "", e.roId || "", e.createdAt || "", e.url || ""].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",")));
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "registro-ros-tekmetric-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
    });
  });

  /* ---------- Arranque ---------- */
  loadCfg(() => {
    ensureIdentity(); refreshAI(); setDot("idle"); maybeLogRO();
    // Auto-analiza al abrir, sin molestar.
    setTimeout(() => { try { analyze(); } catch (e) {} }, 1200);
  });
  try { chrome.storage.onChanged.addListener((ch) => { if (!alive()) return; if (ch.config) refreshAI(); }); } catch (e) {}
  setTimeout(() => { if (alive()) ensureIdentity(); }, 4000);
})();
