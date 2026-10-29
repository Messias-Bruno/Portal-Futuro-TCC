// Portal Futuro · função "push" (Supabase Edge Function)
// GET  → devolve a chave pública VAPID (o site precisa dela para ativar as notificações).
// POST → só com o segredo do agendamento (x-cron-secret). Envia, uma vez por dia:
//        · dia 5: lembrete de organizar as finanças;
//        · 7 dias e 1 dia antes: ENEM, Vestibular Unicamp e as provas/compromissos do próprio aluno;
//        · novidades do portal ainda não enviadas (tabela push_news).
// Nada de bibliotecas externas: a criptografia está em webpush.js.
import { newVapidKeys, publicFromJwk, sendPush } from "./webpush.js";

const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUBJECT = "https://portal-futuro.pages.dev";
const ALLOWED = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.wns\.windows\.com)\//;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "apikey, authorization, content-type" };

// Datas oficiais (as mesmas do calendário do portal). Sem feriados.
const OFFICIAL: { d: string; t: string; url: string }[] = [
  { d: "2026-11-08", t: "ENEM 2026 · 1º dia de prova", url: "/#calendario" },
  { d: "2026-11-15", t: "ENEM 2026 · 2º dia de prova", url: "/#calendario" },
  { d: "2026-11-23", t: "Unicamp · lista de convocados para a 2ª fase", url: "/#vestibulares" },
  { d: "2026-11-29", t: "Unicamp · provas da 2ª fase", url: "/#vestibulares" },
  { d: "2026-12-02", t: "Unicamp · provas de habilidades específicas", url: "/#vestibulares" },
];

