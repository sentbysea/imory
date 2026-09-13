-- =========================================================
-- HIGHLIGHT-2 — HIGHLIGHT 카테고리 · singleton 타입 · 페이지네이션
--
-- 기준 문서: IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md
--
-- 이 migration이 하는 일
-- ----------------------
--   1) categories.type 이 'highlight' 를 받아들이게 한다
--   2) 한 사용자에게 BANNER 카테고리가 여러 개 있으면 **데이터를
--      잃지 않고** 하나로 합친다 (3번의 제약을 걸기 전에)
--   3) singleton 타입(banner / highlight) partial unique index
--   4) 페이지네이션 설정 컬럼 2개 (pagination_style /
--      pagination_window_size) + page_size 범위 확장
--   5) memo_folder_settings -> highlight_folder_settings 이름 정리
--      (+ 옛 이름 호환 view / 호환 RPC wrapper)
--   6) change_own_category_type — 타입 변경 시 글·폴더를 목적지로
--      옮기고 나서 타입을 바꾸는 단일 트랜잭션 RPC
--
-- 이미 적용된 migration 파일은 한 글자도 고치지 않는다. 전부
-- 이 후속 파일에서만 한다.
--
--
-- ★ 왜 'memo' 타입을 만들지 않는가
-- --------------------------------
-- 지금까지 "메모"라고 불러 온 것(본문에서 고른 문장 + 그 위에 적는
-- 짧은 주석)의 공식 이름은 이제 **highlight** 다. 'memo' 라는 이름은
-- 나중에 사용자가 하이라이트와 무관하게 직접 짧은 글을 쓰는 별개
-- 콘텐츠 타입을 위해 비워 둔다. 그래서 이 migration 은 enum/check 에
-- 'memo' 도 'guest' 도 넣지 않는다 — 아직 존재하지 않는 타입을 미리
-- 허용하면 그 이름을 쓰는 행이 먼저 생겨 버린다.
--
--
-- ★ 왜 DB 제약이 필요한가 (요구사항 6)
-- ------------------------------------
-- 관리 화면은 카테고리를 RPC 가 아니라 `insert` / `update` 로 직접
-- 저장한다(admin/settings/admin-settings-save.js). 프런트에서
-- option 을 disabled 로 만드는 것은 안내일 뿐이고, 두 탭에서 동시에
-- 저장하거나 REST 를 직접 부르면 그 방어선은 없는 것과 같다.
-- partial unique index 는 동시 요청 두 개 중 하나를 **DB 가**
-- 거절하게 만드는 유일한 장치다.
--
--
-- ★ 재실행 안전성
-- ---------------
-- 전부 if not exists / do 블록 안의 카탈로그 검사로 감싼다. 같은
-- 파일을 두 번 적용해도 결과가 같다. BANNER 통합(2번)은 "여러 개인
-- 사용자"가 남아 있지 않으면 아무것도 하지 않는다.
--
-- ※ Supabase SQL Editor 에 붙여넣어 적용한다. supabase CLI 로
--   적용하게 되면 CLI 가 이미 트랜잭션을 열므로 begin/commit 두
--   줄은 제거한다.
-- =========================================================

begin;


-- =========================================================
-- 1) categories.type 이 'highlight' 를 받아들이게 한다
--
-- categories 의 CREATE TABLE 은 이 저장소에 없다(Supabase 콘솔에서
-- 만들어졌다). 그래서 제약 이름을 가정하지 않고 카탈로그를 직접
-- 본다 — 20260911120000_gallery_content.sql 이 'gallery' 를 더할 때
-- 쓴 것과 **똑같은 방식**이다. 기존에 허용되던 값은 전부 그대로
-- 남고 'highlight' 만 더해진다.
-- =========================================================

do $migration$
declare
  col  smallint;
  kind text;
  rule record;
begin

  select a.attnum, t.typname
    into col, kind
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
   where a.attrelid = 'public.categories'::regclass
     and a.attname = 'type'
     and not a.attisdropped;

  if kind is null or kind not in ('text', 'varchar') then
    raise exception 'Review categories.type before migration: expected text/varchar, got %', kind;
  end if;

  for rule in
    select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
     where conrelid = 'public.categories'::regclass
       and contype = 'c'
       and conkey = array[col]
  loop

    if position('highlight' in rule.definition) = 0 then

      execute format(
        'alter table public.categories drop constraint %I',
        rule.conname
      );

      /* substring(... from 8 ...) 은 'CHECK (' 와 끝의 ')' 를 벗긴다 */
      execute format(
        'alter table public.categories add constraint %I CHECK (type = ''highlight'' OR (%s))',
        rule.conname,
        substring(rule.definition from 8 for length(rule.definition) - 8)
      );

    end if;

  end loop;

