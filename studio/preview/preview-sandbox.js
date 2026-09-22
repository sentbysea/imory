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
     · (SANDBOX-6A 에서 바뀜) Element Inspector — 이제 Select 가
       sandbox 스킨에서도 된다. 아래 "Inspector" 절 참고.
     · (SANDBOX-SELECT-PARITY-1 에서 바뀜) 직접 편집 — 선택 우선순위 ·
       겹친 요소 메뉴 · 바깥 영역 · 더블클릭 글자 · 본체 끌기 · 패널
       항목이 native 와 같다(forwardSandboxPreviewInspectDirective).
       **이미지 크기 · 자르기만 아직 아니다** — 이미지 자연 크기와
       너비/구도 임시 미리보기가 프레임 계약에 없다. Studio 가 그
       이유를 패널에 적어 준다.

   ---------------------------------------------------------
   ★ Inspector (SANDBOX-6A)

   프레임이 올려보내는 것은 식별자 문자열 · 태그 이름 · 사각형
   넷뿐이다. 이 파일이 하는 일은 그 사각형을 **이 문서의 좌표로
   옮기는 것** 하나다:

     프레임 뷰포트 좌표  +  iframe 이 이 문서에서 차지한 자리
     = Preview 문서 좌표

   그러면 그 다음은 native Inspector 와 글자 하나 다르지 않다 —
   같은 "preview:inspect-*" 메시지로 Studio 에 올라가고, Studio 의
   overlay/팝오버/AI 선택 chip 이 지금까지 쓰던 경로를 그대로 탄다.

   ★ 안쪽 iframe 에는 배율이 없다(width:100%, transform 없음).
     Desktop/Mobile 축소는 **바깥** 프레임의 CSS width 로만 하고,
     그 배율은 Studio 의 studioInspectorMapRect() 가 이미 반영한다.
========================================================== */

