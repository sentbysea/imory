-- Read-only audit to run in the target Supabase SQL Editor before deployment.
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='categories'
  and column_name in ('id','slug','type','list_style','page_size');

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid='public.categories'::regclass;

select type, list_style, count(*) from public.categories group by type,list_style order by type,list_style;

select pg_get_functiondef(to_regprocedure('public.create_post_folder(bigint,bigint,text)'));
select pg_get_functiondef(to_regprocedure('public.get_secret_post_content(bigint,text)'));

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where (schemaname='public' and tablename in
  ('categories','posts','post_contents','post_covers','post_gallery_images','gallery_read_tokens'))
  or (schemaname='storage' and tablename='objects');

select id, public from storage.buckets where id='post-covers';
