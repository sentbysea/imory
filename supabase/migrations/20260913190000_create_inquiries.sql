-- =========================================================
-- INQUIRY — 사용자가 운영자에게 보내는 문의(글 + 첨부 사진)
--
-- 화면
--   보내는 쪽  imory  /admin/ → INQUIRY (admin/admin-inquiry.js)
--   받는 쪽    imory-ops 대시보드 INQUIRY 탭 (별도 private repo)
--
-- 이 migration이 만드는 것
--   1) public.inquiries              — 문의 한 건 = 한 행
--   2) inquiry-images 버킷 + 정책    — 첨부 사진(비공개)
--   3) public.submit_inquiry()       — 보내는 쪽(로그인 사용자 전용)
--   4) public.admin_list_inquiries() — 받는 쪽(운영자 전용)
--
-- 기존 테이블 / RLS / GRANT 는 아무것도 건드리지 않는다. 전부 추가다.
--
--
-- ★ 왜 테이블에 직접 GRANT를 하지 않는가
--
-- inquiries 는 anon/authenticated 에게 테이블 권한을 **하나도** 주지
-- 않고 RLS 정책도 만들지 않는다(admin_users 와 같은 default deny —
-- [[20260903130000_add_admin_users_operator_foundation.sql]]).
-- 그래서 쓰기는 submit_inquiry(), 읽기는 admin_list_inquiries() 이 두
-- SECURITY DEFINER 함수를 지나지 않고는 아예 불가능하다. 문의 본문은
-- "남이 쓴 글"이라 잘못된 select 정책 하나로 통째로 새는 종류의
-- 값이고, 정책을 잘 쓰는 것보다 정책이 없는 쪽이 사고 가능성이 낮다.
--
--
-- ★ 첨부 사진은 왜 비공개 버킷인가
--
-- 문의에 붙는 캡처에는 그 사람의 화면이 그대로 담긴다(비밀글 본문,
-- 주소, 계정 정보). public 버킷이면 경로만 알면 누구나 받을 수 있으므로
-- post-covers 와 같은 방식으로 비공개 버킷 + 객체 단위 SELECT 판정을
-- 쓴다([[20260911100000_post_covers_private_access.sql]]).
-- 읽을 수 있는 사람은 둘뿐이다: **올린 본인**과 **운영자**.
--
-- 정책 본문에서 private.is_operator() 를 직접 부를 수 없어서(정책은
-- 요청자 role 로 평가되는데 authenticated 에는 private 스키마 USAGE 가
-- 없다) post_cover_object_is_readable() 과 같은 모양의 SECURITY DEFINER
-- 술어 함수로 감싼다. get_operator_status() 를 권한 근거로 쓰지 않는다
-- (그건 화면 게이트용이다) — 이 술어는 매번 private.is_operator() 를
-- 다시 판정한다.
--
--
-- ★ 남는 파일
--
-- 사진만 올리고 보내지 않은 경우 객체가 남을 수 있다. 화면은 전송
-- 실패 시 방금 올린 객체를 지우지만(admin-inquiry.js), 그 정리가
-- 실패해도 접근 경계는 그대로다 — 그 파일을 읽을 수 있는 사람은
-- 여전히 올린 본인과 운영자뿐이다.
-- =========================================================

begin;


-- =========================================================
-- 1) public.inquiries
--
-- image_paths: inquiry-images 버킷 안의 객체 경로 배열이다. 사진 한
-- 장마다 행을 따로 두지 않는다 — 이 사진들은 문의 한 건에만 붙고,
-- 따로 조회되거나 순서가 바뀌거나 개별로 수정되지 않는다(그런
-- 성질이 있는 post_gallery_images 와는 다르다).
--
-- 사용자가 탈퇴하면 문의도 함께 사라진다(on delete cascade) —
-- 탈퇴는 "이 사람이 남긴 것을 지운다"는 뜻이고, 문의 본문에도 그
-- 사람이 쓴 내용이 들어 있다.
-- =========================================================

create table if not exists public.inquiries (

  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users (id) on delete cascade,

  body text not null
    check (char_length(body) between 1 and 5000),

  image_paths text[] not null default '{}'::text[]
    check (cardinality(image_paths) <= 5),

  created_at timestamptz not null default now()

);


comment on table public.inquiries is
  '사용자가 운영자에게 보낸 문의 한 건. 본문(body) + 첨부 사진 경로(image_paths, inquiry-images 버킷). anon/authenticated 에는 테이블 권한도 RLS 정책도 없다(default deny) — 쓰기는 public.submit_inquiry(), 읽기는 public.admin_list_inquiries() 로만 가능하다.';

comment on column public.inquiries.image_paths is
  'inquiry-images 버킷 안의 객체 경로 배열(최대 5개, "<user_id>/<uuid>.<ext>" 형태). submit_inquiry() 가 저장 시점에 경로마다 소유자와 실재 여부를 확인한다.';


create index if not exists inquiries_created_at_idx
  on public.inquiries (created_at desc);

create index if not exists inquiries_user_id_idx
  on public.inquiries (user_id);


alter table public.inquiries enable row level security;

-- 의도적으로 정책 없음 — RLS 기본 차단만으로 anon/authenticated 전면 차단.

revoke all on public.inquiries from anon, authenticated, public;


-- =========================================================
-- 2) inquiry-images 버킷 + 정책
--
-- public=false: /object/public/inquiry-images/... 주소는 존재하지
-- 않는다(404). 바이트는 요청자 토큰을 실은 storage API 요청으로만
-- 나가고, 그때 아래 SELECT 정책이 매번 평가된다.
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inquiry-images',
  'inquiry-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;


