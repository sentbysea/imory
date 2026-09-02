-- posts.secret_password_hash 컬럼이 anon/authenticated에게 그대로
-- SELECT되는 문제 수정.
--
-- 배경: posts 테이블은 지금까지 이 마이그레이션들과 달리 column-level
-- GRANT를 받은 적이 없어서, Supabase 프로젝트 생성 시 기본으로 걸리는
-- 테이블 전체 GRANT(anon/authenticated에 대한 select/insert/update/delete)가
-- 그대로 살아있었다. RLS는 "어떤 행을 볼 수 있는가"만 걸러줄 뿐 컬럼을
-- 가리지 못하므로, 이 상태에서는 비로그인 사용자가
-- `posts?select=secret_password_hash` 또는 `select=*`를 직접 호출하면
-- bcrypt 해시가 그대로 반환된다.
--
-- 설계 원칙은 기존 마이그레이션과 동일하다(참고:
-- supabase/migrations/20260830140000_rls_profiles_app_config_home_customize.sql):
--   RLS(행 단위) + column-level GRANT(열 단위)를 함께 쓴다.
-- 여기서는 posts의 기존 RLS 정책(공개/비밀글 전체 공개, 비공개글은
-- 소유자만 등)은 전혀 손대지 않고, 컬럼 단위 권한만 다시 정리한다.
--
-- 주의: 테이블 단위 SELECT/INSERT/UPDATE/DELETE 권한이 남아있으면
-- column-level REVOKE만으로는 차단되지 않는다(테이블 단위 권한이
-- 모든 컬럼에 대한 접근을 별도로 허용하기 때문). 그래서 먼저 전체
-- 권한을 회수한 뒤, 필요한 컬럼만 다시 GRANT한다.

-- 0) RLS가 꺼져 있을 가능성에 대비한 안전장치. 이미 켜져 있으면 no-op이고,
--    기존에 정의된 정책들은 그대로 유지된다.
alter table public.posts enable row level security;

-- 1) anon/authenticated가 posts에 대해 갖고 있던 테이블 단위 권한을
--    전부 회수한다.
revoke all on public.posts from anon, authenticated;

-- 2) 목록/상세 화면이 실제로 쓰는 컬럼만 SELECT 허용.
--    secret_password_hash는 절대 포함하지 않는다 — RLS로는 이 컬럼만
--    가릴 수 없으므로, column-level GRANT가 유일한 차단 수단이다.
--    (posts/view/posts-view-detail.js, posts-view-list.js,
--     posts-view-secret-gate.js, posts-view-editor-load.js 기준)
grant select (
  id,
  user_id,
  category_id,
  title,
  content_type,
  visibility,
  created_at,
  quote_preset_id
) on public.posts to anon, authenticated;

-- 3) 글 작성(INSERT). secret_password_hash는 항상 NULL로 시작하고
--    set_post_secret_password RPC(SECURITY DEFINER) 안에서만 채워지므로
--    INSERT 허용 컬럼 목록에도 포함하지 않는다.
--    (posts/editor/posts-save.js CREATE 블록 기준)
grant insert (
  user_id,
  category_id,
  title,
  content_type,
  visibility,
  quote_preset_id,
  updated_at
) on public.posts to authenticated;

-- 4) 글 수정(UPDATE). secret_password_hash는 여기서는 "지우는"
--    용도(secret을 벗어날 때 NULL로 리셋)로만 프론트에서 쓰인다
--    (posts/editor/posts-save.js EDIT 블록). 이 GRANT는 쓰기만
--    허용하고 SELECT는 별도로 회수되어 있으므로, 프론트가 이 컬럼의
--    값을 읽어올 방법은 여전히 없다. 값을 bcrypt 해시로 "설정"하는
--    것은 계속 set_post_secret_password RPC 안에서만 일어난다.
grant update (
  category_id,
  title,
  content_type,
  visibility,
  quote_preset_id,
  secret_password_hash,
  updated_at
) on public.posts to authenticated;

-- 5) 글 삭제.
grant delete on public.posts to authenticated;

-- ============================================================
-- SECURITY DEFINER RPC 하드닝: set_post_secret_password / get_secret_post_content
--
-- 두 함수 모두 이 마이그레이션 파일 밖(Supabase SQL Editor)에서 이미
-- 만들어져 있어 정확한 파라미터 타입을 알 수 없으므로, pg_proc에서
-- 이름으로 찾아 처리한다 — 시그니처가 달라도 이 블록은 깨지지 않는다.
-- 대상 함수가 존재하지 않으면 아무 일도 하지 않는다(no-op).
-- ============================================================
-- 함수의 SECURITY DEFINER와 search_path는 이미 올바르게 설정되어 있으므로
-- 변경하지 않고 실행 권한만 정확하게 제한한다.

revoke execute on function
  public.set_post_secret_password(bigint, text)
from public;

revoke execute on function
  public.get_secret_post_content(bigint, text)
from public;

-- 비밀번호 설정은 로그인한 사용자만 호출 가능.
-- 함수 내부에서 auth.uid()로 글 소유자를 한 번 더 확인한다.
grant execute on function
  public.set_post_secret_password(bigint, text)
to authenticated;

-- 비로그인 방문자도 비밀글 비밀번호를 입력할 수 있어야 한다.
grant execute on function
  public.get_secret_post_content(bigint, text)
to anon, authenticated;

-- 서버 관리 권한 유지.
grant execute on function
  public.set_post_secret_password(bigint, text),
  public.get_secret_post_content(bigint, text)
to service_role;