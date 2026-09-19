/* =========================================================
   PAGES FUNCTION — POST /api/skin-ai
   (PHASE AI-2: OpenAI 실제 연결 / PHASE AI-4: 참고 이미지)

   Skin Studio의 AI drawer가 부르는 유일한 서버 엔드포인트다.
   PHASE AI-1에서는 받은 SkinPackage를 거의 그대로 돌려주는
   stub이었고, 이번 Phase에서 그 자리를 **OpenAI Responses API
   실제 호출**로 교체한다. 앞뒤 경로는 그대로다:

     Studio AI drawer
       -> POST /api/skin-ai            (이 파일)
       -> OpenAI Responses API         (Structured Outputs)
       -> validateSkinPackageImport()  (skin/skin-package-import.js)
       -> applyImportedSkinPackage()   (studio/studio-preview.js)
       -> Preview 재렌더 / undo

   요청·응답 shape은 AI-1에서 고정한 그대로다. 뒤 Phase가 더한 것은
   전부 **선택 필드**라, 그 필드를 보내지 않는 요청은 예전과 완전히
   같은 경로를 탄다:

     요청  { instruction: string, skinPackage: object,
             images?: [{ mimeType, dataUrl }],          (PHASE AI-4)
             selectionContext?: {...} }                 (PHASE AI-6B)
     성공  { ok: true, skinPackage: {...}, summary: string }
     실패  { ok: false, message: string }

   ★ 모델이 만드는 범위 (이 파일이 기계적으로 강제한다)
   모델은 templates.{home,category,post,banner,folder,highlights}.html
   6종(banner / folder / highlights는 선택 — FOLDER-2, HIGHLIGHT-2)과 css,
   그리고 한 줄 summary만 만든다. schemaVersion / imageSlots /
   regions / metadata는 **요청으로 받은 현재 SkinPackage에서 그대로
   가져온다** — 모델이 손댈 수 없다. 이유 두 가지:

     1) 최소 변경 원칙을 프롬프트에만 맡기지 않는다. 이미지 슬롯
        정의(imageSlots)가 바뀌면 Studio의 슬롯 연결과 공개 화면의
        images.* 해석이 함께 깨지는데, "배경을 분홍으로" 같은 요청이
        그걸 건드릴 이유가 없다.
     2) Structured Outputs의 strict schema는 자유 형식 객체
        (additionalProperties:true)를 표현할 수 없다 — metadata처럼
        모양이 열린 필드를 모델 출력에 넣으려면 schema를 느슨하게
        만들어야 하고, 그러면 strict의 이점이 사라진다.

   그래서 "imageSlots를 새로 추가하는 스킨 수정"은 이번 Phase에서
   AI로 할 수 없다(기존 Import/Code 경로로는 가능하다). 남은 차이로
   남겨둔다.

   ★ 참고 이미지 (PHASE AI-4 / IMPORT-CSS-IMAGE-1)
   images는 기본적으로 **디자인 참고 자료**다. 사용자가 스킨 안에
   넣어 달라고 한 경우에만 모델이 `<img src="imory-attachment:N">`
   자리표시자를 쓴다 — 그것을 슬롯으로 바꾸고 이미지를 올리는 일은
   브라우저가 한다(skin/skin-package-images.js · studio/ai/studio-ai-panel.js).
   이 파일은 여전히 imageSlots도 Supabase Storage도 DB도 건드리지
   않는다. 검증을 통과한 data URL을 OpenAI vision input(input_image)으로
   한 번 넘기고 그대로 버린다.
   images가 없으면 요청 body도 시스템 프롬프트도 PHASE AI-2와
   완전히 같다(아래 buildSkinAiSystemPrompt / buildSkinAiModelRequestBody).

   ★ 이번 Phase에서 하지 않는 것
   - KV daily limit / 중복 요청 hash (PHASE AI-3)
   - 참고 이미지의 보관/재사용
   - 대화 history / streaming

   ★ 인증과 허용 사용자
   Authorization: Bearer <supabase access token>을 요구하고
   Supabase의 /auth/v1/user로 한 번 검증한다. 검증에 쓰는 두 값
   (project URL과 publishable anon key)은 core/lib/supabase-client.js
   가 이미 브라우저에 그대로 노출하고 있는 **공개 값**이다 —
   새 비밀을 만들지 않는다. Service Role key는 이 파일 어디에도 없다.

   그 위에 이번 Phase부터 allowlist(SKIN_AI_ALLOWED_USER_IDS)가
   붙는다. 유료 호출이 실제로 나가기 시작하므로, "로그인만 하면
   누구나"는 그대로 비용 사고가 된다. 목록이 **비어 있으면 아무도
   쓸 수 없다**(fail closed) — 환경변수를 깜빡한 배포가 전체 개방이
   되는 방향으로 틀리지 않게 한다.

   ★ Supabase access token은 OpenAI로 나가지 않는다
   토큰은 위 /auth/v1/user 검증에만 쓰고, OpenAI 요청 body에도
   헤더에도 넣지 않는다. 프롬프트에 들어가는 것은 아래 4종뿐이다:
   시스템 계약 / 사용자 instruction / 현재 SkinPackage / 사용자가
   직접 붙인 참고 이미지. 계정 이메일·nickname·게시글 본문은 어느
   경로로도 들어가지 않는다.
========================================================== */

const SKIN_AI_SUPABASE_URL_FALLBACK =
  "https://vtwcuvouyipohfonfukj.supabase.co";

const SKIN_AI_SUPABASE_ANON_KEY_FALLBACK =
  "sb_publishable_9KQkblZdg92IPiB-p5_g0w_tG7HsMuG";


/* =========================================================
   참고 이미지 (PHASE AI-4)

   ★ 무엇인가
   사용자가 Studio AI drawer에 붙인 **디자인 참고 이미지**다.
   스킨에 삽입될 자산이 아니다 — imageSlots도, Supabase Storage도,
   DB도 이 경로에서는 건드리지 않는다. 이 함수가 하는 일은
   "받은 data URL을 검증해서 OpenAI vision input으로 한 번 넘기고
   버리는" 것이 전부다.

   ★ 허용 MIME — PNG / JPEG / WebP
   OpenAI vision input이 실제로 받는 것은 PNG / JPEG / WebP /
   **non-animated** GIF다(2026-09 공식 문서). 저장소의 이미지 계약
   (studio/images/skin-image-library.js)은 GIF도 허용한다. 두
   목록의 교집합에서 GIF만 뺀 이유는 "정지 GIF만 허용"을 우리가
   싸게 판정할 수 없기 때문이다 — 애니메이션 GIF를 그대로 올려
   업스트림에서 거절당하는 쪽이 더 나쁘다.

   ★ client 검증을 신뢰하지 않는다
   studio/ai/studio-ai-panel.js도 같은 상한을 검사하지만, 그것은
   사용자에게 빨리 알려주기 위한 것이다. 이 파일이 실제 방어선이고,
   여기서 걸린 요청은 **OpenAI를 0회 호출한다**.
========================================================== */

const SKIN_AI_MAX_REFERENCE_IMAGES = 2;

const SKIN_AI_MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;

const SKIN_AI_REFERENCE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp"
];


/* =========================================================
   본문 상한

   ★ 두 개로 나눠 잰다.

   1) 텍스트 몫 (SKIN_AI_MAX_TEXT_BODY_BYTES)
      instruction + SkinPackage. SkinPackage 하나(HTML 4종 + CSS)는
      실측 30~60KB 수준이라 256KB면 넉넉하다 — PHASE AI-2의 값을
      그대로 유지한다. 이미지 때문에 전체 상한이 올라갔다고 해서
      프롬프트에 10MB짜리 CSS가 들어갈 수 있게 두지 않는다.

   2) 이미지 몫
      base64는 3바이트를 4문자로 만든다. 장당 4MiB면
        ceil(4194304 / 3) * 4 = 5,592,408자
      이고 여기에 "data:image/jpeg;base64," 접두사와 JSON 안의
      따옴표/필드 이름 몫으로 1KB를 더 준다. 2장이면 약 10.7MiB.

   합계는 약 10.9MiB다. Cloudflare Pages Functions(=Workers)의
   요청 본문 상한은 **계정 요금제**가 정하며 Free/Pro 100MB,
   Business 200MB, Enterprise 최대 5GB다(2026-09 공식 문서).
   즉 이 값은 플랫폼 상한의 1/9 수준이고, 병목은 우리가 정한
   장당 4MB 쪽이다.

   content-length로 먼저 거르고, 헤더가 없거나 실제와 다른 경우를
   대비해 읽은 바이트 길이도 한 번 더 잰다(PHASE AI-2와 동일).
========================================================== */

const SKIN_AI_MAX_TEXT_BODY_BYTES = 256 * 1024;

const SKIN_AI_MAX_REFERENCE_IMAGE_WIRE_BYTES =
  Math.ceil(SKIN_AI_MAX_REFERENCE_IMAGE_BYTES / 3) * 4 + 1024;

const SKIN_AI_MAX_BODY_BYTES =
  SKIN_AI_MAX_TEXT_BODY_BYTES +
  (SKIN_AI_MAX_REFERENCE_IMAGES * SKIN_AI_MAX_REFERENCE_IMAGE_WIRE_BYTES);


/* =========================================================
   base64 문자열의 실제 byte 수

   atob()로 실제 디코딩하지 않는다 — 4MB짜리 문자열을 굳이 메모리에
   한 번 더 풀 이유가 없다. 대신 base64 문법을 정확히 강제하고
   (아래 정규식 + 길이 4의 배수) 길이에서 바이트 수를 계산한다.
   문법을 통과한 문자열은 정의상 디코딩 가능하다.

   정규식은 padding("=")이 끝에만, 최대 2개까지 오는 것을 강제한다.
   개행이나 공백이 섞인 base64는 받지 않는다 — data URL이 그렇게
   생길 이유가 없고, 허용하면 길이 계산이 어긋난다.
========================================================== */

const SKIN_AI_BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;


function measureSkinAiBase64Bytes(base64) {

  if (
    typeof base64 !== "string" ||
    base64.length === 0 ||
    base64.length % 4 !== 0 ||
    !SKIN_AI_BASE64_PATTERN.test(base64)
  ) {
    return -1;
  }

  const padding =
    base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0);

  return ((base64.length / 4) * 3) - padding;

}


/* =========================================================
   images 검증

   요청의 images는 **선택**이다. 없거나 null이면 빈 배열로 보고
   PHASE AI-2와 완전히 같은 경로를 탄다.

   검사 순서는 "싼 것부터": 배열인가 -> 장수 -> 항목이 객체인가 ->
   MIME allowlist -> data URL 접두사가 그 MIME과 일치하는가 ->
   base64 문법 -> 디코딩했을 때의 실제 byte 수.

   ★ 접두사와 MIME이 일치해야 하는 이유
   mimeType만 믿고 넘기면 "mimeType은 image/png인데 실제 data URL은
   data:text/html;base64,..." 같은 요청을 그대로 업스트림에 던지게
   된다. 두 값이 정확히 같은 한 쌍일 때만 통과시킨다.
========================================================== */

function validateSkinAiReferenceImages(value) {

  if (value === undefined || value === null) {
    return { ok: true, images: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: "참고 이미지 형식이 올바르지 않습니다." };
  }

  if (value.length > SKIN_AI_MAX_REFERENCE_IMAGES) {

    return {
      ok: false,
      message:
        "참고 이미지는 최대 " + SKIN_AI_MAX_REFERENCE_IMAGES +
        "장까지 첨부할 수 있습니다."
    };

  }

  const images = [];

  for (const item of value) {

    if (!isSkinAiPlainObject(item)) {
      return { ok: false, message: "참고 이미지 형식이 올바르지 않습니다." };
    }

    const mimeType =
      typeof item.mimeType === "string" ? item.mimeType.trim() : "";

    if (SKIN_AI_REFERENCE_IMAGE_MIME_TYPES.indexOf(mimeType) === -1) {

      return {
        ok: false,
        message: "PNG, JPEG, WebP 이미지만 사용할 수 있습니다."
      };

    }

    const dataUrl =
      typeof item.dataUrl === "string" ? item.dataUrl : "";

    const prefix =
      "data:" + mimeType + ";base64,";

    if (!dataUrl.startsWith(prefix)) {
      return { ok: false, message: "참고 이미지 형식이 올바르지 않습니다." };
    }

    const byteLength =
      measureSkinAiBase64Bytes(dataUrl.slice(prefix.length));

    if (byteLength < 0) {
      return { ok: false, message: "참고 이미지 형식이 올바르지 않습니다." };
    }

    if (byteLength > SKIN_AI_MAX_REFERENCE_IMAGE_BYTES) {

      return {
        ok: false,
        message:
          "이미지 한 장은 " +
          Math.floor(SKIN_AI_MAX_REFERENCE_IMAGE_BYTES / 1024 / 1024) +
          "MB 이하만 사용할 수 있습니다."
      };

    }

    /*
      받은 객체를 그대로 들고 가지 않는다 — 검증을 통과한 두 값만
      새 리터럴에 담아서, 요청에 딸려 온 다른 키가 업스트림 요청
      body로 흘러갈 여지를 없앤다.
    */
    images.push({ mimeType, dataUrl });

  }

  return { ok: true, images };

}

const SKIN_AI_MAX_INSTRUCTION_LENGTH = 2000;

/* FOLDER-2: "folder"(폴더 페이지 / Series Viewer)는 banner와 같은
   선택 템플릿이다 — 스키마에서 null 허용, 결과 병합도 같은 정책.

   HIGHLIGHT-2: "highlights"(하이라이트 화면)도 선택 템플릿이다. 다만
   폴백이 다르다 — 없으면 플랫폼이 기본 template으로 그리므로, 모델이
   null을 돌려줘도 그 화면이 사라지지 않는다.

   ★ 레거시 이름 "memos"
   HIGHLIGHT-1 이 저장한 스킨에는 같은 화면의 template 이
   templates.memos 라는 이름으로 들어 있다. 모델에게는 그것을
   **highlights 로 보여 주고**(아래 normalizeSkinAiInputPackage), 결과도
   highlights 로 받는다 — 모델이 알아야 하는 이름을 두 개로 만들지
   않기 위해서다. 그래서 이 목록에 "memos" 는 없다. 병합하는 쪽
   (studio/studio-ai-apply.js)이 옛 키를 지우고 새 키로 바꾼다. */
const SKIN_AI_TEMPLATE_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder", "highlights", "dock"];


/* =========================================================
   BOTTOM-DOCK-1 — bottomDock 설정의 값 목록

   원본은 skin/skin-bottom-dock.js 다. 이 파일은 Cloudflare Pages
   Function 이라 브라우저 전역을 쓸 수 없어서(같은 realm 이 아니다)
   **값 목록만** 옮겨 적는다 — SKIN_AI_MAX_AUTHOR_JS_CHARS 를 세 곳에
   적어 두는 것과 같은 사정이다. 목록이 바뀌면 두 곳을 함께 고친다.

   ★ 여기서 하는 일은 "거부"가 아니라 **칸 단위로 걸러 받기**다.

   모델이 position 에 오탈자를 내면 그 칸만 현재 값으로 되돌리고,
   항목 하나의 모양이 틀리면 그 항목만 버린다. 설정 하나 때문에
   AI 수정 전체가 거부되면(브라우저의 validateSkinPackageImport 가
   bottomDock 을 거부한다) 사용자는 "색을 바꿔 달라"는 요청이
   통째로 실패하는 것을 보게 된다.
========================================================== */

const SKIN_AI_DOCK_POSITIONS =
  ["auto", "fixed", "sticky", "static"];

/* TRANSITION-1 — 공용 전환 primitive 의 값 목록. 원본은
   skin/skin-transition.js 이고, 여기 적힌 값이 그쪽과 같은지는 단위
   테스트가 두 파일을 실제로 읽어 대조한다(skin/skin-transition-test.mjs). */
const SKIN_AI_DOCK_TRANSITIONS =
  ["none", "fade", "slide", "scale", "fade-slide", "fade-scale"];

const SKIN_AI_TRANSITION_DIRECTIONS =
  ["up", "down", "left", "right"];

const SKIN_AI_TRANSITION_EASINGS =
  ["ease", "ease-in", "ease-out", "ease-in-out", "linear", "smooth"];

const SKIN_AI_TRANSITION_DURATION_MIN = 80;
const SKIN_AI_TRANSITION_DURATION_MAX = 1000;
const SKIN_AI_TRANSITION_DURATION_DEFAULT = 200;

const SKIN_AI_DOCK_STATES =
  ["expanded", "collapsed"];

const SKIN_AI_DOCK_VISUAL_TYPES =
  ["icon", "emoji", "text", "image", "asset", "svg"];

const SKIN_AI_DOCK_AUDIENCES =
  ["all", "owner", "visitor"];

const SKIN_AI_DOCK_NAVIGATE_TARGETS =
  ["home", "highlights", "gallery", "banner"];

const SKIN_AI_DOCK_ACTION_TARGETS =
  ["write", "admin", "manage", "share", "theme", "top"];

const SKIN_AI_DOCK_ACTION_TYPES_FOR_SCHEMA =
  ["navigate", "open", "action"];

