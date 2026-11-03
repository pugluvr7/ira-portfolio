// Shared across pages: Supabase client, auth guard, portfolio loading,
// nav, theme toggle, tooltip, asset-class colors and HTML escaping.
(function () {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---------- theme (runs immediately to avoid a flash) ----------
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = localStorage.getItem("theme") || (isDark() ? "dark" : "light");
  function wireThemeToggle() {
    const toggle = $("theme-toggle");
    if (!toggle) return;
    const sync = () => (toggle.textContent = isDark() ? "☀ Light" : "☾ Dark");
    toggle.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
      sync();
    });
    sync();
  }

  // ---------- asset classes: fixed order sets chart colors ----------
  const classes = ["Stocks", "Seafood", "Precious Metals", "Real Estate", "Cash"];
  const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5"];
  const colorOf = (cls) => `var(${SERIES[classes.indexOf(cls)] || "--muted"})`;

  // User-entered text goes through this before landing in innerHTML.
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- tooltip ----------
  function showTip(e, title, rows) {
    const tip = $("tooltip");
    tip.innerHTML = `<div class="tt-title">${esc(title)}</div>` + rows.map(([k, v]) => `<div class="tt-row"><span class="muted">${esc(k)}</span><span>${esc(v)}</span></div>`).join("");
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - w - 8)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }
  function hideTip() { $("tooltip").hidden = true; }

  // ---------- Supabase ----------
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = Boolean(cfg.url && cfg.anonKey && window.supabase);
  const db = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  function showSetupNeeded() {
    document.body.classList.remove("is-loading");
    const main = document.querySelector("main");
    main.innerHTML = `
      <section class="card empty-state">
        <div class="empty-emoji" aria-hidden="true">🔌</div>
        <h2>Connect a Supabase project</h2>
        <p class="muted">Add your project URL and publishable key to <code>config.js</code>,
        and run <code>supabase/schema.sql</code> in the Supabase SQL editor. See the README for the steps.</p>
      </section>`;
  }

  function rowToHolding(r) {
    return {
      id: r.id, symbol: r.symbol, name: r.name, assetClass: r.asset_class,
      shares: +r.shares, price: +r.price, costBasis: +r.cost_basis, dayChangePct: +r.day_change_pct,
      picture: r.picture, unit: r.unit, note: r.note, image: r.image,
    };
  }

  async function loadPortfolio(userId) {
    const [{ data: profile, error: pErr }, { data: rows, error: hErr }] = await Promise.all([
      db.from("profiles").select("*").eq("id", userId).single(),
      db.from("holdings").select("*").order("created_at", { ascending: true }),
    ]);
    if (pErr) throw pErr;
    if (hErr) throw hErr;
    const today = new Date();
    return {
      profile,
      holder: profile.display_name,
      account: {
        name: profile.account_name,
        custodian: profile.custodian,
        asOf: today.toISOString().slice(0, 10),
      },
      contributions: {
        year: today.getFullYear(),
        limit: +profile.contribution_limit,
        contributedYTD: +profile.contributed_ytd,
        lifetime: +profile.lifetime_contributions,
      },
      targets: profile.targets || {},
      holdings: rows.map(rowToHolding),
    };
  }

  // ---------- nav ----------
  const PAGES = [
    ["index.html", "Dashboard"],
    ["assets.html", "Asset visualization"],
    ["edit.html", "Edit portfolio"],
    ["transfers.html", "Transfers"],
  ];
  function renderNav(P) {
    const nav = $("nav");
    if (!nav) return;
    const page = location.pathname.split("/").pop() || "index.html";
    const asOf = new Date(P.account.asOf + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    nav.innerHTML = `
      <div class="nav-inner">
        <a class="brand" href="index.html">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <div class="brand-name">${esc(P.account.name)}</div>
            <div class="brand-meta">${esc(P.account.custodian)} · as of ${asOf}</div>
          </div>
        </a>
        <div class="tabs" role="navigation" aria-label="Pages">
          ${PAGES.map(([href, label]) => `<a href="${href}"${href === page ? ' aria-current="page"' : ""}>${label}${href === "transfers.html" ? '<span class="tab-badge" id="transfer-badge" hidden></span>' : ""}</a>`).join("")}
        </div>
        <div class="nav-user">
          <span class="user-chip" title="Signed in"><span class="user-avatar" aria-hidden="true">${esc((P.holder || "?").slice(0, 1).toUpperCase())}</span>${esc(P.holder)}</span>
          <button id="invite-btn" class="pill-btn invite-pill" type="button">✉️ Invite</button>
          <button id="sign-out" class="pill-btn" type="button">Sign out</button>
          <button id="theme-toggle" class="pill-btn" type="button" aria-label="Toggle dark mode"></button>
        </div>
      </div>`;
    $("invite-btn").addEventListener("click", () => openInvite({ from: P.holder }));
    $("sign-out").addEventListener("click", async () => {
      await db.auth.signOut();
      location.href = "login.html";
    });
    wireThemeToggle();
  }

  // ---------- invite a friend: site-sent email, plus copy link / share ----------
  // "Send invite" calls the send-invite Edge Function (supabase/functions/send-invite),
  // which emails the invite from the site. Copy link and Share work without it.
  let inviteFrom = "";
  function inviteLink(email) {
    const url = new URL("login.html", cfg.siteUrl || location.href);
    url.searchParams.set("signup", "1");
    if (email) url.searchParams.set("email", email);
    return url.href;
  }
  const shareText = () =>
    `${inviteFrom || "I"} invited you to IRA Portfolio — the retirement tracker for stocks, seafood, gold bars and haunted sheds. ` +
    `Make your account here: ${inviteLink("")}`;

  async function sendInvite(email, note) {
    const { error } = await db.functions.invoke("send-invite", { body: { email, note } });
    if (!error) return null;
    // Function errors carry the response; pull out our friendly message if there is one.
    try { return (await error.context.json()).error || error.message; } catch { return error.message; }
  }

  function openInvite({ from, to = "" } = {}) {
    if (from) inviteFrom = from;
    let dlg = $("invite-dialog");
    if (!dlg) {
      document.body.insertAdjacentHTML("beforeend", `
        <dialog class="invite-dialog" id="invite-dialog" aria-labelledby="invite-title">
          <form class="invite-form" id="invite-form" novalidate>
            <div class="invite-head">
              <span class="invite-emoji" aria-hidden="true">🦞</span>
              <div>
                <h2 id="invite-title">Invite a friend</h2>
                <p class="muted small">We'll email them a link to make their own account.</p>
              </div>
              <button class="icon-btn" type="button" id="invite-close" aria-label="Close">✕</button>
            </div>
            <label class="field"><span>Their email</span>
              <input id="invite-to" type="email" autocomplete="off" placeholder="friend@example.com" autofocus required />
            </label>
            <label class="field"><span>Add a note (optional)</span>
              <textarea id="invite-note" rows="3" maxlength="300" placeholder="Come look at my lobsters"></textarea>
            </label>
            <button class="primary-btn invite-send" id="invite-send" type="submit">✉️ Send invite</button>
            <p class="form-msg" id="invite-status" role="status"></p>
            <div class="invite-alt">
              <span class="muted small">Or share it yourself:</span>
              <button class="pill-btn" id="invite-copy" type="button">🔗 Copy link</button>
              <button class="pill-btn" id="invite-share" type="button" hidden>Share…</button>
            </div>
          </form>
        </dialog>`);
      dlg = $("invite-dialog");
      const status = (text, kind) => { $("invite-status").textContent = text; $("invite-status").dataset.kind = kind; };
      $("invite-close").addEventListener("click", () => dlg.close());
      $("invite-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("invite-to").value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return status("Enter their email address.", "error");
        const btn = $("invite-send");
        btn.disabled = true;
        status("Sending…", "info");
        const err = await sendInvite(email, $("invite-note").value.trim());
        btn.disabled = false;
        if (err) return status(err, "error");
        status(`Invite sent to ${email} ✓`, "success");
        $("invite-to").value = "";
        $("invite-note").value = "";
      });
      $("invite-copy").addEventListener("click", async () => {
        const link = inviteLink("");
        try {
          await navigator.clipboard.writeText(link);
          status("Link copied ✓ Paste it into a text or chat.", "success");
        } catch {
          status(link, "info");
        }
      });
      if (navigator.share) {
        $("invite-share").hidden = false;
        $("invite-share").addEventListener("click", () =>
          navigator.share({ title: "IRA Portfolio", text: shareText() }).catch(() => {}));
      }
    }
    $("invite-to").value = to;
    $("invite-status").textContent = "";
    dlg.showModal();
  }

  // ---------- transfer notifications: nav badge + banner ----------
  async function refreshTransferNotice(userId) {
    const { data, error } = await db.from("transfers")
      .select("id, sender_name, quantity, unit, name, picture")
      .eq("recipient_id", userId).eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) return console.warn("Couldn't check transfers:", error.message); // e.g. transfers.sql not run yet
    const n = data.length;
    const badge = $("transfer-badge");
    if (badge) { badge.hidden = !n; badge.textContent = n; }
    document.getElementById("transfer-banner")?.remove();
    const onTransfersPage = (location.pathname.split("/").pop() || "") === "transfers.html";
    if (!n || onTransfersPage) return;
    const t = data[0];
    const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(t.quantity);
    const more = n > 1 ? ` and ${n - 1} more request${n > 2 ? "s" : ""}` : "";
    $("nav").insertAdjacentHTML("afterend", `
      <div class="notice-banner" id="transfer-banner" role="status">
        <div class="notice-inner">
          <span class="notice-pic" aria-hidden="true">${esc(t.picture || "🔔")}</span>
          <span><strong>${esc(t.sender_name)}</strong> wants to send you ${qty} ${esc(t.unit || "")} of ${esc(t.name || "something")}${more}.</span>
          <a class="primary-btn" href="transfers.html">Review</a>
        </div>
      </div>`);
  }

  // ---------- page bootstrap for signed-in pages ----------
  async function start(render) {
    if (!configured) return showSetupNeeded();
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      location.replace("login.html");
      return;
    }
    try {
      const P = await loadPortfolio(session.user.id);
      renderNav(P);
      refreshTransferNotice(session.user.id);
      await render(P, { user: session.user });
    } catch (err) {
      console.error(err);
      document.querySelector("main").innerHTML = `
        <section class="card empty-state">
          <div class="empty-emoji" aria-hidden="true">🦞</div>
          <h2>Couldn't load your portfolio</h2>
          <p class="muted">${esc(err.message || err)}</p>
        </section>`;
    } finally {
      document.body.classList.remove("is-loading");
    }
  }

  window.UI = { db, configured, start, loadPortfolio, refreshTransferNotice, openInvite, wireThemeToggle, showTip, hideTip, classes, colorOf, esc };
})();
