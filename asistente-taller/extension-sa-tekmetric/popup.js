/* popup.js — resumen rápido y exportación desde el ícono de la extensión */
const K_LOG = "tk_log";
const K_ID = "tk_identity";

function fmtTs(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return String(ts); } }

chrome.storage.local.get([K_LOG, K_ID], (d) => {
  const log = Array.isArray(d[K_LOG]) ? d[K_LOG] : [];
  const id = d[K_ID];
  document.getElementById("who").textContent = id && id.name ? ("SA: " + id.name) : "SA sin identificar (ábrelo dentro de Tekmetric)";

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = log.filter((e) => e.ts >= startOfDay.getTime());
  document.getElementById("today").textContent = today.length;
  document.getElementById("unique").textContent = new Set(today.map((e) => e.roId)).size;
  document.getElementById("total").textContent = log.length;
});

document.getElementById("export").addEventListener("click", () => {
  chrome.storage.local.get(K_LOG, (d) => {
    const log = Array.isArray(d[K_LOG]) ? d[K_LOG] : [];
    if (!log.length) { alert("No hay registros para exportar."); return; }
    const head = ["fecha_hora", "SA", "RO", "RO_id", "creado_en", "url"];
    const lines = [head.join(",")];
    log.forEach((e) => {
      const row = [fmtTs(e.ts), e.sa, e.roNumber || "", e.roId || "", e.createdAt || "", e.url || ""]
        .map((v) => '"' + String(v).replace(/"/g, '""') + '"');
      lines.push(row.join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "registro-ros-tekmetric-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  });
});
