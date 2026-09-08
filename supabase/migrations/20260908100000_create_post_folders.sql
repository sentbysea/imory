-- =========================================================
-- FOLDER-1 (1/3) — post_folders 테이블
--
-- 목적: 카테고리 안에서 글을 폴더로 묶는다. 폴더는 선택사항이고
-- 최대 3단계까지만 중첩된다(카테고리 > 폴더 > 폴더 > 폴더 > 글).
--
-- 설계 원칙:
--
--   1) 이 migration은 기존 posts/categories/post_contents의 구조도
--      RLS 정책도 전혀 건드리지 않는다. 두 테이블의 CREATE TABLE과
--      일부 RLS 정책은 저장소 migration에 남아 있지 않고 Supabase
--      Dashboard에서 직접 만들어진 것이므로(ToDo.md 13·15절),
--      추측해서 다시 쓰지 않고 **추가만** 한다.
--
--   2) 폴더는 "콘텐츠 구조"이지 "표현 방식"이 아니다. 아이콘/열림
--      상태/색 같은 UI 의미를 가진 컬럼은 두지 않는다 — 폴더를
--      어떻게 보여줄지는 전적으로 Skin의 html/css가 정한다.
--
--   3) depth는 계산 가능한 값이지만 **컬럼으로 저장**한다. CHECK
--      제약은 재귀 질의를 할 수 없어서 "4단계 금지"를 선언적으로
--      표현할 방법이 없기 때문이다. 트리거가 parent.depth + 1로
--      항상 다시 계산하고, check (depth between 1 and 3)이 최종
--      방어선이 된다 — 프론트 검증이 뚫려도 DB가 구조적으로 막는다.
--
--   4) parent_id는 on delete restrict다. 폴더를 지울 때 안에 있던
--      글과 하위 폴더가 같이 사라지면 절대 안 되므로(사용자 요구),
--      cascade를 쓰면 안 된다. 삭제는 반드시 delete_post_folder()
--      RPC(3/3 migration)를 거치게 되고, 그 RPC가 자식들을 삭제되는
--      폴더의 자리로 승격시킨 뒤에야 행을 지운다.
--
--   5) 쓰기 경로는 RPC 전용이다. anon/authenticated에게는 SELECT
--      컬럼 권한만 주고 INSERT/UPDATE/DELETE는 GRANT하지 않는다 —
--      depth/cycle/소유권 검증을 클라이언트가 우회할 방법 자체를
--      없앤다([[20260905100000_add_skin_draft_write_rpcs.sql]]가
--      "세트 동작은 RPC 트랜잭션으로 묶는다"고 정한 것과 같은 이유).
--
-- 타입 근거(2026-09-08 프로덕션 PostgREST 실측):
--   categories.id = bigint, posts.id = bigint, posts.category_id = bigint,
--   categories.sort_order = integer, banners.sort_order = integer.
-- =========================================================


-- =========================================================
-- 1) 테이블
-- =========================================================

create table if not exists public.post_folders (

  id bigint generated always as identity primary key,

  user_id uuid not null
    references auth.users (id) on delete cascade,

  category_id bigint not null
    references public.categories (id) on delete cascade,

  /*
    null이면 카테고리 root에 있는 폴더.
    restrict: 자식이 남아 있는 폴더는 직접 delete할 수 없다.
  */
  parent_id bigint null
    references public.post_folders (id) on delete restrict,

  name text not null
    check (char_length(btrim(name)) between 1 and 60),

  /*
    1 = 카테고리 root 폴더, 3 = 최대 깊이.
    트리거가 parent.depth + 1로 유지한다(직접 쓰지 말 것).
  */
  depth smallint not null default 1
    check (depth between 1 and 3),

  /*
    "같은 컨테이너 안에서의 순서". 컨테이너 키는
    (user_id, category_id, parent_id)이고, **같은 컨테이너의 posts와
    정렬 공간을 공유한다** — root에 폴더와 글이 섞여 있을 수 있고
    사용자가 drag로 정한 순서가 그대로 이 값이 된다.

    gap 방식(100, 200, 300 ...): 중간 삽입은 이웃 두 값의 중간값을
    쓰고, 간격이 소진됐을 때만 그 컨테이너 하나만 rebalance한다.
    카테고리 전체 행을 매번 다시 쓰지 않는다.
  */
  sort_order integer not null default 100,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

);


