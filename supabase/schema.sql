-- ============================================================
-- Prozent- & Zinsrechner — Supabase-Schema
-- Im Supabase-Dashboard unter "SQL Editor" einmalig ausführen.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  variant_code text not null,
  variant_label text not null,
  student_name text not null,
  answers jsonb not null,
  score int not null,
  total int not null default 6,
  explanation text
);

-- Zeilensicherheit aktivieren: ohne passende Policy darf niemand
-- lesen oder schreiben.
alter table public.submissions enable row level security;

-- Jede/r (auch ohne Login, also die Schüler:innen über den
-- öffentlichen anon-Key) darf neue Abgaben einfügen.
create policy "Allow anonymous insert"
  on public.submissions
  for insert
  to anon
  with check (true);

-- Nur angemeldete Nutzer:innen (dein Admin-Login) dürfen Abgaben lesen.
create policy "Allow authenticated read"
  on public.submissions
  for select
  to authenticated
  using (true);

-- Kein Update/Delete-Policy angelegt: Abgaben können über die App
-- weder verändert noch gelöscht werden (auch nicht von Schüler:innen).
-- Mehrfache Abgaben derselben Person legen einfach eine weitere
-- Zeile an — in der Admin-Ansicht siehst du alle Versuche sortiert
-- nach Zeit.
