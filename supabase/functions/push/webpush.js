// Web Push sem bibliotecas externas: criptografia aes128gcm (RFC 8291) e assinatura VAPID (RFC 8292),
// tudo com a Web Crypto padrão (funciona no Deno da Supabase e no Node).
const enc = new TextEncoder();
export function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// Par de chaves VAPID (P-256). Guardamos como JWK; a chave pública vai para o navegador em formato "raw".
export async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { jwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }), publicKey: publicFromJwk(jwk) };
}
export function publicFromJwk(jwk) { return b64u(concat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y))); }

async function vapidHeader(endpoint, jwk, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims)));
  return "vapid t=" + header + "." + claims + "." + b64u(sig) + ", k=" + publicFromJwk(jwk);
}

// Criptografa a mensagem para a inscrição (só o aparelho do aluno consegue ler)
export async function encryptPayload(p256dh, authSecret, plaintext) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(plaintext), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// Envia uma notificação. Devolve o status HTTP do serviço de push (201 = entregue; 404/410 = inscrição expirada).
export async function sendPush(sub, payload, jwk, subject, ttl = 86400) {
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { "Authorization": await vapidHeader(sub.endpoint, jwk, subject), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": String(ttl), "Urgency": "normal" },
    body,
  });
  try { await res.arrayBuffer(); } catch (_) { /* ignora corpo */ }
  return res.status;
}
