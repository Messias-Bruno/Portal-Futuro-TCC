// Portal Futuro · função "datas" (Supabase Edge Function), chamada todo dia pelo agendamento.
// Confere as páginas oficiais (tabela official_sources). Olha só os trechos com datas, para não avisar
// à toa quando muda uma notícia. Se os trechos mudaram: cria um alerta para o dono, pede ao Gemini
// (se houver chave) as datas encontradas e guarda como "pendente". Nada é publicado sem o dono aprovar.
import { gemini, hasGemini } from "./gemini.js";
import { sendPush } from "./webpush.js";

const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UA = "PortalFuturoBot/1.0 (+https://portal-futuro.pages.dev)";
const MES = "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const DATE_RE = new RegExp("(\\b\\d{1,2}/\\d{1,2}(/\\d{2,4})?\\b)|(\\b\\d{1,2}(º|°)?\\s+(de\\s+)?(" + MES + ")\\b)", "i");

async function db(path: string, init: RequestInit = {}, prefer = "") {
  const h: Record<string, string> = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: h });
  if (!r.ok) throw new Error("db " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
function safeEqual(a: string, b: string) { if (!a || !b || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
function toText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|li|tr|h\d|div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[a-z]+;/g, " ");
}
function dateLines(text: string) {
  return text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 8 && l.length < 400 && DATE_RE.test(l)).slice(0, 300);
}
async function sha(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function todaySP() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

async function extract(nome: string, url: string, lines: string[], today: string) {
  const prompt = "Você ajuda o Portal Futuro, um guia para estudantes de Campinas (SP). Abaixo estão trechos com datas da página oficial \"" + nome + "\" (" + url + "). " +
    "Liste somente as datas a partir de " + today + " que sejam úteis para estudantes: inscrições, pedidos de isenção, provas, gabaritos, resultados, chamadas e matrículas de ENEM, SISU, ProUni, FIES ou vestibulares. " +
    "Use apenas o que está escrito nos trechos, sem inventar nem deduzir anos que não aparecem. Se não houver nenhuma data clara, responda []. " +
    "Responda só com JSON: uma lista de objetos {\"titulo\": texto curto em português começando pelo nome do exame (ex.: \"ENEM 2026 · 1º dia de prova\"), \"data_ini\": \"AAAA-MM-DD\", \"data_fim\": \"AAAA-MM-DD\" ou null}.\n\nTrechos:\n" + lines.join("\n").slice(0, 24000);
  const r = await gemini([{ text: prompt }]);
  const list = Array.isArray(r.data) ? r.data : [];
  return list.filter((x: any) => x && typeof x.titulo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.data_ini || "") && x.data_ini >= today)
    .slice(0, 40).map((x: any) => ({ titulo: x.titulo.trim().slice(0, 120), data_ini: x.data_ini, data_fim: /^\d{4}-\d{2}-\d{2}$/.test(x.data_fim || "") && x.data_fim >= x.data_ini ? x.data_fim : null }));
}

async function notifyOwner(title: string, body: string) {
  const cfg: any[] = await db("push_config?select=key,value&key=eq.vapid_jwk"); if (!cfg.length) return;
  const owners: any[] = await db("portal_owners?select=user_id"); if (!owners.length) return;
  const subs: any[] = await db("push_subs?select=id,endpoint,p256dh,auth&active=eq.true&user_id=in.(" + owners.map((o) => o.user_id).join(",") + ")");
  for (const s of subs) { try { await sendPush(s, { title, body, url: "/#pf-revisar", tag: "revisar" }, JSON.parse(cfg[0].value), "https://portal-futuro.pages.dev"); } catch (_) { /* segue */ } }
}

async function run() {
  const today = todaySP();
  const sources: any[] = await db("official_sources?select=id,nome,url,last_hash&ativo=eq.true&order=id");
  const out: any[] = []; let novas = 0, mudou = 0;
  for (const s of sources) {
    const item: any = { fonte: s.nome };
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(s.url, { headers: { "User-Agent": UA, "Accept": "text/html" }, signal: ctrl.signal }); clearTimeout(t);
      item.status = r.status;
      const html = r.ok ? await r.text() : "";
      const lines = dateLines(toText(html));
      const h = await sha(lines.join("\n"));
      const changed = r.ok && lines.length > 0 && h !== s.last_hash;
      const patch: any = { last_checked: new Date().toISOString(), last_status: r.status };
      if (changed) { patch.last_hash = h; patch.last_changed = patch.last_checked; }
      await db("official_sources?id=eq." + s.id, { method: "PATCH", body: JSON.stringify(patch) }, "return=minimal");
      item.trechos = lines.length; item.mudou = changed;
      if (changed && s.last_hash) { mudou++; await db("source_alerts", { method: "POST", body: JSON.stringify({ source_id: s.id }) }, "return=minimal"); }
      if (changed && hasGemini()) {
        const found = await extract(s.nome, s.url, lines, today);
        if (found.length) {
          const rows = found.map((f) => ({ ...f, source_id: s.id, link: s.url, origem: "ia", status: "pendente" }));
          const ins: any[] = await db("official_dates?on_conflict=titulo,data_ini", { method: "POST", body: JSON.stringify(rows) }, "resolution=ignore-duplicates,return=representation");
          item.novas = ins.length; novas += ins.length;
        }
      }
    } catch (e) { item.erro = String((e as Error).message || e).slice(0, 160); }
    out.push(item);
  }
  if (novas || mudou) await notifyOwner("Datas oficiais para revisar", (novas ? novas + " data(s) nova(s) encontrada(s)" : "Uma página oficial mudou") + ". Confira antes de publicar.").catch(() => {});
  return { today, gemini: hasGemini(), novas, mudou, fontes: out };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
  try {
    const cfg: any[] = await db("push_config?select=value&key=eq.cron_secret");
    if (!safeEqual(req.headers.get("x-cron-secret") || "", cfg[0]?.value || "")) return new Response("não autorizado", { status: 401 });
    return new Response(JSON.stringify(await run()), { headers: { "Content-Type": "application/json" } });
  } catch (e) { console.error(e); return new Response(JSON.stringify({ error: "falha interna" }), { status: 500 }); }
});
