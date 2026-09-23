/* =========================================================
   IMORY FONT CATALOG — 브라우저 없는 단위 테스트
   (HOME-CANVAS-TYPOGRAPHY-1)

   재는 것은 넷이다.

     1  카탈로그 자체 — 여섯 · 순서 · key 불변 · 기본값
     2  resolver — 기존 두 키의 결과가 **예전 삼항식과 같은가**
     3  카탈로그 ↔ core/imory-fonts.css — 선언한 여섯이 실제로
        로드되는가(이름 · 굵기 · font-display · 버전 고정)
     4  카탈로그 ↔ 문서들 — 그 CSS 를 읽는 문서가 넷 다 맞는가,
        sandbox allowlist · CSP 에 출처가 있는가

   3 과 4 가 이 파일의 핵심이다. 카탈로그에 글꼴을 하나 더 적고
   CSS 에 적지 않으면 화면에서는 "고를 수는 있는데 시스템 글꼴로
   나오는" 선택지가 하나 생긴다 — 그 조합을 여기서 막는다.

   실행: node core/imory-font-catalog-test.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const require = createRequire(import.meta.url);

const catalog = require(path.join(HERE, "imory-font-catalog.js"));

const read = (relative) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const section = (name) => console.log(`\n[${name}]`);


/* =========================================================
   1. 카탈로그
========================================================== */

section("catalog");

const keys =
  catalog.IMORY_FONT_CATALOG.map((entry) => entry.key);

check("여섯이다", catalog.IMORY_FONT_CATALOG.length === 6, String(keys.length));

check("★ 순서가 계약대로다 (화면이 이 배열을 그대로 훑는다)",
  keys.join(",") ===
    "pretendard,nanumgothic,nanumsquareneo,nanummyeongjo,gowundodum,gowunbatang",
  keys.join(","));

check("★ 기존 저장 키 둘이 그대로 있다 (DB 에 이미 들어 있는 값)",
  keys.indexOf("pretendard") !== -1 && keys.indexOf("nanummyeongjo") !== -1);

check("★ 기본값은 pretendard 다",
  catalog.IMORY_FONT_DEFAULT_KEY === "pretendard",
  catalog.IMORY_FONT_DEFAULT_KEY);

check("key 가 전부 소문자 · 하이픈 없음 (share card 의 다른 체계와 섞이지 않게)",
  keys.every((key) => /^[a-z]+$/.test(key)), keys.join(","));

check("항목마다 key · label · cssFamily · weights 가 있다",
  catalog.IMORY_FONT_CATALOG.every((entry) =>
    typeof entry.key === "string" && entry.key &&
    typeof entry.label === "string" && entry.label &&
    typeof entry.cssFamily === "string" && entry.cssFamily &&
    Array.isArray(entry.weights) && entry.weights.length &&
    entry.weights.every((w) => Number.isInteger(w))));

check("cssFamily 가 전부 generic fallback 으로 끝난다",
  catalog.IMORY_FONT_CATALOG.every((entry) =>
    /,\s*(sans-serif|serif|monospace)$/.test(entry.cssFamily)),
  catalog.IMORY_FONT_CATALOG.map((e) => e.cssFamily).join(" | "));

check("모든 굵기 목록에 400 이 있다 (본문 기본)",
  catalog.IMORY_FONT_CATALOG.every((entry) => entry.weights.indexOf(400) !== -1));


/* =========================================================
   2. resolver — 예전 삼항식과 같은 결과여야 한다
========================================================== */

section("resolve");

/* posts/style/posts-body-layout.js 에 있던 그 식 그대로 */
const legacy = (bodyFont) =>
  bodyFont === "nanummyeongjo"
    ? '"Nanum Myeongjo", serif'
    : '"Pretendard", sans-serif';

[
  "pretendard",
  "nanummyeongjo",
  "",
  undefined,
  null,
  "무엇인지-모르는-옛-키"
].forEach((value) => {

  check(`★ 옛 삼항식과 같은 결과: ${JSON.stringify(value)}`,
    catalog.resolveImoryFontFamily(value) === legacy(value),
    `${catalog.resolveImoryFontFamily(value)} vs ${legacy(value)}`);

});

check("★ 모르는 키의 stack 은 null 이다 (조용히 기본값으로 바꾸지 않는다)",
  catalog.resolveImoryFontStack("없는키") === null);

check("모르는 키는 isImoryFontKey 가 false",
  catalog.isImoryFontKey("없는키") === false &&
  catalog.isImoryFontKey("nanumgothic") === true);

check("stack -> key 되짚기 (Canvas 가 CSS 에서 읽어 올 때)",
  catalog.imoryFontKeyOfStack('"Gowun Batang", serif') === "gowunbatang" &&
  catalog.imoryFontKeyOfStack('"Nanum Myeongjo", serif') === "nanummyeongjo");

check("★ 공백만 다른 stack 도 같은 것으로 본다 (사람/AI 가 쓴 CSS)",
  catalog.imoryFontKeyOfStack('"Nanum Gothic",sans-serif') === "nanumgothic" &&
  catalog.imoryFontKeyOfStack('  "Gowun Dodum" ,  sans-serif  ') === "gowundodum");