end;
$migration$;


comment on column public.categories.type is
  'post | gallery | banner | highlight. banner 와 highlight 는 블로그당 하나만 존재할 수 있다(categories_singleton_type_idx). highlight 는 본문에서 고른 하이라이트 카드를 모아 보는 화면(/:slug/highlights)의 표시·내비게이션 설정을 담당하는 행이고, 하이라이트 데이터(post_highlights)의 부모가 아니다 — 이 행을 지워도 하이라이트는 남는다.';


-- =========================================================
-- 2) 중복 BANNER 카테고리 통합 (요구사항 5)
--
-- 3번의 partial unique index 를 걸기 **전에** 해야 한다. 지금 DB 에
-- 한 사용자당 BANNER 가 둘 이상이면 index 생성이 실패하고, 그러면
-- 이 migration 전체가 rollback 된다.
--
-- ★ 대표 카테고리 선정 기준 (결정적)
--     sort_order ASC (null 은 뒤로) -> created_at ASC -> id ASC
--   sort_order 가 먼저인 이유: 사용자가 메뉴에서 위에 둔 것이 그
--   사람이 "진짜 배너"로 여기는 것이다. 같은 값이면 먼저 만든 것,
--   그래도 같으면 작은 id — 어떤 순서로 읽어도 같은 답이 나온다.
--
-- ★ 배너 항목은 하나도 지우지 않는다
--   대표가 아닌 BANNER 카테고리의 banners 행은 대표로 **옮긴다**.
--   기존 상대 순서를 보존하면서 sort_order 를 1..n 으로 다시 매긴다
--   (대표의 항목이 먼저, 그 뒤에 밀려난 카테고리 순서대로).
--   옮기기 전/후의 banners 개수를 세어 다르면 예외로 중단한다.
--
-- ★ 자동 통합이 안전하지 않으면 중단한다
--   대표가 아닌 BANNER 카테고리에 글(posts)이나 폴더(post_folders)가
--   남아 있으면 이 migration 은 아무것도 지우지 않고 예외를 던진다.
--   categories 를 지우면 그 두 테이블이 cascade 로 함께 사라질 수
--   있는데, 그것은 "조용히 삭제"다. 그런 데이터는 사람이 먼저
--   옮겨야 한다.
-- =========================================================

do $migration$
declare
  v_before  bigint;
  v_after   bigint;
  v_blocked text;
  v_dupes   bigint;
