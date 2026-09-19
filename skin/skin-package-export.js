/* =========================================================
   SKIN PACKAGE EXPORT (Skin Studio 파일 UX — Export)

   skin/skin-package-import.js(validateSkinPackageImport)의 반대
   방향이다. Studio가 지금 편집 중인 working draft(skin_versions.
   content 그대로인 SkinPackage 객체)를 **다시 Import할 수 있는**
   `.json` 파일로 내보낸다.

   내보내는 필드는 SKIN_DESIGNER_CONTRACT.md의 SkinPackage 계약
   그대로 — schemaVersion / renderMode(선택, SANDBOX-1) /
   templates.{home,category,post,banner}.{html[,css]} / css /
   js(선택, SANDBOX-5A) / imageSlots / regions / metadata — 이고,
   그 외에는 어떤 키도 내보내지 않는다(allowlist). 그래서 DB 전용
   값(row id · user_id · created_at · version_id 등)이 어떤 경로로
   content 안에 섞여 있더라도 파일에는 절대 실리지 않는다 —
   "무엇을 뺄지"를 열거하는 대신 "무엇만 넣을지"를 열거해서, 나중에
   DB 컬럼이 늘어나도 이 파일을 고칠 필요가 없게 한다.

   templates가 없는 legacy HOME-only draft(top-level html)는
   templates.home.html로 옮겨 적는다(skin/skin-template.js
   resolveSkinTemplate의 폴백과 같은 해석). 다만 category/post가
   없으면 그 파일은 Import 검증(required-template)을 통과하지 못하
   므로, 결과의 missingTemplates로 호출자에게 알린다 — 파일을
   만들지 않는 것이 아니라 "내보냈지만 다시 가져오려면 채워야
   한다"를 사용자에게 보여 주기 위해서다.

   이 파일은 DOM/Studio 상태를 전혀 모른다. 순수 변환 함수
   (buildSkinPackageExport / serializeSkinPackageExport /
   buildSkinPackageExportFilename)와, 그 결과를 브라우저 다운로드로
   내보내는 downloadSkinPackageExport 하나만 노출한다. DB RPC 호출은
   없다.

   예외 하나: bottomDock(BOTTOM-DOCK-1)만 skin/skin-bottom-dock.js의
   normalizeSkinBottomDock()을 **있으면** 쓴다 — 아래 해당 블록의
   주석 참고(검증 로직을 복사하면 Import와 갈라지기 때문).

   classic script — window.buildSkinPackageExport /
   window.serializeSkinPackageExport /
   window.buildSkinPackageExportFilename /
   window.downloadSkinPackageExport 로 노출된다. 의존 없음.
========================================================== */

const SKIN_PACKAGE_EXPORT_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder", "highlights", "memos", "dock"];

/*
  Import 쪽(skin/skin-package-import.js requiredPageTypes)과 같은
  집합 — banner/folder(FOLDER-2)/memos(HIGHLIGHT-1)는 선택이라 빠져 있어도
  missingTemplates에 넣지 않는다.
*/
const SKIN_PACKAGE_EXPORT_REQUIRED_PAGE_TYPES =
  ["home", "category", "post"];

/*
  SANDBOX-1 — renderMode(선택). 값의 정의는 skin/skin-template.js의
  resolveSkinRenderMode/SKIN_RENDER_MODES에 있지만, 이 파일은 "의존
  없음"을 유지한다(상단 주석) — 목록 하나뿐이라 복사 비용이 낮고,
  Studio가 아닌 곳에서 이 파일만 읽어도 동작해야 한다. 값이 늘면
  두 곳을 함께 고친다.
*/
const SKIN_PACKAGE_EXPORT_RENDER_MODES =
  ["native", "sandbox"];


/*
  SANDBOX-5A — 작성 JS 의 상한. skin/skin-template.js 의
  SKIN_PACKAGE_MAX_JS_CHARS · skin/sandbox/skin-sandbox-protocol.js 의
  SANDBOX_MAX_AUTHOR_JS_CHARS 와 **같은 값**이어야 한다. 이 파일이
  "의존 없음"을 유지하려고 값을 한 번 더 적는다(위 RENDER_MODES 와
  같은 이유) — 값이 바뀌면 세 곳을 함께 고친다.
*/
const SKIN_PACKAGE_EXPORT_MAX_JS_CHARS = 131072;


