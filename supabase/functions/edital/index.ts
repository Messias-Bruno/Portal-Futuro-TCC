// Portal Futuro · função "edital" (Supabase Edge Function). Só o dono do portal pode usar.
// Recebe o título e o link do PDF oficial, baixa o edital e pede ao Gemini um resumo em linguagem simples,
// com a página de cada informação. O resumo fica "pendente" até o dono revisar e publicar.
import { gemini, hasGemini } from "./gemini.js";

const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ORIGINS = ["https://portal-futuro.pages.dev", "https://portal-futuro.netlify.app", "http://localhost:8765"];
// Só PDFs de sites oficiais de educação
const HOSTS = /(^|\.)(gov\.br|unicamp\.br|cps\.sp\.gov\.br|vestibularfatec\.com\.br|puc-campinas\.edu\.br|ifsp\.edu\.br|usp\.br|unesp\.br|ufscar\.br|fuvest\.br|vunesp\.com\.br|sp\.gov\.br)$/i;

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Vary": "Origin" };
}
async function db(path: string, init: RequestInit = {}, prefer = "") {
  const h: Record<string, string> = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: h });
  if (!r.ok) throw new Error("db " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
function b64(buf: Uint8Array) { let s = ""; const n = 0x8000; for (let i = 0; i < buf.length; i += n) s += String.fromCharCode(...buf.subarray(i, i + n)); return btoa(s); }

const PROMPT = "Você é um assistente do Portal Futuro, um guia para jovens de 17 a 20 anos de Campinas (SP). Leia o edital em PDF e explique em português simples, frases curtas, sem juridiquês. " +
  "Use apenas o que está no edital. Não invente datas, valores ou regras; se algo não estiver no edital, não inclua. Depois de cada informação, indique a página entre parênteses, como (p. 4). " +
  "Responda só com JSON neste formato: {\"resumo\": \"2 ou 3 frases sobre o que é este edital\", \"para_quem\": [\"...\"], \"datas\": [{\"o_que\": \"...\", \"quando\": \"...\"}], " +
  "\"como_se_inscrever\": [\"passo 1 ...\"], \"documentos\": [\"...\"], \"taxa\": \"valor e se há isenção, ou null\", \"atencao\": [\"pontos que costumam eliminar candidatos ou causar dúvida\"]}. " +
  "Listas com no máximo 8 itens cada.";

async function process(id: number, url: string) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 40000);
    const r = await fetch(url, { headers: { "User-Agent": "PortalFuturoBot/1.0 (+https://portal-futuro.pages.dev)", "Accept": "application/pdf" }, signal: ctrl.signal }); clearTimeout(t);
    if (!r.ok) throw new Error("não foi possível baixar o PDF (" + r.status + ")");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) throw new Error("PDF maior que 15 MB");
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) throw new Error("o link não é um arquivo PDF");
    const g = await gemini([{ inline_data: { mime_type: "application/pdf", data: b64(buf) } }, { text: PROMPT }], { timeoutMs: 120000 });
    const d = g.data || {};
    const L = (x: any, n = 8) => Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.trim()).slice(0, n).map((v) => v.trim().slice(0, 300)) : [];
    const resumo = {
      resumo: typeof d.resumo === "string" ? d.resumo.slice(0, 700) : "",
      para_quem: L(d.para_quem), como_se_inscrever: L(d.como_se_inscrever), documentos: L(d.documentos), atencao: L(d.atencao),
      datas: Array.isArray(d.datas) ? d.datas.filter((x: any) => x && x.o_que && x.quando).slice(0, 12).map((x: any) => ({ o_que: String(x.o_que).slice(0, 160), quando: String(x.quando).slice(0, 80) })) : [],
      taxa: typeof d.taxa === "string" ? d.taxa.slice(0, 200) : null,
    };
    await db("editais?id=eq." + id, { method: "PATCH", body: JSON.stringify({ resumo, status: "pendente", modelo: g.model, erro: null }) }, "return=minimal");
  } catch (e) {
    await db("editais?id=eq." + id, { method: "PATCH", body: JSON.stringify({ status: "erro", erro: String((e as Error).message || e).slice(0, 300) }) }, "return=minimal").catch(() => {});
  }
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return new Response("método não permitido", { status: 405, headers: h });
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  try {
    const auth = req.headers.get("authorization") || "";
    const u = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON || SR, Authorization: auth } });
    if (!u.ok) return J({ error: "entre na sua conta" }, 401);
    const user = await u.json();
    const own: any[] = await db("portal_owners?select=user_id&user_id=eq." + encodeURIComponent(user.id));
    if (!own.length) return J({ error: "só o dono do portal pode resumir editais" }, 403);
    if (!hasGemini()) return J({ error: "a chave do Gemini ainda não foi configurada no Supabase" }, 503);
    const body = await req.json().catch(() => ({}));
    const titulo = String(body.titulo || "").trim().slice(0, 120);
    let url: URL; try { url = new URL(String(body.pdf_url || "")); } catch (_) { return J({ error: "link inválido" }, 400); }
    if (url.protocol !== "https:" || !HOSTS.test(url.hostname)) return J({ error: "use o link do PDF no site oficial (gov.br, unicamp.br, Fatec, PUC-Campinas, IFSP…)" }, 400);
    if (titulo.length < 3) return J({ error: "dê um título ao edital" }, 400);
    const busy: any[] = await db("editais?select=id&status=eq.gerando&created_at=gt." + new Date(Date.now() - 10 * 60000).toISOString());
    if (busy.length >= 2) return J({ error: "já há resumos sendo preparados; espere alguns minutos" }, 429);
    const rows: any[] = await db("editais", { method: "POST", body: JSON.stringify({ titulo, pdf_url: url.href, status: "gerando" }) }, "return=representation");
    const id = rows[0].id;
    // @ts-ignore EdgeRuntime existe nas funções da Supabase
    EdgeRuntime.waitUntil(process(id, url.href));
    return J({ id, status: "gerando" }, 202);
  } catch (e) { console.error(e); return J({ error: "falha interna" }, 500); }
});
