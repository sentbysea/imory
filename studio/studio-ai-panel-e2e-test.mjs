/* =========================================================
   PHASE AI-2 — Studio AI OpenAI 실제 연결 E2E

   ★ 실제 OpenAI를 부르지 않는다(유료 호출 0회). api.openai.com
   으로 나가는 fetch는 이 파일이 전부 가로채고, 가로채지 못한
   openai.com 요청은 예외로 실패시킨다. 두 겹으로 검증한다:

   1) 서버 방어선 (브라우저 없이)
      functions/api/skin-ai.js의 onRequest()를 그대로 import해서
      method / body / instruction / skinPackage / 인증 / allowlist /
      OpenAI 요청 body / Structured Output 파싱 / 오류 처리를 직접
      호출로 확인한다. Supabase 토큰 검증 fetch와 OpenAI Responses
      API fetch만 stub한다.

   2) 브라우저 경로 (Playwright)
      studio/studio-lifecycle-scenario.html?scenario=x 를 실제
      URL로 띄우고(= studio/index.html과 같은 스크립트 구성,
      supabase만 in-memory mock), /api/skin-ai 요청을 가로채
      **진짜 functions/api/skin-ai.js의 onRequest()** 에 넘겨
      응답을 만든다. 그래서 아래 경로 전체가 저장소의 실제
      코드로 돌아간다:

        drawer -> /api/skin-ai -> (mock OpenAI) -> Structured Output
        -> validateSkinPackageImport() -> applyAiSkinPackage()
        -> applyImportedSkinPackage() -> Preview 재렌더 -> 되돌리기

   ★ 실행 방법
     node studio/studio-ai-panel-e2e-test.mjs
     node studio/studio-ai-panel-e2e-test.mjs --browser=webkit
     node studio/studio-ai-panel-e2e-test.mjs --only=undo
     node studio/studio-ai-panel-e2e-test.mjs --only=server   (브라우저 없이 서버만)

   --only= 뒤에 쓸 수 있는 이름:
     server / happy / undo / empty / invalid / duplicate / stale / reload /
     mobile / save-undo
========================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = 8937;
const SCENARIO_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=x`;

/* =========================================================
   PHASE AI-2.1 — Save/Undo 회귀 (섹션 I)

   scenario x는 save_skin_draft_version/publish_skin RPC를 아예
   mock하지 않는다(rpcHandlers: {}) — 그래서 "AI 적용 -> Save ->
   Undo"라는 조합을 태울 수 없었고, 그것이 이 버그가 기존 63개
   검사를 그대로 통과한 이유다. scenario v는 두 RPC를 모두 mock
   하고 current_published_version_id가 null로 시작하므로 Save와
   Publish를 실제로 끝까지 돌릴 수 있다(studio/studio-lifecycle-
   scenario.html의 Scenario V 주석 참고).
========================================================== */
const SCENARIO_V_URL = `http://localhost:${PORT}/studio/studio-lifecycle-scenario.html?scenario=v`;

/* Scenario V fixture(draft-v1)의 css. 이 문자열이 보이면 "AI 이전
   버전", MOCK_CSS_MARKER_V가 보이면 "AI 버전"이다. */
const SCENARIO_V_INITIAL_CSS_MARK = ".scenario-v-home";

const MOCK_CSS_MARKER_V = "/* imory-ai save-undo fixture */";