const SKIN_AI_DOCK_MAX_ITEMS = 12;


/* =========================================================
   selectionContext (PHASE AI-6B)

   ★ 무엇인가
   Studio의 Element Inspector에서 사용자가 **요소 하나를 고른 채**
   AI 수정을 요청했을 때만 실려 오는 선택 정보다. 없으면 이 파일의
   모든 경로가 PHASE AI-2/AI-4와 완전히 같이 돈다 — 선택 없는
   요청은 지금까지의 "전체 스킨 수정" 그대로다.

   ★ 무엇이 아닌가
   partial patch 프로토콜이 아니다. 입력은 지금까지처럼 SkinPackage
   **전체**이고 출력도 SkinPackage 전체다. selectionContext는 그
   안에서 "어느 요소가 타깃인지"만 설명한다(요구사항 20절).

   ★ client 값을 믿지 않는다
   studio/ai/studio-ai-selection.js도 같은 모양을 만들지만, 실제
   방어선은 여기다. 아래 검증을 통과하지 못한 요청은 **OpenAI를
   0회 호출**하고 400으로 끝난다. 통과한 값도 그대로 흘려보내지
   않고 필드별로 새 객체를 다시 만든다(모르는 키는 애초에 거부).

   ★ editId 존재 확인 — 새 HTML parser를 만들지 않는다
   editId는 아래 패턴이 강제하는 대로 [A-Za-z][A-Za-z0-9_-]{0,63}
   뿐이라 따옴표/꺾쇠/공백이 들어갈 수 없다. 그래서
   `data-imory-edit-id="<editId>"` 문자열이 해당 template html에
   들어 있는지 보는 것만으로 충분하고 안전하다 — 닫는 따옴표까지
   포함하므로 "e0-2"가 "e0-21"에 걸리지 않는다. Workers 런타임에는
   DOMParser가 없고, 이 한 가지를 확인하자고 서버에 두 번째 HTML
   파서를 들이지 않는다(요구사항 5절).

   패턴은 skin/skin-sanitize.js의 SKIN_SANITIZE_EDIT_ID_PATTERN /
   studio/inspector/studio-inspector-model.js의
   INSPECTOR_EDIT_ID_PATTERN과 같아야 한다 — 셋을 함께 고친다.
========================================================== */

const SKIN_AI_SELECTION_EDIT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const SKIN_AI_SELECTION_ELEMENT_TYPES =
  ["text", "image", "link", "container"];

/* 스킨 sanitizer가 허용하는 태그는 전부 소문자 영문자뿐이다
   (skin/skin-sanitize.js) — h1~h6 때문에 숫자만 더 받는다. */
const SKIN_AI_SELECTION_TAG_NAME_PATTERN = /^[a-z][a-z0-9]{0,15}$/;

/* data-imory-bind / -src / -href / -repeat이 갖는 dotted path.
   skin-sanitize.js의 path 검사와 같은 성격이다. */
const SKIN_AI_SELECTION_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]{0,79}$/;

const SKIN_AI_SELECTION_SLOT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* =========================================================
   SANDBOX-5A — 저자 JS 의 상한.

   skin/skin-template.js 의 SKIN_PACKAGE_MAX_JS_CHARS ·
   skin/sandbox/skin-sandbox-protocol.js 의
   SANDBOX_MAX_AUTHOR_JS_CHARS 와 **같은 값**이어야 한다.
   이 파일은 브라우저 모듈을 import 하지 않으므로 값을 한 번 더
   적는다 — 값이 바뀌면 함께 고친다.

   여기서 쓰는 곳은 한 군데뿐이다: AI 결과에 원본의 js 를 도로
   싣기 전에 "브라우저 validator 도 통과할 값인가"를 본다.
========================================================== */

const SKIN_AI_MAX_AUTHOR_JS_CHARS = 131072;


/* skin-sanitize.js의 SKIN_SANITIZE_ALLOWED_REGION_NAMES와 같다. */
const SKIN_AI_SELECTION_REGION_NAMES = ["post-body", "owner-tools"];

/* studio/inspector/studio-inspector-model.js describeInspectorElement()
   가 만드는 capability 이름 전부. 그 목록이 늘면 여기도 늘린다 —
   모르는 이름은 거부한다(fail closed). */
const SKIN_AI_SELECTION_CAPABILITY_NAMES = [
  "text", "href", "typography", "color", "background", "align",
  "imageSource", "imageClear", "size", "shape", "border", "padding",
  "imageAlign", "crop",

  /* LAYOUT-1 — 배치 primitive(IMORY_LAYOUT_PRIMITIVE_DESIGN.md).
     이 셋이 목록에 없으면 배치를 고칠 수 있는 요소를 고른 채 보낸
     요청이 selectionContext 검증에서 통째로 거부된다. */
  "layout", "layoutItem", "reorder",

  /* TRANSITION-1 — 전환 primitive(IMORY_TRANSITION_PRIMITIVE_DESIGN.md).
     Inspector 가 보호 구역 밖의 모든 요소에 이 capability 를 준다 —
     목록에 없으면 거의 모든 선택 요청이 통째로 거부된다. */
  "transition"
];

/* 사람이 읽는 한 줄 라벨("HOME · 제목 · Recent Notes"). 프롬프트에
   그대로 들어가므로 길이를 자르고 제어문자를 거른다. */
const SKIN_AI_SELECTION_MAX_LABEL_LENGTH = 80;

const SKIN_AI_SELECTION_ALLOWED_KEYS = [
  "template", "editId", "elementType", "tagName", "label",
  "binding", "imageSlot", "hrefBinding", "region",
  "repeat", "insideRepeat", "capabilities"
];

const SKIN_AI_SELECTION_CONTROL_CHAR_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;


function isSkinAiSelectionNullableString(value, pattern) {

  if (value === null || value === undefined) {
    return true;
  }

  return typeof value === "string" && pattern.test(value);

}


function readSkinAiSelectionNullableString(value) {

  return (typeof value === "string" && value) ? value : null;

}


/* template html 안에 그 editId가 실제로 있는가 (위 주석 참고) */
function skinAiTemplateHasEditId(skinPackage, template, editId) {

  const templates =
    isSkinAiPlainObject(skinPackage) && isSkinAiPlainObject(skinPackage.templates)
      ? skinPackage.templates
      : null;

  const entry =
    templates ? templates[template] : null;

  const html =
    (isSkinAiPlainObject(entry) && typeof entry.html === "string")
      ? entry.html
      : "";

  if (!html) {
    return false;
  }

  return (
    html.indexOf('data-imory-edit-id="' + editId + '"') !== -1 ||
    html.indexOf("data-imory-edit-id='" + editId + "'") !== -1
  );

}


/* =========================================================
   validateSkinAiSelectionContext(value, skinPackage)
     -> { ok: true, selection: null }   선택 없음(= 기존 경로 그대로)
        { ok: true, selection: {...} }  검증을 통과해 새로 만든 객체
        { ok: false, message }          400 (OpenAI 호출 0회)
========================================================== */

function validateSkinAiSelectionContext(value, skinPackage) {

  if (value === undefined || value === null) {
    return { ok: true, selection: null };
  }

  if (!isSkinAiPlainObject(value)) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
  }

  const unknownKey =
    Object.keys(value).find(
      (key) => SKIN_AI_SELECTION_ALLOWED_KEYS.indexOf(key) === -1
    );

  if (unknownKey !== undefined) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
  }

  if (SKIN_AI_TEMPLATE_PAGE_TYPES.indexOf(value.template) === -1) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소의 페이지를 알 수 없습니다." };
  }

  if (
    typeof value.editId !== "string" ||
    !SKIN_AI_SELECTION_EDIT_ID_PATTERN.test(value.editId)
  ) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소를 식별할 수 없습니다." };
  }

  if (SKIN_AI_SELECTION_ELEMENT_TYPES.indexOf(value.elementType) === -1) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소의 종류를 알 수 없습니다." };
  }

  if (
    typeof value.tagName !== "string" ||
    !SKIN_AI_SELECTION_TAG_NAME_PATTERN.test(value.tagName)
  ) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소의 종류를 알 수 없습니다." };
  }

  if (
    !isSkinAiSelectionNullableString(value.binding, SKIN_AI_SELECTION_PATH_PATTERN) ||
    !isSkinAiSelectionNullableString(value.hrefBinding, SKIN_AI_SELECTION_PATH_PATTERN) ||
    !isSkinAiSelectionNullableString(value.repeat, SKIN_AI_SELECTION_PATH_PATTERN) ||
    !isSkinAiSelectionNullableString(value.imageSlot, SKIN_AI_SELECTION_SLOT_NAME_PATTERN)
  ) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
  }

  if (
    value.region !== null &&
    value.region !== undefined &&
    SKIN_AI_SELECTION_REGION_NAMES.indexOf(value.region) === -1
  ) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
  }

  if (
    value.insideRepeat !== undefined &&
    value.insideRepeat !== null &&
    typeof value.insideRepeat !== "boolean"
  ) {
    return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
  }

  let label = null;

  if (value.label !== undefined && value.label !== null) {

    if (typeof value.label !== "string") {
      return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
    }

    /*
      제어문자는 프롬프트 안에서 줄을 갈라 "계약처럼 보이는 문장"을
      끼워 넣는 데 쓰일 수 있다 — 공백 하나로 접는다. 라벨은 어차피
      한 줄짜리 표시용이라 잃는 정보가 없다.
    */
    label =
      value.label
        .replace(SKIN_AI_SELECTION_CONTROL_CHAR_PATTERN, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (label.length > SKIN_AI_SELECTION_MAX_LABEL_LENGTH) {
      label = label.slice(0, SKIN_AI_SELECTION_MAX_LABEL_LENGTH);
    }

    if (!label) {
      label = null;
    }

  }

  let capabilities = [];

  if (value.capabilities !== undefined && value.capabilities !== null) {

    if (!Array.isArray(value.capabilities)) {
      return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
    }

    if (value.capabilities.length > SKIN_AI_SELECTION_CAPABILITY_NAMES.length) {
      return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
    }

    const badCapability =
      value.capabilities.find(
        (name) => SKIN_AI_SELECTION_CAPABILITY_NAMES.indexOf(name) === -1
      );

    if (badCapability !== undefined) {
      return { ok: false, code: SKIN_AI_ERROR_CODES.SELECTION_INVALID, message: "선택한 요소 정보가 올바르지 않습니다." };
    }

    capabilities =
      value.capabilities.slice();

  }

  /*
    ★ 마지막 관문 — 그 요소가 정말 이 SkinPackage 안에 있는가.
    없는 editId로 요청이 오면 모델은 타깃을 찾지 못한 채 "비슷한
    다른 요소"를 고치게 된다(요구사항 6절 8번이 금지하는 바로 그
    동작). OpenAI를 부르기 전에 여기서 끝낸다.
  */
  if (!skinAiTemplateHasEditId(skinPackage, value.template, value.editId)) {

    return {
      ok: false,
      code: SKIN_AI_ERROR_CODES.SELECTION_TARGET_NOT_FOUND,
      message: "선택한 요소를 수정 대상으로 찾지 못했습니다. 다시 선택해 주세요."
    };

  }

  return {
    ok: true,
    selection: {
      template: value.template,
      editId: value.editId,
      elementType: value.elementType,
      tagName: value.tagName,
      label,
      binding: readSkinAiSelectionNullableString(value.binding),
      imageSlot: readSkinAiSelectionNullableString(value.imageSlot),
      hrefBinding: readSkinAiSelectionNullableString(value.hrefBinding),
      region: readSkinAiSelectionNullableString(value.region),
      repeat: readSkinAiSelectionNullableString(value.repeat),
      insideRepeat: value.insideRepeat === true,
      capabilities
    }
  };

}



/* =========================================================
   모델 설정

   모델명은 여기 한 곳에만 적는다 — 다른 함수는 전부
   resolveSkinAiModel(env)이 돌려준 값을 인자로 받는다.
   운영 중에 바꿔야 하면 Pages 환경변수 SKIN_AI_MODEL만 고친다.
========================================================== */

const SKIN_AI_DEFAULT_MODEL = "gpt-5.6-terra";

const SKIN_AI_REASONING_EFFORT = "low";

const SKIN_AI_MAX_OUTPUT_TOKENS = 24000;

const SKIN_AI_OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

/* Cloudflare Function -> OpenAI 요청 상한. 브라우저 쪽
   (studio/ai/studio-ai-panel.js)은 이보다 조금 긴 100초를 쓴다 —
   먼저 끊기는 쪽이 항상 서버여야 "AI가 응답하지 않았습니다"라는
   구체적인 메시지를 돌려줄 수 있다. */
const SKIN_AI_MODEL_TIMEOUT_MS = 90 * 1000;

/* drawer 상태줄 한 줄짜리라 100자를 넘길 이유가 없다. schema의
   설명으로도 요구하고, 넘겨서 오면 여기서 자른다. */
const SKIN_AI_MAX_SUMMARY_LENGTH = 100;

const SKIN_AI_STRUCTURED_OUTPUT_NAME = "imory_skin_package_edit";


function resolveSkinAiModel(env) {

  const configured =
    (env && typeof env.SKIN_AI_MODEL === "string")
      ? env.SKIN_AI_MODEL.trim()
      : "";

  return configured || SKIN_AI_DEFAULT_MODEL;

}


/* =========================================================
   진단 코드 + 단계 로그 (PHASE AI-6B.1)

   ★ 왜 필요했나
   AI 요청이 실패하면 사용자에게 "AI 요청을 처리하지 못했습니다."
   한 줄만 보였고, 개발자도 어느 단계에서 끊겼는지 알 수 없었다.
   특히 **응답이 JSON이 아닌 경우**(Function 예외 → Cloudflare가
   만든 HTML 500, edge timeout 524)에는 서버가 쓴 메시지가 아예
   존재하지 않아 브라우저가 그 generic 문장으로 떨어졌다. 그래서
   "OpenAI까지 갔는가"조차 구분할 수 없었다.

   ★ 이 파일이 지키는 것
   - 실패 응답은 **항상** { ok:false, code, message } JSON이다.
     아래 onRequest()가 전체를 try/catch로 감싸므로 예상 못 한
     예외도 SERVER_ERROR JSON이 된다 — HTML 500이 브라우저에
     도달하는 경로를 없앤다.
   - code는 짧은 내부 식별자다. raw OpenAI 응답 본문 / SkinPackage /
     instruction 원문은 code에도 message에도 들어가지 않는다.
   - 로그는 stage + code + 몇 가지 크기 정도만 남긴다(아래
     logSkinAiStage). instruction 원문 / SkinPackage 전문 / 이미지
     base64는 **절대** 로그에 넣지 않는다.

   ★ client에도 같은 표가 있다
   studio/ai/studio-ai-panel.js의 STUDIO_AI_ERROR_MESSAGES가 이
   code들을 사용자 문장으로 옮긴다. 코드를 더하거나 이름을 바꾸면
   두 파일을 함께 고친다(skin-sanitize.js ↔ studio-inspector-model.js
   의 edit-id 패턴과 같은 성격의 미러다).

   ★ 단계 이름 (요구사항 1절)
   S1 selection capture        client
   S2 request-package stamping client
   S3 client request validation client
   S4 server selectionContext validation   ← 여기부터 이 파일
   S5 selected editId 존재 검사
   S6 OpenAI request 시작
   S7 OpenAI HTTP response
   S8 Structured Output parse
   S9 SkinPackage import validation        ← 다시 client
   S10 stale check
   S11 applyAiSkinPackage
   S12 selection reconcile
========================================================== */

const SKIN_AI_ERROR_CODES = {

  /* 요청 형식 — OpenAI 호출 전 */
  BAD_METHOD: "BAD_METHOD",
  BODY_TOO_LARGE: "BODY_TOO_LARGE",
  BAD_REQUEST: "BAD_REQUEST",
  INSTRUCTION_EMPTY: "INSTRUCTION_EMPTY",
  INSTRUCTION_TOO_LONG: "INSTRUCTION_TOO_LONG",
  SKIN_PACKAGE_MISSING: "SKIN_PACKAGE_MISSING",
  REFERENCE_IMAGE_INVALID: "REFERENCE_IMAGE_INVALID",

  /* 선택 요소 (S4 / S5) */
  SELECTION_INVALID: "SELECTION_INVALID",
  SELECTION_TARGET_NOT_FOUND: "SELECTION_TARGET_NOT_FOUND",

  /* 인증 / 설정 */
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_CONFIGURED: "NOT_CONFIGURED",

  /* OpenAI (S6 / S7 / S8) */
  OPENAI_TIMEOUT: "OPENAI_TIMEOUT",
  OPENAI_UNREACHABLE: "OPENAI_UNREACHABLE",
  OPENAI_RATE_LIMIT: "OPENAI_RATE_LIMIT",
  OPENAI_ERROR: "OPENAI_ERROR",
  OPENAI_INCOMPLETE: "OPENAI_INCOMPLETE",
  OPENAI_REFUSAL: "OPENAI_REFUSAL",
  STRUCTURED_OUTPUT_INVALID: "STRUCTURED_OUTPUT_INVALID",

  /* 예상하지 못한 예외 — 이 코드가 보이면 Function 로그를 본다 */
  SERVER_ERROR: "SERVER_ERROR"

};


