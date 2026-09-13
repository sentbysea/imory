-- =========================================================
-- SHARE CARD — 자동 카드 라벨의 번호 (posts.share_label_seq)
--
-- 기준 문서: IMORY_SHARE_CARD_DESIGN.md §4-3
-- 레이아웃:  core/lib/share-card.js (shareCardAutoLabel)
-- 서버:      functions/api/og/post.js
--
-- ★ 이 컬럼이 푸는 문제
--
-- 공유 카드 우상단의 자동 라벨은 `카테고리 · 001` 모양이고, 번호는
-- "그 컨테이너(카테고리 또는 폴더) 안에서 공개된 글을 created_at
-- 오름차순으로 센 순번"이다.
--
-- 이 값을 **요청할 때마다 세면** 이미 세상에 나간 카드의 번호가
-- 뒤바뀐다:
--
--   003 번 글을 공유한 다음 001 번 글을 지우면
--   → 그 카드를 다시 받아가는 크롤러에게는 같은 글이 002 가 된다.
--
-- 그래서 **게시 시점의 순번을 한 번 계산해서 굳힌다.** 한 번 붙은
-- 번호는 앞 글이 지워져도, 비공개로 바뀌어도 그대로다.
--
-- ★ 클라이언트는 이 값을 쓸 수 없다
--
-- GRANT 는 SELECT 에만 준다(INSERT/UPDATE 목록에는 넣지 않는다).
-- 값을 채우는 것은 아래 BEFORE 트리거뿐이다 —
-- [[20260908110000_add_posts_folder_id_sort_order.sql]] 의
-- sort_order 와 완전히 같은 규칙이다.
--
-- ★ 트리거 이름과 순서
--
-- 같은 테이블의 BEFORE 트리거는 **이름 알파벳순**으로 돈다.
-- posts_sync_folder_and_sort_order_trg 가 먼저 돌아야 한다 —
-- 그 트리거가 "카테고리를 바꾸면 folder_id 를 null 로 되돌리는"
-- 일을 하고, 이 트리거는 그렇게 **확정된 컨테이너**를 보고
-- 번호를 매겨야 하기 때문이다.
--
--   posts_sync_folder_and_sort_order_trg   (f)
--   posts_sync_share_label_seq_trg         (s)  ← 이 파일
--
-- 기존 컬럼·제약·RLS·정책은 하나도 건드리지 않는다. 그대로
-- 재실행해도 안전하다(additive).
--
-- ※ Supabase SQL Editor 에 붙여넣어 적용한다. supabase CLI 로
--   적용하면 CLI 가 이미 트랜잭션을 열므로 begin/commit 두 줄은
--   제거한다.
-- =========================================================

begin;


-- =========================================================
-- 1) 컬럼
-- =========================================================

alter table public.posts
  add column if not exists share_label_seq integer;


comment on column public.posts.share_label_seq is
  'SHARE CARD: 공개된 순간 굳는 컨테이너(user_id, category_id, folder_id) 안의 순번. 공유 카드 자동 라벨 `카테고리 · 001` 의 번호. 앞 글을 지워도 다시 계산하지 않는다.';


-- =========================================================
-- 2) backfill — 기존 공개 글에 최초 계산값을 한 번만
--
-- created_at 오름차순(동률은 id 오름차순으로 tie-break)이다.
-- tie-break 가 없으면 실행할 때마다 결과가 달라질 수 있다.
--
-- 이미 값이 있는 행은 건드리지 않는다(재실행 안전).
-- 공개가 아닌 글에는 번호를 주지 않는다 — 공개되는 순간
-- 아래 트리거가 그때의 맨 끝 번호를 준다.
-- =========================================================

with ranked as (

  select
    p.id,
    row_number() over (
      partition by p.user_id, p.category_id, p.folder_id
      order by p.created_at asc, p.id asc
    ) as seq
  from public.posts p
  where p.visibility = 'public'
    and p.share_label_seq is null

)
update public.posts p
   set share_label_seq = ranked.seq
  from ranked
 where ranked.id = p.id;


-- =========================================================
-- 3) 인덱스 — 다음 번호를 찾는 질의 하나를 위해
-- =========================================================

create index if not exists posts_share_label_seq_idx
  on public.posts (user_id, category_id, folder_id, share_label_seq);


-- =========================================================
-- 4) 트리거
--
--   (a) 컨테이너가 바뀌면 번호를 놓아준다. 다른 폴더/카테고리로
--       옮긴 글은 그쪽 번호 공간의 맨 끝을 새로 받는다(옛 번호를
--       들고 가면 그 컨테이너 안에서 번호가 겹친다).
--
--   (b) 공개 글에 번호가 없으면 그때 매긴다 — 컨테이너 안의
--       max + 1. "공개되는 순간" 한 번만 일어난다.
--
--   (c) 비공개/비밀글로 바꿔도 번호를 지우지 않는다. 다시 공개로
--       돌렸을 때 이미 공유된 카드와 같은 번호여야 한다.
--
--   (d) 클라이언트가 보낸 값은 믿지 않는다. GRANT 로 이미 막혀
--       있지만, SECURITY DEFINER RPC 가 늘어날 수 있으므로 여기서도
--       "이전 값 아니면 계산값"만 통과시킨다.
-- =========================================================

create or replace function public.posts_assign_share_label_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_next integer;
begin

  if tg_op = 'INSERT' then

    /* (d) 새 글이 값을 들고 들어올 수는 없다 */

    new.share_label_seq := null;

  else

    /* (a) 컨테이너가 그대로면 이전 값을 그대로 이어간다 —
           (c) 공개 여부가 바뀌어도 마찬가지다. */

    if new.category_id is not distinct from old.category_id
       and new.folder_id is not distinct from old.folder_id then

      new.share_label_seq := old.share_label_seq;

    else

      new.share_label_seq := null;

    end if;

  end if;


  /* (b) 공개 글에 번호가 없으면 지금 매긴다 */

  if new.visibility = 'public' and new.share_label_seq is null then

    select coalesce(max(p.share_label_seq), 0) + 1
      into v_next
      from public.posts p
     where p.user_id = new.user_id
       and p.category_id is not distinct from new.category_id
       and p.folder_id is not distinct from new.folder_id
       and p.id is distinct from new.id;

    new.share_label_seq := v_next;

  end if;


  return new;

end;
$fn$;


drop trigger if exists posts_sync_share_label_seq_trg on public.posts;

create trigger posts_sync_share_label_seq_trg
  before insert or update on public.posts
  for each row
  execute function public.posts_assign_share_label_seq();


-- =========================================================
-- 5) GRANT — SELECT 에만
--
-- 카드를 그리는 쪽(/api/og/post 는 anon 키로 읽는다)과 설정
-- 미리보기(주인장)가 읽을 수 있어야 한다. 쓰기는 트리거만 한다.
-- =========================================================

grant select (share_label_seq) on public.posts to anon, authenticated;


commit;