/*
  이 섹션만 진짜 functions/api/skin-ai.js를 거치지 않고 고정 응답을
  쓴다(aiRouteMode = "fixed-package", 위 "invalid" 모드와 같은 방식).

  이유: mock 모델(buildMockStructuredOutput)은 "요청에 실려 온
  SkinPackage의 templates를 그대로 되돌려주는" 역할이라
  pkg.templates.home.html을 읽는다. Scenario V는 templates가 없는
  HOME-only legacy Skin이고(그 legacy 성격은 studio-publish-test.html
  의 "HOME-only legacy Skin도 발행 가능" 검증이 쓰고 있어 바꾸면
  안 된다), 서버도 그런 요청의 templates를 {}로 정리해 보내므로
  mock 모델이 읽을 templates가 없다.

  이 섹션이 검증하는 것은 모델/서버 경로가 아니라 **응답을 적용한
  뒤의 Studio 상태 기계**(dirty / draft version / Save·Publish 가능
  여부)다. 모델·서버 경로는 A~H 섹션이 scenario x로 이미 덮는다.
*/
const AI_RESULT_PACKAGE_V = {
  schemaVersion: 1,
  templates: {
    home: { html: '<div class="ai-v-home"><h1 data-imory-bind="site.title"></h1></div>' },
    category: { html: '<div class="ai-v-category"></div>' },
    post: { html: '<div class="ai-v-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: `.ai-v-home { color: crimson; }\n${MOCK_CSS_MARKER_V}`,
  imageSlots: [],
  regions: [],
  metadata: { title: "AI result for scenario V" }
};

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BROWSER = argOf("browser", "chromium");
const ONLY = argOf("only", "");

function shouldRun(name) {
  return !ONLY || ONLY === name;
}

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? `\n        ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================================================
   1) 서버 방어선 — functions/api/skin-ai.js 직접 호출
========================================================== */

const { onRequest: skinAiOnRequest } =
  await import(new URL("../functions/api/skin-ai.js", import.meta.url).href);

const VALID_SKIN_PACKAGE = {
  schemaVersion: 1,
  templates: {
    home: { html: '<div class="t-home"></div>' },
    category: { html: '<div class="t-category"></div>' },
    post: { html: '<div class="t-post"><div data-imory-region="post-body"></div></div>' }
  },
  css: ".t-home { color: teal; }",
  imageSlots: [{ name: "profile", label: "프로필 사진" }],
  regions: [],
  metadata: { title: "Fixture" }
};

const VALID_SKIN_PACKAGE_WITH_BANNER = {
  ...VALID_SKIN_PACKAGE,
  templates: {
    ...VALID_SKIN_PACKAGE.templates,
    banner: { html: '<div class="t-banner"></div>' }
  }
};

/*
  서버가 정상 동작하는 기준 env. 실제 키가 아니다 — 아래 OpenAI
  mock은 값을 확인하지 않고, 진짜 api.openai.com으로는 이 파일의
  어떤 경로도 나가지 않는다(그렇게 나가려는 시도는 아래 fetch
  래퍼가 예외로 막는다).
*/
const TEST_ENV = {
  OPENAI_API_KEY: "test-openai-key-not-real",
  SKIN_AI_MODEL: "gpt-5.6-terra",
  SKIN_AI_ALLOWED_USER_IDS: " user-x , user-y "
};

/*
  Supabase /auth/v1/user 와 OpenAI Responses API만 가로챈다 —
  나머지 fetch는 원래대로. 이 stub이 "유효한 토큰"으로 인정하는
  값은 VALID_TOKEN 하나뿐이다.
*/
const VALID_TOKEN = "valid-access-token";
const realFetch = globalThis.fetch;

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

/* mock 모델이 CSS 끝에 붙이는 표식 — "요청이 실제로 서버와 모델
   응답 파싱 경로를 돌아 working draft까지 왔다"를 브라우저 테스트가
   눈으로 확인하기 위한 것이다(AI-1의 stub marker 자리를 대신한다). */
const MOCK_CSS_MARKER = "/* imory-ai mock (PHASE AI-2) */";
const MOCK_SUMMARY = "배경을 조금 밝게 바꿨습니다.";

/* OpenAI raw 오류 본문에 섞어 두는 문자열. 브라우저로 새어나가면
   안 되는 것의 대역이다. */
const UPSTREAM_LEAK_CANARY = "sk-DO-NOT-LEAK-THIS-UPSTREAM-DETAIL";

let openAiMode = "ok";
let openAiCallCount = 0;
let openAiLastRequest = null;

function resetOpenAiMock(mode) {
  openAiMode = mode || "ok";
  openAiCallCount = 0;
  openAiLastRequest = null;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/* 서버가 프롬프트에 실어 보낸 현재 SkinPackage를 다시 꺼낸다 —
   mock 모델이 "받은 것을 조금 고쳐 돌려주는" 역할을 하기 위해서다. */
function readPackageFromPrompt(body) {
  const text =
    body && body.input && body.input[0] && body.input[0].content &&
    body.input[0].content[0] && body.input[0].content[0].text;
  const match = /```json\n([\s\S]*?)\n```/.exec(text || "");
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function buildMockStructuredOutput(pkg, options) {
  const bannerNull = !!(options && options.bannerNull);
  const templates = {
    home: { html: pkg.templates.home.html },
    category: { html: pkg.templates.category.html },
    post: { html: pkg.templates.post.html },
    banner:
      (!bannerNull && pkg.templates.banner)
        ? { html: pkg.templates.banner.html }
        : null
  };
  return {
    summary: MOCK_SUMMARY,
    templates,
    css:
      String(pkg.css || "").split(MOCK_CSS_MARKER).join("").trimEnd() +
      "\n" + MOCK_CSS_MARKER
  };
}

function buildMockCompletedResponse(structured, model) {
  return {
    id: "resp_mock_1",
    object: "response",
    status: "completed",
    model,
    output: [
      { id: "rs_1", type: "reasoning", summary: [] },
      {
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          { type: "output_text", text: JSON.stringify(structured), annotations: [] }
        ]
      }
    ],
    usage: { input_tokens: 4210, output_tokens: 1830, total_tokens: 6040 }
  };
}

async function handleOpenAiMock(init) {

  openAiCallCount += 1;

  let body = null;
  try { body = JSON.parse((init && init.body) || "{}"); } catch { body = null; }

  openAiLastRequest = {
    headers: (init && init.headers) || {},
    hasSignal: !!(init && init.signal),
    body
  };

  if (openAiMode === "abort") {
    /*
      90초를 벽시계로 기다리지 않고 abort 처리 경로만 정확히
      태운다 — AbortController가 실제로 fetch에 연결돼 있는지는
      hasSignal로 확인하고, 90초라는 값 자체는 소스 상수로
      확인한다(H2).
    */
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    throw err;
  }

  if (openAiMode === "401") {
    return jsonResponse(401, { error: { message: "Incorrect API key provided: " + UPSTREAM_LEAK_CANARY } });
  }

  if (openAiMode === "429") {
    return jsonResponse(429, { error: { message: "Rate limit reached. " + UPSTREAM_LEAK_CANARY } });
  }

  if (openAiMode === "500") {
    return jsonResponse(500, { error: { message: "server_error " + UPSTREAM_LEAK_CANARY } });
  }

  if (openAiMode === "nonjson") {
    return new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } });
  }

  if (openAiMode === "incomplete") {
    return jsonResponse(200, {
      id: "resp_mock_1",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      model: body && body.model,
      output: [{ id: "rs_1", type: "reasoning", summary: [] }],
      usage: { input_tokens: 4210, output_tokens: 24000 }
    });
  }

  if (openAiMode === "refusal") {
    return jsonResponse(200, {
      id: "resp_mock_1",
      status: "completed",
      model: body && body.model,
      output: [{
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "refusal", refusal: "I am sorry, I cannot help with that." }]
      }],
      usage: { input_tokens: 10, output_tokens: 10 }
    });
  }

  if (openAiMode === "malformed") {
    return jsonResponse(200, {
      id: "resp_mock_1",
      status: "completed",
      model: body && body.model,
      output: [{
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "여기 스킨을 고쳤습니다! (JSON이 아님)", annotations: [] }]
      }]
    });
  }

  if (openAiMode === "missing-template") {
    return jsonResponse(200, buildMockCompletedResponse(
      { summary: "x", templates: { home: { html: "<div></div>" } }, css: "" },
      body && body.model
    ));
  }

  if (openAiMode === "no-output") {
    return jsonResponse(200, { id: "resp_mock_1", status: "completed", output: [] });
  }

  const pkg = readPackageFromPrompt(body);

  if (!pkg) {
    return jsonResponse(200, { id: "resp_mock_1", status: "completed", output: [] });
  }

  if (openAiMode === "long-summary") {
    const structured = buildMockStructuredOutput(pkg);
    structured.summary = "가".repeat(400);
    return jsonResponse(200, buildMockCompletedResponse(structured, body && body.model));
  }

  return jsonResponse(200, buildMockCompletedResponse(
    buildMockStructuredOutput(pkg, { bannerNull: openAiMode === "banner-null" }),
    body && body.model
  ));

}

/*
  브라우저 경로에서는 scenario 문서의 supabase mock이 발급하는
  "mock-access-token-<userId>"가 올라온다 — 그것도 유효한 토큰으로
  인정한다. "bogus" 같은 그 외 값은 401이다.
*/
function isStubbedValidToken(auth) {
  return auth === `Bearer ${VALID_TOKEN}` || /^Bearer mock-access-token-/.test(auth);
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : String(input.url || input);

  if (url.includes("/auth/v1/user")) {
    const auth = (init && init.headers && (init.headers.authorization || init.headers.Authorization)) || "";
    if (isStubbedValidToken(auth)) {
      return new Response(JSON.stringify({ id: "user-x" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ message: "invalid" }), { status: 401 });
  }

  if (url.startsWith(OPENAI_RESPONSES_ENDPOINT)) {
    return handleOpenAiMock(init);
  }

  if (url.startsWith("https://api.openai.com")) {
    throw new Error("이 테스트는 OpenAI를 실제로 부르지 않는다: " + url);
  }

  return realFetch(input, init);
};

function makeSkinAiRequest(options) {
  const {
    method = "POST",
    body,
    token = VALID_TOKEN,
    headers = {}
  } = options || {};
  const finalHeaders = { "content-type": "application/json", ...headers };
  if (token) finalHeaders.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/skin-ai", {
    method,
    headers: finalHeaders,
    body: method === "GET" || method === "HEAD" ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
  });
}

async function callSkinAi(options) {
  const env = (options && options.env !== undefined) ? options.env : TEST_ENV;
  const response = await skinAiOnRequest({ request: makeSkinAiRequest(options), env });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  return { status: response.status, payload, response };
}

async function runServerChecks() {

  /* ---- 요청 형식 / 인증 (PHASE AI-1에서 이어짐) ---- */

  {
    const r = await callSkinAi({ method: "GET" });
    record(
      "S1. POST 외 method는 405로 거부한다",
      r.status === 405 && r.payload && r.payload.ok === false,
      `status=${r.status}`
    );
  }

  {
    const r = await callSkinAi({ body: "{not json" });
    record(
      "S2. JSON parsing 실패는 400",
      r.status === 400 && r.payload.ok === false,
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }

  {
    const r = await callSkinAi({ body: { instruction: "   ", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "S3. instruction이 비어 있으면 400",
      r.status === 400 && r.payload.ok === false,
      `status=${r.status}`
    );
  }

  {
    const r = await callSkinAi({ body: { instruction: "x".repeat(2001), skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "S4. instruction 2,000자 초과는 400",
      r.status === 400 && r.payload.ok === false,
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }

  {
    const r = await callSkinAi({ body: { instruction: "글씨를 키워줘" } });
    record(
      "S5. skinPackage가 없으면 400",
      r.status === 400 && r.payload.ok === false,
      `status=${r.status}`
    );
  }

  {
    const big = { instruction: "a", skinPackage: { ...VALID_SKIN_PACKAGE, css: "/*" + "x".repeat(300 * 1024) + "*/" } };
    const r = await callSkinAi({ body: big });
    record(
      "S6. 과대 본문(256KB 초과)은 413",
      r.status === 413 && r.payload.ok === false,
      `status=${r.status}`
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE }, token: null });
    record(
      "S7. Authorization 헤더가 없으면 401 — OpenAI 호출 0회",
      r.status === 401 && r.payload.ok === false && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE }, token: "bogus" });
    record(
      "S8. Supabase가 거부하는 토큰이면 401 — OpenAI 호출 0회",
      r.status === 401 && r.payload.ok === false && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }


  /* ---- A. 정상 Structured Output ---- */

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "배경을 조금 밝게 해줘", skinPackage: VALID_SKIN_PACKAGE_WITH_BANNER }
    });
    const pkg = r.payload && r.payload.skinPackage;

    record(
      "A1. 정상 응답 -> 200 { ok, skinPackage, summary } (모델이 만든 css 변경이 반영된다)",
      r.status === 200 &&
        r.payload.ok === true &&
        openAiCallCount === 1 &&
        !!pkg &&
        pkg.css.includes(MOCK_CSS_MARKER) &&
        pkg.css.startsWith(VALID_SKIN_PACKAGE.css) &&
        r.payload.summary === MOCK_SUMMARY,
      `status=${r.status} summary=${JSON.stringify(r.payload && r.payload.summary)}`
    );

    record(
      "A2. schemaVersion / imageSlots / regions / metadata는 요청의 현재 값이 그대로 보존된다(모델이 만들지 않는다)",
      pkg.schemaVersion === 1 &&
        JSON.stringify(pkg.imageSlots) === JSON.stringify(VALID_SKIN_PACKAGE.imageSlots) &&
        JSON.stringify(pkg.regions) === JSON.stringify(VALID_SKIN_PACKAGE.regions) &&
        JSON.stringify(pkg.metadata) === JSON.stringify(VALID_SKIN_PACKAGE.metadata),
      JSON.stringify({ imageSlots: pkg.imageSlots, metadata: pkg.metadata })
    );

    record(
      "A3. templates 4종이 모두 돌아온다(banner 포함, post-body region 유지)",
      typeof pkg.templates.home.html === "string" &&
        typeof pkg.templates.category.html === "string" &&
        pkg.templates.post.html.includes('data-imory-region="post-body"') &&
        pkg.templates.banner.html === VALID_SKIN_PACKAGE_WITH_BANNER.templates.banner.html,
      JSON.stringify(Object.keys(pkg.templates))
    );

    const body = openAiLastRequest.body;

    record(
      "A4. OpenAI 요청은 Responses API 형식이다 — model / reasoning.effort / max_output_tokens / json_schema strict",
      body.model === "gpt-5.6-terra" &&
        body.reasoning.effort === "low" &&
        body.max_output_tokens === 24000 &&
        body.text.format.type === "json_schema" &&
        body.text.format.strict === true &&
        body.text.format.schema.required.join(",") === "summary,templates,css" &&
        body.store === false &&
        !("messages" in body),
      JSON.stringify({
        model: body.model,
        effort: body.reasoning && body.reasoning.effort,
        maxOut: body.max_output_tokens,
        format: body.text && body.text.format && body.text.format.type
      })
    );

    const wire = JSON.stringify(body);

    record(
      "A5. 프롬프트에는 instruction과 현재 SkinPackage만 들어간다 — Supabase access token은 OpenAI로 가지 않는다",
      wire.includes("배경을 조금 밝게 해줘") &&
        wire.includes(".t-home") &&
        !wire.includes(VALID_TOKEN) &&
        !wire.includes("mock-access-token") &&
        !wire.toLowerCase().includes("supabase") &&
        String(openAiLastRequest.headers.authorization || "") === "Bearer test-openai-key-not-real",
      `authHeaderIsOpenAiKey=${String(openAiLastRequest.headers.authorization || "").startsWith("Bearer test-openai-key")}`
    );

    record(
      "A6. Structured Output schema가 templates.{home,category,post,banner}.html과 css를 강제한다",
      (() => {
        const schema = body.text.format.schema;
        const t = schema.properties.templates;
        return t.required.join(",") === "home,category,post,banner" &&
          t.additionalProperties === false &&
          t.properties.home.required[0] === "html" &&
          t.properties.home.additionalProperties === false &&
          t.properties.post.properties.html.type === "string" &&
          Array.isArray(t.properties.banner.type) &&
          t.properties.banner.type.includes("null") &&
          schema.properties.css.type === "string" &&
          schema.additionalProperties === false;
      })(),
      JSON.stringify(body.text.format.schema.properties.templates.required)
    );
  }

  {
    resetOpenAiMock("banner-null");
    const r = await callSkinAi({
      body: { instruction: "HOME 글씨만 키워줘", skinPackage: VALID_SKIN_PACKAGE_WITH_BANNER }
    });
    record(
      "A7. 모델이 banner를 null로 돌려줘도 기존 banner template이 사라지지 않는다",
      r.status === 200 &&
        r.payload.skinPackage.templates.banner.html === VALID_SKIN_PACKAGE_WITH_BANNER.templates.banner.html,
      JSON.stringify(r.payload.skinPackage.templates.banner)
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "A8. banner가 없던 SkinPackage의 결과에는 banner 키가 생기지 않는다",
      r.status === 200 && !("banner" in r.payload.skinPackage.templates),
      JSON.stringify(Object.keys(r.payload.skinPackage.templates))
    );
  }

  {
    resetOpenAiMock("long-summary");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "A9. summary가 길면 100자로 잘라서 내려준다",
      r.status === 200 && r.payload.summary.length === 100,
      `length=${r.payload && r.payload.summary && r.payload.summary.length}`
    );
  }


  /* ---- B. API key 없음 ---- */

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE },
      env: { SKIN_AI_ALLOWED_USER_IDS: "user-x" }
    });
    record(
      "B1. OPENAI_API_KEY가 없으면 OpenAI를 부르지 않고 503으로 실패한다",
      r.status === 503 && r.payload.ok === false && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount} message=${r.payload && r.payload.message}`
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE },
      env: { SKIN_AI_ALLOWED_USER_IDS: "user-x", OPENAI_API_KEY: "   " }
    });
    record(
      "B2. 공백뿐인 OPENAI_API_KEY도 미설정으로 취급한다",
      r.status === 503 && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }


  /* ---- C/D. allowlist ---- */

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE },
      env: { OPENAI_API_KEY: "test-openai-key-not-real" }
    });
    record(
      "C1. allowlist 환경변수가 없으면 아무도 통과하지 못한다(fail closed) — 403, OpenAI 호출 0회",
      r.status === 403 && r.payload.ok === false && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE },
      env: { OPENAI_API_KEY: "test-openai-key-not-real", SKIN_AI_ALLOWED_USER_IDS: "  ,  , " }
    });
    record(
      "C2. 값이 구분자뿐인 allowlist도 빈 목록으로 본다 — 403",
      r.status === 403 && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE },
      env: { OPENAI_API_KEY: "test-openai-key-not-real", SKIN_AI_ALLOWED_USER_IDS: "someone-else,another" }
    });
    record(
      "D1. 목록에 없는 사용자는 403 — OpenAI 호출 0회",
      r.status === 403 && r.payload.ok === false && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE },
      env: { OPENAI_API_KEY: "test-openai-key-not-real", SKIN_AI_ALLOWED_USER_IDS: " user-x , user-y " }
    });
    record(
      "D2. 공백이 섞인 목록도 trim해서 인식한다 — 허용 사용자는 통과",
      r.status === 200 && openAiCallCount === 1,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }


  /* ---- E. OpenAI 오류 상태 ---- */

  for (const [mode, expectedStatus, label] of [
    ["401", 502, "OpenAI 401(키 문제)"],
    ["429", 429, "OpenAI 429(요청 과다)"],
    ["500", 502, "OpenAI 500(서버 오류)"]
  ]) {
    resetOpenAiMock(mode);
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    const text = JSON.stringify(r.payload);
    record(
      `E. ${label}은 안전한 메시지로 바뀌고 raw 응답이 새지 않는다`,
      r.status === expectedStatus &&
        r.payload.ok === false &&
        typeof r.payload.message === "string" &&
        r.payload.message.length < 120 &&
        !text.includes(UPSTREAM_LEAK_CANARY) &&
        !("skinPackage" in r.payload),
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }

  {
    resetOpenAiMock("nonjson");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "E4. OpenAI 응답이 JSON이 아니면 실패한다",
      r.status === 502 && r.payload.ok === false && !("skinPackage" in r.payload),
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }


  /* ---- F. incomplete / refusal ---- */

  {
    resetOpenAiMock("incomplete");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "F1. status=incomplete(max_output_tokens로 잘림)를 성공으로 처리하지 않는다",
      r.status === 502 && r.payload.ok === false && !("skinPackage" in r.payload),
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }

  {
    resetOpenAiMock("refusal");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "F2. refusal 응답은 실패로 처리한다",
      r.status === 502 && r.payload.ok === false && !("skinPackage" in r.payload),
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }


  /* ---- G. 형식이 깨진 Structured Output ---- */

  for (const [mode, label] of [
    ["malformed", "output_text가 JSON이 아님"],
    ["missing-template", "templates.post가 없음"],
    ["no-output", "output 배열이 비어 있음"]
  ]) {
    resetOpenAiMock(mode);
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      `G. 형식이 깨진 응답(${label})은 실패한다`,
      r.status === 502 && r.payload.ok === false && !("skinPackage" in r.payload),
      `status=${r.status} message=${r.payload && r.payload.message}`
    );
  }


  /* ---- H. timeout / abort ---- */

  {
    resetOpenAiMock("abort");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    record(
      "H1. OpenAI 요청에 AbortController가 연결돼 있고, abort는 504 + 시간초과 메시지가 된다",
      r.status === 504 &&
        r.payload.ok === false &&
        openAiLastRequest.hasSignal === true &&
        r.payload.message.includes("오래"),
      `status=${r.status} hasSignal=${openAiLastRequest && openAiLastRequest.hasSignal} message=${r.payload && r.payload.message}`
    );
  }

  {
    /* 90초라는 값 자체는 벽시계로 재지 않고 소스 상수로 확인한다 */
    const source = fs.readFileSync(path.join(ROOT, "functions", "api", "skin-ai.js"), "utf8");
    record(
      "H2. 서버 timeout 상수가 90초로 선언돼 있다",
      /SKIN_AI_MODEL_TIMEOUT_MS\s*=\s*90 \* 1000/.test(source),
      "SKIN_AI_MODEL_TIMEOUT_MS"
    );
  }


  /* ---- Z. 실제 유료 호출을 하지 않았다는 확인 ---- */

  record(
    "Z1. 이 테스트는 api.openai.com으로 실제 요청을 보내지 않는다(전부 mock, 실제 호스트 요청은 예외로 차단)",
    globalThis.fetch !== realFetch,
    "REAL OPENAI CALL: NOT EXECUTED"
  );

}


