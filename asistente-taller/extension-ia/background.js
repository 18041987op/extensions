/* ============================================================
   background.js — service worker. Habla con la IA (OpenAI-compatible / Anthropic).
   La ficha se adapta al tipo de página y ETIQUETA la fuente de cada dato.
   ============================================================ */

function buildSystemPrompt(lang) {
  return `Eres un asistente para técnicos automotrices. Recibirás el TEXTO de una página de ALLDATA.
Puede traer menús, nombres de botones y ruido de interfaz: ignóralo y concéntrate en el contenido técnico.

PASO 1 — Determina "pageType":
- "dtc": página de un código de diagnóstico (trae "Probable Causes", "Common Causes And Fixes", "Reported Causes", "Symptom").
- "procedure": un procedimiento de reparación paso a paso (Removal/Installation, etc.).
- "other": cualquier otra.

PASO 2 — Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto antes ni después), en ${lang}, con esta forma:
{
  "pageType": "dtc"|"procedure"|"other",
  "job": { "title": string, "vehicle": string, "laborTime": string, "difficulty": string },
  "probableCauses": [ { "text": string, "source": "alldata"|"ai" } ],
  "topFixes":       [ { "name": string, "rank": string, "note": string, "source": "alldata"|"ai" } ],
  "tsbs":           [ { "text": string, "source": "alldata"|"ai" } ],
  "alerts":         [ { "level": "tsb"|"warn"|"stop", "title": string, "detail": string, "source": "alldata"|"ai" } ],
  "parts":          [ { "name": string, "reason": string, "dependency": boolean, "source": "alldata"|"ai" } ],
  "fluids":         [ { "name": string, "spec": string, "quantity": string, "source": "alldata"|"ai" } ],
  "specs":          [ { "fastener": string, "torque": string, "source": "alldata"|"ai" } ],
  "steps":          [ { "text": string, "warning": string, "warningLevel": "warn"|"stop", "dependsOn": string, "source": "alldata"|"ai" } ]
}

REGLA DE FUENTE (OBLIGATORIA Y CRÍTICA): cada elemento lleva "source":
- "alldata" SOLO si el dato aparece textualmente en la página.
- "ai" si tú lo infieres, agregas, reordenas o sugieres.
Nunca marques "alldata" algo que no esté en el texto.

SEGÚN EL TIPO:
- Si "dtc":
  • "probableCauses": de la sección "Probable Causes" (source "alldata").
  • "topFixes": de "Common Causes And Fixes"/"Reported Causes". Ordénalas de más a menos probable PARA ESE CÓDIGO; prioriza las relacionadas (sensores, bobinas, bujías, EGR, etc.) y puedes OMITIR las claramente no relacionadas (ej. tornillos de suspensión). Los nombres son source "alldata"; usa "rank" (1,2,3…) y "note" si aporta.
  • "tsbs": solo si aparecen boletines en la página (source "alldata").
  • "steps": una secuencia de diagnóstico sugerida, TODA con source "ai"; si aplica, el primer paso = revisar TSB antes de reemplazar partes.
  • Deja "parts"/"fluids" vacíos salvo que la página los liste.
- Si "procedure":
  • "steps": los pasos del procedimiento (source "alldata"), con sus NOTICE/CAUTION en "warning"+"warningLevel".
  • "parts"/"fluids"/"specs": lo que aparezca (source "alldata"). Las partes DEDUCIDAS por dependencia (para sacar A hay que sacar B → drenar fluido / junta nueva) van con "dependency": true y source "ai", explicando en "reason".
- Nunca inventes torques, capacidades ni labor times: si no aparecen, déjalos "".
- Si una sección no aplica, devuélvela como arreglo vacío [].

REGLAS DE BREVEDAD (para no exceder el límite de respuesta):
- NUNCA copies listas largas de códigos o texto al pie de la letra. Si la página enumera muchos DTCs relacionados (ej. P0101, P0102, …), resúmelo: menciona los 3–5 más relevantes y agrega "entre otros" en vez de listarlos todos.
- Mantén cada "detail", "note", "reason" y "text" en 1–2 frases. Ve al grano.
- Prioriza completar SIEMPRE un JSON válido y cerrado por encima de incluir todo el detalle.`;
}

// Repara un JSON cortado a la mitad (respuesta truncada por límite de tokens):
// cierra la cadena/comillas abiertas y balancea las llaves/corchetes pendientes.
function repairTruncatedJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const str = text.slice(start);
  const stack = [];
  let inStr = false, escaped = false, out = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    out += c;
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) out += '"';                  // cerrar cadena abierta
  out = out.replace(/\s+$/, "");
  if (out.endsWith(":")) out += '""';     // clave sin valor → valor vacío
  out = out.replace(/,\s*$/, "");         // quitar coma colgante
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";
  try { return JSON.parse(out); } catch (e) { return null; }
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (e) {}
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e !== -1 && e > s) {
    try { return JSON.parse(text.slice(s, e + 1)); } catch (e2) {}
  }
  const repaired = repairTruncatedJson(text);
  if (repaired) return repaired;
  throw new Error("La IA no devolvió JSON válido.");
}

async function callOpenAI(config, system, user, opts = {}) {
  const body = { model: config.model, messages: [ { role: "system", content: system }, { role: "user", content: user } ], temperature: 0.1 };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.json) body.response_format = { type: "json_object" };
  const r = await fetch(config.baseUrl + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.apiKey }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " — " + (await r.text()).slice(0, 300));
  const data = await r.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function callAnthropic(config, system, user, opts = {}) {
  const body = { model: config.model, max_tokens: opts.maxTokens || 2800, system, messages: [{ role: "user", content: user }], temperature: 0.1 };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " — " + (await r.text()).slice(0, 300));
  const data = await r.json();
  return (data.content && data.content[0] && data.content[0].text) || "";
}

function callAI(config, system, user, opts) {
  if (config.provider === "anthropic") return callAnthropic(config, system, user, opts);
  return callOpenAI(config, system, user, opts);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "AT_OPEN_OPTIONS") { chrome.runtime.openOptionsPage(); return false; }
  if (msg.type === "AT_PING") {
    callAI(msg.config, "Responde solo con la palabra: ok", "ping", { maxTokens: 5 })
      .then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === "AT_GENERATE") {
    chrome.storage.local.get("config", async ({ config }) => {
      if (!config || !config.apiKey || !config.model) { sendResponse({ ok: false, error: "Falta configurar la IA." }); return; }
      const text = (msg.text || "").slice(0, 16000);
      try {
        const system = buildSystemPrompt(config.lang || "español");
        const user = "Texto de la página de ALLDATA:\n\n" + text;
        const raw = await callAI(config, system, user, { json: true, maxTokens: 4096 });
        let ficha;
        try { ficha = parseJsonLoose(raw); }
        catch (pe) { sendResponse({ ok: false, error: "Respuesta no-JSON de la IA.", _raw: String(raw).slice(0, 600), _textLen: text.length }); return; }
        sendResponse({ ok: true, ficha, _raw: String(raw).slice(0, 600), _textLen: text.length });
      } catch (e) { sendResponse({ ok: false, error: e.message, _textLen: text.length }); }
    });
    return true;
  }
});
