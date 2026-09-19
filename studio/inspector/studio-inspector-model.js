/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR / DIRECT EDIT 모델 (PHASE AI-6A)

   DOM 이벤트도 postMessage도 Supabase도 모르는 **순수 계산 계층**
   이다. Studio UI(studio/inspector/studio-inspector.js)와 Preview
   iframe(studio/preview/preview-bridge.js) 어느 쪽도 아래 규칙을
   각자 복붙하지 않게 한 곳에 모아 둔다.

   이 파일이 정하는 것 세 가지:

   1. **element identity** — 어떤 요소를 "이 요소"라고 부를 것인가.
      `data-imory-edit-id` 하나만 쓴다(skin/skin-sanitize.js가 이번
      Phase에서 화이트리스트에 추가한 속성). :nth-child 같은 구조
      selector는 저장하지 않는다 — 그건 스킨 HTML이 한 줄만 바뀌어도
      다른 요소를 가리키기 때문이다.

      아직 한 번도 편집되지 않은 요소에는 이 속성이 없다. 그래서
      Inspector가 켜져 있는 동안에만 Preview로 보내는 **사본**에
      구조 경로 기반 임시 id(`e0-2-1`)를 찍어 두고(stampInspectorEditIds),
      사용자가 실제로 그 요소를 고쳐서 처음으로 저장 대상이 될 때만
      그 id를 SkinPackage에 **승격**시킨다(commitInspectorEditId).
      한 번 승격된 id는 HTML 안에 남으므로, 그 뒤로는 구조가
      바뀌어도 계속 같은 요소를 가리킨다.

   2. **capability** — 고른 요소에 어떤 직접 수정이 가능한가.
      runtime binding(data-imory-bind/src/href), imageSlot 연결,
      protected region(post-body), owner/admin 링크를 구분해서
      "이 요소에서 실제로 안전한 것"만 돌려준다
      (describeInspectorElement).

   3. **patch 방식** — 수정을 HTML/CSS 중 어디에 쓸 것인가.
      내용(텍스트/링크 주소)만 HTML을 고치고, 나머지 **모든 스타일은
      CSS 규칙**으로 쓴다. inline style은 절대 만들지 않는다 —
      skin/skin-sanitize.js가 style 속성을 전면 금지하고 있어서
      저장/공개 어느 단계에서든 그대로 사라지기 때문이다.
      규칙 selector는 항상

        [data-imory-edit-id="X"][data-imory-edit-id="X"]

      이다. 같은 속성을 두 번 쓰는 건 오타가 아니라 **specificity를
      한 칸 올리기 위한 것**이다(0,2,0 → 0,3,0). 스킨 CSS는
      `.quiet-main .quiet-banner-list`처럼 클래스 두 개짜리 규칙과
      `@media` 안의 덮어쓰기를 흔히 쓰는데, 한 번만 쓰면 그것들과
      같거나 낮은 specificity라 "직접 수정했는데 화면이 안 바뀐다"가
      된다. !important를 쓰지 않는 이유는 그 다음 단계(AI 수정 /
      Code Editor)가 이 값을 다시 덮어쓸 여지를 남겨두기 위해서다.

   classic script — 아래 전역 함수들로 노출된다. 의존 없음(DOMParser
   외 순수 함수). studio/inspector/studio-inspector.js보다 먼저
   로드되기만 하면 된다.
========================================================== */


const INSPECTOR_EDIT_ID_ATTR = "data-imory-edit-id";

/* skin/skin-sanitize.js의 SKIN_SANITIZE_EDIT_ID_PATTERN과 같은
   형태여야 한다 — 여기서 만든 값이 저장 시점 sanitize를 통과하지
   못하면 그 요소는 다음 렌더에서 식별자를 잃는다. 값을 바꿀 땐 두
   파일을 함께 고친다. */
const INSPECTOR_EDIT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/* 구조 경로 id가 이 길이를 넘으면(아주 깊게 중첩된 스킨) 경로
   대신 순번 id로 떨어진다 — 어차피 임시 id라 한 렌더 안에서만
   유일하면 충분하다. */
const INSPECTOR_PATH_ID_MAX_LENGTH = 60;


function isValidInspectorEditId(value) {

  return (
    typeof value === "string" &&
    INSPECTOR_EDIT_ID_PATTERN.test(value)
  );

}


/* =========================================================
   stampInspectorEditIds(html) -> { doc, html, autoIds }

   Inspector가 켜져 있는 동안 Preview로 보내는 **사본**을 만든다.
   원본 SkinPackage는 이 함수로 바뀌지 않는다 — 반환된 doc은
   호출자가 들고 있다가 commitInspectorEditId()로 "이 id 하나만
   남긴" HTML을 다시 뽑아낼 때 쓴다.

   순서가 중요하다: 이미 HTML 안에 있는(= 예전에 승격된) id를 먼저
   전부 걷어서 existing에 담고, 그 다음에야 나머지 요소에 임시
   id를 찍는다. 그래야 새로 만든 경로 id가 우연히 기존 id와 같아져
   두 요소가 같은 CSS 규칙을 받는 사고가 없다.
========================================================== */

