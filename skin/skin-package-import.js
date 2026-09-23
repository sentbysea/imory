/* =========================================================
   SKIN PACKAGE IMPORT (PHASE 1 Final Gap — Whole SkinPackage Import)

   PHASE 1E: templates.banner(선택 필드)도 이 함수가 함께 검증/
   sanitize한다 — 아래 requiredPageTypes 루프 바로 다음의 banner
   블록 참고. required가 아니므로 기존 3종 SkinPackage JSON은
   지금까지와 100% 동일하게 통과한다.

   기존 route-aware Code Editor(studio/editor/code-editor.js)는
   "지금 Preview가 보고 있는 페이지 하나"의 html/css만 편집한다 —
   templates.category/post가 아예 없는 HOME-only Skin에서는 그
   페이지의 CODE 버튼 자체가 비활성화되어(studio/studio-preview.js
   resolveCodeEditorSource) 페이지별로 하나씩 붙여넣는 방법이
   없다. 이 파일은 그 갭을 메우는 "SkinPackage JSON 문자열 하나
   전체"를 검증하는 유일한 지점이다.

   책임: rawJsonText(사용자가 textarea에 붙여넣은 원문) -> 구조
   검사 -> sanitize/validate -> 안전한 새 SkinPackage 객체. DOM
   교체/Preview 재렌더/Save는 전혀 하지 않는다(studio/studio-preview.js
   applyImportedSkinPackage()의 몫, 22절 파일 책임 분리 원칙과 동일한
   결) — 이 파일은 순수 검증 함수 하나만 노출한다.

   재사용(새로 만들지 않음): sanitizeSkinHTML(skin/skin-sanitize.js),
   window.validateAndScopeSkinCss(skin/skin-css-validate.js,
   window.skinInitializerReady 핸드셰이크로 로드 완료를 기다림 —
   studio/editor/code-editor.js와 동일 패턴), htmlHasPostBodyRegion
   (skin/skin-template.js — PHASE 1C-J에서 studio-preview.js 안에
   있던 것을 이번 Slice에서 공용화).

   안전 원칙: JSON.parse()로 얻은 원본 객체를 어디서도 그대로
   스프레드(`{...parsed}`)하지 않는다 — 스프레드는 [[Set]]으로
   프로퍼티를 옮기므로, parsed에 "__proto__"라는 own enumerable
   문자열 키가 있으면 새 객체의 내부 prototype이 그 값으로 바뀌는
   결과를 만들 수 있다(전역 Object.prototype 오염은 아니지만, 이
   함수가 만드는 결과 객체 하나의 동작을 예측 불가능하게 만들 수
   있다). 그래서 각 필드를 항상 `parsed.templates?.home?.html`처럼
   명시적으로 하나씩 읽어 새 리터럴에 담는다 — 알려지지 않은/
   허용되지 않은 추가 필드는 결과에 자동으로 섞여 들어올 수 없다.

   실패(ok:false)는 무엇을 검증하다 실패했든 항상 같은 모양
   { ok:false, message }만 돌려준다 — 호출자(import-editor.js)는
   이 메시지를 그대로 사용자에게 보여주기만 하면 된다. 이 함수
   자신은 어떤 전역 상태도(currentWorkingSkin 포함) 건드리지
   않으므로, 실패는 항상 "아무 일도 없었던 것"과 동일하다(요구사항
   7절 "전체 성공 또는 전체 실패의 atomic 동작").

   IMPORT-CSS-IMAGE-1: sanitize 와 CSS 판정은 아래
   runSkinPackageContentPipeline 이 한다 — Code 적용도 같은 함수를
   부른다. 실패의 모양은 그대로이고(message/reason), CSS 실패에는
   cssReport(줄·열·분류가 담긴 목록)가 더 붙는다.

   classic script — window.validateSkinPackageImport /
   window.runSkinPackageContentPipeline 로 노출된다.
   의존(먼저 로드되어야 함): sanitizeSkinHTML(skin/skin-sanitize.js),
   htmlHasPostBodyRegion(skin/skin-template.js),
   normalizeSkinPackageImageSlots(skin/skin-package-images.js),
   window.skinInitializerReady 핸드셰이크(skin/skin-initializer.js —
   그 뒤에 window.analyzeSkinCss 가 있다).
========================================================== */

