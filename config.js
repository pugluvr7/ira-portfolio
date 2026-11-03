// Supabase project settings. Find these in Supabase: Project Settings -> API Keys.
// The publishable (anon) key is meant to be public; row-level security in
// supabase/schema.sql is what keeps each user's data private.
window.SUPABASE_CONFIG = {
  // Public address used in invite links (so invites sent while testing locally still point at the live site).
  siteUrl: "https://pugluvr7.github.io/ira-portfolio/",
  // Public half of the Web Push (VAPID) key pair; the private half is a Supabase secret.
  vapidPublicKey: "BNxhJVJSNb8-GVykoeGPv2WByKQAKMuJ16FbqKPkBtYBfPyhq6xWeDLVb82OPl0M8EMT1bgtdxmcAnAQHkZB1vw",
  url: "https://xujtoldjcijbtfdfuzir.supabase.co",
  anonKey: "sb_publishable_M_2nTaaUGIwRx2IKeEscPQ___IMAW7n",
};
