/* =========================================================
   STUDIO-LAYERS-MEDIA-1 — 감사 SQL 검증 (PGlite — 실제 Postgres)

   대상: supabase/tests/20260923_skin_image_css_reference_audit.sql

   왜 이 검증이 있나
   ----------------
   감사 결과를 보고 사람이 "무엇이 깨졌는가"를 판단한다. 그 질의가
   조용히 한 줄을 빠뜨리면(정규식이 그 주소 형태를 못 잡는다거나,
   버전 구분이 틀린다거나) **깨진 자리를 없는 것으로 읽는다**. 그래서
   일부러 깨뜨린 DB 를 만들어 놓고, 그 질의가 그것을 정확히 집어내는지
   본다.

   무엇을 확인하는가
   ----------------
   1) [find]    published · draft · history 의 css · html 안 url() 을
                모두 찾고 버전 구분과 영향 페이지를 맞게 적는다.
   2) [exists]  그 파일이 Storage 에 있으면 object_exists=true,
                없으면 false 다(= 지금 깨진 자리).
   3) [shape]   주소 형태(public · render · signed · 따옴표 없는 url())와
                상대 경로가 아닌 것들을 가리지 않고 object key 만 뽑는다.
   4) [rows]    라이브러리 row 만 남고 파일이 없는 것 · 슬롯 연결이
                가리키는데 파일이 없는 것 · 옛 슬롯 값 URL 도 각각 잡는다.
   5) [readonly] 이 파일의 질의는 **SELECT 뿐**이다(문자열 검사).

   실행:
     node supabase/skin-image-css-audit-test.mjs

   PGlite 는 supabase/.temp/gallery-validation/node_modules 에 이미
   설치돼 있다(다른 migration 검증 때 받은 것).
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

const AUDIT = readFileSync(
  join(HERE, "tests", "20260923_skin_image_css_reference_audit.sql"),
  "utf8"
);


let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed += 1; console.log(`  ok   ${name}`); }
  else { failures.push(`${name}${detail ? " — " + detail : ""}`); console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}


/* 주석을 걷고 `;` 로 가른다 — 네 질의를 하나씩 돌리기 위해서다 */
function statements(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const QUERIES = statements(AUDIT);


const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const SKIN_A = "aaaaaaaa-0000-4000-8000-000000000001";
const V_HIST = "aaaaaaaa-0000-4000-8000-00000000000a";
const V_PUB = "aaaaaaaa-0000-4000-8000-00000000000b";
const V_DRAFT = "aaaaaaaa-0000-4000-8000-00000000000c";

/* 있는 파일 / 지워진 파일 */
const ALIVE = `${USER_A}/alive.png`;
const GONE = `${USER_A}/gone.png`;
const GONE2 = `${USER_A}/gone2.jpg`;

const PUBLIC = (path) =>
  `https://vtwcuvouyipohfonfukj.supabase.co/storage/v1/object/public/skin-images/${path}`;


const BASELINE = `
create schema if not exists auth;
create schema if not exists storage;

create table auth.users (id uuid primary key);

create table storage.objects (
  bucket_id text not null,
  name text not null,
  primary key (bucket_id, name)
);

create table public.skins (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_draft_version_id uuid,
  current_published_version_id uuid
);

create table public.skin_versions (
  id uuid primary key,
  skin_id uuid not null references public.skins(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.skin_images (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_name text,
  created_at timestamptz not null default now()
);

create table public.skin_version_image_slots (
  version_id uuid not null references public.skin_versions(id) on delete cascade,
  slot_name text not null,
  image_id uuid not null references public.skin_images(id) on delete restrict,
  primary key (version_id, slot_name)
);

create table public.skin_image_slot_values (
  skin_id uuid not null references public.skins(id) on delete cascade,
  slot_name text not null,
  image_url text not null,
  primary key (skin_id, slot_name)
);
`;


/*
  깨뜨려 둔 상태 —

    published  css 가 지워진 파일(GONE)을 가리킨다          → 잡혀야 한다
    published  POST 템플릿 html 이 살아 있는 파일을 가리킨다 → 잡히되 exists=true
    draft      CATEGORY 템플릿 css 가 지워진 파일(GONE2)     → 잡혀야 한다
               (따옴표 없는 url(...) · render 주소 형태)
    history    css 가 지워진 파일(GONE)                      → 잡히되 history
    남의 스킨   css 가 GONE 을 가리킨다                       → 주인이 다르게 나온다
*/
const SEED = `
insert into auth.users(id) values ('${USER_A}'), ('${USER_B}');

insert into public.skins(id, user_id, current_published_version_id, current_draft_version_id) values
  ('${SKIN_A}', '${USER_A}', '${V_PUB}', '${V_DRAFT}'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '${USER_B}', null, null);

insert into public.skin_versions(id, skin_id, content, created_at) values
  ('${V_HIST}', '${SKIN_A}', jsonb_build_object(
      'css', '.old { background: url("${PUBLIC(GONE)}"); }'
   ), now() - interval '2 day'),

  ('${V_PUB}', '${SKIN_A}', jsonb_build_object(
      'css', '.hero { background-image: url("${PUBLIC(GONE)}"); } .ok { color: #333; }',
      'templates', jsonb_build_object(
        'post', jsonb_build_object('html', '<img src="${PUBLIC(ALIVE)}">')
      )
   ), now() - interval '1 day'),

  ('${V_DRAFT}', '${SKIN_A}', jsonb_build_object(
      'templates', jsonb_build_object(
        'category', jsonb_build_object(
          'css', '.cat { background: url(https://vtwcuvouyipohfonfukj.supabase.co/storage/v1/render/image/public/skin-images/${GONE2}?width=800); }'
        )
      )
   ), now()),

  ('bbbbbbbb-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000001', jsonb_build_object(
      'css', '.x { background: url("${PUBLIC(GONE)}"); }'
   ), now());

update public.skins
   set current_published_version_id = 'bbbbbbbb-0000-4000-8000-00000000000a'
 where id = 'bbbbbbbb-0000-4000-8000-000000000001';

/* Storage 에는 ALIVE 만 남아 있다 */
insert into storage.objects(bucket_id, name) values ('skin-images', '${ALIVE}');

/* 라이브러리 row — GONE 은 row 만 남기고(2번 절) ALIVE 는 정상 */
insert into public.skin_images(id, user_id, storage_path, original_name) values
  ('cccccccc-0000-4000-8000-000000000001', '${USER_A}', '${ALIVE}', 'alive.png'),
  ('cccccccc-0000-4000-8000-000000000002', '${USER_A}', '${GONE}', 'gone.png');

/* 슬롯 연결 — 파일 없는 이미지를 공개 버전이 쓰고 있다(3번 절) */
insert into public.skin_version_image_slots(version_id, slot_name, image_id) values
  ('${V_PUB}', 'cover', 'cccccccc-0000-4000-8000-000000000002'),
  ('${V_DRAFT}', 'profile', 'cccccccc-0000-4000-8000-000000000001');

/* 옛 모델의 URL — 파일 없음(4번 절) */
insert into public.skin_image_slot_values(skin_id, slot_name, image_url) values
  ('${SKIN_A}', 'legacy', '${PUBLIC(GONE2)}');
`;


const db = new PGlite();
await db.exec(BASELINE);
await db.exec(SEED);


/* =========================================================
   5) 읽기 전용인가 — 먼저 본다
========================================================== */

console.log("\n[readonly]");

{
  const forbidden =
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i;

  const offenders =
    QUERIES.filter((q) => forbidden.test(q));

  check("[readonly] 감사 SQL 에는 SELECT 밖에 없다",
    offenders.length === 0,
    offenders.map((q) => q.slice(0, 60)).join(" | "));

  check("[readonly] 질의 넷이다", QUERIES.length === 4,
    String(QUERIES.length));
}


/* =========================================================
   1 · 2 · 3) 직접 참조 · 존재 여부 · 주소 형태
========================================================== */

console.log("\n[find] + [exists] + [shape]");

{
  const { rows } = await db.query(QUERIES[0]);

  const mine =
    rows.filter((r) => r.owner_id === USER_A);

  const key = (r) => `${r.version_role}|${r.location}|${r.object_path}|${r.object_exists}|${r.affected_page}`;

  check("[find] 내 스킨의 직접 참조 넷을 모두 찾는다(published 2 · draft 1 · history 1)",
    mine.length === 4, JSON.stringify(mine.map(key)));

  check("[find] 공개 중인 css 의 깨진 참조를 집어낸다",
    mine.some((r) =>
      r.version_role === "published" &&
      r.location === "css" &&
      r.object_path === GONE &&
      r.object_exists === false &&
      r.affected_page === "전 페이지"),
    JSON.stringify(mine.map(key)));

  check("[exists] 살아 있는 파일은 object_exists=true 로 구분된다",
    mine.some((r) =>
      r.location === "templates.post.html" &&
      r.object_path === ALIVE &&
      r.object_exists === true &&
      r.affected_page === "POST"),
    JSON.stringify(mine.map(key)));

  check("[shape] 따옴표 없는 url() · render 주소 · 쿼리스트링에서도 key 만 뽑는다",
    mine.some((r) =>
      r.version_role === "draft" &&
      r.location === "templates.category.css" &&
      r.object_path === GONE2 &&
      r.object_exists === false &&
      r.affected_page === "CATEGORY"),
    JSON.stringify(mine.map(key)));

  check("[find] 지난 이력도 history 로 함께 보인다",
    mine.some((r) => r.version_role === "history" && r.object_path === GONE),
    JSON.stringify(mine.map(key)));

  check("[find] 깨진 줄이 맨 위에 온다(정렬)",
    rows[0].object_exists === false, JSON.stringify(rows[0] && key(rows[0])));

  check("[find] 라이브러리 row 유무도 함께 적는다",
    mine.every((r) =>
      (r.object_path === ALIVE || r.object_path === GONE)
        ? r.library_row_exists === true
        : r.library_row_exists === false),
    JSON.stringify(mine.map((r) => [r.object_path, r.library_row_exists])));

  check("[find] 남의 스킨도 owner_id 로 갈려 보인다",
    rows.some((r) => r.owner_id === USER_B && r.object_path === GONE),
    JSON.stringify(rows.map((r) => r.owner_id)));
}


/* =========================================================
   4) 나머지 세 갈래
========================================================== */

console.log("\n[rows]");

{
  const orphanRows = await db.query(QUERIES[1]);

  check("[rows] 파일 없는 라이브러리 row 를 집어낸다",
    orphanRows.rows.length === 1 &&
    orphanRows.rows[0].storage_path === GONE &&
    orphanRows.rows[0].slot_reference_count === 1,
    JSON.stringify(orphanRows.rows));

  const brokenSlots = await db.query(QUERIES[2]);

  check("[rows] 파일 없는 이미지를 쓰는 슬롯 연결을 집어낸다(공개 중)",
    brokenSlots.rows.length === 1 &&
    brokenSlots.rows[0].version_role === "published" &&
    brokenSlots.rows[0].slot_name === "cover",
    JSON.stringify(brokenSlots.rows));

  const legacy = await db.query(QUERIES[3]);

  check("[rows] 옛 슬롯 값 URL 도 파일 없음을 집어낸다",
    legacy.rows.length === 1 &&
    legacy.rows[0].object_path === GONE2,
    JSON.stringify(legacy.rows));
}


await db.close();

console.log(`\n=== ${passed} passed, ${failures.length} failed ===`);

if (failures.length) {
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