import {
  prepareSandboxSkin,
  renderSandboxSkinPage,
  sendSandboxPostBody,
  sendSandboxInspectMode,
  sendSandboxInspectPick,
  sendSandboxInspectChoose,
  sendSandboxInspectParent,
  sendSandboxInspectCaps,
  sendSandboxInspectPreview,
  sendSandboxCanvasSelect,
  sendSandboxCanvasGeometry,
  destroySandboxSkinFrame,
  copySandboxSidesSetting,
  copySandboxSkinSettings
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
   SANDBOX-6A — Inspector

   sandboxInspectEnabled  Studio 의 Select 토글 상태. 프레임이
                          새로 만들어져도(저자 JS 가 얽힌 렌더)
                          렌더 직후에 이 값으로 다시 켜 준다.
   sandboxInspectEditId   Studio 가 정한 선택. 같은 이유로 렌더
                          직후에 다시 내려보낸다.
   sandboxInspectRelay    프레임의 inspect 메시지를 Studio 로
                          올리는 함수(부모 문서가 꽂아 준다).
========================================================== */

let sandboxInspectEnabled =
  false;

let sandboxInspectEditId =
  null;

/* SANDBOX-SELECT-PARITY-1 — Studio 가 정한 가능 여부(끌기 · 글자). 프레임이
   새로 만들어져도 렌더 직후 다시 내려보낸다. */

let sandboxInspectCaps =
  null;

let sandboxInspectRelay =
  null;


/* =========================================================
   HOME-CANVAS-SELECT-1B-1 — 캔버스 선택

   Studio 가 확정한 선택을 그대로 들고 있다가 프레임에 내려보낸다.
   프레임이 아직 없거나 아직 한 장도 그리지 않았으면 값만 기억해
   두고, 렌더가 끝난 직후에 보낸다(flushSandboxInspectState) —
   Inspector 의 mode/pick 과 정확히 같은 사정이다.
========================================================== */

let sandboxCanvasSelection =
  null;


/* HOME-CANVAS-TRANSFORM-1A — 단일 선택의 Canvas 좌표. 선택과 같은
   사정이라 같은 자리에서 기억하고 같은 자리에서 다시 보낸다. */

let sandboxCanvasGeometry =
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

  /*
    SANDBOX-6A — 프레임이 사라지면 그 안의 선택도 사라진다.
    모드(Select 토글)는 Studio 의 것이므로 여기서 끄지 않는다 —
    native 로 돌아가면 native Inspector 가 그대로 이어받는다.
  */

  sandboxInspectEditId = null;

  sandboxInspectCaps = null;

  sandboxInspectLastHover = null;
  sandboxInspectLastSelected = null;

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

  /* 좌우 영역 설정 — js 와 같은 사정이다(여기서 옮기지 않으면 sandbox
     Preview 에서만 영역이 조용히 꺼진다). IMORY_SIDES_DESIGN.md */
  if (opts.skin.sides && typeof opts.skin.sides === "object") {
    template.sides = copySandboxSidesSetting(opts.skin.sides);
  }

  /* 주인의 스킨 설정(색 · 사진 구성 · D-day) — sides 와 같은 사정이다
     (IMORY_EDITORIAL_DEFAULT_SKIN_DESIGN.md) */
  const settings = copySandboxSkinSettings(opts.skin.settings);

  if (settings) {
    template.settings = settings;
  }

  /*
    HOME 캔버스의 실행 데이터 — js · sides · settings 와 **정확히 같은
    사정**이다(IMORY_HOME_CANVAS_CONTRACT.md §12). 이 줄이 없으면
    캔버스가 Studio sandbox Preview 에서만 조용히 빠진다: 공개 화면도,
    Studio native Preview 도, 공개 sandbox 도 멀쩡한데 그 한 화면만
    표시 위치가 빈 채로 그려진다.

    판정과 복사는 계약 파일 하나에 맡긴다(skin/skin-home-canvas.js) —
    이 파일이 칸 목록을 한 벌 더 갖지 않게.
  */
  if (
    opts.skin.canvas &&
    typeof coerceSkinHomeCanvasRenderPayload === "function"
  ) {

    const canvas =
      coerceSkinHomeCanvasRenderPayload(opts.skin.canvas);

    if (canvas) {
      template.canvas = canvas;
    }

  }


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

      /* SANDBOX-6A — 같은 프레임에 다시 그렸다. Select 상태를
         다시 내려보낸다(flushSandboxInspectState 머리말). */
      flushSandboxInspectState();

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

      },

      /*
        SANDBOX-6A — 프레임의 Element Inspector 가 올려보내는
        hover/선택/좌표. 여기서 좌표만 이 문서의 것으로 옮겨
        native 와 **같은 메시지 이름**으로 Studio 에 올린다.
      */

      onInspect: handleSandboxInspect
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

  /* SANDBOX-6A — 새 프레임(realm)이다. 그 안의 Inspector 는 꺼진
     채로 시작하므로 여기서 Studio 의 Select 상태를 다시 세운다. */
  flushSandboxInspectState();


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


/* =========================================================
   SANDBOX-6A — 프레임 좌표를 이 문서의 좌표로

   안쪽 iframe 이 이 문서에서 차지한 자리를 더한다. 그것이 전부다 —
   배율도 스크롤 보정도 없다(안쪽 프레임은 width:100% 이고 자기
   안에 스크롤이 없다. 높이는 IMORY_HEIGHT 가 맞춘다).

   프레임이 없으면 null — 좌표 없는 사각형을 만들지 않는다.
========================================================== */

function sandboxInspectRectToPreview(rect) {

  if (!rect || !hasSandboxPreviewFrame()) {
    return null;
  }


  const box =
    sandboxHandle.iframe.getBoundingClientRect();


  return {
    left: box.left + rect.left,
    top: box.top + rect.top,
    width: rect.width,
    height: rect.height
  };

}


/* hover/selected 한 칸 — 좌표만 옮기고 나머지는 그대로 옮겨 적는다 */