/* =========================================================
   2) 브라우저 경로 — playwright
========================================================== */

async function loadPlaywright(browserName) {
  const candidates = [];
  const npxCache = path.join(process.env.LOCALAPPDATA || os.homedir(), "npm-cache", "_npx");
  if (fs.existsSync(npxCache)) {
    for (const dir of fs.readdirSync(npxCache)) {
      candidates.push(path.join(npxCache, dir, "node_modules"));
    }
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
  }
  candidates.push(path.join(ROOT, "node_modules"));

  const tried = [];
  for (const base of candidates) {
    const entry = path.join(base, "playwright", "package.json");
    if (!fs.existsSync(entry)) continue;
    let mod;
    try {
      mod = createRequire(entry)("playwright");
    } catch {
      continue;
    }
    if (!mod[browserName]) continue;
    try {
      const probe = await mod[browserName].launch();
      await probe.close();
      return mod;
    } catch (err) {
      tried.push(String(err.message).split("\n")[0]);
    }
  }

  throw new Error(
    `playwright ${browserName}을(를) 실행할 수 없습니다.\n` +
    `시도: ${tried.join(" | ") || "설치 없음"}\n` +
    "`npx playwright install " + browserName + "`을 먼저 실행하세요."
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const abs = path.join(ROOT, rel);

    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(abs)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(abs).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}


/* =========================================================
   /api/skin-ai 가로채기

   기본값은 "진짜 functions/api/skin-ai.js를 돌린다"이다 — 테스트마다
   aiRouteMode만 바꿔서 지연/잘못된 응답을 만든다.
========================================================== */

let aiRouteMode = "real";
let aiRouteRequestCount = 0;
let aiRouteRelease = null;

async function handleAiRoute(route) {

  aiRouteRequestCount += 1;

  const request = route.request();
  const bodyText = request.postData() || "";
  const headers = await request.allHeaders();

  if (aiRouteMode === "invalid") {
    /*
      validator 실패 경로 — templates.category/post가 없는
      SkinPackage. 서버는 이런 응답을 만들지 않으므로 여기서만 손으로
      만든다("잘못된 응답이 와도 draft가 안 바뀐다"를 보기 위한
      의도적 주입).
    */
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        ok: true,
        summary: "이상한 응답",
        skinPackage: { schemaVersion: 1, templates: { home: { html: "<div class=\"broken\"></div>" } }, css: "" }
      })
    });
    return;
  }

  if (aiRouteMode === "fixed-package") {
    /*
      섹션 I(save-undo) 전용 — 고정된 유효 SkinPackage를 그대로
      돌려준다. 왜 실제 서버를 거치지 않는지는 파일 상단
      AI_RESULT_PACKAGE_V 주석 참고.
    */
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        ok: true,
        summary: MOCK_SUMMARY,
        skinPackage: AI_RESULT_PACKAGE_V
      })
    });
    return;
  }

  if (aiRouteMode === "hold") {
    await new Promise(resolve => { aiRouteRelease = resolve; });
  }

  const response = await skinAiOnRequest({
    request: new Request("http://localhost/api/skin-ai", {
      method: request.method(),
      headers: {
        "content-type": "application/json",
        authorization: headers.authorization || headers.Authorization || ""
      },
      body: bodyText
    }),
    env: TEST_ENV
  });

  await route.fulfill({
    status: response.status,
    contentType: "application/json; charset=utf-8",
    body: await response.text()
  });

}


