/* =========================================================
   PHASE AI-2 / AI-4 — Studio AI OpenAI 연결 + 참고 이미지 E2E

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
     mobile / save-undo / images

   PHASE AI-4(참고 이미지)는 server 섹션의 J1~J12와 브라우저 섹션
   images(J1~J26)가 담당한다. 여기서도 실제 이미지가 OpenAI로
   나가지 않는다 — api.openai.com 요청은 전부 이 파일이 가로챈다.
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

/* =========================================================
   참고 이미지 fixture (PHASE AI-4)

   1x1 PNG 67바이트. 내용은 중요하지 않고 "정상적인 data URL 한 쌍"
   이면 된다 — 서버는 이미지를 디코딩하지 않고 MIME/문법/크기만
   본다.
========================================================== */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PNG_IMAGE = {
  mimeType: "image/png",
  dataUrl: "data:image/png;base64," + TINY_PNG_BASE64
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
      "A6. Structured Output schema가 templates.{home,category,post,banner,folder}.html과 css를 강제한다(banner/folder는 null 허용)",
      (() => {
        const schema = body.text.format.schema;
        const t = schema.properties.templates;
        return t.required.join(",") === "home,category,post,banner,folder" &&
          t.additionalProperties === false &&
          t.properties.home.required[0] === "html" &&
          t.properties.home.additionalProperties === false &&
          t.properties.post.properties.html.type === "string" &&
          Array.isArray(t.properties.banner.type) &&
          t.properties.banner.type.includes("null") &&
          Array.isArray(t.properties.folder.type) &&
          t.properties.folder.type.includes("null") &&
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



  /* ---- J. 참고 이미지 (PHASE AI-4) ---- */

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "이 이미지 느낌으로", skinPackage: VALID_SKIN_PACKAGE, images: [PNG_IMAGE] }
    });
    const content = openAiLastRequest.body.input[0].content;

    record(
      "J1. 이미지 1장을 붙이면 OpenAI user content가 input_text + input_image가 된다",
      r.status === 200 &&
        content.length === 2 &&
        content[0].type === "input_text" &&
        content[1].type === "input_image" &&
        content[1].image_url === PNG_IMAGE.dataUrl &&
        content[1].detail === "auto",
      JSON.stringify(content.map(c => c.type)) + ` detail=${content[1] && content[1].detail}`
    );

    record(
      "J2. 이미지가 있을 때만 시스템 프롬프트에 참고 이미지 규칙이 붙는다",
      openAiLastRequest.body.instructions.includes("Reference images") &&
        openAiLastRequest.body.instructions.includes("DESIGN REFERENCES ONLY") &&
        openAiLastRequest.body.instructions.includes("NEVER put an attached image into the skin"),
      "instructions.length=" + openAiLastRequest.body.instructions.length
    );

    const wire = JSON.stringify(openAiLastRequest.body);

    record(
      "J3. 이미지를 붙여도 Supabase access token / 계정 정보는 OpenAI로 가지 않는다",
      !wire.includes(VALID_TOKEN) &&
        !wire.includes("mock-access-token") &&
        !wire.toLowerCase().includes("supabase") &&
        String(openAiLastRequest.headers.authorization || "") === "Bearer test-openai-key-not-real",
      "authHeaderIsOpenAiKey=true"
    );

    record(
      "J4. 이미지는 프롬프트로만 가고 결과 SkinPackage에는 들어가지 않는다(imageSlots 그대로)",
      JSON.stringify(r.payload.skinPackage.imageSlots) === JSON.stringify(VALID_SKIN_PACKAGE.imageSlots) &&
        !JSON.stringify(r.payload.skinPackage).includes("data:image"),
      JSON.stringify(r.payload.skinPackage.imageSlots)
    );
  }

  {
    resetOpenAiMock("ok");
    const second = { mimeType: "image/webp", dataUrl: "data:image/webp;base64," + TINY_PNG_BASE64 };
    const r = await callSkinAi({
      body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE, images: [PNG_IMAGE, second] }
    });
    const content = openAiLastRequest.body.input[0].content;

    record(
      "J5. 이미지 2장은 첨부 순서 그대로 input_image 2개가 된다",
      r.status === 200 &&
        content.length === 3 &&
        content[1].image_url === PNG_IMAGE.dataUrl &&
        content[2].image_url === second.dataUrl,
      JSON.stringify(content.map(c => c.type))
    );
  }

  {
    resetOpenAiMock("ok");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    const content = openAiLastRequest.body.input[0].content;

    record(
      "J6. 이미지가 없으면 input_image가 하나도 없고 프롬프트도 PHASE AI-2 그대로다",
      r.status === 200 &&
        content.length === 1 &&
        content[0].type === "input_text" &&
        !openAiLastRequest.body.instructions.includes("Reference images"),
      JSON.stringify(content.map(c => c.type))
    );

    /* images: null / [] 도 "없음"과 완전히 같은 body를 만들어야 한다 */
    const baseline = JSON.stringify(openAiLastRequest.body);

    resetOpenAiMock("ok");
    await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE, images: [] } });
    const emptyArray = JSON.stringify(openAiLastRequest.body);

    resetOpenAiMock("ok");
    await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE, images: null } });
    const nullImages = JSON.stringify(openAiLastRequest.body);

    record(
      "J7. images가 [] 이거나 null이어도 요청 body가 이미지 없는 경우와 완전히 같다",
      emptyArray === baseline && nullImages === baseline,
      `emptyEqual=${emptyArray === baseline} nullEqual=${nullImages === baseline}`
    );
  }

  /* 서버 거부 — 전부 OpenAI 호출 0회여야 한다 */
  for (const [label, images, expectedFragment] of [
    ["3장", [PNG_IMAGE, PNG_IMAGE, PNG_IMAGE], "최대 2장"],
    ["허용하지 않는 MIME(gif)", [{ mimeType: "image/gif", dataUrl: "data:image/gif;base64," + TINY_PNG_BASE64 }], "PNG, JPEG, WebP"],
    ["MIME과 data URL 접두사 불일치", [{ mimeType: "image/png", dataUrl: "data:image/webp;base64," + TINY_PNG_BASE64 }], "형식이 올바르지 않"],
    ["data URL이 아닌 http URL", [{ mimeType: "image/png", dataUrl: "https://example.com/a.png" }], "형식이 올바르지 않"],
    ["깨진 base64", [{ mimeType: "image/png", dataUrl: "data:image/png;base64,!!!not-base64!!!" }], "형식이 올바르지 않"],
    ["길이가 4의 배수가 아닌 base64", [{ mimeType: "image/png", dataUrl: "data:image/png;base64,QUJD" + "Q" }], "형식이 올바르지 않"],
    ["배열이 아님", "not-an-array", "형식이 올바르지 않"],
    ["항목이 객체가 아님", [42], "형식이 올바르지 않"],
    ["dataUrl이 없음", [{ mimeType: "image/png" }], "형식이 올바르지 않"]
  ]) {
    resetOpenAiMock("ok");
    const r = await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE, images } });
    record(
      `J8. 서버가 거부한다(${label}) — OpenAI 호출 0회`,
      r.status === 400 &&
        r.payload.ok === false &&
        r.payload.message.includes(expectedFragment) &&
        openAiCallCount === 0 &&
        !("skinPackage" in r.payload),
      `status=${r.status} message=${r.payload && r.payload.message} openAiCalls=${openAiCallCount}`
    );
  }

  {
    /*
      장당 4MB 상한 — client 검증을 우회한 요청이 서버에서 막히는지.
      base64 5,592,412자는 디코딩하면 4MiB + 3바이트다.
    */
    resetOpenAiMock("ok");
    const oversizeBase64 = "A".repeat(Math.ceil((4 * 1024 * 1024 + 3) / 3) * 4);
    const r = await callSkinAi({
      body: {
        instruction: "a",
        skinPackage: VALID_SKIN_PACKAGE,
        images: [{ mimeType: "image/png", dataUrl: "data:image/png;base64," + oversizeBase64 }]
      }
    });
    record(
      "J9. 디코딩한 실제 크기가 4MB를 넘으면 서버가 막는다 — OpenAI 호출 0회",
      r.status === 400 &&
        r.payload.message.includes("4MB") &&
        openAiCallCount === 0,
      `status=${r.status} message=${r.payload && r.payload.message} openAiCalls=${openAiCallCount}`
    );
  }

  {
    /*
      정확히 4MiB는 통과해야 한다(경계). 5,592,408자 + padding 2 =
      1,398,102 * 3 - 2 = 4,194,304 바이트.
    */
    resetOpenAiMock("ok");
    const exact = "A".repeat(Math.floor((4 * 1024 * 1024) / 3) * 4) + "AA==";
    const r = await callSkinAi({
      body: {
        instruction: "a",
        skinPackage: VALID_SKIN_PACKAGE,
        images: [{ mimeType: "image/png", dataUrl: "data:image/png;base64," + exact }]
      }
    });
    record(
      "J10. 정확히 4MB짜리 이미지는 통과한다(경계값)",
      r.status === 200 && openAiCallCount === 1,
      `status=${r.status} bytes=${(exact.length / 4) * 3 - 2} openAiCalls=${openAiCallCount}`
    );
  }

  {
    /*
      본문 상한 — 이미지 몫만큼 커졌지만 텍스트 몫(instruction +
      SkinPackage)은 여전히 256KB다.
    */
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: {
        instruction: "a",
        skinPackage: { ...VALID_SKIN_PACKAGE, css: "/*" + "x".repeat(300 * 1024) + "*/" },
        images: [PNG_IMAGE]
      }
    });
    record(
      "J11. 이미지 상한이 커져도 SkinPackage 텍스트 몫은 그대로 256KB다 — 413",
      r.status === 413 && openAiCallCount === 0,
      `status=${r.status} openAiCalls=${openAiCallCount}`
    );
  }

  {
    const source = fs.readFileSync(path.join(ROOT, "functions", "api", "skin-ai.js"), "utf8");
    record(
      "J12. 전체 본문 상한이 '텍스트 256KB + 이미지 2장'으로 계산돼 선언돼 있다",
      /SKIN_AI_MAX_TEXT_BODY_BYTES\s*=\s*256 \* 1024/.test(source) &&
        /SKIN_AI_MAX_REFERENCE_IMAGE_BYTES\s*=\s*4 \* 1024 \* 1024/.test(source) &&
        /SKIN_AI_MAX_BODY_BYTES\s*=\s*\n?\s*SKIN_AI_MAX_TEXT_BODY_BYTES \+/.test(source),
      "SKIN_AI_MAX_BODY_BYTES = 256KB + 2 * (ceil(4MiB/3)*4 + 1KB) ≈ 10.9MiB"
    );
  }

  /* ---- K. category.posts / category.tree 계약 (Folder-aware Skin Rendering) ----

     FOLDER-1이 category.tree(폴더 계층)를 additive로 넣은 뒤, AI가
     CATEGORY 템플릿을 고칠 때 두 목록의 역할을 구분해야 한다. 실제 모델
     호출 없이 서버가 조립한 시스템 프롬프트(instructions)만 본다. */

  {
    resetOpenAiMock("ok");
    await callSkinAi({ body: { instruction: "a", skinPackage: VALID_SKIN_PACKAGE } });
    const instructions = openAiLastRequest.body.instructions;

    record(
      "K1. 프롬프트가 category.posts(평면·최신순)와 category.tree(폴더 계층·sort_order·root 글 포함)를 나란히 설명한다",
      instructions.includes("category.tree[]") &&
        instructions.includes("category.hasFolders") &&
        instructions.includes("`category.posts` is the FLAT list") &&
        instructions.includes("newest first (created_at DESC), folders ignored") &&
        instructions.includes("`category.tree` is the FOLDER-AWARE hierarchy") &&
        instructions.includes("Root-level posts (posts in no folder) are included"),
      "instructions.length=" + instructions.length
    );

    record(
      "K2. folder node / post node shape가 실제 skin-context.js 계약과 같은 필드로 적혀 있다",
      instructions.includes("{ kind: \"folder\", id, name, depth, folderHref, postCount, children: [...] }") &&
        instructions.includes("{ kind: \"post\", id, title, href, publishedAt, publishedAtLabel, isSecret, depth }")
    );

    /* FOLDER-2: 폴더 링크는 href가 아니라 folderHref(null 가능)이고,
       item.href = 글 판정 계약은 그대로다. */
    record(
      "K3. 폴더에는 href가 없고 링크는 item.folderHref(null 가능, if 가드 필수)라고 명시하며 item.href = 글 판정을 유지하라고 적는다",
      instructions.includes("A folder node has NO `href`. Its link is `item.folderHref`") &&
        instructions.includes("data-imory-if=\"item.folderHref\" data-imory-href=\"item.folderHref\"") &&
        instructions.includes("never put the folder link on `item.href`") &&
        instructions.includes("`item.href` exists ONLY on post nodes")
    );

    record(
      "K9. FOLDER 페이지(Series Viewer) 계약 — 경로, direct 글만, folder.* 필드, folder.posts repeat 안의 post-body region, 읽기 흐름, templates.folder 선택",
      instructions.includes("### FOLDER (templates.folder") &&
        instructions.includes("/:slug/category/:cid/folder/:fid") &&
        instructions.includes("posts inside sub-folders are NOT included") &&
        instructions.includes("folder.posts[]") &&
        instructions.includes("item.editHref") &&
        instructions.includes("folder.children[]") &&
        instructions.includes("folder.parentHref") &&
        instructions.includes("data-imory-repeat=\"folder.posts\"><h2 data-imory-bind=\"item.title\"></h2><div data-imory-region=\"post-body\">") &&
        instructions.includes("Keep per-post chrome minimal") &&
        instructions.includes("`templates.folder` is optional") &&
        instructions.indexOf("### FOLDER") > instructions.indexOf("#### Category folders") &&
        instructions.indexOf("### FOLDER") < instructions.indexOf("### POST")
    );

    record(
      "K4. kind 비교 대신 필드 존재(item.name / item.href)로 분기하고 [hidden] CSS가 필요하다고 안내한다",
      instructions.includes("do not test `item.kind`") &&
        instructions.includes("a folder has `item.name` and `item.children`; a post has `item.title` and `item.href`") &&
        instructions.includes("[hidden] { display: none; }")
    );

    record(
      "K5. nested repeat(item.children)로 최대 3단계 폴더를 그린다고 안내하고, repeat 중첩이 가능하다고 바인딩 설명에도 적혀 있다",
      instructions.includes("nested `data-imory-repeat=\"item.children\"`") &&
        instructions.includes("3 folder levels") &&
        instructions.includes("Repeats may be nested")
    );

    record(
      "K6. 사용자가 폴더 표현을 요청할 때만 category.tree, 일반 최신순 목록은 category.posts, 기존 스킨 강제 변환 금지",
      instructions.includes("use `category.tree` ONLY when the user asks for folders to be shown") &&
        instructions.includes("`category.posts` is the right choice") &&
        instructions.includes("Never convert an existing `category.posts` skin to `category.tree` unless the user asked for folders")
    );

    /* 위치: CATEGORY context 항목 바로 뒤, 소유자 진입점 규칙 앞 */
    record(
      "K7. 폴더 계약이 CATEGORY context 항목과 POST 항목 사이에 있다(모델이 CATEGORY 설명으로 읽는다)",
      instructions.indexOf("#### Category folders") > instructions.indexOf("### CATEGORY") &&
        instructions.indexOf("#### Category folders") < instructions.indexOf("### POST")
    );
  }

  {
    /* folder-aware 예시 스킨(중첩 repeat 4단계 + 분기 패턴)이 서버의
       SkinPackage 검증/정규화를 그대로 통과하고, 되돌아온 결과에도
       category.tree / 중첩 item.children repeat이 살아 있어야 한다. */
    const folderSkin = JSON.parse(
      fs.readFileSync(path.join(ROOT, "skin", "test-skins", "imory-finder-folders-v1.json"), "utf8")
    );
    resetOpenAiMock("ok");
    const r = await callSkinAi({
      body: { instruction: "폴더 카드 색을 조금 더 진하게", skinPackage: folderSkin }
    });
    const outHtml = r.status === 200 ? r.payload.skinPackage.templates.category.html : "";
    record(
      "K8. folder-aware 스킨(category.tree + 중첩 repeat)이 서버 검증을 통과하고 결과에도 트리 바인딩이 유지된다",
      r.status === 200 &&
        outHtml.includes('data-imory-repeat="category.tree"') &&
        (outHtml.match(/data-imory-repeat="item\.children"/g) || []).length === 3 &&
        outHtml.includes('data-imory-if="item.name"') &&
        outHtml.includes('data-imory-if="item.href"'),
      `status=${r.status} childrenRepeats=${(outHtml.match(/data-imory-repeat="item\.children"/g) || []).length}`
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

/* PHASE AI-4 — 브라우저가 실제로 보낸 body(문자열). images 필드가
   어떻게 실렸는지를 테스트가 직접 확인한다. */
let aiRouteLastBody = null;

async function handleAiRoute(route) {

  aiRouteRequestCount += 1;

  const request = route.request();
  const bodyText = request.postData() || "";
  const headers = await request.allHeaders();

  aiRouteLastBody = bodyText;

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

/*
  PHASE AI-5A — 하단 drawer가 우측 사이드바가 됐다. 열림 표식은
  여전히 #studioAiDrawer의 .is-open이다.

  PHASE AI-5A.1 — 오른쪽 가장자리의 세로 탭은 없어졌고, 여는 곳은
  Top Dock 안의 "AI Assistant"(#studioAiToggleButton) 하나뿐이다.
  그래서 실제 사용자와 같은 순서로 dock을 먼저 연 뒤 그 버튼을
  누른다(레이아웃 계약 자체는 studio/studio-ai-panel-layout-e2e-test.mjs
  가 따로 검증한다).
*/
async function openDrawer(page) {
  const isOpen = await page.evaluate(() => document.getElementById("studioAiDrawer").classList.contains("is-open"));
  if (!isOpen) {
    await openTopDock(page);
    await page.click("#studioAiToggleButton");
  }
  await page.waitForFunction(() => document.getElementById("studioAiDrawer").classList.contains("is-open"));
}

function readToast(page) {
  return page.evaluate(() => {
    const el = document.getElementById("studioToast");
    return {
      hidden: el.hidden,
      text: el.textContent,
      isError: el.classList.contains("studio-toast--error")
    };
  });
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
    Preview를 CATEGORY로 옮겨 둔다 — PHASE AI-5A부터 AI 적용은
    보고 있던 화면을 그대로 유지한다(HOME 복귀는 Import 버튼만).
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

  /*
    적용 후에도 CATEGORY에 남아 있어야 한다. 재렌더 자체는
    AI 결과 css marker가 iframe <style>에 들어왔는지로 잰다.
  */
  const stillOnCategory = await previewHas(page, ".scenario-x-category");
  const previewLocation = await page.evaluate(() => window.getCurrentPreviewLocation());

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
    "A5. Preview가 다시 그려지되 보고 있던 CATEGORY를 유지한다 (PHASE AI-5A)",
    onCategory === true &&
      stillOnCategory === true &&
      previewLocation.type === "category" &&
      previewLocation.categoryId === "301",
    `onCategory=${onCategory} stillOnCategory=${stillOnCategory} location=${JSON.stringify(previewLocation)}`
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
   J. 참고 이미지 첨부 (PHASE AI-4)

   drawer의 첨부 UI -> /api/skin-ai 요청 body -> (진짜 서버) ->
   OpenAI 요청의 input_image 까지 한 줄로 확인한다.

   ★ 이 섹션은 자기 context를 따로 만든다 — 텍스트 붙여넣기가
   깨지지 않았는지를 **진짜 Ctrl+V**로 재려면 클립보드 권한이
   필요하기 때문이다(chromium). 권한을 못 받는 브라우저에서는 그
   한 검사만 건너뛰고 나머지는 그대로 돈다.

   ★ 이미지가 Supabase로 가지 않는지도 여기서 잰다. scenario 문서의
   supabaseClient mock에는 storage가 아예 없고(그쪽 주석 참고),
   여기서는 그 위에 네트워크 수준 감시를 하나 더 얹는다.
========================================================== */

/* PNG는 서버 섹션이 쓰는 TINY_PNG_BASE64를 그대로 재사용한다 */
const TINY_PNG_BUFFER = Buffer.from(TINY_PNG_BASE64, "base64");

/* 1x1 WebP (lossy) */
const TINY_WEBP_BASE64 =
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

const TINY_WEBP_BUFFER = Buffer.from(TINY_WEBP_BASE64, "base64");


function attachmentState(page) {
  return page.evaluate(() => {
    const debug = window.getStudioAiPanelDebugState();
    const row = document.querySelector(".studio-ai-drawer-attachments");
    const thumbs = Array.prototype.slice.call(
      document.querySelectorAll(".studio-ai-drawer-thumb")
    );
    const add = document.querySelector(".studio-ai-drawer-attach-add");
    const note = document.querySelector(".studio-ai-drawer-attach-note");
    return {
      count: debug.attachmentCount,
      mimeTypes: debug.attachmentMimeTypes,
      rowExists: !!row,
      thumbCount: thumbs.length,
      thumbAlts: thumbs.map(t => t.querySelector("img").alt),
      thumbSrcPrefixes: thumbs.map(
        t => t.querySelector("img").src.split(";base64,")[0] + ";base64,"
      ),
      removeButtons: thumbs.filter(t => !!t.querySelector(".studio-ai-drawer-thumb-remove")).length,
      addLabel: add ? add.textContent.trim() : "",
      addDisabled: add ? add.disabled : null,
      noteHidden: note ? note.hidden : null,
      noteText: note ? note.textContent.trim() : "",
      drawerHasClass: document.getElementById("studioAiDrawer").classList.contains("has-attachments")
    };
  });
}

async function attachFiles(page, files) {
  await page.setInputFiles("#studioAiDrawerAttachInput", files);
  /* FileReader가 data URL을 만들 때까지 — 개수로 기다린다 */
  await sleep(250);
}

/*
  합성 paste 이벤트. Playwright에는 "클립보드에 이미지를 넣는" API가
  없으므로 DataTransfer를 만들어 직접 dispatch한다. 우리 handler가
  clipboardData를 읽는 경로 자체는 실제와 같다.
*/
async function dispatchPaste(page, options) {
  return page.evaluate((opts) => {
    const dt = new DataTransfer();
    if (opts.text) dt.setData("text/plain", opts.text);
    if (opts.imageBase64) {
      const binary = atob(opts.imageBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      dt.items.add(new File([bytes], opts.imageName || "pasted.png", { type: opts.imageMime || "image/png" }));
    }
    const event = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    document.getElementById("studioAiDrawerInput").dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  }, options);
}


async function runImages(browser) {

  const context =
    await browser.newContext({ viewport: { width: 1280, height: 900 } });

  /* 실제 Ctrl+V 검사를 위해 클립보드 권한을 시도한다(chromium 전용) */
  let clipboardGranted = false;
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    clipboardGranted = true;
  } catch {
    clipboardGranted = false;
  }

  const page = await openStudio(context);

  /* 이미지가 Supabase Storage/DB로 나가는지 네트워크에서 직접 감시 */
  const supabaseRequests = [];
  page.on("request", req => {
    const url = req.url();
    if (url.includes("supabase.co") || url.includes("/storage/v1/") || url.includes("/rest/v1/")) {
      supabaseRequests.push(url);
    }
  });

  await openDrawer(page);

  /* ---------- 1. 첨부 전 ---------- */

  const empty = await attachmentState(page);

  record(
    "J1. 첨부가 없을 때 drawer에 '참고 이미지' 버튼만 있고 안내/thumbnail은 없다",
    empty.rowExists === true &&
      empty.count === 0 &&
      empty.thumbCount === 0 &&
      empty.addDisabled === false &&
      empty.noteHidden === true &&
      empty.drawerHasClass === false,
    JSON.stringify(empty)
  );

  /* ---------- 2. 파일 선택으로 PNG 1장 ---------- */

  await attachFiles(page, [
    { name: "ref.png", mimeType: "image/png", buffer: TINY_PNG_BUFFER }
  ]);

  const one = await attachmentState(page);

  record(
    "J2. 파일 선택으로 PNG 1장을 붙이면 thumbnail과 삭제 버튼이 생기고 장수가 표시된다",
    one.count === 1 &&
      one.thumbCount === 1 &&
      one.removeButtons === 1 &&
      one.thumbAlts[0] === "참고 이미지 1" &&
      one.thumbSrcPrefixes[0] === "data:image/png;base64," &&
      one.addLabel.includes("1/2") &&
      one.drawerHasClass === true,
    JSON.stringify(one)
  );

  record(
    "J3. 첨부가 생기면 '저장되지 않는다' 안내가 보인다(Imory 범위로만 한정된 문구)",
    one.noteHidden === false &&
      one.noteText === "참고 이미지는 AI 요청에만 사용되며 Imory에 저장되지 않습니다.",
    JSON.stringify(one.noteText)
  );

  /* ---------- 3. 전송 -> 요청 body / OpenAI input_image ---------- */

  aiRouteLastBody = null;
  resetOpenAiMock("ok");

  await page.fill("#studioAiDrawerInput", "이 이미지 느낌으로 바꿔줘");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const sentOnce = JSON.parse(aiRouteLastBody);
  const openAiContentOnce = openAiLastRequest.body.input[0].content;

  record(
    "J4. 요청 body에 images가 { mimeType, dataUrl }로 1개 실린다(id/size/name은 보내지 않는다)",
    Array.isArray(sentOnce.images) &&
      sentOnce.images.length === 1 &&
      sentOnce.images[0].mimeType === "image/png" &&
      sentOnce.images[0].dataUrl.startsWith("data:image/png;base64,") &&
      Object.keys(sentOnce.images[0]).sort().join(",") === "dataUrl,mimeType",
    JSON.stringify(Object.keys(sentOnce.images[0] || {}))
  );

  record(
    "J5. 그 이미지가 OpenAI 요청의 input_image로 그대로 전달된다",
    openAiContentOnce.length === 2 &&
      openAiContentOnce[1].type === "input_image" &&
      openAiContentOnce[1].image_url === sentOnce.images[0].dataUrl,
    JSON.stringify(openAiContentOnce.map(c => c.type))
  );

  record(
    "J6. AI 요청이 성공해도 첨부는 남는다(같은 참고 이미지로 이어서 요청할 수 있게)",
    (await attachmentState(page)).count === 1,
    JSON.stringify(await attachmentState(page))
  );

  const appliedWithImage = await workingState(page);

  record(
    "J7. 참고 이미지는 working SkinPackage에 들어가지 않는다(imageSlots/템플릿/CSS 어디에도 없다)",
    !JSON.stringify(appliedWithImage.skinPackage).includes("data:image") &&
      appliedWithImage.skinPackage.css.includes(MOCK_CSS_MARKER),
    `imageSlots=${JSON.stringify(appliedWithImage.skinPackage.imageSlots)}`
  );

  /* ---------- 4. 되돌리기 후에도 첨부 유지 ---------- */

  await page.click("#studioAiDrawerUndo");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === false,
    null,
    { timeout: 5000 }
  );

  record(
    "J8. 되돌리기는 SkinPackage만 되돌리고 첨부는 건드리지 않는다",
    (await attachmentState(page)).count === 1 &&
      !(await workingState(page)).skinPackage.css.includes(MOCK_CSS_MARKER),
    JSON.stringify(await attachmentState(page))
  );

  /* ---------- 5. 두 번째 이미지 + 3장째 차단 ---------- */

  await attachFiles(page, [
    { name: "ref2.webp", mimeType: "image/webp", buffer: TINY_WEBP_BUFFER }
  ]);

  const two = await attachmentState(page);

  record(
    "J9. 2장까지 붙이면 추가 버튼이 비활성이 되고 2/2로 표시된다",
    two.count === 2 &&
      two.thumbCount === 2 &&
      two.mimeTypes.join(",") === "image/png,image/webp" &&
      two.thumbSrcPrefixes.join(" ") === "data:image/png;base64, data:image/webp;base64," &&
      two.addLabel.includes("2/2") &&
      two.addDisabled === true &&
      two.thumbAlts.join(",") === "참고 이미지 1,참고 이미지 2",
    JSON.stringify(two)
  );

  await attachFiles(page, [
    { name: "ref3.png", mimeType: "image/png", buffer: TINY_PNG_BUFFER }
  ]);

  const third = await attachmentState(page);
  const thirdToast = await readToast(page);

  record(
    "J10. 3장째는 받지 않고 최대 장수를 안내한다",
    third.count === 2 &&
      thirdToast.hidden === false &&
      thirdToast.isError === true &&
      thirdToast.text.includes("최대 2장"),
    `count=${third.count} toast=${JSON.stringify(thirdToast.text)}`
  );

  /* ---------- 6. 2장 전송 -> input_image 2개 (순서 유지) ---------- */

  aiRouteLastBody = null;
  resetOpenAiMock("ok");

  await page.fill("#studioAiDrawerInput", "이 두 이미지를 참고해줘");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const sentTwo = JSON.parse(aiRouteLastBody);
  const openAiContentTwo = openAiLastRequest.body.input[0].content;

  record(
    "J11. 이미지 2장이 첨부 순서 그대로 OpenAI input_image 2개가 된다",
    sentTwo.images.length === 2 &&
      openAiContentTwo.length === 3 &&
      openAiContentTwo[1].image_url === sentTwo.images[0].dataUrl &&
      openAiContentTwo[2].image_url === sentTwo.images[1].dataUrl &&
      sentTwo.images[0].mimeType === "image/png" &&
      sentTwo.images[1].mimeType === "image/webp",
    JSON.stringify(openAiContentTwo.map(c => c.type))
  );

  /* ---------- 7. thumbnail × 로 삭제 ---------- */

  await page.click(".studio-ai-drawer-thumb:first-of-type .studio-ai-drawer-thumb-remove");

  const afterRemoveOne = await attachmentState(page);

  record(
    "J12. thumbnail의 ×를 누르면 메모리 state에서 즉시 사라지고 남은 것이 다시 번호를 받는다",
    afterRemoveOne.count === 1 &&
      afterRemoveOne.thumbCount === 1 &&
      afterRemoveOne.mimeTypes.join(",") === "image/webp" &&
      afterRemoveOne.thumbAlts[0] === "참고 이미지 1" &&
      afterRemoveOne.addDisabled === false,
    JSON.stringify(afterRemoveOne)
  );

  await page.click(".studio-ai-drawer-thumb .studio-ai-drawer-thumb-remove");

  const afterRemoveAll = await attachmentState(page);

  record(
    "J13. 전부 지우면 안내와 thumbnail 줄이 원래대로 돌아간다",
    afterRemoveAll.count === 0 &&
      afterRemoveAll.thumbCount === 0 &&
      afterRemoveAll.noteHidden === true &&
      afterRemoveAll.drawerHasClass === false &&
      afterRemoveAll.addLabel === "＋ 참고 이미지",
    JSON.stringify(afterRemoveAll)
  );

  /* ---------- 8. 첨부가 없으면 요청 body에 images 키가 없다 ---------- */

  aiRouteLastBody = null;

  await page.fill("#studioAiDrawerInput", "이미지 없이 보내기");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const sentNone = JSON.parse(aiRouteLastBody);

  record(
    "J14. 첨부가 없으면 body에 images 키 자체가 없다(PHASE AI-2와 동일한 요청)",
    !("images" in sentNone) &&
      Object.keys(sentNone).sort().join(",") === "instruction,skinPackage" &&
      openAiLastRequest.body.input[0].content.length === 1,
    JSON.stringify(Object.keys(sentNone))
  );

  /* ---------- 9. 잘못된 파일은 client가 먼저 막는다 ---------- */

  aiRouteLastBody = null;
  const requestsBeforeBadFiles = aiRouteRequestCount;

  await attachFiles(page, [
    { name: "anim.gif", mimeType: "image/gif", buffer: TINY_PNG_BUFFER }
  ]);

  const afterGif = await attachmentState(page);
  const gifToast = await readToast(page);

  record(
    "J15. 허용하지 않는 MIME(gif)은 client가 먼저 막는다 — 첨부 0, 요청 0",
    afterGif.count === 0 &&
      gifToast.isError === true &&
      gifToast.text.includes("PNG, JPEG, WebP") &&
      aiRouteRequestCount === requestsBeforeBadFiles,
    `count=${afterGif.count} toast=${JSON.stringify(gifToast.text)}`
  );

  await attachFiles(page, [
    { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) }
  ]);

  const afterHuge = await attachmentState(page);
  const hugeToast = await readToast(page);

  record(
    "J16. 4MB를 넘는 이미지는 client가 먼저 막는다 — 첨부 0, 요청 0",
    afterHuge.count === 0 &&
      hugeToast.isError === true &&
      hugeToast.text.includes("4MB") &&
      aiRouteRequestCount === requestsBeforeBadFiles,
    `count=${afterHuge.count} toast=${JSON.stringify(hugeToast.text)}`
  );

  /* ---------- 10. 붙여넣기 ---------- */

  const textOnlyPaste =
    await dispatchPaste(page, { text: "붙여넣은 텍스트" });

  record(
    "J17. 일반 텍스트 붙여넣기는 우리 handler가 전혀 손대지 않는다(preventDefault 없음, 첨부 없음)",
    textOnlyPaste.defaultPrevented === false &&
      (await attachmentState(page)).count === 0,
    JSON.stringify(textOnlyPaste)
  );

  if (clipboardGranted) {

    await page.fill("#studioAiDrawerInput", "");
    await page.evaluate(() => navigator.clipboard.writeText("실제 클립보드 텍스트"));
    await page.focus("#studioAiDrawerInput");
    await page.keyboard.press("ControlOrMeta+V");
    await sleep(250);

    const pastedValue =
      await page.evaluate(() => document.getElementById("studioAiDrawerInput").value);

    record(
      "J18. 실제 Ctrl+V 텍스트 붙여넣기가 textarea에 그대로 들어간다(기존 동작 유지)",
      pastedValue === "실제 클립보드 텍스트",
      JSON.stringify(pastedValue)
    );

    await page.fill("#studioAiDrawerInput", "");

  } else {

    record(
      "J18. 실제 Ctrl+V 텍스트 붙여넣기가 textarea에 그대로 들어간다(기존 동작 유지)",
      true,
      "이 브라우저에서 클립보드 권한을 받지 못해 건너뜀 — J17이 handler 계약을 대신 확인한다"
    );

  }

  const imagePaste =
    await dispatchPaste(page, { imageBase64: TINY_PNG_BASE64, imageMime: "image/png" });

  await sleep(250);

  const afterImagePaste = await attachmentState(page);

  record(
    "J19. 이미지 붙여넣기는 attachment로 들어간다(순수 이미지일 때만 기본 동작을 막는다)",
    imagePaste.defaultPrevented === true &&
      afterImagePaste.count === 1 &&
      afterImagePaste.mimeTypes.join(",") === "image/png",
    JSON.stringify({ imagePaste, count: afterImagePaste.count })
  );

  const mixedPaste =
    await dispatchPaste(page, { text: "설명 문장", imageBase64: TINY_PNG_BASE64, imageMime: "image/png" });

  await sleep(250);

  const afterMixedPaste = await attachmentState(page);

  record(
    "J20. 텍스트+이미지 혼합 붙여넣기는 이미지를 첨부하면서 텍스트 입력을 막지 않는다",
    mixedPaste.defaultPrevented === false &&
      afterMixedPaste.count === 2,
    JSON.stringify({ mixedPaste, count: afterMixedPaste.count })
  );

  /* ---------- 11. 중단/타임아웃 후에도 첨부 유지 ---------- */

  aiRouteMode = "hold";
  aiRouteRelease = null;

  await page.fill("#studioAiDrawerInput", "중단해볼 요청");
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === true,
    null,
    { timeout: 5000 }
  );

  /*
    요청 중에 첨부를 하나 지운다 — 진행 중인 요청은 보낸 시점의
    snapshot 그대로 끝나야 하고(stale이 되면 안 된다), 중단 후에도
    남은 첨부는 그대로여야 한다(12절).
  */
  await page.click(".studio-ai-drawer-thumb .studio-ai-drawer-thumb-remove");

  const duringRequest = await attachmentState(page);

  /* Send 버튼이 지금은 중단 버튼이다 */
  await page.click("#studioAiDrawerSend");
  await page.waitForFunction(
    () => window.getStudioAiPanelDebugState().pending === false,
    null,
    { timeout: 5000 }
  );

  if (aiRouteRelease) aiRouteRelease();
  aiRouteMode = "real";

  const afterAbort = await attachmentState(page);

  record(
    "J21. 요청 중 첨부를 편집해도 진행 중 요청이 stale로 죽지 않고, 중단 후 첨부는 그대로 남는다",
    duringRequest.count === 1 &&
      afterAbort.count === 1 &&
      (await panelState(page)).statusText === "",
    JSON.stringify({ during: duringRequest.count, after: afterAbort.count })
  );

  /* ---------- 12. Supabase로 나가지 않는다 ---------- */

  record(
    "J22. 참고 이미지는 Supabase Storage/DB로 전송되지 않는다(네트워크 요청 0건, storage API 자체가 없음)",
    supabaseRequests.length === 0 &&
      (await page.evaluate(() => typeof window.supabaseClient.storage)) === "undefined",
    `supabaseRequests=${JSON.stringify(supabaseRequests)}`
  );

  record(
    "J23. 참고 이미지를 localStorage / sessionStorage에 쓰지 않는다",
    (await page.evaluate(() => {
      const scan = (store) => {
        for (let i = 0; i < store.length; i += 1) {
          const value = store.getItem(store.key(i)) || "";
          if (value.includes("data:image")) return true;
        }
        return false;
      };
      return !scan(window.localStorage) && !scan(window.sessionStorage);
    })) === true
  );

  /* ---------- 13. 새로고침하면 사라진다 ---------- */

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(
    () => window.getStudioAiWorkingState && window.getStudioAiWorkingState().hasWorkingSkin === true,
    null,
    { timeout: 15000 }
  );
  await openDrawer(page);

  record(
    "J24. 새로고침하면 첨부가 사라진다(어디에도 저장하지 않으므로)",
    (await attachmentState(page)).count === 0,
    JSON.stringify(await attachmentState(page))
  );

  await page.close();
  await context.close();


  /* ---------- 14. 모바일 ---------- */

  const mobileContext =
    await browser.newContext({ viewport: { width: 390, height: 780 } });

  const mobilePage = await openStudio(mobileContext);
  await openDrawer(mobilePage);

  await mobilePage.setInputFiles("#studioAiDrawerAttachInput", [
    { name: "a.png", mimeType: "image/png", buffer: TINY_PNG_BUFFER },
    { name: "b.webp", mimeType: "image/webp", buffer: TINY_WEBP_BUFFER }
  ]);
  await sleep(400);

  await mobilePage.fill("#studioAiDrawerInput", "모바일에서 이미지와 함께 보내기");
  await mobilePage.click("#studioAiDrawerSend");
  await mobilePage.waitForFunction(
    () => window.getStudioAiPanelDebugState().hasUndo === true,
    null,
    { timeout: 10000 }
  );

  const mobileBox = await mobilePage.evaluate(() => {
    const dock = document.getElementById("studioAiDock").getBoundingClientRect();
    const drawer = document.getElementById("studioAiDrawer");
    const thumbs = Array.prototype.slice
      .call(document.querySelectorAll(".studio-ai-drawer-thumb"))
      .map(t => t.getBoundingClientRect());
    const input = document.getElementById("studioAiDrawerInput").getBoundingClientRect();
    return {
      dock: { left: dock.left, right: dock.right, top: dock.top, bottom: dock.bottom },
      thumbs: thumbs.map(t => ({ left: t.left, right: t.right, width: t.width, height: t.height })),
      input: { width: input.width, height: input.height },
      drawerScrollsInside: drawer.scrollHeight > drawer.clientHeight
        ? getComputedStyle(drawer).overflowY === "auto"
        : true,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  record(
    "J25. 모바일에서 첨부 2장을 붙여도 drawer가 화면 밖으로 넘치지 않는다",
    mobileBox.dock.left >= -0.5 &&
      mobileBox.dock.right <= mobileBox.innerWidth + 0.5 &&
      mobileBox.dock.top >= -0.5 &&
      mobileBox.docScrollX <= 0.5 &&
      mobileBox.drawerScrollsInside === true,
    JSON.stringify({ dock: mobileBox.dock, innerWidth: mobileBox.innerWidth, docScrollX: mobileBox.docScrollX })
  );

  record(
    "J26. 모바일에서도 thumbnail 2개와 textarea가 실제로 보이고 화면 안에 있다",
    mobileBox.thumbs.length === 2 &&
      mobileBox.thumbs.every(t => t.width > 20 && t.height > 20 && t.right <= mobileBox.innerWidth + 0.5) &&
      mobileBox.input.width > 100 && mobileBox.input.height > 20,
    JSON.stringify({ thumbs: mobileBox.thumbs, input: mobileBox.input })
  );

  await mobilePage.close();
  await mobileContext.close();

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
    if (shouldRun("images")) await runImages(browser);
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
