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
    ["transfers.html", "Transfers"],
  ];
  const BADGES = { "transfers.html": "transfer-badge" };
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
          ${PAGES.map(([href, label]) => `<a href="${href}"${href === page ? ' aria-current="page"' : ""}>${label}${BADGES[href] ? `<span class="tab-badge" id="${BADGES[href]}" hidden></span>` : ""}</a>`).join("")}
        </div>
        <div class="nav-user">
          <button id="invite-btn" class="pill-btn invite-pill" type="button">✉️ Invite</button>
          <button id="theme-toggle" class="pill-btn" type="button" aria-label="Toggle dark mode"></button>
          <div class="profile-menu">
            <button id="profile-btn" class="profile-chip${["profile.html", "friends.html", "public.html"].includes(page) ? " is-current" : ""}" type="button"
                    aria-haspopup="menu" aria-expanded="false" aria-controls="profile-dropdown">
              <span class="user-avatar" aria-hidden="true">${esc((P.holder || "?").slice(0, 1).toUpperCase())}</span>
              <span class="profile-dot" id="profile-dot" hidden></span>
              <span class="profile-chip-name">${esc(P.holder)}</span>
              <span class="profile-caret" aria-hidden="true">▾</span>
            </button>
            <div class="profile-dropdown" id="profile-dropdown" role="menu" hidden>
              <div class="profile-dropdown-head">
                <div class="person-name">${esc(P.holder)}</div>
                <div class="muted small">${esc(P.email || "")}</div>
              </div>
              <a role="menuitem" href="profile.html#public">Profile</a>
              <a role="menuitem" href="profile.html#portfolio">Edit portfolio</a>
              <a role="menuitem" href="friends.html"${page === "friends.html" ? ' aria-current="page"' : ""}>Friends<span class="tab-badge" id="friend-badge" hidden></span></a>
              <a role="menuitem" href="profile.html#settings">Settings</a>
              <button role="menuitem" type="button" id="sign-out" class="menu-danger">Sign out</button>
            </div>
          </div>
        </div>
      </div>`;
    $("invite-btn").addEventListener("click", () => openInvite({ from: P.holder }));
    $("sign-out").addEventListener("click", signOut);

    // profile menu: open/close on click, close on outside click, Escape, or picking an item
    const btn = $("profile-btn"), menu = $("profile-dropdown");
    const setOpen = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    wireThemeToggle();
  }

  async function signOut() {
    // stop this device getting alerts for an account that's no longer signed in here
    await push.disable().catch(() => {});
    await db.auth.signOut();
    location.href = "login.html";
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

  // ---------- notifications: nav badges + one banner (transfers first, then friend requests) ----------
  async function refreshNotices(userId) {
    const [tr, fr] = await Promise.all([
      db.from("transfers")
        .select("id, sender_name, quantity, unit, name, picture")
        .eq("recipient_id", userId).eq("status", "pending")
        .order("created_at", { ascending: false }),
      db.rpc("list_friends"),
    ]);
    // Either may fail if its SQL file hasn't been run yet; the rest of the page still works.
    if (tr.error) console.warn("Couldn't check transfers:", tr.error.message);
    if (fr.error) console.warn("Couldn't check friend requests:", fr.error.message);
    const transfers = tr.data || [];
    const requests = (fr.data || []).filter((f) => f.status === "pending" && f.direction === "incoming");

    const setBadge = (id, n) => { const b = $(id); if (b) { b.hidden = !n; b.textContent = n; } };
    setBadge("transfer-badge", transfers.length);
    setBadge("friend-badge", requests.length);
    const dot = $("profile-dot");
    if (dot) { dot.hidden = !requests.length; dot.title = `${requests.length} friend request${requests.length === 1 ? "" : "s"}`; }

    document.getElementById("notice-banner")?.remove();
    const page = location.pathname.split("/").pop() || "";
    let pic, text, href;
    if (transfers.length && page !== "transfers.html") {
      const t = transfers[0];
      const qty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(t.quantity);
      const more = transfers.length > 1 ? ` and ${transfers.length - 1} more request${transfers.length > 2 ? "s" : ""}` : "";
      [pic, href] = [t.picture || "🔔", "transfers.html"];
      text = `<strong>${esc(t.sender_name)}</strong> wants to send you ${qty} ${esc(t.unit || "")} of ${esc(t.name || "something")}${more}.`;
    } else if (requests.length && page !== "friends.html") {
      const more = requests.length > 1 ? ` (and ${requests.length - 1} more)` : "";
      [pic, href] = ["👋", "friends.html"];
      text = `<strong>${esc(requests[0].friend_name)}</strong> wants to be your friend${more}.`;
    } else return;
    $("nav").insertAdjacentHTML("afterend", `
      <div class="notice-banner" id="notice-banner" role="status">
        <div class="notice-inner">
          <span class="notice-pic" aria-hidden="true">${esc(pic)}</span>
          <span>${text}</span>
          <a class="primary-btn" href="${href}">Review</a>
        </div>
      </div>`);
  }

  // ---------- push notifications (per device) ----------
  // sw.js shows the alerts; supabase/functions/send-push sends them.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const push = {
    // "unsupported" | "needs-home-screen" | "blocked" | "off" | "on"
    async status() {
      if (isIOS && !isStandalone) return "needs-home-screen";
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) return "unsupported";
      if (Notification.permission === "denied") return "blocked";
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      return sub && Notification.permission === "granted" ? "on" : "off";
    },
    async enable() {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser settings, then try again."
        : "Notifications weren't allowed.");
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(cfg.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const { endpoint, keys } = sub.toJSON();
      const { error } = await db.rpc("save_push_subscription", {
        p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: navigator.userAgent,
      });
      if (error) throw new Error(/save_push_subscription/.test(error.message)
        ? "Push isn't set up in the database yet — run supabase/push.sql." : error.message);
    },
    async disable() {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (!sub) return;
      await db.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    },
    async test() {
      const { data, error } = await db.functions.invoke("send-push", { body: { test: true } });
      if (error) {
        let message = error.message;
        try { message = (await error.context.json()).error || message; } catch { /* keep generic message */ }
        throw new Error(message);
      }
      return data;
    },
  };
  // Called after sending a transfer or friend request: alerts the recipient's devices.
  // Fire-and-forget — the request itself already succeeded, and the in-app badge still works.
  function notifyRecipients() {
    if (!db) return;
    db.functions.invoke("send-push", { body: {} }).catch(() => {});
  }

  // ---------- public profile card (shared by the profile preview and public.html) ----------
  // p: the shape returned by get_public_profile()
  function renderPublicProfile(p) {
    const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
    const month = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const meta = [
      p.location && `📍 ${esc(p.location)}`,
      p.member_since && `Member since ${month(p.member_since)}`,
      p.friends_since && `Friends since ${month(p.friends_since)}`,
    ].filter(Boolean).join(" · ");
    const holdings = p.holdings || [];
    return `
      <article class="pub-card">
        <div class="pub-banner" aria-hidden="true"></div>
        <div class="pub-head">
          <span class="person-avatar pub-avatar" aria-hidden="true">${esc((p.display_name || "?").slice(0, 1).toUpperCase())}</span>
          ${p.spirit_asset ? `<span class="pub-spirit" title="Spirit asset">${esc(p.spirit_asset)}</span>` : ""}
        </div>
        <h2 class="pub-name">${esc(p.display_name)}</h2>
        ${p.tagline ? `<p class="pub-tagline">${esc(p.tagline)}</p>` : `<p class="pub-tagline muted">No tagline yet</p>`}
        ${meta ? `<div class="pub-meta muted small">${meta}</div>` : ""}
        ${p.about ? `<p class="pub-about">${esc(p.about)}</p>` : ""}
        ${p.show_balance && p.total_value != null ? `
          <div class="pub-stat"><span class="muted small">Total balance</span><strong>${usd0.format(+p.total_value)}</strong></div>` : ""}
        ${p.show_holdings ? `
          <div class="pub-section-label muted small">Holdings</div>
          ${holdings.length ? `<div class="pub-holdings">${holdings.map((h) => `
            <div class="pub-holding" style="--c:${colorOf(h.asset_class)}" title="${esc(h.name)}">
              <span class="pub-holding-pic" aria-hidden="true">${h.image ? `<img src="${esc(h.image)}" alt="" />` : esc(h.picture || "📦")}</span>
              <span class="pub-holding-name">${esc(h.name || h.symbol)}</span>
              <span class="muted small">${num.format(+h.shares)} ${esc(h.unit || "")}</span>
            </div>`).join("")}</div>` : `<p class="muted small">Nothing in the vault yet.</p>`}` : ""}
        ${!p.show_balance && !p.show_holdings ? `<p class="muted small pub-private">🔒 Balance and holdings are private.</p>` : ""}
      </article>`;
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
      P.email = session.user.email;
      renderNav(P);
      refreshNotices(session.user.id);
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

  window.UI = { db, configured, start, loadPortfolio, refreshNotices, openInvite, push, notifyRecipients, signOut, renderPublicProfile, wireThemeToggle, showTip, hideTip, classes, colorOf, esc };
})();
