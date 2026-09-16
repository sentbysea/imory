/* =========================================================
   STUDIO PREVIEW — SANDBOX 렌더 (ES 모듈, preview-frame.html 안)

   기준 문서: IMORY_SANDBOX_SKIN_DESIGN.md §G/§H/§J/§K
   단계: SANDBOX-4 — renderMode:"sandbox" 인 스킨은 Skin Studio 의
         우측 미리보기에서도 **공개 화면과 같은 프레임**에서 그려진다.

   ---------------------------------------------------------
   ★ 이 파일이 하는 일은 "연결" 하나다.

   렌더러도, Context 조립도, 주소 판정도 여기서 새로 만들지 않는다.
   이미 있는 두 줄기를 잇기만 한다:

     위쪽(부모, Studio)   studio/studio-preview.js
                          studio/preview/preview-navigation.js
                          → 지금까지처럼 "preview:render" 로
                            { skin(=resolveSkinTemplate 결과), context }
                            를 보낸다. **한 줄도 고치지 않았다.**

     아래쪽(프레임)       skin/sandbox/skin-sandbox-host.js
                          → 공개 HOME/CATEGORY/POST/BANNER/HIGHLIGHTS
                            가 쓰는 바로 그 host/protocol/context 다.

   그래서 Studio Preview 와 공개 화면은 별도 렌더 구현을 갖지
   않는다 — 같은 투영 함수, 같은 메시지, 같은 frame.html 이다.

   ---------------------------------------------------------
   ★ 프레임이 두 겹이다 (그리고 그래야 한다)

     studio/index.html
       └ iframe #studioPreviewFrame   (same-origin, preview-frame.html)
           └ iframe .imory-skin-sandbox-frame  (cross-origin, frame.html)

   바깥 프레임은 지금까지의 Preview 문서 그대로다. Desktop/Mobile
   전환·확대/축소·AI 패널 접기·resizer 는 전부 **바깥 프레임의 CSS
   width** 하나만 바꾸는 방식이라(studio/studio-preview.js), 안쪽
   프레임을 width:100% 로 두면 그 전부가 손대지 않아도 그대로
   동작한다. 스킨의 @media 도 안쪽 프레임의 뷰포트 폭에서 평가되므로
   공개 화면과 같은 값을 본다.

   안쪽 프레임을 바깥과 합치려면 Studio 문서 자체가 cross-origin
   iframe 을 들고 있어야 하는데, 그러면 Inspector overlay 좌표와
   Preview chrome 전체가 다른 문서로 흩어진다. 그래서 겹친다.

   ---------------------------------------------------------
   ★ iframe 은 화면당 하나, 그리고 다시 만들지 않는다

   Studio 는 글자 하나 고칠 때마다 "preview:render" 를 다시 보낸다.
   그때마다 cross-origin iframe 을 새로 만들면 문서 로드와 READY
   왕복을 처음부터 다시 하게 되고(그 사이 화면이 빈다), "프레임이
   정확히 하나"라는 요구도 깨진다.

   그래서 첫 렌더에서만 프레임을 띄우고, 그 뒤로는 살아 있는
   handle 에 renderSandboxSkinPage() 로 다시 그린다 — 페이지를
   바꿔도(HOME → CATEGORY → POST) 같은 프레임이다.

   ★ 늦게 도착한 응답

   두 겹으로 막는다:
     · 이 파일의 sandboxRenderToken — 렌더 요청마다 올라간다.
       await 가 끝났을 때 토큰이 다르면 그 결과는 버린다.
     · host 의 handle.renderSeq — 프레임이 보낸 RENDERED/HEIGHT/
       NAVIGATE 중 최신 렌더의 것이 아닌 것을 버린다(공개 화면과
       같은 장치).

   ---------------------------------------------------------
   ★ 프레임에서 링크를 누르면

   프레임은 주소를 보내지 않는다. 부모가 이번 렌더에 발급한 정수
   navId 하나만 온다(skin/sandbox/skin-sandbox-nav.js). 이 파일은
   그 정수를 표에서 찾아 나온 href 를 **기존 "preview:navigate"
   메시지 그대로** Studio 부모에 올린다 — 그 다음은 native Preview
   에서 링크를 눌렀을 때와 글자 하나 다르지 않다
   (studio/preview/preview-route.js → preview-navigation.js).

   즉 프레임 링크는 실제 공개 페이지로 나가지 않는다. 나갈 수
   있는 문 자체가 없다(host 는 navigateToSkinRoute 를 부르지 않고
   아래 onNavigate 를 부른다).

   ---------------------------------------------------------
   ★ 이번 라운드에서 하지 않는 것

     · (SANDBOX-5A 에서 바뀜) 사용자 작성 JS 는 이제 프레임에서
       실행된다. 이 파일이 하는 일은 여전히 "연결" 하나다 —
       판정은 host 가, 실행은 프레임이 한다. 다만 저자 JS 가
       얽힌 렌더에서는 **프레임을 재사용하지 않는다**(아래
       needs-new-realm).
     · FOLDER / Series Viewer — pageType 표에 없으므로 native 로
       간다. 폴더 Preview 는 지금까지와 똑같다.
     · Element Inspector / 직접 편집 — 프레임 안 DOM 은 이 문서가
       읽을 수 없다(cross-origin). sandbox 스킨에서는 Select 가
       고를 것이 없다. 남은 차이로 문서에 적었다.
========================================================== */

