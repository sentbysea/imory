/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — "사용처에서 제거하고 삭제" migration 검증
   (PGlite — 실제 Postgres)

   대상: supabase/migrations/20260923100000_delete_skin_image_everywhere.sql

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
  uses_image_library boolean not null default false
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
  await db.exec(MIGRATION);
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