begin

  select count(*) into v_before from public.banners;


  /*
    대표 / 비대표 판정. BANNER 가 둘 이상인 사용자만 담는다 —
    하나뿐인 사용자의 banners.sort_order 를 괜히 다시 쓰지 않는다.
  */
  create temporary table imory_banner_merge_plan on commit drop as
  with crowded as (
    select user_id
      from public.categories
     where type = 'banner'
     group by user_id
    having count(*) > 1
  ),
  ranked as (
    select
      c.id,
      c.user_id,
      row_number() over (
        partition by c.user_id
        order by
          c.sort_order asc nulls last,
          c.created_at asc,
          c.id asc
      ) as rank
    from public.categories c
    join crowded d on d.user_id = c.user_id
    where c.type = 'banner'
  )
  select
    r.id,
    r.user_id,
    r.rank,
    first_value(r.id) over (partition by r.user_id order by r.rank) as keep_id
  from ranked r;


  select count(*) into v_dupes
    from imory_banner_merge_plan
   where id <> keep_id;

  if v_dupes = 0 then
    /* 중복이 없다 — 아무것도 하지 않는다(대부분의 배포가 여기다) */
    return;
  end if;


  /* 안전하지 않은 통합을 먼저 거른다 */
  select string_agg(distinct p.id::text, ', ' order by p.id::text)
    into v_blocked
    from imory_banner_merge_plan p
   where p.id <> p.keep_id
     and (
       exists (select 1 from public.posts x        where x.category_id = p.id)
       or exists (select 1 from public.post_folders x where x.category_id = p.id)
     );

  if v_blocked is not null then
    raise exception
      'BANNER 카테고리가 여러 개인데 그중 %s 에 글 또는 폴더가 남아 있어 자동 통합이 안전하지 않습니다. 그 카테고리의 글/폴더를 먼저 다른 카테고리로 옮긴 뒤 이 migration 을 다시 적용하세요(아무것도 변경되지 않았습니다).',
      v_blocked;
  end if;


  /* 배너 항목을 대표로 옮기고 상대 순서를 보존하며 1..n 재정렬 */
  with plan as (
    select id, keep_id, rank from imory_banner_merge_plan
  ),
  ordered as (
    select
      b.id as banner_id,
      p.keep_id,
      row_number() over (
        partition by p.keep_id
        order by p.rank asc, b.sort_order asc nulls last, b.id asc
      ) as new_sort
    from public.banners b
    join plan p on p.id = b.category_id
  )
  update public.banners b
     set category_id = o.keep_id,
         sort_order  = o.new_sort
    from ordered o
   where b.id = o.banner_id;


  /* 이제 비어 있는 중복 category 행만 정리한다 */
  delete from public.categories c
   using imory_banner_merge_plan p
   where c.id = p.id
     and p.id <> p.keep_id;


  select count(*) into v_after from public.banners;

  if v_after <> v_before then
    raise exception
      'BANNER 통합 중 배너 항목 수가 %에서 %로 달라졌습니다 — 전체를 되돌립니다.',
      v_before, v_after;
  end if;

end;
$migration$;


-- =========================================================
-- 3) singleton 타입 제약
--
-- predicate 에 적힌 타입 목록이 "블로그당 하나"의 유일한 정의다.
-- 프런트의 공용 상수(core/lib/category-types.js 의
-- SINGLETON_CATEGORY_TYPES)와 같은 집합이어야 하고, 그 일치를
-- e2e 테스트가 확인한다(admin/admin-category-settings-e2e-test.mjs
-- 의 [singleton] 절).
--
-- 나중에 'guest' 가 생기면 이 index 를 drop/create 하는 후속
-- migration 한 줄로 끝난다 — 지금 미리 넣지는 않는다.
-- =========================================================

create unique index if not exists categories_singleton_type_idx
  on public.categories (user_id, type)
  where type in ('banner', 'highlight');


comment on index public.categories_singleton_type_idx is
  'HIGHLIGHT-2: banner / highlight 는 블로그당 하나. 프런트 검증을 우회한 요청과 동시에 들어온 두 요청 중 하나를 거절하는 유일한 장치다(23505).';


-- =========================================================
-- 4) 페이지네이션 설정 (요구사항 9)
--
-- post 와 gallery 가 **같은 계산기**를 쓴다. 저장되는 값은 세 개:
--   page_size               한 페이지에 담는 개수
--   pagination_style        번호 표기 (decimal | roman_lower)
--   pagination_window_size  한 번에 보여 줄 번호 개수 (기본 7)
--
-- page_size 의 기존 check 는 갤러리용 4개 값(6/12/18/24)만
-- 허용했다. 글 목록은 그 네 값으로는 부족하므로 1..100 으로
-- 넓힌다 — 기존 값은 전부 그대로 유효하다(값을 바꾸지 않는다).
-- =========================================================

/*
  글 목록(post)을 페이지로 나눌지. **기본은 false** 다.

  왜 스위치가 필요한가 — 갤러리는 "갤러리로 보이게 한다"는 설정
  (list_style) 자체가 이미 의사 표시다. 글 목록에는 그런 스위치가
  없었고, 기본값만으로 켜 버리면 "아무것도 바꾸지 않았는데 어느 날
  목록이 12개로 잘리고 폴더 안 글이 사라진" 블로그가 생긴다(갤러리를
  아는 스킨은 대개 페이지 링크도 그리기 때문이다). 실제로
  skin/skin-gallery-e2e-test.mjs 의 [list] 절이 그 상황을 잡았다.

  gallery 카테고리는 이 값과 무관하게 지금까지처럼 페이지를 나눈다.
*/

alter table public.categories
  add column if not exists paginate_posts boolean not null default false;

