-- =========================================================
-- MANUAL TEST — AI SKIN PHASE 1B Slice 0: Draft Write RPC 4종
-- (create_skin_with_initial_version / save_skin_draft_version /
--  publish_skin / restore_skin_version)
--
-- 이 파일은 migration이 아니다. Supabase SQL Editor에서 사람이
-- 섹션 단위로 하나씩 실행한다. 값을 바꾸는 섹션은 전부
-- BEGIN ... ROLLBACK으로 감싸 실제 운영 데이터를 건드리지 않는다.
--
-- 검증 대상:
--   [[20260905100000_add_skin_draft_write_rpcs.sql]]
--
-- 원리(role 흉내): [[20260904_skins_manual_test.sql]]와 동일 기법 —
-- request.jwt.claims GUC에 {"sub": uuid}를 세팅하고 SET LOCAL ROLE로
-- authenticated/anon을 흉내낸다. RPC 자체는 SECURITY DEFINER라
-- 함수 내부는 상승된 권한으로 실행되지만, auth.uid()는 호출 시점의
-- JWT claim을 그대로 읽으므로 이 기법으로 "누가 호출했는지"를
-- 정확히 흉내낼 수 있다.
--
-- <OWNER_UUID>는 실제 profiles.user_id 하나로 치환해서 실행한다.
-- 각 함수 호출의 반환값(uuid)은 다음 단계의 <SKIN_ID>/<VERSION_ID_*>로
-- 손으로 옮겨 넣는다(SQL Editor는 세션 변수를 못 쓰므로 수동 치환,
-- 기존 파일과 동일 관례).
-- =========================================================


-- =========================================================
-- 0) 사전 준비
-- =========================================================

-- 0-1) OWNER_UUID로 쓸 실제 profiles.user_id 하나 확인
--      (이미 skins row가 있는 계정은 피한다 — C 섹션이 "최초 생성"부터
--      시작하므로 activ skin이 없는 사용자여야 C-1이 성공한다)
select p.user_id, p.slug
  from public.profiles p
  where not exists (
    select 1 from public.skins s where s.user_id = p.user_id and s.is_active
  )
  limit 1;


-- =========================================================
-- A) GRANT 확인 — role 흉내 없이 카탈로그로 확인
--
-- 기대: 4개 함수 전부 anon=false, authenticated=true.
-- (public에 대한 execute는 카탈로그 함수가 별도로 노출하지 않으므로
-- anon/authenticated 두 role만 확인 — REVOKE ... FROM PUBLIC은
-- "기본으로 상속받는 권한이 없다"는 뜻이라 anon/authenticated에 대한
-- 명시적 GRANT 여부가 실질적인 판정 기준이다)
-- =========================================================

select
  has_function_privilege('anon', 'public.create_skin_with_initial_version(jsonb, smallint, text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.create_skin_with_initial_version(jsonb, smallint, text)', 'execute') as auth_can_exec;

select
  has_function_privilege('anon', 'public.save_skin_draft_version(uuid, jsonb, smallint, text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.save_skin_draft_version(uuid, jsonb, smallint, text)', 'execute') as auth_can_exec;

select
  has_function_privilege('anon', 'public.publish_skin(uuid)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.publish_skin(uuid)', 'execute') as auth_can_exec;

select
  has_function_privilege('anon', 'public.restore_skin_version(uuid, uuid, text)', 'execute') as anon_can_exec,
  has_function_privilege('authenticated', 'public.restore_skin_version(uuid, uuid, text)', 'execute') as auth_can_exec;


-- =========================================================
-- B) anon 역할로 호출 — 전부 permission denied 기대
-- =========================================================

begin;
set local role anon;
select public.create_skin_with_initial_version('{}'::jsonb, 1, 'x');
rollback;

begin;
set local role anon;
select public.save_skin_draft_version(gen_random_uuid(), '{}'::jsonb, 1, null);
rollback;

begin;
set local role anon;
select public.publish_skin(gen_random_uuid());
rollback;