/* =========================================================
   logSkinAiStage(stage, code, detail)

   Cloudflare Function 로그 한 줄. detail에는 **크기와 분류만**
   넣는다 — 내용은 넣지 않는다. 호출자가 실수로 원문을 넘기지
   못하도록, 여기서 문자열 값은 전부 길이로 바꾼다.
========================================================== */

function logSkinAiStage(stage, code, detail) {

  const safe = {};

  Object.keys(detail || {}).forEach((key) => {

    const value = detail[key];

    if (typeof value === "string") {
      /* 내용이 아니라 길이만 남긴다 */
      safe[key + "Length"] = value.length;
      return;
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
      return;
    }

  });

  console.log("skin-ai:", stage, code, safe);

}


function skinAiJson(status, body) {

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );

}


/*
  실패 응답은 항상 code를 함께 낸다 (PHASE AI-6B.1). stage를 주면
  Function 로그에도 한 줄 남는다 — 그래야 production에서 "어느
  단계에서 끊겼는가"를 볼 수 있다.
*/
function skinAiFail(status, message, code, stage, detail) {

  const errorCode =
    code || SKIN_AI_ERROR_CODES.BAD_REQUEST;

  logSkinAiStage(stage || "S?", errorCode, { status, ...(detail || {}) });

  return skinAiJson(
    status,
    {
      ok: false,
      code: errorCode,
      message
    }
  );

}


function isSkinAiPlainObject(value) {

  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );

}


/* =========================================================
   Supabase access token 검증

   토큰을 여기서 직접 해석(JWT 서명 검증)하지 않는다 — Supabase에
   그대로 물어보고 200이면 통과다. 검증용 fetch 한 번이라 이번
   Phase의 범위를 키우지 않으면서도 "로그인한 사용자만"이라는
   실제 방어선이 생긴다.
========================================================== */

async function verifySkinAiAccessToken(request, env) {

  const header =
    request.headers.get("authorization") || "";

  const match =
    /^Bearer\s+(.+)$/i.exec(header.trim());

  if (!match) {
    return { ok: false, status: 401, code: SKIN_AI_ERROR_CODES.UNAUTHENTICATED, message: "로그인이 필요합니다." };
  }

  const accessToken =
    match[1].trim();

  if (!accessToken) {
    return { ok: false, status: 401, code: SKIN_AI_ERROR_CODES.UNAUTHENTICATED, message: "로그인이 필요합니다." };
  }

  const supabaseUrl =
    (env && env.SUPABASE_URL) || SKIN_AI_SUPABASE_URL_FALLBACK;

  const supabaseAnonKey =
    (env && env.SUPABASE_ANON_KEY) || SKIN_AI_SUPABASE_ANON_KEY_FALLBACK;

  let response;

  try {

    response =
      await fetch(
        supabaseUrl + "/auth/v1/user",
        {
          headers: {
            apikey: supabaseAnonKey,
            authorization: "Bearer " + accessToken
          }
        }
      );

  } catch (err) {

    return {
      ok: false,
      status: 503,
      message: "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."
    };

  }

  if (!response.ok) {

    return {
      ok: false,
      status: 401,
      message: "로그인이 만료되었습니다. 새로고침 후 다시 시도해주세요."
    };

  }

  let user;

  try {
    user = await response.json();
  } catch (err) {

    return {
      ok: false,
      status: 503,
      message: "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."
    };

  }

  if (!user || typeof user.id !== "string") {
    return { ok: false, status: 401, code: SKIN_AI_ERROR_CODES.UNAUTHENTICATED, message: "로그인이 필요합니다." };
  }

  return { ok: true, userId: user.id };

}


/* =========================================================
   허용 사용자 (SKIN_AI_ALLOWED_USER_IDS)

   "uuid1,uuid2,uuid3" 형식. 공백은 잘라내고, 빈 항목은 버린다.

   ★ fail closed — 목록이 비어 있으면 아무도 통과하지 못한다.
   환경변수를 설정하지 않은 배포에서 전원 허용이 되면, 설정을
   깜빡한 실수가 곧바로 과금 사고가 된다. 반대 방향(아무도 못 씀)은
   화면에 오류가 보일 뿐 돈이 나가지 않는다.
========================================================== */

function readSkinAiAllowedUserIds(env) {

  const raw =
    (env && typeof env.SKIN_AI_ALLOWED_USER_IDS === "string")
      ? env.SKIN_AI_ALLOWED_USER_IDS
      : "";

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

}


function isSkinAiAllowedUser(env, userId) {

  const allowed =
    readSkinAiAllowedUserIds(env);

  if (allowed.size === 0) {
    return false;
  }

  return allowed.has(userId);

}


/* =========================================================
   모델에게 보내는 현재 SkinPackage

   JSON.parse()로 얻은 원본 객체를 스프레드하지 않는다 —
   skin/skin-package-import.js 상단의 "__proto__ own key" 주의와
   같은 이유로, 알려진 필드만 하나씩 읽어 새 리터럴에 담는다.

   여기서 SkinPackage 유효성 검사를 하지 않는다 — 잘못된
   SkinPackage로 만들어진 결과는 브라우저의 validator가 거부한다.
   이 함수의 책임은 "프롬프트에 넣어도 안전한 모양으로 정리한다"
   까지다.
========================================================== */

function normalizeSkinAiInputPackage(input) {

  const templatesInput =
    isSkinAiPlainObject(input.templates)
      ? input.templates
      : null;

  const templates = {};

  if (templatesInput) {

    SKIN_AI_TEMPLATE_PAGE_TYPES.forEach((pageType) => {

      /*
        HIGHLIGHT-2: 하이라이트 화면은 옛 이름(templates.memos)으로
        저장된 스킨이 있다. 모델에게는 언제나 highlights 한 이름으로만
        보여 준다 — 둘 다 들어 있으면 highlights 가 이긴다(렌더
        우선순위와 같다, skin/skin-template.js).
      */
      const template =
        pageType === "highlights" &&
        !(isSkinAiPlainObject(templatesInput.highlights) &&
          typeof templatesInput.highlights.html === "string")
          ? templatesInput.memos
          : templatesInput[pageType];

      if (isSkinAiPlainObject(template) && typeof template.html === "string") {
        templates[pageType] = { html: template.html };
      }

    });

  }

  const normalized = {
    schemaVersion: input.schemaVersion,
    templates,
    css: typeof input.css === "string" ? input.css : "",
    imageSlots: Array.isArray(input.imageSlots) ? input.imageSlots : [],
    regions: Array.isArray(input.regions) ? input.regions : [],
    metadata: isSkinAiPlainObject(input.metadata) ? input.metadata : {}
  };

  /*
    BOTTOM-DOCK-1 — 모델은 dock **설정도** 본다.

    "독이 너무 커. 평소에는 작은 하트만 보이고 누르면 펼쳐지게
    해줘" 같은 요청은 HTML/CSS 가 아니라 이 설정의 칸 몇 개를
    바꾸는 일이다(collapsible / defaultState / trigger / transition).
    현재 값을 보여 주지 않으면 모델은 그 대신 새 마크업과 JS 를
    지어내려 한다 — 그것이 정확히 요구사항 13절이 막으려는 것이다.

    설정이 없는 스킨에서는 키 자체를 만들지 않는다(지금까지의
    모든 스킨에서 프롬프트가 한 글자도 달라지지 않는다).
  */

  if (isSkinAiPlainObject(input.bottomDock)) {
    normalized.bottomDock = input.bottomDock;
  }

  return normalized;

}


/* =========================================================
   BOTTOM-DOCK-1 — 모델이 돌려준 bottomDock 을 칸 단위로 걸러 받기

   sanitizeSkinAiBottomDock(fromModel, current) -> object | undefined

   규칙 하나로 요약된다: **모르는 값이면 현재 값을 쓴다.**
   항목은 하나씩 본다 — 모양이 틀린 항목만 버리고 나머지는 받는다.
   결과는 언제나 skin/skin-package-import.js 의 bottom-dock 검사를
   통과하는 모양이다(그래야 AI 수정 전체가 거부되지 않는다).

   ★ 현재 dock 이 없고 모델도 만들지 않았으면 undefined 다 —
     "없던 dock 이 AI 를 한 번 썼다고 생기는" 일은 없다. 사용자가
     실제로 요청하면 모델이 만들어 보내고, 그때는 받는다.
========================================================== */

function pickSkinAiDockEnum(value, allowed, fallback) {

  return (typeof value === "string" && allowed.indexOf(value) !== -1)
    ? value
    : fallback;

}


/* TRANSITION-1 — bottomDock.transition 은 { type, duration, easing,
   direction } 이다. 옛 모양(문자열)도 받는다. 칸 단위로 걸러 받는
   규칙 그대로 — 모르는 칸은 현재 값(없으면 기본값)으로 되돌리고,
   duration 은 안전한 범위로 **자른다**. */
function sanitizeSkinAiTransition(fromModel, current) {

  const base =
    isSkinAiPlainObject(current)
      ? current
      : { type: typeof current === "string" ? current : "fade" };

  const source =
    isSkinAiPlainObject(fromModel)
      ? fromModel
      : (typeof fromModel === "string" ? { type: fromModel } : {});

  const pick = (key, allowed, fallback) =>
    pickSkinAiDockEnum(
      source[key],
      allowed,
      pickSkinAiDockEnum(base[key], allowed, fallback)
    );

  const rawDuration =
    typeof source.duration === "number" && Number.isFinite(source.duration)
      ? source.duration
      : (typeof base.duration === "number" && Number.isFinite(base.duration)
          ? base.duration
          : SKIN_AI_TRANSITION_DURATION_DEFAULT);

  return {
    type: pick("type", SKIN_AI_DOCK_TRANSITIONS, "fade"),
    duration: Math.round(
      Math.min(SKIN_AI_TRANSITION_DURATION_MAX, Math.max(SKIN_AI_TRANSITION_DURATION_MIN, rawDuration))
    ),
    easing: pick("easing", SKIN_AI_TRANSITION_EASINGS, "ease"),
    direction: pick("direction", SKIN_AI_TRANSITION_DIRECTIONS, "up")
  };

}


function sanitizeSkinAiDockVisual(value) {

  if (!isSkinAiPlainObject(value)) {
    return null;
  }

  const type =
    typeof value.type === "string" ? value.type.trim() : "";

  if (SKIN_AI_DOCK_VISUAL_TYPES.indexOf(type) === -1) {
    return null;
  }

  const raw =
    typeof value.value === "string" ? value.value.trim() : "";

  if (!raw) {
    return null;
  }

  if (type === "icon") {
    return /^[a-z][a-z0-9-]{0,31}$/.test(raw.toLowerCase())
      ? { type, value: raw.toLowerCase() }
      : null;
  }

  if (type === "emoji") {
    return { type, value: raw.slice(0, 8) };
  }

  if (type === "text") {
    return { type, value: raw.slice(0, 24) };
  }

  if (type === "asset") {
    return { type, value: raw.slice(0, 64) };
  }

  /* image / svg — https 주소만 */
  return /^https:\/\/[^\s"'<>]+$/i.test(raw)
    ? { type, value: raw.slice(0, 2048) }
    : null;

}


function sanitizeSkinAiDockAction(value) {

  if (!isSkinAiPlainObject(value)) {
    return null;
  }

  const type =
    typeof value.type === "string" ? value.type.trim() : "";

  const target =
    typeof value.target === "string" ? value.target.trim() : "";

  if (!target) {
    return null;
  }

  if (type === "navigate") {

    if (SKIN_AI_DOCK_NAVIGATE_TARGETS.indexOf(target) !== -1) {
      return { type, target };
    }

    if (target.startsWith("category:")) {
      return /^[A-Za-z0-9_-]{1,64}$/.test(target.slice("category:".length))
        ? { type, target }
        : null;
    }

    if (target.startsWith("path:")) {
      const p = target.slice("path:".length);
      return (
        /^\/[A-Za-z0-9/_\-.?=&%]{0,255}$/.test(p) &&
        p.indexOf("//") === -1 &&
        p.indexOf("..") === -1
      )
        ? { type, target }
        : null;
    }

    return null;

  }

  if (type === "open") {

    const panel =
      (target.startsWith("panel:") ? target.slice("panel:".length) : target).toLowerCase();

    return /^[a-z][a-z0-9-]{0,31}$/.test(panel)
      ? { type, target: `panel:${panel}` }
      : null;

  }

  if (type === "action") {
    return SKIN_AI_DOCK_ACTION_TARGETS.indexOf(target) !== -1
      ? { type, target }
      : null;
  }

  return null;

}


function sanitizeSkinAiBottomDock(fromModel, current) {

  const base =
    isSkinAiPlainObject(current) ? current : null;

  const model =
    isSkinAiPlainObject(fromModel) ? fromModel : null;

  if (!base && !model) {
    return undefined;
  }

  const source =
    model || base;

  const fallback =
    base || {};


  /* 항목 — 모델이 배열을 줬으면 그것을, 아니면 현재 것을 */

  const rawItems =
    Array.isArray(source.items)
      ? source.items
      : (Array.isArray(fallback.items) ? fallback.items : []);

  const items = [];
  const seen = new Set();

  for (const raw of rawItems) {

    if (items.length >= SKIN_AI_DOCK_MAX_ITEMS) {
      break;
    }

    if (!isSkinAiPlainObject(raw)) {
      continue;
    }

    const id =
      typeof raw.id === "string" ? raw.id.trim().slice(0, 32) : "";

    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(id) || seen.has(id)) {
      continue;
    }

    const visual = sanitizeSkinAiDockVisual(raw.visual);
    const action = sanitizeSkinAiDockAction(raw.action);

    if (!visual || !action) {
      continue;
    }

    seen.add(id);

    items.push({
      id,
      label: typeof raw.label === "string" ? raw.label.trim().slice(0, 24) : "",
      audience: pickSkinAiDockEnum(raw.audience, SKIN_AI_DOCK_AUDIENCES, "all"),
      visual,
      action
    });

  }


  const trigger =
    sanitizeSkinAiDockVisual(source.trigger) ||
    sanitizeSkinAiDockVisual(fallback.trigger) ||
    { type: "text", value: "⌄" };

  return {
    visible: source.visible !== false,
    position: pickSkinAiDockEnum(source.position, SKIN_AI_DOCK_POSITIONS, "auto"),
    collapsible: source.collapsible === true,
    defaultState: pickSkinAiDockEnum(source.defaultState, SKIN_AI_DOCK_STATES, "expanded"),
    transition: sanitizeSkinAiTransition(source.transition, fallback.transition),
    trigger: {
      type: trigger.type,
      value: trigger.value,
      label:
        isSkinAiPlainObject(source.trigger) && typeof source.trigger.label === "string"
          ? source.trigger.label.trim().slice(0, 24)
          : ""
    },
    items
  };

}


/* =========================================================
   시스템 프롬프트 — Imory Skin Designer Contract

   ★ 여기 한 곳에서만 관리한다. 다른 파일/다른 함수에 프롬프트
   조각을 흩지 않는다.

   길이 목표는 3K~5K 토큰 이하다. 스킨 계약 문서
   (SKIN_DESIGNER_CONTRACT.md / AI_SKIN_PHASE1C_PAGE_CONTRACT.md)를
   통째로 붙여넣지 않고, "모델이 틀릴 수 있는 것"만 압축해 적는다.

   아래 목록의 근거는 전부 저장소의 실제 코드다:
   - 허용 태그/속성  : skin/skin-sanitize.js
   - CSS 제한        : skin/skin-css-validate.js
   - post-body region: skin/skin-template.js htmlHasPostBodyRegion
   - binding 경로    : skin/skin-context.js
   sanitizer/validator가 기계적으로 잡아주는 것도 프롬프트에 적는다 —
   잡히면 사용자에게는 "고치지 못했습니다"로 보일 뿐이라, 애초에
   만들지 않게 하는 편이 낫다.

   반대로 **validator가 검사하지 않는 것**(owner/admin 링크 보존,
   최소 변경)은 프롬프트가 유일한 방어선이므로 특히 강하게 쓴다.

   ★ 참고 이미지 규칙은 첨부가 있을 때만 덧붙인다 (PHASE AI-4)
   첨부가 없는데 "attached images"를 설명하면 토큰만 쓰고 모델을
   혼란스럽게 한다. hasReferenceImages가 false면 이 함수는 PHASE
   AI-2와 **글자 하나 다르지 않은** 문자열을 돌려준다.
========================================================== */