import {
  prepareSandboxSkin,
  renderSandboxSkinPage,
  sendSandboxPostBody,
  destroySandboxSkinFrame
} from "../../skin/sandbox/skin-sandbox-host.js";


/* =========================================================
   상태 — 이 문서에 프레임은 언제나 0개 또는 1개다
========================================================== */

let sandboxHandle =
  null;

let sandboxRenderToken =
  0;

/* 마지막으로 성공한 렌더의 페이지 종류(진단/테스트용) */

let sandboxPageType =
  "";

/*
  프레임이 뜨기 전에 POST 본문이 먼저 도착할 수 있다. 렌더가 끝난
  뒤에 넣는다 — 공개 화면의 pendingBody 와 같은 이유다.
*/

let sandboxPendingPostBody =
  null;


/* =========================================================
   readGlobal(name)

   config/nav 는 classic script 전역이다(preview-frame.html 이
   이 모듈보다 먼저 로드한다). 없으면 조용히 native 로 간다.
========================================================== */

function readGlobal(name) {

  return typeof window !== "undefined" ? window[name] : undefined;

}


/* =========================================================
   flagWindow()

   기능 플래그와 dev frame origin 은 **Studio 문서의 주소**에
   달려 있다(?sandboxSkin=1 · ?sandboxSkinOrigin=...). 이 문서는
   그 iframe 이라 자기 주소에는 그 쿼리가 없다.

   부모는 같은 origin 이므로 location 을 읽을 수 있다. 읽을 수
   없으면(상상하기 어렵지만) 자기 window 로 떨어진다 — 그 경우
   플래그가 꺼져 native 로 간다.
========================================================== */

function flagWindow() {

  try {

    const parent =
      window.parent;

    if (
      parent &&
      parent !== window &&
      parent.location &&
      typeof parent.location.hostname === "string"
    ) {
      return parent;
    }

  }

  catch (err) {
    /* cross-origin 부모 — 있을 수 없지만 방어적으로 */
  }


  return window;

}


/* =========================================================
   sandboxPreviewPageType(context) -> "" | pageType

   Context 가 이미 어느 화면인지 말해 준다(context.page.type,
   skin/skin-context.js buildSkinPageMeta). 여기서 새로 추측하지
   않는다.

   "folder" 는 일부러 빠져 있다 — 이번 라운드 범위 밖이고, 빠져
   있으면 지금까지의 native Preview 가 그대로 돈다.
========================================================== */

const SANDBOX_PREVIEW_PAGE_TYPES = [
  "home",
  "category",
  "post",
  "banner",
  "highlights"
];


function sandboxPreviewPageType(context) {

  const type =
    context && context.page && typeof context.page.type === "string"
      ? context.page.type
      : "";

  return SANDBOX_PREVIEW_PAGE_TYPES.indexOf(type) !== -1 ? type : "";

}


