(function () {
  const { start, db, renderPublicProfile, esc } = window.UI;
  const $ = (id) => document.getElementById(id);

  start(async (P, { user }) => {
    const id = new URLSearchParams(location.search).get("id") || user.id;
    const { data, error } = await db.rpc("get_public_profile", { p_user_id: id });
    if (error) {
      const notSetUp = /get_public_profile/.test(error.message);
      $("public-profile").innerHTML = `
        <section class="card empty-state">
          <div class="empty-emoji" aria-hidden="true">🔒</div>
          <h2>${notSetUp ? "Public profiles aren't set up yet" : "Can't show this profile"}</h2>
          <p class="muted">${notSetUp ? "Run supabase/public-profile.sql in the Supabase SQL editor." : esc(error.message)}</p>
          <a class="primary-btn" href="friends.html">Back to friends</a>
        </section>`;
      return;
    }
    document.title = `${data.display_name} · IRA Portfolio`;
    $("public-profile").innerHTML = renderPublicProfile(data) + (data.is_me
      ? `<p class="muted small public-note">This is how your friends see your profile. <a href="profile.html#public">Edit it</a></p>`
      : `<div class="public-actions">
           <a class="primary-btn" href="transfers.html?to=${encodeURIComponent(data.id)}">Send assets →</a>
         </div>`);
  });
})();
