chrome.storage.local.get("config", ({ config }) => {
  const state = document.getElementById("state");
  if (config && config.apiKey && config.model) {
    state.textContent = "configurado (" + config.model + ")";
    state.className = "badge ok";
  }
});
document.getElementById("cfg").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
