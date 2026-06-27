/* ============================================================
   SA Auditor — content.js (corre en Tekmetric)
   - Detecta el usuario logueado, resuelve rol (admin vs SA).
   - Lee las vistas de Supabase (anon) y muestra:
       · Admin: tablero de todos los SA + ROs incompletos.
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

  /* ---------- Panel ---------- */
  const w = document.createElement("div");
  w.id = "sa-widget";
  w.innerHTML = `
    <div class="sa-head" id="sa-head">
      <span class="sa-dot" id="sa-dot"></span>
      <span class="sa-ttl">SA Auditor</span>
      <span class="sa-sp"></span>
      <button class="sa-icon" id="sa-collapse" title="Plegar">▾</button>
      <button class="sa-icon" id="sa-close" title="Cerrar">✕</button>
    </div>
    <div class="sa-idbar" id="sa-idbar"></div>
    <div class="sa-body" id="sa-body"><div class="sa-msg"><span class="sa-spin"></span> Cargando…</div></div>
    <div class="sa-resize" id="sa-resize"></div>`;
  document.body.appendChild(w);
  const $ = (id) => document.getElementById(id);
  const body = $("sa-body");

  /* ---------- posición persistente ---------- */
  let ui = (()=>{ try{return JSON.parse(localStorage.getItem(UIKEY))||{}}catch(e){return{}} })();
  let width = ui.width||360, height = ui.height||520;
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
    function mm(ev){ width=Math.max(300,Math.min(window.innerWidth-left-4,sw+(ev.clientX-sx))); height=Math.max(200,Math.min(window.innerHeight-top-4,sh+(ev.clientY-sy))); w.style.width=width+"px"; w.style.height=height+"px"; }
    function mu(){ document.removeEventListener("mousemove",mm); document.removeEventListener("mouseup",mu); ov.remove(); persist(); }
    document.addEventListener("mousemove",mm); document.addEventListener("mouseup",mu); });
  $("sa-collapse").addEventListener("click",()=>{ w.classList.toggle("sa-collapsed"); $("sa-collapse").textContent=w.classList.contains("sa-collapsed")?"▴":"▾"; persist(); });
  let launcher=null;
  $("sa-close").addEventListener("click",()=>{ w.style.display="none";
    if(!launcher){ launcher=document.createElement("button"); launcher.id="sa-launcher"; launcher.textContent="🧾"; launcher.title="Abrir SA Auditor";
      launcher.addEventListener("click",()=>{ w.style.display=""; launcher.style.display="none"; }); document.body.appendChild(launcher); }
    launcher.style.display="flex"; });

  /* ---------- util ---------- */
  function esc(s){ return (s==null?"":String(s)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
  function issuesOf(r){ return ISSUES.filter(i=>r[i.key]===true); }
  function worst(r){ return issuesOf(r).reduce((m,i)=>Math.max(m,SEV[i.sev]),0)*100 + issuesOf(r).length; }
  function ageDays(iso){ if(!iso)return null; return Math.floor((Date.now()-new Date(iso).getTime())/86400000); }
  function norm(s){ return (s||"").toString().trim().toLowerCase(); }
  function firstTok(s){ return norm(s).split(/\s+/)[0]||""; }

  async function api(view, qs){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${view}?${qs}`, { headers:{ apikey:SUPABASE_KEY, Authorization:"Bearer "+SUPABASE_KEY }});
    if(!r.ok) throw new Error("HTTP "+r.status+" — "+(await r.text()).slice(0,160));
    return r.json();
  }

  /* ---------- detectar usuario logueado en Tekmetric (best-effort) ---------- */
  function detectUser(){
    // 1) selector configurable
    if (CFG.userSelector){ const el=document.querySelector(CFG.userSelector); if(el && el.textContent.trim()) return el.textContent.trim(); }
    // 2) selectores comunes
    const sels = ["[data-testid*='user']","[class*='userName']","[class*='UserName']","[class*='userMenu']","[class*='UserMenu']","[aria-label*='account']","[class*='avatar']"];
    for (const s of sels){ const el=document.querySelector(s); const t=el&&(el.getAttribute('aria-label')||el.textContent||"").trim(); if(t && t.length>1 && t.length<40) return t; }
    return "";
  }

  /* ---------- detectar RO actual desde la página ---------- */
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
    // ¿coincide con un SA?
    const match = ROLL.find(s => norm(s.service_advisor)===norm(name) || firstTok(s.service_advisor)===firstTok(name));
    if (match){ myName = match.service_advisor; myRole="sa"; return; }
    myRole = "unknown";
  }

  /* ---------- carga ---------- */
  async function load(){
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
      }
    });
  }

  function renderIdentity(){
    const roleLabel = myRole==="admin"?"Admin":myRole==="sa"?"Service Advisor":"sin identificar";
    $("sa-idbar").innerHTML = `Eres: <b>${esc(myName||"—")}</b> · ${roleLabel} <a href="#" id="sa-change">cambiar</a>`;
    $("sa-change").addEventListener("click",(e)=>{ e.preventDefault(); pickIdentity(); });
  }

  function pickIdentity(){
    const names = [...new Set(ROLL.map(s=>s.service_advisor))].sort();
    body.innerHTML = `<div class="sa-sec"><h3>¿Quién eres?</h3>
      <button class="sa-btn sa-full" data-id="__ADMIN__">Admin (ver todo)</button>
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

  function roCard(r, highlight){
    const chips = r._issues.length ? r._issues.map(i=>`<span class="sa-chip ${i.sev}">${i.label}</span>`).join("") : '<span class="sa-chip ok">✓ Completo</span>';
    const age = r._age==null?"—":(r._age===0?"hoy":r._age+" d");
    return `<div class="sa-ro ${highlight?'hl':''}">
      <div class="sa-ro-top"><a class="sa-ro-link" href="${roUrl(r)}" target="_blank" rel="noopener">#${esc(r.ro_number)}</a><span class="sa-ro-veh">${esc(r.vehicle||"")}</span><span class="sa-ro-age">${age}</span></div>
      <div class="sa-chips">${chips}</div></div>`;
  }

  function renderSA(){
    const cur = currentRO();
    let mine = RO.filter(r=> norm(r.service_advisor)===norm(myName) && r._issues.length);
    mine.sort((a,b)=> worst(b)-worst(a));
    const curRow = cur ? RO.find(r=> String(r.ro_number)===String(cur)) : null;
    let h = "";
    if (curRow){
      h += `<div class="sa-sec"><h3>RO abierto ahora</h3>${roCard(curRow,true)}</div>`;
    }
    h += `<div class="sa-sec"><h3>Tus ROs por completar (${mine.length})</h3>`;
    if (!mine.length) h += '<div class="sa-msg">🎉 ¡Sin pendientes! Todos tus ROs activos están completos.</div>';
    else h += mine.map(r=>roCard(r, curRow && String(r.ro_number)===String(cur))).join("");
    h += `</div><div class="sa-foot">Datos de Tekmetric (solo lectura). Corrige en Tekmetric y refresca.</div>`;
    body.innerHTML = h;
  }

  function renderAdmin(){
    const active = RO.length, withIss = RO.filter(r=>r._issues.length).length;
    let h = `<div class="sa-kpis">
      <div class="sa-kpi"><div class="n">${active}</div><div class="l">ROs activos</div></div>
      <div class="sa-kpi alert"><div class="n">${withIss}</div><div class="l">con problemas</div></div>
      <div class="sa-kpi"><div class="n">${ROLL.length}</div><div class="l">SAs</div></div></div>`;
    const rows = [...ROLL].sort((a,b)=>b.ros_with_issues-a.ros_with_issues);
    h += `<div class="sa-sec"><h3>Por Service Advisor</h3>`;
    h += rows.map(s=>`<button class="sa-sa" data-sa="${esc(s.service_advisor)}">
        <span class="nm">${esc(s.service_advisor)}</span>
        <span class="bg ${s.ros_with_issues?'':'zero'}">${s.ros_with_issues}</span>
        <span class="ln">de ${s.active_ros}</span></button>`).join("");
    h += `</div><div id="sa-admin-list"></div><div class="sa-foot">Clic en un SA para ver sus ROs.</div>`;
    body.innerHTML = h;
    body.querySelectorAll(".sa-sa").forEach(b=>b.addEventListener("click",()=>adminListFor(b.dataset.sa)));
  }
  function adminListFor(sa){
    const list = RO.filter(r=> norm(r.service_advisor)===norm(sa) && r._issues.length).sort((a,b)=>worst(b)-worst(a));
    const el = $("sa-admin-list");
    el.innerHTML = `<div class="sa-sec"><h3>${esc(sa)} — ${list.length} por completar</h3>${list.map(r=>roCard(r,false)).join("")||'<div class="sa-msg">Sin pendientes 🎉</div>'}</div>`;
    el.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  load();
})();
