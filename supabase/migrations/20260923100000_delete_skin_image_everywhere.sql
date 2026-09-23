-- =========================================================
-- STUDIO-LAYERS-MEDIA-1 — 사용 중인 이미지도 지울 수 있게
--
-- 참고: supabase/migrations/20260907100000_create_skin_image_library.sql
--       (skin_images · skin_version_image_slots · delete_skin_image),
--       docs/features/images/SKIN_IMAGE_LIBRARY_PLAN.md
--
-- 무엇이 막혀 있었나
-- ------------------
-- delete_skin_image(p_image_id) 는 그 이미지를 참조하는 버전이 하나라도
-- 있으면 거절한다. 그리고 참조를 지울 방법이 **클라이언트에 없다**:
--
--   · public.skin_version_image_slots 는 authenticated 에게 select 만
--     grant 돼 있다(update/delete 없음)
--   · 그 표에 쓰는 유일한 경로는
--     save_skin_draft_version_with_image_slots() 이고, 그것은 **새 버전
--     row 에 insert** 만 한다(과거 버전을 고치지 않는다)
--
-- 그래서 Save 를 한 번이라도 한 이미지는 화면에서 비워도 영영 지울 수
-- 없었고, Storage 용량도 돌려받을 수 없었다.
--
-- 이 migration 이 하는 일
-- -----------------------
--   delete_skin_image_everywhere(p_image_id)
--     = "사용처에서 제거하고 삭제". 호출자 소유 스킨의 **모든 버전**
--       (draft · published · 과거 이력)에서 그 이미지의 연결 row 를
--       지우고, skin_images row 를 지우고, storage_path 를 돌려준다.
--
-- 기존 delete_skin_image() 는 **한 줄도 바꾸지 않는다**. 쓰지 않는
-- 이미지의 삭제는 지금까지처럼 그 함수를 쓰고, 참조가 있는 이미지만
-- 사용자가 한 번 더 확인한 뒤 이 함수로 온다(프런트:
-- studio/images/images-panel.js · studio/images/skin-image-library.js).
--
-- 왜 "모든 버전"인가 — 그리고 그 위험
-- -----------------------------------
-- 연결은 버전 단위다(그 파일 3번). 과거 버전이 참조하는 이미지를 남겨
-- 두면 "지울 수 없는 이미지"가 계속 쌓이고, 사용자는 왜 용량이 줄지
-- 않는지 알 수 없다. 그래서 **명시적으로 확인받은 뒤에만** 전부 지운다.
--
--   ★ 공개 중인 버전의 연결도 지워진다 = 공개 화면의 그 자리가
--     Publish 없이 비워진다. 이 함수를 부르기 전에 프런트가 "공개 중인
--     스킨에서도 쓰고 있다"를 반드시 사람에게 보여 줘야 한다. 이
--     migration 은 그 확인을 대신하지 않는다.
--   ★ 되돌릴 수 없다. Studio 의 ↶ 와 아무 관계가 없다(그것은 메모리
--     안의 working draft 기록이다).
--
-- 남의 것은 건드리지 않는다
-- -------------------------
-- 지우는 연결은 **호출자 소유 스킨의 버전**뿐이다. 다른 사용자의 버전이
-- 그 이미지를 참조하고 있으면(지금 구조에서는 생길 수 없다 — 이미지는
-- 소유자만 연결할 수 있다) 마지막 delete 가 FK on delete restrict 에
-- 걸려 함수 전체가 롤백된다. 즉 "일부만 지워진" 상태가 남지 않는다.
--
-- Storage object 는 여기서 지우지 않는다 — 돌려준 storage_path 로
-- 클라이언트가 own-folder 권한으로 지운다(delete_skin_image 와 같은
-- 순서다: 참조 제거 → DB row 삭제 → 파일 삭제. 반대로 하면 "파일만
-- 사라지고 참조는 남은" 깨진 화면이 된다).
--
-- 재실행
-- ------
-- create or replace 하나뿐이라 그대로 다시 실행할 수 있다. drop 하는
-- 문장은 없다.
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
  '"사용처에서 제거하고 삭제" — 호출자 소유 스킨의 모든 버전(draft · published · 과거 이력)에서 이 이미지의 skin_version_image_slots 연결을 지운 뒤 skin_images row 를 지우고 storage_path 를 반환한다(Storage object 삭제는 클라이언트 몫). 공개 중인 버전의 연결도 지워지므로 공개 화면의 그 자리가 Publish 없이 비워진다 — 사용자에게 사용처를 보여 주고 확인받은 뒤에만 호출해야 한다(STUDIO-LAYERS-MEDIA-1). 참조를 남기고 싶으면 기존 delete_skin_image() 를 쓴다(그쪽은 참조가 있으면 거절한다).';

revoke execute on function public.delete_skin_image_everywhere(uuid) from public;
revoke execute on function public.delete_skin_image_everywhere(uuid) from anon;
grant execute on function public.delete_skin_image_everywhere(uuid) to authenticated;


commit;
