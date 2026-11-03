(function () {
  const { start, showTip, hideTip, classes, colorOf, esc } = window.UI;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const usdK = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}k` : usd0.format(n));
  const pct = (n, d = 1) => `${n.toFixed(d)}%`;
  const signed = (n, fmt) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  const ratio = (a, b) => (b ? a / b : 0);

  start((P) => {
    $("holder-name").textContent = P.holder;

    // ---------- derived numbers ----------
    const holdings = P.holdings.map((h) => {
      const value = h.shares * h.price;
      return { ...h, value, gain: value - h.costBasis, gainPct: ratio(value - h.costBasis, h.costBasis) * 100 };
    });
    const total = holdings.reduce((s, h) => s + h.value, 0);
    const cost = holdings.reduce((s, h) => s + h.costBasis, 0);
    const dayChange = holdings.reduce((s, h) => s + (h.value * h.dayChangePct) / (100 + h.dayChangePct), 0);
    holdings.forEach((h) => (h.weight = ratio(h.value, total) * 100));


    // ---------- header + tiles ----------
    function renderSummary() {

      $("total-value").textContent = usd.format(total);
      const dc = $("day-change");
      dc.textContent = `${dayChange >= 0 ? "▲" : "▼"} ${signed(dayChange, usd.format)} (${signed(ratio(dayChange, total - dayChange) * 100, (n) => pct(n, 2))}) today`;
      dc.className = "chip " + (dayChange >= 0 ? "up" : "down");

      const gain = total - cost;
      const g = $("total-gain");
      g.textContent = `${signed(gain, usd0.format)} (${signed(ratio(gain, cost) * 100, pct)})`;
      g.className = gain >= 0 ? "up" : "down";
      $("cost-basis").textContent = usd0.format(cost);

      const c = P.contributions;
      const frac = Math.min(1, ratio(c.contributedYTD, c.limit));
      $("contrib-label").textContent = `${c.year} contributions`;
      $("contrib-value").innerHTML = `${usd0.format(c.contributedYTD)} <span class="of">of ${usd0.format(c.limit)}</span>`;
      $("contrib-pct").textContent = `${Math.round(frac * 100)}%`;
      $("contrib-fill").style.width = `${frac * 100}%`;
      const bar = $("contrib-bar");
      bar.setAttribute("aria-valuemax", c.limit);
      bar.setAttribute("aria-valuenow", c.contributedYTD);
      const left = Math.max(0, c.limit - c.contributedYTD);
      $("contrib-remaining").textContent = left > 0 ? `${usd0.format(left)} left to contribute` : "Maxed out for the year ✓";
    }

    // ---------- history (simulated from sample data) ----------
    function buildHistory() {
      const end = new Date(P.account.asOf + "T00:00");
      const startYear = 2021;
      const c = P.contributions;
      // With no contribution history entered, fall back to cost basis so the chart still has a shape.
      const lifetime = Math.max(c.lifetime, c.contributedYTD) || cost || total;
      const priorYears = c.year - startYear;
      const perYear = (lifetime - c.contributedYTD) / priorYears;
      const ytdMonths = end.getMonth(); // spread YTD across months already elapsed
      let seed = 42;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const gauss = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());

      const pts = [];
      let value = 0, contributed = 0;
      for (let d = new Date(startYear, 0, 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        let add = 0;
        if (d.getFullYear() < c.year && d.getMonth() === 0) add = perYear;
        if (d.getFullYear() === c.year && d.getMonth() < ytdMonths) add = c.contributedYTD / ytdMonths;
        value = value * (1 + 0.006 + 0.035 * gauss()) + add;
        contributed += add;
        pts.push({ date: d, value, contributed });
      }
      // nudge the simulated path so it lands exactly on today's real total
      const n = pts.length - 1;
      const k = pts[n].value > 0 ? total / pts[n].value : 1;
      pts.forEach((p, i) => (p.value *= Math.pow(k, i / n)));
      pts.push({ date: end, value: total, contributed: lifetime });
      return pts;
    }

    renderSummary();
    if (!holdings.length) {
      $("empty-state").hidden = false;
      $("perf-card").hidden = true;
      $("detail-grid").hidden = true;
      return;
    }
    const history = buildHistory();

    // ---------- line chart ----------
    let range = 0;
    function renderPerf() {
      const data = range ? history.slice(-range - 1) : history;
      const W = 800, H = 280, m = { t: 12, r: 70, b: 28, l: 52 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const t0 = +data[0].date, t1 = +data[data.length - 1].date;
      const maxY = Math.max(...data.map((d) => Math.max(d.value, d.contributed)));
      const step = niceStep(maxY / 4);
      const yMax = Math.ceil(maxY / step) * step;
      const x = (d) => m.l + ((+d - t0) / (t1 - t0)) * iw;
      const y = (v) => m.t + ih - (v / yMax) * ih;

      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Account value over time" });
      for (let v = 0; v <= yMax; v += step) {
        svg.append(el("line", { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: v === 0 ? "baseline" : "gridline" }));
        svg.append(el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", class: "axis-label" }, usdK(v)));
      }
      const years = [...new Set(data.map((d) => d.date.getFullYear()))];
      const ticks = range && range <= 12
        ? data.filter((d, i) => i % 3 === 0).map((d) => [d.date, d.date.toLocaleDateString("en-US", { month: "short" })])
        : years.map((yr) => [new Date(yr, 0, 1), String(yr)]).filter(([d]) => +d >= t0);
      ticks.forEach(([d, label]) => svg.append(el("text", { x: x(d), y: H - 8, "text-anchor": "middle", class: "axis-label" }, label)));

      const path = (key) => data.map((d, i) => `${i ? "L" : "M"}${x(d.date).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");
      const defs = el("defs", {});
      const grad = el("linearGradient", { id: "value-fill", x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.append(el("stop", { offset: "0%", "stop-color": "var(--s1)", "stop-opacity": 0.22 }));
      grad.append(el("stop", { offset: "100%", "stop-color": "var(--s1)", "stop-opacity": 0 }));
      defs.append(grad);
      svg.append(defs);
      const baseY = y(0).toFixed(1);
      svg.append(el("path", { d: `${path("value")}L${x(data[data.length - 1].date).toFixed(1)},${baseY}L${x(data[0].date).toFixed(1)},${baseY}Z`, fill: "url(#value-fill)" }));
      svg.append(el("path", { d: path("contributed"), fill: "none", stroke: "var(--s3)", "stroke-width": 2, "stroke-dasharray": "4 3" }));
      svg.append(el("path", { d: path("value"), fill: "none", stroke: "var(--s1)", "stroke-width": 2, "stroke-linejoin": "round" }));

      const last = data[data.length - 1];
      svg.append(el("text", { x: x(last.date) + 8, y: y(last.value) + 4, class: "direct-label" }, usdK(last.value)));
      svg.append(el("text", { x: x(last.date) + 8, y: Math.max(y(last.contributed) + 4, y(last.value) + 20), class: "axis-label" }, usdK(last.contributed)));

      // hover layer: crosshair + tooltip
      const cross = el("line", { y1: m.t, y2: m.t + ih, class: "baseline", visibility: "hidden" });
      const dot = el("circle", { r: 4, fill: "var(--s1)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" });
      const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
      svg.append(cross, dot, hit);
      hit.addEventListener("mousemove", (e) => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const t = t0 + ((px - m.l) / iw) * (t1 - t0);
        const d = data.reduce((a, b) => (Math.abs(+b.date - t) < Math.abs(+a.date - t) ? b : a));
        cross.setAttribute("x1", x(d.date)); cross.setAttribute("x2", x(d.date));
        dot.setAttribute("cx", x(d.date)); dot.setAttribute("cy", y(d.value));
        cross.setAttribute("visibility", "visible"); dot.setAttribute("visibility", "visible");
        showTip(e, d.date.toLocaleDateString("en-US", { month: "short", year: "numeric" }), [
          ["Value", usd0.format(d.value)],
          ["Contributed", usd0.format(d.contributed)],
          ["Growth", signed(d.value - d.contributed, usd0.format)],
        ]);
      });
      hit.addEventListener("mouseleave", () => {
        cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip();
      });

      $("perf-chart").replaceChildren(svg);
      $("perf-legend").innerHTML =
        `<span><i class="swatch" style="background:var(--s1)"></i>Account value</span>` +
        `<span><i class="swatch dashed"></i>Total contributed</span>`;
    }

    // ---------- allocation donut ----------
    function renderAllocation() {
      const byClass = classes.map((cls) => {
        const value = holdings.filter((h) => h.assetClass === cls).reduce((s, h) => s + h.value, 0);
        return { cls, value, actual: ratio(value, total) * 100, target: +P.targets[cls] || 0 };
      });
      const S = 200, R = 96, r = 66, cx = S / 2, cy = S / 2;
      const svg = el("svg", { viewBox: `0 0 ${S} ${S}`, role: "img", "aria-label": "Allocation by asset class" });
      let a0 = -Math.PI / 2;
      byClass.forEach((c) => {
        const a1 = a0 + (c.value / total) * Math.PI * 2;
        const seg = el("path", { d: arc(cx, cy, R, r, a0, a1), fill: colorOf(c.cls), stroke: "var(--surface)", "stroke-width": 2 });
        seg.addEventListener("mousemove", (e) => showTip(e, c.cls, [["Value", usd0.format(c.value)], ["Actual", pct(c.actual)], ["Target", pct(c.target, 0)]]));
        seg.addEventListener("mouseleave", hideTip);
        svg.append(seg);
        a0 = a1;
      });
      svg.append(el("text", { x: cx, y: cy + 2, "text-anchor": "middle", class: "donut-center-value" }, usdK(total)));
      svg.append(el("text", { x: cx, y: cy + 18, "text-anchor": "middle", class: "donut-center-label" }, `${classes.length} asset classes`));
      $("alloc-chart").replaceChildren(svg);

      $("alloc-table").querySelector("tbody").innerHTML = byClass.map((c) => {
        const drift = c.actual - c.target;
        return `<tr><td><i class="dot" style="background:${colorOf(c.cls)}"></i>${c.cls}</td>
          <td class="num">${pct(c.actual)}</td><td class="num">${pct(c.target, 0)}</td>
          <td class="num ${Math.abs(drift) >= 2 ? "drift-flag" : "muted"}">${signed(drift, pct)}</td></tr>`;
      }).join("");
    }

    // ---------- holdings table ----------
    let sortKey = "value", asc = false;
    function renderHoldings() {
      const rows = [...holdings].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        return asc ? cmp : -cmp;
      });
      $("holdings-table").querySelector("tbody").innerHTML = rows.map((h) => `
        <tr>
          <td><div class="sym-cell">
            <span class="sym-badge" style="--c:${colorOf(h.assetClass)}" title="${esc(h.assetClass)}">${esc(h.symbol.slice(0, 4))}</span>
            <div><span class="sym">${esc(h.symbol)}</span><span class="sym-name">${esc(h.name)}</span></div>
          </div></td>
          <td class="num">${usd.format(h.value)}<span class="sym-name">${h.shares} × ${usd.format(h.price)}</span></td>
          <td class="num">${pct(h.weight)}</td>
          <td class="num ${h.gain >= 0 ? "up" : "down"}">${signed(h.gain, usd0.format)}<span class="sym-name">${signed(h.gainPct, pct)}</span></td>
          <td class="num ${h.dayChangePct > 0 ? "up" : h.dayChangePct < 0 ? "down" : "muted"}">${signed(h.dayChangePct, (n) => pct(n, 2))}</td>
        </tr>`).join("");
      document.querySelectorAll("#holdings-table th[data-sort]").forEach((th) => {
        th.classList.toggle("sorted", th.dataset.sort === sortKey);
        th.classList.toggle("asc", th.dataset.sort === sortKey && asc);
      });
    }
    document.querySelectorAll("#holdings-table th[data-sort]").forEach((th) =>
      th.addEventListener("click", () => {
        if (sortKey === th.dataset.sort) asc = !asc;
        else { sortKey = th.dataset.sort; asc = sortKey === "symbol"; }
        renderHoldings();
      })
    );

    // ---------- controls ----------
    document.querySelectorAll("#range-buttons button").forEach((b) =>
      b.addEventListener("click", () => {
        range = +b.dataset.range;
        document.querySelectorAll("#range-buttons button").forEach((x) => x.classList.toggle("active", x === b));
        renderPerf();
      })
    );

    renderPerf();
    renderAllocation();
    renderHoldings();
  }); // start

  // ---------- helpers ----------
  function el(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw);
  }
  function arc(cx, cy, R, r, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
    return `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
  }
})();