check("우리 목록에 없는 stack 은 null (폼이 남의 값을 자기 값인 척 하지 않는다)",
  catalog.imoryFontKeyOfStack('"Comic Sans MS", cursive') === null);


/* =========================================================
   3. 카탈로그 ↔ core/imory-fonts.css
========================================================== */

section("css");

const fontsCss =
  read("core/imory-fonts.css");

const imoryFontEntryOf = (key) =>
  catalog.IMORY_FONT_CATALOG.find((entry) => entry.key === key);

catalog.IMORY_FONT_CATALOG.forEach((entry) => {

  /* stack 의 첫 이름이 실제로 로드되는 이름이다 */
  const family =
    entry.cssFamily.split(",")[0].trim().replace(/^"|"$/g, "");

  const googleName =
    family.replace(/ /g, "+");

  const found =
    entry.source === "google"
      ? fontsCss.indexOf(`family=${googleName}`) !== -1
      : (
          entry.source === "self"
            ? new RegExp(`font-family:\\s*"${family}"`).test(fontsCss)
            : fontsCss.indexOf("pretendard@") !== -1
        );

  check(`★ ${entry.key} 가 실제로 로드된다 (${entry.source})`, found, family);

});

check("★ Google Fonts 는 display=swap 으로 받는다",
  fontsCss.indexOf("&display=swap") !== -1);

check("★ self-host 글꼴도 font-display: swap 이다",
  /@font-face[\s\S]*font-display:\s*swap/.test(fontsCss));

