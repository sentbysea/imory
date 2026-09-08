/* =========================================================
   SKIN PACKAGE EXPORT (Skin Studio 파일 UX — Export)

   skin/skin-package-import.js(validateSkinPackageImport)의 반대
   방향이다. Studio가 지금 편집 중인 working draft(skin_versions.
   content 그대로인 SkinPackage 객체)를 **다시 Import할 수 있는**
   `.json` 파일로 내보낸다.

   내보내는 필드는 SKIN_DESIGNER_CONTRACT.md의 SkinPackage 계약
   그대로 — schemaVersion / templates.{home,category,post,banner}
   .{html[,css]} / css / imageSlots / regions / metadata — 이고,
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

   classic script — window.buildSkinPackageExport /
   window.serializeSkinPackageExport /
   window.buildSkinPackageExportFilename /
   window.downloadSkinPackageExport 로 노출된다. 의존 없음.
========================================================== */

const SKIN_PACKAGE_EXPORT_PAGE_TYPES =
  ["home", "category", "post", "banner"];

/*
  Import 쪽(skin/skin-package-import.js requiredPageTypes)과 같은
  집합 — banner는 선택이라 빠져 있어도 missingTemplates에 넣지
  않는다.
*/
const SKIN_PACKAGE_EXPORT_REQUIRED_PAGE_TYPES =
  ["home", "category", "post"];


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

  const exported = {
    schemaVersion: 1,
    templates,
    css:
      typeof skinPackage.css === "string"
        ? skinPackage.css
        : "",
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