/* =========================================================
   공통 페이지 helper
========================================================== */

/*
  이번 작업과 무관한, scenario 하네스에 원래 있던 console error 하나:
  이 문서는 studio/images/skin-image-library.js를 로드하지 않아
  mountStudioPreview()의 probe가 항상 실패한다(production 코드가
  catch로 잡아 false로 폴백하므로 동작에는 문제 없다). "새 script를
  넣은 뒤 새 오류가 생겼는가"를 재는 데 방해가 되므로 여기서만
  걸러낸다.
*/
const PRE_EXISTING_CONSOLE_ERROR_PATTERN = /image library probe failed/;

const consoleErrors = [];

async function openStudio(context, url = SCENARIO_URL) {

  const page = await context.newPage();

  page.on("console", msg => {
    if (args.includes("--debug")) console.log(`[console:${msg.type()}] ${msg.text()}`);
    if (msg.type() !== "error") return;
    if (PRE_EXISTING_CONSOLE_ERROR_PATTERN.test(msg.text())) return;
    consoleErrors.push(`${page.url()} :: ${msg.text()}`);
  });
  page.on("pageerror", err => consoleErrors.push(`${page.url()} :: ${err.message}`));

  await page.route("**/api/skin-ai", handleAiRoute);

  await page.goto(url, { waitUntil: "load" });

  /*
    scenario 문서는 supabaseClient mock에 인위적 지연을 두었으므로
    working draft가 실제로 채워질 때까지 기다린다.
  */
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await page.waitForSelector("#studioPreviewFrame");

  return page;

}

