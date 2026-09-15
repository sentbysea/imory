-- =========================================================
-- PUBLIC-NUMBER-1 — 공개 URL 번호 (categories.public_no / posts.public_no)
--
-- 기준 문서: IMORY_PUBLIC_NUMBER_DESIGN.md
-- 프런트 상수: core/lib/public-number.js
--
-- ★ 이 컬럼이 푸는 문제
--
-- 지금 공개 주소는 DB 전체에서 하나뿐인 PK 를 그대로 드러낸다:
--
--   /test1/category/7        <- categories.id
--   /test1/post/38           <- posts.id
--
-- 그래서 (1) 서비스 전체의 데이터 양이 주소에 새어 나가고,
-- (2) 새로 가입한 사람의 **첫 글** 주소가 앞선 사용자들이 쓴 글
-- 수에 따라 /post/312 처럼 나온다.
--
-- 그래서 주소에 쓰는 번호를 PK 와 분리한다. 블로그(=user_id)마다
-- 1 부터 세는 번호를 따로 붙이고, 공개 주소는 그 번호만 쓴다:
--
--   /test1/category/1        <- categories.public_no
--   /test1/post/1            <- posts.public_no
--
-- 다른 블로그도 각자 1 부터 시작한다. 그래서 이 번호는 **혼자서는
-- 행을 특정하지 못한다** — 공개 라우터는 반드시
-- (블로그 주인 user_id, public_no) 두 값으로 조회해야 한다.
--
-- ★ 내부 관계는 하나도 바뀌지 않는다
--
-- id 는 PK 그대로고, posts.category_id / post_folders.category_id /
-- post_highlights.post_id / post_gallery_images.post_id 등 모든 FK 도
-- 계속 id 를 가리킨다. 이 migration 은 sequence 를 건드리지 않고
-- 기존 행의 id 를 한 개도 바꾸지 않는다.
--
-- ★ 번호를 어떻게 발급하는가 — max + 1 을 쓰지 않는 이유
--
-- `select max(public_no) + 1` 은 두 가지로 깨진다:
--
--   1) 두 요청이 같은 순간에 읽으면 같은 번호를 본다(unique 위반
--      또는, unique 가 없으면 같은 주소를 가진 글 두 개).
--   2) 맨 끝 글을 지우면 그 번호가 **다시 발급된다** — 이미
--      공유된 주소가 다른 글을 연다.
--
-- 그래서 테이블당 "마지막으로 발급한 번호"를 사용자별로 따로
-- 들고 있는 카운터 테이블을 둔다(public.public_no_counters).
-- 발급은 `insert ... on conflict do update ... returning` 한 문장
-- 이고, 그 문장이 카운터 행에 row lock 을 잡으므로 동시에 들어온
-- 두 INSERT 는 자동으로 줄을 선다. 카운터는 올라가기만 하므로
-- 삭제된 번호는 재사용되지 않는다.
--
-- ★ 클라이언트는 이 값을 정할 수 없다
--
-- INSERT 로 들어온 public_no 는 트리거가 버리고 다시 발급한다.
-- UPDATE 로 바꾸려 해도 트리거가 이전 값으로 되돌린다. GRANT 도
-- SELECT 에만 준다 —
-- [[20260913180000_add_posts_share_label_seq.sql]] 의
-- share_label_seq 와 완전히 같은 규칙이다.
--
-- ★ 트리거 이름과 순서
--
-- 같은 테이블의 BEFORE 트리거는 **이름 알파벳순**으로 돈다.
-- 이 트리거는 다른 트리거의 결과에 의존하지 않으므로(오직
-- new.user_id 만 본다) 어디에 서도 상관없지만, 값을 채우는
-- 트리거가 먼저 도는 편이 읽기 쉬워 'a' 로 시작하는 이름을 쓴다.
--
--   posts_assign_public_no_trg             (a)  <- 이 파일
--   posts_sync_folder_and_sort_order_trg   (f)
--   posts_sync_share_label_seq_trg         (s)
--
-- 기존 컬럼·제약·RLS·정책은 하나도 건드리지 않는다. 그대로
-- 재실행해도 안전하다(additive · 재실행 시 이미 번호가 있는 행은
-- 건드리지 않는다).
--
-- ※ Supabase SQL Editor 에 붙여넣어 적용한다. supabase CLI 로
--   적용하면 CLI 가 이미 트랜잭션을 열므로 begin/commit 두 줄은
--   제거한다.
--
-- ※ rollback 은 이 파일 맨 아래 주석 블록에 있다.
-- =========================================================

