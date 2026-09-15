/* =========================================================
   POSTS BODY STYLE EXTRACT — 단위 테스트 (브라우저 없이)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §M

   무엇을 보는가
   -------------
   sandbox 프레임으로 나가는 본문에서 **어떤 style 선언이 살아남고
   무엇이 떨어지는가**를 값 단위로 못 박는다. 브라우저 위에서
   "화면이 그렇게 그려졌는가"는 studio/studio-sandbox-preview-e2e-test.mjs
   의 [bodystyle]/[bodyparity] 절이 보고, 여기서는 그 앞단인
   **판정 규칙 자체**를 본다.

   실행
     node posts/style/posts-body-style-extract-test.mjs
========================================================== */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const m = require(path.join(HERE, "posts-body-style-extract.js"));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}


/* =========================================================
   [value] 값 allowlist
========================================================== */

console.log("\n[value] 값 allowlist — 네트워크를 부를 수 있는 형태는 통과 못 한다");

const SAFE = [
  "rgb(1, 2, 3)",
  "rgba(0, 0, 0, 0.5)",
  "hsl(10, 20%, 30%)",
  "linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 55%, rgb(255,224,138) 55%)",
  "repeating-linear-gradient(45deg, red 0, red 2px)",
  "calc(100% - 3px)",
  "clamp(1px, 2vw, 3px)",
  "var(--imory-color)",
  "19px",
  '"Nanum Myeongjo", serif',
  "0.4px",
  "1.9",
  "justify",
  "break-all",
  "no-repeat",
  "100% 100%",
  "0 0",
  "transparent",
  "1px solid rgb(1,2,3)"
];

for (const v of SAFE) {
  check(`[value] 통과: ${v.slice(0, 48)}`,
    m.isSafePostBodyStyleValue(v) === true);
}


console.log("\n[value] ★ 거부되어야 하는 값");

const BLOCKED = [
  ["url() 로 외부 요청", "url(https://evil.example/x.png)"],
  ["url() 상대 경로", "url(/api/leak?d=1)"],
  ["url() data:", "url(data:image/svg+xml,<svg/>)"],
  ["image-set()", 'image-set("a.png" 1x)'],
  ["-webkit-image-set()", "-webkit-image-set(url(a.png) 1x)"],
  ["cross-fade()", "cross-fade(url(a), url(b))"],
  ["element()", "element(#a)"],
  ["expression()", "expression(alert(1))"],
  ["attr()", "attr(href)"],
  ["세미콜론으로 선언 탈출", "red; background: url(//evil)"],
  ["중괄호로 규칙 만들기", "red}body{background:red"],
  ["@import", "@import url(//evil)"],
  ["</style> 로 블록 닫기", "red</style>"],
  ["역슬래시 이스케이프", "\\75 rl(//evil)"],
  ["CSS 주석 닫기", "red*/}body{color:blue"],
  ["이름 없는 괄호", "(url(x))"],
  ["길이 상한", "a".repeat(m.POST_BODY_STYLE_MAX_VALUE_CHARS + 1)],
  ["빈 값", ""],
  ["문자열이 아님", 42]
];

for (const [label, v] of BLOCKED) {
  check(`[value] ★ 거부: ${label}`,
    m.isSafePostBodyStyleValue(v) === false,
    typeof v === "string" ? v.slice(0, 44) : String(v));
}


/* =========================================================
   [props] 속성 allowlist
========================================================== */

console.log("\n[props] 속성 allowlist");

const MUST_HAVE = [
  "color", "background-color", "background-image", "background-repeat",
  "background-size", "background-position-x", "background-position-y",
  "font-family", "font-size", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-align", "text-indent",
  "word-break", "overflow-wrap", "display", "height",
  "margin-top", "margin-bottom", "padding-left", "max-width", "opacity",
  "border-left-width", "border-left-style", "border-left-color"
];

for (const p of MUST_HAVE) {
  check(`[props] 본문이 실제로 쓰는 ${p} 가 목록에 있다`,
    m.POST_BODY_STYLE_ALLOWED_PROPS.includes(p));
}


console.log("\n[props] ★ 목록에 **없어야** 하는 것 (화면을 덮거나 프레임 밖을 흉내낼 수 있다)");

const MUST_NOT_HAVE = [
  "position", "top", "left", "right", "bottom", "z-index",
  "transform", "filter", "backdrop-filter", "clip-path",
  "content", "cursor", "animation", "animation-name",
  "transition", "mix-blend-mode", "pointer-events",
  "background", "border", "font", "all", "list-style",
  "src", "behavior", "-moz-binding"
];

for (const p of MUST_NOT_HAVE) {
  check(`[props] ★ ${p} 는 목록에 없다`,
    !m.POST_BODY_STYLE_ALLOWED_PROPS.includes(p));
}


console.log("\n[props] ★ 안전 함수 목록에 네트워크 함수가 없다");

for (const fn of ["url", "image-set", "-webkit-image-set", "cross-fade", "element", "expression", "attr", "local"]) {
  check(`[props] ★ ${fn} 은 안전 함수가 아니다`,
    !m.POST_BODY_STYLE_SAFE_FUNCTIONS.includes(fn));
}


/* =========================================================
   결과
========================================================== */

console.log(`\n${passed} passed, ${failed} failed`);

if (failed) {
  console.log("실패:\n  - " + failures.join("\n  - "));
  process.exit(1);
}
