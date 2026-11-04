(function () {
  const { start, db, loadPortfolio, push, signOut, classes, colorOf, esc } = window.UI;
  const $ = (id) => document.getElementById(id);

  const say = (el, text, kind = "success") => {
    el.textContent = text;
    el.dataset.kind = kind;
    if (kind === "success") setTimeout(() => el.textContent === text && (el.textContent = ""), 2500);
  };

  start(async (P, { user }) => {
    let state = P;

    // ---------- profile header ----------
    const since = new Date(P.profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const renderHero = (name) => {
      $("profile-avatar").textContent = (name || "?").slice(0, 1).toUpperCase();
      $("profile-name").textContent = name;
    };
    renderHero(P.holder);
    $("profile-meta").textContent = `${user.email} · Member since ${since}`;
    $("signout-text").textContent = `Signed in as ${user.email}. Signing out also turns off notifications on this device.`;
    $("settings-sign-out").addEventListener("click", signOut);
    // jump to #portfolio / #settings when arriving from the profile menu
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    const refresh = async () => { state = await loadPortfolio(user.id); renderHoldings(); };

    // ---------- account ----------
    const pf = $("profile-form");
    for (const [k, v] of Object.entries(state.profile)) if (pf.elements[k]) pf.elements[k].value = v;
    pf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("profile-msg");
      const f = pf.elements;
      if (!f.display_name.value.trim()) return say(msg, "Your name can't be empty.", "error");
      const nums = ["contribution_limit", "contributed_ytd", "lifetime_contributions"];
      if (nums.some((k) => !(+f[k].value >= 0))) return say(msg, "Amounts must be 0 or more.", "error");
      const { error } = await db.from("profiles").update({
        display_name: f.display_name.value.trim(),
        account_name: f.account_name.value.trim() || "Roth IRA",
        custodian: f.custodian.value.trim() || "Brokerage",
        ...Object.fromEntries(nums.map((k) => [k, +f[k].value])),
      }).eq("id", user.id);
      if (error) return say(msg, error.message, "error");
      say(msg, "Saved ✓");
      document.querySelector(".brand-name").textContent = f.account_name.value.trim() || "Roth IRA";
      document.querySelectorAll(".profile-chip-name, .profile-dropdown-head .person-name").forEach((n) => (n.textContent = f.display_name.value.trim()));
      document.querySelector("#profile-btn .user-avatar").textContent = f.display_name.value.trim().slice(0, 1).toUpperCase();
      renderHero(f.display_name.value.trim());
    });

    // ---------- targets ----------
    const tf = $("targets-form");
    tf.innerHTML = classes.map((cls) => `
      <label class="target-row">
        <span><i class="dot" style="background:${colorOf(cls)}"></i>${cls}</span>
        <span class="target-input"><input type="number" min="0" max="100" step="1" name="${cls}" value="${+state.targets[cls] || 0}" />%</span>
      </label>`).join("") + `
      <div class="form-actions">
        <span class="form-msg" id="targets-msg" role="status"></span>
        <button class="primary-btn" type="submit">Save targets</button>
      </div>`;
    const sumTargets = () => classes.reduce((s, cls) => s + (+tf.elements[cls].value || 0), 0);
    const syncSum = () => {
      const sum = sumTargets();
      const badge = $("targets-sum");
      badge.textContent = `${sum}% of 100%`;
      badge.classList.toggle("badge-warn", sum !== 100);
    };
    tf.addEventListener("input", syncSum);
    syncSum();
    tf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("targets-msg");
      if (sumTargets() !== 100) return say(msg, "Targets need to add up to 100%.", "error");
      const targets = Object.fromEntries(classes.map((cls) => [cls, +tf.elements[cls].value || 0]));
      const { error } = await db.from("profiles").update({ targets }).eq("id", user.id);
      if (error) return say(msg, error.message, "error");
      say(msg, "Saved ✓");
    });

    // ---------- notifications (this device) ----------
    const TEXT = {
      unsupported: "This browser can't do push notifications. Try Chrome, Edge, Firefox or Safari on a phone or computer.",
      "needs-home-screen": "On iPhone and iPad, notifications only work once the site is on your Home Screen: tap Share → Add to Home Screen, then open IRA from there and come back to this page.",
      blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
      off: "Get an alert on this device when someone sends you a transfer or a friend request.",
      on: "On for this device ✓ You'll get an alert for new transfers and friend requests.",
    };
    async function renderNotify() {
      const state = await push.status();
      $("notify-text").textContent = TEXT[state];
      $("notify-actions").innerHTML =
        state === "off" ? `<button class="primary-btn" data-push="enable" type="button">Turn on notifications</button>`
        : state === "on" ? `<button class="pill-btn" data-push="test" type="button">Send a test</button>
                            <button class="ghost-btn" data-push="disable" type="button">Turn off</button>`
        : "";
    }
    $("notify-actions").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-push]");
      if (!btn) return;
      const msg = $("notify-msg");
      btn.disabled = true;
      try {
        if (btn.dataset.push === "enable") { await push.enable(); say(msg, "Notifications turned on ✓"); }
        if (btn.dataset.push === "disable") { await push.disable(); say(msg, "Turned off for this device."); }
        if (btn.dataset.push === "test") { await push.test(); say(msg, "Test sent — it should pop up in a few seconds."); }
      } catch (err) {
        say(msg, err.message || String(err), "error");
      }
      btn.disabled = false;
      renderNotify();
    });
    renderNotify();

    // ---------- holdings ----------
    const list = $("holding-list");
    function holdingForm(h) {
      const isNew = h.id == null;
      return `
        <form class="holding-form${isNew ? " is-new" : ""}" data-id="${isNew ? "" : h.id}" style="--c:${colorOf(h.assetClass)}" novalidate>
          <label class="field a-pic"><span>Picture</span><input name="picture" type="text" maxlength="8" value="${esc(h.picture)}" placeholder="🦞" /></label>
          <label class="field a-sym"><span>Symbol</span><input name="symbol" type="text" maxlength="8" required value="${esc(h.symbol)}" placeholder="LOBS" /></label>
          <label class="field a-name"><span>Name</span><input name="name" type="text" maxlength="80" value="${esc(h.name)}" placeholder="Live Maine Lobsters" /></label>
          <label class="field a-class"><span>Asset class</span>
            <select name="asset_class">${classes.map((c) => `<option${c === h.assetClass ? " selected" : ""}>${c}</option>`).join("")}</select>
          </label>
          <label class="field a-qty"><span>Quantity</span><input name="shares" type="number" min="0" step="any" value="${h.shares ?? ""}" /></label>
          <label class="field a-unit"><span>Unit</span><input name="unit" type="text" maxlength="20" value="${esc(h.unit)}" placeholder="lobsters" /></label>
          <label class="field a-price"><span>Price each</span><input name="price" type="number" min="0" step="any" value="${h.price ?? ""}" /></label>
          <label class="field a-cost"><span>Total cost basis</span><input name="cost_basis" type="number" min="0" step="any" value="${h.costBasis ?? ""}" /></label>
          <label class="field a-day"><span>Today's change %</span><input name="day_change_pct" type="number" step="any" value="${h.dayChangePct ?? 0}" /></label>
          <label class="field a-note"><span>Caption</span><input name="note" type="text" maxlength="120" value="${esc(h.note)}" placeholder="Two escaped." /></label>
          <label class="field a-img"><span>Photo URL (optional)</span><input name="image" type="url" maxlength="500" value="${esc(h.image)}" placeholder="https://…" /></label>
          <div class="form-actions a-acts">
            <span class="form-msg" role="status"></span>
            <button class="ghost-btn danger" type="button" data-action="delete">${isNew ? "Cancel" : "Delete"}</button>
            <button class="primary-btn" type="submit">${isNew ? "Add" : "Save"}</button>
          </div>
        </form>`;
    }
    function renderHoldings() {
      const n = state.holdings.length;
      $("holdings-count").textContent = n ? `${n} holding${n === 1 ? "" : "s"}` : "No holdings yet — add your first one.";
      list.innerHTML = state.holdings.map(holdingForm).join("");
    }
    renderHoldings();

    $("add-holding").addEventListener("click", () => {
      list.insertAdjacentHTML("afterbegin", holdingForm({ id: null, assetClass: classes[0], picture: "", symbol: "", name: "", unit: "", note: "", image: "" }));
      list.querySelector(".holding-form input[name=symbol]").focus();
    });

    list.addEventListener("change", (e) => {
      if (e.target.name === "asset_class") e.target.form.style.setProperty("--c", colorOf(e.target.value));
    });

    list.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const msg = form.querySelector(".form-msg");
      const f = form.elements;
      const row = {
        symbol: f.symbol.value.trim().toUpperCase(),
        name: f.name.value.trim(),
        asset_class: f.asset_class.value,
        shares: +f.shares.value || 0,
        price: +f.price.value || 0,
        cost_basis: +f.cost_basis.value || 0,
        day_change_pct: +f.day_change_pct.value || 0,
        picture: f.picture.value.trim(),
        unit: f.unit.value.trim(),
        note: f.note.value.trim(),
        image: f.image.value.trim(),
      };
      if (!row.symbol) return say(msg, "Symbol is required.", "error");
      if (row.shares < 0 || row.price < 0 || row.cost_basis < 0) return say(msg, "Quantity, price and cost can't be negative.", "error");
      if (row.image && !/^https?:\/\//i.test(row.image)) return say(msg, "Photo URL should start with https://", "error");
      const id = form.dataset.id;
      const { error } = id
        ? await db.from("holdings").update(row).eq("id", id)
        : await db.from("holdings").insert(row);
      if (error) return say(msg, error.message, "error");
      await refresh();
      if (id) say(list.querySelector(`.holding-form[data-id="${id}"] .form-msg`), "Saved ✓");
    });

    list.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action=delete]");
      if (!btn) return;
      const form = btn.closest(".holding-form");
      if (!form.dataset.id) return form.remove();
      const symbol = form.elements.symbol.value || "this holding";
      if (!confirm(`Delete ${symbol}? This can't be undone.`)) return;
      const { error } = await db.from("holdings").delete().eq("id", form.dataset.id);
      if (error) return say(form.querySelector(".form-msg"), error.message, "error");
      await refresh();
    });
  });
})();