/* =========================================================
   resolvePreviewNavTarget(href) -> { href, url, route } | null

   Studio Preview 에서 "이 주소는 프레임에서 눌릴 수 있는가".

   ★ 규칙을 새로 쓰지 않는다. 주소 **모양** 검사와 관리 진입
   쿼리 거부는 공개 화면과 같은 함수/상수를 그대로 쓴다
   (skin/sandbox/skin-sandbox-nav.js).

   다른 것은 마지막 한 걸음뿐이다. 공개 화면은 거기서
   resolveInSiteSkinRoute() 로 실제 SPA 라우트를 만들지만, 이
   문서에는 siteOwnerSlug 도 SPA 라우터도 없고 있어서도 안 된다 —
   Preview 는 어디로도 이동하지 않기 때문이다. 대신 href 를 부모에
   올리면 부모가 이미 갖고 있는 Studio 전용 판정자
   (studio/preview/preview-route.js resolveStudioPreviewTarget)가
   "지금 편집 중인 블로그의 HOME/CATEGORY/POST/FOLDER/HIGHLIGHTS
   인가"를 최종 판정한다. 다른 slug·모르는 경로는 거기서 조용히
   버려진다.

   route 를 null 로 두는 이유: 이 문서에는 route 로 할 일이 없다.
   표에 들어가는 것은 href 하나면 충분하다.
========================================================== */

function resolvePreviewNavTarget(href) {

  const isShape =
    readGlobal("isSandboxNavPathShape");

  if (typeof isShape !== "function" || isShape(href) !== true) {
    return null;
  }


  let url;

  try {
    url = new URL(href, window.location.origin);
  }
  catch (err) {
    return null;
  }


  if (url.origin !== window.location.origin) {
    return null;
  }


  const deniedKeys =
    readGlobal("SANDBOX_NAV_DENIED_QUERY_KEYS");

  if (Array.isArray(deniedKeys)) {

    for (let i = 0; i < deniedKeys.length; i += 1) {

      if (url.searchParams.has(deniedKeys[i])) {
        return null;
      }

    }

  }


  return {
    href: href,
    url: url,
    route: null
  };

}


/* =========================================================
   shouldRenderPreviewInSandbox(skin, context) -> boolean

   ★ 이 하나가 sandbox Preview 의 스위치다. 거짓이면 이 파일은
   화면에 아무 영향도 주지 않는다 — native Preview 가 지금까지와
   똑같이 돈다(요구사항 7절).

   판정 순서:
     1. SkinPackage 가 renderMode:"sandbox" 라고 **정확히** 적었는가
        (판정은 공개 화면과 같은 resolveSkinRenderMode 규칙)
     2. 이 라운드가 아는 페이지인가(folder 제외)
     3. 기능 플래그가 켜져 있는가 — 편집 중인 블로그의 slug 로
        판정한다(skin/sandbox/skin-sandbox-config.js)
     4. frame origin 이 있고 이 문서와 다른가
========================================================== */

export function shouldRenderPreviewInSandbox(renderMode, context) {

  /*
    ★ 부모가 보내는 skin 은 **이미 고른 template 한 장**이다
    (studio/preview/preview-navigation.js 가 resolveSkinTemplate 을
    거쳐 보낸다). renderMode 는 SkinPackage 최상위 필드라 그 안에
    없다 — 그래서 부모가 "preview:render" 봉투에 같이 실어 준다
    (studio/studio-preview.js postRenderToFrame).

    판정은 공개 화면과 같다: "sandbox" 라고 **정확히** 적힌 경우만
    sandbox 이고, 없거나 모르는 값이면 native 다
    (skin/skin-template.js resolveSkinRenderMode).
  */

  if (
    typeof renderMode !== "string" ||
    renderMode.trim() !== "sandbox"
  ) {
    return false;
  }


  if (!sandboxPreviewPageType(context)) {
    return false;
  }


  const isEnabled =
    readGlobal("isSandboxSkinPreviewEnabled");

  const slug =
    context && context.site && typeof context.site.slug === "string"
      ? context.site.slug
      : "";

  if (typeof isEnabled !== "function" || isEnabled(flagWindow(), slug) !== true) {
    return false;
  }


  return !!previewSandboxFrameOrigin();

}


function previewSandboxFrameOrigin() {

  const resolveOrigin =
    readGlobal("resolveSandboxSkinFrameOrigin");

  if (typeof resolveOrigin !== "function") {
    return "";
  }


  const origin =
    resolveOrigin(flagWindow());

  if (!origin || origin === window.location.origin) {
    return "";
  }


  return origin;

}