function buildSkinAiSystemPrompt(hasReferenceImages, hasSelection) {

  const base = [

    "You are the skin editor built into Imory Skin Studio.",
    "Imory is a Korean personal blog service. A \"SkinPackage\" is a JSON object that decides how one blog's public pages look.",
    "You receive the user's current SkinPackage and one instruction, and you return the edited SkinPackage.",
    "You are NOT designing a new website from scratch. You are making the smallest change that satisfies the instruction.",
    "",
    "## Minimal change (most important rule)",
    "- Keep everything the user did not ask you to change: layout, structure, typography, spacing, colors, class names, element order.",
    "- Example: \"make the background light pink\" means you change background colors. It does not mean you redesign the layout or rewrite the templates.",
    "- Reuse the existing CSS class names and the existing HTML structure. Do not rename classes that already work.",
    "- If the instruction only concerns one page, leave the other pages' HTML byte-for-byte identical.",
    "",
    "## What you return",
    "- Always return a complete, self-consistent result: all four templates plus the complete CSS.",
    "- `css` is the FULL stylesheet for the skin, not a patch or a diff. Anything you leave out is deleted.",
    "- Never answer with prose, Markdown, code fences, or partial CSS. Only the structured fields.",
    "- `summary` is one short Korean sentence (100 characters or fewer) describing what you changed, for a status line.",
    "",
    "## templates",
    "- `templates.home`, `templates.category`, `templates.post` are required. Always return all three, even if you changed none of them.",
    "- `templates.banner` is optional. If the current package has a banner template, return it (edited or unchanged). Return null ONLY if the current package has no banner template.",
    "- `templates.folder` is optional (same rule as banner): return the current folder template edited or unchanged; return null ONLY if the current package has no folder template and the user did not ask for a folder page.",
    "- `templates.highlights` is optional (same rule): return the current highlights template edited or unchanged; return null ONLY if the current package has no highlights template and the user did not ask for the highlights page. Returning null does NOT hide the highlights page — the platform draws it with a built-in default template instead.",
    "- `templates.dock` is optional (same rule): the bottom dock's markup. Returning null does NOT remove the dock — the platform draws a plain default instead. See BOTTOM DOCK below.",
    "- Never declare support for a page you did not actually write. If the package's `metadata.supports` claims a page (for example `supports.highlights: true`), that page MUST have a real template with real bindings; a stub of links or buttons is not one. The mismatch is reported to the owner when they save.",
    "- home  : the blog front page (profile, navigation, recent post list).",
    "- category: one category's post list.",
    "- post  : one post's title/date plus the protected body region.",
    "- banner: one banner-type category's link images.",
    "- folder: one folder's posts read as a series — every post's body flows top to bottom on one page (see \"FOLDER\" below).",
    "- highlights: the blog owner's highlight cards collected from every category (see \"HIGHLIGHTS\" below).",
    "",
    "## Imory runtime bindings (data-imory-*)",
    "The platform fills these in at render time. Never invent new attribute names and never invent context paths that are not listed here.",
    "- `data-imory-bind=\"path\"`   inserts the value as text.",
    "- `data-imory-src=\"path\"`    sets an <img> src.",
    "- `data-imory-href=\"path\"`   sets an <a> href.",
    "- `data-imory-if=\"path\"`     hides the element when the value is falsy.",
    "- `data-imory-repeat=\"path\"` repeats the element once per array entry; inside it, use `item.*`. Repeats may be nested (a repeat inside a repeat, up to 5 levels); an inner `item` shadows the outer one.",
    "- `data-imory-kind=\"path\"`   writes the resolved kind token into a `data-kind` attribute on the same element, so CSS can style by KIND: `[data-kind=\"image\"]::before { ... }`. Use it for category icons and any other per-kind decoration.",
    "- `data-imory-color=\"path\"`  writes the resolved `#rgb`/`#rrggbb` value into the CSS custom property `--imory-color` on that element. Read it back with `var(--imory-color, <your fallback>)`. This is the ONLY way to use a per-item colour, because the `style` attribute is forbidden.",
    "- `data-imory-region=\"post-body\"` marks the protected post body. It appears once in `templates.post`, and once per repeated post inside `templates.folder` (see FOLDER).",
    "- `data-imory-region=\"owner-tools\"` marks where the platform's own owner buttons (＋ new post, edit) are placed. Leave the element empty.",
    "- `data-imory-region=\"bottom-dock\"` (optional) marks where the bottom dock sits inside your layout when it is in the content flow. Leave the element empty. See BOTTOM DOCK below.",
    "Keep every binding that already exists unless the user explicitly asks to remove that piece of content.",
    "",
    "## Layout primitives (data-imory-layout / data-imory-item / data-imory-slot)",
    "The platform has five built-in layout primitives. When a request is about WHERE things sit — order, columns, side by side, free placement, grouping — express it with these attributes instead of inventing new CSS. The owner's own no-AI edit form writes exactly the same attributes, so a layout you build this way stays editable by hand, and vice versa. The attributes carry NO visual design: colour, borders, radius, shadows and typography stay in the CSS, untouched.",
    "- `data-imory-layout=\"panel\"`   a plain group. It does not arrange anything itself; put another primitive inside it.",
    "- `data-imory-layout=\"stack\"`   children in one direction, in order. `data-imory-layout-direction=\"column|row\"` (default column), `-gap` (px 0-160), `-align` (start|center|end|stretch|baseline), `-justify` (start|center|end|between|around), `-wrap` (wrap|nowrap).",
    "- `data-imory-layout=\"grid\"`    children in cells. `data-imory-layout-columns` (1-12), `-columns-tablet`, `-columns-mobile`, `-gap`, `-row-gap`, `-min` (px; when set, the column count follows the available width and the columns numbers are ignored). On a child: `data-imory-item-span` (1-12) and `data-imory-item-row-span` (1-6).",
    "- `data-imory-layout=\"free\"`    children at free coordinates. `data-imory-layout-height` (px, the container's height). On a child: `data-imory-item-x` and `data-imory-item-y` are RATIOS from 0 to 1 (0 = flush left/top, 0.5 = centred, 1 = flush right/bottom), plus `data-imory-item-width` / `-height` in percent and `data-imory-item-z`. Never write pixel coordinates — ratios are what keeps the element inside the box at every screen width.",
    "- `data-imory-layout=\"sidebar\"` a secondary column beside the main content. `data-imory-layout-side=\"left|right\"`, `-sidebar-width` (px 60-600), `-gap`, `-collapse` (480|600|720|900 — the width below which it stacks), `-mobile` (stack|hide). Mark the two children with `data-imory-slot=\"sidebar\"` and `data-imory-slot=\"main\"`; a sidebar without a `sidebar` slot child renders as one block.",
    "Primitives nest: a panel can hold a sidebar whose main slot holds a grid. Build complex arrangements by nesting, not by writing new positioning CSS.",
    "- The platform stylesheet already handles responsiveness: grid drops columns at 900px and 600px, sidebar stacks (content first) below its collapse width, and free coordinates are ratios. So do NOT add your own media queries, `position: absolute`, `float`, or negative margins to reproduce these five arrangements.",
    "- Values outside the ranges above are dropped when the skin is saved, and the element then renders with no layout at all. Stay inside them.",
    "- Interpret layout requests as primitive changes: \"swap these two\" = move the elements in the HTML; \"put these four in two columns\" = `grid` with `columns=\"2\"`; \"menu on the left, posts on the right\" = `sidebar` with `side=\"left\"`; \"move the profile photo freely to the top right\" = make the parent `free` and give that child `x=\"1\" y=\"0\"`; \"group these three\" = wrap them in one element with a layout.",
    "- Scope: when the user selected one container and asked to change its layout, change THAT element's layout attributes and nothing else. Do not restyle the rest of the page and do not convert unrelated containers to primitives.",
    "- Existing skins have no layout attributes and must keep working exactly as they are. Only add them where the request is actually about arrangement.",
    "",
    "## Transition primitives (data-imory-transition / data-imory-panel / data-imory-toggle)",
    "The platform has ONE shared transition primitive for anything that appears or disappears: an element entering the screen, a page change, a panel opening/closing, the bottom dock folding. When a request is about how something APPEARS, DISAPPEARS or MOVES IN, express it with these attributes. Do NOT write `@keyframes`, `animation:` or `transition: opacity/transform` CSS for it, and never JavaScript — the owner's no-AI edit form writes exactly these attributes, so a transition built this way stays editable by hand.",
    "- `data-imory-transition=\"none|fade|slide|scale|fade-slide|fade-scale\"` on the element. It plays when that element enters the screen. Put it on a template's OUTERMOST element to make that PAGE fade/slide in on every navigation (HOME/CATEGORY/POST ...).",
    "- `data-imory-transition-duration` = milliseconds " + SKIN_AI_TRANSITION_DURATION_MIN + "-" + SKIN_AI_TRANSITION_DURATION_MAX + " (default 200). `data-imory-transition-easing` = ease|ease-in|ease-out|ease-in-out|linear|smooth. `data-imory-transition-direction` = up|down|left|right — the way it moves while appearing (up = rises from slightly below); only slide/scale/fade-slide/fade-scale use it. The distance is always small (12px) — there is no fly-in-from-offscreen.",
    "- Panels: mark the block with `data-imory-panel=\"<name>\"` (lowercase, a-z0-9-) and the thing that opens it with `data-imory-toggle=\"<name>\"`. The platform starts the panel CLOSED, toggles it on click, handles the keyboard, and animates it with the panel's own data-imory-transition-* attributes. A dock item with action {type:\"open\", target:\"panel:<name>\"} opens the same panel inside templates.dock. Never show/hide a panel with your own CSS or JS.",
    "- The platform stamps `data-imory-transition-state` and `inert`/`hidden` at runtime. Never write them into your HTML — they are stripped.",
    "- Map requests: \"페이드되게\" -> data-imory-transition=\"fade\". \"아래에서 살짝 올라오게\" -> \"fade-slide\" with direction \"up\". \"옆에서 들어오게\" -> \"fade-slide\" with \"left\" or \"right\". \"톡 튀어나오게/커지면서\" -> \"fade-scale\". \"더 부드럽게\" -> longer duration (300-400) and easing \"smooth\". \"빠르게\" -> 120-160. \"애니메이션 없애줘\" -> remove the data-imory-transition* attributes (or bottomDock.transition.type \"none\" for the dock) AND remove any old @keyframes/animation CSS that did the same job.",
    "- Scope: if one element is selected, put the attributes on THAT element only. For \"페이지 전환\" requests put them on each requested template's outermost element.",
    "- Hover/focus effects (colour changes, underline, lift on hover) are NOT transitions of appearing; those remain ordinary CSS.",
    "",
    "## Side areas (data-imory-sides) — left/right columns that become slide-in panels on phones",
    "A template may contain ONE frame `data-imory-sides=\"frame\"` whose DIRECT children are `data-imory-sides-area=\"left\"`, `data-imory-sides-area=\"main\"` and `data-imory-sides-area=\"right\"`. Inside main put the openers `data-imory-sides-open=\"left|right\"` (give each an aria-label; the icon is yours) and inside each side area a closer `data-imory-sides-close`.",
    "- The platform decides everything about WHEN: which sides are switched on (the owner's 1/2/3-column setting in SkinPackage.regions — you never change it), side-by-side columns on wide screens vs off-canvas panels on narrow ones, opening/closing, focus, Escape, outside click, scroll lock. Never write media queries, position:fixed, transforms or JS to show/hide the side areas, and never hide the openers yourself.",
    "- You decide LOOK: widths via `--imory-sides-left-width` / `--imory-sides-right-width` / `--imory-sides-width`, the main column via `--imory-sides-main-min` (the narrowest readable width — below main-min + open sides the areas become panels) and `--imory-sides-main-max`, the phone panel via `--imory-sides-drawer-width`, `--imory-sides-distance`, `--imory-sides-duration`, `--imory-sides-easing`, `--imory-sides-backdrop`; plus ordinary background/border/shadow/typography on the areas. Style panel-only looks with `[data-imory-sides-layout=\"drawer\"]` and column-only looks with `[data-imory-sides-layout=\"columns\"]` on the frame.",
    "- The platform stamps `data-imory-sides-layout`, `-on`, `-count`, `-state`, `-active`, `-phase` at runtime. Read them in CSS if useful; never write them into HTML (they are stripped).",
    "- Keep the frame, the three areas and the openers when you edit a template that has them. \"왼쪽 메뉴 없애줘\"/\"2단으로\" is the owner's setting, not markup: leave the areas in place and say so.",
    "",
    "### Context paths available on every page",
    "site.title, site.language",
    "profile.nickname, profile.bio, profile.avatarUrl",
    "navigation.home.name, navigation.home.href, navigation.home.enabled, navigation.home.iconKind (\"home\")",
    "navigation.categories[], navigation.postCategories[], navigation.textPostCategories[], navigation.galleryCategories[], navigation.bannerCategories[] (each item: item.id, item.name, item.href, item.type, item.iconKind). postCategories is the backwards-compatible post+gallery group. For separate menus use textPostCategories and galleryCategories; do not repeat postCategories and galleryCategories together.",
    "- `item.iconKind` is the stable KIND token for menu decoration: \"document\" (post category), \"image\" (gallery), \"quote\" (highlight), \"link\" (banner). An unknown future category type falls back to \"document\", so every item always has one.",
    "- Draw category icons from that token and NOTHING else: `<a data-imory-kind=\"item.iconKind\" ...>` plus CSS `[data-kind=\"image\"]::before`. NEVER decide an icon by position (`li:nth-child(2)`, `:first-child`, `:last-child`) and never bake a glyph character (▤ ◉ 📁) into the HTML — the owner reorders, renames and deletes categories, and a different screen shows a different number of them, so order-based icons drift and end up on the wrong rows.",
    "- Icon shape, size and colour are yours: draw them with CSS (borders, radius, pseudo-elements) so the owner can restyle them without new markup.",
    "viewer.isOwner, viewer.writeHref, viewer.adminHref, viewer.manageHref",
    "images.<slotName>  (only slot names that already exist in the package's imageSlots)",
    "",
    "### HOME",
    "home.recentPosts[]  (item.id, item.title, item.href, item.publishedAtLabel, item.categoryId, item.categoryName, item.isSecret)",
    "home.highlights  — the owner's saved excerpts, ready to be shown ON HOME (not only linked to).",
    "- `home.highlights.cards[]` newest first (a few of them). Each item has the SAME fields as a card on the highlights page: item.excerpt, item.note, item.hasNote, item.color, item.dateLabel, item.postTitle, item.postHref, item.hasNoPostLink, item.categoryName, item.sourcePathLabel.",
    "- `home.highlights.featured[]` is that same list cut to the newest ONE. Use it to show a single excerpt with the same card markup — never hide the rest with `:nth-child` or `:first-child`, because order-based hiding breaks the moment the list length changes.",
    "- `home.highlights.card` is that one card as an object, for binding without a repeat: `data-imory-bind=\"home.highlights.card.excerpt\"`.",
    "- `home.highlights.hasCard`, `.count`, `.isEmpty`, `.hasError` (guard the block with `data-imory-if=\"home.highlights.hasCard\"`; `data-imory-if` cannot negate or compare).",
    "- Colour the card from the excerpt's own colour: put `data-imory-color=\"item.color\"` on the card element and read it in CSS as `var(--imory-color, <your fallback>)`. Never hard-code one highlight colour.",
    "- A HOME slot that only renders a \"see my highlights\" button is a weaker design than one that shows a real excerpt — when the owner asks for a highlights area on HOME, draw a card and keep the link as a small `ALL` next to it.",
    "- Do NOT put `data-imory-region=\"highlight-tools\"` on HOME. That owner menu belongs to the highlights page only.",
    "",
    "### CATEGORY",
    "category.id, category.name, category.type, category.href",
    "category.posts[]  (item.id, item.title, item.href, item.publishedAtLabel, item.isSecret)",
    "category.hasFolders  (boolean: the category has at least one folder with visible posts)",
    "category.tree[]  (folder-aware hierarchy; see \"Category folders\" below)",
    "category.showPostsList  (boolean: draw `category.posts` IN ADDITION to `category.tree` on this render; see \"Category folders\" below)",
    "category.listStyle, category.pageSize, category.isGallery, category.isList  (display mode; see \"Category gallery\" below)",
    "category.gallery  (null unless this render is a gallery)",
    "category.pagination  (null unless this render is a gallery)",
    "",
    "#### Category folders — `category.posts` vs `category.tree`",
    "The blog owner can group a category's posts into folders (up to 3 levels deep). Two views of the same posts exist side by side:",
    "- `category.posts` is the FLAT list: every post of the category, newest first (created_at DESC), folders ignored. Use it for an ordinary post list that does not show folders. This is what existing skins use and its meaning never changes.",
    "- `category.tree` is the FOLDER-AWARE hierarchy: folder nodes and post nodes mixed in the order the owner arranged them (sort_order). Root-level posts (posts in no folder) are included as post nodes at the top level. Folders that contain no visible post are omitted.",
    "- Folder node: { kind: \"folder\", id, name, depth, folderHref, postCount, children: [...] } — `children` holds folder nodes and post nodes again.",
    "- Post node: { kind: \"post\", id, title, href, publishedAt, publishedAtLabel, isSecret, depth }",
    "- A folder node has NO `href`. Its link is `item.folderHref` (the folder page, see FOLDER). `folderHref` is a string only when the skin has `templates.folder` AND the folder directly contains at least one visible post; otherwise it is null. So a folder link must always be guarded: `<a data-imory-if=\"item.folderHref\" data-imory-href=\"item.folderHref\">`. Never invent a folder URL and never put the folder link on `item.href`.",
    "- `data-imory-if` cannot compare values, so do not test `item.kind`. Branch on which fields exist instead: a folder has `item.name` and `item.children`; a post has `item.title` and `item.href` (`item.href` exists ONLY on post nodes — this is how skins tell posts from folders, keep it that way). Put both branches inside the same repeated element, e.g. `<section data-imory-if=\"item.name\">…folder…</section><a data-imory-if=\"item.href\" data-imory-href=\"item.href\">…post…</a>`. The branch that does not apply is hidden automatically, so the skin CSS must contain `[hidden] { display: none; }`.",
    "- Draw deeper levels with a nested `data-imory-repeat=\"item.children\"` inside the folder branch; repeat that pattern once per level (3 folder levels + the posts inside the deepest folder = 4 nested repeats at most).",
    "- Which one to use: use `category.tree` ONLY when the user asks for folders to be shown (e.g. \"show folders as big cards and the posts inside them as a small list\"). For a plain request such as \"just show the posts as a simple newest-first list\", `category.posts` is the right choice. Never convert an existing `category.posts` skin to `category.tree` unless the user asked for folders; a skin that ignores folders is valid and must keep working unchanged.",
    "- REQUIRED when you draw `category.tree`: draw `category.posts` as well, in a second block guarded by `data-imory-if=\"category.showPostsList\"`. The owner can turn on numbered pages for a post category, and on a paged render `category.tree` holds ONLY folder nodes — the posts that are in no folder arrive on `category.posts` alone. A folder-tree-only template therefore makes those root posts vanish from the public page while the owner still sees them in their admin screen. The two guards together (`category.hasFolders` on the tree block, `category.showPostsList` on the flat list) show every post exactly once in all four combinations of folders x paging, so never guard the flat list with anything else and never draw it unguarded next to a tree.",
    "- A CATEGORY template that draws `category.pagination` but never `category.posts` is treated as \"cannot show root posts\" and the platform silently turns paging off for it, so the owner's page-size setting stops working. Keep both or neither.",
    "",
    "#### Category gallery — photo grid + numbered pages",
    "Category kinds are post, gallery and banner. post defaults to a title/date list; gallery contains uploaded photos and defaults to a responsive image grid; banner retains its image/external-link behavior. Category kind is data, while columns, spacing, proportions and card design belong to the skin. Never add a separate category display-style selector. Existing post URLs and IDs remain stable.",
    "- `category.isGallery` / `category.isList` — whether THIS render is a gallery. Exactly one is true. `data-imory-if` cannot negate, which is why both exist; use them to show one layout and hide the other.",
    "- `category.listStyle` (\"list\" | \"gallery\") is a legacy compatibility projection of category kind. `category.pageSize` is 6/12/18/24. Branch on `category.isGallery` / `category.isList`, never on `category.listStyle`; presentation is not another category setting.",
    "- IMPORTANT — the gallery only switches on when the CATEGORY template actually draws `category.gallery` or `category.pagination`. If you remove every one of those bindings, the platform falls back to the plain list for that category and the owner's gallery setting silently stops working. So in a skin that already has a gallery, KEEP the card repeat and the page links.",
    "",
    "`category.gallery` (null when `category.isList`):",
    "- `category.gallery.cards[]` — the cards of the CURRENT page. Item: item.id, item.title, item.href, item.publishedAtLabel, item.isSecret, item.isPrivate, item.thumbnailUrl, item.thumbnailAlt, item.hasThumbnail, item.isPlaceholder, item.isLocked.",
    "- Gallery cards also provide item.images[] ({id,url,alt,isPrimary}), item.imageCount and item.hasImages. thumbnailUrl uses the selected primary photo, otherwise the first uploaded photo. A separate cover is never required. Never infer image URLs from content or fetch protected bodies in skin code.",
    "- Platform width rules apply equally in Studio and published pages: use min-width:0 for flex/grid children, minmax(0,1fr), responsive media, and local horizontal scroll for pre/table. Avoid fixed page widths or minimum widths; never hide overflow to conceal clipped content. User JavaScript is prohibited and post-body remains platform-owned.",
    "- `category.gallery.isEmpty` (this page has no cards), `category.gallery.isEmptyCategory` (the whole category has no posts), `category.gallery.count`, `category.gallery.hasCards`.",
    "- Thumbnails: `item.thumbnailUrl` is null for a post with no cover image, so ALWAYS guard the img with `data-imory-if=\"item.hasThumbnail\"` and put a fallback element behind it. A card must never disappear just because it has no photo — draw a placeholder card instead (`item.isPlaceholder` is true for exactly those). Because skins cannot run JavaScript there is no `onerror`: the usual pattern is a fallback layer positioned under the img inside the same box, so a broken image reveals it.",
    "- `item.isLocked` marks a secret post. Its `item.thumbnailUrl` is NEVER that post's real cover image — the platform substitutes the category's shared placeholder or gives null. Keep a visible lock badge on those cards and never try to reach the real image.",
    "- Square thumbnails are the default look: a wrapper with `aspect-ratio` and `object-fit: cover` on the img. Expose the column count / ratio / gap as CSS custom properties on the page root so the owner can retune them without new markup.",
    "",
    "`category.pagination` (null when `category.isList`):",
    "- category.pagination.pages[] — item.number, item.label, item.href, item.isCurrent. Repeat this for numbered page links.",
    "- category.pagination.currentPage, currentPageLabel, totalPages, totalPagesLabel, totalCount, pageSize.",
    "- category.pagination.hasPages (more than one page — use it to hide the whole pager), hasPrev, hasNext, prevHref, nextHref, firstHref, lastHref.",
    "- The platform already computed every href. NEVER build a page URL yourself and never append `?page=` to `category.href` — bind `item.href` / `prevHref` / `nextHref` as they are. Each page is a real navigation to that page's posts; the cards you get are only the current page, so never try to \"show all posts\" by hiding the others with CSS.",
    "- `item.isCurrent` cannot change a class (there is no class binding), so mark the current page with a small child element guarded by `data-imory-if=\"item.isCurrent\"` inside the repeated element.",
    "",
    "- Which one to use: `category.gallery` ONLY when the user asks for a photo/grid/gallery layout. For a plain text list, `category.posts` is right. Never convert an existing gallery skin to `category.posts` (that turns the owner's gallery off and drops paging), and never convert a plain list skin to a gallery unless the user asked for one.",
    "- Folders and the gallery can coexist. In a gallery render the card list holds only the category's root posts and `category.tree` holds ONLY folder nodes (no post nodes at the top level), so drawing both a folder strip from `category.tree` and the cards from `category.gallery.cards` cannot show the same post twice. Do not try to merge the two.",
    "",
    "### FOLDER (templates.folder — the folder page / series viewer)",
    "Route: /:slug/category/:cid/folder/:fid. Shows ONE folder's direct posts (posts inside sub-folders are NOT included) in the owner's order, with every post's real body on the same page so the reader scrolls from one post into the next like a series.",
    "category.id, category.name, category.href  (the parent category)",
    "folder.id, folder.name, folder.depth, folder.href, folder.parentHref  (parentHref = nearest openable parent: parent folder page or the category)",
    "folder.ancestors[]  (item.id, item.name, item.folderHref — from the category down to the parent; folderHref may be null)",
    "folder.children[]   (item.id, item.name, item.folderHref, item.postCount — direct sub-folders that have visible posts; use for navigation only, their posts are not on this page)",
    "folder.posts[]      (item.id, item.title, item.href, item.publishedAtLabel, item.isSecret, item.editHref — direct posts in order; editHref is the owner-only edit link, null for visitors)",
    "folder.postCount",
    "Required markup: repeat `folder.posts` and put `data-imory-region=\"post-body\"` INSIDE the repeated element, one per post, e.g. `<article data-imory-repeat=\"folder.posts\"><h2 data-imory-bind=\"item.title\"></h2><div data-imory-region=\"post-body\"></div></article>`. The platform fills each region with that post's body (secret posts get a password form there). A folder template whose region is not inside the `folder.posts` repeat is rejected.",
    "Reading flow: the bodies are the content. Keep per-post chrome minimal (title, date, a thin divider) so the posts read continuously; do not wrap each post in a heavy card and do not link the title to itself unless asked. The title at the top of the page is `folder.name`.",
    "",
    "### HIGHLIGHTS (templates.highlights — the highlights page)",
    "Route: /:slug/highlights (all cards, newest first), /:slug/highlights?view=folders (grouped by the ORIGINAL post category), /:slug/highlights/category/:id (one of those groups).",
    "The blog owner highlights sentences while reading their own posts; each highlight becomes one card, with an optional short note. Visitors can read the cards of public posts but never edit them.",
    "Never call this page or its data \"memo\". That word is reserved for a different, future feature (short posts the owner writes by hand).",
    "\"Folder\" on this page means the ORIGINAL POST CATEGORY. There is no separate nesting here — never draw a tree.",
    "highlights.view.isAll, highlights.view.isFolders, highlights.view.isFolder  (exactly one is true)",
    "highlights.allHref, highlights.foldersHref, highlights.allLabel, highlights.foldersLabel  (the two view switches)",
    "highlights.cards[]  (item.id, item.excerpt, item.note, item.hasNote, item.color, item.dateLabel, item.postTitle, item.postHref, item.hasNoPostLink, item.categoryName, item.categoryHref, item.folderName, item.sourcePathLabel, item.folderHref, item.isMissing, item.isPlacementUnknown)",
    "- `item.sourcePathLabel` is the ready-made \"where this came from\" line: category > folder > post title (e.g. \"TXT > 2002 > 1\"); empty segments are already dropped. Prefer it over gluing `item.categoryName` and `item.postTitle` together yourself — `data-imory-bind` cannot concatenate.",
    "- `item.postHref` is null for a highlight whose post is gone; `item.hasNoPostLink` is the precomputed opposite, so draw the source line as an `<a data-imory-if=\"item.postHref\">` and repeat it as a plain `<span data-imory-if=\"item.hasNoPostLink\">`.",
    "- `item.color` is the colour the owner highlighted with. Bind it with `data-imory-color=\"item.color\"` on the card element and use `var(--imory-color, <fallback>)` for the card's accent (a left rule, a underline, a dot). Never hard-code one accent colour for every card, and never try to read the colour with `data-imory-bind`.",
    "- A complete card shows: the excerpt, the note when `item.hasNote`, the date, the accent colour, the source path, the post link, the \"not found in the original\" state (`item.isMissing`) and the `highlight-tools` slot. A highlights template that only draws links or buttons is not a highlights page.",
    "highlights.showCards (draw the card list now), highlights.isEmpty, highlights.count, highlights.hasError",
    "highlights.folders[]  (item.id, item.name, item.href, item.count, item.countLabel, item.coverUrl, item.hasCover, item.coverRatio, item.coverFocusX, item.coverFocusY)",
    "highlights.hasFolders, highlights.foldersEmpty, highlights.folder  (the open folder: .name, .href, .count, .coverUrl, .hasCover, .coverRatio)",
    "Required markup: put a `data-imory-region=\"highlight-tools\"` span INSIDE the `highlights.cards` repeat, one per card, at the end of the card. The platform puts the owner's small three-dot menu there (add/edit/delete the note, delete the highlight); visitors get an empty span. Leave it empty and never size or border it — a card list without this slot leaves the owner unable to edit their notes.",
    "Guard the two lists with `data-imory-if=\"highlights.showCards\"` (cards) and `data-imory-if=\"highlights.view.isFolders\"` (folder grid). `data-imory-if` cannot compare values, so use these precomputed booleans and never test `highlights.view` itself.",
    "item.excerpt is the quoted sentence and item.note is the owner's short note: give the excerpt the visual weight and put the note in a quieter secondary block guarded by `data-imory-if=\"item.hasNote\"`. item.color is the highlight colour — a left border or a small dot reads better than painting the whole card.",
    "Folder covers: use `item.coverUrl` only when `item.hasCover`. `item.coverRatio` is one of \"1:1\", \"3:4\", \"4:3\", \"original\"; the platform stylesheet is not loaded for your template, so express the ratio yourself with aspect-ratio rules if you want it.",
    "",
    "### BOTTOM DOCK (bottomDock + templates.dock — the bar of small objects at the bottom of every page)",
    "The dock is one of Imory's navigation primitives, but its LOOK is never standardised. Do not default to an iOS-style pill, a blurred bar, uniform rounded-square icons or one fixed icon size. A dock may be icon-only, text-only, image-based, transparent, full width, floating, taskbar-like or a few small objects sitting together — whatever suits this skin. Pure black (#000000) is not a default; use it only if the user asks.",
    "Two separate things:",
    "- `bottomDock` is DATA the blog owner owns: which items exist, what they do, whether the dock folds, where it sits. Edit its fields; do not express these as new markup.",
    "- `templates.dock` is the DESIGN: your markup for the dock, bound to `dock.*` exactly like any other template. It is optional — without it the platform draws a plain default. Write one whenever the user wants the dock to look like anything in particular.",
    "Context paths inside templates.dock:",
    "dock.items[] (item.id, item.label, item.hasLabel, item.href, item.hasHref, item.isActive, item.visual.isIcon / .isEmoji / .isText / .isImage, item.visual.iconKind, item.visual.text, item.visual.imageUrl)",
    "dock.collapsible, dock.isCollapsedByDefault, dock.itemCount, dock.hasItems, dock.trigger.text / .iconKind / .imageUrl / .isIcon / .isEmoji / .isText / .isImage",
    "- Draw each item with one repeated element: `<a data-imory-repeat=\"dock.items\" data-imory-href=\"item.href\">`. Bind the icon with `data-imory-kind=\"item.visual.iconKind\"` and draw the shape in CSS ([data-kind=\"camera\"]), the same rule as category icons — never bake a glyph into the HTML and never pick an icon by position.",
    "- Imory draws its own line icon for these names when your CSS does not draw that [data-kind]: home, folder, heart, star, image, camera, book, quote, edit, profile, menu, share, top (the owner picks them from a picture list in the Dock panel). It follows currentColor and is 1.25em. So: bind `data-imory-kind` (on items AND on the trigger, `dock.trigger.iconKind`) and leave the element empty unless this skin needs its own shape — if you do draw [data-kind=\"heart\"]::before, yours wins and Imory adds nothing. Emoji/text/image the skin does not show are filled in the same way, so a trigger that binds only `dock.trigger.text` never ends up as an empty button.",
    "- Items with no address (a panel, share, scroll-to-top) still appear in the list; their `item.href` is null, so guard nothing and let the platform handle the click.",
    "- Mark two elements so the platform can drive the fold: `data-imory-dock=\"trigger\"` on the small object that folds/unfolds, and `data-imory-dock=\"items\"` on the group that disappears when folded. Those are the ONLY two values. The trigger must stay reachable when folded — never hide it.",
    "- The platform stamps state on the dock root at render time: `data-imory-dock-position` (fixed/sticky/static), `-state` (expanded/collapsed), `-transition`, and `-open` (the open panel's name). Never write them into your HTML — they are stripped.",
    "- READ THOSE ATTRIBUTES WITH `:root[...]`, for example `:root[data-imory-dock-open=\"pair\"] .my-panel { display: block; }`. Skin CSS selectors are automatically prefixed with the skin root class, so a bare `[data-imory-dock-open=…] .my-panel` asks for a DESCENDANT carrying the attribute and silently never matches the root itself. This is the same form the platform already uses for `:root[data-imory-post-focus=\"on\"]`.",
    "bottomDock fields and what a request maps to:",
    "- position: \"auto\" | \"fixed\" | \"sticky\" | \"static\". \"이 스킨은 한 화면에 다 들어오니까 아래 메뉴는 계속 떠 있게\" -> \"fixed\". \"글이 길어서 아래 메뉴가 따라다니는 게 거슬려\" -> \"static\". auto lets the platform measure the page.",
    "- collapsible / defaultState / trigger / transition. \"독이 너무 커. 평소에는 작은 하트만 보이고 누르면 펼쳐지게\" -> collapsible:true, defaultState:\"collapsed\", trigger:{type:\"emoji\",value:\"♡\"}, transition:{type:\"fade\",...} (or \"fade-slide\").",
    "- transition is the shared transition primitive: {type, duration, easing, direction}. \"독 펼칠 때 더 부드럽게\" -> keep the type, duration ~320-400, easing \"smooth\". \"독 애니메이션 없애줘\" -> type \"none\". Return all four fields, unchanged ones as they are.",
    "- A panel opened by a dock item: mark it `data-imory-panel=\"<name>\"` inside templates.dock and give it its own data-imory-transition-* for the motion. The old CSS-only form `:root[data-imory-dock-open=\"<name>\"] .your-panel { display:block }` still works, but it cannot animate the closing.",
    "- items[].action: {type:\"navigate\", target:\"home\" | \"highlights\" | \"gallery\" | \"banner\" | \"category:<id>\" | \"path:/<in-blog path>\"}, {type:\"open\", target:\"panel:<name>\"}, {type:\"action\", target:\"write\" | \"admin\" | \"manage\" | \"share\" | \"theme\" | \"top\"}. \"독에서 하트를 누르면 페어 화면이 열렸으면\" -> an item whose action is {type:\"open\", target:\"panel:pair\"}, plus markup for that panel inside templates.dock shown by `:root[data-imory-dock-open=\"pair\"] .your-panel { display: block; }`.",
    "- items[].audience: \"owner\" for owner-only actions (write/admin). Visitors never receive those items at all.",
    "- NEVER compute a URL for a dock item and never invent a target that is not in the lists above. The platform resolves every address; an item pointing at something that does not exist is dropped.",
    "- There is no search feature in Imory, so there is no search action.",
    "- Everything the dock needs already exists as a property or a CSS hook. Do not write JavaScript for folding, panels, transitions or navigation.",
    "",
    "### POST",
    "post.id, post.title, post.publishedAtLabel, post.categoryName, post.categoryHref, post.href",
    "",
    "### BANNER",
    "bannerCategory.id, bannerCategory.name, bannerCategory.href",
    "bannerCategory.items[]  (item.id, item.name, item.href, item.imageUrl, item.alt)",
    "",
    "## Owner tools slot (put one in every template — a validator does NOT check this)",
    "- Put `<span data-imory-region=\"owner-tools\"></span>` on the first content line of HOME, CATEGORY, FOLDER, POST and BANNER — the breadcrumb / section-title row, at its right end. Leave it empty; the platform puts its own small ghost buttons (＋ new post, edit) inside it, and only the owner ever sees them.",
    "- Without this slot the platform has to guess a position and the buttons end up floating over your top decoration. With it they sit on the line you chose and inherit that line's alignment, so give the row `display:flex; align-items:center; justify-content:space-between` (or put the span last in a flex row) rather than styling the buttons themselves.",
    "- Visitors see an empty span: never size it with a fixed height, and never draw a border or label on it.",
    "",
    "## Owner and admin entry points (a validator does NOT check this — you must)",
    "- `viewer.writeHref`, `viewer.adminHref` and `viewer.manageHref` are how the blog owner reaches WRITE / ADMIN / EDIT.",
    "- `viewer.toolsHref` (POST only) opens the reader tool menu: font size, copy link, and for the owner also highlighting mode and edit. It is NOT owner-only — visitors need it too, so do NOT wrap it in `data-imory-if=\"viewer.isOwner\"`; wrap it in `data-imory-if=\"viewer.toolsHref\"` instead. If you draw this link the platform hides its own three-dot button, so draw it at most once; if you do not draw it, the platform shows its own. Never both.",
    "- `viewer.highlightHref` (POST, owner only) is a shortcut straight into highlighting mode. Optional.",
    "- `navigation.highlights` ({ name, href, enabled, hasCategory, showStandaloneLink, type, iconKind }) links to the highlights page from any template. A HIGHLIGHT category, when the owner made one, is ALSO in `navigation.categories` with the same href — link it from one of the two, never both.",
    "- ALWAYS label that link with `data-imory-bind=\"navigation.highlights.name\"`. The owner renames that category (it is often not the word \"HIGHLIGHTS\"), and a hard-coded label shows the wrong name on their blog. Same for its icon: `data-imory-kind=\"navigation.highlights.iconKind\"`.",
    "- The canonical name of this page everywhere is `highlights` (`templates.highlights`, `navigation.highlights`, `highlights.*`, `data-imory-region=\"highlight-tools\"`). `memos` / `memo-tools` are legacy aliases that keep old saved skins rendering — never write them into a new or edited template.",
    "- If the current templates contain links bound to any of these, KEEP them, in every template that had them.",
    "- Deleting them silently locks the owner out of managing their own blog. Remove them only if the user explicitly asks you to.",
    "- These links are normally wrapped in `data-imory-if=\"viewer.isOwner\"`. Keep that guard.",
    "",
    "## POST protected region (required)",
    "- `templates.post` MUST contain an element with `data-imory-region=\"post-body\"`.",
    "- The platform injects the real post body into it. Leave that element empty in your HTML.",
    "- A post template without this region is rejected and your whole answer is thrown away.",
    "- If you return `templates.folder`, it MUST contain `data-imory-region=\"post-body\"` inside the `folder.posts` repeat (one region per post). Same rejection rule.",
    "",
    "## HTML restrictions (a sanitizer enforces these; anything else is silently stripped)",
    "- Allowed tags: div, section, article, header, footer, nav, main, aside, figure, figcaption, h1-h6, p, span, br, hr, b, strong, i, em, u, small, mark, blockquote, cite, sub, sup, ul, ol, li, dl, dt, dd, a, img, time, details, summary.",
    "- Forbidden entirely: script, style, iframe, object, embed, link, meta, form, input, button, select, textarea, video, audio, canvas, svg, template, noscript.",
    "- No JavaScript of any kind. No event handler attributes (onclick, onload, ...).",
    "- No `style` attribute and no `id` attribute. Style everything through classes in the `css` field.",
    "- Allowed non-binding attributes: class, lang, dir, title, role, plus `alt`/`src` on img and `href` on a.",
    "- No inline SVG, no web fonts loaded from HTML, no external scripts.",
    "",
    "## CSS restrictions (a validator enforces these)",
    "- No `@import`. No `expression()`, `-moz-binding`, `behavior:`.",
    "- `url()` may only use https: or a relative path. javascript:, data:, blob:, file: URLs are removed.",
    "- Do not write selectors targeting the platform's own post chrome: `#postDetailContent`, `.post-detail-content`, `.post-dialogue`, `.post-action`, `.post-inline-*`. Those are removed.",
    "- All CSS is automatically scoped to the skin root, so plain class selectors are safe. Do not try to style `html` or `body`.",
    "- Keep the CSS a single stylesheet string. Media queries, custom properties, grid and flexbox all work.",
    "",
    "## Layout surface",
    "- The platform gives the skin the full available width and owns scrolling. The skin decides its own max-width and padding.",
    "- Do not set fixed pixel widths on the outermost wrapper. Use `width: min(<n>px, 100%)` or a max-width.",
    "- Do not use `position: fixed` for page chrome; it collides with the platform's own buttons.",
    "",
    "## Mobile",
    "- The same templates render on phones. Keep or add the existing responsive rules.",
    "- Nothing may overflow the viewport horizontally. Images need `max-width: 100%`.",
    "- If the current CSS has a mobile media query, keep it working after your edit.",
    "",
    "## Default design judgement (the user's explicit instruction always wins over these)",
    "- Body text stays readable: roughly 13px or larger, and never below 11px.",
    "- No oversized headings that push the content off the first screen.",
    "- Keep text and background contrast high enough to read comfortably.",
    "- No decorative animation, no auto-playing motion.",
    "- Do not restructure the layout when only colors or type were requested."

  ];

  /*
    ★ 첨부 이미지 규칙 (PHASE AI-4 → IMPORT-CSS-IMAGE-1)

    기본은 여전히 "참고만 한다"다. 바뀐 것은 하나 — 사용자가 그
    이미지를 **스킨 안에 넣어 달라고** 한 경우에만, 모델은 정해진
    자리표시자 `<img src="imory-attachment:N">` 을 쓴다. 모델은 그
    이미지의 주소를 모른다(Storage 에 없다). 자리표시자는 브라우저의
    공용 파이프라인(skin/skin-package-images.js)이 `images.<슬롯>` 과
    imageSlots 선언으로 바꾸고, Studio 가 그 첨부만 내 이미지에 올려
    슬롯에 연결한다. 그래서 이 파일은 여전히 Storage 도 DB 도 imageSlots
    도 건드리지 않는다(모델이 만든 imageSlots 는 받지도 않는다).

    배경 이미지(CSS url())로 넣지 말라는 규칙이 함께 간다 — 엔진에는
    "배경 슬롯"이 없고, url() 의 자리표시자는 CSS 검사가 지운다.
    그래서 사진을 배경처럼 깔고 싶으면 <img> 한 층을 absolute +
    object-fit: cover 로 두라고 시킨다.
  */
  const sections =
    hasReferenceImages
      ? base.concat([

          "",
          "## Reference images (attached by the user)",
          "- The user attached one or two images. By default they are DESIGN REFERENCES ONLY.",
          "- Put an attached image INTO the skin only when the instruction explicitly asks for it (for example \"이 사진을 메인 이미지로 넣어줘\", \"첨부한 사진으로 헤더를 만들어줘\", \"이 그림을 배경으로 깔아줘\"). Otherwise NEVER add an <img> for it and never try to reproduce it.",
          "- When you do place one, write exactly `<img src=\"imory-attachment:1\" alt=\"<short Korean description>\" class=\"<a class that says what it is, e.g. hero-photo>\">` — the number is the attachment's order (1 = first attached image, 2 = second). The platform turns that placeholder into an editable image slot and fills it with the user's picture. Never write a data: URL, a made-up https URL or `images.*` for an attached image, and do not add imageSlots yourself.",
          "- An attached image must be a real <img> element, NEVER a CSS background-image or url(): the platform has no editable background slot and removes such url()s. If it should look like a background, put the <img> in its own layer (for example `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;` on the <img>, inside a `position: relative` wrapper) and keep text above it with z-index.",
          "- Do not use the placeholder for icons, logos you invent, or decoration. Only for the attached images, and each attached image at most where the user asked.",
          "- NEVER put an attached image into the skin unless asked — the rest of this section is about reading them as references.",
          "- The user's written instruction always wins. The images only fill in what the words leave open.",
          "- What you MAY take from a reference image: overall layout mood, spacing and density, typography hierarchy and relative sizes, border weight and corner radius, color palette, visual balance.",
          "- What you must NOT copy: any logo, brand mark, product name, photograph, or literal text visible in the image. Never transcribe text out of an image into the templates.",
          "- The minimal-change rule still applies. Do not restructure the layout just because the reference looks different from the current skin. Change only what the instruction asks for.",
          "- Every rule above still holds exactly as written: runtime bindings, the protected post-body region, owner/admin links, allowed tags, CSS restrictions, mobile behaviour.",
          "- Reading the examples: \"이 이미지 느낌으로 바꿔줘\" means take the overall visual mood. \"이 이미지의 색감만 참고해줘\" means keep the layout exactly as it is and change the palette only."

        ])
      : base;

  if (!hasSelection) {
    return sections.join("\n");
  }

  /*
    ★ 선택 요소 편집 계약 (PHASE AI-6B)

    selectionContext가 있을 때만 붙는다 — 없으면 위 문자열은 PHASE
    AI-2/AI-4와 글자 하나 다르지 않다.

    여기서 validator가 잡아주지 않는 것, 즉 **범위**가 전부다.
    "이 폴더만 작게"라는 요청에 모델이 전체 레이아웃을 다시 짜도
    sanitizer도 CSS validator도 아무 말을 하지 않는다. 그래서 범위
    규칙은 프롬프트가 유일한 방어선이고, 참고 이미지 규칙보다
    **뒤에** 둔다 — 이미지가 있어도 선택 범위가 이긴다(요구사항
    15절의 우선순위).

    공용 class를 고치지 말라는 규칙이 핵심이다. `.folder { }`를
    건드리면 폴더 하나를 고쳐 달라는 요청이 폴더 전부를 바꾼다.
    선택 요소에는 이미 data-imory-edit-id가 박혀 있으므로 그
    속성 선택자를 두 번 겹쳐 쓰면 기존 클래스 규칙을 확실히 이긴다
    — Direct Edit(studio/inspector/studio-inspector-model.js
    buildInspectorEditSelector)이 쓰는 것과 **같은** 선택자라
    나중에 사용자가 같은 요소를 Direct Edit으로 다시 만져도 규칙이
    둘로 갈라지지 않는다(요구사항 7절).
  */
  return sections.concat([

    "",
    "## Selected element editing (this request is scoped)",
    "The user picked ONE element in the preview before writing the instruction. The selected element is described in the user message under \"선택한 요소\". Its `editId` is the value of its `data-imory-edit-id` attribute, which already exists in that template's HTML.",
    "",
    "### Reading the selection description",
    "- `elementType` is a rough label (text / image / link / container). It does NOT limit which CSS properties you may change. A `text` element can still be given width, height, padding, border, background or display.",
    "- `capabilities` lists what Studio's own no-AI edit form happens to offer for this element. It is NOT a permission list and NOT a restriction on you. Ignore it when deciding what is possible; it is there only so you know what the user could already do without asking you.",
    "- `insideRepeat: true` means the element is one entry of a repeated list. `repeat` is set when the element itself carries `data-imory-repeat`.",
    "",
    "### Scope",
    "- Read the instruction as being about THAT element. \"조금 더 작게 해줘\" means make the selected element smaller — not the page, not its siblings, not the other templates.",
    "- You may also touch the minimum surrounding structure that the selected element directly needs (for example the wrapper that positions it). Nothing beyond that.",
    "- Do NOT redesign the page. Do NOT touch the other templates. If the selected element is in `home`, the `category`, `post` and `banner` HTML must come back byte-for-byte identical.",
    "- Widen the scope ONLY if the user explicitly asks for it (\"이런 요소를 전부\", \"모든 카테고리 폴더를\"). Then say so in the summary.",
    "- If the element sits inside a `data-imory-repeat` list, every entry of that list is rendered from the same markup, so a change there necessarily applies to all of them. That is expected; do not try to single out one entry.",
    "",
    "### How to style the selected element",
    "- Prefer a rule on the element's own identity attribute, written twice so it wins over the skin's existing class rules:",
    "  [data-imory-edit-id=\"<editId>\"][data-imory-edit-id=\"<editId>\"] { ... }",
    "- Put that rule at the END of the stylesheet, and keep at most ONE such base rule per element — edit the existing one instead of adding a second copy.",
    "- Extra states go in their own rules with the same doubled attribute selector plus the state, e.g. `...:hover`, `...:focus-visible`, or inside a media query.",
    "- Do NOT edit a shared class (`.folder`, `.card`, `.post-item`, ...) to change one selected element. That silently changes every other element using it.",
    "- Do NOT invent a new random class name for the selected element. It already has a stable identity.",
    "- KEEP the `data-imory-edit-id` attribute on the selected element exactly as it is. If it disappears the user loses their selection.",
    "",
    "### Structure changes are allowed",
    "- The user may ask to rearrange the inside of the selected element (\"이 카드 안에서 이미지가 위, 텍스트가 아래로\"). Restructuring the selected element's own subtree is fine.",
    "- Its siblings, its ancestors, the other templates, runtime bindings and the protected post-body region stay as they are.",
    "- Keep every `data-imory-*` binding that is inside the selected element unless the user explicitly asks to remove that content.",
    "- Deleting the selected element itself is allowed only if the user asked for it AND it is not a protected region, not an owner/admin link, and not the post-body region.",
    "",
    "### Effects",
    "- Hover effects, transitions on hover/focus, shadows, borders and opacity changes on the selected element are exactly what this mode is for. Use them when asked.",
    "- How the selected element APPEARS (\"페이드되게\", \"아래에서 살짝 올라오게\", \"애니메이션 없애줘\") is the transition primitive: set or remove `data-imory-transition*` attributes on the selected element (see Transition primitives). Do not write @keyframes or an entrance animation in CSS for it.",
    "- CSS only. Never add JavaScript or event handler attributes — they are stripped and the effect would silently disappear.",
    "",
    "### If you cannot do it",
    "- This applies to requests the platform genuinely cannot express — for example behaviour that would need JavaScript, a browser history action (\"go back\"), or a runtime binding that is not in the context path list above. Imory has no back-navigation binding: `navigation.home.href` is a plain URL and there is no `data-imory-action`. Do not invent one, do not use `javascript:`, and do not add an event handler attribute — all three are stripped and the link would silently break.",
    "- In that case change nothing, and say plainly in the summary what is not supported. Never edit a different element to fake the result, and never substitute a different behaviour that was not asked for.",
    "- A plain visual request (size, spacing, colour, border, layout of the selected element) is NOT one of these cases. Carry it out.",
    "",
    "### Summary",
    "- The `summary` must name what you changed about the selected element, in Korean. For example \"선택한 카테고리 폴더의 높이와 테두리를 줄였어요.\" — not a generic \"스킨을 업데이트했어요.\""

  ]).join("\n");

}


