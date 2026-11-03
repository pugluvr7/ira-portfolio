// Supabase project settings. Find these in Supabase: Project Settings -> API Keys.
// The publishable (anon) key is meant to be public; row-level security in
// supabase/schema.sql is what keeps each user's data private.
window.SUPABASE_CONFIG = {
  url: "",      // e.g. "https://abcdefghijklm.supabase.co"
  anonKey: "",  // e.g. "sb_publishable_..." or the legacy "eyJ..." anon key
};
