/* ============================================================
   SA Auditor — content.js (runs on Tekmetric)
   - Only shows when there is an active Tekmetric session.
   - Detects the logged-in user, resolves role (admin vs SA).
   - Reads the Supabase views (anon) and shows ROs grouped by
     status: Work In Progress / Completed (mandatory: everything
     must be filled) and Estimates (low priority).
   - Manual identity override as a fallback.
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

  // All audit checks (English labels).
  const ISSUES = [
    { key:"missing_vin",            label:"No VIN",                sev:"high" },
    { key:"missing_miles",          label:"No miles in",           sev:"high" },
    { key:"missing_address",        label:"No customer address",   sev:"high" },
    { key:"auth_job_without_tech",  label:"Authorized · no tech",  sev:"high" },
    { key:"auth_job_without_labor", label:"Authorized · no labor", sev:"high" },
    { key:"part_without_price",     label:"Part · no sale price",  sev:"high" },
    { key:"part_without_cost",      label:"Part · no cost",        sev:"med"  },
    { key:"part_without_qty",       label:"Part · no qty",         sev:"med"  },
    { key:"no_authorized_jobs",     label:"No authorized jobs",    sev:"low"  },
  ];
  const SEV = { high:3, med:2, low:1 };

  // Mandatory checks for Work In Progress + Completed (everything must be filled).
  // "no_authorized_jobs" is an estimate-only soft signal, so it's not mandatory here.
  const MANDATORY_KEYS = ["missing_vin","missing_miles","missing_address","auth_job_without_tech",
    "auth_job_without_labor","part_without_price","part_without_cost","part_without_qty"];
  // RO-level issues (shown as chips on the RO). Job-level issues (tech/labor/parts)
  // are shown per job via problem_jobs, with the job title.
  const RO_LEVEL_KEYS = ["missing_vin","missing_miles","missing_address","no_authorized_jobs"];

  // Status buckets (the 3 Tekmetric board columns).
  const BUCKETS = [
    { key:"wip",  label:"Work In Progress", status:"REPAIR_IN_PROGRESS", mandatory:true,  of:"wip_ros"  },
    { key:"done", label:"Completed",        status:"COMPLETE",           mandatory:true,  of:"done_ros" },
    { key:"est",  label:"Estimates",        status:"ESTIMATE",           mandatory:false, of:"est_ros"  },
  ];
  function bucketOf(r){ const b=BUCKETS.find(x=>x.status===r.status); return b?b.key:null; }
  function bucketDef(k){ return BUCKETS.find(x=>x.key===k); }

  let CFG = { adminNames: DEFAULT_ADMINS, identityOverride: "" };
  let ROLL = [], RO = [], TECH = [], myName = "", myRole = "unknown";
  let openSA = null, openTech = null;
  const F = { view:"audit", bucket:"wip", q:"", issue:null };   // UI / filter state

  /* ---------- Panel ---------- */
  const w = document.createElement("div");
  w.id = "sa-widget";
  w.innerHTML = `
    <div class="sa-head" id="sa-head">
      <span class="sa-logo">✓</span>
      <span class="sa-ttl">SA Auditor</span>
      <span class="sa-dot" id="sa-dot"></span>
      <span class="sa-sp"></span>
      <button class="sa-icon" id="sa-refresh" title="Refresh">⟳</button>
      <button class="sa-icon" id="sa-collapse" title="Collapse">▾</button>
      <button class="sa-icon" id="sa-close" title="Close">✕</button>
    </div>
    <div class="sa-idbar" id="sa-idbar"></div>
    <div class="sa-body" id="sa-body"><div class="sa-msg"><span class="sa-spin"></span> Loading…</div></div>
    <div class="sa-resize" id="sa-resize"></div>`;
  document.body.appendChild(w);
  w.style.display = "none";                       // hidden until a session is confirmed
  const $ = (id) => document.getElementById(id);
  const body = $("sa-body");

  /* ---------- persistent position ---------- */
  let ui = (()=>{ try{return JSON.parse(localStorage.getItem(UIKEY))||{}}catch(e){return{}} })();
  let width = ui.width||384, height = ui.height||580;
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
    function mm(ev){ width=Math.max(330,Math.min(window.innerWidth-left-4,sw+(ev.clientX-sx))); height=Math.max(240,Math.min(window.innerHeight-top-4,sh+(ev.clientY-sy))); w.style.width=width+"px"; w.style.height=height+"px"; }
    function mu(){ document.removeEventListener("mousemove",mm); document.removeEventListener("mouseup",mu); ov.remove(); persist(); }
    document.addEventListener("mousemove",mm); document.addEventListener("mouseup",mu); });
  $("sa-collapse").addEventListener("click",()=>{ w.classList.toggle("sa-collapsed"); $("sa-collapse").textContent=w.classList.contains("sa-collapsed")?"▴":"▾"; persist(); });

  /* ---------- show/hide depending on session ---------- */
  let launcher=null, userClosed=false, loadedOnce=false;
  function ensureLauncher(){
    if(!launcher){
      launcher=document.createElement("button"); launcher.id="sa-launcher"; launcher.textContent="🧾"; launcher.title="Open SA Auditor";
      launcher.addEventListener("click",()=>{ userClosed=false; gate(); });
      document.body.appendChild(launcher);
    }
  }
  $("sa-close").addEventListener("click",()=>{ userClosed=true; ensureLauncher(); gate(); });
  $("sa-refresh").addEventListener("click",()=>{ const b=$("sa-refresh"); b.classList.add("spin"); loadedOnce=true; load(()=>b.classList.remove("spin")); });

  // Is the current page a login / no-session page?
  function isLoggedOut(){
    const p = location.pathname.toLowerCase();
    if (/(^|\/)(login|sign-?in|sso|forgot|reset|logout|auth)(\/|$)/.test(p)) return true;
    const pw = document.querySelector('input[type="password"]');
    if (pw && pw.offsetParent !== null) return true;   // visible password field
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
  function ageDays(iso){ if(!iso)return null; return Math.floor((Date.now()-new Date(iso).getTime())/86400000); }
  function norm(s){ return (s||"").toString().trim().toLowerCase(); }
  function firstTok(s){ return norm(s).split(/\s+/)[0]||""; }
  function animateCount(el,to){ const dur=520,t0=performance.now();
    function fr(t){ const k=Math.min(1,(t-t0)/dur); el.textContent=Math.round(to*(1-Math.pow(1-k,3))); if(k<1)requestAnimationFrame(fr); }
    requestAnimationFrame(fr); }

  // Does this RO still need work given its bucket's rules?
  function incomplete(r){
    const b = bucketDef(bucketOf(r)); if(!b) return false;
    return b.mandatory ? MANDATORY_KEYS.some(k=>r[k]===true) : r._issues.length>0;
  }
  function sevClass(r){
    const b = bucketDef(bucketOf(r));
    if (b && !b.mandatory) return "est"; // estimates are de-emphasized
    const s = r._issues.filter(i=>MANDATORY_KEYS.includes(i.key)).reduce((m,i)=>Math.max(m,SEV[i.sev]),0);
    return s===3?"high":s===2?"med":s===1?"low":"ok";
  }

  async function api(view, qs){
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${view}?${qs}`, { headers:{ apikey:SUPABASE_KEY, Authorization:"Bearer "+SUPABASE_KEY }});
    if(!r.ok) throw new Error("HTTP "+r.status+" — "+(await r.text()).slice(0,160));
    return r.json();
  }

  /* ---------- detect user / current RO ---------- */
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

  /* ---------- resolve role ---------- */
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

  /* ---------- load ---------- */
  async function load(done){
    $("sa-dot").className="sa-dot";
    body.innerHTML = '<div class="sa-msg"><span class="sa-spin"></span> Loading…</div>';
    chrome.storage.local.get(["saConfig"], async (d)=>{
      const c = d.saConfig||{};
      CFG.adminNames = (c.adminNames&&c.adminNames.length)?c.adminNames:DEFAULT_ADMINS;
      CFG.identityOverride = c.identityOverride||"";
      CFG.userSelector = c.userSelector||"";
      try{
        [ROLL, RO, TECH] = await Promise.all([ api("sa_rollup","select=*"), api("ro_audit","select=*"), api("tech_board","select=*") ]);
        RO.forEach(r=>{ r._issues=issuesOf(r); r._age=ageDays(r.ro_created_at); });
        resolveRole();
        renderIdentity(); render();
        $("sa-dot").className="sa-dot ok";
      }catch(e){
        $("sa-dot").className="sa-dot err";
        body.innerHTML='<div class="sa-msg">Could not load.<br><b>'+esc(e.message)+'</b><br><br>If it says "permission denied", let Osman know.</div>';
      }finally{ if(done) done(); }
    });
  }

  function renderIdentity(){
    const roleLabel = myRole==="admin"?"Admin":myRole==="sa"?"Service Advisor":"Not identified";
    $("sa-idbar").innerHTML = `<span class="sa-role ${myRole}">${roleLabel}</span> <b>${esc(myName||"—")}</b> <a href="#" id="sa-change">change</a>`;
    $("sa-change").addEventListener("click",(e)=>{ e.preventDefault(); pickIdentity(); });
  }

  function pickIdentity(){
    const names = [...new Set(ROLL.map(s=>s.service_advisor))].sort();
    body.innerHTML = `<div class="sa-sec"><div class="sa-sec-h">Who are you?</div>
      <button class="sa-btn sa-full" data-id="__ADMIN__">👑 Admin (see everything)</button>
      <div class="sa-pick">${names.map(n=>`<button class="sa-btn sa-sec-btn sa-full" data-id="${esc(n)}">${esc(n)}</button>`).join("")}</div>
      <div class="sa-note">Remembered in this Chrome. You can change it later with "change".</div></div>`;
    body.querySelectorAll("button[data-id]").forEach(b=>b.addEventListener("click",()=>{
      const id=b.dataset.id;
      chrome.storage.local.get(["saConfig"],(d)=>{ const c=d.saConfig||{}; c.identityOverride=id; chrome.storage.local.set({saConfig:c},()=>{
        CFG.identityOverride=id; resolveRole(); renderIdentity(); render(); }); });
    }));
  }

  function render(){
    if (myRole==="unknown"){ pickIdentity(); return; }
    if (F.view==="techs"){ renderTechBoard(); return; }
    if (myRole==="admin") renderAdmin(); else renderSA();
  }

  /* ---------- top nav (Audit / Tech Board) ---------- */
  function topNav(){
    return `<div class="sa-nav">
      <button class="sa-nav-b ${F.view==='audit'?'on':''}" data-v="audit">📋 Audit</button>
      <button class="sa-nav-b ${F.view==='techs'?'on':''}" data-v="techs">🔧 Tech Board</button>
    </div>`;
  }
  function wireNav(){ body.querySelectorAll(".sa-nav-b").forEach(b=>b.addEventListener("click",()=>{ F.view=b.dataset.v; render(); })); }

  /* ---------- shared pieces ---------- */
  function matchSearchIssue(r){
    if (F.issue && r[F.issue]!==true) return false;
    if (F.q){ const q=norm(F.q); if(!(String(r.ro_number).includes(q) || norm(r.vehicle).includes(q))) return false; }
    return true;
  }
  // Incomplete ROs for an owner in the active bucket (after search + issue filter).
  function listFor(pred){
    return RO.filter(r=> pred(r) && bucketOf(r)===F.bucket && incomplete(r) && matchSearchIssue(r))
             .sort((a,b)=>worst(b)-worst(a));
  }
  // Count of incomplete ROs per bucket for an owner (ignores search/issue filter).
  function bucketCounts(pred){
    const c={wip:0,done:0,est:0};
    RO.forEach(r=>{ if(!pred(r))return; const bk=bucketOf(r); if(bk && incomplete(r)) c[bk]++; });
    return c;
  }

  function tabs(counts){
    return `<div class="sa-tabs">${BUCKETS.map(b=>`
      <button class="sa-tab ${F.bucket===b.key?'on':''} ${b.mandatory?'':'soft'}" data-b="${b.key}" title="${b.mandatory?'Mandatory — must be fully filled':'Low priority'}">
        <span>${b.label}</span><span class="sa-tab-n ${counts[b.key]?'':'zero'}">${counts[b.key]}</span>
      </button>`).join("")}</div>`;
  }
  function wireTabs(refresh){
    body.querySelectorAll(".sa-tab").forEach(b=>b.addEventListener("click",()=>{
      F.bucket=b.dataset.b;
      body.querySelectorAll(".sa-tab").forEach(x=>x.classList.toggle("on",x.dataset.b===F.bucket));
      refresh();
    }));
  }
  function toolbar(){
    return `<div class="sa-toolbar">
      <div class="sa-search"><span class="sa-search-ic">🔎</span><input id="sa-q" placeholder="Search RO or vehicle…" value="${esc(F.q)}"></div>
      <div class="sa-filters">
        <button class="sa-fchip ${F.issue===null?'on':''}" data-f="">All</button>
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
  function fmtEta(iso){ const d=new Date(iso); if(isNaN(d.getTime())) return null;
    return d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
  function etaHtml(r){ if(!r.eta) return ""; const txt=fmtEta(r.eta); if(!txt) return "";
    const over = new Date(r.eta).getTime() < Date.now() && r.status!=="COMPLETE";
    return `<span class="sa-chip ${over?'high':'low'}">${over?'⏰ Overdue · ':'📅 '}${esc(txt)}</span>`; }
  function statusTag(r){ const b=bucketDef(bucketOf(r)); return b?`<span class="sa-stag ${b.key}">${b.label}</span>`:""; }
  function techTag(r){ return r.technician?`<span class="sa-ro-tech">🔧 ${esc(r.technician)}</span>`:""; }

  function roCard(r, hl){
    const age = r._age==null?"—":(r._age===0?"today":r._age+" d");
    // RO-level chips (VIN / miles / address / no authorized jobs)
    const roChips = r._issues.filter(i=>RO_LEVEL_KEYS.includes(i.key))
      .map(i=>`<span class="sa-chip ${i.sev}">${i.label}</span>`).join("");
    // Per-job breakdown (title + what's missing), from problem_jobs
    const jobs = Array.isArray(r.problem_jobs) ? r.problem_jobs : [];
    const jobHtml = jobs.length ? `<div class="sa-jobs">${jobs.map(j=>
      `<div class="sa-job"><div class="sa-job-t">🔧 ${esc(j.title||"(untitled job)")}</div>
        <div class="sa-job-iss">${(j.issues||[]).map(t=>`<span class="sa-chip jb">${esc(t)}</span>`).join("")}</div></div>`).join("")}</div>` : "";
    const head = `${r.customer_waiting?'<span class="sa-chip high">🪑 Waiter</span>':''}${etaHtml(r)}${roChips}`;
    const complete = !head && !jobHtml;
    return `<div class="sa-ro ${sevClass(r)} ${hl?'hl':''}">
      <span class="sa-ro-bar"></span>
      <div class="sa-ro-main">
        <div class="sa-ro-top">
          <a class="sa-ro-link" href="${roUrl(r)}" target="_blank" rel="noopener">#${esc(r.ro_number)}</a>
          <span class="sa-ro-veh">${esc(r.vehicle||"")}</span>
          ${techTag(r)}
          <span class="sa-ro-age">${age}</span>
        </div>
        ${head||complete ? `<div class="sa-chips">${head}${complete?'<span class="sa-chip ok">✓ Complete</span>':''}</div>` : ""}
        ${jobHtml}
      </div></div>`;
  }
  function kpis(items){
    return `<div class="sa-kpis">${items.map(([n,l,c])=>`<div class="sa-kpi ${c||''}"><div class="n" data-to="${n}">0</div><div class="l">${l}</div></div>`).join("")}</div>`;
  }
  function animateKpis(){ body.querySelectorAll(".sa-kpi .n").forEach(el=>animateCount(el, +el.dataset.to)); }
  function emptyState(){
    const b=bucketDef(F.bucket);
    const msg = b && b.mandatory ? "Nothing pending here — all ROs in this column are complete." : "No estimates flagged with this filter.";
    return `<div class="sa-empty"><div class="sa-empty-ic">🎉</div><div class="sa-empty-ttl">All clear</div><div class="sa-empty-sub">${msg}</div></div>`;
  }
  function emptyMini(){ return `<div class="sa-empty mini">Nothing here 🎉</div>`; }
  function foot(t){ return `<div class="sa-foot">${esc(t)}</div>`; }

  /* ---------- SA view ---------- */
  function renderSA(){
    const me = r=> norm(r.service_advisor)===norm(myName);
    const counts = bucketCounts(me);
    const need = counts.wip + counts.done;
    const cur = currentRO();
    const curRow = cur ? RO.find(r=> String(r.ro_number)===String(cur)) : null;
    let h = topNav();
    if (curRow){ h += `<div class="sa-sec"><div class="sa-sec-h">📍 Open now</div>${roCard(curRow,true)}</div>`; }
    h += `<div class="sa-headline ${need?'warn':'ok'}">
      <div class="sa-headline-main">${need? `⚠️ ${need} RO${need>1?'s':''} need attention` : "✅ All caught up on active work"}</div>
      <div class="sa-headline-sub">Work In Progress + Completed must have everything filled</div></div>`;
    h += tabs(counts);
    h += toolbar();
    h += `<div id="sa-list" class="sa-list"></div>`;
    h += foot("Read-only from Tekmetric. Fix in Tekmetric, then refresh ⟳.");
    body.innerHTML = h;
    wireNav();
    fillSAList(me);
    wireTabs(()=>fillSAList(me));
    wireToolbar(()=>fillSAList(me));
  }
  function fillSAList(me){
    const cur = currentRO();
    const list = listFor(me);
    $("sa-list").innerHTML = list.length
      ? list.map(r=>roCard(r, cur && String(r.ro_number)===String(cur))).join("")
      : emptyState();
  }

  /* ---------- Admin view ---------- */
  function renderAdmin(){
    const counts = bucketCounts(()=>true);
    const need = counts.wip + counts.done;
    let h = topNav();
    h += kpis([[need,"Need attention","alert"],[ROLL.length,"SAs",""],[RO.length,"Active ROs",""]]);
    h += tabs(counts);
    h += toolbar();
    h += `<div class="sa-sec-h">By Service Advisor</div><div id="sa-list" class="sa-acc"></div>`;
    h += foot("WIP + Completed are mandatory · Estimates are low priority. Click a SA to expand.");
    body.innerHTML = h;
    wireNav();
    animateKpis();
    fillAdminList();
    wireTabs(fillAdminList);
    wireToolbar(fillAdminList);
  }
  function fillAdminList(){
    const b = bucketDef(F.bucket);
    const rows = ROLL.map(s=>{
      const pred = r=> norm(r.service_advisor)===norm(s.service_advisor);
      return { s, list: listFor(pred), denom: s[b.of]||0 };
    }).sort((a,b)=> b.list.length-a.list.length || b.denom-a.denom);
    $("sa-list").innerHTML = rows.map(({s,list,denom})=>{
      const open = openSA===s.service_advisor;
      const ratio = denom ? Math.round(100*list.length/denom) : 0;
      return `<div class="sa-acc-item ${open?'open':''}" data-sa="${esc(s.service_advisor)}">
        <button class="sa-acc-head">
          <span class="sa-acc-name">${esc(s.service_advisor)}</span>
          <span class="sa-acc-bar"><i style="width:${ratio}%"></i></span>
          <span class="sa-acc-badge ${list.length?'':'zero'}">${list.length}</span>
          <span class="sa-acc-of">/${denom}</span>
          <span class="sa-acc-caret">▾</span>
        </button>
        <div class="sa-acc-panel">${list.map(r=>roCard(r,false)).join("")||emptyMini()}</div>
      </div>`;
    }).join("");
    $("sa-list").querySelectorAll(".sa-acc-head").forEach(b=>b.addEventListener("click",()=>{
      const sa=b.parentElement.dataset.sa; openSA = (openSA===sa)?null:sa; fillAdminList();
    }));
  }

  /* ---------- Tech Board view ---------- */
  function roTechCard(r){
    const wait = r.customer_waiting ? '<span class="sa-chip high">🪑 Waiter</span>'
               : (r.waiting_on_customer ? '<span class="sa-chip med">⏳ Waiting on customer</span>' : "");
    const lbl = r.ro_label ? `<span class="sa-chip low">${esc(r.ro_label)}</span>` : "";
    return `<div class="sa-ro ${sevClass(r)}"><span class="sa-ro-bar"></span><div class="sa-ro-main">
      <div class="sa-ro-top"><a class="sa-ro-link" href="${roUrl(r)}" target="_blank" rel="noopener">#${esc(r.ro_number)}</a>
        <span class="sa-ro-veh">${esc(r.vehicle||"")}</span>${statusTag(r)}</div>
      <div class="sa-chips">${etaHtml(r)}${wait}${lbl}</div></div></div>`;
  }
  function renderTechBoard(){
    const waitingCust = RO.filter(r=> r.status==="REPAIR_IN_PROGRESS" && r.waiting_on_customer).length;
    const waiters = RO.filter(r=> r.customer_waiting).length;
    const openHrs = TECH.reduce((s,t)=>s+(+t.incomplete_hrs||0),0);
    let h = topNav();
    h += kpis([[waitingCust,"Waiting on customer","alert"],[TECH.length,"Techs working",""],[Math.round(openHrs),"Open hours",""]]);
    if (waiters>0) h += `<div class="sa-note" style="margin:-4px 0 12px">🪑 ${waiters} waiter(s) detected from appointments.</div>`;
    h += `<div class="sa-sec-h">Capacity — most available first</div><div id="sa-list" class="sa-acc"></div>`;
    h += foot("Hours from authorized jobs (WIP + Completed). Delivery date & waiter come from Tekmetric appointments when synced.");
    body.innerHTML = h;
    wireNav();
    animateKpis();
    fillTechs();
  }
  function fillTechs(){
    const el = $("sa-list");
    if (!TECH.length){ el.innerHTML = `<div class="sa-empty"><div class="sa-empty-ic">🔧</div><div class="sa-empty-ttl">No technician data</div><div class="sa-empty-sub">No authorized jobs assigned to technicians in active ROs.</div></div>`; return; }
    const list = [...TECH].sort((a,b)=>(+a.incomplete_hrs||0)-(+b.incomplete_hrs||0));
    const maxInc = Math.max(1, ...list.map(t=>+t.incomplete_hrs||0));
    el.innerHTML = list.map(t=>{
      const inc=+t.incomplete_hrs||0, asg=+t.assigned_hrs||0, done=+t.complete_hrs||0;
      const cap = inc<=4?"room":inc>=16?"load":"mod";
      const capTxt = cap==="room"?"Has room":cap==="load"?"Loaded":"Moderate";
      const open = openTech===t.technician;
      const ros = RO.filter(r=> norm(r.technician)===norm(t.technician) && (r.status==="REPAIR_IN_PROGRESS"||r.status==="COMPLETE")).sort((a,b)=>worst(b)-worst(a));
      const ratio = Math.round(100*inc/maxInc);
      return `<div class="sa-acc-item tech ${open?'open':''}" data-t="${esc(t.technician)}">
        <button class="sa-acc-head">
          <span class="sa-acc-name">${esc(t.technician)}</span>
          <span class="sa-cap ${cap}">${capTxt}</span>
          <span class="sa-acc-bar load"><i style="width:${ratio}%"></i></span>
          <span class="sa-th"><b>${inc.toFixed(1)}</b>h left</span>
          <span class="sa-acc-caret">▾</span>
        </button>
        <div class="sa-acc-panel">
          <div class="sa-techmeta">${t.ros} RO${t.ros!=1?'s':''} · ${asg.toFixed(1)}h assigned · ${done.toFixed(1)}h done · <b>${inc.toFixed(1)}h left</b></div>
          ${ros.map(roTechCard).join("")||emptyMini()}
        </div></div>`;
    }).join("");
    el.querySelectorAll(".sa-acc-head").forEach(b=>b.addEventListener("click",()=>{
      const t=b.parentElement.dataset.t; openTech=(openTech===t)?null:t; fillTechs();
    }));
  }

  /* ---------- startup: watch session (Tekmetric is a SPA) ---------- */
  const mo = new MutationObserver(()=>{ clearTimeout(mo._t); mo._t=setTimeout(gate,300); });
  mo.observe(document.documentElement, { subtree:true, childList:true });
  setInterval(gate, 2500);
  gate();
})();
