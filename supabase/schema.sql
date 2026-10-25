-- Debt Slayer cross-device sync: one row of app state per signed-in user.
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Assumptions the client relies on. Do not weaken these in the Supabase dashboard.
-- Row Level Security stays enabled. Each policy below requires auth.uid() = user_id.
-- `anon` has no grants. Only `authenticated` can select, insert, update, or delete,
-- and only its own row. The app sends user_id from the signed-in session and does
-- not ship a service-role key, so the publishable anon key cannot read or write
-- someone else's row. Erasing the cloud copy is an ordinary owner upsert: an empty
-- document with a tombstone revision. Deleting the row is not used, because a
-- missing row looks like "no cloud data" and an older device could upload stale
-- accounts back. Nothing in this file changes a live project's settings by itself;
-- it is the schema those settings are expected to match.

-- Only the owner of a row can see or change it.
drop policy if exists "user_state_select_own" on public.user_state;
create policy "user_state_select_own" on public.user_state
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_state_insert_own" on public.user_state;
create policy "user_state_insert_own" on public.user_state
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_state_update_own" on public.user_state;
create policy "user_state_update_own" on public.user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_state_delete_own" on public.user_state;
create policy "user_state_delete_own" on public.user_state
  for delete to authenticated using (auth.uid() = user_id);

-- No access at all for signed-out (anon) visitors.
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;
