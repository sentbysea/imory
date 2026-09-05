-- =========================================================
-- PHASE 1A Slice 4 — "vibe" 계정에 실제 published Skin을 심는
-- 수동 시드 스크립트 (자체 완결형 — placeholder 없음).
--
-- static-test-skin.json(Slice 2) 내용에 banners.items repeat
-- 바인딩을 추가한 실제 콘텐츠를 쓴다(vibe 계정에는 실제 배너
-- 2개가 이미 있음 — category_id=4, "BANNER" type=banner —
-- 실렌더로 확인해 볼 수 있게).
--
-- 이전 버전(placeholder <SKIN_ID>/<VERSION_ID> 수동 치환 방식)은
-- Supabase SQL Editor에서 "invalid input syntax for type uuid"
-- 오류를 냈다 — 여러 statement를 각각 실행하며 반환된 id를 손으로
-- 복붙해야 하는 구조가 애초에 실수하기 쉬웠다. 이 버전은 단일
-- DO block(plpgsql) 안에서 skin_id/version_id를 변수로 생성해
-- 그대로 재사용하므로 위에서 아래로 한 번에 실행하면 끝난다.
--
-- SQL Editor는 이미 RLS를 우회하는 특권 role로 연결되므로(이전
-- 버전에 있던 set_config/set local role authenticated로 vibe
-- 세션을 흉내내는 절차는 필요 없다 — user_id 컬럼을 직접
-- vibe로 명시하면 소유권은 그걸로 충분히 결정된다), 이 스크립트는
-- 그 부분을 뺐다.
--
-- 2026-09-05 수정 — 지난 실행이 skins row를 하나도 남기지 못한 채
-- 끝난 사고 원인: PostgreSQL은 세미콜론으로 구분된 여러 statement를
-- 한 번의 "Run"으로 같이 보내면(SQL Editor가 에디터 전체 내용을
-- 그렇게 보낸다) 그 전체를 암묵적 트랜잭션 하나로 묶는다(문서 내
-- 명시적 BEGIN/COMMIT이 없는 한). 그래서 DO block 안의 insert가
-- 실제로 성공해도, 그 뒤에 이어지는 어떤 statement(2절/3절 확인용
-- select 등)가 하나라도 실패하면 DO block의 insert까지 전부
-- rollback된다 — "DO block 자체가 원자적으로 실행됨"이라는 이전
-- 설명은 DO block을 단독으로 실행할 때만 맞는 말이었고, 파일
-- 전체를 한 번에 실행하는 실제 사용 방식과는 맞지 않았다. 이번
-- 버전은 DO block을 명시적 begin/commit으로 직접 감싸서, 파일의
-- 다른 부분에서 무슨 일이 나든 이 insert만은 독립적으로 즉시
-- commit되도록 고쳤다.
--
-- 재실행 안전성: 이 스크립트가 만든 이전 테스트 skin(제목이
-- 'Slice 4 검증용 Skin'인 것)이 이미 있으면 지우고 새로 만든다
-- (on delete cascade로 skin_versions/skin_image_slot_values도
-- 함께 정리됨). 그 제목이 아닌 다른 active skin이 이미 있으면
-- (partial unique index상 사용자당 active skin은 1개뿐이라)
-- 조용히 덮어쓰지 않고 명확한 에러로 멈춘다.
--
-- vibe.user_id = f9764dbf-b490-4625-b4a7-a1a650096b84
-- (2026-09-04 기준 anon 공개 조회로 확인 — profiles.slug='vibe')
-- =========================================================


-- ---------------------------------------------------------
-- 0) 실행 전 확인(선택) — 실행 후 상태와 비교해보고 싶다면 먼저
--    한번 보고 시작해도 된다. 아래 DO block 실행에는 필요 없음.
-- ---------------------------------------------------------

select user_id, slug, home_mode
from public.profiles
where slug = 'vibe';


