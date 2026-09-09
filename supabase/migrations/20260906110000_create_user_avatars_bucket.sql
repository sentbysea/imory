-- user-avatars Storage 버킷 + RLS
--
-- admin/settings/admin-settings-avatar.js가 쓸 프로필 사진 업로드 기능을
-- 지원한다. user-favicons/user-cursors와 완전히 동일한 구조
-- ([[20260902100000_create_user_favicons_user_cursors_buckets.sql]]).
--
-- object path 규칙(코드 기준, 확장자 없이 upsert:true로 덮어씀):
--   user-avatars/{user_id}/avatar
--
-- [변경됨 → admin/settings/admin-settings-avatar.js 상단]
-- 이후 라운드에서 경로 규칙이 바뀌었다: 고정 경로에 덮어쓰면
-- "업로드는 성공했는데 site_settings 저장이 실패"한 순간을 되돌릴
-- 수 없어서(기존 파일이 이미 덮여 있다), 지금은 업로드마다 새 경로
--   user-avatars/{user_id}/avatars/{uuid}
-- 에 올리고 저장이 성공한 뒤에만 이전 객체를 지운다. 아래 DDL은
-- 그대로다 — own-folder 정책 (storage.foldername(name))[1] =
-- auth.uid() 는 한 단계 더 깊은 경로에도 동일하게 적용된다.
--
-- public=true, file_size_limit/allowed_mime_types 제한 없음(다른
-- user-* 버킷과 동일하게 own-folder RLS가 접근 통제를 담당).
--
-- 기존 버킷/정책은 건드리지 않는다.


-- =========================================================
-- BUCKET
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;


-- =========================================================
-- user-avatars policies
-- =========================================================

create policy "user_avatars_owner_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "user_avatars_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'user-avatars');
