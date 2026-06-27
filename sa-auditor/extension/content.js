/* ============================================================
   SA Auditor — content.js (corre en Tekmetric)
   - Solo se muestra si hay sesión iniciada en Tekmetric.
   - Detecta el usuario logueado, resuelve rol (admin vs SA).
   - Lee las vistas de Supabase (anon) y muestra:
       · Admin: KPIs + acordeón por SA (con búsqueda y filtros).
       · SA: solo sus ROs por completar + el RO actual resaltado.
   - Override manual de identidad como respaldo.
   ============================================================ */
(() => {
  if (document.getElementById("sa-widget")) return;

  /* ---------- CONFIG ---------- */
  const SUPABASE_URL = "https://kiziudyqjnihywbmgsqn.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtpeml1ZHlxam5paHl3Ym1nc3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDUxNjcsImV4cCI6MjA4OTM4MTE2N30.4kcyhd9_4Pn_MFAJnEZ9E2dwznXCIpGaac_Kb-Yd_vo";
  const DEFAULT_ADMINS = ["Osman Perez"];
  const UIKEY = "sa_ui_v1";
  const TEKMETRIC_RO_URL = "https://shop.tekmetric.com/admin/shop/6769/repair-orders?search={ro_number}";
  function roUrl(r){ return TEKMETRIC_RO_URL.replace("{ro_number}", encodeURIComponent(r.ro_number)).replace("{ro_id}", encodeURIComponent(r.ro_id)); }

  const ISSUES = [
    { key:"missing_vin",            label:"Sin VIN",                sev:"high" },
    { key:"auth_job_without_tech",  label:"Autorizado sin técnico", sev:"high" },
    { key:"auth_job_without_labor", label:"Autorizado sin labor",   sev:"high" },
    { key:"part_without_price",     label:"Parte sin venta",        sev:"high" },
    { key:"part_without_cost",      label:"Parte sin costo",        sev:"med"  },
    { key:"part_without_qty",       label:"Parte sin cantidad",     sev:"med"  },
    { key:"missing_miles",          label:"Sin millas",             sev:"med"  },
    { key:"no_authorized_jobs",     label:"Sin jobs autorizados",   sev:"low"  },
  ];
  const SEV = { high:3, med:2, low:1 };

  let CFG = { adminNames: DEFAULT_ADMINS, identityOverride: "" };
  let ROLL = [], RO = [], myName = "", myRole = "unknown";
  const F = { q:"", issue:null, openSA:null };   // estado de filtros/UI

  /* ---------- Panel ---------- */
  const w = document.createElement("div");
  w.id = "sa-widget";
  w.innerHTML = `
    <div class="sa-head" id="sa-head">
      <span class="sa-logo">✓</span>
      <span class="sa-ttl">SA Auditor</span>
      <span class="sa-dot" id="sa-dot"></span>
      <span class="sa-sp"></span>
      <button class="sa-icon" id="sa-refresh" title="Refrescar">⟳</button>
      <button class="sa-icon" id="sa-collapse" title="Plegar">▾</button>
      <button class="sa-icon" id="sa-close" title="Cerrar">✕</button>
    </div>
    <div class="sa-idbar" id="sa-idbar"></div>
    <div class="sa-body" id="sa-body"><div class="sa-msg"><span class="sa-spin"></span> Cargando…</div></div>
    <div class="sa-resize" id="sa-resize"></div>`;
  document.body.appendChild(w);
  w.style.display = "none";                       // oculto hasta confirmar sesión
  const $ = (id) => document.getElementById(id);
  const body = $("sa-body");

  /* ---------- posición persistente ---------- */
  let ui = (()=>{ try{return JSON.parse(localStorage.getItem(UIKEY))||{}}catch(e){return{}} })();
  let width = ui.width||372, height = ui.height||560;
  w.style.width = width+"px"; w.style.height = height+"px";
  let left = (typeof ui.left==="number")?ui.left:Math.max(8, window.innerWidth-width-16);
  let top  = (typeof ui.top==="number")?ui.top:80;
  applyPos();
  if (ui.collapsed){ w.classList.add("sa-collapsed"); $("sa-collapse").textContent="▴"; }
  function applyPos(){ left=Math.max(0,Math.min(window.innerWidth-60,left)); top=Math.max(0,Math.min(window.innerHeight-30,top));
    w.style.left=left+"px"; w.style.top=top+"px"; w.style.right="auto"; }
  function persist(){ try{ localStorage.setItem(UIKEY, JSON.stringify({left,top,width,height,collapsed:w.classList.contains("sa-collapsed")})) }catch(e){} }
  function overlay(c){ const o=document.createElement("div"); o.style.cssText="position:fixed;inset:0;z-index:2147483646;cursor:"+c; document.body.appendChild(o); return o; }
  $("sa-head").addEventListener("mousedown",(e)=>{ if(e.target.closest("button"))return; e.preventDefault();
    const sx=e.clientX,sy=e.clientY,sl=left,st=top,ov=overlay("move");
    function mm(ev){ left=sl+(ev.clientX-sx); top=st+(ev.clientY-sy); applyPos(); }
    function mu(){ document.removeEventListener("mousemove",mm); document.removeEventListener("mouseup",mu); ov.remove(); persist(); }
    document.addEventListener("mousemove",mm); document.addEventListener("mouseup",mu); });
  $("sa-resize").addEventListener("mousedown",(e)=>{ e.preventDefault(); e.stopPropagation();
    const sx=e.clientX,sy=e.clientY,sw=width,sh=height,ov=overlay("nwse-resize");
    function mm(ev){ width=Math.max(320,Math.min(window.innerWidth-left-4,sw+(ev.clientX-sx))); height=Math.max(220,Math.min(window.innerHeight-top-4,sh+(ev.clientY-sy))); w.style.width=width+"px"; w.style.height=height+"px"; }
    function mu(){ document.removeEventListener("mousemove",mm); document.removeEventListener("mouseup",mu); ov.remove(); persist(); }
    document.addEventListener("mousemove",mm); document.addEventListener("mouseup",mu); });
  $("sa-collapse").addEventListener("click",()=>{ w.classList.toggle("sa-collapsed"); $("sa-collapse").textContent=w.classList.contains("sa-collapsed")?"▴":"▾"; persist(); });

  /* ---------- mostrar/ocultar según sesión ---------- */
  let launcher=null, userClosed=false, loadedOnce=false;
  function ensureLauncher(){
    if(!launcher){
      launcher=document.createElement("button"); launcher.id="sa-launcher"; launcher.textContent="🧾"; launcher.title="Abrir SA Auditor";
      launcher.addEventListener("click",()=>{ userClosed=false; gate(); });
      document.body.appendChild(launcher);
    }
  }
  $("sa-close").addEventListener("click",()=>{ userClosed=true; ensureLauncher(); gate(); });
  $("sa-refresh").addEventListener("click",()=>{ const b=$("sa-refresh"); b.classList.add("spin"); loadedOnce=true; load(()=>b.classList.remove("spin")); });

  // ¿La página actual es de login / sin sesión?
  function isLoggedOut(){
    const p = location.pathname.toLowerCase();
    if (/(^|\/)(login|sign-?in|sso|forgot|reset|logout|auth)(\/|$)/.test(p)) return true;
    const pw = document.querySelector('input[type="password"]');
    if (pw && pw.offsetParent !== null) return true;   // campo de contraseña visible
    return false;
  }

  function gate(){
    if (isLoggedOut()){
      w.style.display="none";
      if (launcher) launcher.style.display="none";
      loadedOnce=false;
      return;
    }
    if (userClosed){
      ensureLauncher(); launcher.style.display="flex";
      w.style.display="none";
      return;
    }
    if (launcher) launcher.style.display="none";
    w.style.display="";
    if (!loadedOnce){ loadedOnce=true; load(); }
  }

  /* ---------- util ---------- */
  function esc(s){ return (s==null?"":String(s)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
  function issuesOf(r){ return ISSUES.filter(i=>r[i.key]===true); }
  function worst(r){ return issuesOf(r).reduce((m,i)=>Math.max(m,SEV[i.sev]),0)*100 + issuesOf(r).length; }
  function sevClass(r){ const s=r._issues.reduce((m,i)=>Math.max(m,SEV[i.sev]),0); return s===3?"high":s===2?"med":s===1?"low":"ok"; }
  function ageDays(iso){ if(!iso)return null; return Math.floor((Date.now()-new Date(iso).getTime())/86400000); }
  function norm(s){ return (s||"").toString().trim().toLowerCase(); }
  function firstTok(s){ return norm(s).split(/\s+/)[0]||""; }
  function animateCount(el,to){ const dur=520,t0=performance.now();
    function fr(t){ const k=Math.min(1,(t-t0)/dur); el.textContent=Math.round(to*(1-Math.pow(1-k,3))); if(k<1)requestAnimationFrame(fr); }
    requestAnimationFrame(fr); }

  async function api(view, qs){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${view}?${qs}`, { headers:{ apikey:SUPABASE_KEY, Authorization:"Bearer "+SUPABASE_KEY }});
    if(!r.ok) throw new Error("HTTP "+r.status+" — "+(await r.text()).slice(0,160));
    return r.json();
  }

  /* ---------- detectar usuario / RO actual ---------- */
  function detectUser(){
    if (CFG.userSelector){ const el=document.querySelector(CFG.userSelector); if(el && el.textContent.trim()) return el.textContent.trim(); }
    const sels = ["[data-testid*='user']","[class*='userName']","[class*='UserName']","[class*='userMenu']","[class*='UserMenu']","[aria-label*='account']","[class*='avatar']"];
    for (const s of sels){ const el=document.querySelector(s); const t=el&&(el.getAttribute('aria-label')||el.textContent||"").trim(); if(t && t.length>1 && t.length<40) return t; }
    return "";
  }
  function currentRO(){
    const m1 = location.href.match(/repair-orders?\/(\d{3,})/i); if(m1) return m1[1];
    const txt = (document.body.innerText||"").match(/RO\s*#?\s*(\d{3,})/i); if(txt) return txt[1];
    return null;
  }

  /* ---------- resolver rol ---------- */
  function resolveRole(){
    const adminSet = new Set(CFG.adminNames.map(norm));
    const adminTok = new Set(CFG.adminNames.map(firstTok));
    if (CFG.identityOverride === "__ADMIN__"){ myName="Admin"; myRole="admin"; return; }
    let name = CFG.identityOverride && CFG.identityOverride!=="" ? CFG.identityOverride : detectUser();
    myName = name || "";
    if (!name){ myRole="unknown"; return; }
    if (adminSet.has(norm(name)) || adminTok.has(firstTok(name))){ myRole="admin"; return; }
    const match = ROLL.find(s => norm(s.service_advisor)===norm(name) || firstTok(s.service_advisor)===firstTok(name));
    if (match){ myName = match.service_advisor; myRole="sa"; return; }
    myRole = "unknown";
  }

  /* ---------- carga ---------- */
  async function load(done){
    $("sa-dot").className="sa-dot";
    body.innerHTML = '<div class="sa-msg"><span class="sa-spin"></span> Cargando…</div>';
    chrome.storage.local.get(["saConfig"], async (d)=>{
      const c = d.saConfig||{};
      CFG.adminNames = (c.adminNames&&c.adminNames.length)?c.adminNames:DEFAULT_ADMINS;
      CFG.identityOverride = c.identityOverride||"";
      CFG.userSelector = c.userSelector||"";
      try{
        [ROLL, RO] = await Promise.all([ api("sa_rollup","select=*"), api("ro_audit","select=*") ]);
        RO.forEach(r=>{ r._issues=issuesOf(r); r._age=ageDays(r.ro_created_at); });
        resolveRole();
        renderIdentity(); render();
        $("sa-dot").className="sa-dot ok";
      }catch(e){
        $("sa-dot").className="sa-dot err";
        body.innerHTML='<div class="sa-msg">No se pudo cargar.<br><b>'+esc(e.message)+'</b><br><br>Si dice "permission denied", avísale a Osman.</div>';
      }finally{ if(done) done(); }
    });
  }

  function renderIdentity(){
    const roleLabel = myRole==="admin"?"Admin":myRole==="sa"?"Service Advisor":"sin identificar";
    $("sa-idbar").innerHTML = `<span class="sa-role ${myRole}">${roleLabel}</span> <b>${esc(myName||"—")}</b> <a href="#" id="sa-change">cambiar</a>`;
    $("sa-change").addEventListener("click",(e)=>{ e.preventDefault(); pickIdentity(); });
  }

  function pickIdentity(){
    const names = [...new Set(ROLL.map(s=>s.service_advisor))].sort();
    body.innerHTML = `<div class="sa-sec"><div class="sa-sec-h">¿Quién eres?</div>
      <button class="sa-btn sa-full" data-id="__ADMIN__">👑 Admin (ver todo)</button>
      <div class="sa-pick">${names.map(n=>`<button class="sa-btn sa-sec-btn sa-full" data-id="${esc(n)}">${esc(n)}</button>`).join("")}</div>
      <div class="sa-note">Se recuerda en este Chrome. Puedes cambiarlo después con "cambiar".</div></div>`;
    body.querySelectorAll("button[data-id]").forEach(b=>b.addEventListener("click",()=>{
      const id=b.dataset.id;
      chrome.storage.local.get(["saConfig"],(d)=>{ const c=d.saConfig||{}; c.identityOverride=id; chrome.storage.local.set({saConfig:c},()=>{
        CFG.identityOverride=id; resolveRole(); renderIdentity(); render(); }); });
    }));
  }

  function render(){
    if (myRole==="unknown"){ pickIdentity(); return; }
    if (myRole==="admin") renderAdmin(); else renderSA();
  }

  /* ---------- piezas reutilizables ---------- */
  function hit(r){
    if (!r._issues.length) return false;
    if (F.issue && r[F.issue]!==true) return false;
    if (F.q){ const q=norm(F.q); if(!(String(r.ro_number).includes(q) || norm(r.vehicle).includes(q))) return false; }
    return true;
  }
  function toolbar(){
    return `<div class="sa-toolbar">
      <div class="sa-search"><span class="sa-search-ic">🔎</span><input id="sa-q" placeholder="Buscar RO o vehículo…" value="${esc(F.q)}"></div>
      <div class="sa-filters">
        <button class="sa-fchip ${F.issue===null?'on':''}" data-f="">Todos</button>
        ${ISSUES.map(i=>`<button class="sa-fchip ${i.sev} ${F.issue===i.key?'on':''}" data-f="${i.key}">${i.label}</button>`).join("")}
      </div></div>`;
  }
  function wireToolbar(fill){
    const q=$("sa-q"); if(q) q.addEventListener("input",()=>{ F.q=q.value; fill(); });
    body.querySelectorAll(".sa-fchip").forEach(b=>b.addEventListener("click",()=>{
      F.issue = b.dataset.f || null;
      body.querySelectorAll(".sa-fchip").forEach(x=>{ const on = x.dataset.f? x.dataset.f===F.issue : F.issue===null; x.classList.toggle("on",on); });
      fill();
    }));
  }
  function roCard(r, hl){
    const chips = r._issues.length ? r._issues.map(i=>`<span class="sa-chip ${i.sev}">${i.label}</span>`).join("") : '<span class="sa-chip ok">✓ Completo</span>';
    const age = r._age==null?"—":(r._age===0?"hoy":r._age+" d");
    return `<div class="sa-ro ${sevClass(r)} ${hl?'hl':''}">
      <span class="sa-ro-bar"></span>
      <div class="sa-ro-main">
        <div class="sa-ro-top">
          <a class="sa-ro-link" href="${roUrl(r)}" target="_blank" rel="noopener">#${esc(r.ro_number)}</a>
          <span class="sa-ro-veh">${esc(r.vehicle||"")}</span>
          <span class="sa-ro-age">${age}</span>
        </div>
        <div class="sa-chips">${chips}</div>
      </div></div>`;
  }
  function kpis(items){
    return `<div class="sa-kpis">${items.map(([n,l,c])=>`<div class="sa-kpi ${c||''}"><div class="n" data-to="${n}">0</div><div class="l">${l}</div></div>`).join("")}</div>`;
  }
  function animateKpis(){ body.querySelectorAll(".sa-kpi .n").forEach(el=>animateCount(el, +el.dataset.to)); }
  function emptyState(){ return `<div class="sa-empty"><div class="sa-empty-ic">🎉</div><div class="sa-empty-ttl">¡Sin pendientes!</div><div class="sa-empty-sub">Nada coincide con el filtro actual.</div></div>`; }
  function emptyMini(){ return `<div class="sa-empty mini">Sin ROs que coincidan 🎉</div>`; }
  function foot(t){ return `<div class="sa-foot">${esc(t)}</div>`; }

  /* ---------- vista SA ---------- */
  function renderSA(){
    const cur = currentRO();
    const curRow = cur ? RO.find(r=> String(r.ro_number)===String(cur)) : null;
    let h = "";
    if (curRow){ h += `<div class="sa-sec"><div class="sa-sec-h">📍 RO abierto ahora</div>${roCard(curRow,true)}</div>`; }
    h += `<div class="sa-sec-h">Tus ROs por completar <span class="sa-pill" id="sa-count">0</span></div>`;
    h += toolbar();
    h += `<div id="sa-list" class="sa-list"></div>`;
    h += foot("Datos de Tekmetric (solo lectura). Corrige en Tekmetric y refresca ⟳.");
    body.innerHTML = h;
    fillSAList();
    wireToolbar(fillSAList);
  }
  function fillSAList(){
    const cur = currentRO();
    const mine = RO.filter(r=> norm(r.service_advisor)===norm(myName) && hit(r)).sort((a,b)=>worst(b)-worst(a));
    const cnt = $("sa-count"); if(cnt) cnt.textContent = mine.length;
    $("sa-list").innerHTML = mine.length
      ? mine.map(r=>roCard(r, cur && String(r.ro_number)===String(cur))).join("")
      : emptyState();
  }

  /* ---------- vista Admin ---------- */
  function renderAdmin(){
    const active = RO.length, withIss = RO.filter(r=>r._issues.length).length;
    let h = kpis([[active,"ROs activos",""],[withIss,"con problemas","alert"],[ROLL.length,"SAs",""]]);
    h += toolbar();
    h += `<div class="sa-sec-h">Por Service Advisor</div><div id="sa-list" class="sa-acc"></div>`;
    h += foot("Clic en un SA para ver y filtrar sus ROs.");
    body.innerHTML = h;
    animateKpis();
    fillAdminList();
    wireToolbar(fillAdminList);
  }
  function fillAdminList(){
    const rows = ROLL.map(s=>({
      s,
      list: RO.filter(r=> norm(r.service_advisor)===norm(s.service_advisor) && hit(r)).sort((a,b)=>worst(b)-worst(a))
    })).sort((a,b)=> b.list.length-a.list.length || (b.s.ros_with_issues||0)-(a.s.ros_with_issues||0));
    $("sa-list").innerHTML = rows.map(({s,list})=>{
      const open = F.openSA===s.service_advisor;
      const ratio = s.active_ros ? Math.round(100*list.length/s.active_ros) : 0;
      return `<div class="sa-acc-item ${open?'open':''}" data-sa="${esc(s.service_advisor)}">
        <button class="sa-acc-head">
          <span class="sa-acc-name">${esc(s.service_advisor)}</span>
          <span class="sa-acc-bar"><i style="width:${ratio}%"></i></span>
          <span class="sa-acc-badge ${list.length?'':'zero'}">${list.length}</span>
          <span class="sa-acc-of">/${s.active_ros||0}</span>
          <span class="sa-acc-caret">▾</span>
        </button>
        <div class="sa-acc-panel">${list.map(r=>roCard(r,false)).join("")||emptyMini()}</div>
      </div>`;
    }).join("");
    $("sa-list").querySelectorAll(".sa-acc-head").forEach(b=>b.addEventListener("click",()=>{
      const sa=b.parentElement.dataset.sa; F.openSA = (F.openSA===sa)?null:sa; fillAdminList();
    }));
  }

  /* ---------- arranque: vigilar sesión (Tekmetric es SPA) ---------- */
  const mo = new MutationObserver(()=>{ clearTimeout(mo._t); mo._t=setTimeout(gate,300); });
  mo.observe(document.documentElement, { subtree:true, childList:true });
  setInterval(gate, 2500);
  gate();
})();