function sandboxInspectTarget(value) {

  if (!value || typeof value !== "object") {
    return null;
  }


  const rect =
    sandboxInspectRectToPreview(value.rect);

  if (!rect) {
    return null;
  }


  const mapped = {
    editId: typeof value.editId === "string" ? value.editId : null,
    rect: rect,

    /*
      ★ visibleRect 를 따로 만들지 않는다. native 에서 그 값은
      "조상 overflow 가 잘라낸 뒤 실제로 보이는 자리"이고, 자르기
      프레임 때문에 필요했다. 이번 라운드의 sandbox 는 자르기를
      켜지 않으므로 둘이 언제나 같다 — 없는 구분을 있는 척하지
      않는다(Studio 는 visibleRect 가 없으면 rect 를 쓴다).
    */
    visibleRect: rect
  };

  if (typeof value.tagName === "string") {
    mapped.tagName = value.tagName;
  }

  /* SANDBOX-SELECT-PARITY-1 — 자유 배치 끌기의 기준(부모 안쪽 폭/높이).
     프로토콜이 숫자 넷만 통과시켰다. 좌표계와 무관한 크기라 옮기지
     않고 새 리터럴로만 적는다. */
  if (value.metrics && typeof value.metrics === "object") {
    mapped.metrics = {
      width: value.metrics.width,
      height: value.metrics.height,
      parentWidth: value.metrics.parentWidth,
      parentHeight: value.metrics.parentHeight
    };
  }

  return mapped;

}


/* 겹친 후보 한 칸 — 좌표만 옮긴다 */

function sandboxInspectCandidate(value) {

  const target =
    sandboxInspectTarget(value);

  if (!target || !target.editId) {
    return null;
  }

  return {
    editId: target.editId,
    tagName: target.tagName || null,
    rect: target.rect,
    visibleRect: target.visibleRect,
    outer: value.outer === true,
    current: value.current === true
  };

}


/* 프레임 뷰포트의 한 점 → 이 문서의 점 */

function sandboxInspectPointToPreview(x, y) {

  const rect =
    sandboxInspectRectToPreview({ left: x, top: y, width: 0, height: 0 });

  return rect ? { x: rect.left, y: rect.top } : null;

}


/* =========================================================
   handleSandboxInspect(kind, payload)

   host 가 renderSeq 를 이미 확인했다. 여기서 하는 일은 좌표
   변환과, native 와 **같은 메시지 이름**으로 부모에 올리는 것이다.

   ★ remote:true 한 칸을 더한다. Studio 는 그 표식을 보고 자기
     hover/선택 테두리를 그리지 않는다 — 테두리는 프레임 안에서
     이미 그려져 있고, 둘 다 그리면 겹쳐 보인다. 팝오버 자리는
     여전히 이 좌표로 잡는다.
========================================================== */

/* =========================================================
   SANDBOX-SELECT-PARITY-1 — 이 문서가 스크롤돼도 좌표를 다시 올린다

   프레임이 보내는 사각형은 **프레임 뷰포트** 기준이다. 이 문서
   (Preview)가 스크롤되면 프레임 안 좌표는 그대로이므로 프레임은
   아무것도 다시 보내지 않는다 — 그런데 Studio 의 이름표 · Quick Bar
   · 팝오버 자리는 이 문서 좌표가 필요하다. native 는 스크롤마다
   rects 를 다시 보낸다(preview-bridge.js scheduleInspectorRects).

   그래서 마지막으로 받은 hover/선택 사각형(프레임 좌표 그대로)을
   들고 있다가, 스크롤 · 리사이즈 때 **지금 iframe 자리로** 다시
   옮겨 올린다. 선택이 없으면 보내지 않는다 — selected:null 은
   Studio 에게 "그 요소가 사라졌다"로 읽힌다(§Q-7 의 함정).
========================================================== */

let sandboxInspectLastHover =
  null;

let sandboxInspectLastSelected =
  null;