const SKIN_PACKAGE_CONTENT_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder", "highlights", "memos", "dock"];


/* =========================================================
   runSkinPackageContentPipeline(candidate, options) -> result
   (IMPORT-CSS-IMAGE-1)

   SkinPackage 가 Studio working draft 로 들어오는 **모든 입구**가
   이 함수 하나를 지난다 — 입구마다 검사기를 따로 두면 "Import 는
   통과했는데 Code 적용은 거부"하는 식으로 규칙이 갈라진다.

     Import 창의 Validate / Apply to Draft   validateSkinPackageImport
     AI 전체 · AI 선택 요소                  validateSkinPackageImport
     Code 적용                                studio-preview.js
                                              applyCodeEditorChanges
     Export → 다시 Import                     validateSkinPackageImport

   순서는 고정이다:
     1) 이미지 슬롯 정규화 (skin/skin-package-images.js) — sanitize
        **전에** 해야 한다. AI 의 `src="imory-attachment:1"` 은
        https 가 아니라 sanitizer 가 src 를 지워 버린다.
     2) HTML sanitize (skin/skin-sanitize.js)
     3) CSS 판정 (skin/skin-css-validate.js analyzeSkinCss, strict) —
        문제된 선언만 잘라낸 CSS 가 저장·Export 에 들어간다.

   candidate 는 이미 "알려진 필드만 담은" 객체여야 한다(Import 는
   아래에서 새 리터럴을 만들고, Code 적용은 working draft 에서 만든다).
   이 함수는 templates/html/css/imageSlots 만 바꾸고 나머지 필드는
   그대로 옮긴다.

   options.attachments: AI 요청에 붙인 첨부([{ aspectRatioHint }]).

   result = { ok, reason?, message?, skinPackage?, cssReport,
              slotReport, notices: string[], htmlWasModified }
========================================================== */

async function runSkinPackageContentPipeline(candidate, options) {

  await window.skinInitializerReady;

  const attachments =
    (options && Array.isArray(options.attachments)) ? options.attachments : [];

  const templatesIn =
    (candidate.templates && typeof candidate.templates === "object") ? candidate.templates : null;

  const rawHtmlByPage = {};

  if (templatesIn) {
    SKIN_PACKAGE_CONTENT_PAGE_TYPES.forEach((pageType) => {
      const template = templatesIn[pageType];
      if (template && typeof template.html === "string") {
        rawHtmlByPage[pageType] = template.html;
      }
    });
  }

  /* 1) 이미지 슬롯 */
  const slots =
    typeof normalizeSkinPackageImageSlots === "function"
      ? normalizeSkinPackageImageSlots(
          {
            templates: rawHtmlByPage,
            legacyHtml: typeof candidate.html === "string" ? candidate.html : undefined,
            imageSlots: candidate.imageSlots
          },
          { attachments }
        )
      : {
          templates: rawHtmlByPage,
          legacyHtml: candidate.html,
          imageSlots: Array.isArray(candidate.imageSlots) ? candidate.imageSlots : [],
          report: null
        };

  /* 2) sanitize */
  let htmlWasModified = false;

  const sanitize = (html) => {
    const clean = sanitizeSkinHTML(html);
    if (clean !== html) {
      htmlWasModified = true;
    }
    return clean;
  };

  const output = {};

  Object.keys(candidate).forEach((key) => {
    if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      output[key] = candidate[key];
    }
  });

  if (templatesIn) {

    const templatesOut = {};

    Object.keys(templatesIn).forEach((pageType) => {

      const template = templatesIn[pageType];

      if (typeof slots.templates[pageType] === "string") {
        templatesOut[pageType] = { ...template, html: sanitize(slots.templates[pageType]) };
      } else {
        templatesOut[pageType] = template;
      }

    });

    output.templates = templatesOut;

  }

  if (typeof candidate.html === "string") {
    output.html = sanitize(slots.legacyHtml);
  }

  output.imageSlots = slots.imageSlots;

  /* 3) CSS */
  const cssReport =
    window.analyzeSkinCss(
      typeof candidate.css === "string" ? candidate.css : "",
      { mode: "strict" }
    );

  const notices =
    (typeof describeSkinImageSlotReport === "function" && slots.report)
      ? describeSkinImageSlotReport(slots.report)
      : [];

  if (!cssReport.ok) {
    return {
      ok: false,
      reason: "css-validator",
      message: "CSS에 문제가 있어 가져올 수 없습니다 — " + cssReport.summary,
      cssReport,
      slotReport: slots.report,
      notices,
      htmlWasModified
    };
  }

  output.css = cssReport.css;

  return {
    ok: true,
    skinPackage: output,
    cssReport,
    slotReport: slots.report,
    notices,
    htmlWasModified
  };

}

