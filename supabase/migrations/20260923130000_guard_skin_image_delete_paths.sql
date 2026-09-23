-- =========================================================
-- STUDIO-LAYERS-MEDIA-1 (follow-up 2) — 삭제하는 **두 길 모두**에
-- 스킨 코드 직접 참조 guard
--
-- 선행:
--   20260907100000_create_skin_image_library.sql      (delete_skin_image)
--   20260923100000_delete_skin_image_everywhere.sql   (**프로덕션 적용됨**)
--   20260923120000_guard_skin_image_css_references.sql(guard 1차 — 적용 여부와
--                                                      무관하게 이 파일이 덮는다)
-- 감사:
--   supabase/tests/20260923_skin_image_css_reference_audit.sql (READ ONLY)
--
-- ★ 이 파일 하나만 실행해도 최종 상태가 같다.
--   20260923120000 을 실행했든 안 했든, 아래 세 함수를 모두
--   create or replace 하므로 결과가 동일하다. 기존 파일은 한 글자도
--   고치지 않는다(이미 적용된 migration 은 수정하지 않는다는 규칙).
--
-- 왜 다시 고치나 — 막지 못한 길이 하나 더 있었다
-- ----------------------------------------------
-- 1차 guard 는 delete_skin_image_everywhere() 에만 있었다. 그런데
-- 프런트는 **사용처를 세어 0곳이면 기존 delete_skin_image() 로 간다**
-- (studio/images/images-panel.js handleImagesPanelDelete). 그리고 그
-- "사용처"는 슬롯 연결(skin_version_image_slots)만 센다.
--
--   → 슬롯에는 안 걸려 있고 **CSS 에만 주소가 박힌** 이미지는
--     "사용처 0곳"으로 읽혀 확인 한 번에 곧바로 지워졌다.
--     지우고 나면 그 스킨의 그 자리가 404 가 된다.
--
-- 그것이 이번에 실제로 겪은 그 구멍이다. 그래서 guard 를 **두 함수가
-- 함께 쓰는 한 곳**으로 옮기고, 두 길 모두 그 문을 지나게 한다.
--
-- 무엇을 보나 (사용자 결정: 살아 있는 버전만)
-- -------------------------------------------
-- 호출자 소유 스킨의
--   · current_published_version_id  지금 공개 중인 그 화면
--   · current_draft_version_id      지금 편집 중인 그 화면
-- 의 content 전체(css · templates 의 html/css · js · regions)와,
-- 옛 모델 public.skin_image_slot_values.image_url.
--
-- ★ 지난 이력(history)은 **일부러 보지 않는다.**
--   과거 content 는 append-only 라 고쳐 쓸 수 없다. 거기까지 막으면
--   "한 번이라도 그렇게 저장했으면 영영 못 지우는 이미지"가 되어,
--   이 라운드가 없앤 막다른 길이 CSS 참조에 대해 그대로 되살아난다.
--   지난 버전을 Restore 하면 그 자리는 깨진 주소로 남고, 사용자는 그
--   draft 에서 고친다(docs 의 "남은 차이").
--
-- 무엇으로 찾나
-- -------------
-- 그 이미지의 storage_path(`{user_id}/{uuid}.{ext}` — 재사용하지 않는
-- 유일값)를 **부분 문자열로** 찾는다. public · render · signed 어떤
-- 주소 형태든 그 안에 이 경로가 그대로 들어 있다. LIKE 가 아니라
-- strpos() 라서 `_` 가 와일드카드로 읽히지 않는다.
--
-- 오류 모양
-- ---------
-- SQLSTATE 'IM001' — 프런트가 다른 실패와 갈라서 "Code 나 AI 로 먼저
-- 교체하세요"를 안내한다(studio/images/images-panel.js).
--
-- 바뀌지 않는 것
-- --------------
--   · 세 함수의 시그니처 그대로(파라미터를 더하면 오버로드가 생겨
--     PostgREST 호출이 모호해진다).
--   · delete_skin_image() 의 기존 거절(슬롯 참조가 있으면 거절) 그대로.
--   · delete_skin_image_everywhere() 의 순서 · 소유 검사 · 권한 그대로.
--   · Storage object 삭제는 여전히 클라이언트 몫이다.
--
-- 재실행
-- ------
-- create or replace 뿐이다. drop 도 테이블 변경도 없다.
--
-- ※ 이 프로젝트는 Supabase SQL Editor 에 붙여넣어 적용한다.
-- =========================================================

begin;


-- =========================================================
-- 0) 공용 판정 — "살아 있는 스킨 코드가 이 파일을 직접 가리키는가"
--
-- 두 삭제 함수가 같은 답을 쓰게 하려고 함수 하나로 둔다. 규칙이 두
-- 벌이 되면 한쪽만 느슨해진다.
--
-- 바깥에 열지 않는다 — 호출하는 두 함수가 security definer 라 소유자
-- 권한으로 실행되므로 grant 가 없어도 된다.
-- =========================================================

create or replace function public.skin_image_direct_reference_count(
  p_storage_path text,
  p_user_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(*)
        from public.skins k
        join public.skin_versions v
          on v.id in (k.current_published_version_id, k.current_draft_version_id)
       where k.user_id = p_user_id
         and strpos(v.content::text, p_storage_path) > 0
    )
    +
    (
      select count(*)
        from public.skin_image_slot_values sv
        join public.skins k2
          on k2.id = sv.skin_id
       where k2.user_id = p_user_id
         and strpos(sv.image_url, p_storage_path) > 0
    );
