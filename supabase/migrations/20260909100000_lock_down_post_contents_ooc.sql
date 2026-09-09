-- =========================================================
-- post_contents.ooc_content 가 anon/authenticated 에게 SELECT 되는 문제 수정
--
-- 실측(2026-09-09, imory.me, anon publishable key):
--   GET /rest/v1/post_contents?select=post_id,ooc_content&ooc_content=not.is.null
--   → public 글의 OOC 메모(456자)가 그대로 반환됐다.
--
-- 배경: post_contents 는 posts(20260902110000_lock_down_posts_secret_password_hash)
-- 와 달리 column-level GRANT 를 받은 적이 없어서, 프로젝트 기본의 테이블 단위
-- GRANT(anon/authenticated 에 select/insert/update/delete)가 그대로 살아 있었다.
-- RLS 는 "어떤 행"만 거른다 — public 글의 행이 보이는 이상 그 행의 모든 컬럼이
-- 열린다. secret/private 글의 행은 기존 RLS 로 이미 0건이다(실측).
--
-- OOC 는 편집기 전용 메모다("독자에게는 보이지 않는 메모/설정 노트",
-- posts/posts.html). 읽는 코드는 소유자의 편집 폼 로드
-- (posts/view/posts-view-editor-load.js) 한 곳뿐이고, 공개 뷰어
-- (posts-view-detail.js) · 폴더 페이지(posts-view-folder.js) · 스킨 Context
-- 는 content 만 select 한다. 공개 노출이 필요한 데이터가 아니다.
--
-- 방침(20260902110000 과 동일):
--   · 테이블 단위 권한을 전부 회수한 뒤 실제로 쓰는 컬럼만 다시 GRANT 한다.
--   · ooc_content SELECT 는 anon 에게도 authenticated 에게도 주지 않는다 —
--     다른 로그인 사용자도 "독자"이고, 컬럼 단위 GRANT 는 소유자/비소유자를
--     구분하지 못하기 때문이다. 소유자의 편집 폼은 아래 SECURITY DEFINER RPC
--     get_own_post_content 로 본문 + OOC 를 받고, 저장은 upsert_own_post_content
--     로 한다(secret 본문을 get_secret_post_content 로만 주는 것과 같은 구조).
--   · 기존 RLS 정책(행 단위: public/secret 행 공개, private 행 소유자만 등)은
--     전혀 손대지 않는다. get_secret_post_content 는 SECURITY DEFINER 라
--     이 GRANT 변경의 영향을 받지 않는다.
-- =========================================================


-- 0) RLS 가 꺼져 있을 가능성에 대비한 안전장치(켜져 있으면 no-op, 정책 유지).
alter table public.post_contents enable row level security;


-- 1) anon/authenticated 가 post_contents 에 갖고 있던 테이블 단위 권한 회수.
--    (테이블 단위 SELECT 가 남아 있으면 column-level REVOKE 만으로는 막히지
--     않으므로 반드시 전체 회수 → 컬럼 GRANT 순서다.)
revoke all on public.post_contents from anon, authenticated;


-- 2) 공개 본문 읽기 — 뷰어 · 폴더 페이지(Series Viewer) · 스킨 POST region 이
--    쓰는 두 컬럼만. ooc_content 는 포함하지 않는다.
grant select (
  post_id,
  content
) on public.post_contents to anon, authenticated;


-- 3) 소유자 저장은 아래 SECURITY DEFINER RPC upsert_own_post_content 로만 한다.
--    직접 INSERT/UPDATE GRANT 는 주지 않는다 — 이유: PostgREST upsert 는
--    INSERT ... ON CONFLICT (post_id) DO UPDATE SET ooc_content = EXCLUDED.ooc_content
--    인데, PostgreSQL 은 ON CONFLICT DO UPDATE 식에서 읽는 컬럼(EXCLUDED 포함)에
--    SELECT 권한을 요구한다. 즉 ooc_content 를 직접 upsert 하려면 ooc_content
--    SELECT 를 다시 열어야 하고 그러면 이 migration 의 목적이 무너진다
--    (PGlite 실행으로 확인: 컬럼 INSERT/UPDATE 만 있으면 permission denied).
--    (posts/editor/posts-save.js 가 rpc 로 바뀌었다.)


-- 4) 삭제 — 기존 테이블 단위 권한에 있던 것을 그대로 유지한다.
--    (posts/view/posts-view-detail.js 의 글 삭제 경로. 행 선택은 RLS 가 한다.)
grant delete on public.post_contents to authenticated;


-- =========================================================
-- 5) 소유자 전용 본문 + OOC 읽기 RPC
--
-- SECURITY DEFINER 는 RLS 와 컬럼 GRANT 를 우회하므로 함수 안에서 auth.uid()
-- 로 소유권을 반드시 다시 확인한다(저장소 관례: 20260908120000 등).
-- 소유자가 아니면 0행을 돌려준다 — 글의 존재 여부는 posts 로 이미 보이는
-- 정보이므로 새로 새는 것은 없다.
-- =========================================================

create or replace function public.get_own_post_content(
  p_post_id bigint
)
returns table (
  content text,
  ooc_content text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.content::text,
    c.ooc_content::text
  from public.post_contents c
  join public.posts p
    on p.id = c.post_id
  where c.post_id = p_post_id
    and p.user_id = auth.uid();
$$;

-- =========================================================
-- 6) 소유자 전용 본문 + OOC 저장 RPC (posts/editor/posts-save.js 의 upsert 대체)
--
-- 소유권을 auth.uid() 로 확인한 뒤 같은 모양의 upsert 를 함수 소유자 권한으로
-- 실행한다. 비소유자는 42501 로 거절 — 존재하지 않는 글도 같은 오류라
-- 존재 여부가 새지 않는다.
-- =========================================================

create or replace function public.upsert_own_post_content(
  p_post_id bigint,
  p_content text,
  p_ooc_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.user_id = auth.uid()
  ) then
    raise exception 'not the owner of post %', p_post_id
      using errcode = '42501';
  end if;

  insert into public.post_contents (post_id, content, ooc_content)
  values (p_post_id, p_content, p_ooc_content)
  on conflict (post_id) do update
    set content = excluded.content,
        ooc_content = excluded.ooc_content;
end;
$fn$;


-- =========================================================
-- 7) RPC 실행 권한 — 함수는 기본으로 PUBLIC 에 EXECUTE 가 열리므로 먼저 회수한다.
--    로그인한 사용자만 호출 가능(소유권은 함수 본문이 확인).
-- =========================================================

revoke execute on function
  public.get_own_post_content(bigint),
  public.upsert_own_post_content(bigint, text, text)
from public, anon;

grant execute on function
  public.get_own_post_content(bigint),
  public.upsert_own_post_content(bigint, text, text)
to authenticated, service_role;