export function refreshSandboxPreviewInspectRects() {

  if (
    typeof sandboxInspectRelay !== "function" ||
    !sandboxInspectEnabled ||
    !sandboxInspectLastSelected ||
    !hasSandboxPreviewFrame()
  ) {
    return false;
  }

  const selected =
    sandboxInspectTarget(sandboxInspectLastSelected);

  if (!selected) {
    return false;
  }

  sandboxInspectRelay({
    type: "preview:inspect-rects",
    remote: true,
    hover: sandboxInspectTarget(sandboxInspectLastHover),
    selected
  });

  return true;

}


function rememberSandboxInspectRects(kind, payload) {

  if (kind === "hover") {
    sandboxInspectLastHover = payload && payload.editId ? payload : null;
    return;
  }

  if (kind === "select") {
    sandboxInspectLastSelected = payload && payload.editId ? payload : null;
    return;
  }

  if (kind === "rects") {
    sandboxInspectLastHover = payload.hover || null;
    sandboxInspectLastSelected = payload.selected || null;
  }

}


function handleSandboxInspect(kind, payload) {

  if (typeof sandboxInspectRelay !== "function") {
    return;
  }

  rememberSandboxInspectRects(kind, payload);


  if (kind === "error") {

    /*
      진단용이다. 화면을 바꾸지 않는다 — "고를 수 없는 자리를
      눌렀다"가 오류 화면이 되어서는 안 된다(지시문 4절).
    */

    return;

  }


  if (kind === "hover") {

    const hover =
      sandboxInspectTarget(payload);

    sandboxInspectRelay({
      type: "preview:inspect-hover",
      remote: true,
      editId: hover ? hover.editId : null,
      tagName: hover ? (hover.tagName || null) : null,
      rect: hover ? hover.rect : null,
      visibleRect: hover ? hover.visibleRect : null
    });

    return;

  }


  /*
    HOME-CANVAS-SELECT-1B-2 — 프레임의 캔버스 선택 **제안**.

    여기서도 해석하지 않는다 — 알려진 칸만 옮겨 Studio 로 올린다.
    그 id 들이 실제로 고를 수 있는 것인지, 무엇과 합쳐야 하는지는
    Studio 가 자기 draft 로 정한다(studio/inspector/studio-canvas-selection.js
    proposeStudioCanvasSelection).
  */
  if (kind === "canvas-propose") {

    sandboxInspectRelay({
      type: "preview:canvas-propose",
      remote: true,
      ids: Array.isArray(payload.ids) ? payload.ids.slice() : [],
      primaryId: typeof payload.primaryId === "string" ? payload.primaryId : null,
      mode: payload.mode === "toggle" ? "toggle" : "replace",
      generation: Number.isInteger(payload.generation) ? payload.generation : 0
    });

    return;

  }


  /*
    HOME-CANVAS-V2-ELEMENTS-1 — v2 프레임의 **페이지 자리**.

    여기서도 해석하지 않는다 — 알려진 칸만 옮겨 Studio 로 올린다.
    단위는 도화지 폭의 분수이고(프로토콜의 CANVAS_LAYOUT 주석),
    그것을 Canvas 좌표로 읽는 것도 무엇에 쓰는지도 Studio 가 한다.
  */
  if (kind === "canvas-layout") {

    sandboxInspectRelay({
      type: "preview:canvas-layout",
      remote: true,
      frames:
        Array.isArray(payload.frames)
          ? payload.frames.map(
              (frame) => ({ id: frame.id, x: frame.x, y: frame.y })
            )
          : [],

      /* HOME-CANVAS-V2-MANUAL-FIX-1 — 블록의 그려진 높이
         (도화지 폭의 분수 · 계약 §29-3) */
      blocks:
        Array.isArray(payload.blocks)
          ? payload.blocks.map((block) => ({ id: block.id, h: block.h }))
          : [],

      /* HOME-CANVAS-V2-MANUAL-FIX-1 — 고른 요소가 물려받고 있는
         모양(계약 §29-6). 여기서도 해석하지 않는다. */
      look:
        (payload.look && typeof payload.look === "object")
          ? { id: payload.look.id, props: { ...payload.look.props } }
          : null
    });

    return;

  }


  /*
    HOME-CANVAS-TRANSFORM-1A · 1B — 프레임의 이동 · 리사이즈
    **확정 요청**.

    여기서도 해석하지 않는다 — 알려진 칸만 옮겨 Studio 로 올린다.
    그 값을 실제로 써도 되는지(선택 · 순번 · expected · 범위)는
    Studio 가 자기 draft 로 정한다
    (studio/inspector/studio-canvas-selection.js
     commitStudioCanvasElementTransform).

    ★ 옮기는 칸은 `kind` 가 정한다. 프로토콜이 이미 그 kind 의
      모양만 통과시켰으므로(isSandboxCanvasPoint / …Box) 여기서는
      그 모양을 그대로 새 리터럴로 옮긴다 — 이동 요청에 width 칸을
      만들어 두면 Studio 의 "정확히 이 키들" 판정에 걸린다.
  */
  if (kind === "canvas-transform") {

    const box =
      (value) => {

        /* HOME-CANVAS-TRANSFORM-1C — 회전은 **각도 한 칸**이다 */
        if (payload.kind === "rotate") {
          return { rotation: value.rotation };
        }

        const out = { x: value.x, y: value.y };

        if (payload.kind === "resize") {
          out.width = value.width;
          out.height = value.height;
        }

        return out;

      };

    sandboxInspectRelay({
      type: "preview:canvas-transform",
      remote: true,
      kind: payload.kind,
      id: payload.id,
      expected: box(payload.expected),
      next: box(payload.next),
      generation: Number.isInteger(payload.generation) ? payload.generation : 0,
      requestId: Number.isInteger(payload.requestId) ? payload.requestId : 0
    });

    return;

  }


  if (kind === "select") {

    const selected =
      sandboxInspectTarget(payload);

    /* 프레임이 정한 선택을 이쪽 기억에도 남긴다 — 프레임이 새로
       만들어졌을 때 되살리려면 필요하다. */

    sandboxInspectEditId =
      selected ? selected.editId : null;

    sandboxInspectRelay({
      type: "preview:inspect-select",
      remote: true,
      editId: selected ? selected.editId : null,
      tagName: selected ? (selected.tagName || null) : null,
      rect: selected ? selected.rect : null,
      visibleRect: selected ? selected.visibleRect : null,

      /*
        ★ metrics 는 **끌기에 필요한 넷**뿐이다(요소 크기 · 부모 안쪽
        폭/높이 — SANDBOX-SELECT-PARITY-1). 이미지 자연 크기는 없다 —
        크기 조절 · 자르기는 sandbox 에서 열지 않으므로 없는 값을 0 으로
        지어내지 않는다.
      */
      metrics: selected && selected.metrics ? selected.metrics : null
    });

    return;

  }


  /* =====================================================
     SANDBOX-SELECT-PARITY-1 — 겹친 후보 · 더블클릭 글자 · 본체 끌기

     native 와 **같은 메시지 이름**으로 올린다(preview:inspect-pick /
     -text / -drag). 좌표만 이 문서의 것으로 옮기고, 나머지는 새
     리터럴로 옮겨 적는다. remote:true 는 Studio 가 "프레임에서 온
     것"으로 알아 한 겹 더 거르게 하는 표식이다.
  ====================================================== */

  if (kind === "candidates") {

    const point =
      payload.point ? sandboxInspectPointToPreview(payload.point.x, payload.point.y) : null;

    const candidates =
      Array.isArray(payload.candidates)
        ? payload.candidates.map(sandboxInspectCandidate)
        : [];

    if (!point || !candidates.length || candidates.some((entry) => !entry)) {
      return;
    }

    sandboxInspectRelay({
      type: "preview:inspect-pick",
      remote: true,
      point,
      candidates
    });

    return;

  }


  if (kind === "text") {

    sandboxInspectRelay({
      type: "preview:inspect-text",
      remote: true,
      phase: payload.phase,
      editId: payload.editId,
      text: payload.text
    });

    return;

  }


  if (kind === "drag") {

    /* native 의 x/y 는 Preview 문서 좌표다 — 같은 좌표계로 옮긴다 */
    const point =
      sandboxInspectPointToPreview(payload.x, payload.y);

    if (!point) {
      return;
    }

    sandboxInspectRelay({
      type: "preview:inspect-drag",
      remote: true,
      phase: payload.phase,
      x: point.x,
      y: point.y
    });

    return;

  }


  if (kind === "rects") {

    sandboxInspectRelay({
      type: "preview:inspect-rects",
      remote: true,
      hover: sandboxInspectTarget(payload.hover),
      selected: sandboxInspectTarget(payload.selected)
    });

  }

}


