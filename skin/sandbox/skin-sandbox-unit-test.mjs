/* =========================================================
   SKIN SANDBOX — 단위 테스트 (SANDBOX-0 + SANDBOX-1)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §D-2 / §D-4

   무엇을 보는가
   -------------
   브라우저 없이 판정할 수 있는 순수 함수 셋:
     - skin/sandbox/skin-sandbox-config.js     기능 플래그 · origin 해석
     - skin/sandbox/skin-sandbox-protocol.js   메시지 검증
     - core/lib/skin-sandbox-server.js         호스트 분기 · CSP · nonce
     - skin/sandbox/skin-sandbox-context.js    전달 데이터 투영(SANDBOX-1)
     - skin/skin-template.js                   renderMode 판정(SANDBOX-1)
                                               js 보존(SANDBOX-5A)
     - skin/sandbox/skin-sandbox-author-js.js  저자 JS API(SANDBOX-5A)

   왜 node인가
   -----------
   이 저장소의 단위 테스트 관례는 브라우저 HTML 하네스지만, 이 셋은
   DOM을 전혀 쓰지 않는다(config는 window.location/localStorage
   모양의 객체만 읽는다). 브라우저를 띄우지 않고 돌릴 수 있으면
   e2e를 못 돌리는 상황에서도 계약이 지켜지는지 볼 수 있다.
   실제 iframe/CSP 동작은 skin-sandbox-e2e-test.mjs가 본다.

   실행
     node skin/sandbox/skin-sandbox-unit-test.mjs
========================================================== */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const require = createRequire(import.meta.url);

const config = require(path.join(HERE, "skin-sandbox-config.js"));
const protocol = require(path.join(HERE, "skin-sandbox-protocol.js"));
const sandboxContext = require(path.join(HERE, "skin-sandbox-context.js"));

const server = await import(
  new URL("../../core/lib/skin-sandbox-server.js", import.meta.url).href
);

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
   가짜 window — config가 실제로 읽는 것만 흉내낸다
========================================================== */

function fakeWindow(href, storage) {
  const url = new URL(href);
  return {
    location: {
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
      origin: url.origin
    },
    localStorage: storage
      ? {
        getItem: (key) => (key in storage ? storage[key] : null)
      }
      : undefined
  };
}


/* =========================================================
   [flag] 기능 플래그

   production 에서는 **호스트 + 블로그 slug** allowlist 둘 다다.
   쿼리·localStorage 로 켜는 길은 로컬 개발 호스트에만 있다.
========================================================== */

console.log("\n[flag] 기능 플래그");

check("[flag] ★ production + 허용 slug -> ON",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/test1")) === true,
  "이 배포에서 켜기로 한 블로그 하나");

check("[flag] ★ production + 허용 slug + 뒤에 / -> ON",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/test1/")) === true);

check("[flag] ★ production + 다른 블로그 -> OFF",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/someone")) === false,
  "다른 사람 블로그는 오늘 그대로다");

check("[flag] production 루트(/) -> OFF",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/")) === false);

check("[flag] ★ production + 다른 블로그 + ?sandboxSkin=1 -> 여전히 OFF",
  config.isSandboxSkinEnabled(
    fakeWindow("https://imory.me/someone?sandboxSkin=1")
  ) === false,
  "공개 방문자가 주소만으로 켤 수 없다");

check("[flag] ★ production + 다른 블로그 + localStorage opt-in -> 여전히 OFF",
  config.isSandboxSkinEnabled(
    fakeWindow("https://imory.me/someone", { "imory.sandboxSkin": "1" })
  ) === false);

check("[flag] ★ 허용 목록에 없는 production 호스트는 slug 가 맞아도 OFF",
  config.isSandboxSkinEnabled(
    fakeWindow("https://imory-me.pages.dev/test1")
  ) === false);

check("[flag] 허용 slug 의 하위 경로(POST 등)도 같은 판정",
  config.isSandboxSkinEnabled(
    fakeWindow("https://imory.me/test1/post/123")
  ) === true,
  "HOME 인지는 skin-home.js 가 가른다");

check("[flag] localhost + opt-in 없음 -> OFF (기본값)",
  config.isSandboxSkinEnabled(
    fakeWindow("http://localhost:8957/skin/skin-sandbox-test.html")
  ) === false);

check("[flag] localhost + ?sandboxSkin=1 -> ON",
  config.isSandboxSkinEnabled(
    fakeWindow("http://localhost:8957/?sandboxSkin=1")
  ) === true);

check("[flag] ★ localhost 는 slug 를 보지 않는다 (하네스 경로에 slug 가 없다)",
  config.isSandboxSkinEnabled(
    fakeWindow("http://localhost:8957/skin/skin-sandbox-test.html?sandboxSkin=1")
  ) === true);

check("[flag] localhost + localStorage opt-in -> ON",
  config.isSandboxSkinEnabled(
    fakeWindow("http://127.0.0.1:8957/", { "imory.sandboxSkin": "1" })
  ) === true);

check("[flag] SANDBOX_SKIN_ENABLED_HOSTS 는 imory.me 하나다",
  Array.isArray(config.SANDBOX_SKIN_ENABLED_HOSTS) &&
  config.SANDBOX_SKIN_ENABLED_HOSTS.length === 1 &&
  config.SANDBOX_SKIN_ENABLED_HOSTS[0] === "imory.me");

check("[flag] SANDBOX_SKIN_ENABLED_SLUGS 는 test1 하나다",
  Array.isArray(config.SANDBOX_SKIN_ENABLED_SLUGS) &&
  config.SANDBOX_SKIN_ENABLED_SLUGS.length === 1 &&
  config.SANDBOX_SKIN_ENABLED_SLUGS[0] === "test1");

check("[flag] slug 목록이 비면 '아무도 아님'이다",
  config.isSandboxSkinEnabledSlug("") === false &&
  config.isSandboxSkinEnabledSlug(null) === false);

check("[flag] readSandboxSkinSlug: 경로 첫 칸, 소문자",
  config.readSandboxSkinSlug(fakeWindow("https://imory.me/Test1/post/9")) === "test1" &&
  config.readSandboxSkinSlug(fakeWindow("https://imory.me/")) === "");

check("[flag] pathname 이 없는 window 는 OFF 로 떨어진다",
  config.isSandboxSkinEnabled({
    location: { hostname: "imory.me", search: "", origin: "https://imory.me" }
  }) === false);

check("[flag] localStorage 가 던져도 OFF 로 떨어진다",
  config.isSandboxSkinEnabled({
    location: { hostname: "localhost", pathname: "/", search: "", origin: "http://localhost:1" },
    get localStorage() { throw new Error("blocked"); }
  }) === false);


/* =========================================================
   [origin] frame origin 해석
========================================================== */

console.log("\n[origin] frame origin");

check("[origin] production frame origin 이 배포된 커스텀 도메인이다",
  config.resolveSandboxSkinFrameOrigin(fakeWindow("https://imory.me/"))
  === "https://skin-frame.imory.me");

check("[origin] ★ origin 상수가 채워진 것은 스위치가 아니다",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/someone?sandboxSkin=1")) === false,
  "켜지는 것은 SANDBOX_SKIN_ENABLED_SLUGS 에 적힌 블로그뿐이다");

check("[origin] dev: ?sandboxSkinOrigin 으로 다른 포트를 받는다",
  config.resolveSandboxSkinFrameOrigin(
    fakeWindow("http://localhost:8957/?sandboxSkinOrigin=http%3A%2F%2Flocalhost%3A8958")
  ) === "http://localhost:8958");

check("[origin] ★ production 에서는 ?sandboxSkinOrigin 을 무시한다",
  config.resolveSandboxSkinFrameOrigin(
    fakeWindow("https://imory.me/?sandboxSkinOrigin=https%3A%2F%2Fevil.example")
  ) === "https://skin-frame.imory.me",
  "주소로 frame origin 을 갈아끼울 수 없다");

check("[origin] dev 라도 dev 호스트가 아닌 origin은 받지 않는다",
  config.resolveSandboxSkinFrameOrigin(
    fakeWindow("http://localhost:8957/?sandboxSkinOrigin=https%3A%2F%2Fevil.example")
  ) === "");

check("[origin] ★ 부모와 같은 origin은 돌려주지 않는다",
  config.resolveSandboxSkinFrameOrigin(
    fakeWindow("http://localhost:8957/?sandboxSkinOrigin=http%3A%2F%2Flocalhost%3A8957")
  ) === "",
  "same-origin + allow-same-origin 조합을 만들지 않는다");

check("[origin] frame: production 부모 목록은 imory.me 하나",
  JSON.stringify(
    config.resolveSandboxSkinParentOrigins(
      fakeWindow("https://skin-frame.imory.me/skin/sandbox/frame.html")
    )
  ) === JSON.stringify(["https://imory.me"]),
  "배포 번들은 localhost 를 신뢰하지 않는다");

check("[origin] frame: dev 문서에서만 dev 부모 토큰이 나온다",
  config.resolveSandboxSkinParentOrigins(
    fakeWindow("http://localhost:8958/skin/sandbox/frame.html")
  )[0] === "__imory_dev_hosts__");

check("[origin] isAllowedSandboxParentOrigin: dev 토큰 + dev origin",
  config.isAllowedSandboxParentOrigin(
    "http://localhost:8957", ["__imory_dev_hosts__"]
  ) === true);

check("[origin] isAllowedSandboxParentOrigin: dev 토큰이어도 외부 origin 거부",
  config.isAllowedSandboxParentOrigin(
    "https://evil.example", ["__imory_dev_hosts__"]
  ) === false);

check("[origin] isAllowedSandboxParentOrigin: 'null' origin 거부",
  config.isAllowedSandboxParentOrigin("null", ["https://imory.me"]) === false,
  "opaque origin 을 받아들이지 않는다");


/* =========================================================
   [msg] 메시지 검증
========================================================== */

console.log("\n[msg] 메시지 검증");

const PARENT_WIN = { name: "parent" };
const FRAME_WIN = { name: "frame" };

function readyEvent(overrides = {}) {
  return {
    origin: "https://skin-frame.imory.me",
    source: FRAME_WIN,
    data: protocol.buildSandboxMessage("IMORY_FRAME_READY", { contract: 1 }, 1),
    ...overrides
  };
}

const parentExpect = {
  originAllowList: ["https://skin-frame.imory.me"],
  source: FRAME_WIN,
  direction: "to-parent"
};

check("[msg] 정상 READY 를 통과시킨다",
  protocol.validateSandboxMessage(readyEvent(), parentExpect).ok === true);

check("[msg] ★ 위조 origin 거부",
  protocol.validateSandboxMessage(
    readyEvent({ origin: "https://evil.example" }), parentExpect
  ).reason === "bad-origin");

check("[msg] ★ 같은 origin 이지만 다른 source 거부",
  protocol.validateSandboxMessage(
    readyEvent({ source: { name: "other-iframe" } }), parentExpect
  ).reason === "bad-source");

check("[msg] origin 이 'null'(opaque) 이면 거부",
  protocol.validateSandboxMessage(
    readyEvent({ origin: "null" }), parentExpect
  ).reason === "bad-origin");

check("[msg] imory 봉투가 없으면 거부",
  protocol.validateSandboxMessage(
    readyEvent({ data: { type: "IMORY_FRAME_READY", seq: 1, payload: { contract: 1 } } }),
    parentExpect
  ).reason === "bad-envelope");

check("[msg] ★ 알 수 없는 type 거부",
  protocol.validateSandboxMessage(
    readyEvent({ data: { imory: 1, type: "IMORY_EVAL", seq: 1, payload: { contract: 1 } } }),
    parentExpect
  ).reason === "unknown-type");

check("[msg] ★ 방향이 반대인 메시지 거부 (부모가 ACK 를 받지 않는다)",
  protocol.validateSandboxMessage(
    readyEvent({
      data: protocol.buildSandboxMessage("IMORY_FRAME_ACK", { contract: 1 }, 1)
    }),
    parentExpect
  ).reason === "wrong-direction");

check("[msg] seq 가 정수가 아니면 거부",
  protocol.validateSandboxMessage(
    readyEvent({ data: { imory: 1, type: "IMORY_FRAME_READY", seq: "1", payload: { contract: 1 } } }),
    parentExpect
  ).reason === "bad-seq");

check("[msg] ★ 모르는 payload 키가 하나라도 있으면 거부",
  protocol.validateSandboxMessage(
    readyEvent({
      data: {
        imory: 1, type: "IMORY_FRAME_READY", seq: 1,
        payload: { contract: 1, html: "<img onerror=1>" }
      }
    }),
    parentExpect
  ).reason === "unknown-payload-key");

check("[msg] contract 가 1 이 아니면 거부",
  protocol.validateSandboxMessage(
    readyEvent({ data: { imory: 1, type: "IMORY_FRAME_READY", seq: 1, payload: { contract: 2 } } }),
    parentExpect
  ).reason === "bad-contract");

check("[msg] payload 가 배열이면 거부",
  protocol.validateSandboxMessage(
    readyEvent({ data: { imory: 1, type: "IMORY_FRAME_READY", seq: 1, payload: [] } }),
    parentExpect
  ).reason === "bad-payload");

check("[msg] 통과한 결과는 알려진 키만 담은 새 리터럴이다",
  JSON.stringify(
    protocol.validateSandboxMessage(readyEvent(), parentExpect).payload
  ) === JSON.stringify({ contract: 1 }));

check("[msg] buildSandboxMessage 는 모르는 키를 싣지 않는다",
  JSON.stringify(
    protocol.buildSandboxMessage("IMORY_FRAME_READY", { contract: 1, leak: "x" }, 3)
  ) === JSON.stringify({
    imory: 1, type: "IMORY_FRAME_READY", seq: 3, payload: { contract: 1 }
  }));

check("[msg] buildSandboxMessage 는 모르는 type 에 null 을 준다",
  protocol.buildSandboxMessage("IMORY_EVAL", {}, 1) === null);

/*
  SANDBOX-1 때 여섯이었고, SANDBOX-2 에서 셋이 늘었다
  (RENDER_PAGE / POST_BODY / NAVIGATE). SANDBOX-5A 에서 하나 더
  늘어 열이었다 (SCRIPT_ERROR — 저자 JS 가 오류를 냈다).
  SANDBOX-6A 에서 Element Inspector 의 다섯이 늘어 열다섯이다
  (INSPECT_MODE / INSPECT_PICK / INSPECT_HOVER / INSPECT_SELECT /
   INSPECT_RECTS / INSPECT_ERROR — 여섯 같지만 MODE 가 지시문의
   START·STOP 둘을 겸한다).
  SANDBOX-SELECT-PARITY-1 에서 직접 조작의 일곱이 늘어 스물셋이다
  (INSPECT_CANDIDATES / _CHOOSE / _PARENT / _CAPS / _TEXT / _DRAG /
   _PREVIEW — native Preview 의 preview:inspect-pick / -text / -drag /
   inspector-caps / -choose / -parent / inspect-preview 와 한 짝씩).

  이 수를 못 박아 두는 것은 "메시지가 조용히 늘지 않는다"를
  지키기 위해서다 — 늘리려면 이 줄을 고쳐야 하고, 고치는 사람은
  그때 새 메시지의 검증을 함께 보게 된다.
*/

/* EDITORIAL-RESPONSIVE-HOME-1 — SIDES_STATE · SIDES_VIEWPORT · SIDES_CLOSE
   (좌우 영역의 모바일 패널, IMORY_SIDES_DESIGN.md §7). 값 검사는
   skin/skin-sides-test.mjs [protocol] 이 본다.

   HOME-CANVAS-SELECT-1B-1 에서 하나가 늘어 스물일곱이었고
   (CANVAS_SELECT — 부모가 확정한 캔버스 선택. 프레임은 받은 id 를
    자기 DOM 에서 다시 확인한 뒤에만 그린다),
   HOME-CANVAS-SELECT-1B-2 에서 하나 더 늘어 스물여덟이었고
   (CANVAS_PROPOSE — lasso · Shift 클릭의 **제안**. 확정이 아니라
    부모가 자기 draft 로 전부 다시 본다),
   HOME-CANVAS-TRANSFORM-1A 에서 둘이 늘어 서른이다
   (CANVAS_GEOMETRY — 단독 선택 요소의 Canvas 좌표. 프레임이 DOM
    에서 잴 수 없는 값이라 부모가 내려 준다. 확정의 **답**이기도
    하고, 그때만 `answering` 번호가 붙는다.
    CANVAS_TRANSFORM — 이동의 확정 **요청**. 확정이 아니라 부모가
    지금 draft 로 선택 · 순번 · expected · 범위를 다시 본다),
   HOME-CANVAS-V2-ELEMENTS-1 에서 하나 더 늘어 서른하나다
   (CANVAS_LAYOUT — v2 `main_visual` 이 흐름 안에서 **어디에
    놓였는가**. 프레임의 폭 · 높이 · 배율은 부모가 저장값에서
    계산하지만 그 자리만은 앞 블록들의 실제 높이가 정해 데이터로는
    알 수 없다. 묶기 · 빼기가 화면 자리를 지키는 데 쓰는 **보고**
    이고, 단위는 도화지 폭의 분수다 — 계약 §28-3). */
check("[msg] 이번 라운드가 아는 type 은 정확히 서른하나다",
  Object.keys(protocol.SANDBOX_MESSAGE_SPEC).length === 31,
  Object.keys(protocol.SANDBOX_MESSAGE_SPEC).join(", "));


/* =========================================================
   [canvas-select] HOME-CANVAS-SELECT-1B-1 — 캔버스 선택 메시지
========================================================== */

console.log("\n[canvas-select] 캔버스 선택 (HOME-CANVAS-SELECT-1B-1)");

const CANVAS_PARENT_WIN = { name: "canvas-parent" };

const canvasSelectTo = (payload) =>
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_SELECT, payload, 1
      )
    },
    {
      originAllowList: ["https://imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-frame"
    }
  );

