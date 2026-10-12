// Public Supabase settings for cross-device sync. The anon key is public by design
// (Row Level Security in supabase/schema.sql keeps each user's row private).
// Leave both empty to run Debt Slayer as a local-only app.
window.DS_CONFIG = {
  supabaseUrl: 'https://fyaqwjhovnsvgyuyelgl.supabase.co',
  supabaseAnonKey: 'sb_publishable_A2vdluLwlZ7KsT7dYffXBQ_yUVSLsQ_',
};
