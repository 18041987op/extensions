/* ============================================================
   background.js — Asistente SA · service worker
   Solo se usa para la revisión de gramática de notas (opcional).
   Reutiliza la misma "config" (proveedor/clave/modelo) que el
   Asistente de Taller IA, si existe.
   ============================================================ */

async function callOpenAI(config, system, user, opts = {}) {
  const body = { model: config.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0, max_tokens: 2000 };
  if (opts.json) body.response_format = { type: "json_object" }; // solo cuando pedimos JSON
  const r = await fetch((config.baseUrl || "https://api.openai.com/v1") + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.apiKey }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " — " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
}
async function callAnthropic(config, system, user, opts = {}) {
  const body = { model: config.model, max_tokens: 2000, system, messages: [{ role: "user", content: user }], temperature: 0 };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " — " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return (d.content && d.content[0] && d.content[0].text) || "";
}
function callAI(config, system, user, opts) {
  return config.provider === "anthropic" ? callAnthropic(config, system, user, opts) : callOpenAI(config, system, user, opts);
}
function parseLoose(text) {
  try { return JSON.parse(text); } catch (e) {}
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch (e2) {} }
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TK_OPEN_OPTIONS") { chrome.runtime.openOptionsPage(); return false; }

  if (msg.type === "TK_PING") {
    chrome.storage.local.get("config", async ({ config }) => {
      if (!config || !config.apiKey || !config.model) { sendResponse({ ok: false, error: "Falta configurar la IA." }); return; }
      try { await callAI(config, "Responde solo: ok", "ping"); sendResponse({ ok: true }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    });
    return true;
  }

  if (msg.type === "TK_GRAMMAR") {
    chrome.storage.local.get("config", async ({ config }) => {
      if (!config || !config.apiKey || !config.model) { sendResponse({ ok: false, error: "Falta configurar la IA (Ajustes → Configurar la IA)." }); return; }
      const notes = (msg.notes || []).slice(0, 12);
      if (!notes.length) { sendResponse({ ok: true, items: [] }); return; }
      const system = `Eres un corrector de notas de taller automotriz en inglés (las escriben técnicos, suelen tener errores de ortografía/gramática).
Corrige ortografía y gramática SIN cambiar el significado técnico ni los números/medidas. Mantén el inglés.
Devuelve EXCLUSIVAMENTE un JSON válido: {"items":[{"original": string, "corrected": string, "changed": boolean}]}, en el MISMO orden recibido. "changed" = true solo si corregiste algo.`;
      const user = "Notas:\n" + notes.map((n, i) => (i + 1) + ". " + n).join("\n");
      try {
        const raw = await callAI(config, system, user, { json: true });
        const obj = parseLoose(raw);
        if (!obj || !Array.isArray(obj.items)) { sendResponse({ ok: false, error: "Respuesta no-JSON de la IA." }); return; }
        sendResponse({ ok: true, items: obj.items });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    });
    return true;
  }
});