/*
  Save/Publish는 평소 화면 밖으로 접혀 있는 상단 dock 안에 있다 —
  handle을 눌러야만 열린다(studio-preview.js: #studioTopDockHandle
  클릭만이 #studioTopDockZone의 .is-open을 토글한다). 실제 사용자와
  같은 경로로 열어 두고 클릭한다.
*/
async function openTopDock(page) {
  const isOpen = await page.evaluate(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open")
  );
  if (!isOpen) await page.click("#studioTopDockHandle");
  await page.waitForFunction(
    () => document.getElementById("studioTopDockZone").classList.contains("is-open")
  );
}

async function openDrawer(page) {
  const isOpen = await page.evaluate(() => document.getElementById("studioAiDrawer").classList.contains("is-open"));
  if (!isOpen) await page.click("#studioAiHandle");
  await page.waitForFunction(() => document.getElementById("studioAiDrawer").classList.contains("is-open"));
}

function workingState(page) {
  return page.evaluate(() => window.getStudioAiWorkingState({ includePackage: true }));
}

function panelState(page) {
  return page.evaluate(() => window.getStudioAiPanelDebugState());
}

async function saveButtonDisabled(page) {
  return page.evaluate(() => document.getElementById("studioSaveButton").disabled);
}

async function previewHas(page, selector, timeoutMs = 5000) {
  try {
    await page.waitForFunction(
      (sel) => {
        const frame = document.getElementById("studioPreviewFrame");
        const doc = frame && frame.contentDocument;
        return !!(doc && doc.querySelector(sel));
      },
      selector,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}


/* =========================================================
   A. 정상
========================================================== */

async function runHappy(context) {

  const page = await openStudio(context);
  await openDrawer(page);

  const before = await workingState(page);

  /*
    Preview를 CATEGORY로 옮겨 둔다 — AI 적용 후 실제로 다시
    그려졌는지(현재 계약대로 HOME으로 복귀하는지)를 눈으로 잴 수
    있게 하기 위함이다.
  */
  await page.evaluate(() => window.__testHooks.simulateNavigate("/scenario-x/category/301"));
  const onCategory = await previewHas(page, ".scenario-x-category");

  await page.fill("#studioAiDrawerInput", "글씨를 조금 키워줘");

  const sendDisabled = await page.evaluate(() => document.getElementById("studioAiDrawerSend").disabled);

  await page.click("#studioAiDrawerSend");

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === false &&
          window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const after = await workingState(page);
  const panel = await panelState(page);
  const backOnHome = await previewHas(page, ".scenario-x-home");

  record(
    "A1. instruction을 입력하면 Send가 활성화된다",
    sendDisabled === false
  );

  record(
    "A2. 전송 -> OpenAI(mock) 성공 -> validator 통과 -> working draft에 반영된다(css marker)",
    after.skinPackage.css.includes(MOCK_CSS_MARKER) &&
      !before.skinPackage.css.includes(MOCK_CSS_MARKER),
    `before.css=${JSON.stringify(before.skinPackage.css)} after.css=${JSON.stringify(after.skinPackage.css)}`
  );

  record(
    "A3. HTML template은 그대로 보존된다",
    after.skinPackage.templates.home.html === before.skinPackage.templates.home.html &&
      after.skinPackage.templates.post.html === before.skinPackage.templates.post.html
  );

  record(
    "A4. dirty=true / Save 버튼 활성",
    before.isDirty === false && after.isDirty === true && (await saveButtonDisabled(page)) === false,
    `before.isDirty=${before.isDirty} after.isDirty=${after.isDirty}`
  );

  record(
    "A5. Preview가 실제로 다시 그려진다(CATEGORY -> 적용 -> HOME 복귀, 기존 Import와 동일 계약)",
    onCategory === true && backOnHome === true,
    `onCategory=${onCategory} backOnHome=${backOnHome}`
  );

  record(
    "A6. drawer에 요약과 되돌리기가 표시된다",
    panel.statusText.includes(MOCK_SUMMARY) && panel.undoVisible === true,
    `statusText=${JSON.stringify(panel.statusText)}`
  );

  record(
    "A7. 자동 저장하지 않는다(save_skin_draft_version RPC 호출 0회)",
    (await page.evaluate(() => (window.__savedDraftCalls || []).length)) === 0
  );

  await page.close();

}


/* =========================================================
   B. 되돌리기
========================================================== */

async function runUndo(context) {

  const page = await openStudio(context);
  await openDrawer(page);

  const before = await workingState(page);

  await page.fill("#studioAiDrawerInput", "조금 더 조용하게");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(() => window.getStudioAiPanelDebugState().hasUndo === true, null, { timeout: 10000 });

  const applied = await workingState(page);

  await page.click("#studioAiDrawerUndo");
  await page.waitForFunction(() => window.getStudioAiPanelDebugState().hasUndo === false, null, { timeout: 5000 });

  const restored = await workingState(page);

  record(
    "B1. 되돌리기 후 SkinPackage가 AI 적용 직전과 정확히 같다",
    JSON.stringify(restored.skinPackage) === JSON.stringify(before.skinPackage),
    `restored.css=${JSON.stringify(restored.skinPackage.css)}`
  );

  record(
    "B2. dirty 값도 복원된다 (false -> true -> false)",
    before.isDirty === false && applied.isDirty === true && restored.isDirty === false,
    `before=${before.isDirty} applied=${applied.isDirty} restored=${restored.isDirty}`
  );

  record(
    "B3. dirty가 false로 돌아가면 Save 버튼도 다시 비활성화된다",
    (await saveButtonDisabled(page)) === true
  );

  record(
    "B4. 되돌린 뒤에는 되돌리기 버튼이 사라진다(1단계 undo)",
    (await panelState(page)).undoVisible === false
  );

  await page.close();

}


/* =========================================================
   C. 빈 입력
========================================================== */

async function runEmpty(context) {

  const page = await openStudio(context);
  await openDrawer(page);

  const emptyDisabled = await page.evaluate(() => document.getElementById("studioAiDrawerSend").disabled);

  await page.fill("#studioAiDrawerInput", "   ");
  const blankDisabled = await page.evaluate(() => document.getElementById("studioAiDrawerSend").disabled);

  await page.fill("#studioAiDrawerInput", "무언가");
  const filledDisabled = await page.evaluate(() => document.getElementById("studioAiDrawerSend").disabled);

  await page.fill("#studioAiDrawerInput", "");
  const clearedDisabled = await page.evaluate(() => document.getElementById("studioAiDrawerSend").disabled);

  /* Enter로도 빈 입력이 전송되지 않는다 */
  const requestsBefore = aiRouteRequestCount;
  await page.focus("#studioAiDrawerInput");
  await page.keyboard.press("Enter");
  await sleep(400);

  record(
    "C1. 빈 입력/공백만 있는 입력에서는 Send가 비활성",
    emptyDisabled === true && blankDisabled === true && clearedDisabled === true && filledDisabled === false,
    `empty=${emptyDisabled} blank=${blankDisabled} filled=${filledDisabled} cleared=${clearedDisabled}`
  );

  record(
    "C2. 빈 입력에서 Enter를 눌러도 요청이 나가지 않는다",
    aiRouteRequestCount === requestsBefore
  );

  await page.close();

}


/* =========================================================
   D. validator 실패
========================================================== */

async function runInvalid(context) {

  aiRouteMode = "invalid";

  const page = await openStudio(context);
  await openDrawer(page);

  const before = await workingState(page);

  await page.fill("#studioAiDrawerInput", "이상한 응답을 받아본다");
  await page.click("#studioAiDrawerSend");

  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === false,
    null,
    { timeout: 10000 }
  );

  const after = await workingState(page);
  const panel = await panelState(page);
  const toastVisible = await page.evaluate(() => {
    const toast = document.getElementById("studioToast");
    return { hidden: toast.hidden, text: toast.textContent, isError: toast.classList.contains("studio-toast--error") };
  });
  const stillHome = await previewHas(page, ".scenario-x-home");

  record(
    "D1. validator가 거부하면 working draft가 전혀 바뀌지 않는다",
    JSON.stringify(after.skinPackage) === JSON.stringify(before.skinPackage)
  );

  record(
    "D2. dirty도 그대로다",
    before.isDirty === false && after.isDirty === false && (await saveButtonDisabled(page)) === true
  );

  record(
    "D3. Preview도 그대로다",
    stillHome === true && (await previewHas(page, ".broken", 800)) === false
  );

  record(
    "D4. 오류 toast + drawer 상태가 표시된다",
    toastVisible.hidden === false && toastVisible.isError === true && panel.statusText.includes("고치지 못했습니다"),
    `toast=${JSON.stringify(toastVisible.text)} status=${JSON.stringify(panel.statusText)}`
  );

  record(
    "D5. 되돌리기는 제공되지 않는다(적용된 게 없으므로)",
    panel.undoVisible === false && panel.hasUndo === false
  );

  await page.close();
  aiRouteMode = "real";

}


/* =========================================================
   E. 중복 요청 (single-flight)
========================================================== */

async function runDuplicate(context) {

  aiRouteMode = "hold";
  aiRouteRelease = null;

  const page = await openStudio(context);
  await openDrawer(page);

  const requestsBefore = aiRouteRequestCount;

  await page.fill("#studioAiDrawerInput", "천천히 오는 응답");
  await page.click("#studioAiDrawerSend");

  await page.waitForFunction(() => window.getStudioAiPanelDebugState().pending === true, null, { timeout: 5000 });

  const sendLabelDuringRequest = await page.evaluate(() => {
    const button = document.getElementById("studioAiDrawerSend");
    return { text: button.textContent.trim(), ariaLabel: button.getAttribute("aria-label") };
  });

  const statusDuringRequest = (await panelState(page)).statusText;

  const overlayHiddenDuringRequest = await page.evaluate(
    () => document.getElementById("studioPreviewOverlay").hidden
  );

  /* PHASE AI-2.1 — 로딩 표시는 drawer 안에서만 강화됐다(점 세 개 +
     실제 경과시간). 진행률(%)은 만들지 않는다. 점/경과시간은
     aria-hidden이라 aria-live="polite" 상태 줄이 1초마다 다시
     낭독되지 않는다(studio/ai/studio-ai-panel.js 주석 참고). */
  const loadingDuringRequest = await page.evaluate(() => {
    const dots = document.querySelector(".studio-ai-drawer-dots");
    const elapsed = document.querySelector(".studio-ai-drawer-elapsed");
    return {
      dotsShown: !!dots && !dots.hidden,
      dotCount: dots ? dots.children.length : 0,
      dotsAriaHidden: !!dots && dots.getAttribute("aria-hidden") === "true",
      elapsedAriaHidden: !!elapsed && elapsed.getAttribute("aria-hidden") === "true"
    };
  });

  /* 요청 중 Enter로 재전송을 시도해도 새 요청이 나가면 안 된다 */
  await page.fill("#studioAiDrawerInput", "또 보내볼까");
  await page.focus("#studioAiDrawerInput");
  await page.keyboard.press("Enter");
  await sleep(500);

  const requestsDuring = aiRouteRequestCount;

  await page.waitForFunction(() => true);
  if (aiRouteRelease) aiRouteRelease();
  aiRouteMode = "real";

  await page.waitForFunction(() => window.getStudioAiPanelDebugState().pending === false, null, { timeout: 10000 });

  record(
    "E1. 요청 중에는 새 요청이 나가지 않는다(single-flight)",
    requestsDuring - requestsBefore === 1,
    `requests=${requestsDuring - requestsBefore}`
  );

  record(
    "E2. 요청 중 Send 버튼은 중단 버튼으로 바뀐다",
    sendLabelDuringRequest.ariaLabel === "중단",
    JSON.stringify(sendLabelDuringRequest)
  );

  record(
    "E3. 요청 중 Preview 전체를 덮는 overlay는 뜨지 않고 drawer 안 문구만 바뀐다",
    overlayHiddenDuringRequest === true && statusDuringRequest.includes("스킨을 수정하고 있어요"),
    `overlayHidden=${overlayHiddenDuringRequest} status=${JSON.stringify(statusDuringRequest)}`
  );

  record(
    "E3-2. 요청 중 drawer 안에 점 세 개가 뜨고, 점/경과시간은 aria-hidden이다",
    loadingDuringRequest.dotsShown &&
      loadingDuringRequest.dotCount === 3 &&
      loadingDuringRequest.dotsAriaHidden &&
      loadingDuringRequest.elapsedAriaHidden,
    JSON.stringify(loadingDuringRequest)
  );

  record(
    "E4. 요청 중에도 textarea는 수정할 수 있다",
    (await page.evaluate(() => document.getElementById("studioAiDrawerInput").disabled)) === false
  );

  await page.close();

}


/* =========================================================
   F. 늦은 응답 (stale)
========================================================== */

async function runStale(context) {

  aiRouteMode = "hold";
  aiRouteRelease = null;

  const page = await openStudio(context);
  await openDrawer(page);

  await page.fill("#studioAiDrawerInput", "응답이 늦게 온다");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(() => window.getStudioAiPanelDebugState().pending === true, null, { timeout: 5000 });

  /*
    응답이 도착하기 전에 사용자가 Code Apply를 한 것과 동일한
    상태 변경을 만든다(applyWorkingSkinChanges는 code-editor.js가
    Apply 시 부르는 바로 그 함수다).
  */
  await page.evaluate(() => {
    applyWorkingSkinChanges(
      "home",
      '<div class="scenario-x-home user-edit"><h1 data-imory-bind="site.title"></h1></div>',
      ".user-edit { color: navy; }",
      null
    );
  });

  const afterUserEdit = await workingState(page);

  if (aiRouteRelease) aiRouteRelease();
  aiRouteMode = "real";

  await page.waitForFunction(() => window.getStudioAiPanelDebugState().pending === false, null, { timeout: 10000 });

  const afterLateResponse = await workingState(page);
  const panel = await panelState(page);
  const toast = await page.evaluate(() => {
    const el = document.getElementById("studioToast");
    return { hidden: el.hidden, text: el.textContent, isError: el.classList.contains("studio-toast--error") };
  });

  record(
    "F1. 늦게 도착한 AI 응답이 그 사이의 사용자 변경을 덮어쓰지 않는다",
    JSON.stringify(afterLateResponse.skinPackage) === JSON.stringify(afterUserEdit.skinPackage) &&
      !afterLateResponse.skinPackage.css.includes(MOCK_CSS_MARKER),
    `css=${JSON.stringify(afterLateResponse.skinPackage.css)}`
  );

  record(
    "F2. 폐기 시 toast만 보여주고 되돌리기는 제공하지 않는다",
    toast.hidden === false && toast.isError === true && panel.hasUndo === false && panel.undoVisible === false,
    `toast=${JSON.stringify(toast.text)}`
  );

  await page.close();

}


/* =========================================================
   G. reload
========================================================== */

async function runReload(context) {

  const errorsBefore = consoleErrors.length;

  const page = await openStudio(context);
  await page.reload({ waitUntil: "load" });

  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );

  await openDrawer(page);
  await page.fill("#studioAiDrawerInput", "새로고침 후 다시 보내기");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(() => window.getStudioAiPanelDebugState().hasUndo === true, null, { timeout: 10000 });

  const newErrors = consoleErrors.slice(errorsBefore);

  record(
    "G1. 새 script를 포함한 뒤에도 새로고침에서 console error가 없다",
    newErrors.length === 0,
    newErrors.join("\n        ")
  );

  record(
    "G2. 새로고침 이후에도 AI 전송이 정상 동작한다",
    (await workingState(page)).skinPackage.css.includes(MOCK_CSS_MARKER)
  );

  await page.close();

}


