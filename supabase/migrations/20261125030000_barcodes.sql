-- Barcode scanning: remembers which series a comic's main barcode belongs to.
-- Shared by everyone, so once anyone scans a series, it's instant for all.

create table if not exists public.barcode_series (
  code         text primary key check (code ~ '^\d{8,14}$'),
  cv_volume_id integer not null check (cv_volume_id > 0),
  series_name  text not null,
  volume_year  text,
  updated_by   uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at   timestamptz not null default now()
);

alter table public.barcode_series enable row level security;

drop policy if exists "signed-in people read barcodes" on public.barcode_series;
create policy "signed-in people read barcodes" on public.barcode_series
  for select to authenticated using (true);

drop policy if exists "signed-in people add barcodes" on public.barcode_series;
create policy "signed-in people add barcodes" on public.barcode_series
  for insert to authenticated with check (updated_by = auth.uid());

-- Anyone signed in can correct a wrong match; the row records who changed it last.
drop policy if exists "signed-in people fix barcodes" on public.barcode_series;
create policy "signed-in people fix barcodes" on public.barcode_series
  for update to authenticated using (true) with check (updated_by = auth.uid());
