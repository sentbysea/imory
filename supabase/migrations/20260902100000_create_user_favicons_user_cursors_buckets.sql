-- user-favicons / user-cursors Storage buckets + RLS
--
-- FAVICON/CURSOR 업로드 기능(admin/settings/admin-favicon.js,
-- admin/settings/admin-settings-save.js의 cursorFileInput 핸들러)을
-- 지원한다. 기존 user-banners 버킷과 완전히 동일한 구조로 맞춘다 —
-- Supabase SQL Editor에서 조회한 실제 user-banners 정책:
--
--   user_banners_owner_write | ALL    | authenticated       | own-folder
--   user_banners_public_read | SELECT | anon, authenticated | bucket 전체
--
-- object path 규칙(코드 기준, 확장자 없이 upsert:true로 덮어씀):
--   user-favicons/{user_id}/favicon
--   user-cursors/{user_id}/cursor
--
-- 두 버킷 모두 public=true, file_size_limit/allowed_mime_types 제한
-- 없음(요청에 따라 버킷 레벨 제한은 걸지 않음 — 클라이언트 accept
-- 속성으로만 확장자 안내, 실제 접근 통제는 아래 own-folder RLS가 담당).
--
-- 기존 user-banners 및 다른 버킷/정책은 건드리지 않는다.


-- =========================================================
-- BUCKETS
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('user-favicons', 'user-favicons', true),
  ('user-cursors', 'user-cursors', true)
on conflict (id) do nothing;


-- =========================================================
-- user-favicons policies
-- =========================================================

create policy "user_favicons_owner_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'user-favicons'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-favicons'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "user_favicons_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'user-favicons');


-- =========================================================
-- user-cursors policies
-- =========================================================

create policy "user_cursors_owner_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'user-cursors'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-cursors'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "user_cursors_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'user-cursors');
