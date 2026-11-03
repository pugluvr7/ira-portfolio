(async function () {
  const { db, configured, wireThemeToggle } = window.UI;
  const $ = (id) => document.getElementById(id);
  wireThemeToggle();

  const form = $("auth-form");
  const msg = $("form-msg");
  const submit = $("submit-btn");
  const say = (text, kind = "error") => { msg.textContent = text; msg.dataset.kind = kind; };

  if (!configured) {
    say("Supabase isn't connected yet — add your project URL and key to config.js.");
    submit.disabled = true;
    return;
  }

  // Already signed in? Go straight to the dashboard.
  const { data: { session } } = await db.auth.getSession();
  if (session) return location.replace("index.html");

  let mode = "signin";
  document.querySelectorAll(".auth-tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      document.querySelectorAll(".auth-tabs button").forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-selected", x === b);
      });
      document.querySelectorAll(".signup-only").forEach((n) => (n.hidden = mode !== "signup"));
      $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
      submit.textContent = mode === "signup" ? "Create account" : "Sign in";
      say("");
    })
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    const displayName = $("display-name").value.trim();
    if (!email || !password) return say("Enter your email and password.");
    if (mode === "signup" && !displayName) return say("Tell us your name — it goes in big letters on your dashboard.");
    if (password.length < 6) return say("Password needs at least 6 characters.");

    submit.disabled = true;
    say(mode === "signup" ? "Creating your account…" : "Signing in…", "info");
    try {
      if (mode === "signup") {
        const { data, error } = await db.auth.signUp({
          email, password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: new URL("index.html", location.href).href,
          },
        });
        if (error) throw error;
        if (data.session) return location.replace("edit.html"); // email confirmation is off
        say("Check your email to confirm your account, then sign in here.", "success");
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.replace("index.html");
      }
    } catch (err) {
      say(err.message || String(err));
    } finally {
      submit.disabled = false;
    }
  });
})();
