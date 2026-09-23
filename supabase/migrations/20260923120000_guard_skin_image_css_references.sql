-- =========================================================
-- STUDIO-LAYERS-MEDIA-1 (follow-up) — CSS/HTML 직접 참조 guard
--
-- 선행: supabase/migrations/20260923100000_delete_skin_image_everywhere.sql
--       (**이미 프로덕션에 적용됨** — 그 파일은 한 글자도 고치지 않는다)
-- 참고: supabase/migrations/20260907100000_create_skin_image_library.sql,
--       docs/features/images/SKIN_IMAGE_LIBRARY_PLAN.md
--
-- 무엇을 고치나
-- -------------
-- delete_skin_image_everywhere() 는 **슬롯 연결**(skin_version_image_slots)
-- 만 본다. 그런데 스킨 코드는 슬롯을 거치지 않고 이미지 주소를 직접 박을
-- 수 있다 —
--
--   .hero { background-image: url("https://…/skin-images/<uid>/<uuid>.png"); }
--   <img src="https://…/skin-images/<uid>/<uuid>.png">
--
-- 이런 자리는 어떤 표에도 참조 row 가 없어서 "사용처 0곳"으로 읽혔고,
-- 그대로 지우면 **공개 화면이 깨졌다**(그 주소가 404 가 된다). 이 문서는
-- 그 구멍을 막는다: 지우기 전에 살아 있는 스킨 코드가 그 파일을 직접
-- 가리키는지 보고, 가리키면 **지우지 않는다**(fail closed).
--
-- 무엇으로 찾나 — storage_path 한 조각
-- ------------------------------------
-- 이미지마다 유일한 `{user_id}/{uuid}.{ext}` 다(그 파일 1번의 불변식 —
-- 경로는 재사용하지 않는다). public_url · render URL · signed URL 이
-- 무엇이든 그 안에는 이 경로가 그대로 들어 있으므로, 경로 한 조각을
-- **부분 문자열로** 찾으면 주소 형태를 열거하지 않아도 된다.
-- LIKE 가 아니라 strpos() 를 쓴다 — 경로에 `_` 가 들어와도 와일드카드로
-- 읽히지 않는다.
--
-- content 전체를 text 로 훑는다(css 뿐 아니라 templates 의 html · js 까지).
-- 슬롯 모델은 content 안에 주소를 넣지 않으므로(선언은 이름뿐이고 값은
-- skin_version_image_slots 에 있다) 여기서 걸리는 것은 **직접 참조뿐**이다.
--
-- 어디까지 보나 — 살아 있는 버전 둘 + 옛 슬롯 값
-- -----------------------------------------------
-- 호출자 소유 스킨의
--   · current_published_version_id  (지금 공개 중인 그 화면)
--   · current_draft_version_id      (지금 편집 중인 그 화면)
-- 그리고 public.skin_image_slot_values (도입 이전 모델의 URL 문자열 —
-- get_published_skin 이 legacy 버전에서 아직 폴백으로 읽는다).
--
-- ★ **지난 이력 전체를 보지 않는 이유**
--   슬롯 연결은 함수가 대신 떼어 줄 수 있지만 content 안의 url() 은
--   그럴 수 없다(버전은 append-only 이고, 과거 content 를 고쳐 쓰는 것은
--   이 프로젝트가 금지한 일이다). 그래서 "한 번이라도 그렇게 저장한 적이
--   있으면 영영 못 지운다"가 되어, 이 라운드가 없앤 그 막다른 길이 그대로
--   되살아난다. 사용자가 **실제로 고칠 수 있는 자리**(지금 공개본 · 지금
--   편집본)만 막고, 나머지는 문서의 "남은 차이"로 남긴다.
--
-- 바뀌지 않는 것
-- --------------
--   · 시그니처 `(uuid)` 그대로다 — 파라미터를 더하면 오버로드가 생겨
--     PostgREST 호출이 모호해진다(선행 문서의 그 관례).
--   · 슬롯 연결을 떼는 동작 · 순서(참조 제거 → row 삭제 → 파일 삭제) ·
--     소유 검사 · 권한은 그대로다.
--   · delete_skin_image() 도 그대로다.
--
-- 오류 모양
-- ---------
-- SQLSTATE 'IM001' 로 올린다 — 프런트가 "참조가 남아 거절됨"을 다른
-- 실패와 갈라서 안내할 수 있게 하는 표식이다(studio/images/images-panel.js).
--
-- 재실행
-- ------
-- create or replace 하나뿐이다. drop 도, 테이블 변경도 없다.
--
-- ※ 이 프로젝트는 Supabase SQL Editor 에 붙여넣어 적용한다.
-- =========================================================