function stampInspectorEditIds(html) {

  const doc =
    new DOMParser().parseFromString(String(html || ""), "text/html");

  const used = new Set();

  /* =====================================================
     같은 id 가 HTML 안에 두 번 이상 있었는가 (2026-09-17)

     아래에서 두 번째 것은 속성을 잃고 임시 id 를 받으므로, 이
     함수가 끝나면 doc 만 봐서는 "중복이 있었다"를 알 수 없다.
     선택 복원은 그 사실을 알아야 한다 — 승격된 id 가 복제되면
     (Code Editor 복붙 · AI 가 노드를 통째로 베낌) querySelector 가
     돌려주는 **첫 번째**가 사용자가 고른 그 요소라는 보장이 없다.
     그때는 되살리지 않고 푼다(resolveInspectorSelectionTarget 의
     "ambiguous").
  ====================================================== */
  const duplicateIds = new Set();

  Array.from(doc.body.querySelectorAll(`[${INSPECTOR_EDIT_ID_ATTR}]`)).forEach(
    (el) => {

      const value =
        el.getAttribute(INSPECTOR_EDIT_ID_ATTR);

      if (!isValidInspectorEditId(value) || used.has(value)) {
        /* 형태가 깨졌거나 중복된 id는 식별자로 쓸 수 없다 — 저장
           시점 sanitize도 어차피 형태가 깨진 값은 버린다. */

        if (isValidInspectorEditId(value)) {
          duplicateIds.add(value);
        }

        el.removeAttribute(INSPECTOR_EDIT_ID_ATTR);
        return;
      }

      used.add(value);

    }
  );

  const autoIds = new Set();

  let fallbackCounter = 0;

  function claim(candidate) {

    let value = candidate;
    let suffix = 0;

    while (used.has(value)) {
      suffix += 1;
      value = `${candidate}-x${suffix}`;
    }

    used.add(value);
    autoIds.add(value);

    return value;

  }

  function walk(parent, path) {

    Array.from(parent.children).forEach((el, index) => {

      const childPath =
        path.concat(index);

      if (!el.hasAttribute(INSPECTOR_EDIT_ID_ATTR)) {

        const pathId =
          "e" + childPath.join("-");

        el.setAttribute(
          INSPECTOR_EDIT_ID_ATTR,
          claim(
            pathId.length <= INSPECTOR_PATH_ID_MAX_LENGTH
              ? pathId
              : "en" + (++fallbackCounter)
          )
        );

      }

      walk(el, childPath);

    });

  }

  walk(doc.body, []);

  return {
    doc,
    html: doc.body.innerHTML,
    autoIds,
    duplicateIds
  };

}


/* =========================================================
   commitInspectorEditId(stamped, keepEditId) -> html

   stampInspectorEditIds()가 만든 doc에서 임시 id를 전부 지우고,
   방금 실제로 편집한 요소의 id **하나만** 남긴 HTML을 돌려준다 —
   그 결과가 SkinPackage에 저장될 값이다.

   "선택만 해도 id가 박힌다"를 피하려는 것이다. Inspector를 켜고
   화면을 훑기만 한 사용자의 스킨 HTML은 단 한 글자도 바뀌지
   않아야 한다.
========================================================== */

function commitInspectorEditId(stamped, keepEditId) {

  Array.from(
    stamped.doc.body.querySelectorAll(`[${INSPECTOR_EDIT_ID_ATTR}]`)
  ).forEach((el) => {

    const value =
      el.getAttribute(INSPECTOR_EDIT_ID_ATTR);

    if (stamped.autoIds.has(value) && value !== keepEditId) {
      el.removeAttribute(INSPECTOR_EDIT_ID_ATTR);
    }

  });

  return stamped.doc.body.innerHTML;

}


/* =========================================================
   선택 복원의 근거 (SANDBOX-6A 후속, 2026-09-17)

   ★ 무엇이 문제였나

   임시 식별자는 **구조 경로**다("e0-2-1" = body 첫 자식의 셋째
   자식의 둘째 자식, 위 stampInspectorEditIds). 그래서 고른 요소가
   사라지면 **뒤 형제가 그 자리로 밀려와 같은 id 를 물려받는다.**
   id 로만 되살리면 "복원은 성공했는데 엉뚱한 요소가 선택된" 상태가
   된다 — 그 상태에서 AI 수정을 보내면 사용자가 보지도 않은 요소가
   바뀐다. 앞 형제를 넣거나 지우거나 순서를 바꿔도 같다.

   ★ 어떻게 가르나 — 두 종류의 id 를 구분한다

   승격된 id (promoted) : 사용자가 실제로 한 번 편집해서 SkinPackage
     HTML 에 **글자로 남은** id. 요소를 따라 움직이므로 위치가
     바뀌어도, 내용이 바뀌어도 같은 요소를 가리킨다. 그 id 가
     **하나뿐이면** 그 존재 자체가 근거다(복제되었다면 아니다 —
     아래 "ambiguous").
   임시 id (auto)       : 이번 stamp 가 구조 경로로 만들어 낸 id.
     위치 말고는 아무 것도 보장하지 않는다. 그래서 고를 때 남긴
     **근거(signature)** 를 함께 대조한다.

   stampInspectorEditIds() 가 돌려주는 autoIds 가 그 둘을 정확히
   가른다 — 이번 pass 에서 새로 만든 id 만 담기기 때문이다.

   ★ 지문은 "그 요소가 어떤 요소였는가"의 값싼 요약이다

   태그 · 클래스 · data-imory-* 바인딩 · 정적 href/src · 자식 수 ·
   제 텍스트 앞부분. 뒤 형제가 자리를 물려받으면 이 중 하나는 대개
   달라진다 — 그러나 **완전히 같은 형제**는 이것만으로 갈리지
   않는다. 그래서 실제 대조에 쓰는 값은 이 지문에 자리(형제 차례와
   형제 수 · 조상)와 subtree 를 더한 세 겹이다
   (inspectorSelectionSignature — 그 머리말에 근거와 남은 한계).

   ★ 근거가 없으면 **해제**다

   임시 id 인데 근거가 없거나(옛 선택), 근거가 다르면 되살리지
   않는다. "아마 같은 요소일 것"으로 넘기지 않는다 — 틀렸을 때
   치르는 값이 크다.
========================================================== */