check("★ jsDelivr 주소에 버전이 박혀 있다 (@latest · 무버전 금지)",
  /cdn\.jsdelivr\.net\/npm\/pretendard@\d+\.\d+\.\d+\//.test(fontsCss),
  (fontsCss.match(/cdn\.jsdelivr\.net[^"')]*/) || [])[0]);

check("★ 저장소 밖의 제3자 폰트 CDN 을 쓰지 않는다",
  fontsCss.indexOf("webfontworld") === -1 &&
  fontsCss.indexOf("hangeul.pstatic.net") === -1);

/* Google Fonts URL 이 카탈로그의 굵기를 실제로 받아 오는가 */
catalog.IMORY_FONT_CATALOG
  .filter((entry) => entry.source === "google")
  .forEach((entry) => {

    const googleName =
      entry.cssFamily.split(",")[0].trim().replace(/^"|"$/g, "").replace(/ /g, "+");

    /* 이름에 + 가 있다(Nanum+Gothic) — 정규식 수량자로 읽히지
       않게 이스케이프한다. */
    const piece =
      (fontsCss.match(
        new RegExp(`family=${googleName.replace(/\+/g, "\\+")}(:wght@[0-9;]+)?`)
      ) || [])[0] || "";

    const asked =
      piece.indexOf(":wght@") === -1
        ? [400]
        : piece.split(":wght@")[1].split(";").map(Number);

    check(`${entry.key} 의 weights 가 실제로 받는 굵기와 같다`,
      asked.join(",") === entry.weights.join(","),
      `url=${asked.join(",")} catalog=${entry.weights.join(",")}`);

  });

/* ★ variable 한 벌이 아니라 정적 둘이다 — 공식 variable woff2 를
   브라우저가 열지 못한다(core/fonts/NanumSquareNeo-LICENSE.txt 의
   그 실측). 그 파일이 다시 들어오지 않는지도 함께 본다. */
const woff2Files = [
  "core/fonts/NanumSquareNeo-Regular.woff2",
  "core/fonts/NanumSquareNeo-Bold.woff2"
];

woff2Files.forEach((rel) => {

  const abs = path.join(ROOT, rel);

  check(`★ ${path.basename(rel)} 가 저장소에 있다`,
    fs.existsSync(abs) && fs.statSync(abs).size > 300000,
    fs.existsSync(abs) ? `${fs.statSync(abs).size} bytes` : "없음");

  check(`${path.basename(rel)} 가 정말 woff2 다`,
    fs.existsSync(abs) &&
    fs.readFileSync(abs).subarray(0, 4).toString("latin1") === "wOF2");

});

check("★ 브라우저가 못 여는 variable 파일이 다시 들어오지 않았다",
  !fs.existsSync(path.join(ROOT, "core/fonts/NanumSquareNeo-Variable.woff2")) &&
  fontsCss.indexOf("fonts/NanumSquareNeo-Variable") === -1);

const selfFaces =
  fontsCss.split("@font-face").length - 1;

check("★ @font-face 가 400 · 700 둘이고 카탈로그의 weights 와 같다",
  (fontsCss.match(/font-weight: 400;/g) || []).length === 1 &&
  (fontsCss.match(/font-weight: 700;/g) || []).length === 1 &&
  (fontsCss.match(/NanumSquareNeo-(Regular|Bold).woff2/g) || []).length === 2 &&
  imoryFontEntryOf("nanumsquareneo").weights.join(",") === "400,700",
  `@font-face ${selfFaces} · ` + imoryFontEntryOf("nanumsquareneo").weights.join(","));

check("★ 라이선스 · 출처 고지 파일이 함께 있다",
  fs.existsSync(path.join(ROOT, "core/fonts/NanumSquareNeo-LICENSE.txt")));

check("★ .gitattributes 가 woff2 를 binary 로 못박는다 (autocrlf=true)",
  read(".gitattributes").indexOf("*.woff2 binary") !== -1);


/* =========================================================
   4. 카탈로그 ↔ 문서 · sandbox
========================================================== */

section("documents");

/* 글꼴이 실제로 그려져야 하는 문서 넷 + 테스트 하네스 */
[
  ["index.html", "./core/imory-fonts.css"],
  ["admin/index.html", "../core/imory-fonts.css"],
  ["studio/preview/preview-frame.html", "../../core/imory-fonts.css"],
  ["skin/sandbox/frame.html", "/core/imory-fonts.css"],

  /* Studio 는 admin 안의 iframe 이라 부모의 <link> 를 물려받지
     않는다 — 없으면 같은 관리 UI 가 화면마다 다른 글꼴이 된다. */
  ["studio/index.html", "../core/imory-fonts.css"],
  ["studio/studio-lifecycle-scenario.html", "../core/imory-fonts.css"]
].forEach(([file, expected]) => {

  check(`★ ${file} 가 공용 글꼴 CSS 를 읽는다`,
    read(file).indexOf(expected) !== -1, expected);

});

/* 목록(JS)이 필요한 문서 */
[
  ["index.html", "./core/imory-font-catalog.js"],
  ["admin/index.html", "../core/imory-font-catalog.js"],
  ["studio/index.html", "../core/imory-font-catalog.js"],
  ["studio/studio-lifecycle-scenario.html", "../core/imory-font-catalog.js"]
].forEach(([file, expected]) => {

  check(`${file} 가 카탈로그를 읽는다`,
    read(file).indexOf(expected) !== -1, expected);

});

check("★ 진입 문서에 옛 글꼴 <link> 가 한 줄도 남아 있지 않다",
  ["index.html", "admin/index.html"].every((file) => {

    const html = read(file);

    return (
      html.indexOf("fonts.googleapis.com/css2") === -1 &&
      html.indexOf("orioncactus/pretendard") === -1
    );

  }));

check("★ 버전 없는 <link> 로 글꼴 CSS 를 걸지 않는다 (전부 loadVersionedStyles)",
  ["index.html", "admin/index.html", "studio/preview/preview-frame.html",
   "skin/sandbox/frame.html"].every((file) =>
    !new RegExp(`<link[^>]*imory-fonts\\.css`).test(read(file))));

const server =
  read("core/lib/skin-sandbox-server.js");

check("★ sandbox allowlist 에 글꼴 CSS 와 woff2 둘이 있다",
  server.indexOf('"/core/imory-fonts.css"') !== -1 &&
  woff2Files.every((rel) => server.indexOf('"/' + rel + '"') !== -1));

check("★ sandbox CSP 의 글꼴 출처가 카탈로그의 source 와 맞는다",
  server.indexOf('"https://fonts.googleapis.com"') !== -1 &&
  server.indexOf('"https://fonts.gstatic.com"') !== -1 &&
  server.indexOf('"https://cdn.jsdelivr.net"') !== -1);

/* Quote 패널에 <option> 이 다시 생기지 않았는가 */
check("★ Quote 패널이 글꼴 <option> 을 직접 적지 않는다 (목록은 카탈로그 하나)",
  !/id="quoteBodyFont"[\s\S]{0,400}?<option/.test(read("admin/quote/admin-quote-panel.html")));

/* 세 자리에 복붙돼 있던 그 식. 한 곳(postStyleFontFamily 의
   fallback)에만 남아 있어야 한다 — 카탈로그가 없는 문서에서도
   두 기존 키가 예전과 같은 결과를 내게 하는 그 한 줄이다. */
check("★ 옛 삼항식이 화면 코드에 한 줄도 남아 있지 않다",
  !/bodyFont\s*===\s*\r?\n?\s*"nanummyeongjo"/
    .test(read("posts/preview/posts-page-layout.js")) &&
  (read("posts/style/posts-body-layout.js").match(/"nanummyeongjo"/g) || [])
    .length === 1,
  (read("posts/style/posts-body-layout.js").match(/"nanummyeongjo"/g) || []).length +
    " in posts-body-layout.js");

check("Quote 의 네 화면이 같은 resolver 를 지난다 (postStyleFontFamily)",
  read("posts/style/posts-body-layout.js").indexOf("function postStyleFontFamily") !== -1 &&
  (read("posts/preview/posts-page-layout.js").match(/postStyleFontFamily\(/g) || []).length === 2 &&
  (read("posts/style/posts-body-layout.js").match(/postStyleFontFamily\(resolved\.bodyFont\)/g) || []).length === 1);


/* =========================================================
   결과
========================================================== */

console.log(`\n${passed} passed, ${failures.length} failed`);

if (failures.length) {
  failures.forEach((line) => console.log(`  - ${line}`));
  process.exit(1);
}
