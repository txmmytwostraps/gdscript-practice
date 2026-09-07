-- Notes. Run once in the Supabase SQL editor, after schema.sql.
-- One note per problem per user: "what I don't get / what I missed".

create table if not exists public.notes (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  problem_id  text        not null,
  text        text        not null default '',
  resolved    boolean     not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, problem_id)
);

alter table public.notes enable row level security;

drop policy if exists "notes: own rows" on public.notes;
create policy "notes: own rows" on public.notes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