const INSPECTOR_FINGERPRINT_ATTRS = [
  "data-imory-bind",
  "data-imory-src",
  "data-imory-href",
  "data-imory-repeat",
  "data-imory-if",
  "data-imory-region",
  "data-imory-kind",
  "data-imory-color",
  "data-imory-slot",
  "href",
  "src"
];

const INSPECTOR_FINGERPRINT_TEXT_MAX = 40;


function inspectorElementFingerprint(el) {

  if (!el || el.nodeType !== 1) {
    return "";
  }

  const parts = [
    el.tagName.toLowerCase(),

    /* class 는 적힌 순서 그대로다 — 순서가 바뀌면 그것도 "달라졌다"로
       본다. 지문은 같음을 증명하는 값이지 비슷함을 재는 값이 아니다. */
    (el.getAttribute("class") || "").trim().replace(/\s+/g, " "),

    String(el.children.length)
  ];

  INSPECTOR_FINGERPRINT_ATTRS.forEach((name) => {
    parts.push(el.getAttribute(name) || "");
  });

  /* 자식 요소의 글자는 빼고 **제 텍스트**만 — 자식이 바뀌어도
     이 요소가 그 요소인 것은 변하지 않는다. */
  const ownText =
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join("")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, INSPECTOR_FINGERPRINT_TEXT_MAX);

  parts.push(ownText);

  return parts.join("");

}


/* =========================================================
   선택 복원의 근거 — 지문 하나로는 모자란 경우 (2026-09-17 보완)

   ★ 남아 있던 구멍: **완전히 같은 형제**

     <li class="card">글</li>
     <li class="card">글</li>   <- 사용자가 고른 것
     <li class="card">글</li>

   위 지문(태그·클래스·속성·자식 수·제 텍스트)은 셋이 똑같다.
   가운데를 고른 뒤 **첫째를 지우면** 셋째가 그 구조 경로 id 를
   물려받고 지문까지 같아서 "ok" 가 나온다 — 선택이 조용히 다른
   형제로 넘어간다. 그 상태로 AI 수정을 보내면 사용자가 보지도 않은
   요소가 바뀐다.

   ★ 그래서 근거를 세 겹으로 만든다 (inspectorSelectionSignature)

     1. own    그 요소 자체의 지문 (inspectorElementFingerprint)
     2. trail  body 까지 올라가며 **형제 중 몇 번째인가 · 형제가
               몇인가 · 그 부모는 어떤 요소인가**
     3. sub    제 아래 subtree 의 구조와 글자

   (1) 은 자리를 물려받은 **다른 종류**의 형제를 걸러내고,
   (2) 는 **형제 수·차례가 달라진 것**(= 누가 지워지거나 끼어들었다)
   을 걸러내며, (3) 은 겉만 같고 속이 다른 형제를 걸러낸다. 형제를
   하나 지우면 부모의 자식 수가 반드시 1 줄므로, 완전히 같은 형제
   사이에서도 (2) 에서 걸린다.

   ★ 여전히 가를 수 없는 경우는 그대로 적는다

   subtree 까지 글자 단위로 똑같은 형제 **둘의 자리를 맞바꾸면**
   결과 HTML 이 바꾸기 전과 한 글자도 다르지 않다. 그 둘을 가르는
   근거는 HTML 어디에도 없고 — 지금 우리가 들고 있는 것은 그
   HTML 문자열 하나다 — 어느 쪽에 규칙을 붙여도 화면도 저장 결과도
   같다. 그래서 그 경우만 "유지"로 남는다. 넘어갈 **다른** 형제가
   결과적으로 존재하지 않기 때문이다. 지우기·끼워넣기·(속이 다른)
   순서 바꾸기는 전부 (2)나 (3)에서 걸려 해제된다.

   ★ 값은 해시로 줄인다

   trail 과 subtree 를 원문으로 들면 큰 템플릿에서 수 KB 가 된다.
   비교는 "같은가/다른가" 하나뿐이므로 32bit 두 벌(FNV-1a, 시드가
   다르다)로 줄인다. own 지문은 사람이 읽을 수 있게 그대로 둔다 —
   로그에서 "무엇이 달라졌나"를 보는 데 쓴다. 이 값은 프레임으로도
   서버로도 나가지 않는다(이 문서 메모리에만 있다).
========================================================== */

const INSPECTOR_SIGNATURE_VERSION = "v2";

/* 아주 깊거나 큰 subtree 에서 비용이 폭발하지 않게 한다. 상한에
   걸리면 그 사실 자체를 값에 적는다 — 상한 아래가 같아도 "잘렸다"
   가 같아야 같은 값이다. */
const INSPECTOR_SIGNATURE_MAX_NODES = 400;
const INSPECTOR_SIGNATURE_MAX_DEPTH = 8;
const INSPECTOR_SIGNATURE_MAX_ANCESTORS = 20;


function inspectorSignatureHash(text) {

  /* FNV-1a 계열 32bit 두 벌. 암호 해시가 아니다 — 여기서 막는 것은
     "우연히 같아 보이는 두 요소"이지 공격자가 아니다. */

  let a = 0x811c9dc5;
  let b = 0x9e3779b1;

  for (let i = 0; i < text.length; i += 1) {

    const code = text.charCodeAt(i);

    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;

    b ^= code + i;
    b = Math.imul(b, 0x85ebca6b) >>> 0;

  }

  return (
    a.toString(16).padStart(8, "0") +
    b.toString(16).padStart(8, "0")
  );

}