/* =========================================================
   setSandboxPreviewInspectRelay(fn)

   부모 문서(preview-bridge.js)가 "프레임의 inspect 결과를 여기로
   올려 달라"고 꽂아 주는 창구. 이 파일은 Studio 와 직접 말하지
   않는다 — postMessage 경로는 bridge 한 곳이다.
========================================================== */

export function setSandboxPreviewInspectRelay(fn) {

  sandboxInspectRelay =
    typeof fn === "function" ? fn : null;

}


/* =========================================================
   setSandboxPreviewInspectMode(enabled)
   setSandboxPreviewInspectSelection(editId|null)

   Studio 의 Select 토글과 선택이 여기로 내려온다. 프레임이 아직
   없으면 값만 기억해 두고, 렌더가 끝나면 그때 보낸다
   (flushSandboxInspectState).
========================================================== */

export function setSandboxPreviewInspectMode(enabled) {

  sandboxInspectEnabled =
    !!enabled;

  if (!sandboxInspectEnabled) {
    sandboxInspectEditId = null;
    sandboxInspectCaps = null;
    sandboxInspectLastHover = null;
    sandboxInspectLastSelected = null;

    /* HOME-CANVAS-SELECT-1B-1 — Select 를 끄면 캔버스 선택도 없다.
       Studio 쪽도 같은 순간에 풀어 해제 메시지를 보내지만, 그것이
       늦거나 유실돼도 이 기억이 남아 다음 렌더에서 되살아나지
       않게 한다. */
    sandboxCanvasSelection = null;

    /* HOME-CANVAS-TRANSFORM-1A — 좌표도 같이 버린다 */
    sandboxCanvasGeometry = null;
  }

  if (!hasSandboxPreviewFrame()) {
    return false;
  }

  return sendSandboxInspectMode(sandboxHandle, sandboxInspectEnabled);

}