/* =========================================================
   Structured Outputs — JSON Schema

   strict: true를 쓰므로 모든 객체는 additionalProperties:false이고
   모든 프로퍼티가 required에 들어가야 한다. "선택 필드"는
   type을 ["object","null"]처럼 null과의 union으로 표현한다 —
   templates.banner가 그 경우다.

   $ref/$defs 대신 template 객체 4개를 그대로 펼쳐 적는다. 스키마
   전체가 한눈에 들어오는 편이 낫고, 크기도 문제되지 않는다.

   ★ 여기에 없는 SkinPackage 필드(schemaVersion / imageSlots /
   regions / metadata)는 모델이 만들지 않는다 — 파일 상단 주석 참고.
========================================================== */

function buildSkinAiTemplateSchema(pageType, nullable) {

  return {
    type: nullable ? ["object", "null"] : "object",
    description:
      "Complete HTML for the " + pageType.toUpperCase() + " page template.",
    properties: {
      html: {
        type: "string",
        description:
          "The full template HTML. No <script>, <style>, style attribute or id attribute."
      }
    },
    required: ["html"],
    additionalProperties: false
  };

}


/* =========================================================
   BOTTOM-DOCK-1 — bottomDock 의 응답 스키마

   nullable 이다: dock 이 없는 스킨에서 모델이 null 을 주면
   "dock 없음"이 유지된다(서버가 현재 값으로 되돌린다).

   OpenAI structured outputs 는 required 에 모든 키가 있어야
   하므로(위 templates 와 같은 제약) 선택 필드도 전부 적고,
   비워 둘 수 있는 것은 type union 으로 표현한다.
========================================================== */

