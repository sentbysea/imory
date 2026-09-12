-- Additive gallery content. Run after the private post-covers migration.
-- IDs, slugs, post rows and banner data are preserved.
begin;

-- The original categories DDL is not in this repository. Inspect the actual
-- catalog instead of assuming a constraint name. Refuse unfamiliar schemas.
do $migration$
declare col smallint; kind text; rule record;
begin
  select a.attnum, t.typname into col, kind
    from pg_attribute a join pg_type t on t.oid = a.atttypid
    where a.attrelid = 'public.categories'::regclass
      and a.attname = 'type' and not a.attisdropped;
  if kind not in ('text', 'varchar') or kind is null then
    raise exception 'Review categories.type before migration: expected text/varchar, got %', kind;
  end if;
  for rule in select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint where conrelid = 'public.categories'::regclass
      and contype = 'c' and conkey = array[col]
  loop
    -- Preserve the existing accepted values; add gallery to type-only checks.
    if position('gallery' in rule.definition) = 0 then
      execute format('alter table public.categories drop constraint %I', rule.conname);
      execute format('alter table public.categories add constraint %I CHECK (type = ''gallery'' OR (%s))',
        rule.conname, substring(rule.definition from 8 for length(rule.definition) - 8));
    end if;
  end loop;
end;
$migration$;

update public.categories set type = 'gallery'
  where type = 'post' and list_style = 'gallery';
comment on column public.categories.list_style is
  'Deprecated compatibility field. Category kind is categories.type; presentation belongs to skins.';

-- Preserve folder creation in migrated galleries. Change only the known type
-- guard; all existing ownership, depth and ordering checks stay intact.
do $migration$
declare definition text; signature regprocedure;
begin
  signature := to_regprocedure('public.create_post_folder(bigint,bigint,text)');
  if signature is not null then
    select pg_get_functiondef(signature) into definition;
    if position('coalesce(v_category.type, ''post'') <> ''post''' in definition) > 0 then
      execute replace(definition, 'coalesce(v_category.type, ''post'') <> ''post''',
        'coalesce(v_category.type, ''post'') not in (''post'', ''gallery'')');
    elsif position('coalesce(v_category.type, ''post'') not in (''post'', ''gallery'')' in definition) = 0 then
      raise exception 'Review create_post_folder type guard before migrating';
    end if;
  end if;
end;
$migration$;

create table if not exists public.post_gallery_images (
  id uuid primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  storage_path text not null unique check (length(storage_path) between 1 and 400),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  position integer not null check (position >= 0),
  is_primary boolean not null default false
);
create index if not exists post_gallery_images_post_idx on public.post_gallery_images(post_id, position);
create unique index if not exists post_gallery_images_primary_idx
  on public.post_gallery_images(post_id) where is_primary;
alter table public.post_gallery_images enable row level security;
drop policy if exists gallery_images_read on public.post_gallery_images;
create policy gallery_images_read on public.post_gallery_images for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
    and (p.visibility = 'public' or p.user_id = auth.uid())));
revoke all on public.post_gallery_images from anon, authenticated;
grant select (id, post_id, position, is_primary) on public.post_gallery_images to anon, authenticated;

create or replace function public.get_own_gallery_images(p_post_id bigint)
returns setof public.post_gallery_images language sql stable security definer set search_path = '' as $fn$
  select g.* from public.post_gallery_images g join public.posts p on p.id = g.post_id
    where p.id = p_post_id and p.user_id = auth.uid() order by g.position, g.id;
$fn$;
revoke all on function public.get_own_gallery_images(bigint) from public, anon;
grant execute on function public.get_own_gallery_images(bigint) to authenticated;

-- Replace the photo set in one transaction; the client removes old files only
-- after success. No cover row or extra upload is needed for a primary photo.
create or replace function public.save_own_gallery_images(p_post_id bigint, p_images jsonb)
returns setof text language plpgsql security definer set search_path = '' as $fn$
declare old_paths text[]; image record;
begin
  perform 1 from public.posts p where p.id = p_post_id and p.user_id = auth.uid() for update;
  if not found then raise exception 'Post ownership required' using errcode = '42501'; end if;
  if jsonb_typeof(p_images) <> 'array' or p_images is null then
    raise exception 'Expected image array';
  end if;
  for image in select * from jsonb_to_recordset(p_images)
    as x(id uuid, storage_path text, mime_type text, byte_size integer, position integer, is_primary boolean)
  loop
    if split_part(image.storage_path, '/', 1) is distinct from auth.uid()::text
      or not exists (select 1 from storage.objects o where o.bucket_id = 'post-covers' and o.name = image.storage_path)
      or exists (select 1 from public.post_gallery_images g where g.id = image.id and g.post_id <> p_post_id)
    then raise exception 'Invalid gallery object' using errcode = '42501'; end if;
  end loop;
  select array_agg(storage_path) into old_paths from public.post_gallery_images where post_id = p_post_id;
  delete from public.post_gallery_images where post_id = p_post_id;
  insert into public.post_gallery_images(id, post_id, storage_path, mime_type, byte_size, position, is_primary)
    select x.id, p_post_id, x.storage_path, x.mime_type, x.byte_size, x.position, coalesce(x.is_primary, false)
    from jsonb_to_recordset(p_images)
      as x(id uuid, storage_path text, mime_type text, byte_size integer, position integer, is_primary boolean);
  -- Photo references and the controlled HTML body change atomically. If a later
  -- OOC/password request fails, the already saved body still references live files.
  if jsonb_array_length(p_images) > 0 then
    insert into public.post_contents(post_id, content)
      select p_post_id, string_agg('<p><img src="/api/post-cover?image=' || id::text || '" alt=""></p>', '' order by position, id)
      from public.post_gallery_images where post_id = p_post_id
      on conflict (post_id) do update set content = excluded.content;
  end if;
  return query select path from unnest(old_paths) path
    where not exists (select 1 from public.post_gallery_images g where g.storage_path = path)
      and not exists (select 1 from public.post_covers c where c.storage_path = path);