/* =========================================================
   H. 모바일 drawer
========================================================== */

async function runMobile(browser) {

  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await openStudio(context);
  await openDrawer(page);
  await page.fill("#studioAiDrawerInput", "모바일에서 보내기");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(() => window.getStudioAiPanelDebugState().hasUndo === true, null, { timeout: 10000 });

  const box = await page.evaluate(() => {
    const dock = document.getElementById("studioAiDock").getBoundingClientRect();
    const undo = document.getElementById("studioAiDrawerUndo").getBoundingClientRect();
    const input = document.getElementById("studioAiDrawerInput").getBoundingClientRect();
    return {
      dock: { left: dock.left, right: dock.right, top: dock.top, bottom: dock.bottom },
      undo: { left: undo.left, right: undo.right, width: undo.width, height: undo.height },
      input: { width: input.width, height: input.height },
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    };
  });

  record(
    "H1. 모바일에서 drawer가 화면 밖으로 넘치지 않는다",
    box.dock.left >= -0.5 && box.dock.right <= box.innerWidth + 0.5 && box.dock.top >= -0.5,
    JSON.stringify(box.dock) + ` innerWidth=${box.innerWidth}`
  );

  record(
    "H2. 모바일에서 textarea와 되돌리기 버튼이 실제로 보이고 누를 수 있다",
    box.input.width > 100 && box.input.height > 20 &&
      box.undo.width > 40 && box.undo.height >= 20 &&
      box.undo.right <= box.innerWidth + 0.5,
    JSON.stringify({ input: box.input, undo: box.undo })
  );

  await page.close();
  await context.close();

}


