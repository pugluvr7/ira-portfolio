# IRA Portfolio

**Live site:** https://pugluvr7.github.io/ira-portfolio/

A tongue-in-cheek IRA dashboard where anyone can make an account and track their
retirement holdings — stocks, seafood, precious metals, real estate and cash.

- **Dashboard** — balance, gains, contribution progress, value-over-time chart, allocation vs. target, holdings.
- **Asset visualization** — every holding as pictures: a tile "vault" and a gallery card per asset.
- **Edit portfolio** — change your account details and target allocation; add, edit and delete holdings,
  from stocks to live lobsters.
- **Friends** — add other users by email; they accept or decline. Friends show up in a picker
  when you send a transfer, so you don't have to type their email.
- **Transfers** — send part of any holding to a friend or to any account by email. They get a badge and banner,
  and the assets only move when they accept. Senders can cancel while it's pending.
- **Invite a friend** — the ✉️ Invite button emails a friend an invite straight from the site
  (10 per person per day), or copies/shares the link; it opens straight onto Create account.

It's a static site (plain HTML/CSS/JS, no build step). Accounts and data live in
[Supabase](https://supabase.com): Supabase Auth handles sign-up/login and Postgres stores
each user's profile and holdings, protected by row-level security so people only ever see their own.

## Setup

1. **Create a Supabase project** at https://supabase.com/dashboard (the free tier is fine).
2. **Create the tables:** in the project, open **SQL Editor → New query**, paste
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. Then do the same with
   [`supabase/transfers.sql`](supabase/transfers.sql) and then [`supabase/friends.sql`](supabase/friends.sql).
3. **Point auth at the site:** **Authentication → URL Configuration → Site URL** =
   `http://localhost:5173` (or wherever you host it).
   Optional: to let people sign in without confirming their email first, turn off
   **Authentication → Sign In / Providers → Email → Confirm email**.
4. **Connect the site:** copy **Project URL** and the **publishable** (or legacy `anon`) key from
   **Project Settings → API Keys** into [`config.js`](config.js). This key is meant to be public;
   never put the `service_role` / secret key in this repo.

## Email invites (optional)

Invites are sent by a Supabase Edge Function through [Resend](https://resend.com).

1. **Database:** run [`supabase/invites.sql`](supabase/invites.sql) in the SQL Editor.
2. **Resend:** create a free account and an API key. To email anyone other than yourself, add and
   verify a domain you own under **Domains** (Resend shows the DNS records to add).
3. **Deploy the function:** Supabase → **Edge Functions → Deploy a new function → Via Editor**, name it
   `send-invite`, replace the code with [`supabase/functions/send-invite/index.ts`](supabase/functions/send-invite/index.ts),
   and deploy. In the function's **Details**, turn **off** "Verify JWT with legacy secret" — the
   function checks the signed-in user itself.
4. **Secrets:** Supabase → **Edge Functions → Secrets**, add `RESEND_API_KEY`, and once your domain is
   verified, `INVITE_FROM` (e.g. `IRA Portfolio <invites@yourdomain.com>`).
5. **Signup emails too (recommended):** Supabase's built-in email only reaches your own team, so
   friends' confirmation emails need custom SMTP. In **Authentication → Emails → SMTP Settings**, enable
   custom SMTP with host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key,
   and a sender on your verified domain.

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
- `transfers.html` + `transfers.js` – send, accept, decline and cancel transfers
- `friends.html` + `friends.js` – add, accept, decline and remove friends
- `login.html` + `login.js` – sign in / create account
- `common.js` – Supabase client, auth guard, portfolio loading, nav, theme, tooltip, class colors
- `config.js` – your Supabase project URL and publishable key
- `supabase/schema.sql` – tables, row-level security policies and the new-user trigger
- `supabase/transfers.sql` – transfers table and the create/respond/cancel functions that move assets
- `supabase/friends.sql` – friendships and their functions, plus transfer-to-friend
- `supabase/invites.sql` – invite log and the limits check used by the invite function
- `supabase/functions/send-invite/index.ts` – Edge Function that emails invites via Resend
- `styles.css` – styling and light/dark theme tokens

The value-over-time chart is **simulated** from your contributions and ends at today's real total.