-- ---------------------------------------------------------
-- 1) 시드 본체 — 이 블록 하나만 실행하면 skins/skin_versions/
--    skin_image_slot_values가 전부 채워지고 즉시 published 상태가
--    된다. 명시적 begin/commit으로 감싸 이 insert가 독립적인
--    트랜잭션으로 즉시 commit되도록 한다 — 아래 2절/3절 확인용
--    select가 파일 전체를 한 번에 실행하는 도중 무엇이 실패하든
--    이 insert를 되돌리지 못한다(위 2026-09-05 수정 설명 참고).
-- ---------------------------------------------------------

begin;

do $$
declare
  v_owner_id uuid := 'f9764dbf-b490-4625-b4a7-a1a650096b84';
  v_skin_id uuid;
  v_version_id uuid;
  v_existing_skin_id uuid;
  v_other_active_title text;
begin

  -- 1-1) 이전 실행이 남긴 동명 테스트 skin이 있으면 정리
  select id into v_existing_skin_id
  from public.skins
  where user_id = v_owner_id
    and title = 'Slice 4 검증용 Skin'
  limit 1;

  if v_existing_skin_id is not null then
    delete from public.skins where id = v_existing_skin_id;
    raise notice '기존 Slice 4 테스트 skin(id=%)을 정리했습니다.', v_existing_skin_id;
  end if;

  -- 1-2) 이 테스트 skin이 아닌 다른 active skin이 이미 있다면
  --      (partial unique index: user_id당 active skin 1개)
  --      조용히 덮어쓰지 않고 명확하게 멈춘다.
  select title into v_other_active_title
  from public.skins
  where user_id = v_owner_id
    and is_active
  limit 1;

  if v_other_active_title is not null then
    raise exception
      'vibe 계정에 이미 다른 active skin("%")이 있습니다 — 이 테스트 스크립트가 덮어쓰지 않도록 멈춥니다. 필요하면 그 skin을 먼저 비활성화(is_active=false)하거나 직접 정리한 뒤 다시 실행하세요.',
      v_other_active_title;
  end if;

  -- 1-3) skins row 생성
  insert into public.skins (user_id, title)
  values (v_owner_id, 'Slice 4 검증용 Skin')
  returning id into v_skin_id;

  -- 1-4) 버전 생성(static-test-skin.json + banners repeat 추가)
  insert into public.skin_versions (skin_id, schema_version, content, label)
  values (
    v_skin_id,
    1,
    '{
      "schemaVersion": 1,
      "html": "<article class=\"skin-home\"><header class=\"skin-home-header\"><h1 data-imory-bind=\"site.title\"></h1></header><section class=\"skin-profile\"><img class=\"skin-profile-avatar\" data-imory-src=\"profile.avatarUrl\" alt=\"profile avatar\"><p class=\"skin-profile-nickname\" data-imory-bind=\"profile.nickname\"></p><p class=\"skin-profile-bio\" data-imory-if=\"profile.bio\" data-imory-bind=\"profile.bio\"></p></section><nav class=\"skin-nav\"><ul><li data-imory-repeat=\"navigation.categories\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.name\"></a></li></ul></nav><section class=\"skin-banners\"><ul data-imory-if=\"banners.items\"><li data-imory-repeat=\"banners.items\"><a data-imory-href=\"item.href\"><img data-imory-src=\"item.imageUrl\" alt=\"banner\"></a></li></ul></section><section class=\"skin-recent-posts\"><h2>Recent Posts</h2><ul data-imory-if=\"home.recentPosts\"><li data-imory-repeat=\"home.recentPosts\"><a data-imory-href=\"item.href\" data-imory-bind=\"item.title\"></a></li></ul></section></article>",
      "css": ".skin-home { font-family: system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 16px; } .skin-profile-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; display: block; } .skin-banners img { max-width: 120px; display: block; margin: 4px 0; } .skin-nav ul, .skin-recent-posts ul, .skin-banners ul { list-style: none; padding: 0; margin: 8px 0; } .skin-nav li, .skin-recent-posts li, .skin-banners li { margin: 4px 0; }",
      "imageSlots": [
        { "name": "profile", "label": "프로필 사진", "required": false, "aspectRatioHint": "1:1" }
      ],
      "regions": [],
      "metadata": {
        "title": "Slice 4 Vibe Seed Skin",
        "generatedBy": "manual",
        "supports": { "home": true, "list": false, "post": false },
        "requiredContext": ["site.title", "profile.nickname", "navigation.categories", "banners.items", "home.recentPosts"]
      }
    }'::jsonb,
    'Slice 4 검증용 초안 1'
  )
  returning id into v_version_id;

  -- 1-5) draft/published 포인터를 한 번에 같은 버전으로 설정
  --      (발행 직후라 draft==published인 정상 상태, 설계 문서 2-2절)
  update public.skins
  set current_draft_version_id = v_version_id,
      current_published_version_id = v_version_id
  where id = v_skin_id;

  -- 1-6) 이미지 슬롯 값(프로필 사진) — vibe의 실제 배너 이미지 중
  --      하나를 재사용(새 외부 의존성 추가하지 않기 위해, 실제로
  --      로드되는 이미지임이 이미 확인됨)
  insert into public.skin_image_slot_values (skin_id, slot_name, image_url)
  values (
    v_skin_id,
    'profile',
    'https://firebasestorage.googleapis.com/v0/b/lovelog-cc579.firebasestorage.app/o/u%2FPsRQ1O8Qjfg0VA8h9L715XieEi82%2Frestore-1786556598461-5.jpeg?alt=media&token=fee3c146-1a69-483c-a4e3-c9c650afed82'
  );

  raise notice 'Slice 4 시드 완료 — skin_id=%, version_id=%', v_skin_id, v_version_id;

