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
   모델은 templates.{home,category,post,banner,folder}.html 5종(banner/
   folder는 선택, FOLDER-2)과 css,
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

   ★ 참고 이미지 (PHASE AI-4)
   images는 **디자인 참고 자료**다. 스킨에 삽입될 이미지가 아니다 —
   이 파일은 imageSlots도 Supabase Storage도 DB도 건드리지 않는다.
   검증을 통과한 data URL을 OpenAI vision input(input_image)으로
   한 번 넘기고 그대로 버린다. 저장하는 곳은 어디에도 없다.
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
   선택 템플릿이다 — 스키마에서 null 허용, 결과 병합도 같은 정책. */
const SKIN_AI_TEMPLATE_PAGE_TYPES =
  ["home", "category", "post", "banner", "folder"];


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

/* skin-sanitize.js의 SKIN_SANITIZE_ALLOWED_REGION_NAMES와 같다. */
const SKIN_AI_SELECTION_REGION_NAMES = ["post-body"];

/* studio/inspector/studio-inspector-model.js describeInspectorElement()
   가 만드는 capability 이름 전부. 그 목록이 늘면 여기도 늘린다 —
   모르는 이름은 거부한다(fail closed). */
const SKIN_AI_SELECTION_CAPABILITY_NAMES = [
  "text", "href", "typography", "color", "background", "align",
  "imageSource", "imageClear", "size", "shape", "border", "padding",
  "imageAlign", "crop"
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

      const template =
        templatesInput[pageType];

      if (isSkinAiPlainObject(template) && typeof template.html === "string") {
        templates[pageType] = { html: template.html };
      }

    });

  }

  return {
    schemaVersion: input.schemaVersion,
    templates,
    css: typeof input.css === "string" ? input.css : "",
    imageSlots: Array.isArray(input.imageSlots) ? input.imageSlots : [],
    regions: Array.isArray(input.regions) ? input.regions : [],
    metadata: isSkinAiPlainObject(input.metadata) ? input.metadata : {}
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
    "- home  : the blog front page (profile, navigation, recent post list).",
    "- category: one category's post list.",
    "- post  : one post's title/date plus the protected body region.",
    "- banner: one banner-type category's link images.",
    "- folder: one folder's posts read as a series — every post's body flows top to bottom on one page (see \"FOLDER\" below).",
    "",
    "## Imory runtime bindings (data-imory-*)",
    "The platform fills these in at render time. Never invent new attribute names and never invent context paths that are not listed here.",
    "- `data-imory-bind=\"path\"`   inserts the value as text.",
    "- `data-imory-src=\"path\"`    sets an <img> src.",
    "- `data-imory-href=\"path\"`   sets an <a> href.",
    "- `data-imory-if=\"path\"`     hides the element when the value is falsy.",
    "- `data-imory-repeat=\"path\"` repeats the element once per array entry; inside it, use `item.*`. Repeats may be nested (a repeat inside a repeat, up to 5 levels); an inner `item` shadows the outer one.",
    "- `data-imory-region=\"post-body\"` marks the protected post body. Only this one region name exists. It appears once in `templates.post`, and once per repeated post inside `templates.folder` (see FOLDER).",
    "Keep every binding that already exists unless the user explicitly asks to remove that piece of content.",
    "",
    "### Context paths available on every page",
    "site.title, site.language",
    "profile.nickname, profile.bio, profile.avatarUrl",
    "navigation.home.name, navigation.home.href, navigation.home.enabled",
    "navigation.categories[], navigation.postCategories[], navigation.bannerCategories[]  (each item: item.id, item.name, item.href, item.type)",
    "viewer.isOwner, viewer.writeHref, viewer.adminHref, viewer.manageHref",
    "images.<slotName>  (only slot names that already exist in the package's imageSlots)",
    "",
    "### HOME",
    "home.recentPosts[]  (item.id, item.title, item.href, item.publishedAtLabel, item.categoryId, item.categoryName, item.isSecret)",
    "",
    "### CATEGORY",
    "category.id, category.name, category.type, category.href",
    "category.posts[]  (item.id, item.title, item.href, item.publishedAtLabel, item.isSecret)",
    "category.hasFolders  (boolean: the category has at least one folder with visible posts)",
    "category.tree[]  (folder-aware hierarchy; see \"Category folders\" below)",
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
    "### POST",
    "post.id, post.title, post.publishedAtLabel, post.categoryName, post.categoryHref",
    "",
    "### BANNER",
    "bannerCategory.id, bannerCategory.name, bannerCategory.href",
    "bannerCategory.items[]  (item.id, item.name, item.href, item.imageUrl, item.alt)",
    "",
    "## Owner and admin entry points (a validator does NOT check this — you must)",
    "- `viewer.writeHref`, `viewer.adminHref` and `viewer.manageHref` are how the blog owner reaches WRITE / ADMIN / EDIT.",
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
    "- Allowed tags: div, section, article, header, footer, nav, main, aside, figure, figcaption, h1-h6, p, span, br, hr, b, strong, i, em, u, small, mark, blockquote, cite, sub, sup, ul, ol, li, dl, dt, dd, a, img, details, summary.",
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
    ★ 첨부 이미지 규칙 — 여기서 가장 중요한 문장은 "첨부 이미지를
    스킨에 넣지 말라"이다. 사용자가 붙인 이미지는 Storage에 올라가
    있지도 않고 imageSlots에도 없으므로, 모델이 그것을 넣으려
    해봤자 만들 수 있는 것은 깨진 <img>나 data: URL뿐이다(둘 다
    sanitizer/validator가 지운다). 그래서 "참고만 한다"를 계약으로
    못박는다.
  */
  const sections =
    hasReferenceImages
      ? base.concat([

          "",
          "## Reference images (attached by the user)",
          "- The user attached one or two images. They are DESIGN REFERENCES ONLY.",
          "- NEVER put an attached image into the skin. Do not add an <img> for it, do not reference it from url(), do not invent an imageSlot for it. You cannot: those images are not hosted anywhere your templates could reach.",
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
    "- Hover effects, transitions, shadows, borders, opacity changes and small animations on the selected element are exactly what this mode is for. Use them when asked.",
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
          folder: buildSkinAiTemplateSchema("folder", true)
        },
        required: ["home", "category", "post", "banner", "folder"],
        additionalProperties: false
      },

      css: {
        type: "string",
        description:
          "The complete stylesheet for the whole skin. Not a patch."
      }

    },
    required: ["summary", "templates", "css"],
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
                    "장은 디자인 참고 이미지다. 스킨에 넣을 이미지가 아니다."
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
      templates
    }
  };

}


/* =========================================================
   모델 결과 + 현재 SkinPackage -> 돌려줄 SkinPackage

   모델이 만든 것은 templates.html 5종(banner/folder 선택)과 css뿐이다. 나머지는 요청
   으로 받은 현재 SkinPackage 값을 그대로 옮긴다.

   banner는 한 방향으로만 관대하다: 모델이 null을 줬는데 현재
   패키지에 banner가 있으면 **현재 것을 유지한다**. 반대로 현재
   패키지에 없던 banner를 모델이 새로 만들었다면 그건 받는다
   (사용자가 "배너 화면도 같은 스킨으로" 라고 요청한 경우다).
   "말없이 사라지는 화면"만 기계적으로 막는 셈이다.
========================================================== */

function buildSkinAiResultPackage(currentPackage, edit) {

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

  return {
    schemaVersion: 1,
    templates,
    css: edit.css,
    imageSlots: currentPackage.imageSlots,
    regions: currentPackage.regions,
    metadata: currentPackage.metadata
  };

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
      skinPackage: buildSkinAiResultPackage(currentPackage, result.edit),
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
