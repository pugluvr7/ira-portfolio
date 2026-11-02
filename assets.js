(function () {
  const P = window.PORTFOLIO;
  const { showTip, hideTip, classes, colorOf } = window.UI;
  const $ = (id) => document.getElementById(id);

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const pct = (n, d = 1) => `${n.toFixed(d)}%`;
  const signed = (n, fmt) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

  const holdings = P.holdings.map((h) => {
    const value = h.shares * h.price;
    return { ...h, value, gain: value - h.costBasis, gainPct: ((value - h.costBasis) / h.costBasis) * 100 };
  });
  const total = holdings.reduce((s, h) => s + h.value, 0);
  holdings.forEach((h) => (h.weight = (h.value / total) * 100));

  const groups = classes.map((cls) => {
    const items = holdings.filter((h) => h.assetClass === cls).sort((a, b) => b.value - a.value);
    const value = items.reduce((s, h) => s + h.value, 0);
    return { cls, items, value, weight: (value / total) * 100 };
  });

  // A real photo (`image`) wins over the emoji `picture`.
  const pictureHTML = (h, cls = "") => h.image
    ? `<img class="${cls}" src="${h.image}" alt="${h.name}" />`
    : `<span class="${cls}" role="img" aria-label="${h.name}">${h.picture || "📦"}</span>`;

  $("page-sub").textContent = `All ${usd0.format(total)} of Wendy's retirement, shown as the actual stuff it's made of.`;

  // ---------- class strip ----------
  $("class-strip").innerHTML = groups.map((g) => `
    <div class="class-chip" style="--c:${colorOf(g.cls)}">
      <span class="class-chip-pics" aria-hidden="true">${g.items.map((h) => h.image ? "" : h.picture).join("")}</span>
      <span class="class-chip-name"><i class="dot" style="background:${colorOf(g.cls)}"></i>${g.cls}</span>
      <span class="class-chip-value">${usd0.format(g.value)}</span>
      <span class="class-chip-pct">${pct(g.weight)}</span>
    </div>`).join("");

  // ---------- vault: unit chart, one tile per ~$X ----------
  const TILE = niceTile(total / 160); // aim for ~160 tiles total
  $("vault-scale").textContent = `Each tile ≈ ${usd0.format(TILE)}. Holdings smaller than one tile still get one, out of respect.`;
  const vault = $("vault");
  groups.forEach((g) => {
    const row = document.createElement("div");
    row.className = "vault-row";
    row.style.setProperty("--c", colorOf(g.cls));
    row.innerHTML = `<div class="vault-label"><span class="vault-cls">${g.cls}</span><span class="muted small">${usd0.format(g.value)}</span></div>`;
    const tiles = document.createElement("div");
    tiles.className = "vault-tiles";
    g.items.forEach((h) => {
      const n = Math.max(1, Math.round(h.value / TILE));
      for (let i = 0; i < n; i++) {
        const t = document.createElement("span");
        t.className = "vault-tile";
        t.innerHTML = h.image ? `<img src="${h.image}" alt="" />` : h.picture;
        t.dataset.symbol = h.symbol;
        tiles.append(t);
      }
    });
    tiles.addEventListener("mousemove", (e) => {
      const t = e.target.closest(".vault-tile");
      if (!t) return hideTip();
      const h = holdings.find((x) => x.symbol === t.dataset.symbol);
      tiles.querySelectorAll(".vault-tile").forEach((x) => x.classList.toggle("dim", x.dataset.symbol !== h.symbol));
      showTip(e, `${h.picture || ""} ${h.name}`, [
        ["Value", usd0.format(h.value)],
        ["Quantity", `${num.format(h.shares)} ${h.unit || "units"}`],
        ["Tiles", String(Math.max(1, Math.round(h.value / TILE)))],
      ]);
    });
    tiles.addEventListener("mouseleave", () => {
      tiles.querySelectorAll(".vault-tile").forEach((x) => x.classList.remove("dim"));
      hideTip();
    });
    row.append(tiles);
    vault.append(row);
  });

  // ---------- gallery ----------
  $("gallery").innerHTML = groups.map((g) => `
    <section class="gallery-group" style="--c:${colorOf(g.cls)}" aria-label="${g.cls}">
      <div class="gallery-head">
        <h2><i class="dot" style="background:${colorOf(g.cls)}"></i>${g.cls}</h2>
        <span class="muted small">${g.items.length} holding${g.items.length === 1 ? "" : "s"} · ${usd0.format(g.value)} · ${pct(g.weight)} of portfolio</span>
      </div>
      <div class="gallery-grid">
        ${g.items.map((h) => `
          <article class="asset-card">
            <div class="asset-pic">
              ${pictureHTML(h, "asset-pic-img")}
              <span class="asset-qty">× ${num.format(h.shares)}</span>
            </div>
            <div class="asset-body">
              <div class="asset-top">
                <span class="asset-symbol">${h.symbol}</span>
                <span class="asset-day ${h.dayChangePct > 0 ? "up" : h.dayChangePct < 0 ? "down" : "muted"}">${h.dayChangePct > 0 ? "▲" : h.dayChangePct < 0 ? "▼" : "•"} ${signed(h.dayChangePct, (n) => pct(n, 2))}</span>
              </div>
              <h3 class="asset-name">${h.name}</h3>
              <p class="asset-note">“${h.note || ""}”</p>
              <dl class="asset-stats">
                <div><dt>Value</dt><dd>${usd.format(h.value)}</dd></div>
                <div><dt>Quantity</dt><dd>${num.format(h.shares)} ${h.unit || ""}</dd></div>
                <div><dt>Gain</dt><dd class="${h.gain >= 0 ? "up" : "down"}">${signed(h.gain, usd0.format)} (${signed(h.gainPct, pct)})</dd></div>
              </dl>
              <div class="asset-weight" title="${pct(h.weight)} of portfolio">
                <div class="asset-weight-fill" style="width:${Math.max(1, h.weight)}%"></div>
              </div>
              <span class="muted small">${pct(h.weight)} of portfolio</span>
            </div>
          </article>`).join("")}
      </div>
    </section>`).join("");

  function niceTile(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw);
  }
})();