/* body 까지 올라가는 자리 기록 — "몇 번째 · 몇 중에 · 누구 밑에" */
function inspectorAncestorTrail(el) {

  const parts = [];

  let node = el;
  let parent = node.parentElement;

  while (parent && parts.length < INSPECTOR_SIGNATURE_MAX_ANCESTORS) {

    const index =
      Array.prototype.indexOf.call(parent.children, node);

    parts.push(
      index + "/" + parent.children.length + ":" +
      inspectorElementFingerprint(parent)
    );

    node = parent;
    parent = node.parentElement;

  }

  /* 문서 끝까지 올라갔는가 — 상한에 걸려 멈춘 것과 구분한다 */
  parts.push(parent ? "cut" : "root");

  return parts.join("|");

}


/* 제 아래 subtree 의 구조와 글자 */
function inspectorSubtreeDetail(el) {

  const parts = [];

  let budget = INSPECTOR_SIGNATURE_MAX_NODES;

  (function walk(node, depth) {

    if (depth > INSPECTOR_SIGNATURE_MAX_DEPTH) {
      parts.push("deep");
      return;
    }

    Array.from(node.children).forEach((child, index) => {

      if (budget <= 0) {
        return;
      }

      budget -= 1;

      parts.push(
        depth + ":" + index + ":" + inspectorElementFingerprint(child)
      );

      walk(child, depth + 1);

    });

  }(el, 0));

  if (budget <= 0) {
    parts.push("cut");
  }

  return parts.join("|");

}


function inspectorSelectionSignature(el) {

  if (!el || el.nodeType !== 1) {
    return "";
  }

  return [
    INSPECTOR_SIGNATURE_VERSION,
    inspectorElementFingerprint(el),
    inspectorSignatureHash(inspectorAncestorTrail(el)),
    inspectorSignatureHash(inspectorSubtreeDetail(el))
  ].join("~");

}


/* =========================================================
   resolveInspectorSelectionTarget(stamped, editId, signature)
     -> { element, reason } | { element: null, reason }

   reason 값(호출자의 로그/테스트용):
     "ok"            그 요소가 맞다
     "gone"          그 id 를 가진 요소가 없다
     "ambiguous"     승격된 id 인데 HTML 안에 여러 번 있다
     "no-evidence"   임시 id 인데 대조할 근거가 없다
     "mismatch"      임시 id 인데 근거가 다르다(자리를 물려받았다)

   세 번째 인자는 고를 때 남긴 inspectorSelectionSignature() 값이다
   (예전 이름은 fingerprint 였다 — 값이 세 겹으로 넓어졌을 뿐,
   호출 규약과 흐르는 자리는 그대로다).
========================================================== */

function resolveInspectorSelectionTarget(stamped, editId, signature) {

  if (!stamped || !isValidInspectorEditId(editId)) {
    return { element: null, reason: "gone" };
  }

  const element =
    stamped.doc.body.querySelector(
      `[${INSPECTOR_EDIT_ID_ATTR}="${editId}"]`
    );

  if (!element) {
    return { element: null, reason: "gone" };
  }

  /* 승격된 id — **유일할 때만** 그 자체가 근거다.

     stamp 가 두 번째 사본의 속성을 이미 떼어 냈으므로 doc 만 봐서는
     알 수 없다. 그래서 stamp 가 적어 둔 기록을 본다
     (stampInspectorEditIds duplicateIds). 여럿이었다면 위
     querySelector 가 돌려준 **첫 번째**가 사용자가 고른 그 요소라는
     보장이 없다 — 되살리지 않는다. */
  if (!stamped.autoIds.has(editId)) {

    const duplicated =
      !!(stamped.duplicateIds && stamped.duplicateIds.has(editId));

    return duplicated
      ? { element: null, reason: "ambiguous" }
      : { element, reason: "ok" };

  }

  if (typeof signature !== "string" || !signature) {
    return { element: null, reason: "no-evidence" };
  }

  if (inspectorSelectionSignature(element) !== signature) {
    return { element: null, reason: "mismatch" };
  }

  return { element, reason: "ok" };

}


/* =========================================================
   요소 분류

   "너무 작은 span 하나하나를 잡지 않는다"(요구사항 4절)는 여기서
   결정된다 — 장식용 빈 요소는 선택 대상에서 빼고, 클릭이 그런
   요소에 떨어지면 호출자가 부모로 한 칸 올라간다
   (preview-bridge.js의 resolveInspectableTarget).

   ★ 판정 규칙 자체는 이 파일에 없다 — skin/skin-inspect-target.js

   SANDBOX-6A 에서 옮겼다. 같은 규칙이 이제 **세 realm** 에서
   필요하기 때문이다: Studio 문서 · native Preview 문서 ·
   sandbox 프레임 문서. 프레임은 studio/* 를 로드할 수 없으므로
   (sandbox origin allowlist — core/lib/skin-sandbox-server.js),
   의존이 하나도 없는 그 파일을 셋이 각각 로드한다. 규칙을 복붙하면
   세 쪽이 서서히 달라지고, 달라지는 쪽은 늘 느슨한 쪽이다.

   그 파일이 주는 전역(classic script 최상위 선언이라 이 파일에서
   그대로 읽힌다 — 로드 순서만 지키면 된다):

     INSPECTOR_NEVER_SELECTABLE_TAGS
     INSPECTOR_TEXTUAL_TAGS          (아래 kind 판정이 쓴다)
     isInspectableElement(el)
     resolveInspectableAncestor(node, root, editIdOf)

   로드 순서: skin/skin-inspect-target.js -> 이 파일
   (studio/index.html · studio/studio-lifecycle-scenario.html ·
    studio/preview/preview-frame.html · skin/sandbox/frame.html)
========================================================== */