/* =========================================================
   teardownSandboxPreview()

   sandbox 스킨에서 native 스킨으로 돌아갈 때(Import/AI/되돌리기
   로 renderMode 가 사라졌을 때), 그리고 프레임이 실패했을 때.
   두 번 불러도 안전하다.
========================================================== */

export function teardownSandboxPreview() {

  sandboxRenderToken += 1;

  sandboxPendingPostBody = null;

  sandboxPageType = "";

  if (sandboxHandle) {

    destroySandboxSkinFrame(sandboxHandle);

    sandboxHandle = null;

  }

}


/* =========================================================
   hasSandboxPreviewFrame() -> boolean
========================================================== */

export function hasSandboxPreviewFrame() {

  return !!(
    sandboxHandle &&
    !sandboxHandle.destroyed &&
    sandboxHandle.iframe &&
    sandboxHandle.iframe.isConnected
  );

}


/* =========================================================
   renderSandboxPreview({ root, skin, context, onNavigate })
     -> Promise<{ ok:true, pageType } | { ok:false, reason }>

   ok:false 면 이 함수는 **아무것도 남기지 않는다**(프레임을 치웠다)
   — 호출자는 공개 화면과 같은 규칙으로 native 렌더로 간다.
========================================================== */

export async function renderSandboxPreview(options) {

  const opts =
    options || {};

  const root =
    opts.root;

  const context =
    opts.context;

  const pageType =
    sandboxPreviewPageType(context);

  if (!root || !pageType) {
    return { ok: false, reason: "bad-page-type" };
  }


  const frameOrigin =
    previewSandboxFrameOrigin();

  if (!frameOrigin) {
    return { ok: false, reason: "no-origin" };
  }


  sandboxRenderToken += 1;

  const token =
    sandboxRenderToken;


  /*
    ★ SANDBOX-5A — js 한 칸.

    부모(Studio)가 보내는 skin 은 resolveSkinTemplate() 의 결과라
    js 가 이미 들어 있다(skin/skin-template.js). 여기서 알려진 키만
    새 리터럴로 옮기므로, 이 줄이 없으면 저자 JS 가 **조용히**
    빠진다 — Studio Preview 에서만 JS 가 안 도는 상태가 된다.

    실행 여부의 판정은 여전히 host 가 한다(관문 다섯) — 이 파일은
    값을 흘리지 않고 넘겨줄 뿐이다.
  */

  const template =
    {
      html: typeof opts.skin.html === "string" ? opts.skin.html : "",
      css: typeof opts.skin.css === "string" ? opts.skin.css : "",
      js: typeof opts.skin.js === "string" ? opts.skin.js : ""
    };


  /* --- 이미 떠 있는 프레임이면 거기에 다시 그린다 ------- */

  if (hasSandboxPreviewFrame()) {

    const again =
      await renderSandboxSkinPage(
        sandboxHandle,
        {
          pageType: pageType,
          template: template,
          context: context,
          flagWindow: flagWindow(),
          navResolveTarget: resolvePreviewNavTarget
        }
      );

    if (token !== sandboxRenderToken) {

      /* 그 사이 더 새로운 요청이 왔다 — 이 결과는 버린다 */

      return { ok: false, reason: "stale" };

    }

    /* =====================================================
       ★ SANDBOX-5A — 저자 JS 가 얽히면 프레임을 다시 만든다

       host 가 "이 프레임은 재사용할 수 없다"고 알려 준 경우다
       (이번 렌더가 JS 를 실행하거나, 이 프레임이 **전에** 실행한
        적이 있다). 임의 JS 가 남긴 타이머·리스너·observer 를 전부
       되돌릴 방법이 없으므로 청소 대신 realm 을 버린다 —
       skin/sandbox/skin-sandbox-host.js renderSandboxSkinPage 의
       needs-new-realm 주석.

       그래서 Studio 에서 JS 를 한 글자 고칠 때마다 프레임이 새로
       뜬다. 그 대가로 "고치면 그 즉시, 누적 없이 다시 돈다"가
       성립한다(Save 전에도).

       프레임을 치우고 **아래 첫 렌더 경로로 떨어진다** —
       return 하지 않는다.
    ====================================================== */

    if (!again.ok && again.reason === "needs-new-realm") {

      destroySandboxSkinFrame(sandboxHandle);

      sandboxHandle = null;

    }

    else if (!again.ok) {

      /*
        ★ 여기서 프레임을 치우지 않는다. 방금 편집한 HTML 한 번이
        렌더에 실패했다고 멀쩡한 프레임을 없애면 다음 글자를 칠 때
        핸드셰이크부터 다시 하게 된다. 화면에는 직전 렌더가 그대로
        남고, 호출자가 오류를 표시한다.
      */

      return { ok: false, reason: again.reason, keepFrame: true };

    }

    else {

      sandboxPageType = pageType;

      flushSandboxPendingPostBody();

      return { ok: true, pageType: pageType };

    }

  }


  /* --- 첫 렌더: 프레임을 띄운다 ------------------------- */

  /*
    native 가 그려 둔 것이 남아 있으면 지운다 — 한 컨테이너에 두
    스킨이 겹치지 않게. renderSkin() 이 mount 때 하는 것과 같다.
  */

  root.innerHTML = "";


  const prepared =
    prepareSandboxSkin({
      container: root,
      pageType: pageType,
      template: template,
      context: context,
      frameOrigin: frameOrigin,
      flagWindow: flagWindow(),
      navResolveTarget: resolvePreviewNavTarget,
      onNavigate: function (target) {

        if (typeof opts.onNavigate === "function" && target && target.href) {
          opts.onNavigate(target.href);
        }

      },

      /*
        SANDBOX-5A — 저자 JS 가 오류를 냈다. 화면은 그대로이고
        (HTML/CSS 는 이미 그려져 있다) 호출자가 짧은 안내만 띄운다.
        코드 문자열 하나뿐이다 — 문장도 stack 도 오지 않는다.
      */

      onScriptError: function (code) {

        if (typeof opts.onScriptError === "function") {
          opts.onScriptError(code);
        }

      }
    });

  if (!prepared.ok) {
    return { ok: false, reason: prepared.reason };
  }


  const mounted =
    await prepared.mount(root);


  if (token !== sandboxRenderToken) {

    /*
      기다리는 동안 더 새로운 요청이 왔다. 방금 뜬 프레임은
      그 요청이 쓸 것이 아니므로 치운다 — 늦은 응답이 최신
      화면을 덮지 않는다.
    */

    if (mounted.ok) {
      destroySandboxSkinFrame(mounted.handle);
    }

    return { ok: false, reason: "stale" };

  }


  if (!mounted.ok) {

    sandboxHandle = null;

    return { ok: false, reason: mounted.reason };

  }


  sandboxHandle = mounted.handle;

  sandboxPageType = pageType;

  flushSandboxPendingPostBody();


  return { ok: true, pageType: pageType };

}