comment on table public.post_folders is
  'FOLDER-1: 카테고리 안의 글 정리용 폴더(최대 3단계). 표현 방식이 아니라 콘텐츠 구조만 담는다.';

comment on column public.post_folders.depth is
  '1~3. 트리거가 parent.depth + 1로 유지한다 — 직접 쓰지 말 것.';

comment on column public.post_folders.sort_order is
  '같은 컨테이너(user_id, category_id, parent_id) 안의 순서. 같은 컨테이너의 posts.sort_order와 정렬 공간을 공유한다.';


-- =========================================================
-- 2) 인덱스
--
-- 컨테이너 단위 조회(트리 렌더 / rebalance)와 자식 탐색(삭제 시
-- 승격, depth 재계산)이 이 테이블의 유일한 접근 패턴이다.
-- =========================================================

create index if not exists post_folders_container_idx
  on public.post_folders (user_id, category_id, parent_id, sort_order);

create index if not exists post_folders_parent_idx
  on public.post_folders (parent_id)
  where parent_id is not null;

create index if not exists post_folders_category_idx
  on public.post_folders (category_id);


-- =========================================================
-- 3) 무결성 트리거
--
-- BEFORE INSERT/UPDATE: 소유권 · 카테고리 일치 · depth 계산 · cycle 차단
--
-- SECURITY DEFINER인 이유: 이 트리거는 post_folders를 스스로 다시
-- 읽는데(부모/조상 체인), 검증 로직이 호출자의 가시성에 따라
-- 달라지면 안 되므로 항상 같은 권한으로 읽는다.
-- search_path = ''는 저장소의 다른 SECURITY DEFINER 함수와 동일한
-- 관례다([[20260905100000_add_skin_draft_write_rpcs.sql]]).
-- =========================================================

create or replace function public.post_folders_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_parent public.post_folders%rowtype;
  v_cycle  boolean;
begin

  new.name := btrim(new.name);

  new.updated_at := now();


  /* ---- depth: 항상 부모로부터 다시 계산한다 ---- */

  if new.parent_id is null then

    new.depth := 1;

  else

    if new.parent_id = new.id then

      raise exception 'post_folders: folder % cannot be its own parent', new.id
        using errcode = '23514';

    end if;


    select * into v_parent
      from public.post_folders
     where id = new.parent_id;


    if not found then

      raise exception 'post_folders: parent folder % not found', new.parent_id
        using errcode = '23503';

    end if;


    /*
      다른 사용자의 폴더를 부모로 삼을 수 없다. RLS/GRANT가 이미
      쓰기를 막고 있지만, RPC(SECURITY DEFINER)가 RLS를 우회해서
      실행되므로 이 검사가 실제 방어선이다.
    */

    if v_parent.user_id <> new.user_id then

      raise exception 'post_folders: parent folder % belongs to another user', new.parent_id
        using errcode = '42501';

    end if;


    if v_parent.category_id <> new.category_id then

      raise exception 'post_folders: parent folder % belongs to another category', new.parent_id
        using errcode = '23514';

    end if;


    new.depth := v_parent.depth + 1;

  end if;


  /*
    최대 3단계. CHECK 제약과 중복이지만, 여기서 먼저 막아야
    "왜 거절됐는지"가 드러나는 메시지를 줄 수 있다.
  */

  if new.depth < 1 or new.depth > 3 then

    raise exception 'post_folders: depth % exceeds maximum 3', new.depth
      using errcode = '23514';

  end if;


  /* ---- cycle 차단 ----

     depth 상한만으로는 부족하다. 예를 들어 A(1) > B(2) 구조에서
     A를 B 안으로 옮기면 새 depth는 B.depth + 1 = 3이라 상한을
     통과하지만 A와 B가 서로를 가리키는 순환이 된다. 새 부모의
     조상 체인에 자기 자신이 있는지 직접 확인한다.

     (자기 자신에게 drop / 자기 자손에게 drop이 여기서 함께 걸린다.)
  */

  if tg_op = 'UPDATE'
     and new.parent_id is distinct from old.parent_id
     and new.parent_id is not null then

    v_cycle := exists (

      with recursive chain as (

        select f.id, f.parent_id
          from public.post_folders f
         where f.id = new.parent_id

        union all

        select f.id, f.parent_id
          from public.post_folders f
          join chain c on f.id = c.parent_id

      )
      select 1 from chain where chain.id = new.id

    );


    if v_cycle then

      raise exception 'post_folders: moving folder % into its own descendant creates a cycle', new.id
        using errcode = '23514';

    end if;

  end if;


  return new;

