-- =========================================================
-- post_contents.ooc_content 잠금 — 수동 확인 스크립트
--
-- 대상 migration:
--   supabase/migrations/20260909100000_lock_down_post_contents_ooc.sql
--
-- 기존 supabase/tests/*.sql과 같은 형식: Supabase SQL Editor에 한 절씩
-- 붙여넣어 결과를 확인한다. 1~3절은 조회만 한다. 4~5절은 역할을 바꿔 실제로
-- SELECT/저장을 시도하므로 각 절 끝의 reset role까지 같이 실행한다.
-- <UUID_OWNER> / <UUID_OTHER> / <POST_ID> 자리는 실제 값으로 바꾼다.
--
-- 참고: 같은 검사를 WASM PostgreSQL(PGlite) 위에서 자동으로 돌린 결과가
-- 있다(40개 항목 통과, stub RLS). 이 파일은 **실제 Supabase 인스턴스**에서
-- 저장소에 없는 기존 RLS 정책·트리거와 함께 같은 결과가 나오는지 확인하기
-- 위한 것이다.
-- =========================================================


-- =========================================================
-- 1) 컬럼 단위 GRANT가 의도대로인가
-- =========================================================

select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'post_contents'
  and grantee in ('anon', 'authenticated')
order by grantee, column_name, privilege_type;
-- 기대: 네 행뿐 —
--   anon          content  SELECT
--   anon          post_id  SELECT
--   authenticated content  SELECT
--   authenticated post_id  SELECT
-- ooc_content 가 한 행이라도 있으면 실패(SELECT는 물론 INSERT/UPDATE도 없다 —
-- 쓰기는 아래 upsert_own_post_content RPC로만 한다).

select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'post_contents'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
-- 기대: authenticated DELETE 한 행뿐. (테이블 단위 SELECT가 남아 있으면
--       컬럼 GRANT가 무의미하다 — 반드시 이 한 행이어야 한다.)


-- =========================================================
-- 2) RPC 권한 / 속성
-- =========================================================

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('get_own_post_content', 'upsert_own_post_content')
order by routine_name, grantee;
-- 기대: 두 함수 각각 authenticated EXECUTE, service_role EXECUTE
--       (+ 함수 소유자 postgres). PUBLIC / anon 행이 있으면 실패.

select proname, prosecdef, proconfig
from pg_proc
where proname in ('get_own_post_content', 'upsert_own_post_content')
order by proname;
-- 기대: 둘 다 prosecdef = true, proconfig = {search_path=}


-- =========================================================
-- 3) 기존 RLS 정책이 그대로인가 (migration은 정책을 건드리지 않는다)
-- =========================================================

select relrowsecurity
from pg_class
where relname = 'post_contents';
-- 기대: true

select policyname, cmd, roles
from pg_policies
where tablename = 'post_contents'
order by policyname;
-- 기대: migration 전과 같은 목록.


-- =========================================================
-- 4) 역할을 바꿔 실제로 시도 — anon
--    (SQL Editor는 postgres로 실행되므로 set role로 내려간다)
-- =========================================================

set role anon;

select post_id, length(content) as content_len
from public.post_contents
order by post_id
limit 5;
-- 기대: 공개 글의 행만(기존 RLS), content는 정상적으로 읽힘.

select post_id, ooc_content from public.post_contents limit 1;
-- 기대: ERROR 42501 permission denied for table post_contents

select post_id from public.post_contents where ooc_content is not null limit 1;
-- 기대: ERROR 42501 (WHERE 절 참조 우회도 막힌다)

select * from public.post_contents limit 1;
-- 기대: ERROR 42501 (select * 는 ooc_content를 포함한다)

select * from public.get_own_post_content(<POST_ID>);
-- 기대: ERROR 42501 permission denied for function get_own_post_content

select public.upsert_own_post_content(<POST_ID>, 'x', 'x');
-- 기대: ERROR 42501 permission denied for function upsert_own_post_content

reset role;


-- =========================================================
-- 5) 역할을 바꿔 실제로 시도 — authenticated (다른 계정 / 소유자)
-- =========================================================

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<UUID_OTHER>","role":"authenticated"}', true);

select ooc_content from public.post_contents where post_id = <POST_ID>;
-- 기대: ERROR 42501 (다른 로그인 사용자도 남의 OOC를 못 읽는다)

select * from public.get_own_post_content(<POST_ID>);
-- 기대: 0행 (남의 글)

select public.upsert_own_post_content(<POST_ID>, '<p>hijack</p>', 'x');
-- 기대: ERROR 42501 not the owner of post …  (본문이 바뀌지 않아야 한다)

select set_config('request.jwt.claims',
  '{"sub":"<UUID_OWNER>","role":"authenticated"}', true);

select * from public.get_own_post_content(<POST_ID>);
-- 기대: 1행 — content + ooc_content

reset role;

-- 위 5절에서 남의 글 저장이 정말 막혔는지 확인(postgres 권한으로 조회)
select post_id, length(content) as content_len, ooc_content
from public.post_contents
where post_id = <POST_ID>;
-- 기대: content가 hijack으로 바뀌지 않았다.


-- =========================================================
-- 6) 프론트 회귀 확인(브라우저)
-- =========================================================
-- · 방문자: 공개 글 본문 표시, 비밀글 gate → 정답 시 본문
--   (get_secret_post_content — SECURITY DEFINER라 이 변경의 영향을 받지 않는다).
-- · 소유자: 글 수정 폼(?edit=1)에 본문과 OOC가 채워진다
--   (네트워크에 rpc/get_own_post_content 1건, post_contents 테이블 요청 없음).
-- · 소유자: OOC를 고쳐 저장 → 다시 열었을 때 반영
--   (네트워크에 rpc/upsert_own_post_content, post_contents로 가는 POST/PATCH 없음).
-- · 새 글 작성 → 본문/OOC 저장(같은 RPC의 INSERT 경로).
-- · anon key로 직접:
--     curl "$SUPABASE_URL/rest/v1/post_contents?select=ooc_content&limit=1" \
--       -H "apikey: $ANON"
--   → 401 {"code":"42501",…}
