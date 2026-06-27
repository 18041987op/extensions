const els = {
  identity: document.getElementById("identity"),
  admins: document.getElementById("admins"),
  selector: document.getElementById("selector"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
};

chrome.storage.local.get(["saConfig"], ({ saConfig }) => {
  const c = saConfig || {};
  els.identity.value = c.identityOverride || "";
  els.admins.value = (c.adminNames && c.adminNames.length ? c.adminNames : ["Osman Perez"]).join(", ");
  els.selector.value = c.userSelector || "";
});

els.save.addEventListener("click", () => {
  const adminNames = els.admins.value.split(",").map(s => s.trim()).filter(Boolean);
  const c = {
    identityOverride: els.identity.value,
    adminNames: adminNames.length ? adminNames : ["Osman Perez"],
    userSelector: els.selector.value.trim(),
  };
  chrome.storage.local.set({ saConfig: c }, () => {
    els.status.textContent = "✓ Guardado. Refresca la pestaña de Tekmetric (F5).";
    els.status.className = "status ok";
  });
});
