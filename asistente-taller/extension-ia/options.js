/* Configuración: guarda el proveedor de IA y prueba la conexión. */

const els = {
  provider: document.getElementById("provider"),
  baseUrlWrap: document.getElementById("baseUrlWrap"),
  baseUrl: document.getElementById("baseUrl"),
  model: document.getElementById("model"),
  apiKey: document.getElementById("apiKey"),
  lang: document.getElementById("lang"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
};

// Mostrar/ocultar URL base según el proveedor
function syncProviderUI() {
  els.baseUrlWrap.style.display = els.provider.value === "openai" ? "block" : "none";
}
els.provider.addEventListener("change", syncProviderUI);

// Cargar lo guardado
chrome.storage.local.get("config", ({ config }) => {
  if (config) {
    els.provider.value = config.provider || "openai";
    els.baseUrl.value = config.baseUrl || "https://api.openai.com/v1";
    els.model.value = config.model || "gpt-4o-mini";
    els.apiKey.value = config.apiKey || "";
    els.lang.value = config.lang || "español";
  } else {
    els.baseUrl.value = "https://api.openai.com/v1";
    els.model.value = "gpt-4o-mini";
  }
  syncProviderUI();
});

// Guardar + prueba de conexión
els.save.addEventListener("click", async () => {
  const config = {
    provider: els.provider.value,
    baseUrl: els.baseUrl.value.trim().replace(/\/+$/, ""),
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim(),
    lang: els.lang.value.trim() || "español",
  };
  if (!config.model || !config.apiKey) {
    setStatus("Falta el modelo o la API key.", "err");
    return;
  }
  await chrome.storage.local.set({ config });
  setStatus("Guardado. Probando conexión…", "");

  // Prueba rápida pidiendo un "ping" a la IA (vía background)
  chrome.runtime.sendMessage(
    { type: "AT_PING", config },
    (res) => {
      if (chrome.runtime.lastError) {
        setStatus("Guardado, pero no se pudo probar: " + chrome.runtime.lastError.message, "err");
        return;
      }
      if (res && res.ok) setStatus("✓ Conexión exitosa. Listo para generar fichas.", "ok");
      else setStatus("Guardado, pero la prueba falló: " + (res && res.error ? res.error : "desconocido"), "err");
    }
  );
});

function setStatus(msg, cls) {
  els.status.textContent = msg;
  els.status.className = "status " + (cls || "");
}
