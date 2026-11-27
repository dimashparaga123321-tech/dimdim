begin;

create schema if not exists private;
create table if not exists private.daria_editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.daria_editors from public, anon, authenticated;

create or replace function public.daria_can_edit() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.daria_editors where user_id = (select auth.uid()));
$$;
revoke all on function public.daria_can_edit() from public;
grant execute on function public.daria_can_edit() to authenticated;

create table if not exists public.daria_catalog (
  id integer primary key check (id = 1),
  revision integer not null default 0 check (revision >= 0),
  content jsonb not null default '{"works":{},"texts":{},"hidden":[]}'::jsonb,
  check (
    content ?& array['works','texts','hidden']
    and jsonb_typeof(content->'works') = 'object'
    and jsonb_typeof(content->'texts') = 'object'
    and jsonb_typeof(content->'hidden') = 'array'
  )
);
insert into public.daria_catalog (id) values (1) on conflict do nothing;
alter table public.daria_catalog enable row level security;
revoke all on public.daria_catalog from public, anon, authenticated;
grant select on public.daria_catalog to anon, authenticated;
grant update (revision, content) on public.daria_catalog to authenticated;
drop policy if exists "Read published catalog" on public.daria_catalog;
create policy "Read published catalog" on public.daria_catalog for select to anon, authenticated using (id = 1);
drop policy if exists "Approved editors publish" on public.daria_catalog;
create policy "Approved editors publish" on public.daria_catalog for update to authenticated
using ((select public.daria_can_edit())) with check ((select public.daria_can_edit()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('daria-artworks', 'daria-artworks', true, 286720, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Approved editors upload artwork" on storage.objects;
create policy "Approved editors upload artwork" on storage.objects for insert to authenticated
with check (bucket_id = 'daria-artworks' and name ~ '^[a-f0-9]{64}\.(webp|jpg|png)$' and (select public.daria_can_edit()));

commit;