check("[canvas-select] 정상 선택을 프레임이 받는다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true,
    ids: ["cvPhoto"], primaryId: "cvPhoto", generation: 5
  }).ok === true);

check("[canvas-select] 빈 선택(해제)도 받는다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: false, active: false, ids: [], generation: 5
  }).ok === true);

check("[canvas-select] ★ active:true 인데 primaryId 가 없으면 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true, ids: ["cvPhoto"], generation: 5
  }).ok === false,
  "골랐다는데 무엇을 골랐는지 없는 모양을 메시지 층에서 막는다");

check("[canvas-select] ★ primaryId 가 ids 에 없으면 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true,
    ids: ["cvPhoto"], primaryId: "cvText", generation: 5
  }).ok === false);

check("[canvas-select] ★ active:false 인데 ids/primaryId 가 실려 오면 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: false, active: false,
    ids: ["cvPhoto"], primaryId: "cvPhoto", generation: 5
  }).ok === false);

check("[canvas-select] ★ 식별자 형태가 Inspector 와 같다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true,
    ids: ["cv Photo"], primaryId: "cv Photo", generation: 5
  }).ok === false &&
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true,
    ids: ["<img>"], primaryId: "<img>", generation: 5
  }).ok === false);

check("[canvas-select] ★ generation 이 음수거나 정수가 아니면 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: false, active: false, ids: [], generation: -1
  }).ok === false &&
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: false, active: false, ids: [], generation: 1.5
  }).ok === false);

check("[canvas-select] ★ 모르는 키(nonce · css · rect)는 옮겨지지 않는다",
  (() => {
    const verdict = canvasSelectTo({
      contract: 1, renderSeq: 3, editing: true, active: true,
      ids: ["cvPhoto"], primaryId: "cvPhoto", generation: 5,
      nonce: "abc", css: "body{}", rect: { left: 0, top: 0, width: 1, height: 1 }
    });
    return verdict.ok === true &&
      verdict.payload.nonce === undefined &&
      verdict.payload.css === undefined &&
      verdict.payload.rect === undefined;
  })(),
  "nonce 는 프레임 밖으로도 안으로도 메시지에 실리지 않는다");

check("[canvas-select] ★ 프레임은 이 메시지를 부모에게 보낼 수 없다 (방향)",
  protocol.validateSandboxMessage(
    {
      origin: "https://skin-frame.imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_SELECT,
        { contract: 1, renderSeq: 3, editing: false, active: false, ids: [], generation: 0 },
        1
      )
    },
    {
      originAllowList: ["https://skin-frame.imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-parent"
    }
  ).ok === false);


/* =========================================================
   [canvas-propose] HOME-CANVAS-SELECT-1B-2 — lasso · Shift 제안
========================================================== */

console.log("\n[canvas-propose] 캔버스 선택 제안 (HOME-CANVAS-SELECT-1B-2)");

/* 편집 모드 — 고른 것이 없어도 켜질 수 있다(lasso 는 빈 상태에서 시작) */

check("[canvas-propose] ★ editing:true · active:false 는 정상이다(빈 lasso 대기)",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: false, ids: [], generation: 7
  }).ok === true,
  "이것이 1B-2 에서 vendor 를 켜는 관문이다");

check("[canvas-propose] ★ editing:false 인데 active:true 는 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: false, active: true,
    ids: ["cvPhoto"], primaryId: "cvPhoto", generation: 7
  }).ok === false,
  "고른 것이 있는데 편집이 꺼져 있다는 모양은 없다");

check("[canvas-propose] ★ editing 칸이 없으면 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, active: false, ids: [], generation: 7
  }).ok === false);

check("[canvas-propose] ★ 여러 개를 고른 상태를 프레임이 받는다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true,
    ids: ["cvA", "cvB", "cvC"], primaryId: "cvB", generation: 9
  }).ok === true);

check("[canvas-propose] ★ 중복 id 가 섞이면 거부된다",
  canvasSelectTo({
    contract: 1, renderSeq: 3, editing: true, active: true,
    ids: ["cvA", "cvA"], primaryId: "cvA", generation: 9
  }).ok === false,
  "중복은 상한을 우회하는 흔한 위조 모양이다");


const canvasProposeUp = (payload) =>
  protocol.validateSandboxMessage(
    {
      origin: "https://skin-frame.imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_PROPOSE, payload, 1
      )
    },
    {
      originAllowList: ["https://skin-frame.imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-parent"
    }
  );

check("[canvas-propose] 정상 replace 제안을 부모가 받는다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["cvA", "cvB"], primaryId: "cvB", mode: "replace", generation: 4
  }).ok === true);

check("[canvas-propose] 정상 toggle 제안을 부모가 받는다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["cvA"], primaryId: "cvA", mode: "toggle", generation: 4
  }).ok === true);

check("[canvas-propose] ★ 빈 replace 는 '전체 해제'라 통과한다",
  canvasProposeUp({
    contract: 1, renderSeq: 3, ids: [], mode: "replace", generation: 4
  }).ok === true);

check("[canvas-propose] ★ 빈 toggle 은 뜻이 없어 거부된다",
  canvasProposeUp({
    contract: 1, renderSeq: 3, ids: [], mode: "toggle", generation: 4
  }).ok === false);

check("[canvas-propose] ★ 모르는 mode 는 거부된다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["cvA"], primaryId: "cvA", mode: "add", generation: 4
  }).ok === false &&
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["cvA"], primaryId: "cvA", generation: 4
  }).ok === false);

check("[canvas-propose] ★ primaryId 가 ids 에 없으면 거부된다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["cvA"], primaryId: "cvB", mode: "replace", generation: 4
  }).ok === false);

check("[canvas-propose] ★ 중복 id 는 거부된다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["cvA", "cvB", "cvA"], primaryId: "cvA", mode: "replace", generation: 4
  }).ok === false);

check("[canvas-propose] ★ 상한을 넘는 배열은 거부된다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: Array.from(
      { length: protocol.SANDBOX_CANVAS_MAX_SELECTED + 1 },
      (_, i) => "cv" + i
    ),
    primaryId: "cv0", mode: "replace", generation: 4
  }).ok === false,
  `상한 ${protocol.SANDBOX_CANVAS_MAX_SELECTED}`);

check("[canvas-propose] ★ 식별자 형태가 Inspector 와 같다",
  canvasProposeUp({
    contract: 1, renderSeq: 3,
    ids: ["<script>"], primaryId: "<script>", mode: "replace", generation: 4
  }).ok === false);

check("[canvas-propose] ★ 모르는 키(rect · css · selector)는 옮겨지지 않는다",
  (() => {
    const verdict = canvasProposeUp({
      contract: 1, renderSeq: 3,
      ids: ["cvA"], primaryId: "cvA", mode: "replace", generation: 4,
      rect: { left: 0, top: 0, width: 1, height: 1 },
      css: "body{}", selector: ".x"
    });
    return verdict.ok === true &&
      verdict.payload.rect === undefined &&
      verdict.payload.css === undefined &&
      verdict.payload.selector === undefined;
  })(),
  "프레임은 식별자 · 순번 · 뜻 하나만 올린다");

check("[canvas-propose] ★ 부모는 이 메시지를 프레임에 보낼 수 없다 (방향)",
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_PROPOSE,
        { contract: 1, renderSeq: 3, ids: [], mode: "replace", generation: 0 },
        1
      )
    },
    {
      originAllowList: ["https://imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-frame"
    }
  ).ok === false);


/* =========================================================
   [canvas-move] HOME-CANVAS-TRANSFORM-1A — 좌표와 이동 확정

   ★ 이번 단계가 소유하는 것은 **x · y 두 칸**이다. 그래서 여기서
     가장 많이 보는 것은 "좌표가 맞는가"가 아니라 "**그 밖의 것이
     들어올 수 없는가**"다 — width · height · rotation 이 섞인
     메시지는 메시지 층에서 통째로 버려져야 한다.
========================================================== */

console.log("\n[canvas-move] 좌표와 이동 확정 (HOME-CANVAS-TRANSFORM-1A)");

const canvasGeometryTo = (payload) =>
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_GEOMETRY, payload, 1
      )
    },
    {
      originAllowList: ["https://imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-frame"
    }
  );

const canvasTransformFrom = (payload) =>
  protocol.validateSandboxMessage(
    {
      origin: "https://skin.imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_TRANSFORM, payload, 1
      )
    },
    {
      originAllowList: ["https://skin.imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-parent"
    }
  );

/* HOME-CANVAS-TRANSFORM-1B — width · height 는 active 면 **반드시**
   있다. 프레임은 크기를 모르는 채로 리사이즈를 시작할 수 없다. */
/* HOME-CANVAS-TRANSFORM-1C — `rotation` 도 active 면 **반드시**
   있다. 요소에 그 칸이 없으면 부모가 0 을 싣는다. */
const GEOMETRY_ON = {
  contract: 1, renderSeq: 3, active: true, id: "cvPhoto",
  x: 20, y: 40, width: 90, height: 60, rotation: 0,
  baseWidth: 390, baseHeight: 844, generation: 5
};

const MOVE_OK = {
  contract: 1, renderSeq: 3, kind: "move", id: "cvPhoto",
  expected: { x: 20, y: 40 }, next: { x: 42.125, y: 117.5 },
  generation: 5, requestId: 1
};

check("[canvas-move] 단독 선택의 좌표가 프레임으로 내려간다",
  canvasGeometryTo(GEOMETRY_ON).ok === true);

check("[canvas-move] 옮길 수 있는 단독 선택이 없으면 active:false 만 내려간다",
  canvasGeometryTo({ contract: 1, renderSeq: 3, active: false, generation: 5 }).ok === true);

check("[canvas-move] ★ active:false 인데 값이 딸려 오면 거부된다",
  canvasGeometryTo({
    contract: 1, renderSeq: 3, active: false, id: "cvPhoto", generation: 5
  }).ok === false,
  "해제에는 나머지 칸 자체를 만들지 않는다 — CANVAS_SELECT 와 같은 모양");

check("[canvas-move] ★ 도화지 크기가 0 이면 거부된다",
  canvasGeometryTo({ ...GEOMETRY_ON, baseWidth: 0 }).ok === false,
  "배율의 분모가 된다 — 0 을 받으면 프레임이 나눌 수 없다");

check("[canvas-move] 확정의 답에는 번호가 붙는다",
  canvasGeometryTo({ ...GEOMETRY_ON, answering: 7 }).ok === true);

check("[canvas-move] ★ 답 번호가 정수가 아니면 거부된다",
  canvasGeometryTo({ ...GEOMETRY_ON, answering: 0 }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_ON, answering: 1.5 }).ok === false);

check("[canvas-move] 정상 확정 요청을 부모가 받는다",
  canvasTransformFrom(MOVE_OK).ok === true);

check("[canvas-move] 음수 좌표를 막지 않는다",
  canvasTransformFrom({ ...MOVE_OK, next: { x: -12.5, y: -3 } }).ok === true,
  "도화지 밖으로 나가는 것은 계약이 허용한다(자동 clamp 없음)");

check("[canvas-move] ★ 아직 이름이 없는 kind 는 거부된다",
  canvasTransformFrom({ ...MOVE_OK, kind: "scale" }).ok === false &&
  canvasTransformFrom({ ...MOVE_OK, kind: "group-move" }).ok === false,
  "그룹 조작은 그 단계에서 이 배열에 이름을 더한다");

check("[canvas-move] ★ kind 를 rotate 로 바꿔 달기만 하면 거부된다",
  canvasTransformFrom({ ...MOVE_OK, kind: "rotate" }).ok === false,
  "rotate 가 소유하는 것은 각도 한 칸이다 — 좌표 둘이 실린 rotate 는 그 모양이 아니다");

check("[canvas-move] ★ kind 를 resize 로 바꿔 달기만 하면 거부된다",
  canvasTransformFrom({ ...MOVE_OK, kind: "resize" }).ok === false,
  "resize 가 소유하는 것은 네 칸이다 — 좌표 둘만 실린 resize 는 그 모양이 아니다");

check("[canvas-move] ★ next 에 width 가 섞이면 메시지 전체가 거부된다",
  canvasTransformFrom({
    ...MOVE_OK, next: { x: 1, y: 2, width: 300 }
  }).ok === false,
  "이번 단계가 소유하는 것은 좌표 둘이라는 계약이 메시지 층에도 있다");

check("[canvas-move] ★ expected 에 rotation 이 섞여도 거부된다",
  canvasTransformFrom({
    ...MOVE_OK, expected: { x: 20, y: 40, rotation: 30 }
  }).ok === false);

check("[canvas-move] ★ 유한하지 않은 좌표는 거부된다",
  canvasTransformFrom({ ...MOVE_OK, next: { x: "10", y: 2 } }).ok === false);

check("[canvas-move] ★ 상한을 넘는 좌표는 거부된다",
  canvasTransformFrom({ ...MOVE_OK, next: { x: 1e9, y: 0 } }).ok === false);

check("[canvas-move] ★ 요청 번호가 없으면 거부된다",
  canvasTransformFrom({
    contract: 1, renderSeq: 3, kind: "move", id: "cvPhoto",
    expected: { x: 20, y: 40 }, next: { x: 1, y: 2 }, generation: 5
  }).ok === false,
  "답을 이 번호로 돌려받는다 — 없으면 어느 요청의 답인지 가를 수 없다");

check("[canvas-move] ★ 프레임은 좌표 메시지를 부모에게 보낼 수 없다 (방향)",
  protocol.validateSandboxMessage(
    {
      origin: "https://skin.imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_GEOMETRY, GEOMETRY_ON, 1
      )
    },
    {
      originAllowList: ["https://skin.imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-parent"
    }
  ).ok === false);

check("[canvas-move] ★ 알려진 칸만 새 리터럴로 옮겨진다",
  (() => {

    /* 봉투를 만드는 쪽이 이미 알려진 칸만 담는다(다른 메시지와
       같은 규칙) — 그래서 css · selector 는 프레임 밖으로 나가지도
       못하고, 부모가 읽는 payload 에도 없다. */
    const verdict =
      canvasTransformFrom({ ...MOVE_OK, css: "x", selector: "y" });

    return (
      verdict.ok === true &&
      verdict.payload.css === undefined &&
      verdict.payload.selector === undefined &&
      Object.keys(verdict.payload).length === 8
    );

  })(),
  "contract · renderSeq · kind · id · expected · next · generation · requestId 여덟 뿐이다");


/* =========================================================
   [canvas-resize] HOME-CANVAS-TRANSFORM-1B — 크기 확정

   ★ 이번 단계가 소유하는 것은 **네 칸**이다(x · y · width · height).
     그래서 여기서 가장 많이 보는 것도 "크기가 맞는가"가 아니라
     "**그 밖의 것이 들어올 수 없는가**"다 — rotation 이 섞인
     메시지는 통째로 버려져야 하고, 좌표 둘만 실린 resize 도
     그 모양이 아니므로 버려져야 한다.
========================================================== */

console.log("\n[canvas-resize] 크기 확정 (HOME-CANVAS-TRANSFORM-1B)");

const RESIZE_OK = {
  contract: 1, renderSeq: 3, kind: "resize", id: "cvPhoto",
  expected: { x: 20, y: 40, width: 90, height: 60 },
  next: { x: 20, y: 40, width: 130.5, height: 60 },
  generation: 5, requestId: 2
};

check("[canvas-resize] 정상 리사이즈 요청을 부모가 받는다",
  canvasTransformFrom(RESIZE_OK).ok === true);

check("[canvas-resize] height 는 \"auto\" 일 수 있다",
  canvasTransformFrom({
    ...RESIZE_OK,
    expected: { x: 20, y: 40, width: 90, height: "auto" },
    next: { x: 20, y: 40, width: 130, height: "auto" }
  }).ok === true,
  "좌우 손잡이만 쓴 리사이즈는 auto 를 그대로 둔다(계약 §18-3)");

check("[canvas-resize] \"auto\" 에서 숫자로 바뀌는 요청도 통과한다",
  canvasTransformFrom({
    ...RESIZE_OK,
    expected: { x: 20, y: 40, width: 90, height: "auto" },
    next: { x: 20, y: 40, width: 90, height: 82 }
  }).ok === true,
  "어느 type 이 auto 를 쓸 수 있는지는 부모가 자기 draft 로 본다");