-- 읽어도 되는가 — 올린 본인이거나 운영자일 때만.

create or replace function public.inquiry_image_is_readable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null or p_name is null then
    return false;
  end if;

  if split_part(p_name, '/', 1) = auth.uid()::text then
    return true;
  end if;

  return private.is_operator();
exception
  when others then
    return false;
end;
$fn$;


comment on function public.inquiry_image_is_readable(text) is
  'inquiry-images 버킷의 객체 하나를 지금 이 요청자가 받아도 되는가 — 올린 본인이거나 운영자일 때만 true. storage.objects 의 SELECT 정책이 부른다(정책은 요청자 role 로 평가되어 private.is_operator() 를 직접 부를 수 없으므로 SECURITY DEFINER 로 감쌌다). 오류 시 false(fail closed).';


revoke execute on function public.inquiry_image_is_readable(text) from public;
revoke execute on function public.inquiry_image_is_readable(text) from anon;
grant execute on function public.inquiry_image_is_readable(text) to authenticated;


-- 올리기/지우기는 자기 폴더 안에서만. 읽기는 위 판정으로 따로 연다.

drop policy if exists inquiry_images_owner_write on storage.objects;

create policy inquiry_images_owner_write
on storage.objects
for all
to authenticated
using (
  bucket_id = 'inquiry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'inquiry-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);


drop policy if exists inquiry_images_gated_read on storage.objects;

create policy inquiry_images_gated_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'inquiry-images'
  and public.inquiry_image_is_readable(name)
);


-- =========================================================
-- 3) public.submit_inquiry(p_body, p_image_paths) — 보내는 쪽
--
-- 경로 검증은 save_own_gallery_images() 와 같은 모양이다: 첫 폴더가
-- 요청자 자신이고, 그 객체가 실제로 버킷에 있어야 한다. 그래서 남의
-- 파일 경로나 존재하지 않는 경로를 문의에 붙일 수 없다.
--
-- 같은 사람이 한 시간에 10건을 넘길 수 없다 — 화면 하나로 무한히
-- 행과 파일을 만들 수 있는 경로를 열어두지 않는다.
-- =========================================================

create or replace function public.submit_inquiry(
  p_body text,
  p_image_paths text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_paths text[] := coalesce(p_image_paths, '{}'::text[]);
  v_path text;
  v_id uuid;
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if char_length(v_body) = 0 then
    raise exception 'invalid p_body: must not be empty';
  end if;

  if char_length(v_body) > 5000 then
    raise exception 'invalid p_body: must be 5000 characters or fewer';
  end if;

  if cardinality(v_paths) > 5 then
    raise exception 'invalid p_image_paths: up to 5 images';
  end if;

  foreach v_path in array v_paths
  loop
    if v_path is null
      or split_part(v_path, '/', 1) is distinct from v_uid::text
      or not exists (
        select 1
          from storage.objects o
         where o.bucket_id = 'inquiry-images'
           and o.name = v_path
      )
    then
      raise exception 'invalid inquiry image' using errcode = '42501';
    end if;
  end loop;

  select count(*)
    into v_recent
    from public.inquiries i
   where i.user_id = v_uid
     and i.created_at > now() - interval '1 hour';

  if v_recent >= 10 then
    raise exception 'too many inquiries: try again later';
  end if;

  insert into public.inquiries (user_id, body, image_paths)
  values (v_uid, v_body, v_paths)
  returning id into v_id;

  return v_id;
end;
$$;


comment on function public.submit_inquiry(text, text[]) is
  '로그인한 사용자가 문의를 보낸다. 본문은 1~5000자, 첨부는 최대 5장이며 각 경로는 요청자 본인 폴더에 실제로 존재하는 inquiry-images 객체여야 한다. 한 사람당 한 시간에 10건까지. 반환은 새 문의 id.';


revoke execute on function public.submit_inquiry(text, text[]) from public;
revoke execute on function public.submit_inquiry(text, text[]) from anon;
grant execute on function public.submit_inquiry(text, text[]) to authenticated;


-- =========================================================
-- 4) public.admin_list_inquiries(p_limit, p_offset) — 받는 쪽
--
-- 기존 admin_* RPC 컨벤션 그대로: 매번 private.is_operator() 재검증,
-- 비운영자는 42501, p_limit/p_offset 은 clamp 하지 않고 예외.
--
-- 이메일은 반환하지 않는다 — 화면이 필요로 하는 것은 "누가 보냈는가"
-- 이고, 그건 닉네임/슬러그로 충분하다.
-- =========================================================

create or replace function public.admin_list_inquiries(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  slug text,
  body text,
  image_paths text[],
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid p_limit: must be between 1 and 100';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'invalid p_offset: must be >= 0';
  end if;

  return query
    select
      i.id,
      i.user_id,
      p.nickname,
      p.slug,
      i.body,
      i.image_paths,
      i.created_at
    from public.inquiries i
    left join public.profiles p
      on p.user_id = i.user_id
    order by i.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;


comment on function public.admin_list_inquiries(integer, integer) is
  '문의 목록(created_at 내림차순). 보낸 사람의 닉네임/슬러그와 본문·첨부 경로만 반환하고 이메일은 반환하지 않는다. p_limit(1~100)/p_offset(>=0) 범위를 벗어나면 예외. private.is_operator() 로 매번 재검증하며 비운영자는 42501 로 거절. imory-ops 대시보드 전용.';


revoke execute on function public.admin_list_inquiries(integer, integer) from public;
revoke execute on function public.admin_list_inquiries(integer, integer) from anon;
grant execute on function public.admin_list_inquiries(integer, integer) to authenticated;


notify pgrst, 'reload schema';

commit;