begin;


-- =========================================================
-- 1) 카운터 테이블
--
-- (user_id, resource) 당 한 행. last_no 는 "이 블로그에서 이
-- 자원에 마지막으로 발급한 번호"다. 한 번 올라간 값은 내려가지
-- 않는다 — 그래서 삭제된 번호가 다시 나오지 않는다.
--
-- RLS 를 켜고 정책을 하나도 만들지 않는다. anon/authenticated 에
-- GRANT 도 주지 않는다 — 이 테이블을 만지는 것은 아래
-- SECURITY DEFINER 트리거 하나뿐이고, 그 함수의 소유자는 테이블
-- 소유자라 RLS 를 통과한다.
-- =========================================================

create table if not exists public.public_no_counters (

  user_id uuid not null
    references auth.users (id) on delete cascade,

  /*
    'category' | 'post'. 새 자원이 생기면 값을 더한다 — 테이블을
    자원마다 새로 만들지 않는다.
  */
  resource text not null
    check (resource in ('category', 'post')),

  last_no bigint not null default 0
    check (last_no >= 0),

  updated_at timestamptz not null default now(),

  primary key (user_id, resource)

);


comment on table public.public_no_counters is
  'PUBLIC-NUMBER-1: 블로그(user_id)별·자원(resource)별로 마지막으로 발급한 공개 URL 번호. categories.public_no / posts.public_no 를 원자적으로 발급하기 위한 것이고, 값은 올라가기만 한다(삭제된 번호 재사용 금지). 쓰기는 public.assign_public_no() 트리거만 한다.';


alter table public.public_no_counters enable row level security;


-- =========================================================
-- 2) 컬럼
--
-- bigint 다 — id 와 같은 폭으로 둔다. 한 블로그가 20억 개를 넘길
-- 일은 없지만, 타입이 갈리면 조인/비교에서 암묵 캐스팅이 생긴다.
-- =========================================================

alter table public.categories
  add column if not exists public_no bigint;

alter table public.posts
  add column if not exists public_no bigint;


comment on column public.categories.public_no is
  'PUBLIC-NUMBER-1: 이 블로그 안에서만 뜻이 있는 공개 URL 번호(/:slug/category/:public_no). 1 부터 시작하고 블로그마다 독립이다. 조회는 반드시 user_id 와 함께 한다. 값을 정하는 것은 트리거뿐이고 한 번 붙으면 바뀌지 않는다.';

comment on column public.posts.public_no is
  'PUBLIC-NUMBER-1: 이 블로그 안에서만 뜻이 있는 공개 URL 번호(/:slug/post/:public_no). 1 부터 시작하고 블로그마다 독립이다. 조회는 반드시 user_id 와 함께 한다. 값을 정하는 것은 트리거뿐이고 한 번 붙으면 바뀌지 않는다.';


-- =========================================================
-- 3) backfill
--
-- 사용자별로 created_at 오름차순, 동률이면 id 오름차순으로 1 부터.
-- tie-break 가 없으면 실행할 때마다 결과가 달라질 수 있다.
--
-- 이미 값이 있는 행은 건드리지 않고, 새로 매기는 번호는 그
-- 사용자의 현재 최댓값 **다음**부터 시작한다 — 그래서 이
-- migration 을 나중에 다시 돌려도(예: 컬럼만 있고 트리거가
-- 없던 중간 상태에서 들어온 행) 번호가 겹치지 않고 기존 번호가
-- 재정렬되지도 않는다.
-- =========================================================

