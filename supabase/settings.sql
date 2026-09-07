-- Settings. Run once in the Supabase SQL editor, after schema.sql.
-- One row per user: course lock, daily set size, hint level overrides.

create table if not exists public.settings (
  user_id         uuid        primary key references auth.users (id) on delete cascade,
  course_lock     integer,
  new_per_day     integer,
  hint_overrides  jsonb       not null default '{}'::jsonb,   -- { "<concept>": "full" | "reduced" | "minimal" }
  updated_at      timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "settings: own row" on public.settings;
create policy "settings: own row" on public.settings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