/* =========================================================
   sendSandboxPreviewPostBody(body) -> boolean

   parent 가 "preview:post-body" 로 보낸 **이미 서식·sanitize 가
   끝난** 본문을 프레임의 post-body region 으로 넘긴다
   (studio/preview/preview-post-body.js → 공개 POST Viewer 와 같은
   파이프라인). 이 경로에 새 sanitize 로직은 없다 — native Preview
   의 handlePostBodyMessage() 와 같은 책임 분리다.
========================================================== */

export function sendSandboxPreviewPostBody(body) {

  if (!body) {
    return false;
  }


  if (!hasSandboxPreviewFrame()) {

    /* 아직 렌더 전 — 들고 있다가 렌더 직후에 보낸다 */

    sandboxPendingPostBody = body;

    return false;

  }


  return sendSandboxPostBody(sandboxHandle, body);

}


function flushSandboxPendingPostBody() {

  if (!sandboxPendingPostBody) {
    return;
  }


  const body =
    sandboxPendingPostBody;

  sandboxPendingPostBody = null;

  sendSandboxPostBody(sandboxHandle, body);

}


/* =========================================================
   진단용 — e2e 가 "프레임이 몇 개인가 / 어느 페이지인가"를
   부모에서 셀 수 있게 한다. 값을 읽기만 하고, 이 창구로 렌더를
   시킬 수는 없다.
========================================================== */

if (typeof window !== "undefined") {

  window.__imoryPreviewSandbox = {

    hasFrame: hasSandboxPreviewFrame,

    pageType: function () {
      return sandboxPageType;
    },

    frameCount: function () {
      return document.querySelectorAll(
        "iframe[data-imory-sandbox-frame]"
      ).length;
    }

  };

}