function isSkinPackageExportPlainObject(value) {

  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


/*
  JSON.parse(JSON.stringify())로 깊은 복사한다 — working draft는
  DB의 skin_versions.content 그대로인 순수 데이터라(함수/Date 없음)
  손실이 없고, 호출자가 결과를 고쳐도 Studio 상태에 닿지 않는다.
*/
function cloneSkinPackageExportValue(value) {

  return JSON.parse(JSON.stringify(value));

}


/*
  buildSkinPackageExport(skinPackage)
    -> { ok: true, skinPackage, missingTemplates }
     | { ok: false, message }

  결과 skinPackage는 항상 위 allowlist 필드만 가진 **새 객체**다.
  templates.<page>는 html(필수)과 css(문자열일 때만) 두 키만 갖는다
  (skin/skin-template.js가 읽는 것이 정확히 그 둘이다).
*/
function buildSkinPackageExport(skinPackage) {

  if (!isSkinPackageExportPlainObject(skinPackage)) {
    return { ok: false, message: "내보낼 SkinPackage가 없습니다." };
  }

  const templatesInput =
    isSkinPackageExportPlainObject(skinPackage.templates)
      ? skinPackage.templates
      : null;

  const templates =
    {};

  const missingTemplates =
    [];

  for (const pageType of SKIN_PACKAGE_EXPORT_PAGE_TYPES) {

    const template =
      templatesInput ? templatesInput[pageType] : null;

    if (
      isSkinPackageExportPlainObject(template) &&
      typeof template.html === "string"
    ) {

      const exportedTemplate =
        { html: template.html };

      if (typeof template.css === "string") {
        exportedTemplate.css = template.css;
      }

      templates[pageType] =
        exportedTemplate;

      continue;

    }

    /* legacy HOME-only draft — top-level html을 HOME 템플릿으로 */
    if (
      pageType === "home" &&
      typeof skinPackage.html === "string"
    ) {

      templates.home =
        { html: skinPackage.html };

      continue;

    }

    if (SKIN_PACKAGE_EXPORT_REQUIRED_PAGE_TYPES.includes(pageType)) {
      missingTemplates.push(pageType);
    }

  }

  /*
    SANDBOX-1 — renderMode(선택, IMORY_SANDBOX_SKIN_DESIGN.md §C).
    allowlist 원칙 그대로다: 아는 값("native"/"sandbox")일 때만
    싣는다. 모르는 값이 draft에 어떤 경로로 들어와 있더라도 파일에
    실리지 않는다 — Import가 거부할 파일을 만들어 내보내지 않는다.
    없으면 키 자체를 만들지 않는다(Import 결과와 같은 모양).
  */

  const exportedRenderMode =
    SKIN_PACKAGE_EXPORT_RENDER_MODES.includes(skinPackage.renderMode)
      ? skinPackage.renderMode
      : null;

  /*
    IMPORT-CSS-IMAGE-1 — CSS 는 Save 와 같은 규칙(analyzeSkinCss
    repair)으로 한 번 더 걸러 싣는다. Import/Code/AI 를 지난 draft 는
    이미 깨끗하지만, 이 규칙 이전에 저장된 draft 는 @import 같은 것을
    담고 있을 수 있다 — 렌더와 Save 가 이미 빼는 것을 파일에만 되살리지
    않는다. 판정 함수가 없는 문서(모듈 로드 전)나 구조가 깨진 CSS 는
    원문 그대로 싣는다 — 다시 Import 할 때 그 창이 위치와 이유를 말한다.
  */

  const rawCss =
    typeof skinPackage.css === "string"
      ? skinPackage.css
      : "";

  const cssReport =
    (typeof window !== "undefined" && typeof window.analyzeSkinCss === "function")
      ? window.analyzeSkinCss(rawCss, { mode: "repair" })
      : null;

  const exported = {
    schemaVersion: 1,
    templates,
    css:
      cssReport && cssReport.ok
        ? cssReport.css
        : rawCss,
    imageSlots:
      Array.isArray(skinPackage.imageSlots)
        ? cloneSkinPackageExportValue(skinPackage.imageSlots)
        : [],
    regions:
      Array.isArray(skinPackage.regions)
        ? cloneSkinPackageExportValue(skinPackage.regions)
        : [],
    metadata:
      isSkinPackageExportPlainObject(skinPackage.metadata)
        ? cloneSkinPackageExportValue(skinPackage.metadata)
        : {}
  };

  if (exportedRenderMode) {
    exported.renderMode = exportedRenderMode;
  }

  /*
    BOTTOM-DOCK-1 — bottomDock(선택, IMORY_BOTTOM_DOCK_DESIGN.md).

    allowlist 원칙 그대로다: **Import 가 받아들일 모양일 때만** 싣고,
    그때도 원본이 아니라 정규화된 결과를 싣는다(알 수 없는 추가 키가
    파일에 섞이지 않는다). 모양이 틀린 값이 어떤 경로로 draft 에
    들어와 있더라도 "가져올 수 없는 파일"을 만들어 내보내지 않는다.

    ★ 이 파일의 "의존 없음"에 대한 유일한 예외다.
      normalizeSkinBottomDock(skin/skin-bottom-dock.js)이 없는
      환경에서는 키를 만들지 않는다 — 판정 규칙을 여기 복사하면
      두 곳이 갈라져 "Export 는 통과하는데 Import 가 거부하는"
      파일이 생긴다. 값 목록 하나가 아니라 검증 로직 전체라서
      renderMode/js 처럼 베껴 적을 수 없다.
  */

  if (
    skinPackage.bottomDock !== undefined &&
    skinPackage.bottomDock !== null &&
    typeof normalizeSkinBottomDock === "function"
  ) {

    const dockResult =
      normalizeSkinBottomDock(skinPackage.bottomDock);

    if (dockResult.ok && dockResult.dock) {
      exported.bottomDock = dockResult.dock;
    }

  }

  /*
    SANDBOX-5A — 작성 JS(선택). allowlist 원칙 그대로다: 문자열이고
    상한 안일 때만 싣는다. 빈 문자열은 **싣는다** — "JS 를 다 지운
    스킨"이 파일에서 사라지면 다시 가져올 때 예전 JS 가 되살아난
    것처럼 보이지 않지만, 필드가 있었다는 사실은 남는 편이 왕복에
    정직하다(Import 도 빈 문자열을 통과시킨다).

    없거나 이상한 값이면 키 자체를 만들지 않는다 — Import 가 거부할
    파일을 만들어 내보내지 않는다(renderMode 와 같은 규칙).
  */

  if (
    typeof skinPackage.js === "string" &&
    skinPackage.js.length <= SKIN_PACKAGE_EXPORT_MAX_JS_CHARS
  ) {
    exported.js = skinPackage.js;
  }

  return {
    ok: true,
    skinPackage: exported,
    missingTemplates
  };

}


/*
  파일 내용 — 2칸 들여쓰기 + 마지막 개행. 사람이 열어 보고 그대로
  Import 창에 붙여넣어도 되는 포맷이다.
*/
function serializeSkinPackageExport(exportedSkinPackage) {

  return JSON.stringify(exportedSkinPackage, null, 2) + "\n";

}


/*
  파일 이름 — imory-skin-<metadata.title slug>-<YYYYMMDD>.json.
  title이 없거나 slug가 비면 imory-skin-<YYYYMMDD>.json.
  한글은 그대로 두고(현대 OS는 모두 허용) 공백/기호만 '-'로 바꾼다.
*/
function buildSkinPackageExportFilename(exportedSkinPackage, now) {

  const date =
    now instanceof Date ? now : new Date();

  const pad =
    (n) => String(n).padStart(2, "0");

  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

  const title =
    exportedSkinPackage &&
    exportedSkinPackage.metadata &&
    typeof exportedSkinPackage.metadata.title === "string"
      ? exportedSkinPackage.metadata.title
      : "";

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "");

  return slug
    ? `imory-skin-${slug}-${stamp}.json`
    : `imory-skin-${stamp}.json`;

}