check("[canvas-resize] ★ 그 밖의 문자열 높이는 거부된다",
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 90, height: "100px" }
  }).ok === false &&
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 90, height: "AUTO" }
  }).ok === false);

check("[canvas-resize] ★ 0 이하의 크기는 거부된다",
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 0, height: 60 }
  }).ok === false &&
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 90, height: -5 }
  }).ok === false,
  "width 와 숫자 height 는 양수여야 한다(계약 §18-2)");

check("[canvas-resize] ★ 상한을 넘는 크기는 거부된다",
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 1e9, height: 60 }
  }).ok === false);

check("[canvas-resize] ★ next 에 rotation 이 섞이면 메시지 전체가 거부된다",
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 90, height: 60, rotation: 30 }
  }).ok === false,
  "이번 단계는 회전을 바꾸지 않는다 — 그 계약이 메시지 층에도 있다");

check("[canvas-resize] ★ 칸이 하나라도 빠지면 거부된다",
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: 20, y: 40, width: 90 }
  }).ok === false &&
  canvasTransformFrom({
    ...RESIZE_OK, expected: { x: 20, y: 40 }
  }).ok === false,
  "네 칸이 한 요청이다 — '폭은 저장됐는데 x 는 안 됐다'를 만들지 않는다");

check("[canvas-resize] ★ move 에 크기가 섞이면 여전히 거부된다",
  canvasTransformFrom({
    ...MOVE_OK,
    expected: { x: 20, y: 40, width: 90, height: 60 },
    next: { x: 42, y: 117, width: 130, height: 60 }
  }).ok === false,
  "kind 마다 소유하는 모양이 하나다 — 서로의 자리에 들어갈 수 없다");

check("[canvas-resize] 좌표는 음수여도 된다",
  canvasTransformFrom({
    ...RESIZE_OK, next: { x: -30.5, y: -12, width: 90, height: 60 }
  }).ok === true,
  "도화지 밖으로 나가는 것은 계약이 허용한다(자동 clamp 없음)");

check("[canvas-resize] 좌표 메시지에 크기가 함께 내려간다",
  (() => {

    const verdict =
      canvasGeometryTo(GEOMETRY_ON);

    return (
      verdict.ok === true &&
      verdict.payload.width === 90 &&
      verdict.payload.height === 60
    );

  })());

check("[canvas-resize] 좌표 메시지의 height 도 \"auto\" 일 수 있다",
  canvasGeometryTo({ ...GEOMETRY_ON, height: "auto" }).ok === true);

check("[canvas-resize] ★ 크기가 빠진 좌표 메시지는 거부된다",
  canvasGeometryTo({ ...GEOMETRY_ON, width: undefined }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_ON, height: undefined }).ok === false,
  "프레임은 크기를 모르는 채로 리사이즈를 시작할 수 없다");

check("[canvas-resize] ★ 해제에는 크기 칸도 없다",
  canvasGeometryTo({
    contract: 1, renderSeq: 3, active: false, width: 90, generation: 5
  }).ok === false);

check("[canvas-resize] ★ 알려진 칸만 새 리터럴로 옮겨진다",
  (() => {

    const verdict =
      canvasTransformFrom({ ...RESIZE_OK, rotation: 30, css: "x" });

    return (
      verdict.ok === true &&
      verdict.payload.rotation === undefined &&
      verdict.payload.css === undefined &&
      Object.keys(verdict.payload).length === 8
    );

  })());


/* =========================================================
   [canvas-rotate] HOME-CANVAS-TRANSFORM-1C — 각도 확정

   ★ 이번 단계가 소유하는 것은 **한 칸**이다(rotation). 상자 네 칸은
     회전이 바꾸지 않으므로(회전 중심이 요소 상자의 정중앙이다),
     좌표나 크기가 섞인 회전 메시지는 통째로 버려져야 한다.

   ★ 각도의 허용 범위는 계약이 이미 가진 그것 하나다 — **유한한
     숫자**. 좌표의 ±100000 을 빌려 오지 않는다: `expected` 는 저장된
     그 값 그대로 올라오므로, 범위를 새로 만들면 이미 저장된 큰
     각도를 가진 요소를 영영 돌릴 수 없게 된다.
========================================================== */

console.log("\n[canvas-rotate] 각도 확정 (HOME-CANVAS-TRANSFORM-1C)");

const ROTATE_OK = {
  contract: 1, renderSeq: 3, kind: "rotate", id: "cvPhoto",
  expected: { rotation: 0 }, next: { rotation: 32.125 },
  generation: 5, requestId: 3
};

check("[canvas-rotate] 정상 회전 요청을 부모가 받는다",
  canvasTransformFrom(ROTATE_OK).ok === true);

check("[canvas-rotate] 음수 각도도 통과한다",
  canvasTransformFrom({ ...ROTATE_OK, expected: { rotation: -30 } }).ok === true,
  "이미 저장된 값이 `expected` 로 그대로 올라온다 — 일괄 정규화하지 않는다");

check("[canvas-rotate] 한 바퀴를 넘는 기존 값도 통과한다",
  canvasTransformFrom({ ...ROTATE_OK, expected: { rotation: 400 } }).ok === true);

check("[canvas-rotate] ★ next 에 좌표가 섞이면 메시지 전체가 거부된다",
  canvasTransformFrom({
    ...ROTATE_OK, next: { rotation: 30, x: 10, y: 20 }
  }).ok === false,
  "회전은 상자를 바꾸지 않는다 — 그 계약이 메시지 층에도 있다");

check("[canvas-rotate] ★ 각도가 빠지면 거부된다",
  canvasTransformFrom({ ...ROTATE_OK, next: {} }).ok === false &&
  canvasTransformFrom({ ...ROTATE_OK, expected: {} }).ok === false);

check("[canvas-rotate] ★ 유한하지 않은 각도는 거부된다",
  canvasTransformFrom({ ...ROTATE_OK, next: { rotation: "30" } }).ok === false &&
  canvasTransformFrom({ ...ROTATE_OK, next: { rotation: Infinity } }).ok === false &&
  canvasTransformFrom({ ...ROTATE_OK, next: { rotation: NaN } }).ok === false);

check("[canvas-rotate] ★ move · resize 에 각도가 섞이면 여전히 거부된다",
  canvasTransformFrom({
    ...MOVE_OK, next: { x: 1, y: 2, rotation: 30 }
  }).ok === false &&
  canvasTransformFrom({
    ...RESIZE_OK, expected: { rotation: 0 }
  }).ok === false,
  "kind 마다 소유하는 모양이 하나다 — 서로의 자리에 들어갈 수 없다");

check("[canvas-rotate] 좌표 메시지에 각도가 함께 내려간다",
  (() => {

    const verdict =
      canvasGeometryTo({ ...GEOMETRY_ON, rotation: -12.5 });

    return verdict.ok === true && verdict.payload.rotation === -12.5;

  })());

check("[canvas-rotate] ★ 각도가 빠진 좌표 메시지는 거부된다",
  canvasGeometryTo({ ...GEOMETRY_ON, rotation: undefined }).ok === false,
  "프레임은 시작 각도를 모르는 채로 회전을 시작할 수 없다");

check("[canvas-rotate] ★ 해제에는 각도 칸도 없다",
  canvasGeometryTo({
    contract: 1, renderSeq: 3, active: false, rotation: 0, generation: 5
  }).ok === false);


/* =========================================================
   [canvas-space] HOME-CANVAS-V2-EDITOR-1B — 자의 기준 상자와 origin

   ★ **선택 칸이다.** v1 요소와 v2 overlay 의 자는 도화지이고
     origin 은 0 이라, 그 칸이 아예 없는 메시지가 지금까지의 그
     메시지다(위 [canvas-move] 가 그것을 계속 본다).

   ★ 프레임이 올리는 확정 요청은 **한 글자도 바뀌지 않았다**. v2 냐
     v1 이냐는 부모가 자기 draft 로 정하므로(계약 §26-2) 메시지에
     v2 라는 표시가 없다 — 그 사실을 여기서 못박는다.
========================================================== */

console.log("\n[canvas-space] 자의 기준 상자와 origin (V2-EDITOR-1B)");

check("[canvas-space] 프레임 상자를 기준으로 재는 좌표가 내려간다",
  (() => {

    const verdict =
      canvasGeometryTo({
        ...GEOMETRY_ON, scopeId: "v2Main", originX: 0, originY: 0.5
      });

    return (
      verdict.ok === true &&
      verdict.payload.scopeId === "v2Main" &&
      verdict.payload.originY === 0.5
    );

  })());

check("[canvas-space] ★ 두 칸이 없어도 통과한다(v1 · overlay 의 그 메시지)",
  canvasGeometryTo(GEOMETRY_ON).ok === true &&
  canvasGeometryTo(GEOMETRY_ON).payload.scopeId === undefined);

check("[canvas-space] ★ scopeId 는 편집 식별자여야 한다",
  canvasGeometryTo({ ...GEOMETRY_ON, scopeId: "v2 Main" }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_ON, scopeId: 7 }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_ON, scopeId: "" }).ok === false);

check("[canvas-space] ★ origin 은 0~1 의 분수다(좌표의 자를 빌려 오지 않는다)",
  canvasGeometryTo({ ...GEOMETRY_ON, originX: 1 }).ok === true &&
  canvasGeometryTo({ ...GEOMETRY_ON, originX: 1.5 }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_ON, originY: -0.1 }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_ON, originY: "0.5" }).ok === false);

check("[canvas-space] ★ 해제에는 그 두 칸도 없다",
  canvasGeometryTo({
    contract: 1, renderSeq: 3, active: false, scopeId: "v2Main", generation: 5
  }).ok === false &&
  canvasGeometryTo({
    contract: 1, renderSeq: 3, active: false, originX: 0, generation: 5
  }).ok === false);

check("[canvas-space] ★ 확정 요청에는 v2 표시가 없다(부모가 draft 로 정한다)",
  canvasTransformFrom(MOVE_OK).ok === true &&
  /* v2 이름으로는 올려보낼 수 없다 */
  canvasTransformFrom({ ...MOVE_OK, kind: "v2-move" }).ok === false &&
  /* 자를 끼워 보내도 봉투가 그 칸을 나르지 않는다 — 자는 부모의
     것이고 프레임은 그 위의 숫자만 돌려준다 */
  canvasTransformFrom({ ...MOVE_OK, scopeId: "v2Main" })
    .payload.scopeId === undefined,
  "프레임이 쓸 수 있는 kind 는 여전히 move · resize · rotate 셋이다");


/* =========================================================
   [canvas-layout] HOME-CANVAS-V2-ELEMENTS-1 — 프레임의 페이지 자리

   ★ 이것은 **보고**다. 부모는 이 숫자를 저장하지 않고, 묶기 · 빼기를
     누른 그 순간의 자로만 쓴다(계약 §28-3).

   ★ 나르는 것이 자리 하나뿐인 이유도 거기 있다 — 폭 · 높이 · 배율은
     부모가 저장값에서 계산하므로, 프레임에서 한 번 더 받으면 어느
     쪽이 맞는지 가르는 규칙이 새로 생긴다.
========================================================== */

console.log("\n[canvas-layout] 프레임의 페이지 자리 (HOME-CANVAS-V2-ELEMENTS-1)");

const canvasLayoutFrom = (payload) =>
  protocol.validateSandboxMessage(
    {
      origin: "https://skin.imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_LAYOUT, payload, 1
      )
    },
    {
      originAllowList: ["https://skin.imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-parent"
    }
  );

const LAYOUT_OK = {
  contract: 1,
  renderSeq: 3,
  frames: [{ id: "v2Main", x: 0.12, y: 0.4831 }]
};

check("[canvas-layout] 정상 보고를 부모가 받는다",
  canvasLayoutFrom(LAYOUT_OK).ok === true);


/* =========================================================
   HOME-CANVAS-V2-MANUAL-FIX-1 — 같은 보고에 실리는 두 가지
   (계약 §29-3 · §29-6)

     blocks  블록이 **화면에서 갖는 높이**(도화지 폭의 분수)
             — Auto 스위치를 끌 때 굳힐 숫자다
     look    고른 요소가 **지금 물려받고 있는 모양**
             — 묶기 · 빼기가 그 값을 그 요소의 규칙으로 못박는다

   look 은 **스킨 CSS 로 들어가는 값**이라 여기서 가장 좁게 본다.
========================================================== */

const LAYOUT_BLOCKS = {
  ...LAYOUT_OK,
  blocks: [{ id: "v2Text", h: 0.1387 }, { id: "v2Main", h: 0.8333 }]
};

check("[canvas-layout] ★ 블록의 그려진 높이가 함께 온다",
  canvasLayoutFrom(LAYOUT_BLOCKS).ok === true);

check("[canvas-layout] ★ 블록 높이도 모르는 칸 · 중복 · 숫자 아님을 거부한다",
  canvasLayoutFrom({
    ...LAYOUT_OK, blocks: [{ id: "v2Text", h: 0.1, w: 0.2 }]
  }).ok === false &&
  canvasLayoutFrom({
    ...LAYOUT_OK, blocks: [{ id: "v2Text", h: 0.1 }, { id: "v2Text", h: 0.2 }]
  }).ok === false &&
  canvasLayoutFrom({
    ...LAYOUT_OK, blocks: [{ id: "v2Text", h: "tall" }]
  }).ok === false);

const layoutLook = (props) => ({ ...LAYOUT_OK, look: { id: "v2Over", props } });

check("[canvas-layout] ★ 물려받은 모양이 함께 온다(글꼴 · 색)",
  canvasLayoutFrom(layoutLook({
    "font-family": 'Georgia, "Times New Roman", serif',
    "color": "rgb(43, 39, 35)",
    "line-height": "25.9px",
    "letter-spacing": "0.24em",
    "white-space": "pre-wrap"
  })).ok === true);

check("[canvas-layout] ★ 규칙을 탈출할 수 있는 값은 메시지 층에서 막힌다",
  canvasLayoutFrom(layoutLook({
    "color": "red; } body { display: none } .x {"
  })).ok === false &&
  canvasLayoutFrom(layoutLook({
    "color": "url(javascript:alert(1))"
  })).ok === false,
  "이 값은 스킨 CSS 의 선언이 된다");

check("[canvas-layout] ★ 목록에 없는 속성은 받지 않는다",
  canvasLayoutFrom(layoutLook({ "background-image": "url(x.png)" })).ok === false &&
  canvasLayoutFrom(layoutLook({})).ok === false,
  "빈 목록도 뜻이 없다");

check("[canvas-layout] ★ look 은 **한 요소**의 것이고 id 형태를 지킨다",
  canvasLayoutFrom({
    ...LAYOUT_OK, look: { id: "not an id", props: { color: "red" } }
  }).ok === false &&
  canvasLayoutFrom({
    ...LAYOUT_OK, look: { id: "v2Over", props: { color: "red" }, extra: 1 }
  }).ok === false);


/* =========================================================
   HOME-CANVAS-V2-MANUAL-FIX-1 — 흐름 블록의 폭(계약 §29-4)

   부모 → 프레임 : geometry 에 `mode:"block"` 한 칸
   프레임 → 부모 : `kind:"width"` 의 확정 요청(폭 한 칸)
========================================================== */

const GEOMETRY_BLOCK = {
  contract: 1, renderSeq: 3, active: true, id: "v2Text", mode: "block",
  x: 0, y: 0, width: 300, height: "auto", rotation: 0,
  baseWidth: 390, baseHeight: 900, generation: 5
};

check("[canvas-width] ★ 블록 표시가 실린 geometry 를 프레임이 받는다",
  canvasGeometryTo(GEOMETRY_BLOCK).ok === true);

check("[canvas-width] ★ 그 값은 \"block\" 하나뿐이다",
  canvasGeometryTo({ ...GEOMETRY_BLOCK, mode: "frame" }).ok === false &&
  canvasGeometryTo({ ...GEOMETRY_BLOCK, mode: true }).ok === false);

check("[canvas-width] ★ 해제에는 블록 표시도 없다",
  canvasGeometryTo({
    contract: 1, renderSeq: 3, active: false, generation: 5, mode: "block"
  }).ok === false);

const WIDTH_OK = {
  contract: 1, renderSeq: 3, kind: "width", id: "v2Text",
  expected: { width: 300 }, next: { width: 341.786 },
  generation: 5, requestId: 2
};

check("[canvas-width] ★ 폭 확정은 폭 한 칸이다",
  canvasTransformFrom(WIDTH_OK).ok === true);

check("[canvas-width] ★ 좌표 · 높이가 섞이면 메시지 전체가 거부된다",
  canvasTransformFrom({ ...WIDTH_OK, next: { width: 341, x: 0 } }).ok === false &&
  canvasTransformFrom({ ...WIDTH_OK, expected: { x: 0, y: 0 } }).ok === false &&
  canvasTransformFrom({ ...WIDTH_OK, next: { width: 0 } }).ok === false);

check("[canvas-layout] 프레임이 없는 캔버스는 빈 배열이다",
  canvasLayoutFrom({ ...LAYOUT_OK, frames: [] }).ok === true,
  "\"프레임이 없다\"는 뜻이 하나뿐이라 거부하지 않는다");

