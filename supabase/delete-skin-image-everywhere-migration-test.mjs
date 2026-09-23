/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — "사용처에서 제거하고 삭제" migration 검증
   (PGlite — 실제 Postgres)

   대상: supabase/migrations/20260923100000_delete_skin_image_everywhere.sql
         supabase/migrations/20260923120000_guard_skin_image_css_references.sql
         supabase/migrations/20260923130000_guard_skin_image_delete_paths.sql
         (follow-up 둘 — 같은 함수를 create or replace 로 교체한다. 셋을
          순서대로 적용한 **최종 상태**를 재므로, 앞 파일들의 동작도 여기서
          함께 본다.)

   무엇을 확인하는가
   ----------------
   1) [unused]   참조가 없는 이미지는 **기존** delete_skin_image() 가
                 지금까지처럼 지운다(이번 migration 이 그 함수를 바꾸지
                 않았다).
   2) [blocked]  참조가 있으면 기존 함수는 여전히 거절한다.
   3) [every]    delete_skin_image_everywhere() 는 draft · published ·
                 과거 이력의 연결을 **전부** 떼고 이미지 row 를 지우며
                 storage_path 를 돌려준다.
   4) [scope]    다른 사용자의 이미지는 손대지 못한다(예외 · 무변경).
   5) [other]    남의 버전이 참조 중이면 FK 가 막고 **전체가 롤백**된다
                 — 연결만 지워진 반쪽 상태가 남지 않는다.
   6) [rest]     같은 사용자의 **다른** 이미지 연결은 건드리지 않는다.
   7) [grant]    anon 에는 execute 가 없고 authenticated 에만 있다.
   9) [both]     삭제하는 **두 길 모두** 그 문을 지난다 — 슬롯에 안 걸린
                 이미지를 지우는 기존 delete_skin_image() 도 CSS 직접 참조가
                 있으면 거절한다(그 구멍으로 실제 파일이 지워졌었다).
                 공용 판정 함수는 바깥(anon · authenticated)에 열리지 않는다.
   8) [css]      follow-up 의 **직접 참조 guard** — 공개 중 · 편집 중 버전의
                 content(css/html)나 옛 skin_image_slot_values.image_url 이
                 그 파일의 storage_path 를 가리키면 **아무것도 지우지 않고**
                 SQLSTATE IM001 로 거절한다. 그 참조를 고친 뒤에는 지워진다.
                 과거 이력만 가리키는 경우는 막지 않는다(고칠 방법이 없다).

   실행:
     node supabase/delete-skin-image-everywhere-migration-test.mjs

   PGlite 는 supabase/.temp/gallery-validation/node_modules 에 이미
   설치돼 있다(다른 migration 검증 때 받은 것). 이 저장소에는 패키지
   매니저가 없으므로 새로 설치하지 않고 그 경로에서 import 한다.

   ★ 기존 delete_skin_image() 는 **원본 파일에서 그대로 떼어 와** 쓴다
     (아래 extractFunction) — 손으로 옮겨 적으면 "복사본만 통과하는"
     검증이 된다. 나머지 baseline(테이블 넷)은 그 migration 의 DDL 을
     옮긴 것이다. storage 정책 · RLS 는 PGlite 에 storage 스키마가
     없어 이 검증의 범위 밖이다(SKIN_IMAGE_LIBRARY_PLAN.md 와 같은
     한계).
========================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const PGLITE_ENTRY = join(
  HERE, ".temp", "gallery-validation", "node_modules",
  "@electric-sql", "pglite", "dist", "index.js"
);

const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);

const LIBRARY_MIGRATION = readFileSync(
  join(HERE, "migrations", "20260907100000_create_skin_image_library.sql"),
  "utf8"
);

const MIGRATION = readFileSync(
  join(HERE, "migrations", "20260923100000_delete_skin_image_everywhere.sql"),
  "utf8"
);

const GUARD_MIGRATION = readFileSync(
  join(HERE, "migrations", "20260923120000_guard_skin_image_css_references.sql"),
  "utf8"
);

const GUARD_PATHS_MIGRATION = readFileSync(
  join(HERE, "migrations", "20260923130000_guard_skin_image_delete_paths.sql"),
  "utf8"
);


