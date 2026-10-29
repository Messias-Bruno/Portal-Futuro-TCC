// Chamada ao Gemini (Google) pelo servidor. A chave fica só no servidor (segredo GEMINI_API_KEY).
const MODELS = () => [Deno.env.get("GEMINI_MODEL"), "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"].filter(Boolean);
export function hasGemini() { return !!Deno.env.get("GEMINI_API_KEY"); }
export async function gemini(parts, { json = true, timeoutMs = 90000 } = {}) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("sem_chave");
  let last = "";
  for (const model of [...new Set(MODELS())]) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: Object.assign({ temperature: 0.2 }, json ? { responseMimeType: "application/json" } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 || r.status === 400 && /model/i.test(JSON.stringify(j))) { last = "modelo " + model + " indisponível"; continue; }
      if (!r.ok) throw new Error("gemini " + r.status + " " + (j?.error?.message || "").slice(0, 160));
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      return { model, text, data: json ? JSON.parse(text) : null };
    } finally { clearTimeout(t); }
  }
  throw new Error(last || "nenhum modelo disponível");
}