export function setSandboxPreviewInspectSelection(editId) {

  sandboxInspectEditId =
    (typeof editId === "string" && editId) ? editId : null;

  /* 다른 요소(또는 해제)로 바뀌었으면 기억한 사각형은 옛 요소의 것이다 —
     스크롤 보정이 그 자리를 새 선택에 붙이지 않게 버린다 */
  if (!sandboxInspectLastSelected || sandboxInspectLastSelected.editId !== sandboxInspectEditId) {
    sandboxInspectLastSelected = null;
  }

  if (!hasSandboxPreviewFrame()) {
    return false;
  }

  return sendSandboxInspectPick(sandboxHandle, sandboxInspectEditId);

}


/* =========================================================
   HOME-CANVAS-SELECT-1B-1 — 캔버스 선택을 프레임으로

   setSandboxPreviewCanvasSelection(selection) -> boolean

   selection = { active, ids[], primaryId|null, generation }

   ★ 여기서 판단하지 않는다. "고를 수 있는 요소인가"는 Studio 가
     자기 draft 에서 이미 정했고(studio-canvas-selection.js), 프레임은
     받은 id 를 자기 DOM 에서 한 번 더 확인한다. 이 함수는 옮기기만
     한다.
========================================================== */

export function setSandboxPreviewCanvasSelection(selection) {

  const value =
    (selection && typeof selection === "object")
      ? selection
      : { editing: false, active: false, ids: [], primaryId: null, generation: 0 };

  /* 렌더 뒤에 다시 보낼 것은 **편집이 켜져 있을 때**다(아래
     flushSandboxInspectState). 1B-1 에서는 "고른 것이 있을
     때뿐"이었지만, 이제 빈 선택으로도 lasso 가 돌아야 한다. */
  sandboxCanvasSelection =
    value.editing === true ? value : null;

  if (!hasSandboxPreviewFrame()) {
    return false;
  }

  /*
    ★ 해제에도 **받은 그 generation** 을 그대로 싣는다.

    프레임은 자기가 본 것보다 낮은 번호를 버린다. 여기서 0 을
    만들어 보내면 이미 3번 선택을 본 프레임이 "0번 해제"를 옛
    메시지로 보고 버려서, 선택을 풀었는데 틀만 남는다
    (2026-09-21 이 테스트가 실제로 잡았다).
  */

  return sendSandboxCanvasSelect(sandboxHandle, value);

}


