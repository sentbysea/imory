// Local PostgreSQL engine; production schema/RLS still require a staging audit.
// npm.cmd install --prefix supabase/.temp/gallery-validation --no-save --package-lock=false @electric-sql/pglite
import { PGlite } from '../.temp/gallery-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const owner = '11111111-2222-3333-4444-555555555555';
const stranger = '99999999-8888-7777-6666-555555555555';
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table auth.users(id uuid primary key);
  create table public.categories(id bigint primary key, user_id uuid, name text, slug text unique,
    sort_order integer not null default 100,
    type text not null check(type in ('post','banner')));
  create table public.posts(id bigint primary key, user_id uuid, category_id bigint, visibility text, secret_password_hash text,
    created_at timestamptz not null default now());
  create table public.post_contents(post_id bigint primary key references posts(id), content text, ooc_content text);
  create table storage.buckets(id text primary key, name text, public boolean);
  create table storage.objects(id bigint generated always as identity, bucket_id text, name text);
  create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select on public.posts, public.categories to anon, authenticated;
  insert into auth.users values ('${owner}'),('${stranger}');
  insert into categories(id,user_id,name,slug,type) values
    (1,'${owner}','List','list','post'),(2,'${owner}','Photos','photos','post'),
    (3,'${owner}','Banners','banners','banner'),(4,'${stranger}','Not mine','other','post');
  insert into posts(id,user_id,category_id,visibility,secret_password_hash) values (10,'${owner}',2,'public','fixture-hash');
  create function public.get_secret_post_content(p_post_id bigint,p_password text)
    returns table(content text) language sql security definer as $$
    select c.content from public.post_contents c join public.posts p on p.id=c.post_id
      where p.id=p_post_id and p.visibility='secret' and p_password='fixture-password' $$;
