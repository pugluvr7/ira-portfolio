(function () {
  const { start, db, loadPortfolio, refreshTransferNotice, openInvite, colorOf, esc } = window.UI;
  const $ = (id) => document.getElementById(id);

  const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
  const say = (el, text, kind = "success") => { el.textContent = text; el.dataset.kind = kind; };
  const when = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const STATUS = {
    pending: "Pending", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled", failed: "Couldn't complete",
  };

  start(async (P, { user }) => {
    let holdings = P.holdings;
    let transfers = [];

    async function load() {
      const [portfolio, res] = await Promise.all([
        loadPortfolio(user.id),
        db.from("transfers").select("*").order("created_at", { ascending: false }),
      ]);
      if (res.error) {
        throw new Error(/transfers/.test(res.error.message)
          ? "Transfers aren't set up in the database yet — run supabase/transfers.sql in the Supabase SQL editor."
          : res.error.message);
      }
      holdings = portfolio.holdings;
      transfers = res.data;
    }
    async function reload() {
      await load();
      render();
      refreshTransferNotice(user.id);
    }

    const pendingOut = (holdingId) => transfers
      .filter((t) => t.status === "pending" && t.sender_id === user.id && t.holding_id === holdingId)
      .reduce((s, t) => s + +t.quantity, 0);
    const available = (h) => Math.max(0, h.shares - pendingOut(h.id));

    // ---------- send form ----------
    const form = $("send-form");
    const f = form.elements;
    const preselect = new URLSearchParams(location.search).get("holding");

    function renderSendOptions() {
      const current = f.holding.value || preselect;
      f.holding.innerHTML = holdings.length
        ? holdings.map((h) => {
            const avail = available(h);
            return `<option value="${h.id}"${avail <= 0 ? " disabled" : ""}${String(h.id) === current ? " selected" : ""}>
              ${esc(h.picture)} ${esc(h.symbol)} — ${num.format(avail)} ${esc(h.unit || "units")} available</option>`;
          }).join("")
        : `<option value="" disabled selected>You don't have any holdings to send</option>`;
      updatePreview();
    }
    function selected() { return holdings.find((h) => String(h.id) === f.holding.value); }
    function updatePreview() {
      const h = selected();
      const preview = $("send-preview");
      if (!h) return (preview.textContent = "");
      const avail = available(h);
      f.quantity.max = avail;
      const q = +f.quantity.value || 0;
      preview.textContent = q > 0
        ? `≈ ${usd0.format(q * h.price)} of ${h.name}. You'd keep ${num.format(Math.max(0, h.shares - q))} ${h.unit || "units"}.`
        : `${num.format(avail)} ${h.unit || "units"} available to send.`;
    }
    form.addEventListener("input", updatePreview);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("send-msg");
      const h = selected();
      const email = f.email.value.trim();
      const q = +f.quantity.value;
      if (!email) return say(msg, "Enter the recipient's email.", "error");
      if (email.toLowerCase() === (user.email || "").toLowerCase()) return say(msg, "You can't send assets to yourself.", "error");
      if (!h) return say(msg, "Pick a holding to send.", "error");
      if (!(q > 0)) return say(msg, "Quantity must be more than 0.", "error");
      if (q > available(h)) return say(msg, `You only have ${num.format(available(h))} ${h.unit || "units"} available.`, "error");

      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      say(msg, "Sending…", "info");
      const { error } = await db.rpc("create_transfer", {
        p_recipient_email: email, p_holding_id: h.id, p_quantity: q, p_message: f.message.value.trim(),
      });
      btn.disabled = false;
      if (error) {
        say(msg, error.message, "error");
        if (/No account found/i.test(error.message)) {
          const invite = document.createElement("button");
          invite.type = "button";
          invite.className = "link-btn";
          invite.textContent = "Invite them →";
          invite.addEventListener("click", () => openInvite({ from: P.holder, to: email }));
          msg.append(" ", invite);
        }
        return;
      }
      form.reset();
      await reload();
      say(msg, "Request sent ✓ They'll see it next time they open the site.");
    });

    // ---------- lists ----------
    function transferCard(t, actions) {
      const incoming = t.recipient_id === user.id;
      const who = incoming ? `<strong>${esc(t.sender_name)}</strong> → you` : `You → <strong>${esc(t.recipient_name)}</strong>`;
      return `
        <article class="transfer-card" style="--c:${colorOf(t.asset_class)}">
          <span class="transfer-pic" aria-hidden="true">${esc(t.picture || "📦")}</span>
          <div class="transfer-body">
            <div class="transfer-who">${who}</div>
            <div class="transfer-what">${num.format(t.quantity)} ${esc(t.unit || "units")} of ${esc(t.name || t.symbol)}
              <span class="muted">· ≈ ${usd0.format(t.quantity * t.price)}</span></div>
            ${t.message ? `<p class="transfer-note">“${esc(t.message)}”</p>` : ""}
            ${t.failure_reason ? `<p class="transfer-note down">${esc(t.failure_reason)}</p>` : ""}
            <div class="muted small">${when(t.created_at)}${t.responded_at && t.status !== "pending" ? ` · ${STATUS[t.status].toLowerCase()} ${when(t.responded_at)}` : ""}</div>
          </div>
          <div class="transfer-actions">${actions}</div>
        </article>`;
    }
    const empty = (text) => `<p class="muted small transfer-empty">${text}</p>`;

    function render() {
      const incoming = transfers.filter((t) => t.status === "pending" && t.recipient_id === user.id);
      const outgoing = transfers.filter((t) => t.status === "pending" && t.sender_id === user.id);
      const history = transfers.filter((t) => t.status !== "pending");

      $("incoming-count").textContent = incoming.length ? `${incoming.length} new` : "";
      $("incoming-count").hidden = !incoming.length;
      $("incoming").innerHTML = incoming.length
        ? incoming.map((t) => transferCard(t, `
            <button class="ghost-btn danger" data-action="decline" data-id="${t.id}" type="button">Decline</button>
            <button class="primary-btn" data-action="accept" data-id="${t.id}" type="button">Accept</button>`)).join("")
        : empty("Nothing waiting. When someone sends you assets, they'll show up here.");
      $("outgoing").innerHTML = outgoing.length
        ? outgoing.map((t) => transferCard(t, `<button class="ghost-btn" data-action="cancel" data-id="${t.id}" type="button">Cancel</button>`)).join("")
        : empty("No pending requests.");
      $("history").innerHTML = history.length
        ? history.map((t) => transferCard(t, `<span class="status-pill status-${t.status}">${STATUS[t.status]}</span>`)).join("")
        : empty("No completed transfers yet.");
      renderSendOptions();
    }

    document.querySelector("main").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = +btn.dataset.id;
      const t = transfers.find((x) => x.id === id);
      const action = btn.dataset.action;
      if (action === "cancel" && !confirm(`Cancel sending ${num.format(t.quantity)} ${t.unit || "units"} of ${t.name} to ${t.recipient_name}?`)) return;
      btn.closest(".transfer-actions").querySelectorAll("button").forEach((b) => (b.disabled = true));
      const { data, error } = action === "cancel"
        ? await db.rpc("cancel_transfer", { p_transfer_id: id })
        : await db.rpc("respond_transfer", { p_transfer_id: id, p_accept: action === "accept" });
      if (error) alert(error.message);
      else if (data === "failed") alert("That transfer couldn't go through — the sender no longer has enough. It's been moved to History.");
      await reload();
    });

    await load();
    render();
  });
})();
