-- =========================================================
-- SHARE CARD — 기본 공유 카드 사진 버킷 (user-share-cards)
--
-- 기준 문서: IMORY_SHARE_CARD_DESIGN.md
-- 화면: admin/settings/admin-share-card.js (SETTINGS > SHARE > CARD)
-- 서버: functions/api/og/post.js
--
-- ★ 이 migration이 하는 일은 하나다: 버킷 하나와 그 정책.
--
-- 카드 설정 자체(오버레이 색·강도·폰트·기본 사진 주소·version)는
-- **새 테이블도 새 컬럼도 만들지 않는다** — 이미 있는
-- site_settings(user_id, key, value)의 key='share_card' 한 칸에
-- JSON 문자열로 들어간다(blog_title · favicon_url · cursor_url ·
-- hide_memo_entry와 같은 자리, 같은 RLS). 그래서 설정 쪽에는
-- 추가할 제약도 정책도 없다.
--
--   {
--     "image_url": "https://.../user-share-cards/<uid>/<uuid>",
--     "overlay": "black" | "white",
--     "overlay_strength": 0..100,
--     "font": "pretendard" | "nanum-myeongjo",
--     "version": "1757800000000"
--   }
--
-- ★ 왜 공개(public) 버킷인가
--
-- 이 사진은 "공유 카드에 실리는 기본 배경"이다 — 존재 목적 자체가
-- 아무나 보는 것이고, 카드를 그리는 헤드리스 브라우저도 로그인
-- 없이 받아야 한다. 그래서 아바타/파비콘/커서와 같은 공개 버킷
-- 규칙을 쓴다.
--
-- 반대로 **글 대표 이미지(post-covers)는 여기로 오지 않는다.**
-- 그쪽은 비공개 버킷이고 /api/post-cover 프록시가 요청 시점의 글
-- 공개 상태를 매번 다시 본다(20260911100000). 공유 카드도 그
-- 프록시를 그대로 쓴다 — 대표 이미지를 이 공개 버킷으로 복사하는
-- 일은 하지 않는다(그러면 비밀글로 바꾼 뒤에도 열리는 주소가
-- 생긴다).
--
-- ★ 왜 배너 버킷(user-banners)을 쓰지 않나
--
-- 배너는 "남의 사이트에 심는 고정 주소" 규칙이라 항상 같은 경로에
-- 덮어쓴다(주소가 절대 안 바뀌는 것이 목적). 공유 카드 사진은
-- 반대로 **바꿀 때마다 새 경로**여야 한다(SNS/CDN이 예전 사진을
-- 계속 보여주면 안 된다). 두 규칙이 정반대라 버킷을 섞지 않는다.
--
-- 객체 경로 규칙(코드 기준 — admin-image-setting.js의
-- buildImageSettingObjectPath와 같다):
--
--   user-share-cards/{user_id}/{uuid}
--
-- 기존 버킷·정책·테이블은 아무것도 건드리지 않는다. 그대로
-- 재실행해도 안전하다.
--
-- ※ Supabase SQL Editor에 붙여넣어 적용한다. supabase CLI로
--   적용하면 CLI가 이미 트랜잭션을 열므로 begin/commit 두 줄은
--   제거한다.
-- =========================================================

begin;


-- =========================================================
-- BUCKET
--
-- file_size_limit / allowed_mime_types는 걸지 않는다 —
-- user-favicons/user-cursors와 같은 규칙이고, 올리기 전에
-- core/lib/image-upload.js가 메타데이터 제거 + 압축(긴 변
-- 2048px)을 이미 한다.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('user-share-cards', 'user-share-cards', true)
on conflict (id) do nothing;


-- =========================================================
-- POLICIES — user-favicons와 완전히 같은 구조
--
--   owner_write : 자기 폴더({user_id}/...)에만 쓰기/삭제
--   public_read : 버킷 전체 읽기
-- =========================================================

drop policy if exists "user_share_cards_owner_write" on storage.objects;

create policy "user_share_cards_owner_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'user-share-cards'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-share-cards'
  and (storage.foldername(name))[1] = auth.uid()::text
);


drop policy if exists "user_share_cards_public_read" on storage.objects;

create policy "user_share_cards_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'user-share-cards');


commit;