function inspectorOwnText(el) {

  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent)
    .join("");

}


/* =========================================================
   imageSlot 판정 (요구사항 11절)

   Skin Context에서 이미지 슬롯 값이 나타나는 경로는 딱 둘이다
   (skin/skin-context.js buildSkinImages + profile.avatarUrl 미러):

     images.<slotName>
     profile.avatarUrl        -> "profile" 슬롯

   profile 슬롯을 비워 두면 그 자리에 Settings의 프로필 사진
   (site_settings.avatar_url)이 대신 그려지지만, 그건 슬롯의
   **기본값**이지 슬롯 연결이 아니다 — 여기서 "이미지 변경"을
   제공할지는 지금도 오직 "스킨이 그 슬롯을 선언했는가"로만
   정한다(선언하지 않은 스킨의 profile.avatarUrl은 교체 대상이
   Settings 쪽이므로 이 패널이 손대지 않는다).

   그 외 경로(item.imageUrl 등)는 글/배너 데이터에서 오는 값이라
   슬롯이 아니다 — 그런 이미지는 "이미지 변경"을 제공하지 않는다
   (교체 대상이 스킨이 아니라 사용자의 글 데이터이기 때문).
========================================================== */

function resolveInspectorImageSlot(srcPath, declaredSlotNames) {

  if (typeof srcPath !== "string" || !srcPath) {
    return null;
  }

  const names =
    Array.isArray(declaredSlotNames) ? declaredSlotNames : [];

  if (srcPath === "profile.avatarUrl") {
    return names.includes("profile") ? "profile" : null;
  }

  if (srcPath.startsWith("images.")) {

    const slotName =
      srcPath.slice("images.".length);

    return names.includes(slotName) ? slotName : null;

  }

  return null;

}


/* =========================================================
   describeInspectorElement(el, options) -> 선택 요소 설명

   options:
     declaredSlotNames  현재 SkinPackage가 선언한 imageSlot 이름들
     requiredSlotNames  그중 required:true인 것들(비우기 금지)

   여기서 나오는 capabilities가 곧 화면에 그려지는 컨트롤 목록이다
   — UI는 이 결과만 보고 그리고, "이건 되나?"를 스스로 다시
   판단하지 않는다.
========================================================== */