end;
$fn$;


/*
  AFTER UPDATE: 부모가 바뀌어 depth가 달라지면 자손들의 depth도
  다시 계산해야 한다. 자식 행을 touch하면 그 행의 BEFORE 트리거가
  다시 돌면서 parent.depth + 1로 스스로를 고치고, 그 행의 AFTER
  트리거가 다시 손자를 touch한다 — 최대 3단계라 재귀는 최대 2번
  더 일어나고 끝난다.

  이 연쇄 도중 depth가 4가 되면 BEFORE 트리거가 예외를 던지고
  트랜잭션 전체가 롤백된다. 즉 "3단계 폴더 안에 2단계 서브트리를
  통째로 넣는 이동"도 자동으로 거절된다 — 이동 대상 자신의 depth만
  보는 검사로는 못 잡는 경우다.
*/

create or replace function public.post_folders_sync_descendant_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin

  update public.post_folders
     set updated_at = now()
   where parent_id = new.id;


  return null;

end;
$fn$;


drop trigger if exists post_folders_validate_trg on public.post_folders;

create trigger post_folders_validate_trg
  before insert or update on public.post_folders
  for each row
  execute function public.post_folders_validate();


drop trigger if exists post_folders_sync_descendant_depth_trg on public.post_folders;

create trigger post_folders_sync_descendant_depth_trg
  after update on public.post_folders
  for each row
  when (old.depth is distinct from new.depth)
  execute function public.post_folders_sync_descendant_depth();


-- =========================================================
-- 4) RLS
--
-- categories와 같은 노출 수준을 따른다: 폴더 구조는 공개 페이지가
-- 그려야 하므로 방문자도 읽을 수 있다. 쓰기는 소유자 정책을 두되,
-- 아래 5)에서 authenticated에게 INSERT/UPDATE/DELETE GRANT 자체를
-- 주지 않으므로 실제 쓰기 경로는 RPC뿐이다(정책은 이중 방어).
--
-- ★ 공개 범위에 대한 명시적 기록(FOLDER-1 보안 문서화):
--   post_folders는 anon SELECT가 가능하므로 **폴더 이름은 공개된다**.
--   private 글만 들어 있는 폴더라도 그 이름은 REST로 읽힌다.
--   다만 이것이 기존 보호를 약화시키지는 않는다 — 글 자체(제목/
--   본문/visibility)는 여전히 posts/post_contents의 기존 RLS가
--   가리고, 이 테이블에는 글에 대한 어떤 정보도 들어 있지 않다.
--   공개 Skin 화면에서는 skin-context.js가 "방문자에게 보이는 글이
--   하나도 없는 폴더 서브트리"를 category.tree에서 아예 빼므로
--   화면에는 나타나지 않는다(표현 계층의 정리이지 보안 경계가
--   아니라는 점을 문서에 명시했다).
--   폴더 단위 privacy는 FOLDER-1의 범위 밖이다(사용자 결정).
-- =========================================================

alter table public.post_folders enable row level security;


drop policy if exists post_folders_public_read on public.post_folders;

create policy post_folders_public_read
  on public.post_folders
  for select
  using (true);


drop policy if exists post_folders_owner_write on public.post_folders;

create policy post_folders_owner_write
  on public.post_folders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- =========================================================
-- 5) GRANT
--
-- posts와 같은 방식(테이블 단위 권한 회수 후 컬럼 단위 재부여,
-- [[20260902110000_lock_down_posts_secret_password_hash.sql]]).
-- 쓰기 권한은 anon/authenticated 어느 쪽에도 주지 않는다 — 전부 RPC 경유.
-- =========================================================

revoke all on public.post_folders from anon, authenticated;

grant select (
  id,
  user_id,
  category_id,
  parent_id,
  name,
  depth,
  sort_order,
  created_at,
  updated_at
) on public.post_folders to anon, authenticated;