function buildSkinAiDockVisualSchema(what) {

  return {
    type: "object",
    description:
      `How the ${what} is drawn. Only these six kinds exist.`,
    properties: {
      type: {
        type: "string",
        enum: SKIN_AI_DOCK_VISUAL_TYPES,
        description:
          "icon = a kind token drawn by your CSS ([data-kind=\"...\"]). " +
          "emoji / text = literal characters. " +
          "image / svg = an https:// URL. asset = the name of an existing imageSlot."
      },
      value: {
        type: "string",
        description:
          "For icon: a lowercase token (a-z0-9-). For emoji/text: the characters. " +
          "For image/svg: an https:// URL. For asset: the slot name."
      }
    },
    required: ["type", "value"],
    additionalProperties: false
  };

}


/* TRANSITION-1 — 공용 전환 primitive 한 벌의 스키마. 네 칸 모두
   required(structured outputs 제약) — 모델은 바꾸지 않는 칸도 현재
   값 그대로 돌려준다. */
function buildSkinAiTransitionSchema(description) {

  return {
    type: "object",
    description,
    properties: {
      type: {
        type: "string",
        enum: SKIN_AI_DOCK_TRANSITIONS,
        description: "none = no motion at all."
      },
      duration: {
        type: "number",
        description:
          `Milliseconds, ${SKIN_AI_TRANSITION_DURATION_MIN}-${SKIN_AI_TRANSITION_DURATION_MAX}. ` +
          "Default 200. \"더 부드럽게/천천히\" = longer (300-400) with easing \"smooth\"."
      },
      easing: {
        type: "string",
        enum: SKIN_AI_TRANSITION_EASINGS
      },
      direction: {
        type: "string",
        enum: SKIN_AI_TRANSITION_DIRECTIONS,
        description:
          "The way it moves while APPEARING: up = rises from slightly below. Only slide/scale types use it."
      }
    },
    required: ["type", "duration", "easing", "direction"],
    additionalProperties: false
  };

}