function describeInspectorElement(el, options) {

  const declaredSlotNames =
    (options && options.declaredSlotNames) || [];

  const requiredSlotNames =
    (options && options.requiredSlotNames) || [];

  const tagName =
    el.tagName.toLowerCase();

  const bindPath =
    el.getAttribute("data-imory-bind");

  const srcPath =
    el.getAttribute("data-imory-src");

  const hrefPath =
    el.getAttribute("data-imory-href");

  const repeatPath =
    el.getAttribute("data-imory-repeat");

  const regionName =
    el.getAttribute("data-imory-region");

  const ancestorRegion =
    el.parentElement
      ? el.parentElement.closest("[data-imory-region]")
      : null;

  const repeatAncestor =
    el.parentElement
      ? el.parentElement.closest("[data-imory-repeat]")
      : null;

  const isProtectedRegion =
    !!regionName || !!ancestorRegion;

  const hasElementChildren =
    el.children.length > 0;

  const ownText =
    inspectorOwnText(el);

  const imageSlot =
    tagName === "img"
      ? resolveInspectorImageSlot(srcPath, declaredSlotNames)
      : null;

  /* owner/admin/write 진입점은 runtime binding으로만 관리된다
     (skin-context.js viewer.*) — 주소를 사람이 덮어쓰면 그 화면으로
     가는 길 자체가 사라진다. */
  const isViewerBinding =
    typeof hrefPath === "string" && hrefPath.startsWith("viewer.");

  let kind;

  if (tagName === "img") {
    kind = "image";
  } else if (tagName === "a") {
    kind = "link";
  } else if (!hasElementChildren && (ownText.trim() || bindPath || INSPECTOR_TEXTUAL_TAGS.has(tagName))) {
    kind = "text";
  } else {
    kind = "container";
  }

  /* 내용 직접 수정은 "정적 텍스트"에만 허용한다(요구사항 10절) —
     data-imory-bind가 걸린 텍스트는 렌더 시점에 항상 덮어써지므로
     여기서 고쳐도 화면에 남지 않고, 바인딩을 지워버리면 기능이
     깨진다. */
  const canEditText =
    !isProtectedRegion &&
    (kind === "text" || kind === "link") &&
    !bindPath &&
    !hasElementChildren &&
    !repeatPath;

  const canEditHref =
    !isProtectedRegion &&
    kind === "link" &&
    !hrefPath;

  const canStyle =
    !isProtectedRegion;

  /* =====================================================
     LAYOUT-1 — 배치 primitive (IMORY_LAYOUT_PRIMITIVE_DESIGN.md)

     "이 요소가 어떤 배치를 선언했는가 / 부모가 어떤 배치인가"는
     skin/skin-layout.js 의 순수 함수 하나가 답한다 — Studio 와
     공개 렌더러가 같은 판정을 쓰는 이유다.

     열어 주는 조건:
       layout     자식이 있는 컨테이너여야 한다. 배치는 "무엇을
                  어떻게 담는가"라서 담을 것이 없으면 뜻이 없다.
       layoutItem 부모가 실제로 배치를 선언했고, 그 배치에 자식별
                  파라미터가 있을 때만(격자의 칸, 자유 배치의
                  좌표, 사이드바의 영역).
       reorder    형제가 둘 이상이고 부모가 순서를 읽는 배치일 때.

     보호 구역(post-body) 안에서는 전부 닫힌다 — canStyle 과 같다.
  ====================================================== */

  const layout =
    typeof describeSkinLayoutTarget === "function"
      ? describeSkinLayoutTarget(el)
      : null;

  const canLayout =
    canStyle &&
    !!layout &&
    hasElementChildren &&
    kind !== "image";

  const canLayoutItem =
    canStyle &&
    !!layout &&
    layout.parentIsLayout &&
    (layout.itemParams.length > 0 || layout.parentType === "sidebar");

  /* =====================================================
     TRANSITION-1 — 전환 primitive (IMORY_TRANSITION_PRIMITIVE_DESIGN.md)

     "이 요소가 어떤 전환을 선언했는가"는 skin/skin-transition.js 의
     순수 함수 하나가 답한다. 열어 주는 조건은 스타일과 같다 —
     보호 구역(post-body) 안이 아니면 어떤 요소든 나타날 때의
     움직임을 가질 수 있다.
  ====================================================== */

  const transition =
    typeof describeSkinTransitionTarget === "function"
      ? describeSkinTransitionTarget(el)
      : null;

  const capabilities = {
    layout: canLayout,
    layoutItem: canLayoutItem,
    reorder: canStyle && !!layout && layout.canReorder,
    transition: canStyle && !!transition,
    text: canEditText,
    href: canEditHref,
    typography: canStyle && (kind === "text" || kind === "link"),
    color: canStyle && (kind === "text" || kind === "link" || kind === "container"),
    background: canStyle && (kind === "link" || kind === "container"),
    align: canStyle && kind !== "image",
    imageSource: canStyle && kind === "image" && !!imageSlot,
    imageClear:
      canStyle &&
      kind === "image" &&
      !!imageSlot &&
      !requiredSlotNames.includes(imageSlot),
    size: canStyle && kind === "image",

    /* 자르기도 크기와 같은 조건이다 — 원본 파일이 아니라 "스킨이
       그 이미지를 어떻게 보여주는가"만 바꾸므로, 슬롯에 연결된
       이미지든 글 데이터에서 온 이미지든 똑같이 할 수 있다.
       보호 영역(post-body) 안에서만 canStyle이 false로 막힌다. */
    crop: canStyle && kind === "image",
    shape: canStyle && (kind === "image" || kind === "link" || kind === "container"),
    border: canStyle && kind === "container",
    padding: canStyle && kind === "container",
    imageAlign: canStyle && kind === "image"
  };

  return {
    editId: el.getAttribute(INSPECTOR_EDIT_ID_ATTR) || null,
    tagName,
    kind,
    classNames:
      (el.getAttribute("class") || "").split(/\s+/).filter(Boolean),
    bindPath: bindPath || null,
    srcPath: srcPath || null,
    hrefPath: hrefPath || null,
    repeatPath: repeatPath || null,
    ifPath: el.getAttribute("data-imory-if") || null,
    region: regionName || (ancestorRegion ? ancestorRegion.getAttribute("data-imory-region") : null),
    isProtectedRegion,
    isViewerBinding,
    isRepeatTemplate: !!repeatPath,
    isInsideRepeat: !!repeatAncestor,
    imageSlot,
    layout,
    transition,
    staticHref: el.getAttribute("href") || null,
    staticSrc: el.getAttribute("src") || null,
    text: ownText,
    hasElementChildren,
    capabilities
  };

}


/* =========================================================
   DIRECT EDIT CSS

   selector 하나 = 요소 하나. 규칙은 항상 css 문자열 **맨 뒤**에
   붙는다 — specificity가 같아지는 경우(스킨이 클래스 두 개짜리
   규칙을 쓰는 경우) 소스 순서가 늦은 쪽이 이기기 때문이다.

   값은 전부 아래 buildInspectorStylePatch()가 만든 것뿐이고
   사용자가 CSS 문자열을 직접 쓰는 입구는 없다 — 그래서 여기서
   따옴표/괄호 이스케이프를 다시 걱정할 필요가 없다(그래도 저장
   시점에 skin-css-validate.js가 다시 한번 전체를 검증한다).
========================================================== */

function buildInspectorEditSelector(editId) {

  return (
    `[${INSPECTOR_EDIT_ID_ATTR}="${editId}"]` +
    `[${INSPECTOR_EDIT_ID_ATTR}="${editId}"]`
  );

}


function inspectorEditRulePattern(editId) {

  const selector =
    buildInspectorEditSelector(editId)
      .replace(/[[\]]/g, "\\$&");

  return new RegExp(`${selector}\\s*\\{[^{}]*\\}\\s*`, "g");

}


