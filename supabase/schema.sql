-- Step Up schema. Applied to the "step-up" Supabase project (ap-southeast-2).
-- RLS is enabled but permissive (using (true)) -- single-user personal app,
-- app-enforced not a real privacy boundary. Same tradeoff Plumb makes.

create extension if not exists "pgcrypto";

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  is_timed boolean not null default false,
  default_seconds_per_rep numeric not null default 2,
  created_at timestamptz not null default now()
);

create table routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  order_index int not null default 0,
  target_sets int not null default 3,
  target_reps int,
  target_weight_kg numeric,
  target_duration_seconds int
);

create table plan_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  routine_id uuid references routines(id),
  status text not null default 'planned', -- planned / done / skipped / swapped / rest
  note text,
  created_at timestamptz not null default now()
);

create table constraints (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date,
  category text, -- category to avoid, e.g. 'Glutes'
  note text,      -- e.g. "right leg niggly"
  created_at timestamptz not null default now()
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid references plan_days(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  temperature_c numeric, -- auto-fetched from Open-Meteo at session start
  overall_note text      -- captured once, at the end, by voice
);

create table session_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_index int not null default 1,
  reps int,
  duration_seconds int,
  weight_kg numeric,
  logged_at timestamptz not null default now()
);

create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  weight_kg numeric,
  measurements jsonb, -- flexible {waist: x, chest: y, ...}
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;
alter table routines enable row level security;
alter table routine_exercises enable row level security;
alter table plan_days enable row level security;
alter table constraints enable row level security;
alter table workout_sessions enable row level security;
alter table session_sets enable row level security;
alter table body_metrics enable row level security;
alter table push_subscriptions enable row level security;

create policy "allow all - exercises" on exercises for all using (true) with check (true);
create policy "allow all - routines" on routines for all using (true) with check (true);
create policy "allow all - routine_exercises" on routine_exercises for all using (true) with check (true);
create policy "allow all - plan_days" on plan_days for all using (true) with check (true);
create policy "allow all - constraints" on constraints for all using (true) with check (true);
create policy "allow all - workout_sessions" on workout_sessions for all using (true) with check (true);
create policy "allow all - session_sets" on session_sets for all using (true) with check (true);
create policy "allow all - body_metrics" on body_metrics for all using (true) with check (true);
create policy "allow all - push_subscriptions" on push_subscriptions for all using (true) with check (true);

alter table push_subscriptions add column if not exists endpoint text;
alter table push_subscriptions add constraint push_subscriptions_endpoint_key unique (endpoint);

-- Push notifications: VAPID keys and the cron/edge-function shared secret
-- live in Supabase Vault, never in this repo or an env var. Set them once
-- via the SQL editor (not committed anywhere):
--   select vault.create_secret('<value>', 'vapid_public_key', '...');
--   select vault.create_secret('<value>', 'vapid_private_key', '...');
--   select vault.create_secret('<value>', 'cron_shared_secret', '...');
-- The public key is the one exception -- it's meant to be public, and also
-- goes into the client as VITE_VAPID_PUBLIC_KEY.

create or replace function public.get_app_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

revoke all on function public.get_app_secret(text) from public, anon, authenticated;
grant execute on function public.get_app_secret(text) to service_role, postgres;

-- pg_cron + pg_net drive the 7:30 alarm and 7:50 "not started yet" nudge by
-- calling the send-nudge Edge Function (supabase/functions/send-nudge).
-- Both times are UTC -- Brisbane is UTC+10 with no DST, so 07:30/07:50
-- Brisbane == 21:30/21:50 UTC the previous day.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'stepup-morning-alarm',
  '30 21 * * *',
  $$
  select net.http_post(
    url := 'https://gfbwlelzwjwlgdakapwt.supabase.co/functions/v1/send-nudge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_app_secret('cron_shared_secret')),
    body := jsonb_build_object('kind', 'alarm')
  );
  $$
);

select cron.schedule(
  'stepup-not-started-nudge',
  '50 21 * * *',
  $$
  select net.http_post(
    url := 'https://gfbwlelzwjwlgdakapwt.supabase.co/functions/v1/send-nudge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_app_secret('cron_shared_secret')),
    body := jsonb_build_object('kind', 'nudge')
  );
  $$
);
