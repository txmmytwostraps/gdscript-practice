-- GDScript Practice: per-user progress. Run once in the Supabase SQL editor.
-- One row per (user, problem). A row exists as soon as the user has solved,
-- failed, or typed something for that problem.

create table if not exists public.progress (
  user_id          uuid        not null references auth.users (id) on delete cascade,
  problem_id       text        not null,
  solved_at        timestamptz,                      -- null = not solved yet
  fails            integer     not null default 0,   -- failed runs (unlocks the reference solution)
  draft            text,                             -- in-progress code, null = none saved
  draft_updated_at timestamptz,                      -- when the draft was last edited (client clock)
  updated_at       timestamptz not null default now(),
  primary key (user_id, problem_id)
);

-- Row-level security: each user sees and edits only their own rows.
alter table public.progress enable row level security;

drop policy if exists "progress: own rows" on public.progress;
create policy "progress: own rows"
  on public.progress
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at honest on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch
  before update on public.progress
  for each row execute function public.touch_updated_at();
