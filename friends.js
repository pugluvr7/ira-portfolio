(function () {
  const { start, db, refreshNotices, openInvite, esc } = window.UI;
  const $ = (id) => document.getElementById(id);
  const say = (el, text, kind = "success") => { el.textContent = text; el.dataset.kind = kind; };
  const when = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const initial = (name) => esc((name || "?").slice(0, 1).toUpperCase());

  start(async (P, { user }) => {
    let rows = [];

    async function load() {
      const { data, error } = await db.rpc("list_friends");
      if (error) {
        throw new Error(/list_friends/.test(error.message)
          ? "Friends aren't set up in the database yet — run supabase/friends.sql in the Supabase SQL editor."
          : error.message);
      }
      rows = data;
    }
    async function reload() {
      await load();
      render();
      refreshNotices(user.id);
    }

    function personRow(f, actions, sub) {
      return `
        <article class="person-row">
          <span class="person-avatar" aria-hidden="true">${initial(f.friend_name)}</span>
          <div class="person-body">
            <div class="person-name">${esc(f.friend_name)}</div>
            <div class="muted small">${esc(f.friend_email)} · ${sub}</div>
          </div>
          <div class="transfer-actions">${actions}</div>
        </article>`;
    }
    const empty = (text) => `<p class="muted small transfer-empty">${text}</p>`;

    function render() {
      const friends = rows.filter((f) => f.status === "accepted");
      const incoming = rows.filter((f) => f.status === "pending" && f.direction === "incoming");
      const outgoing = rows.filter((f) => f.status === "pending" && f.direction === "outgoing");

      $("requests-count").hidden = !incoming.length;
      $("requests-count").textContent = `${incoming.length} new`;
      $("requests").innerHTML = incoming.length
        ? incoming.map((f) => personRow(f, `
            <button class="ghost-btn danger" data-action="decline" data-id="${f.friendship_id}" type="button">Decline</button>
            <button class="primary-btn" data-action="accept" data-id="${f.friendship_id}" type="button">Accept</button>`,
            `asked ${when(f.since)}`)).join("")
        : empty("No requests right now.");

      $("friends-count").textContent = friends.length ? `${friends.length} friend${friends.length === 1 ? "" : "s"}` : "";
      $("friends").innerHTML = friends.length
        ? friends.map((f) => `
            <article class="friend-card">
              <span class="person-avatar big" aria-hidden="true">${initial(f.friend_name)}</span>
              <div class="person-name">${esc(f.friend_name)}</div>
              <div class="muted small">${esc(f.friend_email)}</div>
              <div class="muted small">Friends since ${when(f.since)}</div>
              <div class="friend-actions">
                <a class="primary-btn" href="transfers.html?to=${encodeURIComponent(f.friend_id)}">Send assets →</a>
                <button class="ghost-btn danger" data-action="remove" data-id="${f.friendship_id}" type="button">Remove</button>
              </div>
            </article>`).join("")
        : empty("No friends yet. Add someone by email, or invite them if they don't have an account.");

      $("sent").innerHTML = outgoing.length
        ? outgoing.map((f) => personRow(f, `<button class="ghost-btn" data-action="cancel" data-id="${f.friendship_id}" type="button">Cancel</button>`,
            `sent ${when(f.since)}`)).join("")
        : empty("No pending requests.");
    }

    // ---------- add a friend ----------
    const form = $("add-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("add-msg");
      const email = form.elements.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say(msg, "Enter their account email.", "error");
      if (email.toLowerCase() === (user.email || "").toLowerCase()) return say(msg, "You can't add yourself as a friend.", "error");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      say(msg, "Sending…", "info");
      const { data, error } = await db.rpc("send_friend_request", { p_email: email });
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
      say(msg, data === "accepted" ? "They'd already asked — you're friends now ✓" : "Request sent ✓");
    });

    // ---------- accept / decline / cancel / remove ----------
    document.querySelector("main").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = +btn.dataset.id;
      const f = rows.find((x) => x.friendship_id === id);
      const action = btn.dataset.action;
      if (action === "remove" && !confirm(`Remove ${f.friend_name} from your friends?`)) return;
      btn.disabled = true;
      const { error } = action === "accept" || action === "decline"
        ? await db.rpc("respond_friend_request", { p_friendship_id: id, p_accept: action === "accept" })
        : await db.rpc("remove_friend", { p_friendship_id: id });
      if (error) alert(error.message);
      await reload();
    });

    await load();
    render();
  });
})();