async function db(path: string, init: RequestInit = {}, prefer = "") {
  const h: Record<string, string> = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: h });
  if (!r.ok) throw new Error("db " + r.status + " " + (await r.text()).slice(0, 200));
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function config() {
  const rows: { key: string; value: string }[] = await db("push_config?select=key,value");
  const c: Record<string, string> = {};
  rows.forEach((r) => (c[r.key] = r.value));
  if (!c.vapid_jwk) {
    const k = await newVapidKeys();
    await db("push_config", { method: "POST", body: JSON.stringify({ key: "vapid_jwk", value: k.jwk }) }, "resolution=ignore-duplicates,return=minimal");
    const again: { value: string }[] = await db("push_config?select=value&key=eq.vapid_jwk");
    c.vapid_jwk = again[0].value;
  }
  return c;
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

// Data de hoje em Brasília (YYYY-MM-DD)
function todaySP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function ddmm(d: string) { return d.slice(8, 10) + "/" + d.slice(5, 7); }
function clip(s: string, n: number) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

type Note = { key: string; title: string; body: string; url: string; tag: string };

function dateNotes(today: string, data: any, official: { d: string; t: string; url: string }[]): Note[] {
  const out: Note[] = [];
  const when = (n: number) => (n === 1 ? "amanhã" : "em 7 dias");
  official.forEach((o) => {
    const n = daysBetween(today, o.d);
    if (n === 7 || n === 1) out.push({ key: "of:" + o.d + ":" + o.t.slice(0, 40) + ":" + n, title: (n === 1 ? "É amanhã: " : "Falta 1 semana: ") + clip(o.t, 50), body: n === 1 ? "Separe documento com foto e confira o local e o horário." : "Dia " + ddmm(o.d) + ". Ainda dá tempo de revisar com calma.", url: o.url, tag: "of-" + o.d });
  });
  const provas = Array.isArray(data?.provas) ? data.provas : [];
  provas.forEach((p: any) => {
    if (!p || p.ex || typeof p.data !== "string") return;
    const n = daysBetween(today, p.data);
    if (n !== 7 && n !== 1) return;
    const tipo = String(p.tipo || "Prova");
    out.push({ key: "pv:" + String(p.id).slice(0, 20) + ":" + p.data + ":" + n, title: clip(tipo + " de " + p.disc + " " + when(n), 60), body: p.cont ? clip("Conteúdo: " + p.cont, 140) : "Dia " + ddmm(p.data) + ". Que tal revisar hoje?", url: "/#provas", tag: "pv-" + p.id });
  });
  const ativ = Array.isArray(data?.ativ) ? data.ativ : [];
  ativ.forEach((a: any) => {
    if (!a || a.ex || a.done || typeof a.data !== "string") return;
    const n = daysBetween(today, a.data);
    if (n !== 7 && n !== 1) return;
    out.push({ key: "at:" + String(a.id).slice(0, 20) + ":" + a.data + ":" + n, title: clip(String(a.tipo || "Compromisso") + " " + when(n), 60), body: clip(a.tit + " · " + ddmm(a.data), 140), url: "/#agenda", tag: "at-" + a.id });
  });
  return out;
}

async function run(mode: string, dry: boolean, todayOverride?: string) {
  const c = await config();
  const jwk = JSON.parse(c.vapid_jwk);
  const today = todayOverride && /^\d{4}-\d{2}-\d{2}$/.test(todayOverride) ? todayOverride : todaySP();
  const subs: any[] = await db("push_subs?select=id,user_id,endpoint,p256dh,auth,prefs&active=eq.true");
  const news: any[] = await db("push_news?select=id,title,body,url&sent_at=is.null&order=id.asc&limit=3");
  // Datas oficiais: as fixas daqui e as publicadas pelo dono (tabela official_dates), sem repetir o mesmo dia e nome
  const pub: any[] = await db("official_dates?select=titulo,data_ini&status=eq.publicada&data_ini=gte." + today + "&limit=200").catch(() => []);
  const official = OFFICIAL.concat(pub.map((x) => ({ d: x.data_ini, t: x.titulo, url: "/#datas" })))
    .filter((o, i, a) => a.findIndex((y) => y.d === o.d && y.t.toLowerCase() === o.t.toLowerCase()) === i);
  const users = [...new Set(subs.filter((s) => s.prefs?.datas).map((s) => s.user_id))];
  const dataBy: Record<string, any> = {};
  for (let i = 0; i < users.length; i += 100) {
    const part = users.slice(i, i + 100);
    const rows: any[] = await db("user_data?select=user_id,data&user_id=in.(" + part.join(",") + ")");
    rows.forEach((r) => (dataBy[r.user_id] = r.data));
  }
  const stats = { today, mode, subs: subs.length, planned: 0, sent: 0, gone: 0, failed: 0, news: news.length };
  for (const s of subs) {
    if (!ALLOWED.test(s.endpoint)) continue;
    let notes: Note[] = [];
    if (mode === "daily") {
      if (s.prefs?.fin && today.slice(8, 10) === "05") {
        const m = MESES[Number(today.slice(5, 7)) - 1];
        notes.push({ key: "fin:" + today.slice(0, 7), title: "Hora de organizar " + m, body: "Anote o que entrou e o que já saiu. Leva dois minutos e o mês fica mais leve.", url: "/#financas", tag: "fin" });
      }
      if (s.prefs?.datas) {
        const dn = dateNotes(today, dataBy[s.user_id], official);
        if (dn.length > 3) notes.push({ key: "resumo:" + today, title: dn.length + " datas chegando", body: "Abra a agenda para ver tudo o que vem nos próximos dias.", url: "/#agenda", tag: "resumo" });
        else notes = notes.concat(dn);
      }
    }
    if (s.prefs?.novidades) news.forEach((n) => notes.push({ key: "news:" + n.id, title: n.title, body: n.body, url: n.url, tag: "news-" + n.id }));
    if (!notes.length) continue;
    stats.planned += notes.length;
    if (dry) continue;
    // Só envia o que ainda não foi enviado para este aparelho
    const fresh: { key: string }[] = await db("push_log?on_conflict=sub_id,key", { method: "POST", body: JSON.stringify(notes.map((n) => ({ sub_id: s.id, key: n.key.slice(0, 120) }))) }, "resolution=ignore-duplicates,return=representation");
    const freshKeys = new Set(fresh.map((f) => f.key));
    for (const n of notes) {
      if (!freshKeys.has(n.key.slice(0, 120))) continue;
      try {
        const st = await sendPush(s, { title: n.title, body: n.body, url: n.url, tag: n.tag }, jwk, SUBJECT);
        if (st === 404 || st === 410) { stats.gone++; await db("push_subs?id=eq." + s.id, { method: "PATCH", body: JSON.stringify({ active: false }) }, "return=minimal"); break; }
        if (st >= 200 && st < 300) { stats.sent++; await db("push_subs?id=eq." + s.id, { method: "PATCH", body: JSON.stringify({ last_ok: new Date().toISOString() }) }, "return=minimal"); }
        else stats.failed++;
      } catch (_) { stats.failed++; }
    }
  }
  if (!dry && news.length) await db("push_news?id=in.(" + news.map((n) => n.id).join(",") + ")", { method: "PATCH", body: JSON.stringify({ sent_at: new Date().toISOString() }) }, "return=minimal");
  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (req.method === "GET") {
      const c = await config();
      return new Response(JSON.stringify({ publicKey: publicFromJwk(JSON.parse(c.vapid_jwk)) }), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
    }
    if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
    const c = await config();
    if (!safeEqual(req.headers.get("x-cron-secret") || "", c.cron_secret || "")) return new Response("não autorizado", { status: 401 });
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "news" ? "news" : "daily";
    const stats = await run(mode, body.dry === true, body.dry === true ? body.today : undefined);
    return new Response(JSON.stringify(stats), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "falha interna" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
