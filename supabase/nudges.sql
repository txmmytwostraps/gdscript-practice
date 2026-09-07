-- Nudges. Run once in the Supabase SQL editor, after schema.sql.
-- One row per nudge the built-in helper gave, so the weekly summary can list
-- them per topic and the daily cap can be counted.

create table if not exists public.nudges (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  problem_id  text        not null,
  topic       text,
  request     text        not null,   -- a short summary of what was sent (never the whole prompt)
  reply       text        not null,
  at          timestamptz not null default now()
);
create index if not exists nudges_user_at on public.nudges (user_id, at);

alter table public.nudges enable row level security;

-- Users read their own nudges; only the edge function (service role) writes them.
drop policy if exists "nudges: read own" on public.nudges;
create policy "nudges: read own" on public.nudges
  for select to authenticated using (auth.uid() = user_id);