check("[canvas-layout] ★ 음수 자리도 통과한다",
  canvasLayoutFrom({ ...LAYOUT_OK, frames: [{ id: "v2Main", x: -0.2, y: -1.5 }] })
    .ok === true,
  "프레임이 도화지 밖으로 나갈 수 있다(margin 은 음수를 받는다)");

check("[canvas-layout] ★ 모르는 칸이 섞이면 메시지 전체가 거부된다",
  canvasLayoutFrom({
    ...LAYOUT_OK,
    frames: [{ id: "v2Main", x: 0.1, y: 0.2, width: 0.5 }]
  }).ok === false,
  "크기는 저장값이 준다 — 프레임에서 받지 않는다");

check("[canvas-layout] ★ 숫자가 아니거나 유한하지 않으면 거부된다",
  canvasLayoutFrom({ ...LAYOUT_OK, frames: [{ id: "v2Main", x: "0.1", y: 0 }] })
    .ok === false &&
  canvasLayoutFrom({ ...LAYOUT_OK, frames: [{ id: "v2Main", x: 0, y: Infinity }] })
    .ok === false);

check("[canvas-layout] ★ 식별자 규칙은 캔버스 요소의 그것과 같다",
  canvasLayoutFrom({ ...LAYOUT_OK, frames: [{ id: "1bad", x: 0, y: 0 }] })
    .ok === false &&
  canvasLayoutFrom({ ...LAYOUT_OK, frames: [{ id: "", x: 0, y: 0 }] })
    .ok === false);

check("[canvas-layout] ★ 같은 id 가 둘이면 거부된다",
  canvasLayoutFrom({
    ...LAYOUT_OK,
    frames: [{ id: "v2Main", x: 0, y: 0 }, { id: "v2Main", x: 1, y: 1 }]
  }).ok === false,
  "한 캔버스 안에서 id 는 유일하다(계약 §14-5) — 봉투도 그것을 본다");

check("[canvas-layout] ★ 부모 → 프레임 방향으로는 보낼 수 없다",
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: CANVAS_PARENT_WIN,
      data: protocol.buildSandboxMessage(
        protocol.SANDBOX_MESSAGE_TYPES.CANVAS_LAYOUT, LAYOUT_OK, 1
      )
    },
    {
      originAllowList: ["https://imory.me"],
      source: CANVAS_PARENT_WIN,
      direction: "to-frame"
    }
  ).ok === false,
  "재는 쪽은 언제나 프레임이다");


/* =========================================================
   [host] 호스트 분기
========================================================== */

console.log("\n[host] 호스트 분기");

const prodConfig = server.resolveSandboxServerConfig({
  SANDBOX_SKIN_HOST: "skin-frame.imory.me",
  SANDBOX_SKIN_PARENT_ORIGINS: "https://imory.me"
});

const kind = (href, cfg) =>
  server.classifyImoryHost(new URL(href), cfg || prodConfig);

check("[host] imory.me -> main",
  kind("https://imory.me/") === "main");

check("[host] skin-frame.imory.me -> sandbox",
  kind("https://skin-frame.imory.me/skin/sandbox/frame.html") === "sandbox");

check("[host] *.pages.dev -> pages-dev (기존 301 유지)",
  kind("https://imory.pages.dev/") === "pages-dev");

check("[host] ★ 예상하지 않은 Host -> unknown (404)",
  kind("https://evil.example/") === "unknown");

check("[host] ★ 아직 설정 안 된 slug 서브도메인도 unknown",
  kind("https://alice--skin.imory.me/") === "unknown",
  "와일드카드를 붙이기 전에는 앱이 새 origin 에서 뜨지 않는다");

check("[host] IMORY_EXTRA_HOSTS 로 추가 커스텀 도메인을 인정한다",
  kind("https://www.imory.me/", server.resolveSandboxServerConfig({
    SANDBOX_SKIN_HOST: "skin-frame.imory.me",
    IMORY_EXTRA_HOSTS: "www.imory.me"
  })) === "main");

check("[host] 로컬 dev 는 포트로 갈린다 — 부모 쪽은 main",
  kind("http://localhost:8957/", server.resolveSandboxServerConfig({
    SANDBOX_SKIN_HOST: "localhost:8958"
  })) === "main");

check("[host] 로컬 dev 는 포트로 갈린다 — frame 쪽은 sandbox",
  kind("http://localhost:8958/", server.resolveSandboxServerConfig({
    SANDBOX_SKIN_HOST: "localhost:8958"
  })) === "sandbox");

check("[host] ★ SANDBOX_SKIN_HOST 가 없으면 sandbox 호스트가 없다",
  kind("https://skin-frame.imory.me/", server.resolveSandboxServerConfig({}))
  === "unknown",
  "배포 기본값에서는 새로 열리는 문이 없다");


/* =========================================================
   [safe] 환경변수 오설정에서도 메인이 죽지 않는가

   메인 사이트가 통째로 404가 되는 시나리오를 하나씩 짚는다.
   전부 "main" 이 나와야 한다.
========================================================== */

console.log("\n[safe] 환경변수 오설정 방어");

const mainStillWorks = (env, label) =>
  check(`[safe] ★ ${label} 에서도 imory.me 는 main 이다`,
    kind("https://imory.me/", server.resolveSandboxServerConfig(env)) === "main");

mainStillWorks({}, "환경변수 전부 누락");
mainStillWorks(null, "env 객체 자체가 없음");
mainStillWorks({ SANDBOX_SKIN_HOST: "" }, "빈 문자열");
mainStillWorks({ SANDBOX_SKIN_HOST: "   " }, "공백만");
mainStillWorks({ SANDBOX_SKIN_HOST: "skin-frame.imory.me" }, "정상 설정");
mainStillWorks({ SANDBOX_SKIN_HOST: "typo-host.example" }, "오타난 호스트");
mainStillWorks({ SANDBOX_SKIN_HOST: "imory.me" }, "★ 메인 호스트를 잘못 넣음");
mainStillWorks({ SANDBOX_SKIN_HOST: "IMORY.ME" }, "★ 대문자로 잘못 넣음");

check("[safe] ★ SANDBOX_SKIN_HOST=imory.me 는 무시된다 (없는 것으로 친다)",
  server.resolveSandboxServerConfig({ SANDBOX_SKIN_HOST: "imory.me" }).sandboxHost === "",
  "이 한 줄이 없으면 오타 하나로 메인이 통째로 404가 된다");

check("[safe] 부모 origin 환경변수가 없어도 기본값이 imory.me 다",
  JSON.stringify(server.resolveSandboxServerConfig({}).parentOrigins)
  === JSON.stringify(["https://imory.me"]));

check("[safe] IMORY_EXTRA_HOSTS 를 안 넣어도 imory.me 와 pages.dev 는 통과",
  kind("https://imory.me/anything", server.resolveSandboxServerConfig({
    SANDBOX_SKIN_HOST: "skin-frame.imory.me"
  })) === "main" &&
  kind("https://x.pages.dev/", server.resolveSandboxServerConfig({
    SANDBOX_SKIN_HOST: "skin-frame.imory.me"
  })) === "pages-dev",
  "사용자가 IMORY_EXTRA_HOSTS 를 설정하지 않은 실제 구성");


/* =========================================================
   [path] 경로 allowlist
========================================================== */

console.log("\n[path] 경로 allowlist");

check("[path] frame 문서의 두 주소가 모두 sandbox origin 에서 허용",
  server.isSandboxAllowedPath("/skin/sandbox/frame") === true &&
  server.isSandboxAllowedPath("/skin/sandbox/frame.html") === true,
  "Pages 가 .html 을 308 로 확장자 없는 주소에 보낸다(2026-09-15 실측)");

check("[path] frame 이 쓰는 스크립트 넷이 전부 allowlist 에 있다",
  ["/core/lib/build-version.js",
    "/skin/sandbox/skin-sandbox-config.js",
    "/skin/sandbox/skin-sandbox-protocol.js",
    "/skin/sandbox/skin-sandbox-frame.js"
  ].every(server.isSandboxAllowedPath));

check("[path] ★ 앱 진입 문서는 sandbox origin 에서 허용되지 않는다",
  server.isSandboxAllowedPath("/index.html") === false &&
  server.isSandboxAllowedPath("/") === false);

check("[path] ★ supabase client 도 허용되지 않는다",
  server.isSandboxAllowedPath("/core/lib/supabase-client.js") === false);

/*
  SANDBOX-1 — 렌더러가 프레임 안으로 들어왔다. SANDBOX-0에서는
  이 경로가 404였다(그때는 빈 프레임이었다). 지금은 200이어야
  하고, **그 대신** 앱/인증/supabase/studio가 여전히 404라는
  것이 allowlist의 의미다(바로 위 절).
*/
check("[path] ★ SANDBOX-1: 렌더러 사슬이 허용된다",
  server.isSandboxAllowedPath("/skin/skin-render.js") === true &&
  server.isSandboxAllowedPath("/skin/skin-css-validate.js") === true &&
  server.isSandboxAllowedPath("/skin/skin-sanitize.js") === true &&
  server.isSandboxAllowedPath("/core/content-width.js") === true &&
  server.isSandboxAllowedPath("/core/content-width.css") === true);

check("[path] ★ 그래도 다른 skin 파일은 허용되지 않는다",
  server.isSandboxAllowedPath("/skin/skin-context.js") === false &&
  server.isSandboxAllowedPath("/skin/skin-home.js") === false &&
  server.isSandboxAllowedPath("/skin/skin-template.js") === false &&
  server.isSandboxAllowedPath("/studio/studio-preview.js") === false);


/*
  SANDBOX-3.2 — 본문 class 규칙 두 벌. 공개 화면과 같은 파일이라
  프레임이 같은 본문을 같은 모양으로 그린다.
*/
check("[path] ★ SANDBOX-3.2: 본문 공용 CSS 두 벌이 허용된다",
  server.isSandboxAllowedPath("/posts/posts-body-shared.css") === true &&
  server.isSandboxAllowedPath("/posts/posts-body-blocks.css") === true);

check("[path] ★ 그래도 나머지 posts CSS/JS 는 허용되지 않는다",
  server.isSandboxAllowedPath("/posts/posts-list-detail.css") === false &&
  server.isSandboxAllowedPath("/posts/posts-base.css") === false &&
  server.isSandboxAllowedPath("/posts/posts-editor.css") === false &&
  server.isSandboxAllowedPath("/posts/style/posts-style-render.js") === false,
  "본문이 쓰는 두 파일만 열었다 — posts 디렉터리를 연 것이 아니다");

check("[path] ★ isSandboxFramePath 는 두 주소를 모두 frame 으로 본다",
  server.isSandboxFramePath("/skin/sandbox/frame") === true &&
  server.isSandboxFramePath("/skin/sandbox/frame.html") === true,
  "한쪽만 보면 메인 origin 에서 막지 않은 쪽으로 프레임이 열린다");

check("[path] 비슷하게 생긴 다른 경로는 frame 이 아니다",
  server.isSandboxFramePath("/skin/sandbox/frame.html/") === false &&
  server.isSandboxFramePath("/skin/sandbox/frame2") === false);


/* =========================================================
   [csp] CSP 전문
========================================================== */

console.log("\n[csp] CSP");

const csp = server.buildSandboxCsp("N0NCE", ["https://imory.me"]);

const hasDirective = (text) => csp.split("; ").indexOf(text) !== -1;

check("[csp] default-src 'none'", hasDirective("default-src 'none'"));
check("[csp] connect-src 'none' (임의 네트워크 호출 차단)",
  hasDirective("connect-src 'none'"));
check("[csp] object-src 'none'", hasDirective("object-src 'none'"));
check("[csp] worker-src 'none'", hasDirective("worker-src 'none'"));
check("[csp] frame-src 'none'", hasDirective("frame-src 'none'"));
check("[csp] base-uri 'none'", hasDirective("base-uri 'none'"));
check("[csp] form-action 'none'", hasDirective("form-action 'none'"));
check("[csp] frame-ancestors 는 아이모리 부모 origin 만",
  hasDirective("frame-ancestors https://imory.me"));
/*
  SANDBOX-1 — renderSkin()이 들어오면서 넓어진 세 칸. 어느 것도
  'unsafe-inline'/'unsafe-eval'이 아니다(core/lib/skin-sandbox-server.js
  buildSandboxCsp 주석에 근거).
*/
check("[csp] ★ unsafe-inline / unsafe-eval 이 어디에도 없다",
  csp.indexOf("unsafe-inline") === -1 &&
  csp.indexOf("unsafe-eval") === -1,
  csp);

check("[csp] script-src 는 'self' + nonce + CSS 파서 한 URL",
  hasDirective(
    "script-src 'self' 'nonce-N0NCE' " + server.SANDBOX_CSS_PARSER_URL
  ));

check("[csp] ★ 그 CSS 파서 항목은 호스트가 아니라 파일 하나다",
  server.SANDBOX_CSS_PARSER_URL.endsWith(".js") &&
  server.SANDBOX_CSS_PARSER_URL.indexOf("@eslint/css-tree@") !== -1,
  server.SANDBOX_CSS_PARSER_URL);

check("[csp] style-src 는 'self' + nonce (renderSkin 의 동적 style 용)",
  hasDirective("style-src 'self' 'nonce-N0NCE'"));

check("[csp] ★ img-src 가 https: 전체가 아니다",
  csp.indexOf("img-src https:") === -1 &&
  hasDirective("img-src data: blob: " + server.SANDBOX_SUPABASE_ORIGIN + " https://imory.me"),
  csp.split("; ").find(d => d.indexOf("img-src") === 0));

check("[csp] ★ font-src 도 https: 전체가 아니다",
  hasDirective("font-src 'self' data:"));

check("[csp] ★ connect-src 는 계속 'none' 이다 (SANDBOX-1 에서도)",
  hasDirective("connect-src 'none'"));

/* 배열로 주던 SANDBOX-0 호출자도 계속 받는다 */
check("[csp] parentOrigins 배열 형태 호출이 그대로 동작한다",
  server.buildSandboxCsp("X", ["https://imory.me"])
    .indexOf("frame-ancestors https://imory.me") !== -1);

check("[csp] ★ media 출처는 환경변수로 넓힐 수 있다",
  server.resolveSandboxMediaOrigins(
    server.resolveSandboxServerConfig({
      SANDBOX_SKIN_MEDIA_ORIGINS: "https://cdn.example.com"
    })
  ).indexOf("https://cdn.example.com") !== -1);
check("[csp] sandbox 지시어로 최상위 열람도 같은 제약을 받는다",
  hasDirective("sandbox allow-scripts allow-same-origin"));
check("[csp] frame-ancestors 목록이 비면 'none' 이 된다",
  server.buildSandboxCsp("X", []).indexOf("frame-ancestors 'none'") !== -1);


/* =========================================================
   [nonce] nonce 주입
========================================================== */

console.log("\n[nonce] nonce 주입");

const a = server.createSandboxNonce();
const b = server.createSandboxNonce();

check("[nonce] 요청마다 다르다", a !== b, `${a} / ${b}`);
check("[nonce] CSP 토큰으로 안전한 글자만", /^[A-Za-z0-9_-]+$/.test(a), a);

const injected = server.injectSandboxNonce(
  '<style>x{}</style><script>a<\/script><script src="/a.js"><\/script>',
  "NN"
);

check("[nonce] 속성 없는 인라인 블록에만 붙는다",
  injected === '<style nonce="NN">x{}</style><script nonce="NN">a<\/script>' +
  '<script src="/a.js"><\/script>',
  injected);


/* =========================================================
   [frame] frame.html 이 실제로 로드하는 것과 allowlist 가 맞는가
========================================================== */

console.log("\n[frame] frame.html 과 allowlist 일치");

const frameHtml = await import("node:fs")
  .then(fs => fs.readFileSync(path.join(ROOT, "skin", "sandbox", "frame.html"), "utf8"));

/* 주석에는 "supabase를 로드하지 않는다"는 설명이 들어 있다 —
   판정은 실제 코드만 보고 한다. */
const frameCode = frameHtml.replace(/<!--[\s\S]*?-->/g, "");

const referenced = [...frameCode.matchAll(/["'](\/[^"']+\.js)(\?|["'])/g)]
  .map(m => m[1]);

check("[frame] frame.html 이 참조하는 스크립트가 전부 allowlist 안이다",
  referenced.length > 0 && referenced.every(server.isSandboxAllowedPath),
  referenced.join(", "));


/*
  SANDBOX-3.2 — 스타일시트도 같은 규칙이다. 스크립트만 보면
  "링크는 걸었는데 서버가 404" 라는 조용한 실패를 못 잡는다
  (그때 본문은 나오되 형광펜 여백과 강조선 마커만 달라진다).
*/

const referencedStyles = [...frameCode.matchAll(/["'](\/[^"']+\.css)(\?|["'])/g)]
  .map(m => m[1]);

check("[frame] ★ frame.html 이 읽는 스타일시트도 전부 allowlist 안이다",
  referencedStyles.length > 0 &&
  referencedStyles.every(server.isSandboxAllowedPath),
  referencedStyles.join(", "));