$$;

comment on function public.skin_image_direct_reference_count(text, uuid) is
  '호출자 소유 스킨의 **살아 있는 버전 둘**(current_published_version_id · current_draft_version_id)의 content 와 옛 skin_image_slot_values.image_url 이 이 storage_path 를 직접 가리키는 자리의 수. 슬롯 연결(skin_version_image_slots)은 세지 않는다 — 그쪽은 삭제 함수가 떼어 줄 수 있고, 이 함수는 **떼어 줄 수 없는 참조**(CSS/HTML 의 url)만 센다. 지난 이력은 보지 않는다: 과거 content 는 append-only 라 고칠 수 없어서 막으면 영영 지울 수 없는 이미지가 된다(STUDIO-LAYERS-MEDIA-1).';

revoke execute on function public.skin_image_direct_reference_count(text, uuid) from public;
revoke execute on function public.skin_image_direct_reference_count(text, uuid) from anon;
revoke execute on function public.skin_image_direct_reference_count(text, uuid) from authenticated;


-- =========================================================
-- 1) delete_skin_image — "쓰지 않는 이미지" 경로에도 같은 문
--
-- 20260907100000 의 그 함수에 guard 한 단계만 더한다. 나머지(슬롯 참조
-- 거절 · storage_path 반환)는 글자 그대로 같다.
-- =========================================================

create or replace function public.delete_skin_image(
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
  v_ref_count integer;
  v_direct integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_image_id is null then
    raise exception 'p_image_id must not be null';
  end if;

  select storage_path
    into v_storage_path
    from public.skin_images
    where id = p_image_id
      and user_id = v_user_id;

  if not found then
    raise exception 'image not found or not owned by caller';
  end if;

  -- ★ 더해진 단계 — 스킨 코드가 주소로 직접 쓰는 중이면 지우지 않는다
  v_direct := public.skin_image_direct_reference_count(v_storage_path, v_user_id);

  if v_direct > 0 then
    raise exception
      'this image is referenced directly by skin code (url in css/html) in % live skin version(s) — replace it in Code/AI and save/publish first',
      v_direct
      using errcode = 'IM001';
  end if;

  select count(*)
    into v_ref_count
    from public.skin_version_image_slots
    where image_id = p_image_id;

  if v_ref_count > 0 then
    raise exception
      'this image is still used by % saved skin version(s) — replace or clear those slots first',
      v_ref_count;
  end if;

  delete from public.skin_images
    where id = p_image_id
      and user_id = v_user_id;

  return v_storage_path;
end;
$$;

comment on function public.delete_skin_image(uuid) is
  '호출자 소유의 Skin 이미지 라이브러리 row 를 삭제하고 그 storage_path 를 반환한다(Storage object 삭제는 클라이언트 몫). 저장된 어떤 Skin 버전이라도 슬롯으로 그 이미지를 참조하면 거절한다 — 과거 발행 이력 포함이며 FK on delete restrict 가 최종 방어선이다. ★ follow-up(20260923130000): 슬롯을 거치지 않고 **살아 있는 스킨 코드(css/html 의 url)** 가 그 파일을 가리켜도 SQLSTATE IM001 로 거절한다 — 그 참조는 "사용처 0곳"으로 읽혀 곧바로 지워지던 구멍이었다.';

revoke execute on function public.delete_skin_image(uuid) from public;
revoke execute on function public.delete_skin_image(uuid) from anon;
grant execute on function public.delete_skin_image(uuid) to authenticated;


-- =========================================================
-- 2) delete_skin_image_everywhere — 같은 문을 공용 함수로
--
-- 1차 guard(20260923120000)가 함수 안에 적어 두었던 판정을 위 공용
-- 함수 호출로 바꾼다. 동작은 같다.
-- =========================================================

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

  -- 0) 직접 참조 guard — 슬롯을 떼기 **전에** 본다(반쪽 상태를 만들지 않는다)
  v_direct := public.skin_image_direct_reference_count(v_storage_path, v_user_id);

  if v_direct > 0 then
    raise exception
      'this image is referenced directly by skin code (url in css/html) in % live skin version(s) — replace it in Code/AI and save/publish first',
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
  '"사용처에서 제거하고 삭제" — 호출자 소유 스킨의 모든 버전(draft · published · 과거 이력)에서 이 이미지의 skin_version_image_slots 연결을 지운 뒤 skin_images row 를 지우고 storage_path 를 반환한다(Storage object 삭제는 클라이언트 몫). 공개 중인 버전의 연결도 지워지므로 공개 화면의 그 자리가 Publish 없이 비워진다 — 사용자에게 사용처를 보여 주고 확인받은 뒤에만 호출해야 한다(STUDIO-LAYERS-MEDIA-1). ★ follow-up(20260923130000): 슬롯을 떼기 전에 skin_image_direct_reference_count() 로 살아 있는 스킨 코드의 직접 참조를 보고, 있으면 아무것도 지우지 않고 SQLSTATE IM001 로 거절한다.';

revoke execute on function public.delete_skin_image_everywhere(uuid) from public;
revoke execute on function public.delete_skin_image_everywhere(uuid) from anon;
grant execute on function public.delete_skin_image_everywhere(uuid) to authenticated;


commit;