/* =========================================================
   HOME-CANVAS-TRANSFORM-1A — 단일 선택의 Canvas 좌표를 프레임으로

   setSandboxPreviewCanvasGeometry(geometry) -> boolean

   ★ 여기서 판단하지 않는다. "옮길 수 있는 단독 선택인가"는 Studio 가
     자기 draft 에서 이미 정했다(studio-canvas-selection.js). 이 함수는
     선택 메시지와 똑같이 **옮기기만** 한다.

   ★ 해제(active:false)도 기억한다. 선택과 달리 이 값은 렌더 뒤에
     다시 보내야 할 이유가 "켜져 있을 때"로 한정되지 않는다 — 프레임
     쪽이 옛 좌표를 들고 있으면 안 되기 때문이다.
========================================================== */

export function setSandboxPreviewCanvasGeometry(geometry) {

  const value =
    (geometry && typeof geometry === "object")
      ? geometry
      : { active: false, generation: 0 };

  /* ★ 기억해 두는 값에는 답 번호를 남기지 않는다. 이 값은 렌더 뒤에
     한 번 더 내려가는데(flushSandboxInspectState), 거기서 옛 답이
     다시 답으로 읽히면 안 된다(계약 §17-8). */
  sandboxCanvasGeometry =
    { ...value, answering: 0 };

  if (!hasSandboxPreviewFrame()) {
    return false;
  }

  return sendSandboxCanvasGeometry(sandboxHandle, value);

}


/* =========================================================
   SANDBOX-SELECT-PARITY-1 — Studio 의 직접 조작 지시를 프레임으로

   forwardSandboxPreviewInspectDirective(data) -> boolean

   preview-bridge.js 가 native 문서에서 처리하던 넷을, sandbox 가
   화면을 맡고 있을 때 여기로 넘긴다:

     preview:inspector-caps     → INSPECT_CAPS
     preview:inspector-choose   → INSPECT_CHOOSE
     preview:inspector-parent   → INSPECT_PARENT
     preview:inspect-preview    → INSPECT_PREVIEW (글자 · 자유 배치 좌표만)

   ★ 임시 미리보기 중 **이미지 너비 · 자르기**는 옮기지 않는다 — 그
     컨트롤은 sandbox 에서 열리지 않는다. 옮길 칸이 하나도 없으면
     보내지 않는다(host 가 거절한다).

   처리했으면(= 이 메시지가 넷 중 하나였으면) true.
========================================================== */