check("[frame] ★ 본문 공용 CSS 두 벌을 실제로 읽는다",
  referencedStyles.includes("/posts/posts-body-shared.css") &&
  referencedStyles.includes("/posts/posts-body-blocks.css"),
  referencedStyles.join(", "));

check("[frame] ★ supabase / 인증 / studio 코드를 로드하지 않는다",
  !/supabase|auth\/|admin\/|studio\/|skin-context/.test(frameCode));

check("[frame] 인라인 블록이 속성 없이 적혀 있다 (nonce 주입 전제)",
  frameCode.indexOf("<style>") !== -1 &&
  (frameCode.match(/<script>/g) || []).length >= 2);

/*
  ★ 배포 실측에서 발견한 것: 주입기는 문자열을 그대로 찾으므로
  주석 안에 적힌 여는 태그에도 nonce를 끼운다. 서빙되는 문서에
  쓸데없는 값이 남지 않도록, 주입 결과가 **실제 블록 수와 정확히
  같아야** 한다.
*/

const nonced =
  server.injectSandboxNonce(frameHtml, "TESTNONCE");

const realBlocks =
  (frameCode.match(/<style>/g) || []).length +
  (frameCode.match(/<script>/g) || []).length;

check("[frame] ★ nonce 가 실제 인라인 블록 수만큼만 들어간다 (주석에는 안 들어간다)",
  (nonced.match(/nonce="TESTNONCE"/g) || []).length === realBlocks,
  `${(nonced.match(/nonce="TESTNONCE"/g) || []).length} vs 실제 블록 ${realBlocks}`);




/* =========================================================
   [mode] renderMode 판정 (SANDBOX-1)

   skin/skin-template.js 는 classic script(브라우저 전역)라
   module.exports 가 없다. 함수 선언만 뽑아 쓰기보다, 파일을
   그대로 읽어 함수 본문을 평가한다 — **배포되는 그 코드**를
   본다는 뜻이다(문자열 복제가 아니다).
========================================================== */

console.log("\n[mode] renderMode 판정");

const templateSource =
  fs.readFileSync(path.join(ROOT, "skin", "skin-template.js"), "utf8");

const modeApi =
  new Function(
    templateSource +
    "\nreturn { resolveSkinRenderMode, isKnownSkinRenderMode, SKIN_RENDER_MODES };"
  )();

check("[mode] renderMode 가 없으면 native",
  modeApi.resolveSkinRenderMode({ schemaVersion: 1 }) === "native");

check("[mode] renderMode:'native' 는 native",
  modeApi.resolveSkinRenderMode({ renderMode: "native" }) === "native");

check("[mode] ★ renderMode:'sandbox' 만 sandbox 다",
  modeApi.resolveSkinRenderMode({ renderMode: "sandbox" }) === "sandbox");

check("[mode] ★ 모르는 값을 sandbox 로 추측하지 않는다",
  ["weird", "SANDBOX", "sandbox2", "", " ", "sand box"].every(
    (value) => modeApi.resolveSkinRenderMode({ renderMode: value }) === "native"
  ));

check("[mode] ★ 문자열이 아니면 native",
  [1, true, null, undefined, {}, [], { toString: () => "sandbox" }].every(
    (value) => modeApi.resolveSkinRenderMode({ renderMode: value }) === "native"
  ));

check("[mode] skinPackage 자체가 없어도 native (throw 하지 않는다)",
  modeApi.resolveSkinRenderMode(null) === "native" &&
  modeApi.resolveSkinRenderMode(undefined) === "native");

check("[mode] Import 가 받아들이는 값은 둘뿐이다",
  JSON.stringify(modeApi.SKIN_RENDER_MODES) === JSON.stringify(["native", "sandbox"]) &&
  modeApi.isKnownSkinRenderMode("weird") === false &&
  modeApi.isKnownSkinRenderMode("sandbox") === true);


/* =========================================================
   [payload] 전달 데이터 투영 (SANDBOX-1)

   ★ 이 절이 "무엇이 다른 origin으로 건너가는가"의 판정이다.
========================================================== */

console.log("\n[payload] 전달 데이터 투영");

/* 공개 HOME Context 를 흉내내되, **보내면 안 되는 것**을 섞는다 */

const FORBIDDEN = {
  ownerId: "11111111-2222-3333-4444-555555555555",
  accessToken: "eyJhbGciOi.FAKE.TOKEN",
  refreshToken: "FAKE-REFRESH",
  email: "owner@example.com",
  secretBody: "비밀글 본문 원문",
  skinId: "skin-row-id",
  versionId: "version-row-id"
};

const dirtyContext = {

  site: { title: "T", slug: "demo", faviconUrl: null, description: null, language: "ko" },
  profile: { nickname: "주인장", bio: null, avatarUrl: null },

  navigation: {
    home: { id: null, name: "T", href: "/demo/", type: "home", iconKind: "home" },
    categories: [{ id: "1", name: "TXT", type: "post", iconKind: "post", href: "/demo/category/1", itemCount: null }],
    postCategories: [],
    galleryCategories: [],
    textPostCategories: [],
    bannerCategories: [],
    highlights: { name: "H", href: "/demo/highlights", type: "highlight", iconKind: "highlight", hasCategory: false, showStandaloneLink: true, categoryId: null, enabled: true }
  },

  banners: { items: [{ id: "b1", imageUrl: "https://x/y.png", href: null, alt: null }] },

  viewer: {
    isOwner: true,
    writeHref: "/demo/?write=1",
    adminHref: "/demo/admin",
    manageHref: "/demo/category/1?manage=1",
    toolsHref: null,
    highlightHref: null,
    canManageHighlights: true,
    canManageMemos: true
  },

  images: { profile: "https://x/avatar.png" },

  page: { type: "home", isHome: true },

  home: {
    highlights: {
      cards: [{ id: "h1", excerpt: "E", note: "N", hasNote: true, color: "#fff" }],
      featured: [],
      card: null,
      hasCard: false,
      count: 99,
      isEmpty: true,
      hasError: false
    },
    recentPosts: [{ id: "1", title: "글", href: "/demo/post/1", isSecret: false }]
  },

  /*
    SANDBOX-3 — banner / highlights 화면의 재료. 여기에도 넘어가면
    안 되는 값을 섞어 둔다(아래 [payload3] 절이 확인한다).
  */

  bannerCategory: {
    id: 3,
    name: "BAN",
    type: "banner",
    href: "/demo/category/3",
    items: [
      {
        id: "b9", name: "띠", alt: "띠",
        href: "/demo/category/1",
        imageUrl: "/storage/b.png",

        /* 계약에 없는 칸 */
        ownerId: FORBIDDEN.ownerId,
        rawRow: { user_id: FORBIDDEN.ownerId }
      }
    ],
    ownerId: FORBIDDEN.ownerId
  },

  highlights: {
    view: { isAll: true, isFolders: false, isFolder: false },
    allHref: "/demo/highlights",
    foldersHref: "/demo/highlights?view=folders",
    allLabel: "전체",
    foldersLabel: "폴더별",
    cards: [
      {
        id: "h2", excerpt: "E2", note: "N2", hasNote: true,
        color: "#f3a", postId: "1", postTitle: "글",
        postHref: "/demo/post/1", sourcePathLabel: "TXT > 글",

        /* 계약에 없는 칸 */
        secretBody: FORBIDDEN.secretBody,
        userId: FORBIDDEN.ownerId
      }
    ],
    folders: [
      { id: "1", name: "TXT", href: "/demo/highlights/category/1", count: 1, countLabel: "1개",
        coverUrl: "/storage/cover.png", hasCover: true, coverRatio: "original",
        coverFocusX: 50, coverFocusY: 50,
        secretBody: FORBIDDEN.secretBody }
    ],
    folder: null,
    showCards: true,
    count: 99,
    isEmpty: true,
    hasError: false,
    canManage: true
  },

  /* 넘어가면 안 되는 것 */
  ownerId: FORBIDDEN.ownerId,
  accessToken: FORBIDDEN.accessToken,
  refreshToken: FORBIDDEN.refreshToken,
  email: FORBIDDEN.email,
  postBody: FORBIDDEN.secretBody,
  skinId: FORBIDDEN.skinId,
  versionId: FORBIDDEN.versionId,
  supabaseClient: { from() { return null; } },
  callback() { return 1; }

};

const projected =
  sandboxContext.projectSkinContextForSandbox(dirtyContext, "home");

const projectedJson =
  JSON.stringify(projected);

check("[payload] HOME 은 투영된다", Boolean(projected));

check("[payload] ★ 최상위 키가 계약 그대로다",
  JSON.stringify(Object.keys(projected).sort()) ===
  JSON.stringify(sandboxContext.SANDBOX_CONTEXT_TOP_LEVEL_KEYS.slice().sort()),
  Object.keys(projected).join(", "));

for (const [name, value] of Object.entries(FORBIDDEN)) {
  check(`[payload] ★ ${name} 이(가) 건너가지 않는다`,
    projectedJson.indexOf(value) === -1);
}

check("[payload] ★ 함수는 결과에 존재할 수 없다 (구조화 복사 가능)",
  (() => {
    try { structuredClone(projected); return true; }
    catch (err) { return false; }
  })());

check("[payload] ★ 관리자 여부와 관리자 전용 링크를 보내지 않는다",
  projected.viewer.isOwner === false &&
  projected.viewer.adminHref === null &&
  projected.viewer.writeHref === null &&
  projected.viewer.manageHref === null &&
  projectedJson.indexOf("/demo/admin") === -1 &&
  projectedJson.indexOf("write=1") === -1,
  JSON.stringify(projected.viewer));

check("[payload] ★ 원본을 스프레드하지 않는다 — 모르는 키가 전혀 없다",
  Object.keys(projected).every(
    (key) => sandboxContext.SANDBOX_CONTEXT_TOP_LEVEL_KEYS.indexOf(key) !== -1
  ));

check("[payload] ★ __proto__ 같은 슬롯 이름은 images 에 실리지 않는다",
  (() => {
    const withBadSlot = JSON.parse(JSON.stringify({ site: {}, images: {} }));
    withBadSlot.images = JSON.parse('{"__proto__":"x","_bad":"y","ok":"https://a/b.png"}');
    const out = sandboxContext.projectSkinContextForSandbox(withBadSlot, "home");
    return JSON.stringify(out.images) === '{"ok":"https://a/b.png"}';
  })());

check("[payload] ★ featured/card 는 cards 에서 다시 만든다 (위조 방지)",
  projected.home.highlights.featured.length === 1 &&
  projected.home.highlights.card !== null &&
  projected.home.highlights.hasCard === true &&
  projected.home.highlights.count === 1 &&
  projected.home.highlights.isEmpty === false,
  "입력은 featured:[] card:null hasCard:false count:99 isEmpty:true 였다");

check("[payload] ★ page 는 pageType 하나로 다시 만든다 (정확히 하나만 true)",
  Object.entries(projected.page)
    .filter(([k, v]) => k !== "type" && v === true).length === 1 &&
  projected.page.isHome === true);

check("[payload] navigation.memos 는 highlights 와 같은 객체다",
  projected.navigation.memos === projected.navigation.highlights);

/*
  SANDBOX-2 에서 category/post 가, SANDBOX-3 에서 banner/highlights 가
  계약에 들어왔다. 나머지는 여전히 투영하지 않는다 — 모르는 화면을
  sandbox 로 추측하지 않는다.

  ★ "memos" 는 **page type 이 아니다**. templates.memos 는 하이라이트
  template 의 레거시 alias 일 뿐이고, 화면 이름은 highlights 하나다.
*/

check("[payload] ★ 계약에 없는 page type 은 여전히 투영하지 않는다",
  ["folder", "memos", "HIGHLIGHTS", "HOME", "", null, undefined]
    .every((t) => sandboxContext.projectSkinContextForSandbox(dirtyContext, t) === null));

check("[payload] ★ SANDBOX-3 의 다섯 page type 은 투영된다",
  ["home", "category", "post", "banner", "highlights"]
    .every((t) => {
      const out = sandboxContext.projectSkinContextForSandbox(dirtyContext, t);
      return out !== null && out.pageType === t && out.page.type === t;
    }));

check("[payload] ★ banner/highlights 화면에서도 그 페이지의 namespace 만 채운다",
  (() => {
    const ban = sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner");
    const hl = sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights");
    return ban.bannerCategory !== null && ban.highlights === null &&
      ban.home === null && ban.category === null && ban.post === null &&
      hl.highlights !== null && hl.bannerCategory === null &&
      hl.home === null && hl.category === null && hl.post === null;
  })());

check("[payload] ★ highlights 와 memos 는 같은 객체다 (값이 갈라질 수 없다)",
  (() => {
    const hl = sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights");
    const ban = sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner");
    return hl.highlights === hl.memos && ban.highlights === ban.memos;
  })());

check("[payload] ★ 프레임 안 하이라이트는 주인장에게도 읽기 전용이다 (canManage 고정 false)",
  (() => {
    const hl = sandboxContext.projectSkinContextForSandbox(
      { ...dirtyContext, highlights: { canManage: true, cards: [], showCards: true } },
      "highlights"
    );
    return hl.highlights.canManage === false;
  })(),
  "입력은 canManage:true 였다");

check("[payload] ★ page.isMemos 는 isHighlights 의 alias 다 (그 밖에는 하나만 true)",
  (() => {
    const hl = sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights");
    const ban = sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner");
    const trueCount = (p) =>
      Object.entries(p).filter(([k, v]) => k !== "type" && v === true).length;
    return hl.page.isHighlights === true && hl.page.isMemos === true &&
      trueCount(hl.page) === 2 &&
      ban.page.isBanner === true && trueCount(ban.page) === 1;
  })());

check("[payload] ★ banner 투영은 native context 에 없는 칸을 만들지 않는다",
  (() => {
    const ban = sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner");
    return JSON.stringify(Object.keys(ban.bannerCategory).sort()) ===
      JSON.stringify(["href", "id", "items", "name", "type"]);
  })(),
  "재료 일치 — count/isEmpty 같은 편의 칸을 sandbox 쪽에만 두면 스킨이 다르게 그려진다");

check("[payload] ★ 그 페이지의 namespace 만 채운다 (나머지는 null)",
  (() => {
    const cat = sandboxContext.projectSkinContextForSandbox(dirtyContext, "category");
    const post = sandboxContext.projectSkinContextForSandbox(dirtyContext, "post");
    return cat.home === null && cat.post === null && cat.category !== null &&
      post.home === null && post.category === null && post.post !== null;
  })());

check("[payload] context 가 객체가 아니면 null",
  sandboxContext.projectSkinContextForSandbox(null, "home") === null &&
  sandboxContext.projectSkinContextForSandbox([], "home") === null &&
  sandboxContext.projectSkinContextForSandbox("x", "home") === null);

check("[payload] 받은 쪽 shape 검사가 투영 결과를 통과시킨다",
  sandboxContext.isSandboxContextShape(projected) === true);

check("[payload] ★ 모르는 최상위 키가 섞이면 받는 쪽이 거부한다",
  (() => {
    const tampered = JSON.parse(projectedJson);
    tampered.accessToken = "FAKE";
    return sandboxContext.isSandboxContextShape(tampered) === false;
  })());

check("[payload] ★ contract / pageType 이 어긋나면 거부한다",
  (() => {
    const a = JSON.parse(projectedJson); a.contract = 2;
    const b = JSON.parse(projectedJson); b.pageType = "post";
    return sandboxContext.isSandboxContextShape(a) === false &&
      sandboxContext.isSandboxContextShape(b) === false;
  })());


/* =========================================================
   [payload3] SANDBOX-3 — banner / highlights payload

   위 [payload] 절이 HOME 으로 확인한 것과 같은 질문을 새 두 화면에
   던진다: 계약에 없는 칸이 프레임에 도착하지 않는가.
========================================================== */

console.log("\n[payload3] SANDBOX-3 banner / highlights payload");

