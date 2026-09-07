-- =========================================================
-- SKIN IMAGE LIBRARY v0.1
--
-- 참고: SKIN_IMAGE_LIBRARY_PLAN.md (설계 근거 전문),
-- AI_SKIN_PHASE1A_DESIGN.md 2-2/2-4절(append-only + 포인터 이동,
-- 슬롯 구조/슬롯 값 분리).
--
-- 왜 새 테이블인가
-- ----------------
-- 기존 public.skin_image_slot_values는 (skin_id, slot_name) 기준이라
-- draft/published 구분이 없다([[20260904100000_create_skins_skin_versions.sql]]).
-- 거기에 UI를 붙이면 슬롯을 바꾸는 순간 공개본이 바뀌고, Publish
-- 시점에 "그 버전이 쓰던 이미지"를 재현할 수 없다. 그래서 연결에
-- 버전 축을 넣은 새 테이블을 만든다.
--
-- 기존 skin_image_slot_values는 이 migration에서 **전혀 건드리지
-- 않는다** — 구조/정책/데이터 그대로 두고, get_published_skin()의
-- 읽기 폴백으로만 계속 쓰인다(아래 5번). 저장소 전체 grep 기준
-- 애플리케이션 코드에는 이 테이블에 쓰는 경로가 하나도 없고
-- (supabase/tests/*.sql 수동 시드만 존재), 이번에도 만들지 않는다.
--
-- 이 migration이 하는 일
-- ----------------------
--   1) storage 버킷 'skin-images' + 정책
--   2) public.skin_images (사용자별 이미지 라이브러리)
--   3) public.skin_version_image_slots (버전별 슬롯 연결)
--   4) RLS + GRANT
--   5) create_skin_image / delete_skin_image /
--      save_skin_draft_version_with_image_slots (신규 RPC)
--   6) get_published_skin / restore_skin_version (같은 시그니처 교체)
--
-- 기존 save_skin_draft_version(uuid, jsonb, smallint, text)와
-- create_skin_with_initial_version(...)은 한 줄도 바꾸지 않는다 —
-- 시그니처에 파라미터를 더하면 오버로드가 생겨 PostgREST 호출이
-- 모호해지므로, 이미지 연결이 필요한 Save는 새 이름의 함수를 쓴다.
-- 그래야 이 migration 적용 전/후 모두 프런트가 안전하게 동작한다
-- (SKIN_IMAGE_LIBRARY_PLAN.md 8절).
-- =========================================================


-- =========================================================
-- 1) STORAGE BUCKET — skin-images
--
-- user-avatars/user-favicons/user-cursors와 동일한 own-folder RLS
-- 구조([[20260906110000_create_user_avatars_bucket.sql]])지만,
-- object 경로 규칙이 결정적으로 다르다:
--
--   기존:  {user_id}/avatar        (고정 경로 + upsert 덮어쓰기)
--   여기:  {user_id}/{uuid}.{ext}  (매 업로드마다 새 경로, 덮어쓰기 없음)
--
-- 고정 경로 덮어쓰기는 "같은 URL의 내용이 바뀐다"는 뜻이라, 이미
-- 발행된 공개 스킨이 그 URL을 참조하고 있으면 Publish 없이도 공개
-- 화면이 바뀐다. Image Library는 그걸 구조적으로 못 하게 한다.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('skin-images', 'skin-images', true)
on conflict (id) do nothing;


create policy "skin_images_owner_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'skin-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'skin-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 발행된 Skin을 익명 방문자가 봐야 하므로 공개 읽기는 필수다.
-- "URL을 아는 사람은 그 이미지를 볼 수 있다"와 "누가 어떤 이미지를
-- 갖고 있는지 목록을 볼 수 있다"는 아래 public.skin_images RLS로
-- 완전히 분리된다.
create policy "skin_images_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'skin-images');


-- =========================================================
-- 2) public.skin_images — 사용자별 이미지 라이브러리
--
-- storage_path는 버킷 안에서의 object key({user_id}/{uuid}.{ext}).
-- public_url은 그 key의 공개 URL을 그대로 저장한다 — 매 조회마다
-- 문자열로 조립하지 않고 저장된 값을 쓰기 위함이며, https-only
-- 제약은 skin/skin-sanitize.js의 URL 정책을 DB에서도 한 번 더
-- 방어한다(기존 skin_image_slot_values.image_url과 동일한 관례).
--
-- mime_type 화이트리스트에 image/svg+xml은 의도적으로 없다 — SVG는
-- 스크립트를 품을 수 있어 sanitize 경계 밖의 실행 경로가 된다.
-- =========================================================

create table public.skin_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  storage_path text not null unique
    check (char_length(storage_path) between 1 and 400),
  public_url text not null
    check (public_url ~ '^https://'),
  original_name text
    check (original_name is null or char_length(original_name) <= 200),
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  byte_size integer not null
    check (byte_size > 0 and byte_size <= 5242880),
  created_at timestamptz not null default now()
);

comment on table public.skin_images is
  '사용자가 Skin Studio IMAGES에 올린 이미지 라이브러리(개인 데이터). storage_path는 skin-images 버킷 안의 object key로 {user_id}/{uuid}.{ext} 형태이며 절대 재사용/덮어쓰기하지 않는다 — 같은 경로를 덮어쓰면 이미 발행된 공개 스킨이 참조하는 이미지가 Publish 없이 바뀌기 때문. 슬롯 연결은 이 테이블이 아니라 skin_version_image_slots가 버전 단위로 들고 있다(SKIN_IMAGE_LIBRARY_PLAN.md 2절).';

create index skin_images_user_id_created_at_idx
  on public.skin_images (user_id, created_at desc);


-- =========================================================
-- 3) public.skin_version_image_slots — 버전별 슬롯 연결
--
-- 핵심: skin_id가 아니라 **version_id** 기준이다.
--   - draft 연결   = skins.current_draft_version_id 의 row 집합
--   - published 연결 = skins.current_published_version_id 의 row 집합
--   - Publish는 포인터만 옮기므로 연결도 자동으로 함께 공개된다
--   - 과거 버전은 자기 연결을 그대로 보존한다(Restore가 이미지를
--     잃지 않는다)
--
-- image_id on delete restrict: 어떤 버전이든(발행 이력 포함) 참조
-- 중인 이미지는 DB가 삭제를 막는다 — "사용 중 이미지 삭제 방지"와
-- "과거 버전이 참조하는 이미지도 삭제 정책에서 고려"를 관례가 아니라
-- 제약으로 강제한다.
--
-- slot_name check는 skin_image_slot_values와 동일한 규칙을 쓴다.
-- "Skin에 선언되지 않은 슬롯은 저장하지 않는다"는 이 형식 검사가
-- 아니라 아래 save RPC가 content->'imageSlots'와 교집합을 취해서
-- 강제한다(선언 목록은 버전 content 안에만 있으므로 컬럼 제약으로는
-- 표현할 수 없다).
-- =========================================================

create table public.skin_version_image_slots (
  version_id uuid not null references public.skin_versions(id) on delete cascade,
  slot_name text not null
    check (slot_name ~ '^[a-z][a-z0-9_]*$' and char_length(slot_name) <= 50),
  image_id uuid not null references public.skin_images(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (version_id, slot_name)
);

comment on table public.skin_version_image_slots is
  'Skin 버전 하나가 각 이미지 슬롯에 무엇을 연결했는지. skin_id가 아니라 version_id 기준이라 draft 편집이 published 연결을 건드릴 수 없고, Publish(포인터 이동)만으로 그 버전의 연결이 함께 공개된다. image_id는 on delete restrict — 과거 발행 이력이 참조하는 이미지도 삭제되지 않는다(SKIN_IMAGE_LIBRARY_PLAN.md 2-3절).';

create index skin_version_image_slots_image_id_idx
  on public.skin_version_image_slots (image_id);


-- =========================================================
-- 4) RLS + GRANT
--
-- 기존 skins/skin_versions와 동일한 원칙: anon에게는 아무 권한도
-- 주지 않는다. 공개 방문자는 get_published_skin() RPC로만 이미지
-- URL을 얻는다 — 이미지 "목록"은 어떤 경로로도 익명에게 열리지
-- 않는다(공개 URL 열람과 비공개 관리 목록의 분리).
--
-- skin_images에 UPDATE를 주지 않는다: 이미지는 등록 후 변경 대상이
-- 아니다(파일이 바뀌면 새 업로드 = 새 row). skin_version_image_slots
-- 도 UPDATE를 주지 않는다 — 연결은 항상 "새 버전 row에 새로 insert"
-- 로만 바뀌어야 published 연결이 사후에 변조될 수 없다.
-- =========================================================

alter table public.skin_images enable row level security;

create policy "skin_images_owner_all"
on public.skin_images
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.skin_images from anon, authenticated, public;
grant select, insert, delete on public.skin_images to authenticated;


alter table public.skin_version_image_slots enable row level security;

create policy "skin_version_image_slots_owner_all"
on public.skin_version_image_slots
for all
to authenticated
using (
  exists (
    select 1
    from public.skin_versions v
    join public.skins s on s.id = v.skin_id
    where v.id = skin_version_image_slots.version_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.skin_versions v
    join public.skins s on s.id = v.skin_id
    where v.id = skin_version_image_slots.version_id
      and s.user_id = auth.uid()
  )
);

revoke all on public.skin_version_image_slots from anon, authenticated, public;
grant select on public.skin_version_image_slots to authenticated;

-- insert/delete를 authenticated에 직접 주지 않는다: 연결 기록은
-- 반드시 save_skin_draft_version_with_image_slots()/
-- restore_skin_version()(둘 다 SECURITY DEFINER)을 통해서만 생긴다.
-- 그래야 "선언되지 않은 슬롯은 저장하지 않는다"와 "published 버전의
-- 연결은 절대 사후 변경되지 않는다"를 클라이언트 관례가 아니라
-- 구조로 보장할 수 있다(GRANT 레벨 강제, 기존 skin_versions의
-- append-only 처리와 같은 사고방식).


-- =========================================================
-- 5) create_skin_image(...)
--
-- 업로드는 클라이언트가 Storage에 직접 하고(own-folder RLS가 통제),
-- 이 함수는 그 결과를 라이브러리에 등록만 한다. MIME/크기/개수
-- 상한은 클라이언트 검증을 신뢰하지 않고 여기서 다시 강제한다.
--
-- p_storage_path는 반드시 '{auth.uid()}/'로 시작해야 한다 — 남의
-- 폴더 경로를 자기 라이브러리 row로 등록하는 것을 막는다(Storage
-- 정책이 업로드는 막지만, 이미 존재하는 남의 object 경로를 문자열로
-- 적어 넣는 것까지 막지는 않으므로 여기서 따로 확인한다).
-- =========================================================

create or replace function public.create_skin_image(
  p_storage_path text,
  p_public_url text,
  p_original_name text,
  p_mime_type text,
  p_byte_size integer
)
returns public.skin_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count integer;
  v_row public.skin_images%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_storage_path is null or p_public_url is null then
    raise exception 'p_storage_path and p_public_url must not be null';
  end if;

  if p_storage_path not like (v_user_id::text || '/%') then
    raise exception 'storage path must live under the caller own folder';
  end if;

  if p_mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then
    raise exception 'unsupported image type: %', p_mime_type;
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 5242880 then
    raise exception 'image must be between 1 byte and 5 MB';
  end if;

  select count(*) into v_count
    from public.skin_images
    where user_id = v_user_id;

  if v_count >= 100 then
    raise exception 'image library is full (max 100 images) — delete some images first';
  end if;

  insert into public.skin_images (
    user_id, storage_path, public_url, original_name, mime_type, byte_size
  )
  values (
    v_user_id,
    p_storage_path,
    p_public_url,
    nullif(trim(coalesce(p_original_name, '')), ''),
    p_mime_type,
    p_byte_size
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.create_skin_image(text, text, text, text, integer) is
  'Storage에 이미 업로드된 object를 호출자(auth.uid())의 Skin 이미지 라이브러리에 등록한다. 경로가 호출자 폴더 밑인지, MIME 화이트리스트(png/jpeg/webp/gif — SVG 제외)인지, 5MB 이하인지, 사용자당 100장 이하인지를 전부 함수 안에서 다시 확인한다(클라이언트 검증은 UX용일 뿐 신뢰 경계가 아니다).';

revoke execute on function public.create_skin_image(text, text, text, text, integer) from public;
revoke execute on function public.create_skin_image(text, text, text, text, integer) from anon;
grant execute on function public.create_skin_image(text, text, text, text, integer) to authenticated;


-- =========================================================
-- 6) delete_skin_image(p_image_id)
--
-- 어떤 버전이든(draft/published/과거 이력) 참조 중이면 거절한다.
-- FK(on delete restrict)가 최종적으로 막아주지만, 사용자에게 보여줄
-- 친절한 메시지를 위해 먼저 확인한다(create_skin_with_initial_version
-- 이 partial unique index 앞에서 먼저 확인하는 것과 같은 관례).
--
-- Storage object는 이 함수가 지우지 않는다 — 반환한 storage_path로
-- 클라이언트가 own-folder 권한으로 지운다. 그 삭제가 실패하면 고아
-- 파일이 남는데, 자동 정리는 하지 않고 수동 조회 쿼리만 문서에
-- 남긴다(SKIN_IMAGE_LIBRARY_PLAN.md 7절).
-- =========================================================

create or replace function public.delete_skin_image(
  p_image_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_storage_path text;
  v_ref_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_image_id is null then
    raise exception 'p_image_id must not be null';
  end if;

  select storage_path
    into v_storage_path
    from public.skin_images
    where id = p_image_id
      and user_id = v_user_id;

  if not found then
    raise exception 'image not found or not owned by caller';
  end if;

  select count(*)
    into v_ref_count
    from public.skin_version_image_slots
    where image_id = p_image_id;

  if v_ref_count > 0 then
    raise exception
      'this image is still used by % saved skin version(s) — replace or clear those slots first',
      v_ref_count;
  end if;

  delete from public.skin_images
    where id = p_image_id
      and user_id = v_user_id;

  return v_storage_path;
end;
$$;

comment on function public.delete_skin_image(uuid) is
  '호출자 소유의 Skin 이미지 라이브러리 row를 삭제하고 그 storage_path를 반환한다(Storage object 삭제는 클라이언트 몫). 저장된 어떤 Skin 버전이라도 그 이미지를 참조하고 있으면 거절한다 — 과거 발행 이력이 참조하는 이미지까지 포함이며, FK on delete restrict가 최종 방어선이고 이 확인은 친절한 메시지를 위한 사전 검사다.';

revoke execute on function public.delete_skin_image(uuid) from public;
revoke execute on function public.delete_skin_image(uuid) from anon;
grant execute on function public.delete_skin_image(uuid) to authenticated;


-- =========================================================
-- 7) save_skin_draft_version_with_image_slots(...)
--
-- 기존 save_skin_draft_version()과 동일하게 "새 skin_versions row +
-- current_draft_version_id 이동"을 하고, 거기에 이번 draft의 이미지
-- 슬롯 연결을 같은 트랜잭션에서 함께 기록한다.
--
-- p_image_slots 모양: {"profile": "<skin_images.id>", ...}
--
-- 두 겹의 필터를 통과한 항목만 기록된다:
--   (a) p_content->'imageSlots'에 선언된 슬롯 이름일 것
--       — "Skin에 선언되지 않은 슬롯 연결은 저장하지 않는다"
--   (b) image_id가 호출자 소유의 skin_images row일 것
--       — 남의 이미지 id를 적어 넣어도 조용히 무시된다
--
-- 위반 시 예외를 던지지 않고 조용히 버린다: Import/Code Apply로
-- 슬롯 선언이 줄어든 직후의 Save가 "정상적으로 성공하되 사라진
-- 슬롯만 빠지는" 동작이어야 하기 때문이다(SKIN_IMAGE_LIBRARY_PLAN.md
-- 6절 규칙 2).
--
-- 기존 published 버전 row의 연결은 이 함수가 어디에서도 건드리지
-- 않는다 — 항상 방금 만든 새 version_id에만 insert한다. 그래서
-- "업로드/슬롯 교체/Save만으로 공개본이 바뀌지 않는다"가 성립한다.
-- =========================================================

create or replace function public.save_skin_draft_version_with_image_slots(
  p_skin_id uuid,
  p_content jsonb,
  p_schema_version smallint,
  p_label text default null,
  p_image_slots jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_version_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_skin_id is null then
    raise exception 'p_skin_id must not be null';
  end if;

  if p_content is null then
    raise exception 'p_content must not be null';
  end if;

  if p_schema_version is null then
    raise exception 'p_schema_version must not be null';
  end if;

  if not exists (
    select 1
    from public.skins
    where id = p_skin_id
      and user_id = v_user_id
  ) then
    raise exception 'skin not found or not owned by caller';
  end if;

  insert into public.skin_versions (skin_id, schema_version, content, label, created_by)
  values (p_skin_id, p_schema_version, p_content, p_label, v_user_id)
  returning id into v_version_id;

  update public.skins
    set current_draft_version_id = v_version_id
    where id = p_skin_id;

  if p_image_slots is not null and jsonb_typeof(p_image_slots) = 'object' then

    insert into public.skin_version_image_slots (version_id, slot_name, image_id)
    select
      v_version_id,
      requested.slot_name,
      img.id
    from jsonb_each_text(p_image_slots) as requested(slot_name, image_id)
    join public.skin_images img
      on img.id = requested.image_id::uuid
     and img.user_id = v_user_id
    where requested.image_id is not null
      and requested.slot_name in (
        select declared.value ->> 'name'
        from jsonb_array_elements(
          case
            when jsonb_typeof(p_content -> 'imageSlots') = 'array'
              then p_content -> 'imageSlots'
            else '[]'::jsonb
          end
        ) as declared(value)
        where declared.value ->> 'name' is not null
      );

  end if;

  return v_version_id;
end;
$$;

comment on function public.save_skin_draft_version_with_image_slots(uuid, jsonb, smallint, text, jsonb) is
  'save_skin_draft_version()과 동일하게 새 draft 버전을 만들고, 그 버전의 이미지 슬롯 연결까지 같은 트랜잭션에서 기록한다. p_image_slots는 {슬롯이름: skin_images.id} 형태이며, (a) p_content.imageSlots에 선언된 슬롯이고 (b) 호출자 소유 이미지인 항목만 기록된다(나머지는 예외 없이 조용히 버림 — Import로 슬롯 선언이 줄어든 직후의 Save가 정상 성공해야 하므로). 이미 발행된 버전의 연결은 어떤 경우에도 건드리지 않는다.';

revoke execute on function public.save_skin_draft_version_with_image_slots(uuid, jsonb, smallint, text, jsonb) from public;
revoke execute on function public.save_skin_draft_version_with_image_slots(uuid, jsonb, smallint, text, jsonb) from anon;
grant execute on function public.save_skin_draft_version_with_image_slots(uuid, jsonb, smallint, text, jsonb) to authenticated;


-- =========================================================
-- 8) get_published_skin(uuid) 교체 (같은 시그니처)
--
-- 바뀐 점은 imageSlotValues를 구하는 방법 하나뿐이다:
--   1순위: current_published_version_id의 skin_version_image_slots
--          -> skin_images.public_url
--   폴백:  연결이 0건이면 기존 skin_image_slot_values(skin_id 기준)
--
-- 폴백을 두는 이유: 이 migration 적용 전에 이미 발행된 스킨은 새
-- 테이블에 연결이 하나도 없다. 폴백이 없으면 그 사용자들의 공개
-- 화면에서 이미지가 한꺼번에 사라진다. 기존 테이블에 쓰는 코드
-- 경로는 지금도 없고 앞으로도 만들지 않으므로, 이 폴백은 "예전
-- 값이 최신 값을 덮어쓰는" 상황을 만들지 않는다.
--
-- draft를 참조하지 않는다는 원 설계(2-7절)는 그대로다 —
-- current_draft_version_id는 이 함수 본문 어디에도 없다.
-- =========================================================

create or replace function public.get_published_skin(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skin public.skins%rowtype;
  v_version public.skin_versions%rowtype;
  v_image_slots jsonb;
begin
  if p_user_id is null then
    return null;
  end if;

  select *
    into v_skin
    from public.skins
    where user_id = p_user_id
      and is_active
    limit 1;

  if not found then
    return null;
  end if;

  if v_skin.current_published_version_id is null then
    return null;
  end if;

  select *
    into v_version
    from public.skin_versions
    where id = v_skin.current_published_version_id;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_object_agg(s.slot_name, i.public_url), '{}'::jsonb)
    into v_image_slots
    from public.skin_version_image_slots s
    join public.skin_images i on i.id = s.image_id
    where s.version_id = v_skin.current_published_version_id;

  if v_image_slots = '{}'::jsonb then

    select coalesce(jsonb_object_agg(slot_name, image_url), '{}'::jsonb)
      into v_image_slots
      from public.skin_image_slot_values
      where skin_id = v_skin.id;

  end if;

  return jsonb_build_object(
    'skin', v_version.content,
    'schemaVersion', v_version.schema_version,
    'imageSlotValues', v_image_slots
  );
end;
$$;

comment on function public.get_published_skin(uuid) is
  '공개 방문자가 특정 사용자의 발행된 Skin을 읽는 유일한 통로. is_active skins row + current_published_version_id가 가리키는 skin_versions.content를 반환하며, imageSlotValues는 그 published 버전의 skin_version_image_slots -> skin_images.public_url로 구성한다(연결이 0건이면 Image Library 도입 이전에 발행된 스킨 호환을 위해 기존 skin_image_slot_values로 폴백). current_draft_version_id는 이 함수 어디에서도 참조하지 않는다(AI_SKIN_PHASE1A_DESIGN.md 2-7절).';

revoke execute on function public.get_published_skin(uuid) from public;
grant execute on function public.get_published_skin(uuid) to anon, authenticated;


-- =========================================================
-- 9) restore_skin_version(uuid, uuid, text) 교체 (같은 시그니처)
--
-- 바뀐 점: 새 버전 row를 만들 때 원본 버전의 이미지 슬롯 연결도
-- 함께 복제한다. 안 하면 Restore가 "그때 그 화면"을 복원한다는
-- 약속을 지키지 못하고 이미지만 사라진다.
--
-- 나머지 동작(과거 row로 포인터를 되돌리지 않고 복제본을 새로
-- 만든다)은 원 설계 그대로다.
-- =========================================================

create or replace function public.restore_skin_version(
  p_skin_id uuid,
  p_source_version_id uuid,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_source public.skin_versions%rowtype;
  v_new_version_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_skin_id is null then
    raise exception 'p_skin_id must not be null';
  end if;

  if p_source_version_id is null then
    raise exception 'p_source_version_id must not be null';
  end if;

  if not exists (
    select 1
    from public.skins
    where id = p_skin_id
      and user_id = v_user_id
  ) then
    raise exception 'skin not found or not owned by caller';
  end if;

  select *
    into v_source
    from public.skin_versions
    where id = p_source_version_id
      and skin_id = p_skin_id;

  if not found then
    raise exception 'source version not found for this skin';
  end if;

  insert into public.skin_versions (skin_id, schema_version, content, label, created_by)
  values (
    p_skin_id,
    v_source.schema_version,
    v_source.content,
    coalesce(nullif(trim(p_label), ''), 'Restored version'),
    v_user_id
  )
  returning id into v_new_version_id;

  insert into public.skin_version_image_slots (version_id, slot_name, image_id)
  select v_new_version_id, slot_name, image_id
    from public.skin_version_image_slots
    where version_id = p_source_version_id;

  update public.skins
    set current_draft_version_id = v_new_version_id
    where id = p_skin_id;

  return v_new_version_id;
end;
$$;

comment on function public.restore_skin_version(uuid, uuid, text) is
  '같은 skin 소속 과거 버전의 content를 복제한 새 skin_versions row를 만들고 current_draft_version_id를 옮긴다(과거 row로 포인터를 되돌리지 않음). 그 버전의 이미지 슬롯 연결(skin_version_image_slots)도 함께 복제해서 Restore가 이미지까지 그대로 되살리도록 한다.';

revoke execute on function public.restore_skin_version(uuid, uuid, text) from public;
revoke execute on function public.restore_skin_version(uuid, uuid, text) from anon;
grant execute on function public.restore_skin_version(uuid, uuid, text) to authenticated;