with ranked as (

  select
    c.id,
    coalesce(m.max_no, 0) +
      row_number() over (
        partition by c.user_id
        order by c.created_at asc, c.id asc
      ) as no
  from public.categories c
  left join (
    select user_id, max(public_no) as max_no
      from public.categories
     group by user_id
  ) m on m.user_id = c.user_id
  where c.public_no is null

)
update public.categories c
   set public_no = ranked.no
  from ranked
 where ranked.id = c.id;


with ranked as (

  select
    p.id,
    coalesce(m.max_no, 0) +
      row_number() over (
        partition by p.user_id
        order by p.created_at asc, p.id asc
      ) as no
  from public.posts p
  left join (
    select user_id, max(public_no) as max_no
      from public.posts
     group by user_id
  ) m on m.user_id = p.user_id
  where p.public_no is null

)
update public.posts p
   set public_no = ranked.no
  from ranked
 where ranked.id = p.id;


-- =========================================================
-- 4) 카운터 초기값
--
-- backfill 로 실제로 쓰인 최댓값을 카운터에 심는다. 이미 행이
-- 있으면 **더 큰 쪽**을 남긴다 — 카운터가 내려가면 이미 나간
-- 번호가 다시 발급된다.
-- =========================================================

insert into public.public_no_counters (user_id, resource, last_no)
select c.user_id, 'category', max(c.public_no)
  from public.categories c
 where c.user_id is not null
 group by c.user_id
on conflict (user_id, resource) do update
  set last_no = greatest(
        public_no_counters.last_no,
        excluded.last_no
      ),
      updated_at = now();


insert into public.public_no_counters (user_id, resource, last_no)
select p.user_id, 'post', max(p.public_no)
  from public.posts p
 where p.user_id is not null
 group by p.user_id
on conflict (user_id, resource) do update
  set last_no = greatest(
        public_no_counters.last_no,
        excluded.last_no
      ),
      updated_at = now();


-- =========================================================
-- 5) 발급 트리거
--
-- BEFORE INSERT  : 들고 들어온 값을 버리고 카운터에서 새로 받는다.
-- BEFORE UPDATE  : 이전 값을 그대로 되돌린다(불변).
--
-- `insert ... on conflict do update ... returning` 한 문장이
-- 발급 전부다:
--
--   * 행이 없으면 1 을 넣고 1 을 돌려준다.
--   * 있으면 그 행에 row lock 을 잡고 +1 한 값을 돌려준다.
--     같은 순간 들어온 다른 트랜잭션은 이 lock 에서 기다렸다가
--     갱신된 값을 보고 +1 한다 — 그래서 번호가 겹치지 않는다.
--
-- SECURITY DEFINER 인 이유는 카운터 테이블에 anon/authenticated
-- GRANT 를 주지 않기 위해서다. search_path 는 '' 로 고정하고
-- 모든 이름을 스키마까지 적는다.
--
-- 입력 소유권: new.user_id 가 없으면 번호를 줄 수 없으므로
-- 예외를 낸다. RLS 가 "자기 user_id 로만 INSERT" 를 이미 강제하고
-- 있으므로, 여기서 auth.uid() 를 다시 보지 않는다 — 그러면
-- 관리자 RPC·backfill·트리거 연쇄 INSERT 가 전부 막힌다.
-- =========================================================

create or replace function public.assign_public_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_resource text := tg_argv[0];
  v_next     bigint;
begin

  if tg_op = 'UPDATE' then

    /* 공개 번호는 불변이다 — 주소가 이미 나가 있다 */

    if old.public_no is not null then

      new.public_no := old.public_no;

      return new;

    end if;


    /*
      old 가 null 인 UPDATE 는 이 migration 의 backfill 을 다시
      돌리는 경우뿐이다(정상 배포에서는 NOT NULL 이라 생기지
      않는다). 계산해 온 값이 있으면 그대로 두고, 없으면 아래
      발급 경로로 내려간다.
    */

    if new.public_no is not null then

      return new;

    end if;

  end if;


  if new.user_id is null then

    raise exception
      'assign_public_no: % 행에 user_id 가 없어 공개 번호를 발급할 수 없다',
      tg_table_name
      using errcode = '23502';

  end if;


  insert into public.public_no_counters as c
         (user_id, resource, last_no, updated_at)
  values (new.user_id, v_resource, 1, now())
  on conflict (user_id, resource) do update
     set last_no = c.last_no + 1,
         updated_at = now()
  returning c.last_no into v_next;


  new.public_no := v_next;


  return new;