begin;


create or replace function public.delete_skin_image_everywhere(
  p_image_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_storage_path text;
  v_direct integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_image_id is null then
    raise exception 'p_image_id must not be null';
  end if;

  -- 소유 확인 먼저 — 남의 이미지를 가리키면 아무것도 하지 않는다
  select storage_path
    into v_storage_path
    from public.skin_images
    where id = p_image_id
      and user_id = v_user_id;

  if not found then
    raise exception 'image not found or not owned by caller';
  end if;

  -- 0) 직접 참조 guard (이 follow-up 이 더한 단계)
  --
  --    살아 있는 버전 둘(공개 중 · 편집 중)의 content 와, 옛 모델의
  --    슬롯 값 URL 을 함께 센다. 하나라도 있으면 아무것도 지우지 않는다.
  select
    (
      select count(*)
        from public.skins k
        join public.skin_versions v
          on v.id in (k.current_published_version_id, k.current_draft_version_id)
       where k.user_id = v_user_id
         and strpos(v.content::text, v_storage_path) > 0
    )
    +
    (
      select count(*)
        from public.skin_image_slot_values sv
        join public.skins k2
          on k2.id = sv.skin_id
       where k2.user_id = v_user_id
         and strpos(sv.image_url, v_storage_path) > 0
    )
    into v_direct;

  if v_direct > 0 then
    raise exception
      'this image is referenced directly by skin code (url in css/html) in % live skin version(s) — remove that reference and save/publish first',
      v_direct
      using errcode = 'IM001';
  end if;

  -- 1) 호출자 소유 스킨의 모든 버전에서 연결을 뗀다
  delete from public.skin_version_image_slots s
   using public.skin_versions v,
         public.skins k
   where s.image_id = p_image_id
     and v.id = s.version_id
     and k.id = v.skin_id
     and k.user_id = v_user_id;

  -- 2) 이미지 row — 남은 참조가 있으면 FK 가 여기서 막고 전체가 롤백된다
  delete from public.skin_images
    where id = p_image_id
      and user_id = v_user_id;

  return v_storage_path;
end;
$$;

comment on function public.delete_skin_image_everywhere(uuid) is
  '"사용처에서 제거하고 삭제" — 호출자 소유 스킨의 모든 버전(draft · published · 과거 이력)에서 이 이미지의 skin_version_image_slots 연결을 지운 뒤 skin_images row 를 지우고 storage_path 를 반환한다(Storage object 삭제는 클라이언트 몫). 공개 중인 버전의 연결도 지워지므로 공개 화면의 그 자리가 Publish 없이 비워진다 — 사용자에게 사용처를 보여 주고 확인받은 뒤에만 호출해야 한다(STUDIO-LAYERS-MEDIA-1). ★ follow-up(20260923120000): 슬롯을 거치지 않고 스킨 코드(css/html 의 url)가 이 파일의 storage_path 를 직접 가리키면 SQLSTATE IM001 로 거절한다 — 살아 있는 버전 둘(current_published_version_id · current_draft_version_id)의 content 와 옛 skin_image_slot_values.image_url 을 본다. 과거 이력의 직접 참조는 고칠 방법이 없으므로 보지 않는다. 참조를 남기고 싶으면 기존 delete_skin_image() 를 쓴다(그쪽은 슬롯 참조가 있으면 거절한다).';

revoke execute on function public.delete_skin_image_everywhere(uuid) from public;
revoke execute on function public.delete_skin_image_everywhere(uuid) from anon;
grant execute on function public.delete_skin_image_everywhere(uuid) to authenticated;


commit;