begin;
set local role anon;
select public.restore_skin_version(gen_random_uuid(), gen_random_uuid(), null);
rollback;


-- =========================================================
-- C) 소유자 정상 흐름 — 최초 생성 → draft 저장 → publish →
--    발행 후 첫 편집 → restore
--
-- <OWNER_UUID>를 0-1에서 확인한 실제 profiles.user_id로 치환.
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;

-- C-1) 최초 생성 — skins row + 첫 skin_versions row + draft 포인터까지
--      한 번에. 반환값을 <SKIN_ID>로 사용.
select public.create_skin_with_initial_version(
  '{"schemaVersion":1,"html":"<article>v1</article>","css":"","imageSlots":[],"regions":[],"metadata":{"generatedBy":"deterministic-v1"}}'::jsonb,
  1,
  'PHASE1B 테스트 Skin'
);

select id, current_draft_version_id, current_published_version_id
  from public.skins where id = '<SKIN_ID>';
  -- current_draft_version_id not null, current_published_version_id = NULL 기대.
  -- current_draft_version_id 값을 <VERSION_ID_1>로 사용.

select id, content ->> 'html' as html
  from public.skin_versions where skin_id = '<SKIN_ID>';
  -- 1 row, html = "<article>v1</article>" 기대.

-- C-2) 이미 active skin이 있는 상태에서 다시 최초 생성 시도 — 거절 기대
select public.create_skin_with_initial_version('{}'::jsonb, 1, 'second');
  -- 예외 기대: "an active skin already exists for this user"

-- C-3) draft 저장 — 새 skin_versions row 추가 + draft 포인터 이동.
--      반환값을 <VERSION_ID_2>로 사용.
select public.save_skin_draft_version(
  '<SKIN_ID>',
  '{"schemaVersion":1,"html":"<article>v2</article>","css":"","imageSlots":[],"regions":[],"metadata":{}}'::jsonb,
  1,
  '두 번째 draft'
);

select count(*) from public.skin_versions where skin_id = '<SKIN_ID>';
  -- 2 기대(v1이 이력으로 남아있음, append-only)

select current_draft_version_id, current_published_version_id
  from public.skins where id = '<SKIN_ID>';
  -- current_draft_version_id = <VERSION_ID_2>, current_published_version_id = NULL 기대

-- C-4) Publish — 새 row 없이 포인터만 이동
select public.publish_skin('<SKIN_ID>');

select current_draft_version_id, current_published_version_id
  from public.skins where id = '<SKIN_ID>';
  -- 둘 다 <VERSION_ID_2> 기대(같은 row를 동시에 가리킴)

select count(*) from public.skin_versions where skin_id = '<SKIN_ID>';
  -- 여전히 2 기대(publish는 새 row를 만들지 않음)

-- C-5) 발행 후 첫 편집 — save_skin_draft_version을 다시 호출하는 것만으로
--      draft/published가 다시 갈라지는지 확인. 반환값을 <VERSION_ID_3>로 사용.
select public.save_skin_draft_version(
  '<SKIN_ID>',
  '{"schemaVersion":1,"html":"<article>v3</article>","css":"","imageSlots":[],"regions":[],"metadata":{}}'::jsonb,
  1,
  '발행 후 첫 편집'
);

select current_draft_version_id, current_published_version_id
  from public.skins where id = '<SKIN_ID>';
  -- current_draft_version_id = <VERSION_ID_3>(새 row),
  -- current_published_version_id는 여전히 <VERSION_ID_2>(발행본은 그대로) 기대

-- C-6) Restore — v1(<VERSION_ID_1>)로 복원. 반환값을 <VERSION_ID_4>로 사용.
select public.restore_skin_version('<SKIN_ID>', '<VERSION_ID_1>', '복원 테스트');

select count(*) from public.skin_versions where skin_id = '<SKIN_ID>';
  -- 4 기대(v1/v2/v3 전부 이력으로 남고 새 row 하나 추가)