/* =========================================================
   I. AI 적용 -> Save -> Undo (PHASE AI-2.1 회귀)

   되돌리기는 "AI 요청 직전의 dirty"를 복원한다. 그 값의 뜻은
   "그때의 working draft가 그때 저장돼 있던 draft와 같은가"이므로,
   그 사이에 Save가 성공했다면 더 이상 사실이 아니다 — Save가
   저장된 draft를 AI 결과로 옮겨 놓았기 때문에, 되돌린 working
   draft는 저장된 draft와 다르다.

   그대로 dirty=false를 복원하면 두 가지가 동시에 깨진다:
     - Save 버튼이 비활성이라 **되돌린 내용을 저장할 방법이 없다**
     - Publish는 활성인 채로 남아 **되돌리기 이전의 AI 버전**을
       발행한다(사용자가 보고 있는 화면과 다른 것이 공개된다)

   revision 비교로는 잡히지 않는다 — Save는 working draft 내용을
   바꾸지 않아 studioWorkingRevision을 올리지 않는다(올리면 Save
   뒤의 되돌리기가 stale로 거부되므로 올려서도 안 된다). 그래서
   draft version id를 따로 비교한다(studio/studio-preview.js의
   applyAiSkinPackage() expectedDraftVersionId).
========================================================== */