end;
$fn$;


comment on function public.assign_public_no() is
  'PUBLIC-NUMBER-1: categories/posts 의 BEFORE INSERT 에서 public.public_no_counters 로부터 (user_id, resource) 별 다음 번호를 원자적으로 발급하고, BEFORE UPDATE 에서는 이전 값을 되돌려 불변으로 만든다. 자원 이름은 트리거 인자(tg_argv[0])로 받는다.';


drop trigger if exists categories_assign_public_no_trg on public.categories;

create trigger categories_assign_public_no_trg
  before insert or update on public.categories
  for each row
  execute function public.assign_public_no('category');


drop trigger if exists posts_assign_public_no_trg on public.posts;

create trigger posts_assign_public_no_trg
  before insert or update on public.posts
  for each row
  execute function public.assign_public_no('post');


-- =========================================================
-- 6) 제약 — NOT NULL + (user_id, public_no) UNIQUE
--
-- unique 인덱스가 "같은 블로그 안에서 번호가 겹치지 않는다"의
-- 최종 방어선이다. 발급 경로가 뚫려도 DB 가 막는다.
--
-- user_id 가 null 인 행이 남아 있으면 set not null 이 실패하면서
-- 이 migration 전체가 rollback 된다 — 조용히 넘어가는 것보다
-- 낫다(그런 행은 어느 블로그에도 속하지 않아 공개 주소를 가질 수
-- 없다).
-- =========================================================

create unique index if not exists categories_user_public_no_key
  on public.categories (user_id, public_no);

create unique index if not exists posts_user_public_no_key
  on public.posts (user_id, public_no);


alter table public.categories
  alter column public_no set not null;

alter table public.posts
  alter column public_no set not null;


-- =========================================================
-- 7) GRANT — SELECT 에만
--
-- 공개 라우터가 (user_id, public_no) 로 조회하려면 필터에 쓰는
-- 컬럼에 SELECT 권한이 있어야 한다.
--
--   categories : 테이블 단위 GRANT 라 새 컬럼이 자동으로 포함된다.
--   posts      : 컬럼 단위 GRANT 라 명시해야 한다
--                ([[20260902110000_lock_down_posts_secret_password_hash.sql]]).
--
-- 쓰기 권한은 주지 않는다 — 값을 정하는 것은 트리거뿐이다.
-- =========================================================

grant select (public_no) on public.posts to anon, authenticated;


commit;


-- =========================================================
-- ROLLBACK (되돌리기)
--
-- 아래를 그대로 실행하면 이 migration 이전 상태로 돌아간다.
-- id 를 한 개도 바꾸지 않았으므로 되돌려도 잃는 데이터가 없다 —
-- 다만 **이미 발급된 공개 번호는 사라지고**, 다시 적용하면
-- backfill 이 같은 규칙(created_at, id)으로 같은 번호를 다시
-- 매긴다(그 사이에 글이 지워졌다면 뒤 번호가 당겨진다).
--
-- 프런트를 먼저 옛 배포로 되돌린 뒤에 실행할 것 — 컬럼이 없는
-- DB 에 새 프런트가 붙으면 공개 화면이 글을 찾지 못한다.
--
--   begin;
--
--   drop trigger if exists posts_assign_public_no_trg on public.posts;
--   drop trigger if exists categories_assign_public_no_trg on public.categories;
--   drop function if exists public.assign_public_no();
--
--   drop index if exists public.posts_user_public_no_key;
--   drop index if exists public.categories_user_public_no_key;
--
--   alter table public.posts      drop column if exists public_no;
--   alter table public.categories drop column if exists public_no;
--
--   drop table if exists public.public_no_counters;
--
--   commit;
-- =========================================================