comment on column public.categories.paginate_posts is
  'HIGHLIGHT-2: post 카테고리의 글 목록을 페이지로 나눌지(기본 false). gallery 는 이 값과 무관하게 나뉜다. 실제로 나뉘려면 렌더 중인 스킨이 category.pagination 을 그려야 한다.';


alter table public.categories
  add column if not exists pagination_style text not null default 'decimal';

alter table public.categories
  add column if not exists pagination_window_size smallint not null default 7;


do $migration$
begin

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.categories'::regclass
       and conname = 'categories_pagination_style_check'
  ) then
    alter table public.categories
      add constraint categories_pagination_style_check
      check (pagination_style in ('decimal', 'roman_lower'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.categories'::regclass
       and conname = 'categories_pagination_window_size_check'
  ) then
    alter table public.categories
      add constraint categories_pagination_window_size_check
      check (pagination_window_size between 1 and 25);
  end if;

  /* page_size 범위 확장 — 기존 제약을 넓히기만 한다 */
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.categories'::regclass
       and conname = 'categories_page_size_check'
       and pg_get_constraintdef(oid) not like '%100%'
  ) then
    alter table public.categories
      drop constraint categories_page_size_check;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.categories'::regclass
       and conname = 'categories_page_size_check'
  ) then
    alter table public.categories
      add constraint categories_page_size_check
      check (page_size between 1 and 100);
  end if;

end;
$migration$;


comment on column public.categories.pagination_style is
  'HIGHLIGHT-2: 페이지 번호 표기. decimal(1 2 3) | roman_lower(i ii iii). 최종 label 은 플랫폼이 만들어 Skin Context 에 넣는다 — 스킨이 로마 숫자를 계산하지 않는다.';

comment on column public.categories.pagination_window_size is
  'HIGHLIGHT-2: 한 번에 보여 줄 페이지 번호 개수(기본 7). 앞뒤로 잘린 쪽에는 hasLeadingEllipsis / hasTrailingEllipsis 가 true 로 온다.';

comment on column public.categories.page_size is
  'GALLERY-1/HIGHLIGHT-2: 한 페이지에 담는 글 수. post 와 gallery 가 같은 계산기를 쓴다(1..100). 실제로 페이지가 나뉘려면 렌더 중인 스킨이 category.pagination 계약을 써야 한다 — 쓰지 않는 스킨에서는 지금까지처럼 전체 목록이 그대로 온다.';


-- =========================================================
-- 5) memo_folder_settings -> highlight_folder_settings
--
-- ★ 왜 새 테이블이 아니라 rename 인가
--   담고 있는 데이터의 의미가 하나도 바뀌지 않았다 — "하이라이트
--   화면에서 이 원본 카테고리를 몇 번째로, 어떤 커버로 그릴까"
--   그대로다. 새 테이블 + 복사는 같은 뜻의 행을 두 곳에 두는 것이고,
--   그 순간부터 어느 쪽이 진짜인지 정하는 코드가 필요해진다.
--   rename 은 행/PK/RLS/GRANT/인덱스를 그대로 들고 이름만 바꾼다.
--
-- ★ 배포 순서 때문에 옛 이름도 당분간 살려 둔다
--   CSS/JS 는 CDN 에서 최대 4시간 캐시된다(CLAUDE.md §4). migration
--   을 적용한 직후에도 방문자 브라우저는 `from("memo_folder_settings")`
--   를 부르는 예전 번들을 들고 있을 수 있다. 그래서 옛 이름을
--   **security_invoker view** 로 남긴다 — 밑에 있는 것은 같은 테이블
--   하나이고 RLS 도 그 테이블의 정책이 그대로 적용된다.
--   view 는 읽기 전용으로 둔다(쓰기는 원래부터 RPC 전용이었다).
--
-- ★ 함수 본문은 반드시 다시 만든다
--   plpgsql 본문은 텍스트로 저장돼 호출 시점에 파싱된다. 테이블만
--   rename 하면 upsert_own_memo_folder_settings 는 다음 호출에서
--   "relation does not exist" 로 깨진다. 그래서 새 이름으로 다시
--   만들고, 옛 이름은 새 함수를 부르는 wrapper 로 교체한다.
-- =========================================================