let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed += 1; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? " — " + detail : ""}`); console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}

async function expectError(name, fn, text) {
  try {
    await fn();
    check(name, false, "예외가 나지 않았다");
  } catch (err) {
    check(
      name,
      String(err.message || "").includes(text),
      `message=${String(err.message).slice(0, 160)}`
    );
  }
}


/* 원본 migration 에서 함수 하나를 그대로 떼어 온다 */
function extractFunction(sql, name) {

  const start =
    sql.indexOf(`create or replace function public.${name}(`);

  if (start === -1) {
    throw new Error(`${name} 을(를) 원본에서 찾지 못했습니다`);
  }

  const end =
    sql.indexOf("\n$$;", start);

  if (end === -1) {
    throw new Error(`${name} 의 끝을 찾지 못했습니다`);
  }

  return sql.slice(start, end + 4);

}


const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const BASELINE = `
create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

create table auth.imory_session (
  uid uuid
);
insert into auth.imory_session values (null);

create or replace function auth.uid() returns uuid
language sql stable as $$ select uid from auth.imory_session limit 1 $$;

create table public.skins (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_draft_version_id uuid,
  current_published_version_id uuid
);

create table public.skin_versions (
  id uuid primary key,
  skin_id uuid not null references public.skins(id) on delete cascade,
  created_at timestamptz not null default now(),
  uses_image_library boolean not null default false,

  /* 실제 스키마와 같은 칸 — follow-up 의 guard 가 이것을 훑는다
     (20260904100000: content jsonb not null) */
  content jsonb not null default '{}'::jsonb
);

/* 도입 이전 모델 — get_published_skin 이 legacy 버전에서 폴백으로 읽는다.
   guard 가 여기 URL 도 함께 본다(20260904100000 의 그 표). */
create table public.skin_image_slot_values (
  skin_id uuid not null references public.skins(id) on delete cascade,
  slot_name text not null,
  image_url text not null,
  primary key (skin_id, slot_name)
);

create table public.skin_images (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

create table public.skin_version_image_slots (
  version_id uuid not null references public.skin_versions(id) on delete cascade,
  slot_name text not null,
  image_id uuid not null references public.skin_images(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (version_id, slot_name)
);

create role anon;
create role authenticated;

${extractFunction(LIBRARY_MIGRATION, "delete_skin_image")}

revoke execute on function public.delete_skin_image(uuid) from public;
grant execute on function public.delete_skin_image(uuid) to authenticated;
`;


/*
  A 의 스킨 하나에 버전 셋(과거 · 공개 중 · draft).
    img1 — 과거 · 공개 중 · draft 세 버전이 모두 쓴다
    img2 — 아무도 쓰지 않는다
    img3 — draft 만 쓴다(같은 사용자의 다른 이미지)
  B 의 스킨 하나(버전 하나) — 남의 참조를 만들 때만 쓴다.
*/
const SEED = `
insert into auth.users(id) values ('${USER_A}'), ('${USER_B}');

insert into public.skins(id, user_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '${USER_A}'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '${USER_B}');

insert into public.skin_versions(id, skin_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000001');

update public.skins
   set current_published_version_id = 'aaaaaaaa-0000-4000-8000-00000000000b',
       current_draft_version_id     = 'aaaaaaaa-0000-4000-8000-00000000000c'
 where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into public.skin_images(id, user_id, storage_path, public_url) values
  ('11111111-0000-4000-8000-000000000001', '${USER_A}', '${USER_A}/img1.png', 'https://x/img1.png'),
  ('11111111-0000-4000-8000-000000000002', '${USER_A}', '${USER_A}/img2.png', 'https://x/img2.png'),
  ('11111111-0000-4000-8000-000000000003', '${USER_A}', '${USER_A}/img3.png', 'https://x/img3.png'),
  ('22222222-0000-4000-8000-000000000001', '${USER_B}', '${USER_B}/bimg.png', 'https://x/bimg.png');

insert into public.skin_version_image_slots(version_id, slot_name, image_id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'cover',   '11111111-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'cover',   '11111111-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'cover',   '11111111-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'profile', '11111111-0000-4000-8000-000000000003');
`;


async function freshDb() {
  const db = new PGlite();
  await db.exec(BASELINE);
  await db.exec(SEED);

  /* 프로덕션과 같은 순서 — 앞 파일이 이미 적용된 DB 에 follow-up 을 얹는다 */
  await db.exec(MIGRATION);
  await db.exec(GUARD_MIGRATION);
  await db.exec(GUARD_PATHS_MIGRATION);

  return db;
}

/*
  ★ 20260923130000 은 **혼자서도 최종 상태를 만든다**(그 파일 머리말).
    1차 guard 를 건너뛴 DB 에 그것만 얹어도 같은지 따로 본다.
*/
async function freshDbWithoutFirstGuard() {
  const db = new PGlite();
  await db.exec(BASELINE);
  await db.exec(SEED);
  await db.exec(MIGRATION);
  await db.exec(GUARD_PATHS_MIGRATION);
  return db;
}

async function setUid(db, uid) {
  await db.query("update auth.imory_session set uid = $1", [uid]);
}

const IMG1 = "11111111-0000-4000-8000-000000000001";
const IMG2 = "11111111-0000-4000-8000-000000000002";
const IMG3 = "11111111-0000-4000-8000-000000000003";
const BIMG = "22222222-0000-4000-8000-000000000001";


/* =========================================================
   1) 쓰지 않는 이미지 · 2) 쓰는 이미지
========================================================== */

console.log("\n[unused] + [blocked]");

{
  const db = await freshDb();
  await setUid(db, USER_A);

  check("migration 적용", true);

  const unused =
    await db.query("select public.delete_skin_image($1) as path", [IMG2]);

  check("[unused] 참조 없는 이미지는 기존 함수가 그대로 지운다",
    unused.rows[0].path === `${USER_A}/img2.png`,
    JSON.stringify(unused.rows[0]));

  const left =
    await db.query("select count(*)::int as n from public.skin_images where id = $1", [IMG2]);

  check("[unused] row 가 사라졌다", left.rows[0].n === 0);

  await expectError(
    "[blocked] 참조가 있으면 기존 함수는 여전히 거절한다",
    () => db.query("select public.delete_skin_image($1)", [IMG1]),
    "still used by"
  );

  const kept =
    await db.query("select count(*)::int as n from public.skin_images where id = $1", [IMG1]);

  check("[blocked] 거절된 이미지는 그대로 남는다", kept.rows[0].n === 1);

  await db.close();
}


/* =========================================================
   3) 사용처에서 제거하고 삭제 · 6) 다른 이미지 보존
========================================================== */

console.log("\n[every] + [rest]");

{
  const db = await freshDb();
  await setUid(db, USER_A);

  const before =
    await db.query(
      "select count(*)::int as n from public.skin_version_image_slots where image_id = $1",
      [IMG1]
    );

  check("[every] 지우기 전 세 버전이 그 이미지를 쓰고 있다",
    before.rows[0].n === 3, JSON.stringify(before.rows[0]));

  const gone =
    await db.query("select public.delete_skin_image_everywhere($1) as path", [IMG1]);

  check("[every] storage_path 를 돌려준다(클라이언트가 그 파일을 지운다)",
    gone.rows[0].path === `${USER_A}/img1.png`,
    JSON.stringify(gone.rows[0]));

  const after =
    await db.query(
      "select count(*)::int as n from public.skin_version_image_slots where image_id = $1",
      [IMG1]
    );

  check("[every] draft · published · 과거 이력의 연결이 전부 없어졌다",
    after.rows[0].n === 0, JSON.stringify(after.rows[0]));

  const row =
    await db.query("select count(*)::int as n from public.skin_images where id = $1", [IMG1]);

  check("[every] 이미지 row 도 없어졌다", row.rows[0].n === 0);

  const versions =
    await db.query("select count(*)::int as n from public.skin_versions");

  check("[every] 버전 자체는 하나도 지워지지 않았다", versions.rows[0].n === 4,
    JSON.stringify(versions.rows[0]));

  const others =
    await db.query(
      "select slot_name from public.skin_version_image_slots where image_id = $1",
      [IMG3]
    );

  check("[rest] 같은 사용자의 다른 이미지 연결은 그대로다",
    others.rows.length === 1 && others.rows[0].slot_name === "profile",
    JSON.stringify(others.rows));

  await db.close();
}


/* =========================================================
   4) 남의 이미지
========================================================== */

console.log("\n[scope]");

{
  const db = await freshDb();
  await setUid(db, USER_A);

  await expectError(
    "[scope] 다른 사용자의 이미지는 지울 수 없다",
    () => db.query("select public.delete_skin_image_everywhere($1)", [BIMG]),
    "not found or not owned"
  );

  const kept =
    await db.query("select count(*)::int as n from public.skin_images where id = $1", [BIMG]);

  check("[scope] 그 이미지는 그대로 남는다", kept.rows[0].n === 1);

  await setUid(db, null);

  await expectError(
    "[scope] 로그인하지 않으면 거절한다",
    () => db.query("select public.delete_skin_image_everywhere($1)", [IMG1]),
    "not authenticated"
  );

  await db.close();
}


/* =========================================================
   5) 남의 버전이 참조 중 — 전체 롤백
========================================================== */

console.log("\n[other]");

{
  const db = await freshDb();

  /* 지금 구조에서는 생길 수 없는 상태지만, 생겼을 때 반쪽으로 끝나지
     않는지를 본다 — B 의 버전이 A 의 이미지를 참조한다. */
  await db.exec(`
    insert into public.skin_version_image_slots(version_id, slot_name, image_id)
      values ('bbbbbbbb-0000-4000-8000-00000000000a', 'cover', '${IMG1}');
  `);

  await setUid(db, USER_A);

  await expectError(
    "[other] 남의 버전이 참조하면 FK 가 막는다",
    () => db.query("select public.delete_skin_image_everywhere($1)", [IMG1]),
    "violates RESTRICT setting of foreign key constraint"
  );

  const mine =
    await db.query(
      "select count(*)::int as n from public.skin_version_image_slots where image_id = $1",
      [IMG1]
    );

  check("[other] 내 연결도 지워지지 않았다(전체 롤백)",
    mine.rows[0].n === 4, JSON.stringify(mine.rows[0]));

  const row =
    await db.query("select count(*)::int as n from public.skin_images where id = $1", [IMG1]);

  check("[other] 이미지 row 도 그대로다", row.rows[0].n === 1);

  await db.close();
}


/* =========================================================
   8) 직접 참조 guard (follow-up)
========================================================== */

console.log("\n[css]");

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /* 공개 중인 버전의 CSS 가 그 파일을 직접 가리킨다 */
  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', '.hero { background-image: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000b", `${USER_A}/img3.png`]
  );

  await expectError(
    "[css] 공개 중인 버전의 css url 이 가리키면 거절한다",
    () => db.query("select public.delete_skin_image_everywhere($1)", [IMG3]),
    "referenced directly by skin code"
  );

  const kept =
    await db.query(`
      select
        (select count(*)::int from public.skin_images where id = '${IMG3}') as image,
        (select count(*)::int from public.skin_version_image_slots where image_id = '${IMG3}') as slots
    `);

  check("[css] 거절되면 이미지도 슬롯 연결도 그대로다(아무것도 지우지 않는다)",
    kept.rows[0].image === 1 && kept.rows[0].slots === 1,
    JSON.stringify(kept.rows[0]));

  /* 그 참조를 고치면(= 새로 저장·발행한 content 에 없으면) 지워진다 */
  await db.query(
    "update public.skin_versions set content = '{}'::jsonb where id = $1",
    ["aaaaaaaa-0000-4000-8000-00000000000b"]
  );

  const gone =
    await db.query("select public.delete_skin_image_everywhere($1) as path", [IMG3]);

  check("[css] 참조를 고친 뒤에는 지워진다",
    gone.rows[0].path === `${USER_A}/img3.png`,
    JSON.stringify(gone.rows[0]));

  await db.close();
}

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /* 지금 편집 중인 버전의 HTML 이 가리킨다 */
  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'templates',
              jsonb_build_object('home', jsonb_build_object(
                'html', '<img src="https://x/storage/v1/object/public/skin-images/' || $2 || '">'
              ))
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000c", `${USER_A}/img2.png`]
  );

  await expectError(
    "[css] 편집 중인 버전의 html src 가 가리켜도 거절한다",
    () => db.query("select public.delete_skin_image_everywhere($1)", [IMG2]),
    "referenced directly by skin code"
  );

  await db.close();
}

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /* 옛 모델의 슬롯 값(URL 문자열)이 가리킨다 */
  await db.query(
    `insert into public.skin_image_slot_values(skin_id, slot_name, image_url)
       values ('aaaaaaaa-0000-4000-8000-000000000001', 'legacy',
               'https://x/storage/v1/object/public/skin-images/' || $1)`,
    [`${USER_A}/img2.png`]
  );

  await expectError(
    "[css] 옛 skin_image_slot_values 의 URL 도 함께 본다",
    () => db.query("select public.delete_skin_image_everywhere($1)", [IMG2]),
    "referenced directly by skin code"
  );

  await db.close();
}

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /* 과거 이력만 가리키는 경우 — 막지 않는다(고칠 방법이 없다) */
  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', 'body { background: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000a", `${USER_A}/img2.png`]
  );

  const gone =
    await db.query("select public.delete_skin_image_everywhere($1) as path", [IMG2]);

  check("[css] 지난 저장본만 가리키면 막지 않는다(막다른 길을 만들지 않는다)",
    gone.rows[0].path === `${USER_A}/img2.png`,
    JSON.stringify(gone.rows[0]));

  await db.close();
}

{
  const db = await freshDb();

  /* 남의 스킨이 그 주소를 쓰고 있어도 내 삭제를 막지 않는다 —
     guard 는 호출자 소유 스킨만 본다(내가 고칠 수 있는 자리만). */
  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', 'body { background: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["bbbbbbbb-0000-4000-8000-00000000000a", `${USER_A}/img2.png`]
  );

  await db.query(
    `update public.skins
        set current_published_version_id = 'bbbbbbbb-0000-4000-8000-00000000000a'
      where id = 'bbbbbbbb-0000-4000-8000-000000000001'`
  );

  await setUid(db, USER_A);

  const gone =
    await db.query("select public.delete_skin_image_everywhere($1) as path", [IMG2]);

  check("[css] guard 는 호출자 소유 스킨만 본다",
    gone.rows[0].path === `${USER_A}/img2.png`,
    JSON.stringify(gone.rows[0]));

  await db.close();
}

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /* 다른 이미지의 경로가 들어 있어도 이 이미지 삭제를 막지 않는다 */
  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', 'body { background: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000b", `${USER_A}/img3.png`]
  );

  const gone =
    await db.query("select public.delete_skin_image_everywhere($1) as path", [IMG2]);

  check("[css] 다른 이미지의 경로는 이 삭제를 막지 않는다",
    gone.rows[0].path === `${USER_A}/img2.png`,
    JSON.stringify(gone.rows[0]));

  await db.close();
}

{
  const db = await freshDb();
  await setUid(db, USER_A);

  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', 'body { background: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000b", `${USER_A}/img3.png`]
  );

  try {
    await db.query("select public.delete_skin_image_everywhere($1)", [IMG3]);
    check("[css] 거절은 SQLSTATE IM001 이다", false, "예외가 나지 않았다");
  } catch (err) {
    check("[css] 거절은 SQLSTATE IM001 이다(프런트가 다른 실패와 가른다)",
      String(err.code || "") === "IM001", `code=${err.code}`);
  }

  await db.close();
}


/* =========================================================
   9) 삭제하는 두 길 모두 (follow-up 2)
========================================================== */

console.log("\n[both]");

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /*
    IMG2 는 슬롯에 걸려 있지 않다(= 프런트가 "사용처 0곳"으로 읽고
    기존 delete_skin_image() 로 가는 그 이미지다). 그런데 공개 중인
    버전의 CSS 가 그 주소를 직접 쓰고 있다.
  */
  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', '.hero { background-image: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000b", `${USER_A}/img2.png`]
  );

  await expectError(
    "[both] 슬롯에 없더라도 CSS 가 쓰면 delete_skin_image() 가 거절한다",
    () => db.query("select public.delete_skin_image($1)", [IMG2]),
    "referenced directly by skin code"
  );

  const kept =
    await db.query("select count(*)::int as n from public.skin_images where id = $1", [IMG2]);

  check("[both] 그때 라이브러리 row 도 그대로다(파일을 지울 경로 자체가 없다)",
    kept.rows[0].n === 1, JSON.stringify(kept.rows[0]));

  try {
    await db.query("select public.delete_skin_image($1)", [IMG2]);
    check("[both] 그 거절도 SQLSTATE IM001 이다", false, "예외가 나지 않았다");
  } catch (err) {
    check("[both] 그 거절도 SQLSTATE IM001 이다",
      String(err.code || "") === "IM001", `code=${err.code}`);
  }

  check("[both] 안내가 Code/AI 를 지목한다",
    await db.query("select public.delete_skin_image($1)", [IMG2])
      .then(() => false)
      .catch((err) => String(err.message || "").includes("Code/AI")),
    "");

  /* 참조를 고치면 기존 경로 그대로 지워진다 */
  await db.query(
    "update public.skin_versions set content = '{}'::jsonb where id = $1",
    ["aaaaaaaa-0000-4000-8000-00000000000b"]
  );

  const gone =
    await db.query("select public.delete_skin_image($1) as path", [IMG2]);

  check("[both] 참조를 고치면 기존 delete_skin_image() 가 그대로 지운다",
    gone.rows[0].path === `${USER_A}/img2.png`,
    JSON.stringify(gone.rows[0]));

  await db.close();
}

{
  const db = await freshDb();
  await setUid(db, USER_A);

  /* 슬롯 참조 거절은 그대로다(문구도 예전 그대로) */
  await expectError(
    "[both] 슬롯 참조가 있으면 예전 문구로 거절한다(회귀 없음)",
    () => db.query("select public.delete_skin_image($1)", [IMG1]),
    "still used by"
  );

  await db.close();
}

{
  const db = await freshDbWithoutFirstGuard();
  await setUid(db, USER_A);

  await db.query(
    `update public.skin_versions
        set content = jsonb_build_object(
              'css', 'body { background: url("https://x/storage/v1/object/public/skin-images/' || $2 || '"); }'
            )
      where id = $1`,
    ["aaaaaaaa-0000-4000-8000-00000000000c", `${USER_A}/img2.png`]
  );

  await expectError(
    "[both] 1차 guard 를 건너뛰고 이 파일만 적용해도 같은 결과다(everywhere)",
    () => db.query("select public.delete_skin_image_everywhere($1)", [IMG2]),
    "referenced directly by skin code"
  );

  await expectError(
    "[both] 1차 guard 를 건너뛰고 이 파일만 적용해도 같은 결과다(delete_skin_image)",
    () => db.query("select public.delete_skin_image($1)", [IMG2]),
    "referenced directly by skin code"
  );

  await db.close();
}

{
  const db = await freshDb();

  const grants =
    await db.query(`
      select
        has_function_privilege('anon', 'public.skin_image_direct_reference_count(text, uuid)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.skin_image_direct_reference_count(text, uuid)', 'execute') as auth,
        has_function_privilege('anon', 'public.delete_skin_image(uuid)', 'execute') as del_anon,
        has_function_privilege('authenticated', 'public.delete_skin_image(uuid)', 'execute') as del_auth
    `);

  check("[both] 공용 판정 함수는 바깥에 열리지 않는다",
    grants.rows[0].anon === false && grants.rows[0].auth === false,
    JSON.stringify(grants.rows[0]));

  check("[both] delete_skin_image 의 권한은 예전 그대로다",
    grants.rows[0].del_anon === false && grants.rows[0].del_auth === true,
    JSON.stringify(grants.rows[0]));

  await db.close();
}


/* =========================================================
   7) 권한
========================================================== */

console.log("\n[grant]");

{
  const db = await freshDb();

  const grants =
    await db.query(`
      select
        has_function_privilege('anon', 'public.delete_skin_image_everywhere(uuid)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.delete_skin_image_everywhere(uuid)', 'execute') as auth
    `);

  check("[grant] anon 에는 execute 가 없다", grants.rows[0].anon === false,
    JSON.stringify(grants.rows[0]));

  check("[grant] authenticated 에는 execute 가 있다", grants.rows[0].auth === true,
    JSON.stringify(grants.rows[0]));

  const def =
    await db.query(`
      select p.prosecdef as secdef
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_skin_image_everywhere'
    `);

  check("[grant] security definer 다", def.rows[0].secdef === true);

  await db.close();
}


console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);

if (failures.length) {
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