/*
  downloadSkinPackageExport(skinPackage)
    -> { ok: true, filename, missingTemplates, text }
     | { ok: false, message }

  브라우저 다운로드(Blob + <a download>)를 일으킨다. 서버를 거치지
  않고, Studio 상태도 건드리지 않는다. text를 함께 돌려주는 이유:
  호출자/테스트가 "실제로 내려간 내용"을 다시 읽을 수 있게 하기
  위해서다.
*/
function downloadSkinPackageExport(skinPackage) {

  const built =
    buildSkinPackageExport(skinPackage);

  if (!built.ok) {
    return built;
  }

  const text =
    serializeSkinPackageExport(built.skinPackage);

  const filename =
    buildSkinPackageExportFilename(built.skinPackage);

  try {

    const blob =
      new Blob([text], { type: "application/json" });

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";

    document.body.appendChild(anchor);

    anchor.click();

    /*
      일부 브라우저는 click() 직후 곧바로 revoke하면 다운로드가
      시작되지 않는다 — 한 틱 뒤에 정리한다.
    */
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);

  } catch (err) {

    console.error("[skin-package-export] download failed", err);

    return {
      ok: false,
      message: "파일을 내려받지 못했습니다. 다시 시도해주세요."
    };

  }

  return {
    ok: true,
    filename,
    missingTemplates: built.missingTemplates,
    text
  };

}


if (typeof window !== "undefined") {

  window.buildSkinPackageExport =
    buildSkinPackageExport;

  window.serializeSkinPackageExport =
    serializeSkinPackageExport;

  window.buildSkinPackageExportFilename =
    buildSkinPackageExportFilename;

  window.downloadSkinPackageExport =
    downloadSkinPackageExport;

}