async function runSaveUndo(context) {

  const previousRouteMode = aiRouteMode;

  aiRouteMode = "fixed-package";

  const page = await openStudio(context, SCENARIO_V_URL);
  await openTopDock(page);
  await openDrawer(page);

  const savedCalls = () =>
    page.evaluate(() => (window.__savedDraftCallsV || []).map(c => ({ css: c.p_content.css })));

  const publishCalls = () =>
    page.evaluate(() => (window.__publishCallsV || []).length);

  const publishState = () =>
    page.evaluate(() => {
      const btn = document.getElementById("studioPublishButton");
      return { disabled: btn.disabled, text: btn.textContent.trim(), title: btn.title };
    });

  /* ---------- 1. 초기 상태 ---------- */

  const initial = await workingState(page);
  const initialSaves = await savedCalls();

  record(
    "I1. 초기에는 working draft가 저장된 draft(draft-v1) 그대로다",
    initial.skinPackage.css.includes(SCENARIO_V_INITIAL_CSS_MARK) &&
      initial.draftVersionId === "draft-v1" &&
      initialSaves.length === 0,
    `css=${JSON.stringify(initial.skinPackage.css)} draftVersionId=${initial.draftVersionId} saves=${initialSaves.length}`
  );

  record(
    "I2. 초기 dirty=false / Save 비활성",
    initial.isDirty === false && (await saveButtonDisabled(page)) === true,
    `isDirty=${initial.isDirty}`
  );

  /* ---------- 2. AI 결과 적용 ---------- */

  await page.fill("#studioAiDrawerInput", "배경을 조금 밝게 해줘");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const applied = await workingState(page);

  record(
    "I3. AI 결과가 working skin에 반영된다",
    applied.skinPackage.css.includes(MOCK_CSS_MARKER_V) &&
      !applied.skinPackage.css.includes(SCENARIO_V_INITIAL_CSS_MARK),
    `css=${JSON.stringify(applied.skinPackage.css)}`
  );

  record(
    "I4. AI 적용은 dirty=true / Save 활성으로만 만들고 저장하지는 않는다",
    applied.isDirty === true &&
      (await saveButtonDisabled(page)) === false &&
      applied.draftVersionId === "draft-v1" &&
      (await savedCalls()).length === 0,
    `isDirty=${applied.isDirty} draftVersionId=${applied.draftVersionId}`
  );

  /* ---------- 3. Save (AI 버전이 저장된다) ---------- */

  await page.click("#studioSaveButton");
  await page.waitForFunction(
    () => (window.__savedDraftCallsV || []).length === 1,
    null,
    { timeout: 10000 }
  );
  await page.waitForFunction(
    () => document.getElementById("studioPublishButton").disabled === false,
    null,
    { timeout: 10000 }
  );

  const afterSave = await workingState(page);
  const savesAfterFirst = await savedCalls();

  record(
    "I5. Save가 실제 RPC까지 도달하고 저장된 draft가 AI 버전이 된다",
    savesAfterFirst.length === 1 && savesAfterFirst[0].css.includes(MOCK_CSS_MARKER_V),
    JSON.stringify(savesAfterFirst)
  );

  record(
    "I6. 저장 후 currentDraftVersionId가 새 버전으로 갱신된다",
    afterSave.draftVersionId === "draft-v2",
    `draftVersionId=${afterSave.draftVersionId}`
  );

  record(
    "I7. 저장 후 dirty=false / Save 비활성 / Publish 활성",
    afterSave.isDirty === false &&
      (await saveButtonDisabled(page)) === true &&
      (await publishState()).disabled === false,
    `isDirty=${afterSave.isDirty} publish=${JSON.stringify(await publishState())}`
  );

  /* ---------- 4. Undo (여기가 이 회귀의 핵심) ---------- */

  await page.click("#studioAiDrawerUndo");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === false,
    null,
    { timeout: 5000 }
  );

  const undone = await workingState(page);
  const savesAfterUndo = await savedCalls();
  const publishAfterUndo = await publishState();

  record(
    "I8. 되돌리기는 working skin을 AI 이전 버전으로 복원한다",
    JSON.stringify(undone.skinPackage) === JSON.stringify(initial.skinPackage),
    `css=${JSON.stringify(undone.skinPackage.css)}`
  );

  record(
    "I9. 저장된 draft는 여전히 AI 버전이다(되돌리기는 DB를 되돌리지 않는다)",
    savesAfterUndo.length === 1 &&
      savesAfterUndo[0].css.includes(MOCK_CSS_MARKER_V) &&
      undone.draftVersionId === "draft-v2",
    `saves=${JSON.stringify(savesAfterUndo)} draftVersionId=${undone.draftVersionId}`
  );

  record(
    "I10. 그러므로 되돌린 뒤 dirty=true다(화면과 저장된 draft가 다르다)",
    undone.isDirty === true,
    `isDirty=${undone.isDirty}`
  );

  const canSaveAfterUndo =
    (await saveButtonDisabled(page)) === false;

  record(
    "I11. 되돌린 내용을 저장할 수 있도록 Save가 활성이다",
    canSaveAfterUndo
  );

  record(
    "I12. 저장 전 Publish는 막힌다(되돌리기 이전 AI 버전이 발행되지 않도록)",
    publishAfterUndo.disabled === true && publishAfterUndo.title.includes("먼저 Save"),
    JSON.stringify(publishAfterUndo)
  );

  /* ---------- 5·6. 다시 Save -> Publish ----------

     Save가 비활성이면(= 이 회귀가 되살아난 상태) 클릭할 수 없다.
     그때 Playwright의 클릭 재시도로 타임아웃을 내며 스위트 전체를
     중단시키면 정작 무엇이 깨졌는지가 보이지 않으므로, 남은 검사를
     "왜 실패했는지"와 함께 FAIL로 기록하고 정상 종료한다. */

  if (!canSaveAfterUndo) {

    const blocked =
      "Undo 후 Save가 비활성이라 되돌린 내용을 저장할 수 없다" +
      ` (dirty=${undone.isDirty}, publish.disabled=${publishAfterUndo.disabled})`;

    record("I13. 다시 Save하면 되돌린 working skin이 새 draft로 저장된다", false, blocked);
    record("I14. 저장 후 draft 포인터가 다시 갱신되고 dirty=false / Publish 활성", false, blocked);
    record(
      "I15. 발행되는 것은 AI 버전(draft-v2)이 아니라 되돌린 버전(draft-v3)이다",
      false,
      blocked + " — 이 상태에서 Publish를 누르면 되돌리기 이전의 AI 버전이 발행된다"
    );

    await page.close();

    aiRouteMode = previousRouteMode;

    return;

  }

  await page.click("#studioSaveButton");
  await page.waitForFunction(
    () => (window.__savedDraftCallsV || []).length === 2,
    null,
    { timeout: 10000 }
  );
  await page.waitForFunction(
    () => document.getElementById("studioPublishButton").disabled === false,
    null,
    { timeout: 10000 }
  );

  const afterSave2 = await workingState(page);
  const savesAfterSecond = await savedCalls();

  record(
    "I13. 다시 Save하면 되돌린 working skin이 새 draft로 저장된다",
    savesAfterSecond.length === 2 &&
      savesAfterSecond[1].css.includes(SCENARIO_V_INITIAL_CSS_MARK) &&
      !savesAfterSecond[1].css.includes(MOCK_CSS_MARKER_V),
    JSON.stringify(savesAfterSecond)
  );

  record(
    "I14. 저장 후 draft 포인터가 다시 갱신되고 dirty=false / Publish 활성",
    afterSave2.draftVersionId === "draft-v3" &&
      afterSave2.isDirty === false &&
      (await publishState()).disabled === false,
    `draftVersionId=${afterSave2.draftVersionId} isDirty=${afterSave2.isDirty}`
  );

  /* ---------- 6. Publish (AI 버전이 아니라 되돌린 버전이 발행된다) ---------- */

  await page.click("#studioPublishButton");
  await page.waitForSelector(".studio-confirm-overlay:not([hidden])", { timeout: 5000 });
  await page.click(".studio-confirm-button--primary");
  await page.waitForFunction(
    () => (window.__publishCallsV || []).length === 1,
    null,
    { timeout: 10000 }
  );
  await page.waitForFunction(
    () => document.getElementById("studioPublishButton").textContent.trim() === "Published",
    null,
    { timeout: 10000 }
  );

  const afterPublish = await workingState(page);

  record(
    "I15. 발행되는 것은 AI 버전(draft-v2)이 아니라 되돌린 버전(draft-v3)이다",
    (await publishCalls()) === 1 &&
      afterPublish.draftVersionId === "draft-v3" &&
      (await publishState()).text === "Published",
    `draftVersionId=${afterPublish.draftVersionId} publish=${JSON.stringify(await publishState())}`
  );

  await page.close();

  aiRouteMode = previousRouteMode;

}


/* =========================================================
   실행
========================================================== */

async function main() {

  console.log("\n=== 1) 서버 방어선 (functions/api/skin-ai.js) ===\n");

  if (shouldRun("server")) {
    await runServerChecks();
  }

  if (ONLY === "server") {
    return report();
  }

  console.log("\n=== 2) 브라우저 경로 (playwright/" + BROWSER + ") ===\n");

  /* 서버 방어선 검사가 mock을 오류 모드로 남겨두므로 되돌린다 */
  resetOpenAiMock("ok");

  const playwright = await loadPlaywright(BROWSER);
  const server = await startServer();
  const browser = await playwright[BROWSER].launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  try {
    if (shouldRun("happy")) await runHappy(context);
    if (shouldRun("undo")) await runUndo(context);
    if (shouldRun("empty")) await runEmpty(context);
    if (shouldRun("invalid")) await runInvalid(context);
    if (shouldRun("duplicate")) await runDuplicate(context);
    if (shouldRun("stale")) await runStale(context);
    if (shouldRun("reload")) await runReload(context);
    if (shouldRun("save-undo")) await runSaveUndo(context);
    if (shouldRun("mobile")) await runMobile(browser);
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }

  if (consoleErrors.length) {
    console.log("\n[console errors]\n" + consoleErrors.join("\n"));
  }

  report();

}

function report() {
  const failed = results.filter(r => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    console.log("실패:");
    failed.forEach(f => console.log(" - " + f.name));
    process.exitCode = 1;
  }
}

await main();
