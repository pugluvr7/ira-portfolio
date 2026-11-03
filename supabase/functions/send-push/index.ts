// Supabase Edge Function: send-push
// Sends Web Push alerts for the signed-in user's new transfer and friend requests.
//
// The site calls this right after you send a transfer or friend request (body: {}), and it
// alerts the recipient's devices about any of *your* recent requests not yet announced.
// Body {"test": true} sends a test alert to your own devices instead.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   VAPID_PRIVATE_KEY  required. Base64url private key matching VAPID_PUBLIC_KEY below.
//   VAPID_PUBLIC_KEY   optional; defaults to the key in config.js.
//   VAPID_SUBJECT      optional contact for push services, e.g. "mailto:you@example.com".
//   SITE_URL           optional, defaults to the GitHub Pages site.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Dependency-free: Web Push encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292) are done
// with the built-in Web Crypto API, so this pastes straight into the dashboard editor.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ||
  "BNxhJVJSNb8-GVykoeGPv2WByKQAKMuJ16FbqKPkBtYBfPyhq6xWeDLVb82OPl0M8EMT1bgtdxmcAnAQHkZB1vw";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://pugluvr7.github.io/ira-portfolio/";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pugluvr7.github.io/ira-portfolio/";
const RECENT_MINUTES = 15; // only announce requests made in the last few minutes

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- base64url + bytes ----------
const enc = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str: string): Uint8Array {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// ---------- VAPID (RFC 8292): signed JWT proving the alert comes from this site ----------
let signingKey: CryptoKey | null = null;
async function vapidHeader(endpoint: string): Promise<string> {
  if (!signingKey) {
    const pub = unb64u(VAPID_PUBLIC_KEY);
    signingKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", d: VAPID_PRIVATE_KEY, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${VAPID_PUBLIC_KEY}`;
}

// ---------- payload encryption (RFC 8291, Content-Encoding: aes128gcm) ----------
async function encryptPayload(p256dh: string, authSecret: string, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(auth, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(payload, new Uint8Array([2])); // 0x02 = last (only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

type Sub = { id: number; endpoint: string; p256dh: string; auth: string };
type Alert = { title: string; body: string; url: string; tag: string };

// Returns true if delivered; deletes subscriptions the push service says are gone.
async function pushTo(sub: Sub, alert: Alert): Promise<boolean> {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(alert)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  if (res.status === 404 || res.status === 410) {
    await rest("DELETE", `push_subscriptions?id=eq.${sub.id}`);
  } else if (!res.ok) {
    console.error("push failed", res.status, await res.text());
  }
  return res.ok;
}

// ---------- database (service role, server-side only) ----------
async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const subsFor = (userId: string): Promise<Sub[]> =>
  rest("GET", `push_subscriptions?user_id=eq.${userId}&select=id,endpoint,p256dh,auth`);
// Stamp pushed_at only if still unset, so two calls can't alert twice.
async function claim(table: string, id: number): Promise<boolean> {
  const rows = await rest("PATCH", `${table}?id=eq.${id}&pushed_at=is.null`, { pushed_at: new Date().toISOString() }, "return=representation");
  return rows.length > 0;
}
const page = (p: string) => new URL(p, SITE_URL).href;
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  if (!VAPID_PRIVATE_KEY) return reply(500, { error: "Push isn't set up yet (missing VAPID_PRIVATE_KEY secret)." });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!token || !userRes.ok) return reply(401, { error: "Please sign in again." });
  const user = await userRes.json();
  const body = await req.json().catch(() => ({}));

  try {
    if (body?.test) {
      const subs = await subsFor(user.id);
      if (!subs.length) return reply(404, { error: "No devices have notifications turned on for your account yet." });
      const results = await Promise.all(subs.map((s) => pushTo(s, {
        title: "🦞 Notifications are on",
        body: "You'll hear about new transfers and friend requests here.",
        url: page("index.html"), tag: "test",
      })));
      return reply(200, { sent: results.filter(Boolean).length, devices: subs.length });
    }

    const since = new Date(Date.now() - RECENT_MINUTES * 60 * 1000).toISOString();
    let sent = 0;

    const transfers = await rest("GET",
      `transfers?sender_id=eq.${user.id}&status=eq.pending&pushed_at=is.null&created_at=gte.${encodeURIComponent(since)}` +
      `&select=id,recipient_id,sender_name,quantity,unit,name,picture`);
    for (const t of transfers) {
      if (!(await claim("transfers", t.id))) continue;
      for (const s of await subsFor(t.recipient_id)) {
        if (await pushTo(s, {
          title: `${t.picture || "📦"} ${t.sender_name} sent you a transfer`,
          body: `${fmt(+t.quantity)} ${t.unit || "units"} of ${t.name}. Tap to accept or decline.`,
          url: page("transfers.html"), tag: `transfer-${t.id}`,
        })) sent++;
      }
    }

    const requests = await rest("GET",
      `friendships?requester_id=eq.${user.id}&status=eq.pending&pushed_at=is.null&created_at=gte.${encodeURIComponent(since)}` +
      `&select=id,addressee_id`);
    if (requests.length) {
      const [me] = await rest("GET", `profiles?id=eq.${user.id}&select=display_name`);
      for (const f of requests) {
        if (!(await claim("friendships", f.id))) continue;
        for (const s of await subsFor(f.addressee_id)) {
          if (await pushTo(s, {
            title: `👋 ${me?.display_name || "Someone"} wants to be your friend`,
            body: "Tap to accept or decline.",
            url: page("friends.html"), tag: `friend-${f.id}`,
          })) sent++;
        }
      }
    }
    return reply(200, { sent });
  } catch (err) {
    console.error(err);
    return reply(500, { error: "Couldn't send notifications. Has supabase/push.sql been run?" });
  }
});