end;
$fn$;
revoke all on function public.save_own_gallery_images(bigint,jsonb) from public, anon;
grant execute on function public.save_own_gallery_images(bigint,jsonb) to authenticated;

-- Short-lived, opaque access after the existing secret-post password gate.
-- No passwords or permanent signed Storage URLs are sent to the browser.
create table if not exists public.gallery_read_tokens (
  token uuid primary key default gen_random_uuid(),
  post_id bigint not null references public.posts(id) on delete cascade,
  password_hash text not null,
  expires_at timestamptz not null default (now() + interval '1 hour')
);
alter table public.gallery_read_tokens enable row level security;
revoke all on public.gallery_read_tokens from public, anon, authenticated;

create or replace function public.issue_gallery_read_token(p_post_id bigint, p_password text)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare body jsonb; result uuid; fingerprint text;
begin
  select p.secret_password_hash into fingerprint from public.posts p
    where p.id = p_post_id and p.visibility = 'secret';
  if fingerprint is null then return null; end if;
  select to_jsonb(x) into body from (select * from public.get_secret_post_content(p_post_id, p_password)) x limit 1;
  if body is null or body->>'content' is null then return null; end if;
  delete from public.gallery_read_tokens where expires_at < now();
  insert into public.gallery_read_tokens(post_id,password_hash) values(p_post_id,fingerprint)
    returning token into result;
  return result;
end;
$fn$;
revoke all on function public.issue_gallery_read_token(bigint,text) from public;
grant execute on function public.issue_gallery_read_token(bigint,text) to anon, authenticated;

create or replace function public.gallery_secret_is_readable(p_post_id bigint)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.gallery_read_tokens t join public.posts p on p.id=t.post_id
    where p.id=p_post_id and p.visibility='secret' and t.password_hash=p.secret_password_hash
      and t.expires_at > now() and t.token::text = any(string_to_array(
        coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-imory-gallery-access',''), ',')));
$fn$;
revoke all on function public.gallery_secret_is_readable(bigint) from public;
grant execute on function public.gallery_secret_is_readable(bigint) to anon, authenticated;

create or replace function public.post_cover_object_is_readable(p_name text)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.post_covers c join public.posts p on p.id = c.post_id
    where c.storage_path = p_name and (p.visibility = 'public' or p.user_id = auth.uid()))
  or exists (select 1 from public.post_gallery_images g join public.posts p on p.id = g.post_id
    where g.storage_path = p_name and (p.visibility = 'public' or p.user_id = auth.uid()
      or public.gallery_secret_is_readable(p.id)))
  or exists (select 1 from public.categories c where c.secret_cover_path = p_name);
$fn$;

create or replace function public.get_gallery_image_object(p_image_id uuid)
returns table(storage_path text, mime_type text) language sql stable security definer set search_path = '' as $fn$
  select g.storage_path, g.mime_type from public.post_gallery_images g join public.posts p on p.id = g.post_id
    where g.id = p_image_id and (p.visibility = 'public' or p.user_id = auth.uid()
      or public.gallery_secret_is_readable(p.id));
$fn$;
revoke all on function public.get_gallery_image_object(uuid) from public;
grant execute on function public.get_gallery_image_object(uuid) to anon, authenticated;

create or replace function public.get_own_post_cover_paths(p_post_ids bigint[])
returns setof text language sql stable security definer set search_path = '' as $fn$
  select c.storage_path from public.post_covers c where c.user_id = auth.uid() and c.post_id = any(p_post_ids)
  union select g.storage_path from public.post_gallery_images g join public.posts p on p.id = g.post_id
    where p.user_id = auth.uid() and p.id = any(p_post_ids);
$fn$;

notify pgrst, 'reload schema';
commit;