{
  const bannerJson =
    JSON.stringify(
      sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner"));

  const hlJson =
    JSON.stringify(
      sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights"));

  for (const [name, value] of Object.entries(FORBIDDEN)) {

    check(`[payload3] ★ banner payload 에 ${name} 이(가) 없다`,
      bannerJson.indexOf(value) === -1);

    check(`[payload3] ★ highlights payload 에 ${name} 이(가) 없다`,
      hlJson.indexOf(value) === -1);

  }

  check("[payload3] ★ 배너 항목은 알려진 다섯 칸뿐이다",
    (() => {
      const ban = sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner");
      return JSON.stringify(Object.keys(ban.bannerCategory.items[0]).sort()) ===
        JSON.stringify(["alt", "href", "id", "imageUrl", "name"]);
    })());

  check("[payload3] ★ 하이라이트 개수는 cards 에서 다시 센다 (입력의 99 를 믿지 않는다)",
    (() => {
      const hl = sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights");
      return hl.highlights.count === 1 && hl.highlights.isEmpty === false;
    })(),
    "입력은 count:99 isEmpty:true 였다");

  check("[payload3] ★ 폴더 커버/배너 이미지는 부모 origin 기준 절대 주소가 된다",
    (() => {
      const hl = sandboxContext.projectSkinContextForSandbox(
        dirtyContext, "highlights", { origin: "https://parent.example" });
      const ban = sandboxContext.projectSkinContextForSandbox(
        dirtyContext, "banner", { origin: "https://parent.example" });
      return hl.highlights.folders[0].coverUrl === "https://parent.example/storage/cover.png" &&
        ban.bannerCategory.items[0].imageUrl === "https://parent.example/storage/b.png";
    })());

  check("[payload3] ★ 두 화면의 투영 결과도 받는 쪽 shape 검사를 통과한다",
    sandboxContext.isSandboxContextShape(
      sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner")) === true &&
    sandboxContext.isSandboxContextShape(
      sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights")) === true);

  check("[payload3] ★ 두 화면의 payload 도 구조화 복사가 된다 (함수 없음)",
    (() => {
      try {
        structuredClone(
          sandboxContext.projectSkinContextForSandbox(dirtyContext, "banner"));
        structuredClone(
          sandboxContext.projectSkinContextForSandbox(dirtyContext, "highlights"));
        return true;
      }
      catch (err) { return false; }
    })());

  check("[payload3] ★ 레거시 memos.cards 만 있는 context 도 같은 카드를 만든다",
    (() => {
      const legacy = { ...dirtyContext };
      legacy.memos = legacy.highlights;
      delete legacy.highlights;
      const out = sandboxContext.projectSkinContextForSandbox(legacy, "highlights");
      return out.highlights.cards.length === 1 &&
        out.highlights.cards[0].excerpt === "E2" &&
        out.highlights === out.memos;
    })());
}


/* =========================================================
   [msg1] SANDBOX-1 메시지 검증
========================================================== */

console.log("\n[msg1] SANDBOX-1 메시지");

const FRAME_ORIGIN = "https://skin-frame.imory.me";
const PARENT_ORIGIN = "https://imory.me";

const frameWin = { name: "frame" };
const parentWin = { name: "parent" };

function toParent(type, payload, seq) {
  return {
    origin: FRAME_ORIGIN,
    source: frameWin,
    data: { imory: 1, type, seq: seq === undefined ? 1 : seq, payload }
  };
}

function toFrame(type, payload, seq) {
  return {
    origin: PARENT_ORIGIN,
    source: parentWin,
    data: { imory: 1, type, seq: seq === undefined ? 1 : seq, payload }
  };
}

const parentRules = {
  originAllowList: [FRAME_ORIGIN], source: frameWin, direction: "to-parent"
};

const frameRules = {
  originAllowList: [PARENT_ORIGIN], source: parentWin, direction: "to-frame"
};

const goodRender = {
  contract: 1,
  pageType: "home",
  renderSeq: 1,
  template: { html: "<div></div>", css: "" },
  data: projected
};

check("[msg1] 정상 RENDER_HOME 은 통과한다",
  protocol.validateSandboxMessage(
    toFrame("IMORY_RENDER_HOME", goodRender), frameRules
  ).ok === true);

check("[msg1] ★ 부모는 RENDER_HOME 을 받지 않는다 (방향)",
  protocol.validateSandboxMessage(
    toParent("IMORY_RENDER_HOME", goodRender), parentRules
  ).reason === "wrong-direction");

check("[msg1] ★ 프레임은 RENDERED/HEIGHT 를 받지 않는다 (방향)",
  protocol.validateSandboxMessage(
    toFrame("IMORY_RENDERED", { contract: 1, pageType: "home", renderSeq: 1, height: 10 }), frameRules
  ).reason === "wrong-direction" &&
  protocol.validateSandboxMessage(
    toFrame("IMORY_HEIGHT", { contract: 1, renderSeq: 1, height: 10 }), frameRules
  ).reason === "wrong-direction");

check("[msg1] ★ RENDER_HOME 에 모르는 키가 하나라도 있으면 거부",
  protocol.validateSandboxMessage(
    toFrame("IMORY_RENDER_HOME", { ...goodRender, token: "x" }), frameRules
  ).reason === "unknown-payload-key");

check("[msg1] ★ pageType 이 home 이 아니면 거부 (추측하지 않는다)",
  ["category", "post", "HOME", "", 1, null].every((t) =>
    protocol.validateSandboxMessage(
      toFrame("IMORY_RENDER_HOME", { ...goodRender, pageType: t }), frameRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] ★ template 이 {html,css} 문자열 쌍이 아니면 거부",
  [
    { html: "<div></div>" },
    { html: 1, css: "" },
    { html: "", css: 1 },
    { html: "", css: "", extra: 1 },
    "<div></div>",
    null,
    []
  ].every((tpl) =>
    protocol.validateSandboxMessage(
      toFrame("IMORY_RENDER_HOME", { ...goodRender, template: tpl }), frameRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] ★ data 가 plain object 가 아니면 거부",
  [null, "x", 1, [], true].every((d) =>
    protocol.validateSandboxMessage(
      toFrame("IMORY_RENDER_HOME", { ...goodRender, data: d }), frameRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] ★ 높이는 정수여야 한다 (NaN/Infinity/소수/문자 거부)",
  [NaN, Infinity, -Infinity, 12.5, "120", null, undefined, true].every((h) =>
    protocol.validateSandboxMessage(
      toParent("IMORY_HEIGHT", { contract: 1, renderSeq: 1, height: h }), parentRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] ★ 높이 범위 밖은 거부한다 (0 · 음수 · 상한 초과)",
  [0, -1, -9999, protocol.SANDBOX_MAX_FRAME_HEIGHT + 1, 10 ** 9].every((h) =>
    protocol.validateSandboxMessage(
      toParent("IMORY_HEIGHT", { contract: 1, renderSeq: 1, height: h }), parentRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] 범위 안의 높이는 통과한다",
  [1, 120, 5000, protocol.SANDBOX_MAX_FRAME_HEIGHT].every((h) =>
    protocol.validateSandboxMessage(
      toParent("IMORY_HEIGHT", { contract: 1, renderSeq: 1, height: h }), parentRules
    ).ok === true
  ));

check("[msg1] ★ renderSeq 가 1 이상 정수가 아니면 거부",
  [0, -1, 1.5, "1", null].every((n) =>
    protocol.validateSandboxMessage(
      toParent("IMORY_HEIGHT", { contract: 1, renderSeq: n, height: 10 }), parentRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] ★ 오류 코드는 정해진 목록뿐이다 (자유 문장 금지)",
  protocol.validateSandboxMessage(
    toParent("IMORY_FRAME_ERROR", { contract: 1, code: "render-failed" }), parentRules
  ).ok === true &&
  ["boom", "Error: x at line 3", "", 1, null].every((c) =>
    protocol.validateSandboxMessage(
      toParent("IMORY_FRAME_ERROR", { contract: 1, code: c }), parentRules
    ).reason === "bad-payload-value"
  ));

check("[msg1] ★ 위조 origin 은 타입과 무관하게 거부된다",
  protocol.validateSandboxMessage(
    { ...toParent("IMORY_RENDERED", { contract: 1, pageType: "home", renderSeq: 1, height: 10 }),
      origin: "https://evil.example" },
    parentRules
  ).reason === "bad-origin");

check("[msg1] ★ 같은 origin 의 다른 window 도 거부된다",
  protocol.validateSandboxMessage(
    { ...toParent("IMORY_RENDERED", { contract: 1, pageType: "home", renderSeq: 1, height: 10 }),
      source: { name: "other" } },
    parentRules
  ).reason === "bad-source");

check("[msg1] buildSandboxMessage 가 RENDER_HOME 의 알려진 키만 담는다",
  (() => {
    const built = protocol.buildSandboxMessage(
      "IMORY_RENDER_HOME", { ...goodRender, token: "LEAK" }, 5
    );
    return JSON.stringify(built).indexOf("LEAK") === -1 &&
      JSON.stringify(Object.keys(built.payload).sort()) ===
      JSON.stringify(["contract", "data", "pageType", "renderSeq", "template"]);
  })());

/* =========================================================
   [nav] SANDBOX-2 — "프레임에서 어디로 갈 수 있는가"

   ★ 왜 여기에 있는가

   이 판정은 보안 경계다. 브라우저를 띄우지 않고도 규칙 하나하나를
   눌러 볼 수 있어야, e2e 를 못 돌리는 상황에서도 "javascript: 가
   막히는가"를 확인할 수 있다.

   ★ 어떻게 로드하는가

   skin/sandbox/skin-sandbox-nav.js 는 classic script 라 전역
   함수 두 개(resolveInSiteSkinRoute, siteOwnerSlug)에 기대고,
   그 함수는 또 core/lib/site-path.js 의 전역에 기댄다. require()
   로는 그 사슬이 서지 않으므로(각 파일이 자기 모듈 스코프를
   갖는다) **실제 파일을 그대로 전역 스코프에 평가한다** —
   production 과 같은 코드가 같은 방식으로 이어진 상태를 본다.
========================================================== */

console.log("\n[nav] SANDBOX-2 이동 판정");

globalThis.window = {
  location: {
    hostname: "localhost",
    pathname: "/test1/",
    origin: "http://localhost:8957",
    search: ""
  },
  URL: URL
};

globalThis.document = {
  addEventListener() {},
  referrer: ""
};

globalThis.siteOwnerSlug = "test1";

const vm = await import("node:vm");

for (const rel of [
  "core/lib/reserved-slugs.js",
  "core/lib/site-path.js",
  "skin/skin-link-nav.js",
  "skin/sandbox/skin-sandbox-nav.js"
]) {

  vm.runInThisContext(
    fs.readFileSync(path.join(ROOT, rel), "utf8"),
    { filename: rel }
  );

}

const navWin = globalThis.window;

const allow = (href) => resolveSandboxNavTarget(href, navWin) !== null;

check("[nav] HOME / CATEGORY / POST / FOLDER / HIGHLIGHTS 는 허용",
  ["/test1/", "/test1", "/test1/category/3", "/test1/post/12",
   "/test1/category/3/folder/9", "/test1/highlights",
   "/test1/highlights/category/3", "/test1/memos",
   "/test1/category/3?page=2"].every(allow));

check("[nav] ★ javascript: / data: / blob: 는 거부",
  ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>",
   "blob:http://localhost:8957/x", "vbscript:x", "file:///etc/passwd"]
    .every((h) => !allow(h)));

check("[nav] ★ protocol-relative 와 외부 origin 은 거부",
  ["//evil.example/test1/", "https://evil.example/test1/",
   "http://evil.example", "\\\\evil.example"].every((h) => !allow(h)));

check("[nav] ★ 다른 사람의 블로그는 거부",
  ["/other/", "/other/post/1", "/OTHER/category/2"].every((h) => !allow(h)));

check("[nav] ★ 플랫폼 화면(/admin /auth /invite /studio /api)은 거부",
  ["/admin", "/admin/", "/auth/index.html", "/invite/abc",
   "/studio/", "/api/post-cover?image=1"].every((h) => !allow(h)));

check("[nav] ★ 관리/작성 요청 쿼리가 붙은 주소는 거부",
  ["/test1/?write=1", "/test1/post/12?edit=1", "/test1/category/3?manage=1",
   "/test1/post/12?tools=1", "/test1/post/12?highlight=1"]
    .every((h) => !allow(h)));

check("[nav] ★ traversal 은 거부",
  ["/test1/../admin", "/test1/%2e%2e/admin", "/test1/post/%2f..%2f",
   "/test1/post/1%5c"].every((h) => !allow(h)));

check("[nav] ★ 길이 상한을 넘는 주소는 거부",
  !allow("/test1/post/1?x=" + "a".repeat(2100)));

check("[nav] ★ 문자열이 아니거나 빈 값은 거부",
  [null, undefined, 1, {}, [], ""].every((h) => !allow(h)));

check("[nav] 알 수 없는 내부 경로(계약에 없는 패턴)는 거부",
  ["/test1/settings", "/test1/post/abc", "/test1/category/3/x"]
    .every((h) => !allow(h)));

/* --- 표 --------------------------------------------------- */

const registry = createSandboxNavRegistry(navWin);

check("[nav] ★ mint 는 주소를 바꾸지 않는다 (native 와 같은 DOM)",
  registry.mint("/test1/post/12") === "/test1/post/12");

check("[nav] ★ 허용된 주소만 표에 들어간다",
  (() => {
    registry.mint("/test1/category/3");
    registry.mint("https://evil.example/");
    registry.mint("javascript:alert(1)");
    registry.mint("/admin");
    return registry.size() === 2;
  })());

check("[nav] ★ 같은 주소를 두 번 등록해도 id 가 하나다",
  (() => {
    const before = registry.size();
    registry.mint("/test1/post/12");
    return registry.size() === before;
  })());

check("[nav] ★ resolve 는 표에 있는 id 만 route 를 돌려준다",
  (() => {
    const id = registry.idFor("/test1/post/12");
    const hit = registry.resolve(id);
    return hit !== null && hit.route.page === "post" && hit.route.id === 12 &&
      registry.resolve(id + 999) === null &&
      registry.resolve(0) === null &&
      registry.resolve(-1) === null &&
      registry.resolve(1.5) === null &&
      registry.resolve("1") === null;
  })());

check("[nav] ★ 표에 없는 주소는 id 가 없다 (눌러도 아무 일 없음)",
  registry.idFor("https://evil.example/") === 0 &&
  registry.idFor("/admin") === 0);

check("[nav] entries() 는 {id,href} 쌍만 내보낸다",
  registry.entries().every((e) =>
    Object.keys(e).sort().join(",") === "href,id" &&
    Number.isInteger(e.id) && typeof e.href === "string"));

check("[nav] ★ 프레임이 보낸 nav 표도 모양을 검사한다",
  isSandboxNavTable({ entries: [{ id: 1, href: "/test1/" }] }) === true &&
  isSandboxNavTable({ entries: [{ id: 0, href: "/x" }] }) === false &&
  isSandboxNavTable({ entries: [{ id: 1, href: 1 }] }) === false &&
  isSandboxNavTable({ entries: [{ id: 1, href: "/x", extra: 1 }] }) === true &&
  isSandboxNavTable({ entries: "x" }) === false &&
  isSandboxNavTable(null) === false);


/* =========================================================
   [msg2] SANDBOX-2 메시지
========================================================== */

console.log("\n[msg2] SANDBOX-2 메시지");

const navRules = {
  originAllowList: ["https://skin-frame.imory.me"],
  direction: "to-parent"
};

const frameRules2 = {
  originAllowList: ["https://imory.me"],
  direction: "to-frame"
};

const toParent2 = (type, payload) => ({
  origin: "https://skin-frame.imory.me",
  data: { imory: 1, type, seq: 1, payload }
});

const toFrame2 = (type, payload) => ({
  origin: "https://imory.me",
  data: { imory: 1, type, seq: 1, payload }
});

check("[msg2] ★ NAVIGATE 에는 href 키가 아예 없다 (주소를 못 보낸다)",
  JSON.stringify(protocol.SANDBOX_MESSAGE_SPEC.IMORY_NAVIGATE.keys) ===
  JSON.stringify(["contract", "renderSeq", "navId"]));

check("[msg2] 정상 NAVIGATE 는 통과한다",
  protocol.validateSandboxMessage(
    toParent2("IMORY_NAVIGATE", { contract: 1, renderSeq: 1, navId: 3 }),
    navRules
  ).ok === true);

check("[msg2] ★ NAVIGATE 에 href 를 끼워 보내면 거부된다",
  protocol.validateSandboxMessage(
    toParent2("IMORY_NAVIGATE",
      { contract: 1, renderSeq: 1, navId: 3, href: "/admin" }),
    navRules
  ).reason === "unknown-payload-key");

check("[msg2] ★ navId 가 1 이상 정수가 아니면 거부",
  [0, -1, 1.5, "3", null, undefined, NaN, 1e9]
    .every((v) => protocol.validateSandboxMessage(
      toParent2("IMORY_NAVIGATE", { contract: 1, renderSeq: 1, navId: v }),
      navRules
    ).reason === "bad-payload-value"));

check("[msg2] ★ 프레임은 NAVIGATE 를 받지 않는다 (방향)",
  protocol.validateSandboxMessage(
    toFrame2("IMORY_NAVIGATE", { contract: 1, renderSeq: 1, navId: 3 }),
    frameRules2
  ).reason === "wrong-direction");

const goodPage = {
  contract: 1,
  pageType: "category",
  renderSeq: 1,
  template: { html: "<div></div>", css: "" },
  data: {}
};

check("[msg2] RENDER_PAGE 는 home/category/post/banner/highlights 를 받는다",
  ["home", "category", "post", "banner", "highlights"].every((t) =>
    protocol.validateSandboxMessage(
      toFrame2("IMORY_RENDER_PAGE", { ...goodPage, pageType: t }),
      frameRules2
    ).ok === true));

check("[msg2] ★ RENDER_PAGE 도 계약에 없는 page type 은 거부",
  ["folder", "memos", "HOME", "", 1, null].every((t) =>
    protocol.validateSandboxMessage(
      toFrame2("IMORY_RENDER_PAGE", { ...goodPage, pageType: t }),
      frameRules2
    ).reason === "bad-payload-value"));

check("[msg2] ★ 옛 RENDER_HOME 은 여전히 home 만 받는다 (넓히지 않았다)",
  ["category", "post", "banner", "highlights"].every((t) =>
    protocol.validateSandboxMessage(
      toFrame2("IMORY_RENDER_HOME", { ...goodPage, pageType: t }),
      frameRules2
    ).reason === "bad-payload-value"));

/*
  ★ SANDBOX-3.1 — containerStyle 자리가 bodyCss 로 바뀌었다.
  본문의 inline style 은 프레임 CSP 에 막히므로, 부모가 검증해
  stylesheet 텍스트로 바꿔 보낸다.
*/

const goodBody = {
  contract: 1,
  renderSeq: 1,
  html: "<p>본문</p>",
  bodyCss: "#sandboxFrameRoot .imory-pb-root{font-size:15px}",
  isHtmlContent: false
};

check("[msg2] 정상 POST_BODY 는 통과한다",
  protocol.validateSandboxMessage(
    toFrame2("IMORY_POST_BODY", goodBody), frameRules2
  ).ok === true);

check("[msg2] ★ POST_BODY 의 타입이 어긋나면 거부",
  [{ html: 1 }, { bodyCss: null }, { isHtmlContent: "no" },
   { bodyCss: "a".repeat(protocol.SANDBOX_MAX_BODY_CSS_CHARS + 1) }]
    .every((patch) => protocol.validateSandboxMessage(
      toFrame2("IMORY_POST_BODY", { ...goodBody, ...patch }), frameRules2
    ).reason === "bad-payload-value"));

check("[msg2] ★ 옛 containerStyle 칸은 더 이상 받지 않는다 (모르는 키)",
  protocol.validateSandboxMessage(
    toFrame2("IMORY_POST_BODY", { ...goodBody, containerStyle: "color:red" }),
    frameRules2
  ).ok === false);

check("[msg2] ★ 부모는 POST_BODY 를 받지 않는다 (방향)",
  protocol.validateSandboxMessage(
    toParent2("IMORY_POST_BODY", goodBody), navRules
  ).reason === "wrong-direction");

check("[msg2] ★ RENDERED 는 다섯 page type 을 받는다 (RENDER_PAGE 와 짝)",
  ["home", "category", "post", "banner", "highlights"].every((t) =>
    protocol.validateSandboxMessage(
      toParent2("IMORY_RENDERED",
        { contract: 1, pageType: t, renderSeq: 1, height: 10 }),
      navRules
    ).ok === true));


/* =========================================================
   [authorjs] SANDBOX-5A — 저자 JS

   브라우저 없이 판정할 수 있는 것 넷:
     1. 언제 실행이 허용되는가 (config 의 두 번째 스위치)
     2. 메시지가 코드를 어떻게 받아들이는가 (protocol)
     3. SkinPackage 가 js 를 어떻게 보존하는가 (skin-template)
     4. 저자에게 주는 API 의 모양 (author-js 런타임)

   실제 실행·격리는 e2e(--only=authorjs)가 본다.
========================================================== */

console.log("\n[authorjs] 저자 JS — 실행 관문");

/* --- production: imory.me + test1 일 때만 ---------------- */

check("[authorjs] ★ production imory.me/test1 에서 켜진다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("https://imory.me/test1/"), "test1") === true);

check("[authorjs] ★ 같은 호스트의 다른 블로그에서는 꺼진다",
  ["other", "blog2", "admin", ""].every((slug) =>
    config.isSandboxSkinAuthorJsEnabled(
      fakeWindow("https://imory.me/" + slug + "/"), slug) === false));

check("[authorjs] ★ 다른 호스트에서는 켜지지 않는다",
  ["https://example.com/test1/", "https://skin-frame.imory.me/test1/"].every(
    (href) =>
      config.isSandboxSkinAuthorJsEnabled(fakeWindow(href), "test1") === false));

check("[authorjs] ★ production 은 쿼리로 켜지지 않는다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("https://imory.me/other/?sandboxSkinJs=1"), "other") === false);

check("[authorjs] ★ production 은 localStorage 로도 켜지지 않는다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("https://imory.me/other/", { "imory.sandboxSkinJs": "1" }),
    "other") === false);

check("[authorjs] slug 를 안 주면 주소 첫 칸에서 읽는다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("https://imory.me/test1/post/1")) === true &&
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("https://imory.me/other/post/1")) === false);

/* --- dev 호스트: sandbox opt-in 과 **별개** --------------- */

check("[authorjs] ★ dev 호스트에서도 저자 JS 전용 opt-in 이 필요하다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("http://localhost:8957/x?sandboxSkin=1")) === false);

check("[authorjs] dev 호스트 + ?sandboxSkinJs=1 이면 켜진다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("http://localhost:8957/x?sandboxSkinJs=1")) === true);

check("[authorjs] dev 호스트 + localStorage opt-in 도 받는다",
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("http://localhost:8957/x", { "imory.sandboxSkinJs": "1" })) === true);

check("[authorjs] ★ sandbox 플래그가 켜져도 저자 JS 는 따로다",
  config.isSandboxSkinEnabled(
    fakeWindow("http://localhost:8957/x?sandboxSkin=1")) === true &&
  config.isSandboxSkinAuthorJsEnabled(
    fakeWindow("http://localhost:8957/x?sandboxSkin=1")) === false);

/* --- 전역 kill switch ------------------------------------ */

/*
  배포되는 그 파일을 **그대로 읽어** 스위치만 false 로 바꾼 사본을
  평가한다. 값을 흉내내지 않고 실제 판정 코드를 돌린다.
*/

const configSource =
  fs.readFileSync(path.join(HERE, "skin-sandbox-config.js"), "utf8");

const killedConfig =
  new Function(
    /*
      ★ 저장소 파일은 CRLF 다. 줄바꿈을 먼저 고른 뒤 치환한다 —
      안 그러면 치환이 조용히 빗나가고, 이 테스트가 "끈 적 없는
      스위치"를 검사하게 된다.
    */
    configSource
      .replace(/\r\n/g, "\n")
      .replace(
        "var SANDBOX_SKIN_AUTHOR_JS_ENABLED =\n  true;",
        "var SANDBOX_SKIN_AUTHOR_JS_ENABLED =\n  false;"
      ) +
    "\nreturn { isSandboxSkinAuthorJsEnabled, isSandboxSkinEnabled, SANDBOX_SKIN_AUTHOR_JS_ENABLED };"
  )();

check("[authorjs] ★ kill switch 를 false 로 두면 어디서도 켜지지 않는다",
  killedConfig.SANDBOX_SKIN_AUTHOR_JS_ENABLED === false &&
  killedConfig.isSandboxSkinAuthorJsEnabled(
    fakeWindow("https://imory.me/test1/"), "test1") === false &&
  killedConfig.isSandboxSkinAuthorJsEnabled(
    fakeWindow("http://localhost:8957/x?sandboxSkinJs=1")) === false);

check("[authorjs] ★ kill switch 는 화면 렌더(sandbox 경로)까지 끄지는 않는다",
  killedConfig.isSandboxSkinEnabled(
    fakeWindow("https://imory.me/test1/")) === true);


/* --- 메시지 계약 ----------------------------------------- */

console.log("\n[authorjs] 저자 JS — 메시지");

const goodTemplate =
  { html: "<div></div>", css: "" };

check("[authorjs] js 없는 template 은 지금까지와 같다",
  protocol.isSandboxTemplate(goodTemplate) === true);

check("[authorjs] ★ js 는 선택이고 문자열이어야 한다",
  protocol.isSandboxTemplate({ ...goodTemplate, js: "var a=1;" }) === true &&
  protocol.isSandboxTemplate({ ...goodTemplate, js: "" }) === true &&
  [1, true, null, {}, []].every(
    (v) => protocol.isSandboxTemplate({ ...goodTemplate, js: v }) === false));

check("[authorjs] ★ 상한을 넘는 js 는 거부된다 (잘린 코드를 실행하지 않는다)",
  protocol.isSandboxTemplate({
    ...goodTemplate,
    js: "x".repeat(protocol.SANDBOX_MAX_AUTHOR_JS_CHARS)
  }) === true &&
  protocol.isSandboxTemplate({
    ...goodTemplate,
    js: "x".repeat(protocol.SANDBOX_MAX_AUTHOR_JS_CHARS + 1)
  }) === false);

check("[authorjs] ★ template 에 모르는 키는 여전히 거부된다",
  protocol.isSandboxTemplate({ ...goodTemplate, evil: "x" }) === false);

check("[authorjs] ★ RENDER_PAGE 가 js 를 실어 나른다",
  protocol.validateSandboxMessage(
    toFrame2("IMORY_RENDER_PAGE", {
      contract: 1,
      pageType: "home",
      renderSeq: 1,
      template: { html: "<div></div>", css: "", js: "var a=1;" },
      data: {}
    }),
    frameRules2
  ).payload.template.js === "var a=1;");

check("[authorjs] ★ SCRIPT_ERROR 에는 문장도 stack 도 없다 (코드 하나)",
  JSON.stringify(protocol.SANDBOX_MESSAGE_SPEC.IMORY_SCRIPT_ERROR.keys) ===
  JSON.stringify(["contract", "renderSeq", "code"]));

check("[authorjs] 정상 SCRIPT_ERROR 는 통과한다",
  protocol.SANDBOX_SCRIPT_ERROR_CODES.every((code) =>
    protocol.validateSandboxMessage(
      toParent2("IMORY_SCRIPT_ERROR", { contract: 1, renderSeq: 1, code }),
      navRules
    ).ok === true));

check("[authorjs] ★ 모르는 코드는 거부된다",
  protocol.validateSandboxMessage(
    toParent2("IMORY_SCRIPT_ERROR",
      { contract: 1, renderSeq: 1, code: "Error: /var/www/skin.js:3" }),
    navRules
  ).reason === "bad-payload-value");

check("[authorjs] ★ SCRIPT_ERROR 에 문장을 끼워 보내면 거부된다",
  protocol.validateSandboxMessage(
    toParent2("IMORY_SCRIPT_ERROR",
      { contract: 1, renderSeq: 1, code: "script-error", message: "x" }),
    navRules
  ).reason === "unknown-payload-key");

check("[authorjs] ★ 프레임은 SCRIPT_ERROR 를 받지 않는다 (방향)",
  protocol.validateSandboxMessage(
    toFrame2("IMORY_SCRIPT_ERROR", { contract: 1, renderSeq: 1, code: "script-error" }),
    frameRules2
  ).reason === "wrong-direction");


/* --- SkinPackage 보존 ------------------------------------ */

console.log("\n[authorjs] 저자 JS — SkinPackage");

const jsApi =
  new Function(
    templateSource +
    "\nreturn { resolveSkinTemplate, resolveSkinAuthorJs, isValidSkinAuthorJs," +
    " SKIN_PACKAGE_MAX_JS_CHARS };"
  )();

check("[authorjs] ★ 상한이 프로토콜과 같은 값이다",
  jsApi.SKIN_PACKAGE_MAX_JS_CHARS === protocol.SANDBOX_MAX_AUTHOR_JS_CHARS);

check("[authorjs] 빈 문자열은 허용이다 (JS 를 다 지운 상태도 값이다)",
  jsApi.isValidSkinAuthorJs("") === true);

check("[authorjs] 문자열이 아니거나 너무 길면 안 받는다",
  [1, null, undefined, {}, []].every((v) => jsApi.isValidSkinAuthorJs(v) === false) &&
  jsApi.isValidSkinAuthorJs("x".repeat(jsApi.SKIN_PACKAGE_MAX_JS_CHARS + 1)) === false);

check("[authorjs] ★ resolveSkinTemplate 이 js 를 모든 화면에 실어 준다",
  ["home", "category", "post"].every((pageType) =>
    jsApi.resolveSkinTemplate(
      {
        schemaVersion: 1,
        js: "var a=1;",
        css: "b{}",
        templates: {
          home: { html: "<i></i>" },
          category: { html: "<i></i>" },
          post: { html: "<i></i>" }
        }
      },
      pageType
    ).js === "var a=1;"));

check("[authorjs] ★ js 가 없는 스킨은 빈 문자열을 받는다 (아무 일도 없다)",
  jsApi.resolveSkinTemplate(
    { schemaVersion: 1, templates: { home: { html: "<i></i>" } } },
    "home"
  ).js === "");

check("[authorjs] ★ 이상한 js 값은 렌더 입력에 닿지 않는다",
  [1, null, {}, "x".repeat(jsApi.SKIN_PACKAGE_MAX_JS_CHARS + 1)].every((v) =>
    jsApi.resolveSkinAuthorJs({ js: v }) === ""));

check("[authorjs] legacy HOME-only 스킨도 js 를 받는다",
  jsApi.resolveSkinTemplate(
    { schemaVersion: 1, html: "<i></i>", css: "", js: "var a=1;" },
    "home"
  ).js === "var a=1;");


/* --- 저자에게 주는 API ------------------------------------ */

console.log("\n[authorjs] 저자 JS — API");

const authorRuntime =
  require(path.join(HERE, "skin-sandbox-author-js.js"));

const cleanups = [];

const api =
  authorRuntime.buildSandboxAuthorApi({
    pageType: "home",
    root: { tag: "root" },
    context: { site: { slug: "test1" }, nested: { a: [1, 2] } },
    navigate: (href) => href === "/test1/category/1",
    cleanups
  });

check("[authorjs] ★ API 계약 버전은 1 이고 키는 여섯뿐이다",
  api.version === 1 &&
  JSON.stringify(Object.keys(api).sort()) ===
  JSON.stringify(
    ["context", "navigate", "onCleanup", "pageType", "root", "version"]));

check("[authorjs] ★ API 자체가 동결돼 있다",
  Object.isFrozen(api) === true);

check("[authorjs] ★ context 는 복사본이고 깊이 동결돼 있다",
  Object.isFrozen(api.context) === true &&
  Object.isFrozen(api.context.site) === true &&
  Object.isFrozen(api.context.nested.a) === true &&
  api.context.site.slug === "test1");

check("[authorjs] ★ navigate 는 표에 있는 주소만 true 다",
  api.navigate("/test1/category/1") === true &&
  api.navigate("https://example.com/evil") === false &&
  api.navigate("") === false &&
  api.navigate(null) === false);

check("[authorjs] onCleanup 은 함수만 받고 상한이 있다",
  api.onCleanup(() => {}) === true &&
  api.onCleanup("not a function") === false);

check("[authorjs] ★ cleanup 은 한 번만 불리고, 하나가 던져도 나머지가 돈다",
  (() => {
    const list = [];
    const ran = [];
    list.push(() => { ran.push("a"); });
    list.push(() => { throw new Error("boom"); });
    list.push(() => { ran.push("c"); });
    const first = authorRuntime.runSandboxAuthorCleanups(list);
    const second = authorRuntime.runSandboxAuthorCleanups(list);
    return first === 2 && second === 0 &&
      JSON.stringify(ran) === JSON.stringify(["a", "c"]);
  })());

check("[authorjs] ★ 빈 코드는 실행 자체를 시도하지 않는다",
  authorRuntime.runSandboxAuthorScript({ code: "" }).code === "script-blocked" &&
  authorRuntime.runSandboxAuthorScript({ code: null }).code === "script-blocked");


/* =========================================================
   [inspect] SANDBOX-6A — Element Inspector 메시지

   무엇을 보는가: **프레임이 부모에게 무엇을 보낼 수 있는가**의
   상한. 이 절이 통과한다는 것은 "프레임이 아무 말이나 지어내도
   봉투 단계에서 걸린다"는 뜻이다. 그 다음 관문(그 식별자가 지금
   draft template 에 실제로 있는가)은 Studio 가 하고, e2e 가 본다.
========================================================== */

console.log("\n[inspect] Element Inspector 메시지 (SANDBOX-6A)");


function inspectEvent(type, payload, overrides = {}) {
  return {
    origin: "https://skin-frame.imory.me",
    source: FRAME_WIN,
    data: protocol.buildSandboxMessage(type, payload, 7),
    ...overrides
  };
}

const okRect = { left: 10, top: 20, width: 100, height: 40 };

const inspectOk = (type, payload) =>
  protocol.validateSandboxMessage(
    inspectEvent(type, payload), parentExpect
  ).ok === true;

const inspectReason = (type, payload) =>
  protocol.validateSandboxMessage(
    inspectEvent(type, payload), parentExpect
  ).reason;


check("[inspect] 정상 HOVER 를 통과시킨다",
  inspectOk("IMORY_INSPECT_HOVER",
    { contract: 1, renderSeq: 3, editId: "e0-1", rect: okRect }));

check("[inspect] ★ 빈 HOVER 는 '없어졌다'는 뜻이라 통과한다",
  inspectOk("IMORY_INSPECT_HOVER", { contract: 1, renderSeq: 3 }));

check("[inspect] 정상 SELECT 를 통과시킨다",
  inspectOk("IMORY_INSPECT_SELECT",
    { contract: 1, renderSeq: 3, editId: "e0-1", tagName: "h1", rect: okRect }));

check("[inspect] ★ 빈 SELECT 는 '아무것도 안 골랐다'라 통과한다",
  inspectOk("IMORY_INSPECT_SELECT", { contract: 1, renderSeq: 3 }));

check("[inspect] ★ 식별자 모양이 깨지면 거부된다",
  inspectReason("IMORY_INSPECT_SELECT",
    { contract: 1, renderSeq: 3, editId: "e0 1\"]", tagName: "h1", rect: okRect })
    === "bad-payload-value",
  "선택자 탈출을 노린 값");

check("[inspect] ★ 식별자만 있고 좌표가 없으면 거부된다",
  inspectReason("IMORY_INSPECT_SELECT",
    { contract: 1, renderSeq: 3, editId: "e0-1" }) === "bad-payload-value");

check("[inspect] ★ 태그 이름이 태그 모양이 아니면 거부된다",
  inspectReason("IMORY_INSPECT_SELECT",
    { contract: 1, renderSeq: 3, editId: "e0-1", tagName: "H1 onload=x", rect: okRect })
    === "bad-payload-value");

check("[inspect] ★ 좌표가 NaN/Infinity 면 거부된다",
  inspectReason("IMORY_INSPECT_HOVER",
    { contract: 1, renderSeq: 3, editId: "e0-1",
      rect: { left: NaN, top: 0, width: 1, height: 1 } }) === "bad-payload-value" &&
  inspectReason("IMORY_INSPECT_HOVER",
    { contract: 1, renderSeq: 3, editId: "e0-1",
      rect: { left: 0, top: 0, width: Infinity, height: 1 } }) === "bad-payload-value");

check("[inspect] ★ 좌표가 범위를 벗어나면 거부된다",
  inspectReason("IMORY_INSPECT_HOVER",
    { contract: 1, renderSeq: 3, editId: "e0-1",
      rect: { left: 0, top: 0, width: 999999, height: 1 } }) === "bad-payload-value");

check("[inspect] ★ 음수 크기는 거부된다",
  inspectReason("IMORY_INSPECT_HOVER",
    { contract: 1, renderSeq: 3, editId: "e0-1",
      rect: { left: 0, top: 0, width: -5, height: 1 } }) === "bad-payload-value");

check("[inspect] ★ rect 에 모르는 키가 섞이면 거부된다",
  inspectReason("IMORY_INSPECT_HOVER",
    { contract: 1, renderSeq: 3, editId: "e0-1",
      rect: { left: 0, top: 0, width: 1, height: 1, html: "<b>" } })
    === "bad-payload-value",
  "사각형 봉투로 다른 값을 실어 나를 수 없다");

check("[inspect] ★ payload 에 모르는 키가 있으면 거부된다",
  (() => {
    const event = inspectEvent("IMORY_INSPECT_SELECT",
      { contract: 1, renderSeq: 3, editId: "e0-1", tagName: "h1", rect: okRect });
    event.data.payload.innerHTML = "<script>";
    return protocol.validateSandboxMessage(event, parentExpect).reason
      === "unknown-payload-key";
  })(),
  "innerHTML 을 끼워 보낼 수 없다");

check("[inspect] 정상 RECTS 를 통과시킨다",
  inspectOk("IMORY_INSPECT_RECTS", {
    contract: 1,
    renderSeq: 3,
    hover: { editId: "e0-1", rect: okRect },
    selected: { editId: "e0-2", tagName: "img", rect: okRect }
  }));

check("[inspect] ★ RECTS 의 hover 칸에는 tagName 이 들어갈 수 없다",
  inspectReason("IMORY_INSPECT_RECTS", {
    contract: 1,
    renderSeq: 3,
    hover: { editId: "e0-1", tagName: "h1", rect: okRect }
  }) === "bad-payload-value");

check("[inspect] ★ 빈 RECTS 도 통과한다 (둘 다 없어진 상태)",
  inspectOk("IMORY_INSPECT_RECTS", { contract: 1, renderSeq: 3 }));

check("[inspect] 정상 INSPECT_ERROR 를 통과시킨다",
  inspectOk("IMORY_INSPECT_ERROR",
    { contract: 1, renderSeq: 3, code: "not-inspectable" }));

check("[inspect] ★ 모르는 오류 코드는 거부된다",
  inspectReason("IMORY_INSPECT_ERROR",
    { contract: 1, renderSeq: 3, code: "stack: at foo (/skin/...)" })
    === "bad-payload-value",
  "문장도 경로도 올라갈 수 없다");

check("[inspect] ★ renderSeq 가 없으면 거부된다",
  inspectReason("IMORY_INSPECT_SELECT",
    { contract: 1, editId: "e0-1", tagName: "h1", rect: okRect })
    === "bad-payload-value",
  "어느 화면의 선택인지 말하지 않는 메시지는 받지 않는다");


/*
  방향 — 프레임은 부모용 메시지를 받지 않고, 부모는 프레임용
  메시지를 받지 않는다. 위조 경로 하나를 이 한 칸이 닫는다.
*/

const frameExpect = {
  originAllowList: ["https://imory.me"],
  source: PARENT_WIN,
  direction: "to-frame"
};

check("[inspect] ★ 부모는 INSPECT_MODE 를 받지 않는다 (방향)",
  inspectReason("IMORY_INSPECT_MODE",
    { contract: 1, renderSeq: 3, enabled: true }) === "wrong-direction");

check("[inspect] ★ 프레임은 INSPECT_SELECT 를 받지 않는다 (방향)",
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: protocol.buildSandboxMessage("IMORY_INSPECT_SELECT",
        { contract: 1, renderSeq: 3, editId: "e0-1", tagName: "h1", rect: okRect }, 2)
    },
    frameExpect
  ).reason === "wrong-direction",
  "저자 JS 가 자기 프레임에 선택을 심을 수 없다");

check("[inspect] 정상 MODE / PICK 를 프레임이 받는다",
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: protocol.buildSandboxMessage("IMORY_INSPECT_MODE",
        { contract: 1, renderSeq: 3, enabled: true }, 2)
    },
    frameExpect
  ).ok === true &&
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: protocol.buildSandboxMessage("IMORY_INSPECT_PICK",
        { contract: 1, renderSeq: 3, editId: "e0-1" }, 3)
    },
    frameExpect
  ).ok === true);

check("[inspect] ★ editId 없는 PICK 은 '해제'라 통과한다",
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: protocol.buildSandboxMessage("IMORY_INSPECT_PICK",
        { contract: 1, renderSeq: 3 }, 4)
    },
    frameExpect
  ).ok === true);

check("[inspect] ★ enabled 가 boolean 이 아니면 거부된다",
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: protocol.buildSandboxMessage("IMORY_INSPECT_MODE",
        { contract: 1, renderSeq: 3, enabled: "1" }, 5)
    },
    frameExpect
  ).reason === "bad-payload-value");


/*
  ★ 식별자 형태가 세 파일에서 같은가. 하나라도 느슨해지면 그 틈으로만
  값이 흐른다(skin-sanitize.js ↔ studio-inspector-model.js ↔ 이 프로토콜).
*/

check("[inspect] ★ 식별자 형태가 sanitizer 와 같다",
  (() => {
    const good = ["e0", "e0-1-2", "a".repeat(64)];
    const bad = ["0e", "", "a".repeat(65), "e0 1", 'e"]', "e0/1"];
    return good.every(protocol.isSandboxInspectEditId) &&
      bad.every(v => !protocol.isSandboxInspectEditId(v));
  })());


/* =========================================================
   [parity] SANDBOX-SELECT-PARITY-1 — 직접 조작 메시지

   무엇을 보는가: 새 일곱 메시지가 **어디까지만** 실을 수 있는가.
   프레임 → 부모는 식별자 · 태그 · 사각형 · 문구 · 좌표뿐이고,
   부모 → 프레임은 식별자 · 순번 · 참/거짓 · 문구 · 비율뿐이다.
   selector · HTML · CSS 문자열을 끼우면 봉투 단계에서 떨어진다.
========================================================== */

console.log("\n[parity] 직접 조작 메시지 (SANDBOX-SELECT-PARITY-1)");

const parityToFrame = (type, payload) =>
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: protocol.buildSandboxMessage(type, payload, 11)
    },
    frameExpect
  );

