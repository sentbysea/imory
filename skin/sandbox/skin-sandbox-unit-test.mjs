/* =========================================================
   SKIN SANDBOX — 단위 테스트 (SANDBOX-0)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §D-2 / §D-4

   무엇을 보는가
   -------------
   브라우저 없이 판정할 수 있는 순수 함수 셋:
     - skin/sandbox/skin-sandbox-config.js     기능 플래그 · origin 해석
     - skin/sandbox/skin-sandbox-protocol.js   메시지 검증
     - core/lib/skin-sandbox-server.js         호스트 분기 · CSP · nonce

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

import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const require = createRequire(import.meta.url);

const config = require(path.join(HERE, "skin-sandbox-config.js"));
const protocol = require(path.join(HERE, "skin-sandbox-protocol.js"));

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
   [flag] 기능 플래그 — 기본 OFF, URL만으로는 안 켜진다
========================================================== */

console.log("\n[flag] 기능 플래그");

check("[flag] production + opt-in 없음 -> OFF",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/")) === false);

check("[flag] ★ production + ?sandboxSkin=1 -> 여전히 OFF",
  config.isSandboxSkinEnabled(
    fakeWindow("https://imory.me/?sandboxSkin=1")
  ) === false,
  "공개 방문자가 주소만으로 켤 수 없다");

check("[flag] ★ production + localStorage opt-in -> 여전히 OFF",
  config.isSandboxSkinEnabled(
    fakeWindow("https://imory.me/", { "imory.sandboxSkin": "1" })
  ) === false);

check("[flag] localhost + opt-in 없음 -> OFF (기본값)",
  config.isSandboxSkinEnabled(
    fakeWindow("http://localhost:8957/skin/skin-sandbox-test.html")
  ) === false);

check("[flag] localhost + ?sandboxSkin=1 -> ON",
  config.isSandboxSkinEnabled(
    fakeWindow("http://localhost:8957/?sandboxSkin=1")
  ) === true);

check("[flag] localhost + localStorage opt-in -> ON",
  config.isSandboxSkinEnabled(
    fakeWindow("http://127.0.0.1:8957/", { "imory.sandboxSkin": "1" })
  ) === true);

check("[flag] SANDBOX_SKIN_ENABLED_HOSTS 가 비어 있다 (배포 기본값)",
  Array.isArray(config.SANDBOX_SKIN_ENABLED_HOSTS) &&
  config.SANDBOX_SKIN_ENABLED_HOSTS.length === 0);

check("[flag] localStorage 가 던져도 OFF 로 떨어진다",
  config.isSandboxSkinEnabled({
    location: { hostname: "localhost", search: "", origin: "http://localhost:1" },
    get localStorage() { throw new Error("blocked"); }
  }) === false);


/* =========================================================
   [origin] frame origin 해석
========================================================== */

console.log("\n[origin] frame origin");

check("[origin] production frame origin 이 배포된 커스텀 도메인이다",
  config.resolveSandboxSkinFrameOrigin(fakeWindow("https://imory.me/"))
  === "https://skin-frame.imory.me");

check("[origin] ★ 그래도 imory.me 에서 플래그는 여전히 OFF 다",
  config.isSandboxSkinEnabled(fakeWindow("https://imory.me/?sandboxSkin=1")) === false,
  "origin 상수가 채워진 것은 스위치가 아니다");

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

check("[msg] 이번 라운드가 아는 type 은 정확히 둘이다",
  Object.keys(protocol.SANDBOX_MESSAGE_SPEC).length === 2,
  Object.keys(protocol.SANDBOX_MESSAGE_SPEC).join(", "));


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

check("[path] frame.html 은 sandbox origin 에서 허용",
  server.isSandboxAllowedPath("/skin/sandbox/frame.html") === true);

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

check("[path] skin-render.js 는 아직 허용되지 않는다 (SANDBOX-1)",
  server.isSandboxAllowedPath("/skin/skin-render.js") === false);

check("[path] isSandboxFramePath 는 정확히 그 경로만",
  server.isSandboxFramePath("/skin/sandbox/frame.html") === true &&
  server.isSandboxFramePath("/skin/sandbox/frame.html/") === false);


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
check("[csp] script-src 는 'self' + nonce (unsafe-inline 없음)",
  hasDirective("script-src 'self' 'nonce-N0NCE'") &&
  csp.indexOf("unsafe-inline") === -1 &&
  csp.indexOf("unsafe-eval") === -1);
check("[csp] style-src 는 nonce 만",
  hasDirective("style-src 'nonce-N0NCE'"));
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

check("[frame] ★ supabase / 인증 / studio 코드를 로드하지 않는다",
  !/supabase|auth\/|admin\/|studio\/|skin-context/.test(frameCode));

check("[frame] 인라인 블록이 속성 없이 적혀 있다 (nonce 주입 전제)",
  frameCode.indexOf("<style>") !== -1 &&
  (frameCode.match(/<script>/g) || []).length >= 2);


/* =========================================================
   결과
========================================================== */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log("실패:\n  - " + failures.join("\n  - "));
process.exit(failed ? 1 : 0);