function readInspectorEditDeclarations(css, editId) {

  const declarations = {};

  if (!isValidInspectorEditId(editId)) {
    return declarations;
  }

  const match =
    String(css || "").match(inspectorEditRulePattern(editId));

  if (!match || !match.length) {
    return declarations;
  }

  const body =
    match[match.length - 1].replace(/^[^{]*\{/, "").replace(/\}\s*$/, "");

  body.split(";").forEach((chunk) => {

    const separator =
      chunk.indexOf(":");

    if (separator === -1) {
      return;
    }

    const property =
      chunk.slice(0, separator).trim().toLowerCase();

    const value =
      chunk.slice(separator + 1).trim();

    if (property && value) {
      declarations[property] = value;
    }

  });

  return declarations;

}


function writeInspectorEditDeclarations(css, editId, declarations) {

  const base =
    String(css || "").replace(inspectorEditRulePattern(editId), "");

  const entries =
    Object.keys(declarations || {})
      .filter((property) => {
        const value = declarations[property];
        return typeof value === "string" && value.trim();
      })
      .map((property) => `${property}: ${declarations[property].trim()}`);

  if (!entries.length) {
    return base.replace(/\s+$/, "") + (base.trim() ? "\n" : "");
  }

  const rule =
    `${buildInspectorEditSelector(editId)} { ${entries.join("; ")}; }`;

  return `${base.replace(/\s+$/, "")}\n\n${rule}\n`;

}


/* =========================================================
   컨트롤 -> 선언 변환

   UI가 만드는 값은 전부 이 함수를 통과한다. 자유 문자열 CSS가
   들어올 입구를 하나도 만들지 않기 위해서다 — 색은 #rrggbb만,
   길이는 정수 px만, 나머지는 열거된 키워드만 받는다. 형태가 맞지
   않으면 그 컨트롤은 "설정 안 함"이 된다(= 해당 속성 제거).

   반환값은 "이 컨트롤이 소유하는 속성 -> 값(또는 null=제거)" 맵이라,
   호출자는 기존 선언에 그대로 병합하면 된다.
========================================================== */

const INSPECTOR_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const INSPECTOR_ALIGN_VALUES = ["left", "center", "right"];

const INSPECTOR_WEIGHT_VALUES = ["400", "500", "700"];

const INSPECTOR_SHAPE_VALUES = {
  square: "0",
  soft: "12px",
  circle: "50%"
};


/* =========================================================
   이미지 가로 크기와 비율 (Select mode 직접 편집 라운드)

   크기 조절은 **가로 하나만** 사용자가 정하고, 세로는 지금 화면에
   보이는 비율로 따라온다. 그래서 `height: auto` + `aspect-ratio`를
   같이 쓴다:

     - 스킨이 `width:120px; height:120px; object-fit:cover`로 만든
       정사각형 프로필 사진에 `height:auto`만 주면 원본 비율로
       늘어나 구도가 바뀐다. aspect-ratio가 그 정사각형을 그대로
       유지해 준다(object-fit 값 자체는 건드리지 않는다).
     - 반대로 `height`를 px로 박으면 좁은 화면에서 max-width로
       가로가 줄 때 세로가 안 줄어 이미지가 찌그러진다.

   max-width: 100%를 항상 함께 쓴다 — 부모보다 큰 px를 넣어도
   모바일에서 가로 넘침이 생기지 않게 하는 안전장치다(가로가 줄면
   aspect-ratio가 세로를 같이 줄여 비율은 그대로 유지된다).
========================================================== */

const INSPECTOR_ASPECT_RATIO_MIN = 0.02;

const INSPECTOR_ASPECT_RATIO_MAX = 50;


function inspectorAspectRatio(value) {

  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const raw =
    String(value).trim();

  let ratio;

  const pair =
    /^([0-9]*\.?[0-9]+)\s*\/\s*([0-9]*\.?[0-9]+)$/.exec(raw);

  if (pair) {
    ratio = Number(pair[1]) / Number(pair[2]);
  } else {
    ratio = Number(raw);
  }

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }

  const clamped =
    Math.min(Math.max(ratio, INSPECTOR_ASPECT_RATIO_MIN), INSPECTOR_ASPECT_RATIO_MAX);

  /* 소수 넷째 자리까지만 남긴다 — 측정값(예: 137.328125 / 91.5)을
     그대로 쓰면 CSS에 의미 없이 긴 숫자가 남고, 저장 → 다시 읽기에서
     문자열이 미묘하게 달라진다. */
  return String(Math.round(clamped * 10000) / 10000);

}


function inspectorLengthPx(value, max) {

  /* 빈 값은 0이 아니라 "설정 안 함"이다 — Number("")가 0이라
     그냥 넘기면 입력칸을 비운 사용자가 `padding: 0px`를 얻는다
     (원래 스킨 값으로 돌아가지 않는다). */
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const clamped =
    Math.min(Math.max(Math.round(number), 0), max);

  return `${clamped}px`;

}


