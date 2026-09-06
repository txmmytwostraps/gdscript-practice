-- Spaced review. Run once in the Supabase SQL editor, after schema.sql.
-- reviews: one row per problem that is in the review cycle for a user.
-- attempts: every run that reached a verdict, so stats can be built later.

create table if not exists public.reviews (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  problem_id    text        not null,
  topic         text        not null,               -- the concept id
  stage         text        not null default 'fresh', -- fresh | spaced | relearn
  due_on        date        not null,               -- the day it comes up
  step          integer     not null default 0,     -- position in the spacing sequence
  clean_streak  integer     not null default 0,     -- clean solves in a row while relearning
  last_result   text,                               -- pass | miss
  reviewed_at   timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, problem_id)
);

create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  problem_id  text        not null,
  kind        text        not null,                 -- new | review | practice
  result      text        not null,                 -- pass | miss
  at          timestamptz not null default now()
);
create index if not exists attempts_user_at on public.attempts (user_id, at);

alter table public.reviews  enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "reviews: own rows" on public.reviews;
create policy "reviews: own rows" on public.reviews
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "attempts: own rows" on public.attempts;
create policy "attempts: own rows" on public.attempts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch
  before update on public.reviews
  for each row execute function public.touch_updated_at();
