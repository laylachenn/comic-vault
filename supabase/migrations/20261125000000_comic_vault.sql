-- Layla's Comic Vault: run this once in Supabase → SQL Editor → New query.

create table if not exists public.comics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  status        text not null default 'owned' check (status in ('owned', 'wanted')),

  -- Comic Vine ids (null for comics added by hand)
  cv_issue_id   integer,
  cv_volume_id  integer,

  -- What the comic is
  series        text not null,
  volume_year   text,
  issue_number  text,
  title         text,
  publisher     text,
  cover_date    text,
  variant       text,
  characters    text[] not null default '{}',
  creators      text[] not null default '{}',
  cover_path    text,           -- path inside the "covers" storage bucket

  -- Collector details
  grade         text,
  slabbed       boolean not null default false,
  price_paid    numeric(10, 2),
  is_read       boolean not null default false,
  location      text,
  tags          text[] not null default '{}',
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists comics_user_idx on public.comics (user_id);

-- Everyone only ever sees and changes their own comics.
alter table public.comics enable row level security;

drop policy if exists "read own comics" on public.comics;
create policy "read own comics" on public.comics
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "add own comics" on public.comics;
create policy "add own comics" on public.comics
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "edit own comics" on public.comics;
create policy "edit own comics" on public.comics
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own comics" on public.comics;
create policy "delete own comics" on public.comics
  for delete to authenticated using (auth.uid() = user_id);

-- Cover images. Public to read (cover art isn't private), but each person
-- can only upload into and delete from their own folder: covers/<user id>/...
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

drop policy if exists "upload own covers" on storage.objects;
create policy "upload own covers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own covers" on storage.objects;
create policy "delete own covers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