function buildInspectorStylePatch(control, value) {

  const clear = (properties) => {

    const patch = {};

    properties.forEach((property) => {
      patch[property] = null;
    });

    return patch;

  };

  switch (control) {

    case "fontSize": {
      const length = inspectorLengthPx(value, 200);
      return length ? { "font-size": length } : clear(["font-size"]);
    }

    case "fontWeight":
      return INSPECTOR_WEIGHT_VALUES.includes(String(value))
        ? { "font-weight": String(value) }
        : clear(["font-weight"]);

    case "color":
      return INSPECTOR_COLOR_PATTERN.test(String(value))
        ? { color: String(value).toLowerCase() }
        : clear(["color"]);

    case "background":
      return INSPECTOR_COLOR_PATTERN.test(String(value))
        ? { "background-color": String(value).toLowerCase() }
        : clear(["background-color"]);

    case "align":
      return INSPECTOR_ALIGN_VALUES.includes(String(value))
        ? { "text-align": String(value) }
        : clear(["text-align"]);

    case "radius": {
      const length = inspectorLengthPx(value, 999);
      return length ? { "border-radius": length } : clear(["border-radius"]);
    }

    case "shape":
      return Object.prototype.hasOwnProperty.call(INSPECTOR_SHAPE_VALUES, String(value))
        ? { "border-radius": INSPECTOR_SHAPE_VALUES[String(value)] }
        : clear(["border-radius"]);

    case "padding": {
      const length = inspectorLengthPx(value, 200);
      return length ? { padding: length } : clear(["padding"]);
    }

    /* 값은 두 가지 모양을 받는다:
         "240"                       — 비율 정보 없이 가로만
         { width: 240, ratio: 1.5 }  — 지금 화면에 보이는 비율 유지
       빈 width는 "이번 직접 편집으로 넣은 크기 설정을 전부 제거"다
       (= 스킨 CSS 원래 크기로 복귀). */
    case "size": {

      const isObject =
        value !== null && typeof value === "object";

      const length =
        inspectorLengthPx(isObject ? value.width : value, 2000);

      if (!length) {
        return clear(["width", "height", "aspect-ratio", "max-width"]);
      }

      const ratio =
        inspectorAspectRatio(isObject ? value.ratio : null);

      return {
        width: length,
        height: "auto",
        "aspect-ratio": ratio,
        "max-width": "100%"
      };

    }

    case "border": {

      const width =
        inspectorLengthPx(value && value.width, 40);

      const color =
        INSPECTOR_COLOR_PATTERN.test(String(value && value.color))
          ? String(value.color).toLowerCase()
          : null;

      if (!width || width === "0px") {
        return clear(["border"]);
      }

      return { border: `${width} solid ${color || "#000000"}` };

    }

    /* 여러 줄 텍스트 — textContent에 넣은 줄바꿈은 HTML에서 그냥
       공백 하나로 접히므로, 사용자가 실제로 줄을 나눴을 때만
       white-space를 pre-wrap으로 올린다(한 줄로 되돌리면 다시
       제거해 스킨 원래 값으로 돌아간다). */
    case "whiteSpace":
      return String(value) === "pre-wrap"
        ? { "white-space": "pre-wrap" }
        : clear(["white-space"]);

    case "imageAlign": {

      const alignment =
        String(value);

      if (!INSPECTOR_ALIGN_VALUES.includes(alignment)) {
        return clear(["display", "margin-left", "margin-right"]);
      }

      return {
        display: "block",
        "margin-left": alignment === "left" ? "0" : "auto",
        "margin-right": alignment === "right" ? "0" : "auto"
      };

    }

    default:
      return {};

  }

}


/* =========================================================
   지금 선언에서 각 컨트롤의 현재 값 되읽기 — 폼 prefill용.
   "설정 안 함"은 항상 빈 문자열/null로 표현한다.
========================================================== */

function readInspectorControlValue(control, declarations) {

  const decl =
    declarations || {};

  const px = (value) =>
    (typeof value === "string" && /^\d+px$/.test(value))
      ? value.slice(0, -2)
      : "";

  switch (control) {

    case "fontSize":
      return px(decl["font-size"]);

    case "fontWeight":
      return INSPECTOR_WEIGHT_VALUES.includes(decl["font-weight"])
        ? decl["font-weight"]
        : "";

    case "color":
      return INSPECTOR_COLOR_PATTERN.test(String(decl.color || "")) ? decl.color : "";

    case "background":
      return INSPECTOR_COLOR_PATTERN.test(String(decl["background-color"] || ""))
        ? decl["background-color"]
        : "";

    case "align":
      return INSPECTOR_ALIGN_VALUES.includes(decl["text-align"]) ? decl["text-align"] : "";

    case "radius":
      return px(decl["border-radius"]);

    case "shape": {

      const found =
        Object.keys(INSPECTOR_SHAPE_VALUES).find(
          (name) => INSPECTOR_SHAPE_VALUES[name] === decl["border-radius"]
        );

      return found || "";

    }

    case "padding":
      return px(decl.padding);

    case "size":
      return px(decl.width);

    /* 지금 규칙에 적혀 있는 비율(문자열). 없으면 빈 문자열 —
       그때는 UI가 화면에서 잰 비율을 쓴다. */
    case "sizeRatio":
      return inspectorAspectRatio(decl["aspect-ratio"]) || "";

    case "whiteSpace":
      return decl["white-space"] === "pre-wrap" ? "pre-wrap" : "";

    case "border": {

      const parsed =
        /^(\d+)px\s+solid\s+(#[0-9a-fA-F]{6})$/.exec(String(decl.border || ""));

      return parsed
        ? { width: parsed[1], color: parsed[2] }
        : { width: "", color: "" };

    }

    case "imageAlign": {

      if (decl.display !== "block") {
        return "";
      }

      if (decl["margin-left"] === "0") {
        return "left";
      }

      if (decl["margin-right"] === "0") {
        return "right";
      }

      return decl["margin-left"] === "auto" ? "center" : "";

    }

    default:
      return "";

  }

}


if (typeof window !== "undefined") {

  window.INSPECTOR_EDIT_ID_ATTR = INSPECTOR_EDIT_ID_ATTR;
  window.isValidInspectorEditId = isValidInspectorEditId;
  window.stampInspectorEditIds = stampInspectorEditIds;
  window.commitInspectorEditId = commitInspectorEditId;
  window.isInspectableElement = isInspectableElement;
  window.describeInspectorElement = describeInspectorElement;

  /* 선택 복원의 근거 (SANDBOX-6A 후속) */
  window.inspectorElementFingerprint = inspectorElementFingerprint;
  window.inspectorSelectionSignature = inspectorSelectionSignature;
  window.resolveInspectorSelectionTarget = resolveInspectorSelectionTarget;
  window.resolveInspectorImageSlot = resolveInspectorImageSlot;
  window.buildInspectorEditSelector = buildInspectorEditSelector;
  window.readInspectorEditDeclarations = readInspectorEditDeclarations;
  window.writeInspectorEditDeclarations = writeInspectorEditDeclarations;
  window.buildInspectorStylePatch = buildInspectorStylePatch;
  window.readInspectorControlValue = readInspectorControlValue;
  window.inspectorAspectRatio = inspectorAspectRatio;

}
