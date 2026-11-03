// Supabase Edge Function: send-invite
// Emails a "join IRA Portfolio" invite on behalf of the signed-in user, via Resend.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   RESEND_API_KEY  required. From resend.com -> API Keys.
//   INVITE_FROM     e.g. "IRA Portfolio <invites@yourdomain.com>" once your domain is verified in Resend.
//                   Until then the default onboarding@resend.dev can only send to your own Resend email.
//   SITE_URL        optional, defaults to the GitHub Pages site.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Deliberately dependency-free (plain fetch) so it can be pasted into the dashboard editor.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("INVITE_FROM") || "IRA Portfolio <onboarding@resend.dev>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pugluvr7.github.io/ira-portfolio/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);

const REFUSALS: Record<string, [number, string]> = {
  invalid: [400, "That doesn't look like an email address."],
  member: [409, "They already have an account — send them a transfer instead!"],
  rate_limited: [429, "You've sent 10 invites today. Try again tomorrow."],
  duplicate: [409, "Someone already invited them today."],
  unknown_inviter: [403, "Your account wasn't found. Try signing out and back in."],
};

// PostgREST call with the service role (bypasses RLS; only used server-side here).
const rest = (method: string, path: string, body?: unknown) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

function inviteEmail({ name, note, link }: { name: string; note: string; link: string }) {
  const subject = `${name} invited you to IRA Portfolio`;
  const text = [
    `${name} invited you to IRA Portfolio — the retirement tracker for stocks, seafood, gold bars and haunted sheds.`,
    note ? `\n"${note}"\n` : "",
    `Make your account: ${link}`,
    "",
    "Not financial advice. Definitely not seafood advice.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#faf7fb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f1724">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #eee8f0">
        <tr><td style="height:8px;background:linear-gradient(90deg,#d7bfdb,#ffd485);background-color:#d7bfdb"></td></tr>
        <tr><td style="padding:32px">
          <div style="font-size:44px;line-height:1">🦞</div>
          <h1 style="font-size:24px;margin:16px 0 8px;letter-spacing:-0.02em">${esc(name)} invited you to IRA Portfolio</h1>
          <p style="font-size:15px;line-height:1.5;color:#5f5566;margin:0 0 16px">
            The retirement tracker for stocks, seafood, gold bars and haunted sheds.
          </p>
          ${note ? `<p style="font-size:15px;line-height:1.5;font-style:italic;margin:0 0 20px;padding:12px 16px;background:#f3ebf4;border-radius:12px">“${esc(note)}”</p>` : ""}
          <a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#ffd485;background-image:linear-gradient(135deg,#d7bfdb,#ffd485);color:#1f1724;font-weight:700;font-size:15px;text-decoration:none">Make your account</a>
          <p style="font-size:12px;color:#8f8696;margin:24px 0 0">Not financial advice. Definitely not seafood advice.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  if (!RESEND_API_KEY) return reply(500, { error: "Email invites aren't set up yet (missing RESEND_API_KEY secret)." });

  // Who's asking? Validate their session token with Supabase Auth.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!token || !userRes.ok) return reply(401, { error: "Please sign in again." });
  const user = await userRes.json();

  let body: { email?: unknown; note?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: "Bad request." }); }
  const email = String(body?.email || "").trim().toLowerCase();
  const note = String(body?.note || "").trim().slice(0, 300);

  // Limits + logging happen in the database.
  const rec = await rest("POST", "rpc/record_invite", { p_inviter: user.id, p_email: email });
  if (!rec.ok) {
    console.error("record_invite failed", rec.status, await rec.text());
    return reply(500, { error: "Couldn't record the invite. Has supabase/invites.sql been run?" });
  }
  const r = await rec.json();
  if (r.status !== "ok") {
    const [code, error] = REFUSALS[r.status] || [400, "Couldn't send that invite."];
    return reply(code, { error, status: r.status });
  }

  const link = new URL("login.html", SITE_URL);
  link.searchParams.set("signup", "1");
  link.searchParams.set("email", email);
  const { subject, text, html } = inviteEmail({ name: r.inviter_name, note, link: link.href });

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], reply_to: user.email, subject, text, html }),
  });
  if (!send.ok) {
    const detail = await send.json().catch(() => ({}));
    console.error("Resend rejected invite", send.status, detail);
    await rest("PATCH", `invites?id=eq.${r.invite_id}`, { status: "failed" });
    return reply(502, { error: `The email service refused: ${detail.message || `HTTP ${send.status}`}` });
  }
  return reply(200, { ok: true });
});