function buildSkinAiBottomDockSchema() {

  return {
    type: ["object", "null"],
    description:
      "The bottom dock configuration. Return the current one edited or unchanged. " +
      "Return null ONLY if the skin has no dock and the user did not ask for one.",
    properties: {

      visible: {
        type: "boolean",
        description: "false hides the dock entirely (nothing is rendered)."
      },

      position: {
        type: "string",
        enum: SKIN_AI_DOCK_POSITIONS,
        description:
          "auto = the platform measures the page (fixed when it fits one screen, sticky when it scrolls). " +
          "static = the dock is part of the content flow."
      },

      collapsible: {
        type: "boolean",
        description: "true lets the reader fold the dock down to its trigger."
      },

      defaultState: {
        type: "string",
        enum: SKIN_AI_DOCK_STATES
      },

      transition: buildSkinAiTransitionSchema(
        "How the dock's items move when it folds and unfolds — the platform's shared transition primitive. " +
        "Never write your own animation for this."
      ),

      trigger: {
        type: "object",
        description:
          "The small object that folds and unfolds the dock. Its look is yours — a heart, a ribbon, a dot, a tiny image.",
        properties: {
          type: {
            type: "string",
            enum: SKIN_AI_DOCK_VISUAL_TYPES
          },
          value: { type: "string" },
          label: {
            type: "string",
            description: "Short Korean accessible name, e.g. \"메뉴 열기\". May be empty."
          }
        },
        required: ["type", "value", "label"],
        additionalProperties: false
      },

      items: {
        type: "array",
        maxItems: SKIN_AI_DOCK_MAX_ITEMS,
        items: {
          type: "object",
          properties: {

            id: {
              type: "string",
              description: "Stable identifier, letters/digits/_/- starting with a letter."
            },

            label: {
              type: "string",
              description: "Optional visible caption. May be empty for an icon-only dock."
            },

            audience: {
              type: "string",
              enum: SKIN_AI_DOCK_AUDIENCES,
              description:
                "owner = only the blog owner gets this item (the data never reaches visitors)."
            },

            visual: buildSkinAiDockVisualSchema("item"),

            action: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: SKIN_AI_DOCK_ACTION_TYPES_FOR_SCHEMA
                },
                target: {
                  type: "string",
                  description:
                    "navigate: " + SKIN_AI_DOCK_NAVIGATE_TARGETS.join(" / ") +
                    " or category:<id> or path:/<in-blog path>. " +
                    "open: panel:<lowercase name>. " +
                    "action: " + SKIN_AI_DOCK_ACTION_TARGETS.join(" / ") + "."
                }
              },
              required: ["type", "target"],
              additionalProperties: false
            }

          },
          required: ["id", "label", "audience", "visual", "action"],
          additionalProperties: false
        }
      }

    },
    required: ["visible", "position", "collapsible", "defaultState", "transition", "trigger", "items"],
    additionalProperties: false
  };

}


function buildSkinAiResponseSchema() {

  return {
    type: "object",
    properties: {

      summary: {
        type: "string",
        description:
          "One short Korean sentence describing what changed, 100 characters or fewer."
      },

      templates: {
        type: "object",
        properties: {
          home: buildSkinAiTemplateSchema("home", false),
          category: buildSkinAiTemplateSchema("category", false),
          post: buildSkinAiTemplateSchema("post", false),
          banner: buildSkinAiTemplateSchema("banner", true),
          folder: buildSkinAiTemplateSchema("folder", true),
          highlights: buildSkinAiTemplateSchema("highlights", true),
          dock: buildSkinAiTemplateSchema("dock", true)
        },
        required: ["home", "category", "post", "banner", "folder", "highlights", "dock"],
        additionalProperties: false
      },

      css: {
        type: "string",
        description:
          "The complete stylesheet for the whole skin. Not a patch."
      },

      /*
        BOTTOM-DOCK-1 — dock **설정**.

        enum 으로 좁혀 두면 모델이 오탈자를 낼 자리가 거의 없어진다.
        그래도 서버는 받은 값을 칸 단위로 한 번 더 거른다
        (sanitizeSkinAiBottomDock) — 스키마를 지키지 않는 응답이
        올 수 있고, 그때 AI 수정 전체가 거부되면 안 된다.
      */

      bottomDock: buildSkinAiBottomDockSchema()

    },
    required: ["summary", "templates", "css", "bottomDock"],
    additionalProperties: false
  };

}


/* =========================================================
   OpenAI Responses API 요청 body

   Chat Completions가 아니라 Responses API다. instructions 필드에
   시스템 계약을, input에 사용자 요청과 현재 SkinPackage를 넣는다.

   ★ 프롬프트에 들어가는 것은 이 네 가지가 전부다.
   게시글 본문 / 비밀글 / 계정 이메일 / nickname / Supabase 토큰은
   여기 어디에도 없다 — 이 함수는 instruction, normalize된
   SkinPackage, 그리고 검증을 통과한 참고 이미지 외에 아무것도
   받지 않는다(그래서 넣을 수도 없다).

   ★ 참고 이미지 (PHASE AI-4)
   Responses API의 image input은 user 메시지 content 배열 안의
       { type: "input_image", image_url: "data:<mime>;base64,...", detail }
   항목이다(2026-09 공식 문서). input_text 하나 뒤에 첨부 순서대로
   붙인다 — 모델이 "첫 번째 이미지"를 사용자와 같은 순서로 본다.

   detail은 "auto"로 둔다. 참고 이미지에서 읽어야 하는 것은 여백감·
   색감·계층 같은 전체 인상이라 "high"로 해상도를 올릴 이유가 없고,
   "low"로 낮추면 그 인상마저 뭉갠다.

   이미지가 0장이면 input_image를 하나도 넣지 않고 시스템 프롬프트도
   PHASE AI-2와 동일하다 — 즉 첨부를 쓰지 않는 요청의 body는 이전과
   바이트까지 같다.

   store:false — OpenAI 쪽에 응답을 남길 이유가 없다.
========================================================== */

function buildSkinAiModelRequestBody(model, instruction, skinPackage, images, selection) {

  const referenceImages =
    Array.isArray(images) ? images : [];

  /*
    ★ 선택 요소는 **같은 input_text 안에** 덧붙인다 (PHASE AI-6B).
    content 항목을 하나 더 만들지 않는 이유: 선택이 없을 때의 body가
    PHASE AI-2/AI-4와 완전히 같아야 하고(content 길이 포함), 선택이
    있을 때도 "현재 스킨 / 사용자 요청 / 선택 요소"가 한 덩어리로
    읽히는 편이 낫기 때문이다.

    selection은 이미 validateSkinAiSelectionContext()가 필드별로
    다시 만든 객체다 — client가 보낸 원본이 여기로 오지 않는다.
  */
  const selectionText =
    selection
      ? (
          "\n\n선택한 요소(사용자가 Preview에서 직접 고른 하나):\n" +
          "```json\n" +
          JSON.stringify(selection, null, 2) +
          "\n```\n" +
          "이 요청은 기본적으로 위 요소 하나에 대한 것이다. " +
          "template \"" + selection.template + "\" 안에서 " +
          "data-imory-edit-id=\"" + selection.editId + "\"인 요소를 찾아라."
        )
      : "";

  return {

    model,

    instructions:
      buildSkinAiSystemPrompt(referenceImages.length > 0, !!selection),

    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "다음은 이 블로그의 현재 SkinPackage다.\n\n" +
              "```json\n" +
              JSON.stringify(skinPackage, null, 2) +
              "\n```\n\n" +
              "사용자의 요청:\n" +
              instruction +
              (
                referenceImages.length
                  ? "\n\n첨부된 " + referenceImages.length +
                    "장은 기본적으로 디자인 참고 이미지다. 사용자가 이 이미지를 스킨 안에 넣어 달라고 했을 때만 " +
                    "<img src=\"imory-attachment:번호\"> 로 넣는다(번호는 첨부 순서, 1부터)."
                  : ""
              ) +
              selectionText
          }
        ].concat(
          referenceImages.map((image) => ({
            type: "input_image",
            image_url: image.dataUrl,
            detail: "auto"
          }))
        )
      }
    ],

    reasoning: {
      effort: SKIN_AI_REASONING_EFFORT
    },

    text: {
      format: {
        type: "json_schema",
        name: SKIN_AI_STRUCTURED_OUTPUT_NAME,
        strict: true,
        schema: buildSkinAiResponseSchema()
      }
    },

    max_output_tokens: SKIN_AI_MAX_OUTPUT_TOKENS,

    store: false

  };

}


/* =========================================================
   Responses API 응답에서 Structured Output 꺼내기

   raw HTTP 응답에는 SDK의 편의 필드(output_text)가 없다. output
   배열을 직접 훑어서:
     - type:"message" 항목의 content 안
     - type:"output_text" 파트의 text
   를 찾는다. 같은 자리에 type:"refusal"이 오면 모델이 거부한
   것이므로 실패로 처리한다(빈 결과를 성공으로 착각하지 않는다).

   reasoning 항목은 건너뛴다 — 내용도 읽지 않고, 로그에도 남기지
   않는다.
========================================================== */

function extractSkinAiModelOutput(payload) {

  if (!isSkinAiPlainObject(payload)) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.status === "incomplete") {

    const reason =
      (isSkinAiPlainObject(payload.incomplete_details) &&
        typeof payload.incomplete_details.reason === "string")
        ? payload.incomplete_details.reason
        : "unknown";

    return { ok: false, reason: "incomplete", detail: reason };

  }

  if (
    typeof payload.status === "string" &&
    payload.status !== "completed"
  ) {
    return { ok: false, reason: "status", detail: payload.status };
  }

  if (!Array.isArray(payload.output)) {
    return { ok: false, reason: "malformed" };
  }

  let text = null;

  for (const item of payload.output) {

    if (!isSkinAiPlainObject(item) || item.type !== "message") {
      continue;
    }

    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {

      if (!isSkinAiPlainObject(part)) {
        continue;
      }

      if (part.type === "refusal") {
        return { ok: false, reason: "refusal" };
      }

      if (part.type === "output_text" && typeof part.text === "string") {
        text = part.text;
      }

    }

  }

  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, reason: "empty" };
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: "malformed" };
  }

  if (!isSkinAiPlainObject(parsed)) {
    return { ok: false, reason: "malformed" };
  }

  const templates =
    parsed.templates;

  if (!isSkinAiPlainObject(templates)) {
    return { ok: false, reason: "malformed" };
  }

  for (const pageType of ["home", "category", "post"]) {

    const template =
      templates[pageType];

    if (!isSkinAiPlainObject(template) || typeof template.html !== "string") {
      return { ok: false, reason: "malformed" };
    }

  }

  if (typeof parsed.css !== "string") {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    edit: {
      summary:
        typeof parsed.summary === "string" ? parsed.summary : "",
      css:
        parsed.css,
      templates,

      /*
        BOTTOM-DOCK-1 — 모양 검사는 여기서 하지 않는다.
        buildSkinAiResultPackage 가 칸 단위로 걸러 받으므로
        (sanitizeSkinAiBottomDock) 이상한 값이 와도 결과가 깨지지
        않는다. 여기서 거부하면 dock 설정 하나 때문에 "색을 바꿔
        달라"는 수정이 통째로 실패한다.
      */
      bottomDock:
        parsed.bottomDock
    }
  };

}


/* =========================================================
   모델 결과 + 현재 SkinPackage -> 돌려줄 SkinPackage

   모델이 만든 것은 templates.html 6종(banner/folder/highlights 선택)과
   css뿐이다. 나머지는 요청으로 받은 현재 SkinPackage 값을 그대로 옮긴다.

   banner는 한 방향으로만 관대하다: 모델이 null을 줬는데 현재
   패키지에 banner가 있으면 **현재 것을 유지한다**. 반대로 현재
   패키지에 없던 banner를 모델이 새로 만들었다면 그건 받는다
   (사용자가 "배너 화면도 같은 스킨으로" 라고 요청한 경우다).
   "말없이 사라지는 화면"만 기계적으로 막는 셈이다.
========================================================== */

/* =========================================================
   buildSkinAiResultPackage(currentPackage, edit, sourcePackage)

   ★ SANDBOX-5A — sourcePackage 가 세 번째 인자로 늘었다.

   currentPackage 는 **모델에게 보여 준** 모양이다(위
   normalizeSkinAiInputPackage). 거기에는 renderMode 도 js 도 없다 —
   모델이 고칠 수 있는 것이 아니고, 저자 JS 를 프롬프트에 실어
   보낼 이유도 없기 때문이다(토큰도, 남의 코드를 외부 모델에
   보내는 것도).

   그런데 결과를 그 모양 그대로 돌려주면, AI 를 한 번 쓰는
   순간 renderMode 와 js 가 **조용히 사라진다** — sandbox 스킨이
   native 로 바뀌고 저자가 쓴 JS 가 없어진다. 그래서 요청에
   실려 온 원본에서 그 둘만 따로 옮겨 싣는다.

   "모델이 보지 않는다 / 모델이 바꿀 수 없다 / 그래서 지우지도
   못한다" 셋이 한 벌이다.
========================================================== */