`);
// Load the real folder migrations first so the new migration patches the actual
// create_post_folder body rather than a fixture stand-in.
for (const file of ['20260908100000_create_post_folders.sql', '20260908110000_add_posts_folder_id_sort_order.sql',
  '20260908120000_add_post_folder_rpcs.sql', '20260910100000_gallery_category_and_post_covers.sql',
  '20260911100000_post_covers_private_access.sql']) {
  await db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
}
await db.exec("update categories set list_style='gallery' where id=2");
const migration = readFileSync(new URL('../migrations/20260911120000_gallery_content.sql', import.meta.url),'utf8');
await db.exec(migration);
await db.exec(migration);
assert.deepEqual((await db.query('select id,slug,type from categories order by id')).rows,
  [{id:1,slug:'list',type:'post'},{id:2,slug:'photos',type:'gallery'},{id:3,slug:'banners',type:'banner'},{id:4,slug:'other',type:'post'}]);
console.log('PASS migration twice: list/gallery/banner, IDs and slugs preserved');
await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false); set role authenticated;`);
const a = { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',storage_path:owner+'/a.jpg',mime_type:'image/jpeg',byte_size:20,position:0,is_primary:false };
const b = { ...a,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',storage_path:owner+'/b.jpg',position:1 };
await db.exec(`reset role; insert into storage.objects(bucket_id,name) values ('post-covers','${a.storage_path}'),('post-covers','${b.storage_path}'); set role authenticated;`);
for (const photos of [[a],[a,b],[a,{...b,is_primary:true}]]) {
  await db.query('select * from save_own_gallery_images($1,$2::jsonb)',[10,JSON.stringify(photos)]);
  assert.equal((await db.query('select * from get_own_gallery_images(10)')).rows.length,photos.length);
}
console.log('PASS save one/multiple photos, optional primary and explicit primary');
await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); set role anon;`);
assert.equal((await db.query('select id, post_id, position, is_primary from post_gallery_images')).rows.length,2);
assert.equal((await db.query('select * from get_gallery_image_object($1)',[a.id])).rows.length,1);
await db.exec("reset role; update posts set visibility='secret'; set role anon;");
assert.equal((await db.query('select id, post_id, position, is_primary from post_gallery_images')).rows.length,0);
assert.equal((await db.query('select * from get_gallery_image_object($1)',[a.id])).rows.length,0);
assert.equal((await db.query('select post_cover_object_is_readable($1) as ok',[a.storage_path])).rows[0].ok,false);
await assert.rejects(db.query('select * from save_own_gallery_images($1,$2::jsonb)',[10,'[]']));
console.log('PASS public to secret revokes row and file access; anon cannot write');
assert.equal((await db.query('select issue_gallery_read_token(10,$1) as token',['wrong'])).rows[0].token,null);
const token = (await db.query('select issue_gallery_read_token(10,$1) as token',['fixture-password'])).rows[0].token;
assert.ok(token);
await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-imory-gallery-access':token})]);
assert.equal((await db.query('select * from get_gallery_image_object($1)',[a.id])).rows.length,1);
assert.equal((await db.query('select post_cover_object_is_readable($1) as ok',[a.storage_path])).rows[0].ok,true);
await db.exec("reset role; update posts set visibility='private'; set role anon;");
assert.equal((await db.query('select * from get_gallery_image_object($1)',[a.id])).rows.length,0);
await db.exec("reset role; update posts set visibility='secret', secret_password_hash='changed-hash'; set role anon;");
assert.equal((await db.query('select * from get_gallery_image_object($1)',[a.id])).rows.length,0);
console.log('PASS secret password token unlocks photos; private/password change revokes access');
await db.exec(`reset role; select set_config('request.jwt.claim.sub','${owner}',false); set role authenticated;`);
await assert.rejects(db.query('select * from save_own_gallery_images($1,$2::jsonb)',[10,JSON.stringify([{...a,storage_path:'other/x.jpg'}])]));
assert.equal((await db.query('select * from get_own_gallery_images(10)')).rows.length,2);
console.log('PASS invalid file write rolls back and preserves photos');
// The real create_post_folder from the FOLDER-1 migrations is loaded above, so
// this exercises the rewritten body rather than the migration's own text match.
const folderDef = (await db.query(
  "select pg_get_functiondef(to_regprocedure('public.create_post_folder(bigint,bigint,text)')) as definition")).rows[0].definition;
assert.ok(folderDef.includes("coalesce(v_category.type, 'post') not in ('post', 'gallery')"));
assert.equal(folderDef.includes("coalesce(v_category.type, 'post') <> 'post'"), false);
const folderOf = async (categoryId, parentId, name) =>
  (await db.query('select public.create_post_folder($1,$2,$3) as id', [categoryId, parentId, name])).rows[0].id;
const migratedGallery = await folderOf(2, null, 'Album');
const plainPost = await folderOf(1, null, 'Notes');
assert.ok(migratedGallery > 0 && plainPost > 0);
await assert.rejects(folderOf(3, null, 'Banner folder'), /is not a post category/);
await assert.rejects(folderOf(4, null, 'Someone else'), /belongs to another user/);
console.log('PASS create_post_folder accepts migrated gallery and post, still refuses banner and other owners');
const second = await folderOf(2, migratedGallery, 'Roll');
const third = await folderOf(2, second, 'Frame');
await assert.rejects(folderOf(2, third, 'Too deep'), /maximum folder depth \(3\)/);
assert.deepEqual((await db.query('select depth from post_folders where category_id=2 order by depth')).rows,
  [{depth:1},{depth:2},{depth:3}]);
await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); set role authenticated;");
await assert.rejects(folderOf(2, null, 'Signed out'), /authentication required/);
await db.exec('reset role; set role anon;');
await assert.rejects(folderOf(2, null, 'Visitor'), /permission denied for function create_post_folder/);
console.log('PASS rewritten body keeps depth limit, ownership and authentication checks');
await db.close();