select sv.content ->> 'html' as html
  from public.skins s
  join public.skin_versions sv on sv.id = s.current_draft_version_id
  where s.id = '<SKIN_ID>';
  -- "<article>v1</article>" 기대(v1 content가 그대로 복제됨)

select current_published_version_id from public.skins where id = '<SKIN_ID>';
  -- 여전히 <VERSION_ID_2> 기대(restore는 published에 영향 없음)

rollback; -- 전부 원복. D/E에서 이어서 검증하려면 이 섹션을 COMMIT으로
          -- 바꿔 실행(끝나면 G 정리 섹션으로 지운다).


-- =========================================================
-- D) 소유권 위반 — 다른 사용자가 남의 skin_id로 호출
--
-- C 섹션을 COMMIT으로 실행해 <SKIN_ID>/<VERSION_ID_1>이 실제로
-- 남아있어야 의미 있는 테스트다.
-- =========================================================

begin;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
set local role authenticated;

select public.save_skin_draft_version('<SKIN_ID>', '{}'::jsonb, 1, '탈취 시도');
  -- 예외 기대: "skin not found or not owned by caller"

select public.publish_skin('<SKIN_ID>');
  -- 예외 기대: "skin not found or not owned by caller"

select public.restore_skin_version('<SKIN_ID>', '<VERSION_ID_1>', null);
  -- 예외 기대: "skin not found or not owned by caller"

rollback;


-- =========================================================
-- E) 엣지 케이스
-- =========================================================

-- E-1) draft가 아직 없는 skin에 publish_skin 시도 — 거절 기대
--      (정상 흐름에서는 create_skin_with_initial_version이 항상 draft를
--      함께 만들어주므로 이 상태는 인위적으로만 재현 가능)
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;

insert into public.skins (user_id, title, is_active)
values ('<OWNER_UUID>', '빈 skin', false)
returning id;
  -- 반환된 id를 <EMPTY_SKIN_ID>로 사용 (is_active=false로 만들어
  -- skins_active_per_user_idx와 충돌하지 않게 함 — C 섹션을 COMMIT
  -- 했다면 이미 activ skin이 있으므로)

select public.publish_skin('<EMPTY_SKIN_ID>');
  -- 예외 기대: "cannot publish: this skin has no draft version yet"

rollback;

-- E-2) 다른 skin 소속 버전을 restore 소스로 지정 — 거절 기대
--      (C를 COMMIT해서 <SKIN_ID>가 남아있다는 전제)
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;

insert into public.skins (user_id, title, is_active)
values ('<OWNER_UUID>', '다른 skin', false)
returning id;
  -- 반환된 id를 <OTHER_SKIN_ID>로 사용

insert into public.skin_versions (skin_id, schema_version, content)
values ('<OTHER_SKIN_ID>', 1, '{}'::jsonb)
returning id;
  -- 반환된 id를 <OTHER_VERSION_ID>로 사용

select public.restore_skin_version('<SKIN_ID>', '<OTHER_VERSION_ID>', null);
  -- 예외 기대: "source version not found for this skin"
  -- (같은 사용자 소유라도 skin_id가 다르면 거절되어야 함)

rollback;

-- E-3) 필수 인자 NULL — 거절 기대
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<OWNER_UUID>')::text, true);
set local role authenticated;

select public.save_skin_draft_version(null, '{}'::jsonb, 1, null);
  -- 예외 기대: "p_skin_id must not be null"

select public.save_skin_draft_version('<SKIN_ID>', null, 1, null);
  -- 예외 기대: "p_content must not be null"

rollback;


-- =========================================================
-- F) 정리 — C/D/E를 COMMIT으로 실행해 실제 데이터를 남겼다면 테스트 후 삭제
-- =========================================================

-- delete from public.skins where title in ('PHASE1B 테스트 Skin', '빈 skin', '다른 skin');
--   (on delete cascade로 skin_versions/skin_image_slot_values도 함께 삭제됨)