end $$;

commit;


-- ---------------------------------------------------------
-- 2) 생성된 상태 확인 — 위 commit이 끝난 뒤이므로 이 select들이
--    설령 실패하더라도(예: 컬럼명 오타) 1)에서 이미 commit된
--    row에는 영향이 없다.
-- ---------------------------------------------------------

select
  s.id as skin_id,
  s.title,
  s.is_active,
  s.current_draft_version_id,
  s.current_published_version_id,
  v.id as version_id,
  v.schema_version,
  v.label
from public.skins s
join public.skin_versions v
  on v.id = s.current_published_version_id
where s.user_id = 'f9764dbf-b490-4625-b4a7-a1a650096b84'
  and s.title = 'Slice 4 검증용 Skin';

select *
from public.skin_image_slot_values
where skin_id = (
  select id from public.skins
  where user_id = 'f9764dbf-b490-4625-b4a7-a1a650096b84'
    and title = 'Slice 4 검증용 Skin'
  order by created_at desc
  limit 1
);


-- ---------------------------------------------------------
-- 3) 공개 read 경로(get_published_skin RPC)로도 확인 — 실제
--    /vibe 방문 전에 RPC가 기대한 모양을 돌려주는지 SQL 레벨에서
--    먼저 확인
-- ---------------------------------------------------------

select public.get_published_skin('f9764dbf-b490-4625-b4a7-a1a650096b84'::uuid);

-- 이 파일에는 의도적으로 cleanup(delete) 문을 넣지 않는다 — Slice 4
-- live 검증(실제 /vibe 방문 확인)이 끝날 때까지 이 테스트 skin은
-- DB에 그대로 남아 있어야 한다. 검증이 완전히 끝난 뒤 정리하고
-- 싶다면 그때 별도로
--   delete from public.skins where title = 'Slice 4 검증용 Skin';
-- 를 직접 실행한다(skin_versions/skin_image_slot_values는 on delete
-- cascade로 함께 삭제됨) — 이 스크립트를 재실행할 필요는 없다.