export function forwardSandboxPreviewInspectDirective(data) {

  if (!data || typeof data.type !== "string") {
    return false;
  }

  const handled =
    data.type === "preview:inspector-caps" ||
    data.type === "preview:inspector-choose" ||
    data.type === "preview:inspector-parent" ||
    data.type === "preview:inspect-preview";

  if (!handled) {
    return false;
  }

  if (!hasSandboxPreviewFrame() || !sandboxInspectEnabled) {
    return true;
  }

  if (data.type === "preview:inspector-caps") {
    sandboxInspectCaps = {
      editId: typeof data.editId === "string" ? data.editId : null,
      movable: data.movable === true,
      textEditable: data.textEditable === true
    };
    sendSandboxInspectCaps(sandboxHandle, sandboxInspectCaps);
    return true;
  }

  if (data.type === "preview:inspector-choose") {
    sendSandboxInspectChoose(sandboxHandle, Number(data.index));
    return true;
  }

  if (data.type === "preview:inspector-parent") {
    sendSandboxInspectParent(sandboxHandle);
    return true;
  }

  if (data.clear === true) {
    sendSandboxInspectPreview(sandboxHandle, { clear: true });
    return true;
  }

  const position =
    (data.layoutPosition && typeof data.layoutPosition === "object") ? data.layoutPosition : null;

  const ratio = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : undefined;
  };

  sendSandboxInspectPreview(sandboxHandle, {
    editId: data.editId,
    text: typeof data.text === "string" ? data.text : undefined,
    layoutX: position ? ratio(position.x) : undefined,
    layoutY: position ? ratio(position.y) : undefined
  });

  return true;

}


/* =========================================================
   flushSandboxInspectState()

   렌더가 끝난 **직후**에 부른다.

   ★ 왜 매 렌더마다 다시 보내는가

   저자 JS 가 얽힌 렌더에서는 프레임(realm)이 통째로 새로 만들어
   진다(needs-new-realm). 그 realm 의 Inspector 는 꺼진 채로
   시작하므로, 여기서 다시 켜 주지 않으면 "Select 를 켜 뒀는데
   JS 를 한 글자 고치니 아무것도 안 잡힌다"가 된다.

   같은 realm 을 재사용하는 보통의 렌더에서는 이 두 메시지가
   이미 맞는 값을 한 번 더 보내는 것뿐이라 아무 일도 하지 않는다
   (프레임 쪽 setEnabled 는 값이 같으면 첫 줄에서 빠져나간다).
========================================================== */

function flushSandboxInspectState() {

  if (!hasSandboxPreviewFrame()) {
    return;
  }


  sendSandboxInspectMode(sandboxHandle, sandboxInspectEnabled);


  if (sandboxInspectEnabled && sandboxInspectEditId) {

    sendSandboxInspectPick(sandboxHandle, sandboxInspectEditId);

    /* 새 realm 이면 caps 도 잃었다 — 같은 선택의 것만 다시 */
    if (sandboxInspectCaps && sandboxInspectCaps.editId === sandboxInspectEditId) {
      sendSandboxInspectCaps(sandboxHandle, sandboxInspectCaps);
    }

  }


  /*
    HOME-CANVAS-SELECT-1B-1 — 캔버스 선택도 같은 사정이다. 새
    realm 의 runtime 은 아직 없고, 같은 realm 이라도 renderSeq 가
    올랐으므로 프레임은 옛 번호의 메시지를 이미 버렸다.

    ★ 편집이 켜져 있지 않으면 **보내지 않는다** — 꺼진 상태를
      보내는 것만으로도 프레임이 runtime 을 받아 오게 하지 않는다
      (프레임 쪽에서도 한 겹 더 막는다). 1B-2 에서 기준이
      "고른 것이 있는가"에서 "편집이 켜졌는가"로 옮겨졌다.
  */

  if (sandboxCanvasSelection && sandboxCanvasSelection.editing === true) {

    sendSandboxCanvasSelect(sandboxHandle, sandboxCanvasSelection);

    /* HOME-CANVAS-TRANSFORM-1A — 좌표도 같은 사정이다. 프레임은
       렌더마다 옛 좌표를 버리므로(skin/sandbox/skin-sandbox-frame.js)
       여기서 다시 주지 않으면 이동이 켜지지 않는다. */
    if (sandboxCanvasGeometry) {
      sendSandboxCanvasGeometry(sandboxHandle, sandboxCanvasGeometry);
    }

  }

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