function buildSkinAiResultPackage(currentPackage, edit, sourcePackage) {

  const templates = {
    home: { html: edit.templates.home.html },
    category: { html: edit.templates.category.html },
    post: { html: edit.templates.post.html }
  };

  const bannerFromModel =
    edit.templates.banner;

  if (isSkinAiPlainObject(bannerFromModel) && typeof bannerFromModel.html === "string") {

    templates.banner = { html: bannerFromModel.html };

  } else if (
    isSkinAiPlainObject(currentPackage.templates.banner) &&
    typeof currentPackage.templates.banner.html === "string"
  ) {

    templates.banner = { html: currentPackage.templates.banner.html };

  }

  /* FOLDER-2: folder도 banner와 같은 한 방향 관대함 — 모델이 null을
     줬는데 현재 패키지에 있으면 현재 것을 유지하고, 새로 만들었다면
     받는다. */

  const folderFromModel =
    edit.templates.folder;

  if (isSkinAiPlainObject(folderFromModel) && typeof folderFromModel.html === "string") {

    templates.folder = { html: folderFromModel.html };

  } else if (
    isSkinAiPlainObject(currentPackage.templates.folder) &&
    typeof currentPackage.templates.folder.html === "string"
  ) {

    templates.folder = { html: currentPackage.templates.folder.html };

  }

  /*
     HIGHLIGHT-2 / 재료 일치 라운드: highlights 도 banner/folder 와 같은
     한 방향 관대함을 받는다. 이 분기가 없던 동안에는 모델이 무엇을
     돌려주든 **하이라이트 template 이 결과에서 통째로 사라졌다** —
     스킨이 이미 갖고 있던 하이라이트 화면 디자인이 AI 수정 한 번에
     플랫폼 기본 template 으로 되돌아갔고(그 화면만 다른 스킨처럼
     보인다), 모델이 새로 그려 준 카드 목록도 저장되지 않았다.

     이름은 언제나 canonical 한 highlights 다 — 들어올 때
     normalizeSkinAiInputPackage 가 옛 이름(memos)을 이미 이 이름으로
     바꿔 놓았으므로, 여기서 memos 를 따로 다룰 일이 없다.
  */

  const highlightsFromModel =
    edit.templates.highlights;

  if (isSkinAiPlainObject(highlightsFromModel) && typeof highlightsFromModel.html === "string") {

    templates.highlights = { html: highlightsFromModel.html };

  } else if (
    isSkinAiPlainObject(currentPackage.templates.highlights) &&
    typeof currentPackage.templates.highlights.html === "string"
  ) {

    templates.highlights = { html: currentPackage.templates.highlights.html };

  }

  /*
    BOTTOM-DOCK-1 — dock template 도 banner/folder/highlights 와 같은
    한 방향 관대함이다. 모델이 null 을 줬는데 현재 패키지에 있으면
    현재 것을 유지하고, 새로 그렸다면 받는다.
  */

  const dockFromModel =
    edit.templates.dock;

  if (isSkinAiPlainObject(dockFromModel) && typeof dockFromModel.html === "string") {

    templates.dock = { html: dockFromModel.html };

  } else if (
    isSkinAiPlainObject(currentPackage.templates.dock) &&
    typeof currentPackage.templates.dock.html === "string"
  ) {

    templates.dock = { html: currentPackage.templates.dock.html };

  }

  const result = {
    schemaVersion: 1,
    templates,
    css: edit.css,
    imageSlots: currentPackage.imageSlots,
    regions: currentPackage.regions,
    metadata: currentPackage.metadata
  };

  /*
    BOTTOM-DOCK-1 — dock **설정**. 모델이 준 값을 칸 단위로 걸러
    받고, 모르는 값은 현재 값으로 되돌린다(위 sanitizeSkinAiBottomDock).
    현재도 없고 모델도 만들지 않았으면 키 자체를 만들지 않는다.
  */

  const bottomDock =
    sanitizeSkinAiBottomDock(
      edit.bottomDock,
      currentPackage.bottomDock
    );

  if (bottomDock) {
    result.bottomDock = bottomDock;
  }


  /*
    ★ 모델이 만지지 않는 두 필드를 원본에서 그대로 옮긴다.

    값 검사는 좁게 한다 — 여기서 통과시킨 것이 브라우저의
    validateSkinPackageImport() 도 통과해야 하고, 통과하지 못하면
    AI 결과 전체가 거부된다(skin/skin-package-import.js 의
    render-mode / author-js).
  */

  const source =
    isSkinAiPlainObject(sourcePackage) ? sourcePackage : {};

  if (source.renderMode === "native" || source.renderMode === "sandbox") {
    result.renderMode = source.renderMode;
  }

  if (
    typeof source.js === "string" &&
    source.js.length <= SKIN_AI_MAX_AUTHOR_JS_CHARS
  ) {
    result.js = source.js;
  }


  return result;

}


function clampSkinAiSummary(summary) {

  const trimmed =
    (summary || "").trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return "스킨을 수정했습니다.";
  }

  if (trimmed.length <= SKIN_AI_MAX_SUMMARY_LENGTH) {
    return trimmed;
  }

  return trimmed.slice(0, SKIN_AI_MAX_SUMMARY_LENGTH - 1) + "…";

}


/* =========================================================
   OpenAI 호출

   ★ 자동 재시도를 하지 않는다. 같은 요청을 두 번 보내면 두 번
   과금될 수 있고, 사용자는 drawer에서 직접 다시 보낼 수 있다.

   ★ OpenAI의 raw 오류 본문을 브라우저로 흘리지 않는다. 상태
   코드별로 우리가 쓴 한국어 문장만 돌려주고, 원문은 서버 로그에
   상태 코드 수준으로만 남긴다.
========================================================== */

function describeSkinAiUpstreamFailure(status) {

  if (status === 401 || status === 403) {
    return {
      status: 502,
      code: SKIN_AI_ERROR_CODES.OPENAI_ERROR,
      message: "AI 서비스 설정에 문제가 있어 요청하지 못했습니다. 잠시 후 다시 시도해주세요."
    };
  }

  if (status === 429) {
    return {
      status: 429,
      code: SKIN_AI_ERROR_CODES.OPENAI_RATE_LIMIT,
      message: "지금은 AI 요청이 많습니다. 잠시 후 다시 시도해주세요."
    };
  }

  if (status === 400 || status === 413 || status === 422) {
    return {
      status: 502,
      code: SKIN_AI_ERROR_CODES.OPENAI_ERROR,
      message: "AI가 이 요청을 처리하지 못했습니다. 조금 더 짧고 구체적으로 다시 요청해주세요."
    };
  }

  return {
    status: 502,
    code: SKIN_AI_ERROR_CODES.OPENAI_ERROR,
    message: "AI 서비스가 응답하지 못했습니다. 잠시 후 다시 시도해주세요."
  };

}


async function requestSkinAiModelEdit(apiKey, model, instruction, skinPackage, images, selection) {

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => {
        controller.abort();
      },
      SKIN_AI_MODEL_TIMEOUT_MS
    );

  /*
    ★ 요구사항 8절 — "OpenAI까지 실제로 갔는가"를 production 로그
    하나로 구분할 수 있게 한다. 이 줄이 있으면 호출이 시작된 것이고,
    없으면 그 앞(S4/S5/인증/allowlist)에서 끝난 것이다.
  */
  logSkinAiStage("S6", "OPENAI_REQUEST_START", {
    model,
    referenceImages: Array.isArray(images) ? images.length : 0,
    selectedEdit: !!selection,
    timeoutMs: SKIN_AI_MODEL_TIMEOUT_MS
  });

  let response;

  try {

    response =
      await fetch(
        SKIN_AI_OPENAI_ENDPOINT,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + apiKey
          },
          signal: controller.signal,
          body: JSON.stringify(
            buildSkinAiModelRequestBody(model, instruction, skinPackage, images, selection)
          )
        }
      );

  } catch (err) {

    clearTimeout(timeoutId);

    const aborted =
      !!err && (err.name === "AbortError" || err.name === "TimeoutError");

    console.warn(
      "skin-ai: model request failed",
      { model, aborted, name: err && err.name }
    );

    return {
      ok: false,
      status: aborted ? 504 : 502,
      stage: "S7",
      code:
        aborted
          ? SKIN_AI_ERROR_CODES.OPENAI_TIMEOUT
          : SKIN_AI_ERROR_CODES.OPENAI_UNREACHABLE,
      message:
        aborted
          ? "AI 응답이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해주세요."
          : "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."
    };

  }

  clearTimeout(timeoutId);

  if (!response.ok) {

    console.warn(
      "skin-ai: model responded with an error status",
      { model, status: response.status }
    );

    const failure =
      describeSkinAiUpstreamFailure(response.status);

    return { ok: false, status: failure.status, stage: "S7", code: failure.code, message: failure.message };

  }

  let payload;

  try {
    payload = await response.json();
  } catch (err) {

    console.warn("skin-ai: model response was not JSON", { model });

    return {
      ok: false,
      status: 502,
      stage: "S7",
      code: SKIN_AI_ERROR_CODES.OPENAI_ERROR,
      message: "AI 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요."
    };

  }

  const extracted =
    extractSkinAiModelOutput(payload);

  /*
    usage는 로그 한 줄로만 쓴다 — 이번 Phase에서는 DB/KV에 저장
    하지 않고, 브라우저 응답에도 넣지 않는다(AI-3에서 다시 본다).
    instruction 원문 / SkinPackage / 토큰 / API key는 로그에 절대
    남기지 않는다.
  */
  const usage =
    isSkinAiPlainObject(payload.usage) ? payload.usage : {};

  console.log(
    "skin-ai: model call finished",
    {
      model,
      referenceImages: Array.isArray(images) ? images.length : 0,
      selectedEdit: !!selection,
      status: typeof payload.status === "string" ? payload.status : "unknown",
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      parsed: extracted.ok
    }
  );

  if (!extracted.ok) {

    if (extracted.reason === "incomplete") {

      return {
        ok: false,
        status: 502,
        stage: "S8",
        code: SKIN_AI_ERROR_CODES.OPENAI_INCOMPLETE,
        message: "AI 응답이 끝까지 생성되지 않았습니다. 요청 범위를 조금 줄여 다시 시도해 주세요."
      };

    }

    if (extracted.reason === "refusal") {

      return {
        ok: false,
        status: 502,
        stage: "S8",
        code: SKIN_AI_ERROR_CODES.OPENAI_REFUSAL,
        message: "AI가 이 요청은 처리할 수 없다고 답했습니다. 다른 표현으로 다시 요청해주세요."
      };

    }

    return {
      ok: false,
      status: 502,
      stage: "S8",
      code: SKIN_AI_ERROR_CODES.STRUCTURED_OUTPUT_INVALID,
      message: "AI 응답 형식이 올바르지 않아 적용하지 못했습니다. 다시 시도해주세요."
    };

  }

  return { ok: true, edit: extracted.edit };

}


async function handleSkinAiRequest(context) {

  const {
    request,
    env
  } =
    context;

  if (request.method !== "POST") {

    return new Response(
      JSON.stringify({
        ok: false,
        code: SKIN_AI_ERROR_CODES.BAD_METHOD,
        message: "POST만 지원합니다."
      }),
      {
        status: 405,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          allow: "POST"
        }
      }
    );

  }

  const declaredLength =
    Number(request.headers.get("content-length") || "0");

  if (Number.isFinite(declaredLength) && declaredLength > SKIN_AI_MAX_BODY_BYTES) {
    return skinAiFail(413, "요청이 너무 큽니다.", SKIN_AI_ERROR_CODES.BODY_TOO_LARGE, "S4");
  }

  let rawBody;

  try {
    rawBody = await request.text();
  } catch (err) {
    return skinAiFail(400, "요청 본문을 읽지 못했습니다.", SKIN_AI_ERROR_CODES.BAD_REQUEST, "S4");
  }

  const actualLength =
    new TextEncoder().encode(rawBody).length;

  if (actualLength > SKIN_AI_MAX_BODY_BYTES) {
    return skinAiFail(413, "요청이 너무 큽니다.", SKIN_AI_ERROR_CODES.BODY_TOO_LARGE, "S4");
  }

  let parsed;

  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    return skinAiFail(400, "요청 형식이 올바르지 않습니다.", SKIN_AI_ERROR_CODES.BAD_REQUEST, "S4");
  }

  if (!isSkinAiPlainObject(parsed)) {
    return skinAiFail(400, "요청 형식이 올바르지 않습니다.", SKIN_AI_ERROR_CODES.BAD_REQUEST, "S4");
  }

  const instruction =
    typeof parsed.instruction === "string"
      ? parsed.instruction.trim()
      : "";

  if (!instruction) {
    return skinAiFail(400, "어떻게 바꾸고 싶은지 입력해주세요.", SKIN_AI_ERROR_CODES.INSTRUCTION_EMPTY, "S4");
  }

  if (instruction.length > SKIN_AI_MAX_INSTRUCTION_LENGTH) {

    return skinAiFail(
      400,
      "요청은 " + SKIN_AI_MAX_INSTRUCTION_LENGTH + "자까지 입력할 수 있습니다.",
      SKIN_AI_ERROR_CODES.INSTRUCTION_TOO_LONG,
      "S4"
    );

  }

  if (!isSkinAiPlainObject(parsed.skinPackage)) {
    return skinAiFail(400, "현재 스킨 정보를 찾지 못했습니다.", SKIN_AI_ERROR_CODES.SKIN_PACKAGE_MISSING, "S4");
  }

  /*
    ★ 전체 상한(SKIN_AI_MAX_BODY_BYTES)이 이미지 몫만큼 커졌다고 해서
    프롬프트에 들어가는 텍스트까지 커져도 되는 것은 아니다. instruction
    + SkinPackage는 PHASE AI-2와 같은 256KB로 따로 잰다.
  */
  const skinPackageBytes =
    new TextEncoder().encode(JSON.stringify(parsed.skinPackage)).length;

  if (skinPackageBytes > SKIN_AI_MAX_TEXT_BODY_BYTES) {
    return skinAiFail(413, "요청이 너무 큽니다.", SKIN_AI_ERROR_CODES.BODY_TOO_LARGE, "S4");
  }

  /*
    참고 이미지는 선택이다. 없으면 빈 배열이 되어 아래 경로 전체가
    PHASE AI-2와 똑같이 돈다. 잘못된 이미지는 여기서 끝나고 인증도
    OpenAI 호출도 하지 않는다.
  */
  const referenceImages =
    validateSkinAiReferenceImages(parsed.images);

  if (!referenceImages.ok) {
    return skinAiFail(400, referenceImages.message, SKIN_AI_ERROR_CODES.REFERENCE_IMAGE_INVALID, "S4");
  }

  /*
    selectionContext도 선택이다 (PHASE AI-6B). 없으면 selection이
    null이 되어 아래 경로 전체가 PHASE AI-2/AI-4와 똑같이 돈다.
    모양이 틀렸거나 그 editId가 실제 SkinPackage에 없으면 여기서
    끝난다 — 인증도 OpenAI 호출도 하지 않는다.
  */
  const selectionContext =
    validateSkinAiSelectionContext(parsed.selectionContext, parsed.skinPackage);

  if (!selectionContext.ok) {

    return skinAiFail(
      400,
      selectionContext.message,
      selectionContext.code,
      selectionContext.code === SKIN_AI_ERROR_CODES.SELECTION_TARGET_NOT_FOUND ? "S5" : "S4",
      {
        selectionTemplate:
          isSkinAiPlainObject(parsed.selectionContext) &&
          typeof parsed.selectionContext.template === "string"
            ? parsed.selectionContext.template
            : null
      }
    );

  }

  /*
    인증은 본문 검증 다음에 한다 — 형식이 틀린 요청 때문에
    Supabase로 불필요한 호출이 나가지 않도록.
  */

  const auth =
    await verifySkinAiAccessToken(request, env);

  if (!auth.ok) {
    return skinAiFail(auth.status, auth.message, auth.code, "S4");
  }

  /*
    ★ 유료 호출 앞의 마지막 두 관문. 둘 중 하나라도 막히면
    OpenAI로는 아무 요청도 나가지 않는다.
  */

  if (!isSkinAiAllowedUser(env, auth.userId)) {

    return skinAiFail(
      403,
      "이 계정에서는 아직 AI 수정을 사용할 수 없습니다.",
      SKIN_AI_ERROR_CODES.FORBIDDEN,
      "S4"
    );

  }

  if (!env || typeof env.OPENAI_API_KEY !== "string" || !env.OPENAI_API_KEY.trim()) {

    console.warn("skin-ai: OPENAI_API_KEY is not configured");

    return skinAiFail(
      503,
      "AI 기능이 아직 설정되지 않았습니다. (AI service is not configured.)",
      SKIN_AI_ERROR_CODES.NOT_CONFIGURED,
      "S4"
    );

  }

  const currentPackage =
    normalizeSkinAiInputPackage(parsed.skinPackage);

  const model =
    resolveSkinAiModel(env);

  const result =
    await requestSkinAiModelEdit(
      env.OPENAI_API_KEY.trim(),
      model,
      instruction,
      currentPackage,
      referenceImages.images,
      selectionContext.selection
    );

  if (!result.ok) {
    return skinAiFail(result.status, result.message, result.code, result.stage);
  }

  return skinAiJson(
    200,
    {
      ok: true,
      skinPackage: buildSkinAiResultPackage(
        currentPackage,
        result.edit,
        parsed.skinPackage
      ),
      summary: clampSkinAiSummary(result.edit.summary)
    }
  );

}


/* =========================================================
   예상하지 못한 예외도 JSON으로 (PHASE AI-6B.1)

   ★ 이것이 "AI 요청을 처리하지 못했습니다." 하나만 보이던 경로를
   없앤다.

   Function이 예외로 죽으면 Cloudflare가 **HTML 오류 페이지**를
   돌려준다. 브라우저(studio/ai/studio-ai-panel.js)는 그것을 JSON으로
   읽지 못해 payload가 null이 되고, 그러면 서버가 쓴 문장이 아예
   존재하지 않으므로 마지막 fallback 문장으로 떨어진다 — 사용자도
   개발자도 어느 단계에서 끊겼는지 알 수 없었다.

   여기서 감싸 두면 어떤 경우에도 { ok:false, code, message } JSON이
   나가고, code가 SERVER_ERROR면 "Function 안에서 예외가 났다"는
   뜻이 된다. 예외 내용은 로그에만 남기고 브라우저로 보내지 않는다
   (stack/message에 SkinPackage 조각이 섞여 있을 수 있다).
========================================================== */

export async function onRequest(context) {

  try {

    return await handleSkinAiRequest(context);

  } catch (err) {

    console.error(
      "skin-ai: unhandled exception",
      {
        name: err && err.name,
        /* 메시지는 남기되 길이를 제한한다 — 스택/본문 조각이
           로그를 뒤덮지 않게. */
        message: String((err && err.message) || "").slice(0, 300)
      }
    );

    return skinAiFail(
      500,
      "AI 요청을 처리하는 중 서버 오류가 발생했습니다.",
      SKIN_AI_ERROR_CODES.SERVER_ERROR,
      "S?"
    );

  }

}