const okCandidate = { editId: "e0-1", tagName: "h1", rect: okRect };

check("[parity] 정상 CANDIDATES 를 부모가 받는다",
  inspectOk("IMORY_INSPECT_CANDIDATES", {
    contract: 1, renderSeq: 3, point: { x: 10, y: 20 },
    candidates: [okCandidate, { ...okCandidate, editId: "e0-2", current: true }, { ...okCandidate, editId: "e0", outer: true }]
  }));

check("[parity] ★ 후보에 class/selector/html 을 끼우면 거부된다",
  ["className", "selector", "html", "path"].every((key) =>
    inspectReason("IMORY_INSPECT_CANDIDATES", {
      contract: 1, renderSeq: 3, point: { x: 1, y: 1 },
      candidates: [{ ...okCandidate, [key]: "x" }]
    }) === "bad-payload-value"),
  "후보 한 칸은 식별자 · 태그 · 사각형 · outer · current 뿐이다");

check("[parity] ★ 후보가 없거나 일곱을 넘으면 거부된다",
  inspectReason("IMORY_INSPECT_CANDIDATES",
    { contract: 1, renderSeq: 3, point: { x: 1, y: 1 }, candidates: [] }) === "bad-payload-value" &&
  inspectReason("IMORY_INSPECT_CANDIDATES", {
    contract: 1, renderSeq: 3, point: { x: 1, y: 1 },
    candidates: Array.from({ length: 8 }, (_, i) => ({ ...okCandidate, editId: "e" + i }))
  }) === "bad-payload-value");

