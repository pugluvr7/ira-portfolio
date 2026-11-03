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
          ${PAGES.map(([href, label]) => `<a href="${href}"${href === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        </div>
        <div class="nav-user">
          <span class="user-chip" title="Signed in"><span class="user-avatar" aria-hidden="true">${esc((P.holder || "?").slice(0, 1).toUpperCase())}</span>${esc(P.holder)}</span>
          <button id="sign-out" class="pill-btn" type="button">Sign out</button>
          <button id="theme-toggle" class="pill-btn" type="button" aria-label="Toggle dark mode"></button>
        </div>
      </div>`;
    $("sign-out").addEventListener("click", async () => {
      await db.auth.signOut();
      location.href = "login.html";
    });
    wireThemeToggle();
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

  window.UI = { db, configured, start, loadPortfolio, wireThemeToggle, showTip, hideTip, classes, colorOf, esc };
})();