do $migration$
begin

  /*
    regclass 캐스트를 쓰지 않는다 — 관계가 없으면 캐스트 자체가
    예외를 던져서, HIGHLIGHT-1 을 건너뛴 배포에서 이 블록이 깨진다.
  */
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'memo_folder_settings'
       and c.relkind = 'r'
  )
  and not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'highlight_folder_settings'
  )
  then

    alter table public.memo_folder_settings
      rename to highlight_folder_settings;

    /* 인덱스/정책 이름도 함께 정리한다(동작에는 영향 없다) */
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'memo_folder_settings_user_idx'
    ) then
      alter index public.memo_folder_settings_user_idx
        rename to highlight_folder_settings_user_idx;
    end if;

  end if;

end;
$migration$;


/* 테이블이 아직 없는 배포(HIGHLIGHT-1 을 건너뛴 경우)를 위한 생성 */
create table if not exists public.highlight_folder_settings (
  category_id bigint primary key
    references public.categories (id) on delete cascade,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  sort_order integer not null default 0,
  cover_path text
    check (cover_path is null or char_length(cover_path) between 1 and 400),
  has_cover boolean
    generated always as (cover_path is not null) stored,
  cover_ratio text not null default 'original'
    check (cover_ratio in ('1:1', '3:4', '4:3', 'original')),
  cover_focus_x smallint not null default 50
    check (cover_focus_x between 0 and 100),
  cover_focus_y smallint not null default 50
    check (cover_focus_y between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists highlight_folder_settings_user_idx
  on public.highlight_folder_settings (user_id, sort_order);

alter table public.highlight_folder_settings enable row level security;

drop policy if exists memo_folder_settings_public_read on public.highlight_folder_settings;
drop policy if exists highlight_folder_settings_public_read on public.highlight_folder_settings;

create policy highlight_folder_settings_public_read
on public.highlight_folder_settings
for select
to anon, authenticated
using (true);

revoke all on public.highlight_folder_settings from anon, authenticated;

grant select (
  category_id,
  user_id,
  sort_order,
  has_cover,
  cover_ratio,
  cover_focus_x,
  cover_focus_y,
  updated_at
) on public.highlight_folder_settings to anon, authenticated;


comment on table public.highlight_folder_settings is
  'HIGHLIGHT-2(구 memo_folder_settings): 하이라이트 화면의 폴더별 표시 설정. 여기서 폴더 = 하이라이트된 원문 글의 **현재** 카테고리다. categories 에 컬럼을 더하지 않고 옆 테이블로 둔 이유는 하이라이트 폴더의 커버·순서를 바꿔도 원본 카테고리의 갤러리 설정이 바뀌지 않아야 하기 때문이다. 행이 없으면 기본값으로 그려진다. 옛 이름은 public.memo_folder_settings view 로 당분간 읽을 수 있다.';

comment on column public.highlight_folder_settings.cover_path is
  'HIGHLIGHT-2: post-covers(비공개) 버킷 안의 object key. 공개 주소가 아니며 SELECT GRANT 에서 제외되어 있다 — 화면은 /api/post-cover?highlight=<카테고리 id>(옛 ?memo=)로만 받는다. 파일 경로 자체는 HIGHLIGHT-1 때의 규칙을 그대로 둔다(이름을 바꾸면 이미 올라간 파일이 고아가 된다).';


/* 옛 이름 호환 view — 읽기 전용. 제거 가능 시점은 설계 문서 §12. */
do $migration$
begin

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'memo_folder_settings' and c.relkind = 'r'
  ) then
    /* rename 이 안 된 이상한 상태 — 사람이 봐야 한다 */
    raise exception 'public.memo_folder_settings 가 아직 테이블입니다. 위 rename 블록을 확인하세요.';
  end if;

end;
$migration$;

create or replace view public.memo_folder_settings
  with (security_invoker = true)
as
  select
    category_id,
    user_id,
    sort_order,
    has_cover,
    cover_ratio,
    cover_focus_x,
    cover_focus_y,
    updated_at
  from public.highlight_folder_settings;

comment on view public.memo_folder_settings is
  'DEPRECATED 호환 view. 진짜 테이블은 public.highlight_folder_settings 다. CDN 에 남은 예전 JS 번들(최대 4시간)이 이 이름으로 읽기 때문에 당분간 유지한다 — cover_path 는 여기에도 없다(비공개 버킷 경로).';

revoke all on public.memo_folder_settings from anon, authenticated;

grant select on public.memo_folder_settings to anon, authenticated;


-- ---------------------------------------------------------
-- 쓰기 RPC — 새 이름
-- ---------------------------------------------------------

create or replace function public.upsert_own_highlight_folder_settings(
  p_category_id   bigint,
  p_sort_order    integer,
  p_cover_ratio   text,
  p_cover_focus_x smallint,
  p_cover_focus_y smallint,
  p_cover_path    text default null,
  p_keep_cover    boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner    uuid;
  v_previous text;
  v_ratio    text;
begin

  if auth.uid() is null then
    raise exception 'upsert_own_highlight_folder_settings: authentication required'
      using errcode = '42501';
  end if;

  select c.user_id into v_owner
    from public.categories c
   where c.id = p_category_id;

  if v_owner is null then
    raise exception 'upsert_own_highlight_folder_settings: category % not found', p_category_id
      using errcode = '23503';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'upsert_own_highlight_folder_settings: not the owner of category %', p_category_id
      using errcode = '42501';
  end if;

  v_ratio := coalesce(nullif(btrim(coalesce(p_cover_ratio, '')), ''), 'original');

  if v_ratio not in ('1:1', '3:4', '4:3', 'original') then
    raise exception 'upsert_own_highlight_folder_settings: invalid ratio %', p_cover_ratio
      using errcode = '22023';
  end if;

  select s.cover_path into v_previous
    from public.highlight_folder_settings s
   where s.category_id = p_category_id;

  insert into public.highlight_folder_settings (
    category_id, user_id, sort_order,
    cover_path, cover_ratio, cover_focus_x, cover_focus_y
  )
  values (
    p_category_id,
    auth.uid(),
    coalesce(p_sort_order, 0),
    case when p_keep_cover then null else p_cover_path end,
    v_ratio,
    coalesce(p_cover_focus_x, 50),
    coalesce(p_cover_focus_y, 50)
  )
  on conflict (category_id) do update
     set sort_order    = excluded.sort_order,
         cover_path    = case when p_keep_cover
                              then public.highlight_folder_settings.cover_path
                              else excluded.cover_path end,
         cover_ratio   = excluded.cover_ratio,
         cover_focus_x = excluded.cover_focus_x,
         cover_focus_y = excluded.cover_focus_y,
         updated_at    = now();

  if p_keep_cover then
    return null;
  end if;

  if v_previous is not distinct from p_cover_path then
    return null;
  end if;

  return v_previous;

end;
$fn$;

comment on function public.upsert_own_highlight_folder_settings(bigint, integer, text, smallint, smallint, text, boolean) is
  'HIGHLIGHT-2(구 upsert_own_memo_folder_settings): 하이라이트 화면의 폴더(원본 카테고리) 표시 설정을 저장한다. 반환값은 이 호출로 밀려난 이전 cover_path(없으면 null) — 호출자는 저장이 성공한 뒤에만 그 파일을 지운다. p_keep_cover=true 면 커버는 손대지 않고 순서/비율/구도만 바꾼다. 카테고리 주인만 호출할 수 있으며 categories 행은 전혀 건드리지 않는다.';

revoke execute on function
  public.upsert_own_highlight_folder_settings(bigint, integer, text, smallint, smallint, text, boolean)
from public, anon;

grant execute on function
  public.upsert_own_highlight_folder_settings(bigint, integer, text, smallint, smallint, text, boolean)
to authenticated;


create or replace function public.get_own_highlight_folder_cover_paths(
  p_category_ids bigint[]
)
returns setof text
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.cover_path
    from public.highlight_folder_settings s
   where s.user_id = auth.uid()
     and s.category_id = any (p_category_ids)
     and s.cover_path is not null
$fn$;

revoke execute on function public.get_own_highlight_folder_cover_paths(bigint[]) from public, anon;
grant execute on function public.get_own_highlight_folder_cover_paths(bigint[]) to authenticated;


create or replace function public.get_highlight_folder_cover_object(
  p_category_id bigint
)
returns table (
  storage_path text,
  mime_type    text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.cover_path, null::text
    from public.highlight_folder_settings s
   where s.category_id = p_category_id
     and s.cover_path is not null
$fn$;

comment on function public.get_highlight_folder_cover_object(bigint) is
  'HIGHLIGHT-2(구 get_memo_folder_cover_object): /api/post-cover?highlight=<카테고리 id> 프록시가 부른다. 폴더 커버는 카테고리 장식이라 카테고리와 같은 공개 범위다 — 판정 없이 경로만 준다. mime 은 저장하지 않으므로 null 이고 프록시가 확장자로 정한다.';

revoke all on function public.get_highlight_folder_cover_object(bigint) from public;
grant execute on function public.get_highlight_folder_cover_object(bigint) to anon, authenticated;


-- ---------------------------------------------------------
-- 옛 이름 RPC — 새 함수를 부르는 wrapper 로 교체한다.
-- (CDN 에 남은 예전 번들이 이 이름을 부른다.)
-- ---------------------------------------------------------

create or replace function public.upsert_own_memo_folder_settings(
  p_category_id   bigint,
  p_sort_order    integer,
  p_cover_ratio   text,
  p_cover_focus_x smallint,
  p_cover_focus_y smallint,
  p_cover_path    text default null,
  p_keep_cover    boolean default false
)
returns text
language sql
security invoker
set search_path = ''
as $fn$
  select public.upsert_own_highlight_folder_settings(
    p_category_id, p_sort_order, p_cover_ratio,
    p_cover_focus_x, p_cover_focus_y, p_cover_path, p_keep_cover
  )
$fn$;

comment on function public.upsert_own_memo_folder_settings(bigint, integer, text, smallint, smallint, text, boolean) is
  'DEPRECATED. upsert_own_highlight_folder_settings 를 부르는 호환 wrapper 다(권한 검사는 그 안에서 한다). 제거 가능 시점은 IMORY_HIGHLIGHT2_CATEGORY_AND_SETTINGS.md §12.';

revoke execute on function
  public.upsert_own_memo_folder_settings(bigint, integer, text, smallint, smallint, text, boolean)
from public, anon;

grant execute on function
  public.upsert_own_memo_folder_settings(bigint, integer, text, smallint, smallint, text, boolean)
to authenticated;


create or replace function public.get_own_memo_folder_cover_paths(
  p_category_ids bigint[]
)
returns setof text
language sql
security invoker
set search_path = ''
as $fn$
  select * from public.get_own_highlight_folder_cover_paths(p_category_ids)
$fn$;

revoke execute on function public.get_own_memo_folder_cover_paths(bigint[]) from public, anon;
grant execute on function public.get_own_memo_folder_cover_paths(bigint[]) to authenticated;


create or replace function public.get_memo_folder_cover_object(
  p_category_id bigint
)
returns table (
  storage_path text,
  mime_type    text
)
language sql
security invoker
set search_path = ''
as $fn$
  select * from public.get_highlight_folder_cover_object(p_category_id)
$fn$;

revoke all on function public.get_memo_folder_cover_object(bigint) from public;
grant execute on function public.get_memo_folder_cover_object(bigint) to anon, authenticated;


-- =========================================================
-- 6) change_own_category_type — 타입 변경을 안전하게 (요구사항 10)
--
-- 관리 화면의 평범한 타입 변경(post <-> gallery)은 지금까지처럼
-- categories.update 로 한다. 이 RPC 가 필요한 경우는 하나다:
-- **글이나 폴더가 남아 있는 카테고리를 singleton 타입으로 바꿀 때**.
-- 그때는 옮길 목적지를 받아 한 트랜잭션 안에서
--   글 이동 -> 폴더 이동 -> 타입 변경
-- 을 하고, 어느 단계든 실패하면 전체가 rollback 된다.
--
-- ★ 왜 폴더도 함께 옮기는가
--   post_folders.category_id 는 폴더가 속한 카테고리다. 글만 옮기면
--   글의 folder_id 가 **다른 카테고리의 폴더**를 가리키게 되어
--   목록에서 사라진다. 부모/자식 관계(parent_id)와 글의 folder_id 는
--   건드리지 않으므로 폴더 구조와 글의 자리가 그대로 따라간다.
--
-- ★ BANNER 는 비우게 한다
--   배너 항목이 남아 있는 BANNER 카테고리의 타입 변경은 거절한다.
--   banners 를 옮길 다른 BANNER 카테고리는 singleton 규칙상 존재할
--   수 없고(3번), 남겨 두면 어느 화면에도 나오지 않는 고립 데이터가
--   된다. "먼저 비우라"가 유일하게 안전한 답이다.
--
-- ★ HIGHLIGHT 에서 나갈 때
--   post_highlights 는 손대지 않는다. 그 테이블은 posts 를 부모로
--   두고 있고 category 행은 표시·내비게이션 설정일 뿐이다.
-- =========================================================

create or replace function public.change_own_category_type(
  p_category_id             bigint,
  p_type                    text,
  p_destination_category_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid        uuid := auth.uid();
  v_category   public.categories%rowtype;
  v_dest       public.categories%rowtype;
  v_has_items  boolean;
  v_singleton  boolean;
begin

  if v_uid is null then
    raise exception 'change_own_category_type: authentication required'
      using errcode = '42501';
  end if;

  if p_type not in ('post', 'gallery', 'banner', 'highlight') then
    raise exception 'change_own_category_type: unknown type %', p_type
      using errcode = '22023';
  end if;


  /* for update — 동시에 들어온 두 요청이 같은 판정을 두 번 통과하지 못하게 */
  select * into v_category
    from public.categories
   where id = p_category_id
   for update;

  if not found or v_category.user_id <> v_uid then
    raise exception 'change_own_category_type: not the owner of category %', p_category_id
      using errcode = '42501';
  end if;


  if v_category.type = p_type then
    return;
  end if;


  v_singleton := p_type in ('banner', 'highlight');


  /* singleton 충돌은 목적지 선택보다 **먼저** 거절한다 */
  if v_singleton and exists (
    select 1 from public.categories
     where user_id = v_uid
       and type = p_type
       and id <> p_category_id
  ) then
    raise exception 'change_own_category_type: % 카테고리는 블로그당 하나만 둘 수 있습니다', upper(p_type)
      using errcode = '23505';
  end if;


  /* 배너 항목이 남아 있으면 타입을 바꾸지 않는다 */
  if v_category.type = 'banner' and exists (
    select 1 from public.banners where category_id = p_category_id
  ) then
    raise exception 'change_own_category_type: 배너 항목이 남아 있습니다. 먼저 비운 뒤 타입을 바꿀 수 있습니다'
      using errcode = '23503';
  end if;


  v_has_items :=
    exists (select 1 from public.posts        where category_id = p_category_id)
    or exists (select 1 from public.post_folders where category_id = p_category_id);


  if v_singleton and v_has_items then

    if p_destination_category_id is null then
      raise exception 'change_own_category_type: 글 또는 폴더가 있어 옮길 목적지가 필요합니다'
        using errcode = '23502';
    end if;

    select * into v_dest
      from public.categories
     where id = p_destination_category_id
     for update;

    if not found
      or v_dest.user_id <> v_uid
      or v_dest.id = p_category_id
      or v_dest.type not in ('post', 'gallery')
    then
      raise exception 'change_own_category_type: 목적지 카테고리 %가 올바르지 않습니다', p_destination_category_id
        using errcode = '22023';
    end if;

    /* 폴더를 먼저 옮긴다 — 글의 folder_id 는 그대로 유지된다 */
    update public.post_folders
       set category_id = v_dest.id
     where category_id = p_category_id;

    update public.posts
       set category_id = v_dest.id
     where category_id = p_category_id;

  end if;


  update public.categories
     set type = p_type,
         list_style = case when p_type = 'gallery' then 'gallery' else 'list' end
   where id = p_category_id;

end;
$fn$;

comment on function public.change_own_category_type(bigint, text, bigint) is
  'HIGHLIGHT-2: 카테고리 타입 변경. singleton 타입(banner/highlight)으로 바꿀 때 글/폴더가 남아 있으면 p_destination_category_id 로 옮긴 뒤 타입을 바꾼다 — 한 트랜잭션이라 중간에 실패하면 글도 폴더도 타입도 그대로다. singleton 충돌은 목적지 선택보다 먼저 거절하고, 배너 항목이 남은 BANNER 는 타입을 바꾸지 않는다. post_highlights 는 어떤 경우에도 건드리지 않는다.';

revoke execute on function public.change_own_category_type(bigint, text, bigint) from public, anon;
grant execute on function public.change_own_category_type(bigint, text, bigint) to authenticated;


notify pgrst, 'reload schema';

commit;