check("[parity] ★ SELECT 의 metrics 는 숫자 넷뿐이다",
  inspectOk("IMORY_INSPECT_SELECT", {
    contract: 1, renderSeq: 3, editId: "e0-1", tagName: "div", rect: okRect,
    metrics: { width: 100, height: 40, parentWidth: 600, parentHeight: 300 }
  }) &&
  inspectReason("IMORY_INSPECT_SELECT", {
    contract: 1, renderSeq: 3, editId: "e0-1", tagName: "img", rect: okRect,
    metrics: { width: 100, height: 40, parentWidth: 600, parentHeight: 300, naturalWidth: 9 }
  }) === "bad-payload-value" &&
  inspectReason("IMORY_INSPECT_SELECT", {
    contract: 1, renderSeq: 3, editId: "e0-1", tagName: "div", rect: okRect,
    metrics: { width: 100, height: 40, parentWidth: -1, parentHeight: 300 }
  }) === "bad-payload-value");

check("[parity] 정상 TEXT 를 부모가 받는다 (네 단계)",
  ["begin", "input", "commit", "cancel"].every((phase) =>
    inspectOk("IMORY_INSPECT_TEXT", { contract: 1, renderSeq: 3, phase, editId: "e0-1", text: "새 문구\n둘째 줄" })));

check("[parity] ★ TEXT 는 모르는 단계 · 상한 넘는 문구 · 식별자 없음을 거부한다",
  inspectReason("IMORY_INSPECT_TEXT", { contract: 1, renderSeq: 3, phase: "html", editId: "e0-1", text: "x" }) === "bad-payload-value" &&
  inspectReason("IMORY_INSPECT_TEXT", {
    contract: 1, renderSeq: 3, phase: "commit", editId: "e0-1",
    text: "x".repeat(protocol.SANDBOX_INSPECT_MAX_TEXT_CHARS + 1)
  }) === "bad-payload-value" &&
  inspectReason("IMORY_INSPECT_TEXT", { contract: 1, renderSeq: 3, phase: "commit", text: "x" }) === "bad-payload-value");

check("[parity] 정상 DRAG 를 부모가 받고, NaN 좌표는 거부한다",
  inspectOk("IMORY_INSPECT_DRAG", { contract: 1, renderSeq: 3, phase: "move", x: 12.5, y: 40 }) &&
  inspectReason("IMORY_INSPECT_DRAG", { contract: 1, renderSeq: 3, phase: "move", x: NaN, y: 40 }) === "bad-payload-value");

check("[parity] ★ 부모는 CHOOSE/PARENT/CAPS/PREVIEW 를 받지 않는다 (방향)",
  ["IMORY_INSPECT_CHOOSE", "IMORY_INSPECT_PARENT", "IMORY_INSPECT_CAPS", "IMORY_INSPECT_PREVIEW"].every((type) =>
    inspectReason(type, { contract: 1, renderSeq: 3 }) === "wrong-direction"),
  "저자 JS 가 부모에게 지시를 보낼 수 없다");

check("[parity] ★ 프레임은 CANDIDATES/TEXT/DRAG 를 받지 않는다 (방향)",
  ["IMORY_INSPECT_CANDIDATES", "IMORY_INSPECT_TEXT", "IMORY_INSPECT_DRAG"].every((type) =>
    parityToFrame(type, { contract: 1, renderSeq: 3 }).reason === "wrong-direction"));

check("[parity] 정상 CHOOSE / PARENT / CAPS 를 프레임이 받는다",
  parityToFrame("IMORY_INSPECT_CHOOSE", { contract: 1, renderSeq: 3, index: 2 }).ok === true &&
  parityToFrame("IMORY_INSPECT_PARENT", { contract: 1, renderSeq: 3 }).ok === true &&
  parityToFrame("IMORY_INSPECT_CAPS", { contract: 1, renderSeq: 3, editId: "e0-1", movable: true, textEditable: false }).ok === true &&
  parityToFrame("IMORY_INSPECT_CAPS", { contract: 1, renderSeq: 3, movable: false, textEditable: false }).ok === true);

check("[parity] ★ CHOOSE 순번이 정수 범위가 아니면 거부된다",
  [-1, 7, 1.5, "0"].every((index) =>
    parityToFrame("IMORY_INSPECT_CHOOSE", { contract: 1, renderSeq: 3, index }).reason === "bad-payload-value"));

check("[parity] ★ CAPS 에 selector 를 끼울 수 없다",
  parityToFrame("IMORY_INSPECT_CAPS", { contract: 1, renderSeq: 3, editId: '[x]"', movable: true, textEditable: true }).reason === "bad-payload-value" &&
  parityToFrame("IMORY_INSPECT_CAPS", { contract: 1, renderSeq: 3, movable: "yes", textEditable: true }).reason === "bad-payload-value");

check("[parity] 정상 PREVIEW (글자 / 좌표 / 해제) 를 프레임이 받는다",
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, editId: "e0-1", text: "임시" }).ok === true &&
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, editId: "e0-1", layoutX: 0.25, layoutY: 1 }).ok === true &&
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, clear: true }).ok === true);

check("[parity] ★ PREVIEW 는 CSS 를 받지 않는다 (모르는 키 · 범위 밖 비율 · 빈 지시)",
  /* buildSandboxMessage 는 모르는 키를 싣지도 않는다 — 봉투를 직접 만든다 */
  protocol.validateSandboxMessage(
    {
      origin: "https://imory.me",
      source: PARENT_WIN,
      data: {
        imory: 1, type: "IMORY_INSPECT_PREVIEW", seq: 12,
        payload: { contract: 1, renderSeq: 3, editId: "e0-1", css: "position:fixed" }
      }
    },
    frameExpect
  ).reason === "unknown-payload-key" &&
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, editId: "e0-1", layoutX: 1.5 }).reason === "bad-payload-value" &&
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, editId: "e0-1", layoutX: "0.5" }).reason === "bad-payload-value" &&
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, editId: "e0-1" }).reason === "bad-payload-value" &&
  parityToFrame("IMORY_INSPECT_PREVIEW", { contract: 1, renderSeq: 3, clear: true, text: "x" }).reason === "bad-payload-value");

check("[parity] ★ 프레임의 직접 조작 파일은 studio/* 를 로드하지 않고 순위 규칙을 복제하지 않는다",
  (() => {
    const src = fs.readFileSync(path.join(ROOT, "skin", "sandbox", "skin-sandbox-inspect-direct.js"), "utf8");
    return !/import\s|importScripts|\/studio\//.test(src) &&
      /pickInspectableAtPoint\(/.test(src) &&
      !/function\s+inspectorSelectionRank/.test(src) &&
      !/innerHTML|outerHTML|insertAdjacentHTML/.test(src);
  })(),
  "순위는 skin/skin-inspect-target.js 하나 · HTML 을 쓰지 않는다");

check("[parity] ★ frame.html · allowlist 가 새 파일을 inspector 보다 먼저 싣는다",
  (() => {
    const html = fs.readFileSync(path.join(ROOT, "skin", "sandbox", "frame.html"), "utf8");
    const a = html.indexOf("/skin/sandbox/skin-sandbox-inspect-direct.js");
    const b = html.indexOf("/skin/sandbox/skin-sandbox-inspect.js");
    return a > 0 && b > a;
  })());


/* =========================================================
   결과
========================================================== */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log("실패:\n  - " + failures.join("\n  - "));
process.exit(failed ? 1 : 0);