/*
  실패 반환에는 message(사용자용 문장)와 함께 reason(짧은 내부
  식별자)이 들어간다 — PHASE AI-6B.1. Import 화면은 지금까지처럼
  message만 쓰고, AI 경로(studio/ai/studio-ai-panel.js)는 사용자에게
  짧은 문장 하나를 보여주면서 콘솔/로그에는 **어느 검사가 거부했는지**
  를 남긴다(요구사항 9절).

  reason 값: empty-input / json-parse / not-object / schema-version /
  render-mode / author-js / templates-missing / required-template /
  banner-template / folder-template / highlights-template /
  dock-template / bottom-dock / home-canvas / css-type /
  post-body-region / folder-body-region / css-validator.

  home-canvas 실패에는 canvasErrorPath(`regions[2].canvas.elements[1].width`)
  가 함께 온다 — message 안에도 같은 경로가 들어 있다.

  sanitizeSkinHTML()은 거부하지 않고 **조용히 지운다** — 그래서
  "sanitizer violation"이라는 reason은 존재할 수 없다. 허용되지 않은
  태그/속성이 들어오면 검증은 통과하고 그 부분만 사라진다.
*/
async function validateSkinPackageImport(rawJsonText, options) {

  if (typeof rawJsonText !== "string" || !rawJsonText.trim()) {
    return { ok: false, reason: "empty-input", message: "가져올 SkinPackage JSON을 입력해주세요." };
  }

  let parsed;

  try {
    parsed = JSON.parse(rawJsonText);
  } catch (err) {
    return { ok: false, reason: "json-parse", message: "JSON 형식이 올바르지 않습니다: " + err.message };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "not-object", message: "SkinPackage는 최상위가 객체({...})여야 합니다." };
  }

  if (parsed.schemaVersion !== 1) {
    return { ok: false, reason: "schema-version", message: "schemaVersion은 1이어야 합니다." };
  }

  /*
    SANDBOX-1 — renderMode(선택). IMORY_SANDBOX_SKIN_DESIGN.md §C.

    없으면 native다(키를 만들지 않는다 — banner template과 같은
    이유로, 없는 스킨의 저장 JSON에 죽은 키를 남기지 않는다).
    있으면 **아는 값이어야 한다**: 모르는 값을 조용히 native로
    접으면 "sandbox라고 적었는데 native로 그려지는" 상태가 파일만
    보고는 구분되지 않는다. 오탈자를 성공으로 착각하게 두지 않는
    banner-template/folder-template와 같은 판단이다.

    schemaVersion은 1 그대로다 — 2로 올리면 renderMode를 모르는
    기존 배포가 그 스킨을 legacy 화면으로 통째로 폴백시킨다.
  */

  const renderModeInput =
    parsed.renderMode;

  const hasRenderMode =
    renderModeInput !== undefined &&
    renderModeInput !== null;

  if (
    hasRenderMode &&
    !(
      typeof isKnownSkinRenderMode === "function" &&
      isKnownSkinRenderMode(renderModeInput)
    )
  ) {
    return {
      ok: false,
      reason: "render-mode",
      message: 'renderMode는 "native" 또는 "sandbox"여야 합니다.'
    };
  }

  /*
    SANDBOX-5A — js(선택). IMORY_SANDBOX_SKIN_DESIGN.md §O.

    ★ 여기서 sanitize 하지 않는다. HTML 은 태그를 지워서 안전하게
    만들 수 있지만 JS 는 그런 종류가 아니다 — 이 문자열의 안전은
    **어디서 실행되는가**가 지킨다(부모와 다른 origin, connect-src
    'none', 부모 DOM 접근 불가). 그래서 검사는 타입과 길이 둘뿐이다
    (skin/skin-template.js isValidSkinAuthorJs).

    ★ 빈 문자열은 통과한다. "JS 를 다 지운 스킨"과 "JS 필드가 없는
    스킨"을 구분해서 보존해야 Import -> Export -> Import 왕복에서
    값이 사라지지 않는다(renderMode:"native" 를 명시한 파일을
    보존하는 것과 같은 판단).

    ★ 문자열이 아니거나 너무 길면 **거부**다(조용히 버리지 않는다).
    "저장은 됐는데 아무 일도 안 일어나는" 상태를 파일만 보고
    구분할 수 없게 두지 않는다 — renderMode 와 같은 판단이다.
  */

  const authorJsInput =
    parsed.js;

  const hasAuthorJs =
    authorJsInput !== undefined &&
    authorJsInput !== null;

  if (
    hasAuthorJs &&
    !(
      typeof isValidSkinAuthorJs === "function" &&
      isValidSkinAuthorJs(authorJsInput)
    )
  ) {
    return {
      ok: false,
      reason: "author-js",
      message:
        "js는 문자열이어야 하고 " +
        (
          typeof SKIN_PACKAGE_MAX_JS_CHARS === "number"
            ? SKIN_PACKAGE_MAX_JS_CHARS.toLocaleString()
            : "131,072"
        ) +
        "자를 넘을 수 없습니다."
    };
  }

  const templatesInput =
    parsed.templates;

  if (!templatesInput || typeof templatesInput !== "object" || Array.isArray(templatesInput)) {
    return { ok: false, reason: "templates-missing", message: "templates 필드가 필요합니다." };
  }

  const requiredPageTypes =
    ["home", "category", "post"];

  for (const pageType of requiredPageTypes) {

    const template =
      templatesInput[pageType];

    if (!template || typeof template !== "object" || typeof template.html !== "string") {
      return { ok: false, reason: "required-template", message: `templates.${pageType}.html이 필요합니다.` };
    }

  }

  /*
    PHASE 1E — templates.banner는 **선택**이다. 배너 화면까지 스킨을
    입히고 싶은 SkinPackage만 넣으면 되고, 없으면 그 사이트의 배너
    카테고리는 지금까지처럼 legacy 배너 화면으로 렌더된다
    (skin/skin-banner.js). 그래서 기존 HOME/CATEGORY/POST 3종만 가진
    JSON도 이 Import를 그대로 통과한다 — banner를 required에 넣으면
    이미 배포된 스킨 파일들이 전부 가져오기 불가능해진다.

    다만 "넣었는데 모양이 틀린" 경우는 조용히 무시하지 않고
    실패시킨다(오탈자를 성공으로 착각하게 두지 않는다).
  */

  const bannerTemplateInput =
    templatesInput.banner;

  const hasBannerTemplate =
    bannerTemplateInput !== undefined &&
    bannerTemplateInput !== null;

  if (
    hasBannerTemplate &&
    (
      typeof bannerTemplateInput !== "object" ||
      Array.isArray(bannerTemplateInput) ||
      typeof bannerTemplateInput.html !== "string"
    )
  ) {
    return { ok: false, reason: "banner-template", message: "templates.banner를 포함하려면 templates.banner.html이 문자열이어야 합니다." };
  }

  /*
    FOLDER-2 — templates.folder(폴더 페이지 / Series Viewer)도 banner와
    같은 **선택** 템플릿이다. 없으면 그 스킨에는 폴더 페이지가 없고,
    플랫폼은 폴더 링크(folderHref)를 노출하지 않는다. 있으면 POST와
    같이 글 본문 자리(post-body region)가 반드시 있어야 한다 — 폴더
    페이지는 글마다 본문을 이어 보여주는 화면이라 region이 없으면
    제목만 나열되는 반쪽짜리가 된다(IMORY_FOLDER2_DESIGN.md).
  */

  const folderTemplateInput =
    templatesInput.folder;

  const hasFolderTemplate =
    folderTemplateInput !== undefined &&
    folderTemplateInput !== null;

  if (
    hasFolderTemplate &&
    (
      typeof folderTemplateInput !== "object" ||
      Array.isArray(folderTemplateInput) ||
      typeof folderTemplateInput.html !== "string"
    )
  ) {
    return { ok: false, reason: "folder-template", message: "templates.folder를 포함하려면 templates.folder.html이 문자열이어야 합니다." };
  }

  /*
    HIGHLIGHT-2 — 하이라이트 화면 template 도 banner/folder와 같은
    **선택** 템플릿이다. 다만 폴백이 다르다: 없으면 그 화면이 사라지는
    게 아니라 플랫폼 기본 template으로 그려진다
    (skin/skin-template.js의 getDefaultHighlightsTemplate). 그래서 여기서
    강제하는 것은 "넣었으면 모양이 맞아야 한다" 하나뿐이고, POST/FOLDER
    같은 필수 region 검사는 없다 — 카드 안의 highlight-tools 자리는
    빠져도 화면이 깨지지 않고 주인장의 도구 버튼만 나오지 않는다.

    공식 이름은 templates.highlights 이고, HIGHLIGHT-1 이 쓴
    templates.memos 로 export 된 파일도 그대로 받는다 — 받은 이름을
    그대로 보존한다(memos 로 들어온 것을 highlights 로 고쳐 쓰지
    않는다). 둘 다 들어 있으면 highlights 만 쓰고 memos 는 버린다:
    같은 화면의 template 이 두 벌이면 어느 쪽이 그려질지 파일만
    보고는 알 수 없고, 렌더 우선순위(highlights 먼저)와 어긋나는
    쪽을 남겨 둘 이유가 없다.
  */

  const highlightsTemplateInput =
    templatesInput.highlights !== undefined && templatesInput.highlights !== null
      ? templatesInput.highlights
      : templatesInput.memos;

  const highlightsTemplateKey =
    templatesInput.highlights !== undefined && templatesInput.highlights !== null
      ? "highlights"
      : "memos";

  const hasHighlightsTemplate =
    highlightsTemplateInput !== undefined &&
    highlightsTemplateInput !== null;

  if (
    hasHighlightsTemplate &&
    (
      typeof highlightsTemplateInput !== "object" ||
      Array.isArray(highlightsTemplateInput) ||
      typeof highlightsTemplateInput.html !== "string"
    )
  ) {
    return {
      ok: false,
      reason: "highlights-template",
      message: `templates.${highlightsTemplateKey}를 포함하려면 templates.${highlightsTemplateKey}.html이 문자열이어야 합니다.`
    };
  }

  /*
    BOTTOM-DOCK-1 — templates.dock(선택). IMORY_BOTTOM_DOCK_DESIGN.md.

    banner/folder 와 같은 **선택** template 이지만 폴백은 하이라이트
    화면 쪽에 가깝다: 없으면 dock 이 사라지는 게 아니라 플랫폼 기본
    template 으로 그려진다(skin/skin-bottom-dock.js
    getDefaultSkinDockTemplate). 그래서 강제하는 것은 "넣었으면 모양이
    맞아야 한다" 하나뿐이고, 필수 region 검사는 없다.
  */

  const dockTemplateInput =
    templatesInput.dock;

  const hasDockTemplate =
    dockTemplateInput !== undefined &&
    dockTemplateInput !== null;

  if (
    hasDockTemplate &&
    (
      typeof dockTemplateInput !== "object" ||
      Array.isArray(dockTemplateInput) ||
      typeof dockTemplateInput.html !== "string"
    )
  ) {
    return {
      ok: false,
      reason: "dock-template",
      message: "templates.dock을 포함하려면 templates.dock.html이 문자열이어야 합니다."
    };
  }

  /*
    BOTTOM-DOCK-1 — bottomDock(선택). **설정**이지 마크업이 아니다.

    검증은 skin/skin-bottom-dock.js 의 normalizeSkinBottomDock 한
    곳에만 있다(Studio 폼 · Export · AI 응답 검사가 같은 함수를
    본다). 여기서는 그 결과를 그대로 쓰고, 실패 사유 문장도 그대로
    내보낸다 — 어느 항목의 무엇이 틀렸는지가 그 문장에 들어 있다.

    ★ 모양이 틀리면 거부한다(조용히 버리지 않는다). renderMode/js 와
      같은 판단이다: "저장은 됐는데 dock 이 안 나오는" 상태를 파일만
      보고 구분할 수 없게 두지 않는다.
  */

  let normalizedBottomDock =
    null;

  if (
    parsed.bottomDock !== undefined &&
    parsed.bottomDock !== null
  ) {

    if (typeof normalizeSkinBottomDock !== "function") {

      return {
        ok: false,
        reason: "bottom-dock",
        message: "이 배포는 아직 bottomDock을 지원하지 않습니다."
      };

    }

    const dockResult =
      normalizeSkinBottomDock(parsed.bottomDock);

    if (!dockResult.ok) {

      return {
        ok: false,
        reason: "bottom-dock",
        message: dockResult.message
      };

    }

    normalizedBottomDock =
      dockResult.dock;

  }

  let cssRaw;

  if (typeof parsed.css === "string") {
    cssRaw = parsed.css;
  } else if (parsed.css === undefined) {
    cssRaw = "";
  } else {
    return { ok: false, reason: "css-type", message: "css는 문자열이어야 합니다." };
  }

  /*
    imageSlots/regions/metadata는 이미 JSON.parse()를 거친 순수
    데이터(함수/Date 등 위험한 타입이 존재할 수 없음)라 별도
    sanitizer가 필요 없다 — 다만 shape이 기대와 다르면(배열이어야
    할 자리에 객체가 오는 등) 조용히 안전한 기본값으로 대체한다
    (요구사항 9절 "허용되지 않은 SkinPackage shape 안전 처리").
    IMPORT-CSS-IMAGE-1: imageSlots 는 아래 파이프라인이 한 번 더
    정리한다(이름 규칙 · 중복 병합 · HTML 이 쓰는데 선언이 빠진 슬롯).
  */

  const regionsInput =
    Array.isArray(parsed.regions)
      ? parsed.regions
      : [];

  /*
    HOME-CANVAS-GROUP-1A — 낡은 그룹 명단은 **거부하지 않고 고친다**
    (계약 §38-8 · 설계 §7-3).

    없는 요소 id · 두 그룹에 걸친 요소 · 좌표 공간이 어긋난 요소 ·
    블록은 명단에서 빠지고, 남은 멤버가 둘 미만이 된 그룹은 사라진다.
    **요소 자체는 하나도 지우지 않는다** — 그룹은 그려지지 않으므로
    낡은 명단이 잘못된 그림을 만들 수 없고, 편집용 메타데이터 하나
    때문에 파일 전체를 못 열게 만드는 쪽이 더 나쁜 실패다.

    ★ 검증보다 **먼저** 돈다. 그래야 "고칠 수 있는 낡음"과 "고칠 수
      없는 모양 오류"(객체가 아니다 · id 규칙 위반 · 이름 길이)가
      갈리고, 뒤엣것만 경로와 함께 거부된다.

    ★ `canvasSource === "draft"`(AI 경로)에서는 돌지 않는다. 거기
      regions 는 사용자가 쓴 것이 아니라 **서버가 되돌려 준 지금
      draft** 이고, 캔버스와 아무 상관 없는 AI 수정이 draft 의 그룹
      명단을 말없이 고쳐서는 안 된다(§9 조용히 고치지 않는다).
  */

  const canvasSourceEarly =
    (options && options.canvasSource === "draft") ? "draft" : "file";

  const groupRepair =
    (canvasSourceEarly === "file" &&
      typeof repairSkinHomeCanvasRegionGroups === "function")
      ? repairSkinHomeCanvasRegionGroups(regionsInput)
      : { regions: regionsInput, changed: false };

  const regions =
    groupRepair.regions;

  /*
    HOME-CANVAS-CONTRACT-1B — regions 의 `home_canvas` 항목
    (IMORY_HOME_CANVAS_CONTRACT.md §9 "새 Import 가 잘못된 경우").

    ★ regions 전체를 검사하지 않는다. 이 배포가 **아는 이름 하나**만
      보고, 모르는 이름과 모르는 칸은 지금까지처럼 읽지 않고 그대로
      보존한다.

    ★ 거부의 이유는 renderMode / bottomDock 과 같다: "저장은 됐는데
      화면에 캔버스가 안 나오는" 상태를 파일만 보고 구분할 수 없게
      두지 않는다. 조용히 고치지도 않는다(중복 id 를 새 id 로
      바꾸거나, 잘못된 요소만 빼거나 하지 않는다).

    ★ 이 배포가 모르는 미래 canvas.version 은 **거부가 아니다** —
      통과시켜 보존하고, 렌더 때 기존 HOME 으로 폴백한다.

    message 에 path 를 함께 적는다(`regions[2].canvas.elements[1].width`).
    Import 창은 이 문장 하나를 그대로 보여 준다.

    ★ options.canvasSource — "file"(기본) 이면 거부하고, "draft" 면
      거부하지 않고 그대로 보존한다.

      계약이 세 경우를 가르기 때문이다(§9). 사용자가 붙여넣은 **새
      파일**의 잘못된 캔버스는 그가 고칠 수 있으므로 경로를 보여
      주고 막는다. 그런데 AI 경로는 같은 함수를 지나면서도 regions
      를 사용자가 쓴 것이 아니다 — 서버가 지금 draft 의 regions 를
      **그대로 되돌려 준다**(functions/api/skin-ai.js). 이미 저장된
      캔버스가 깨져 있을 때 여기서 막으면, 그 사람은 캔버스와 아무
      상관 없는 AI 수정조차 영영 못 하게 된다(지금은 캔버스를 고칠
      UI 도 없다). 그 경우의 계약은 "삭제하지 않고 fallback" 이지
      "막기" 가 아니다.

      그래서 draft 에서 온 캔버스는 통과시키고, 렌더 단계의
      resolveSkinHomeCanvas() 가 undefined 를 돌려주어 기존 HOME 이
      그려진다. 원본은 regions 에 그대로 남는다.
  */

  const canvasSource =
    canvasSourceEarly;

  if (
    canvasSource === "file" &&
    typeof validateSkinHomeCanvasRegions === "function"
  ) {

    const canvasCheck =
      validateSkinHomeCanvasRegions(regions);

    if (!canvasCheck.ok) {
      return {
        ok: false,
        reason: "home-canvas",
        message: `${canvasCheck.path} — ${canvasCheck.message}`,
        canvasErrorPath: canvasCheck.path
      };
    }

  }

  const metadata =
    (parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata))
      ? parsed.metadata
      : {};

  /*
    templates는 항상 새 리터럴로 만든다(파일 상단 "원본을 스프레드
    하지 않는다" 원칙) — banner는 실제로 들어온 경우에만 키를
    추가해서, 없는 스킨의 결과에 `banner: undefined` 같은 죽은 키가
    남지 않게 한다(resolveSkinTemplate이 undefined를 그대로
    "미지원"으로 읽으므로 동작상 차이는 없지만, 저장되는 JSON이
    깨끗한 편이 낫다).

    여기 담기는 html 은 아직 **원문**이다 — sanitize 는 아래
    runSkinPackageContentPipeline 이 이미지 슬롯 정규화 뒤에 한다.
  */

  const templates =
    {
      home: { html: templatesInput.home.html },
      category: { html: templatesInput.category.html },
      post: { html: templatesInput.post.html }
    };

  if (hasBannerTemplate) {
    templates.banner = { html: bannerTemplateInput.html };
  }

  if (hasFolderTemplate) {
    templates.folder = { html: folderTemplateInput.html };
  }

  if (hasHighlightsTemplate) {
    templates[highlightsTemplateKey] = { html: highlightsTemplateInput.html };
  }

  if (hasDockTemplate) {
    templates.dock = { html: dockTemplateInput.html };
  }

  const candidate =
    {
      schemaVersion: 1,
      templates,
      css: cssRaw,
      imageSlots: Array.isArray(parsed.imageSlots) ? parsed.imageSlots : [],
      regions,
      metadata
    };

  if (hasRenderMode) {
    candidate.renderMode = renderModeInput;
  }

  if (hasAuthorJs) {
    candidate.js = authorJsInput;
  }

  if (normalizedBottomDock) {
    candidate.bottomDock = normalizedBottomDock;
  }

  const pipeline =
    await runSkinPackageContentPipeline(candidate, options);

  if (!pipeline.ok) {
    return pipeline;
  }

  const skinPackage =
    pipeline.skinPackage;

  if (!htmlHasPostBodyRegion(skinPackage.templates.post.html)) {
    return {
      ok: false,
      reason: "post-body-region",
      message: "POST 템플릿에는 글 본문이 표시되는 자리(post-body region)가 반드시 있어야 합니다."
    };
  }

  if (
    hasFolderTemplate &&
    !htmlHasPostBodyRegion(skinPackage.templates.folder.html)
  ) {
    return {
      ok: false,
      reason: "folder-body-region",
      message: "FOLDER 템플릿에는 글 본문이 표시되는 자리(folder.posts 반복 안의 post-body region)가 반드시 있어야 합니다."
    };
  }

  /*
    재료 일치 라운드 — "저장은 되지만 화면에서 조용히 잘못 나오는"
    조합을 사람이 읽을 문장으로 함께 돌려준다. **거부가 아니다**:
    이미 저장돼 있는 스킨을 다시 가져올 수 없게 만들면 안 되고,
    경고 중 일부는 의도한 선택일 수도 있다. 판정은
    auditSkinPackageMaterials 한 곳에만 있다(skin/skin-template.js) —
    Save 경로도 같은 함수를 쓴다.

    IMPORT-CSS-IMAGE-1 — warnings 옆에 두 가지가 더 온다:
      cssReport  잘라낸 CSS 선언 목록(Import 창이 목록으로 보여 준다)
      notices    이미지 슬롯 정리 안내(빈 슬롯 포함)

    HOME-CANVAS-GROUP-1A — 그리고 하나 더:
      canvasNotices  HOME 캔버스의 그룹 명단을 **무엇을 얼마나**
                     정리했는가. `notices` 와 따로 두는 이유는 Import
                     창이 그 묶음에 `이미지 슬롯` 이라는 제목을 달고
                     있어서다(studio/editor/import-editor.js) — 다른
                     이야기를 같은 제목 아래 섞지 않는다.
  */

  const warnings =
    typeof auditSkinPackageMaterials === "function"
      ? auditSkinPackageMaterials(skinPackage)
      : [];

  const canvasNotices =
    (groupRepair.changed && typeof describeSkinHomeCanvasGroupRepair === "function")
      ? describeSkinHomeCanvasGroupRepair(groupRepair)
      : [];

  return {
    ok: true,
    warnings,
    notices: pipeline.notices,
    canvasNotices,
    cssReport: pipeline.cssReport,
    slotReport: pipeline.slotReport,
    skinPackage
  };

}

if (typeof window !== "undefined") {
  window.validateSkinPackageImport = validateSkinPackageImport;
  window.runSkinPackageContentPipeline = runSkinPackageContentPipeline;
}
