/* ============================================================
   content.js — Asistente de Taller (panel unificado, movible)
   ============================================================ */
(() => {
  if (document.getElementById("at-widget")) return;

  const DWELL_MS = 4000, POLL_MS = 1500, MIN_TEXT = 400, UIKEY = "at_ui_v2";

  let hasAI = false, autoMode = true;
  const cache = new Map();   // pageKey -> { status, res, error }
  let currentKey = "", dwellTimer = null;

  const w = document.createElement("div");
  w.id = "at-widget";
  w.innerHTML = `
    <div class="at-head" id="at-head">
      <span class="at-dot" id="at-dot"></span>
      <span class="at-ttl">Asistente de Taller</span>
      <span class="at-sp"></span>
      <button class="at-icon" id="at-collapse" title="Plegar / desplegar">▾</button>
      <button class="at-icon" id="at-close" title="Cerrar (reaparece al recargar la página)">✕</button>
    </div>
    <div class="at-tabs" id="at-tabs">
      <button class="at-tab active" data-tab="ficha">Ficha ⚡</button>
      <button class="at-tab" data-tab="trad">Traducir</button>
      <button class="at-tab" data-tab="filt">Filtrar</button>
    </div>
    <div class="at-bodywrap" id="at-bodywrap">
      <div class="at-pane" id="pane-ficha">
        <div class="at-ficharow">
          <button class="at-btn at-primary" id="at-gen">Generar / ver ficha</button>
          <label class="at-auto" title="Pre-procesar al abrir un procedimiento"><input type="checkbox" id="at-auto"> Auto</label>
        </div>
        <div class="at-statusline" id="at-statusline">Listo.</div>
        <div id="at-ficha-out"></div>
      </div>
      <div class="at-pane" id="pane-trad" style="display:none">
        <button class="at-btn at-full" id="at-tr">Traducir al español</button>
        <button class="at-btn at-sec at-full" id="at-tr-undo" style="display:none;margin-top:6px;">Ver original (inglés)</button>
        <div class="at-st" id="at-tr-st"></div>
      </div>
      <div class="at-pane" id="pane-filt" style="display:none">
        <div class="at-row">
          <input class="at-in" id="at-f-in" placeholder="Ej: 2.7L, 2015, P0420">
          <button class="at-btn" id="at-f-go">Buscar</button>
        </div>
        <button class="at-btn at-sec at-full" id="at-f-focus" style="margin-top:6px;">Modo enfoque</button>
        <button class="at-btn at-sec at-full" id="at-f-clear" style="margin-top:6px;">Limpiar</button>
        <div class="at-st" id="at-f-st"></div>
      </div>
    </div>
    <div class="at-resize" id="at-resize" title="Arrastra para redimensionar"></div>`;
  document.body.appendChild(w);

  const $ = (id) => document.getElementById(id);
  const out = $("at-ficha-out");

  /* Posición / tamaño persistentes */
  function loadUI(){ try{ return JSON.parse(localStorage.getItem(UIKEY))||{}; }catch(e){ return {}; } }
  function saveUI(p){ try{ localStorage.setItem(UIKEY, JSON.stringify(p)); }catch(e){} }
  let ui = loadUI();
  const DEF_W = 380, DEF_H = 520;
  let width = ui.width || DEF_W, height = ui.height || DEF_H;
  w.style.width = width + "px"; w.style.height = height + "px";
  let left = (typeof ui.left === "number") ? ui.left : Math.max(8, window.innerWidth - width - 16);
  let top = (typeof ui.top === "number") ? ui.top : Math.max(8, window.innerHeight - height - 16);
  applyPos();
  if (ui.collapsed) { w.classList.add("at-collapsed"); }
  let activeTab = ui.tab || "ficha";
  if (ui.tab) switchTab(ui.tab);
  if (ui.collapsed) $("at-collapse").textContent = "▴";

  function applyPos(){
    left = Math.max(0, Math.min(window.innerWidth - 60, left));
    top = Math.max(0, Math.min(window.innerHeight - 30, top));
    w.style.left = left + "px"; w.style.top = top + "px"; w.style.right = "auto"; w.style.bottom = "auto";
  }
  function persist(){ saveUI({ left, top, width, height, collapsed: w.classList.contains("at-collapsed"), tab: activeTab }); }
  window.addEventListener("resize", applyPos);

  function makeOverlay(cursor){ const o = document.createElement("div"); o.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:"+cursor+";"; document.body.appendChild(o); return o; }
  $("at-head").addEventListener("mousedown", (e) => {
    if (e.target.closest("#at-collapse") || e.target.closest("#at-close")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, sl = left, st = top; const ov = makeOverlay("move");
    function mm(ev){ left = sl + (ev.clientX - sx); top = st + (ev.clientY - sy); applyPos(); }
    function mu(){ document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); ov.remove(); persist(); }
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  });
  $("at-resize").addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = width, sh = height; const ov = makeOverlay("nwse-resize");
    function mm(ev){ width = Math.max(280, Math.min(window.innerWidth - left - 4, sw + (ev.clientX - sx)));
      height = Math.max(180, Math.min(window.innerHeight - top - 4, sh + (ev.clientY - sy))); w.style.width = width+"px"; w.style.height = height+"px"; }
    function mu(){ document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); ov.remove(); persist(); }
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  });
  $("at-collapse").addEventListener("click", () => { w.classList.toggle("at-collapsed"); $("at-collapse").textContent = w.classList.contains("at-collapsed") ? "▴" : "▾"; persist(); });

  /* ---------- Cerrar el panel + mini-botón para reabrir ---------- */
  let launcher = null;
  function showLauncher() {
    if (launcher) { launcher.style.display = "flex"; return; }
    launcher = document.createElement("button");
    launcher.id = "at-launcher";
    launcher.title = "Abrir Asistente de Taller";
    launcher.textContent = "🔧";
    launcher.addEventListener("click", () => { w.style.display = ""; launcher.style.display = "none"; });
    document.body.appendChild(launcher);
  }
  $("at-close").addEventListener("click", (e) => {
    e.stopPropagation();
    w.style.display = "none";
    showLauncher();
  });

  function switchTab(tab){
    activeTab = tab;
    document.querySelectorAll("#at-tabs .at-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("pane-ficha").style.display = tab === "ficha" ? "block" : "none";
    $("pane-trad").style.display = tab === "trad" ? "block" : "none";
    $("pane-filt").style.display = tab === "filt" ? "block" : "none";
  }
  document.querySelectorAll("#at-tabs .at-tab").forEach((b) =>
    b.addEventListener("click", () => { switchTab(b.dataset.tab); if (w.classList.contains("at-collapsed")) { w.classList.remove("at-collapsed"); $("at-collapse").textContent = "▾"; } persist(); }));

  chrome.storage.local.get(["config", "autoMode"], (data) => {
    const config = data.config;
    hasAI = !!(config && config.apiKey && config.model);
    autoMode = data.autoMode !== false;
    $("at-auto").checked = autoMode;
    setStatus(hasAI ? "Listo · IA: " + config.model : "Listo · sin IA (conéctala para la ficha)", "idle");
    maybeSchedule();
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.config) { const c = ch.config.newValue; hasAI = !!(c && c.apiKey && c.model); setStatus(hasAI ? "IA conectada: " + c.model : "Sin IA", "idle"); }
  });
  $("at-auto").addEventListener("change", (e) => {
    autoMode = e.target.checked; chrome.storage.local.set({ autoMode });
    setStatus(autoMode ? "Auto activado" : "Auto desactivado", "idle");
    if (autoMode) { currentKey = ""; maybeSchedule(); }
  });

  function setStatus(text, state){ $("at-statusline").innerHTML = text; $("at-dot").className = "at-dot " + (state || "idle"); }
  function openCfgLinks(scope){ (scope || document).querySelectorAll(".at-cfg-link").forEach((c) => c.addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.sendMessage({ type: "AT_OPEN_OPTIONS" }); })); }

  /* ---------- Detección de página + extracción ---------- */
  function firstHeading(){ const h = document.querySelector("h1, h2"); return h ? (h.innerText || "").trim().slice(0, 80) : ""; }
  function getPageKey(){ return location.href + "|" + firstHeading(); }

  function extractProcedureText(){
    // 1) Mejor contenedor semántico
    const sels = ["main","article","[id*='content']","[class*='content']","[class*='article']","[class*='procedure']","[id*='article']","#mainContent",".main"];
    let best = ""; const seen = new Set();
    for (const sel of sels) document.querySelectorAll(sel).forEach((el) => {
      if (el.closest("#at-widget") || seen.has(el)) return;
      seen.add(el); const t = (el.innerText || "").trim(); if (t.length > best.length) best = t;
    });
    // 2) Texto completo del body (sin el widget)
    let bodyText = "";
    try { const clone = document.body.cloneNode(true); const ww = clone.querySelector("#at-widget"); if (ww) ww.remove(); bodyText = (clone.innerText || "").trim(); }
    catch (e) { bodyText = (document.body.innerText || "").trim(); }
    // 3) iframes del mismo origen (ALLDATA a veces mete el artículo en uno)
    let frameText = "";
    document.querySelectorAll("iframe").forEach((fr) => { try { const d = fr.contentDocument; const t = d && d.body && d.body.innerText; if (t && t.trim().length > frameText.length) frameText = t.trim(); } catch (e) {} });
    // El más largo gana (más probable que sea el procedimiento real)
    let res = best;
    if (bodyText.length > res.length) res = bodyText;
    if (frameText.length > res.length) res = frameText;
    return res;
  }

  setInterval(maybeSchedule, POLL_MS);
  function maybeSchedule(){
    const key = getPageKey();
    if (key === currentKey) return;
    currentKey = key;
    if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; }
    const cached = cache.get(key);
    if (cached) {
      if (cached.status === "ready") { setStatus("✓ Ficha lista", "ready"); showResult(cached.res); }
      else if (cached.status === "processing") setStatus("Procesando ficha…", "working");
      return;
    }
    out.innerHTML = "";
    setStatus(hasAI ? "Listo (abre un procedimiento)" : "Sin IA · <a href='#' class='at-cfg-link'>conectar</a>", "idle");
    openCfgLinks($("pane-ficha"));
    if (!autoMode || !hasAI) return;
    dwellTimer = setTimeout(() => {
      if (getPageKey() !== key) return;
      const text = extractProcedureText();
      if (!text || text.length < MIN_TEXT) return;
      generateFor(key, text);
    }, DWELL_MS);
  }

  function fichaIsEmpty(f){ f = f || {}; const j = f.job || {}; const ks=["probableCauses","topFixes","tsbs","alerts","parts","fluids","specs","steps"]; const any=ks.some(k=>(f[k]||[]).length); return !any && !(j.title || j.laborTime); }

  function generateFor(key, text, opts){
    opts = opts || {};
    const ex = cache.get(key);
    if (ex && ex.status === "ready") { if (opts.show) showResult(ex.res); setStatus("✓ Ficha lista", "ready"); return; }
    if (ex && ex.status === "processing") { if (opts.show) out.innerHTML = '<div class="at-msg"><div class="at-spin"></div> Generando…</div>'; return; }
    cache.set(key, { status: "processing" });
    if (key === currentKey) setStatus("Procesando ficha…", "working");
    if (opts.show) out.innerHTML = '<div class="at-msg"><div class="at-spin"></div> Generando la ficha con la IA…</div>';
    // Si la extensión se recargó y esta página quedó con el script viejo,
    // el "contexto" ya no es válido: avisamos en vez de lanzar un error.
    if (!chrome.runtime || !chrome.runtime.id) {
      cache.delete(key);
      if (key === currentKey) { setStatus("Recarga la página", "error"); out.innerHTML = '<div class="at-msg">La extensión se actualizó. <b>Refresca esta página (F5)</b> y vuelve a generar la ficha.</div>'; }
      return;
    }
    let sent;
    try {
      sent = chrome.runtime.sendMessage({ type: "AT_GENERATE", text, url: location.href }, (res) => {
      if (chrome.runtime.lastError) { cache.set(key, { status: "error", error: chrome.runtime.lastError.message });
        if (key === currentKey) {
          const m = chrome.runtime.lastError.message || "";
          if (/context invalidated|message port closed|Receiving end/i.test(m)) { cache.delete(key); setStatus("Recarga la página", "error"); out.innerHTML = '<div class="at-msg">La extensión se actualizó. <b>Refresca esta página (F5)</b> y vuelve a generar la ficha.</div>'; }
          else { setStatus("Error de la IA", "error"); out.innerHTML = '<div class="at-msg">Error: ' + m + '</div>'; }
        } return; }
      if (!res || !res.ok) { const err = res ? res.error : "desconocido"; cache.set(key, { status: "error", error: err, res });
        if (key === currentKey) { setStatus("No se pudo generar", "error"); out.innerHTML = diagHtml("No se pudo generar la ficha.", err, res); openCfgLinks($("pane-ficha")); } return; }
      cache.set(key, { status: "ready", res });
      if (key === currentKey) { setStatus(fichaIsEmpty(res.ficha) ? "La IA respondió vacío" : "✓ Ficha lista", fichaIsEmpty(res.ficha) ? "error" : "ready"); showResult(res); }
      });
    } catch (e) {
      cache.delete(key);
      if (key === currentKey) { setStatus("Recarga la página", "error"); out.innerHTML = '<div class="at-msg">La extensión se actualizó. <b>Refresca esta página (F5)</b> y vuelve a generar la ficha.</div>'; }
    }
  }

  function showResult(res){
    res = res || {};
    if (fichaIsEmpty(res.ficha)) { out.innerHTML = diagHtml("La IA respondió, pero sin datos del procedimiento.", "Probablemente el texto enviado no contenía el procedimiento, o el modelo no lo interpretó.", res); openCfgLinks($("pane-ficha")); return; }
    renderFicha(res.ficha);
  }

  function diagHtml(titleMsg, detail, res){
    res = res || {};
    let h = '<div class="at-msg" style="text-align:left">';
    h += '<b>' + esc(titleMsg) + '</b><br><span style="color:#6b7787">' + esc(detail || "") + '</span>';
    if (typeof res._textLen === "number") h += '<br><br><b>Texto enviado:</b> ' + res._textLen + ' caracteres';
    if (res._raw) h += '<br><b>Respuesta de la IA (inicio):</b><br><code style="font-size:11px;white-space:pre-wrap;word-break:break-word;display:block;background:#f2f4f7;padding:6px;border-radius:6px;margin-top:4px">' + esc(res._raw) + '</code>';
    h += '<br><br><a href="#" class="at-cfg-link">Abrir configuración de la IA</a></div>';
    return h;
  }

  function openFichaForCurrent(){
    switchTab("ficha");
    if (w.classList.contains("at-collapsed")) { w.classList.remove("at-collapsed"); $("at-collapse").textContent = "▾"; }
    const key = getPageKey(); const cached = cache.get(key);
    if (cached && cached.status === "ready") { showResult(cached.res); setStatus(fichaIsEmpty(cached.res.ficha) ? "La IA respondió vacío" : "✓ Ficha lista", fichaIsEmpty(cached.res.ficha) ? "error" : "ready"); return; }
    if (cached && cached.status === "error") { out.innerHTML = diagHtml("No se pudo generar la ficha.", cached.error, cached.res); openCfgLinks($("pane-ficha")); return; }
    if (!hasAI) { out.innerHTML = '<div class="at-msg">Conecta una IA para generar la ficha.<br><br><a href="#" class="at-cfg-link">Abrir configuración</a></div>'; openCfgLinks($("pane-ficha")); return; }
    const text = extractProcedureText();
    if (!text || text.length < 100) { out.innerHTML = '<div class="at-msg">No encontré texto de procedimiento (' + text.length + ' caracteres). Abre un procedimiento de reparación.</div>'; return; }
    generateFor(key, text, { show: true });
  }
  $("at-gen").addEventListener("click", openFichaForCurrent);

  /* ---------- nodos de texto visibles ---------- */
  function getVisibleTextNodes(){
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node){
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest("#at-widget")) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName; if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        const s = getComputedStyle(p); if (s.display === "none" || s.visibility === "hidden") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const a = []; let n; while ((n = walker.nextNode())) a.push(n); return a;
  }

  /* TRADUCIR */
  const originalText = new Map();
  $("at-tr").addEventListener("click", async () => {
    const st = $("at-tr-st");
    if (typeof Translator === "undefined") { st.textContent = "⚠ Tu Chrome no tiene el traductor integrado. Actualiza Chrome (o usa la Ficha con IA)."; return; }
    $("at-tr").disabled = true; st.textContent = "Preparando traductor…";
    try {
      const avail = await Translator.availability({ sourceLanguage: "en", targetLanguage: "es" });
      if (avail === "unavailable") { st.textContent = "⚠ Traducción en→es no disponible aquí."; $("at-tr").disabled = false; return; }
      const tr = await Translator.create({ sourceLanguage: "en", targetLanguage: "es",
        monitor(m){ m.addEventListener("downloadprogress", e => st.textContent = "Descargando modelo… " + Math.round(e.loaded*100) + "%"); } });
      const nodes = getVisibleTextNodes(); let done = 0;
      for (const node of nodes) { if (!originalText.has(node)) originalText.set(node, node.nodeValue);
        try { node.nodeValue = await tr.translate(node.nodeValue); } catch(e){}
        if (++done % 12 === 0) st.textContent = "Traduciendo… " + done + "/" + nodes.length; }
      $("at-tr-undo").style.display = "block"; st.textContent = "✓ " + done + " fragmentos traducidos.";
    } catch (e) { st.textContent = "⚠ " + e.message; } finally { $("at-tr").disabled = false; }
  });
  $("at-tr-undo").addEventListener("click", () => { for (const [node, t] of originalText.entries()) node.nodeValue = t; $("at-tr-st").textContent = "Original restaurado."; });

  /* FILTRAR */
  function clearHighlights(){ document.querySelectorAll("span.at-hl").forEach((s) => { const p = s.parentNode; p.replaceChild(document.createTextNode(s.textContent), s); p.normalize(); }); }
  function runFilter(){
    const term = $("at-f-in").value.trim(); clearHighlights(); const st = $("at-f-st");
    if (!term) { st.textContent = "Escribe algo para buscar."; return; }
    const low = term.toLowerCase(); let count = 0, first = null;
    for (const node of getVisibleTextNodes()) {
      const val = node.nodeValue; if (!val.toLowerCase().includes(low)) continue;
      const frag = document.createDocumentFragment(); const hay = val.toLowerCase(); let i = 0, pos;
      while ((pos = hay.indexOf(low, i)) !== -1) {
        if (pos > i) frag.appendChild(document.createTextNode(val.slice(i, pos)));
        const sp = document.createElement("span"); sp.className = "at-hl"; sp.textContent = val.slice(pos, pos + term.length);
        frag.appendChild(sp); if (!first) first = sp; count++; i = pos + term.length;
      }
      if (i < val.length) frag.appendChild(document.createTextNode(val.slice(i)));
      node.parentNode.replaceChild(frag, node);
    }
    if (count) { first.scrollIntoView({ behavior: "smooth", block: "center" }); st.textContent = "✓ " + count + " coincidencia(s)."; }
    else st.textContent = "Sin coincidencias para \"" + term + "\".";
  }
  $("at-f-go").addEventListener("click", runFilter);
  $("at-f-in").addEventListener("keydown", (e) => { if (e.key === "Enter") runFilter(); });
  let focusOn = false;
  $("at-f-focus").addEventListener("click", () => {
    const term = $("at-f-in").value.trim().toLowerCase(); const st = $("at-f-st");
    if (!term) { st.textContent = "Escribe una palabra antes del modo enfoque."; return; }
    document.querySelectorAll(".at-dim").forEach((el) => el.classList.remove("at-dim"));
    focusOn = !focusOn; if (!focusOn) { st.textContent = "Modo enfoque desactivado."; return; }
    let dim = 0;
    document.querySelectorAll("tr, li, p, div").forEach((el) => { if (el.closest("#at-widget")) return; if (el.children.length > 6) return;
      const t = (el.textContent || "").toLowerCase(); if (t && !t.includes(term)) { el.classList.add("at-dim"); dim++; } });
    st.textContent = "Modo enfoque: " + dim + " bloque(s) atenuado(s).";
  });
  $("at-f-clear").addEventListener("click", () => { clearHighlights(); document.querySelectorAll(".at-dim").forEach((el) => el.classList.remove("at-dim")); focusOn = false; $("at-f-in").value = ""; $("at-f-st").textContent = "Limpio."; });

  /* ---------- Render ficha ---------- */
  function esc(s){ return (s==null?"":String(s)).replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
  function sec(title, inner){ return '<div class="at-sec"><h3>' + title + '</h3><div class="at-secbody">' + inner + '</div></div>'; }
  function badge(src){ return src==="ai" ? '<span class="at-src ai">🤖 IA</span>' : '<span class="at-src ad">📄 ALLDATA</span>'; }
  function renderFicha(f){
    f = f || {}; const job = f.job || {}; const dtc = f.pageType === "dtc"; let h = "";
    h += '<div class="at-legend">📄 ALLDATA = textual de la fuente · 🤖 IA = sugerencia del asistente</div>';
    let sum;
    if (dtc) sum = '<div><span>Causas</span><b>'+(f.probableCauses||[]).length+'</b></div>'+
      '<div><span>Arreglos</span><b>'+(f.topFixes||[]).length+'</b></div>'+
      '<div><span>TSBs</span><b>'+(f.tsbs||[]).length+'</b></div>'+
      '<div><span>Pasos</span><b>'+(f.steps||[]).length+'</b></div>';
    else sum = '<div><span>Labor</span><b>'+(esc(job.laborTime)||"—")+'</b></div>'+
      '<div><span>Dificultad</span><b>'+(esc(job.difficulty)||"—")+'</b></div>'+
      '<div><span>Partes</span><b>'+(f.parts||[]).length+'</b></div>'+
      '<div><span>Fluidos</span><b>'+(f.fluids||[]).length+'</b></div>';
    h += '<div class="at-job"><div class="at-veh">'+esc(job.vehicle)+'</div>'+
      '<div class="at-title">'+(esc(job.title)||"Procedimiento")+'</div>'+
      '<div class="at-sum">'+sum+'</div></div>';
    if ((f.alerts||[]).length) h += sec("Antes de empezar", f.alerts.map(function(a){
      const lvl = a.level==="stop"?"stop":a.level==="tsb"?"tsb":"warn"; const tag = lvl==="stop"?"ALTO":lvl==="tsb"?"TSB":"AVISO";
      return '<div class="at-alert '+lvl+'"><span class="at-atag">'+tag+'</span><div><b>'+esc(a.title)+'</b>'+esc(a.detail)+' '+badge(a.source)+'</div></div>';
    }).join(""));
    if ((f.tsbs||[]).length) h += sec("TSB a revisar", f.tsbs.map(function(t){ return '<div class="at-li">'+esc(t.text)+' '+badge(t.source)+'</div>'; }).join(""));
    if ((f.probableCauses||[]).length) h += sec("Causas probables", f.probableCauses.map(function(c){ return '<div class="at-li">'+esc(c.text)+' '+badge(c.source)+'</div>'; }).join(""));
    if ((f.topFixes||[]).length) h += sec("Arreglos más reportados", '<table>'+f.topFixes.map(function(x){ return '<tr><td class="at-rank">'+(esc(x.rank)||"•")+'</td><td><b>'+esc(x.name)+'</b>'+(x.note?'<div class="at-dep">'+esc(x.note)+'</div>':"")+'</td><td>'+badge(x.source)+'</td></tr>'; }).join("")+'</table>');
    if ((f.parts||[]).length) h += sec("Partes necesarias", '<table>'+f.parts.map(function(p){ return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+(p.dependency?'<span class="at-pill">dependencia</span>':"")+esc(p.reason)+' '+badge(p.source)+'</td></tr>'; }).join("")+'</table>');
    if ((f.fluids||[]).length) h += sec("Fluidos", '<table><thead><tr><th>Fluido</th><th>Espec.</th><th>Cant.</th><th></th></tr></thead>'+f.fluids.map(function(x){ return '<tr><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.spec)+'</td><td>'+esc(x.quantity)+'</td><td>'+badge(x.source)+'</td></tr>'; }).join("")+'</table>');
    if ((f.specs||[]).length) h += sec("Especificaciones de torque", '<table><thead><tr><th>Sujetador</th><th>Torque</th><th></th></tr></thead>'+f.specs.map(function(x){ return '<tr><td>'+esc(x.fastener)+'</td><td><b>'+esc(x.torque)+'</b></td><td>'+badge(x.source)+'</td></tr>'; }).join("")+'</table>');
    if ((f.steps||[]).length) h += sec(dtc?"Pasos de diagnóstico (sugeridos)":"Pasos del procedimiento", '<ol class="at-steps">'+f.steps.map(function(s2){
      let ww=""; if (s2.warning){ const wl=s2.warningLevel==="stop"?"stop":"warn"; ww='<div class="at-stepwarn '+wl+'">⚠ '+esc(s2.warning)+'</div>'; }
      const dep = s2.dependsOn?'<div class="at-dep">↳ '+esc(s2.dependsOn)+'</div>':"";
      return '<li><input type="checkbox" class="at-chk"><div class="at-steptxt">'+esc(s2.text)+' '+badge(s2.source)+'</div>'+ww+dep+'</li>';
    }).join("")+'</ol>');
    h += '<div class="at-foot">Verifica torques y capacidades contra ALLDATA. 🤖 = sugerencia de IA, confírmalo antes de actuar.</div>';
    out.innerHTML = h;
    out.querySelectorAll(".at-chk").forEach(function(c){ c.addEventListener("change", function(){ c.closest("li").classList.toggle("done", c.checked); }); });
  }
})();
