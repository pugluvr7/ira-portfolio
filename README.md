# IRA Portfolio

**Live site:** https://pugluvr7.github.io/ira-portfolio/

A tongue-in-cheek IRA dashboard where anyone can make an account and track their
retirement holdings — stocks, seafood, precious metals, real estate and cash.

- **Dashboard** — balance, gains, contribution progress, value-over-time chart, allocation vs. target, holdings.
- **Asset visualization** — every holding as pictures: a tile "vault" and a gallery card per asset.
- **Edit portfolio** — change your account details and target allocation; add, edit and delete holdings,
  or load the joke sample portfolio in one click.

It's a static site (plain HTML/CSS/JS, no build step). Accounts and data live in
[Supabase](https://supabase.com): Supabase Auth handles sign-up/login and Postgres stores
each user's profile and holdings, protected by row-level security so people only ever see their own.

## Setup

1. **Create a Supabase project** at https://supabase.com/dashboard (the free tier is fine).
2. **Create the tables:** in the project, open **SQL Editor → New query**, paste
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. **Point auth at the site:** **Authentication → URL Configuration → Site URL** =
   `http://localhost:5173` (or wherever you host it).
   Optional: to let people sign in without confirming their email first, turn off
   **Authentication → Sign In / Providers → Email → Confirm email**.
4. **Connect the site:** copy **Project URL** and the **publishable** (or legacy `anon`) key from
   **Project Settings → API Keys** into [`config.js`](config.js). This key is meant to be public;
   never put the `service_role` / secret key in this repo.

## Run it

```bash
python3 -m http.server 5173 --directory ~/ira-portfolio
```

Then visit http://localhost:5173 and create an account. (Opening the HTML files directly
from disk won't work well with login — serve the folder.)

## Files

- `index.html` + `app.js` – dashboard
- `assets.html` + `assets.js` – asset visualization
- `edit.html` + `edit.js` – edit account, targets and holdings
- `login.html` + `login.js` – sign in / create account
- `common.js` – Supabase client, auth guard, portfolio loading, nav, theme, tooltip, class colors
- `config.js` – your Supabase project URL and publishable key
- `sample-portfolio.js` – the joke sample holdings offered on the Edit page
- `supabase/schema.sql` – tables, row-level security policies and the new-user trigger
- `styles.css` – styling and light/dark theme tokens

The value-over-time chart is **simulated** from your contributions and ends at today's real total.
