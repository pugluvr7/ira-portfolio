// Shared across pages: theme toggle, nav brand + active tab, tooltip.
(function () {
  const P = window.PORTFOLIO;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---------- theme ----------
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = localStorage.getItem("theme") || (isDark() ? "dark" : "light");
  const toggle = $("theme-toggle");
  const syncToggle = () => (toggle.textContent = isDark() ? "☀ Light" : "☾ Dark");
  toggle.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    syncToggle();
  });
  syncToggle();

  // ---------- nav ----------
  const a = P.account;
  $("account-name").textContent = a.name;
  $("account-meta").textContent = `${a.owner} · ${a.custodian} · as of ${new Date(a.asOf + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".tabs a").forEach((link) => {
    if (link.getAttribute("href") === page) link.setAttribute("aria-current", "page");
  });

  // ---------- tooltip ----------
  const tip = $("tooltip");
  function showTip(e, title, rows) {
    tip.innerHTML = `<div class="tt-title">${title}</div>` + rows.map(([k, v]) => `<div class="tt-row"><span class="muted">${k}</span><span>${v}</span></div>`).join("");
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - w - 8)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }
  function hideTip() { tip.hidden = true; }

  // ---------- asset class colors (fixed order from data.js targets) ----------
  const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5"];
  const classes = Object.keys(P.targets);
  const colorOf = (cls) => `var(${SERIES[classes.indexOf(cls)] || "--muted"})`;

  window.UI = { showTip, hideTip, classes, colorOf };
})();
