-- First appearances and story arcs, looked up on Comic Vine when a comic is added
-- (and filled in later for comics added before this existed).

alter table public.comics
  add column if not exists first_appearances text[] not null default '{}',
  add column if not exists story_arcs        jsonb  not null default '[]',  -- [{ "id": 56343, "name": "Death of Spider-Man" }]
  add column if not exists extras_checked_at timestamptz;                   -- null = not looked up yet
