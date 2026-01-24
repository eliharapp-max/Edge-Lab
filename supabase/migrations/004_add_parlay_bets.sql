create table if not exists public.bet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bet_type text not null check (bet_type in ('straight', 'parlay')),
  sport text,
  book text,
  placed_at timestamptz,
  stake_units numeric,
  odds_text text,
  odds_format text,
  implied_prob numeric,
  result text check (result in ('win', 'loss', 'push', 'void')),
  payout_units numeric,
  created_at timestamptz default now()
);

create table if not exists public.bet_legs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.bet_entries(id) on delete cascade,
  leg_index int not null,
  market text,
  selection text,
  line text,
  odds_text text,
  odds_format text,
  implied_prob numeric,
  leg_result text check (leg_result in ('hit', 'miss', 'push', 'void'))
);
