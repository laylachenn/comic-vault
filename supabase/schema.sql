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


create table if not exists public.profiles (
  user_id       uuid primary key default auth.uid() references auth.users on delete cascade,
  handle        text not null check (handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  share_enabled boolean not null default false,
  share_wanted  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists profiles_handle_key on public.profiles (handle);

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shared pages read through these two functions only. They return nothing unless the
-- owner turned sharing on, and leave out private details (price paid, notes, where it's kept).

create or replace function public.shared_profile(p_handle text)
returns table (handle text, share_wanted boolean)
language sql stable security definer set search_path = ''
as $$
  select p.handle, p.share_wanted
  from public.profiles p
  where p.handle = lower(p_handle) and p.share_enabled;
$$;

create or replace function public.shared_comics(p_handle text)
returns table (
  id uuid, status text, cv_volume_id integer, series text, volume_year text, issue_number text,
  title text, publisher text, cover_date text, variant text, characters text[], cover_path text,
  grade text, slabbed boolean, tags text[], created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.status, c.cv_volume_id, c.series, c.volume_year, c.issue_number,
         c.title, c.publisher, c.cover_date, c.variant, c.characters, c.cover_path,
         c.grade, c.slabbed, c.tags, c.created_at
  from public.comics c
  join public.profiles p on p.user_id = c.user_id
  where p.handle = lower(p_handle) and p.share_enabled
    and (c.status = 'owned' or p.share_wanted)
  order by c.created_at desc, c.id;
$$;

revoke all on function public.shared_profile(text) from public;
revoke all on function public.shared_comics(text) from public;
grant execute on function public.shared_profile(text) to anon, authenticated;
grant execute on function public.shared_comics(text) to anon, authenticated;
