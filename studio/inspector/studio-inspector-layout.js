/* =========================================================
   SKIN STUDIO — ELEMENT INSPECTOR: 배치(LAYOUT PRIMITIVE)

   기준 문서: IMORY_LAYOUT_PRIMITIVE_DESIGN.md
   계약/판정: skin/skin-layout.js

   여기는 "고른 요소의 **배치**를 사람이 직접 고치는" 자리다. AI 가
   같은 요청을 받았을 때 고치는 것도 **똑같은 속성**이다(요구사항
   11절) — 그래서 이 파일에는 배치 규칙이 한 줄도 없다. 무엇이
   허용되는 값인지, 기본값이 무엇인지는 전부 skin/skin-layout.js 가
   정하고 여기서는 그 표를 읽어 폼을 그린다.

   ── 무엇을 고치나 ─────────────────────────────────────
   전부 **템플릿 HTML 의 속성**이다. 생성 CSS 규칙을 쓰지 않는다 —
   배치는 구조이지 스타일이 아니고(요구사항 1절), 속성이어야
   Export/Import 왕복과 sandbox 프레임에 그대로 따라간다.

     data-imory-layout           이 요소의 배치 종류
     data-imory-layout-*         그 배치의 파라미터
     data-imory-item-*           부모 배치 안에서 이 요소의 자리
     data-imory-slot             사이드바의 두 영역 중 어디인가

   ── 확정 경로 ─────────────────────────────────────────
   전부 applyStudioInspectorPatch() 하나를 지난다
   (studio-inspector-edit.js) — 직접 수정이 SkinPackage 에 반영되는
   유일한 길이라는 기존 원칙 그대로다. 실패하면 working draft 는 한
   글자도 바뀌지 않고, 성공하면 Undo 한 칸이 생긴다.

   ── 드래그의 의미(요구사항 10절) ───────────────────────
     stack/grid/panel 자식 -> 순서 변경
     free 자식             -> 좌표 변경
     sidebar               -> 자식은 자기 영역의 규칙을 따른다

   순서 변경은 ↑↓ 버튼으로 한다. 자유 배치의 좌표는 선택 테두리에
   붙는 이동 손잡이를 끌어서 바꾼다 — 끄는 내내는 프레임 안에서
   임시로만 움직이고(저장 안 됨), 손을 떼는 순간 한 번의 편집으로
   확정된다(이미지 크기 조절과 같은 구조).

   ── 하지 않는 것 ───────────────────────────────────────
   여러 요소를 골라 하나로 묶기(grouping)는 여기 없다 — 다중 선택
   변형은 이번 라운드의 제외 항목이다(요구사항 16절). "이 세 요소를
   하나로 묶어줘"는 AI 가 templates HTML 을 고쳐서 한다(요구사항 11절).

   ── 의존 ───────────────────────────────────────────────
   먼저 로드: studio/inspector/studio-inspector-state.js.
   호출 시점: skin/skin-layout.js(전역 판정 함수),
   studio-inspector-edit.js(applyStudioInspectorPatch),
   studio-inspector-overlay.js(studioInspectorMapRectRaw),
   studio/studio-preview.js(showStudioToast).
========================================================== */


/* =========================================================
   사용자에게 보이는 이름 (요구사항 9절)

   primitive 이름을 그대로 노출하지 않는다. 내부 값과 화면 문구의
   짝은 **이 표 하나**에만 있다.

     세로       -> stack(column)
     가로       -> stack(row)
     격자       -> grid
     자유 배치  -> free
     사이드바   -> sidebar
     그룹       -> panel
========================================================== */

const STUDIO_LAYOUT_CHOICES = [
  { value: "", label: "없음" },
  { value: "stack:column", label: "세로" },
  { value: "stack:row", label: "가로" },
  { value: "grid", label: "격자" },
  { value: "free", label: "자유 배치" },
  { value: "sidebar", label: "사이드바" },
  { value: "panel", label: "그룹" }
];

/* 파라미터 하나하나의 화면 이름과 입력 모양. skin-layout.js 의
   규칙표(범위/enum)와 짝이고, 여기에는 **문구와 모양만** 있다. */
const STUDIO_LAYOUT_PARAM_FIELDS = {
  "direction": { label: "방향", options: [["column", "세로"], ["row", "가로"]] },
  "gap": { label: "간격", unit: "px" },
  "row-gap": { label: "줄 간격", unit: "px" },
  "align": {
    label: "교차 정렬",
    options: [["stretch", "채움"], ["start", "시작"], ["center", "가운데"], ["end", "끝"], ["baseline", "글자선"]]
  },
  "justify": {
    label: "주 정렬",
    options: [["start", "시작"], ["center", "가운데"], ["end", "끝"], ["between", "양끝"], ["around", "고르게"]]
  },
  "wrap": { label: "줄바꿈", options: [["wrap", "허용"], ["nowrap", "한 줄"]] },
  "columns": { label: "열 수", unit: "열" },
  "columns-tablet": { label: "열 수(태블릿)", unit: "열" },
  "columns-mobile": { label: "열 수(모바일)", unit: "열" },
  "min": { label: "칸 최소 폭", unit: "px" },
  "height": { label: "높이", unit: "px" },
  "side": { label: "사이드바 자리", options: [["left", "왼쪽"], ["right", "오른쪽"]] },
  "sidebar-width": { label: "사이드바 폭", unit: "px" },
  "collapse": {
    label: "접히는 폭",
    options: [["480", "480px"], ["600", "600px"], ["720", "720px"], ["900", "900px"]]
  },
  "mobile": { label: "좁을 때", options: [["stack", "아래로"], ["hide", "숨김"]] },
  "max-width": { label: "최대 폭", unit: "px" },
  "min-height": { label: "최소 높이", unit: "px" },
  "overflow": {
    label: "넘칠 때",
    options: [["visible", "그대로"], ["hidden", "자르기"], ["auto", "스크롤"]]
  }
};

const STUDIO_LAYOUT_ITEM_FIELDS = {
  "span": { label: "가로 칸", unit: "칸" },
  "row-span": { label: "세로 칸", unit: "칸" },
  "x": { label: "가로 위치", percent: true },
  "y": { label: "세로 위치", percent: true },
  "width": { label: "너비", unit: "%" },
  "height": { label: "높이", unit: "%" },
  "z": { label: "겹침 순서" }
};


/* =========================================================
   지금 선택의 배치 설명

   describeSkinLayoutTarget()은 skin/skin-layout.js 의 순수 함수다
   — Studio 의 stamped 사본에서도, 렌더된 화면에서도 같은 답을 준다.
========================================================== */

function studioInspectorLayoutInfo() {

  const resolved =
    describeStudioInspectorSelection();

  if (!resolved || typeof describeSkinLayoutTarget !== "function") {
    return null;
  }

  return describeSkinLayoutTarget(resolved.element);

}


/* =========================================================
   확정 — 전부 applyStudioInspectorPatch() 하나를 지난다
========================================================== */

/* 배치 종류 바꾸기.

   ★ 종류를 바꿀 때 **이전 종류에서만 의미가 있던 파라미터를
     걷어낸다**. 남겨 두면 파일에는 값이 있는데 화면에서는 아무
     일도 일어나지 않는 상태가 되고(감사 경고가 그때마다 뜬다),
     다시 원래 종류로 돌렸을 때 지웠다고 생각한 값이 되살아난다.

   ★ grid/free 를 떠날 때는 **자식의 자리 속성**도 함께 걷는다 —
     그 값들은 부모가 그 종류일 때만 뜻이 있다. */
function commitStudioInspectorLayoutType(choiceValue) {

  const [type, direction] =
    String(choiceValue || "").split(":");

  return applyStudioInspectorPatch((element) => {

    const previous =
      element.getAttribute(SKIN_LAYOUT_ATTR);

    const keep =
      type ? (SKIN_LAYOUT_TYPE_PARAMS[type] || []) : [];

    Object.keys(SKIN_LAYOUT_PARAM_RULES).forEach((name) => {

      if (keep.indexOf(name) === -1) {
        element.removeAttribute(SKIN_LAYOUT_PARAM_PREFIX + name);
      }

    });

    if (previous === "grid" || previous === "free") {

      if (type !== previous) {

        Array.prototype.forEach.call(element.children, (child) => {

          Object.keys(SKIN_LAYOUT_ITEM_RULES).forEach((name) => {
            child.removeAttribute(SKIN_LAYOUT_ITEM_PREFIX + name);
          });

        });

      }

    }

    if (!type) {
      element.removeAttribute(SKIN_LAYOUT_ATTR);
      return {};
    }

    element.setAttribute(SKIN_LAYOUT_ATTR, type);

    if (direction) {
      element.setAttribute(SKIN_LAYOUT_PARAM_PREFIX + "direction", direction);
    }

    return {};

  });

}

function studioInspectorWriteLayoutAttribute(prefix, name, value) {

  const attr =
    prefix + name;

  const trimmed =
    String(value === null || value === undefined ? "" : value).trim();

  if (trimmed && !isValidSkinLayoutAttributeValue(attr, trimmed)) {

    showStudioToast("이 값은 넣을 수 없어요.", { isError: true });

    return false;

  }

  return applyStudioInspectorPatch((element) => {

    if (trimmed) {
      element.setAttribute(attr, trimmed);
    } else {
      element.removeAttribute(attr);
    }

    return {};

  });

}

function commitStudioInspectorLayoutParam(name, value) {
  return studioInspectorWriteLayoutAttribute(SKIN_LAYOUT_PARAM_PREFIX, name, value);
}

function commitStudioInspectorLayoutItemParam(name, value) {
  return studioInspectorWriteLayoutAttribute(SKIN_LAYOUT_ITEM_PREFIX, name, value);
}

function commitStudioInspectorLayoutSlot(value) {

  const trimmed =
    String(value || "").trim();

  return applyStudioInspectorPatch((element) => {

    if (trimmed) {
      element.setAttribute(SKIN_LAYOUT_SLOT_ATTR, trimmed);
    } else {
      element.removeAttribute(SKIN_LAYOUT_SLOT_ATTR);
    }

    return {};

  });

}


/* =========================================================
   순서 변경 (요구사항 3·4·10절)

   stack 이면 "앞뒤로 한 칸", grid 면 "앞뒤 칸으로". 둘 다 결과는
   같다 — **형제 사이에서 자리를 한 칸 옮기는 것**이고, 그러면
   렌더러가 그 순서대로 그린다. CSS order 를 쓰지 않는 이유:
   order 는 화면 순서만 바꾸고 DOM 순서(= 읽는 순서, 키보드 순서,
   그리고 다음 사람이 HTML 을 읽었을 때의 순서)는 그대로라 둘이
   갈라진다.

   drop 뒤에도 간격/정렬이 유지되는 이유도 같다 — 배치 파라미터는
   부모에 있고 이 동작은 부모를 건드리지 않는다.
========================================================== */

function moveStudioInspectorLayoutChild(delta) {

  return applyStudioInspectorPatch((element) => {

    const parent =
      element.parentElement;

    if (!parent) {
      return {};
    }

    const siblings =
      Array.prototype.slice.call(parent.children);

    const index =
      siblings.indexOf(element);

    const next =
      index + delta;

    if (next < 0 || next >= siblings.length) {
      return {};
    }

    if (delta < 0) {
      parent.insertBefore(element, siblings[next]);
    } else {
      parent.insertBefore(element, siblings[next].nextSibling);
    }

    return {};

  });

}


/* =========================================================
   자유 배치 — 좌표 드래그

   좌표는 px 가 아니라 0~1 비율이다(skin/skin-layout.js 5·6절).
   포인터가 움직인 화면 거리를 그 비율로 되돌리는 계산:

     실제 left = x * (부모 안쪽 폭 - 내 폭)
     => dx(비율) = dx(화면 px) / scale / (부모 안쪽 폭 - 내 폭)

   scale 은 Mobile Preview 의 축소·AI 패널 여닫기·창 크기 변경이
   이미 반영된 값이다(studioInspectorMapRectRaw). 분모가 0 이하면
   (요소가 부모를 가득 채움) 그 축은 움직일 자리가 없다 — 나누지
   않고 그대로 둔다.

   끄는 내내는 프레임 안 임시 미리보기만 바꾸고(저장 안 됨), 손을
   떼는 순간 한 번의 편집으로 확정한다 — 이미지 크기 조절과 같은
   구조이고, pointermove 마다 Undo 한 칸이 쌓이지 않는 이유다.
========================================================== */

let studioInspectorLayoutDrag = null;

function studioInspectorLayoutFreeRange(metrics, rect) {

  /* 움직일 수 있는 거리(iframe 안 px). 부모 안쪽 상자에서 자기
     크기를 뺀 만큼이다. */
  return {
    x: Math.max(0, (metrics ? metrics.parentWidth : 0) - (rect ? rect.width : 0)),
    y: Math.max(0, (metrics ? metrics.parentHeight : 0) - (rect ? rect.height : 0))
  };

}

function studioInspectorLayoutRatio(value) {

  const clamped =
    Math.min(1, Math.max(0, value));

  /* 저장 형태와 같은 정밀도로 자른다(소수점 4자리) — 화면에서
     끈 값과 파일에 적히는 값이 다르지 않도록. */
  return String(Math.round(clamped * 10000) / 10000);

}

function beginStudioInspectorLayoutDrag(event, handle) {

  if (
    !studioInspectorEnabled ||
    !studioInspectorSelection ||
    studioInspectorDrag ||
    studioInspectorLayoutDrag
  ) {
    return;
  }

  const layout =
    studioInspectorLayoutInfo();

  if (!layout || layout.parentType !== "free") {
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(studioInspectorSelection.rect);

  if (!mapped || !mapped.scale) {
    return;
  }

  const range =
    studioInspectorLayoutFreeRange(
      studioInspectorMetrics,
      studioInspectorSelection.rect
    );

  event.preventDefault();
  event.stopPropagation();

  const params =
    layout.item.params;

  studioInspectorLayoutDrag = {
    pointerId: event.pointerId,
    handle,
    scale: mapped.scale,
    startX: event.clientX,
    startY: event.clientY,
    range,
    originX: params.x === undefined ? 0 : Number(params.x),
    originY: params.y === undefined ? 0 : Number(params.y),
    x: params.x === undefined ? "0" : params.x,
    y: params.y === undefined ? "0" : params.y,
    frame: 0
  };

  try {
    handle.setPointerCapture(event.pointerId);
  } catch (err) {
    /* 캡처가 안 되는 환경에서도 document 리스너가 move/up 을 받는다 */
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.add("is-dragging");
  }

}

function moveStudioInspectorLayoutDrag(event) {

  const drag =
    studioInspectorLayoutDrag;

  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  event.preventDefault();

  const dx =
    drag.range.x > 0
      ? ((event.clientX - drag.startX) / drag.scale) / drag.range.x
      : 0;

  const dy =
    drag.range.y > 0
      ? ((event.clientY - drag.startY) / drag.scale) / drag.range.y
      : 0;

  const nextX =
    studioInspectorLayoutRatio(drag.originX + dx);

  const nextY =
    studioInspectorLayoutRatio(drag.originY + dy);

  if (nextX === drag.x && nextY === drag.y) {
    return;
  }

  drag.x = nextX;
  drag.y = nextY;

  /* pointermove 마다 postMessage 를 쏘지 않는다 — 한 프레임에 한 번 */
  if (!drag.frame) {

    drag.frame =
      window.requestAnimationFrame(() => {

        drag.frame = 0;

        if (studioInspectorLayoutDrag !== drag) {
          return;
        }

        /* 프레임은 이 두 값을 그대로 custom property 로 써 넣는다
           (skin/skin-layout.css 가 읽는 바로 그 이름). 즉 임시
           미리보기와 확정 결과가 **같은 계산**을 지난다. */
        /* DIRECT-UX-1 — editId 를 함께 싣는다. 예전에는 빠져 있어서
           프레임(applyInspectorPreview)이 "고른 요소와 다르다"로 읽고
           미리보기를 버렸다 — 끄는 동안 요소가 제자리에 있다가 손을
           뗄 때 한 번에 뛰었다. */
        sendStudioInspectorPreview({
          editId: studioInspectorSelection ? studioInspectorSelection.editId : null,
          layoutPosition: { x: drag.x, y: drag.y }
        });

      });

  }

}

function endStudioInspectorLayoutDrag(event) {

  const drag =
    studioInspectorLayoutDrag;

  if (!drag || (event && event.pointerId !== drag.pointerId)) {
    return;
  }

  studioInspectorLayoutDrag = null;

  if (drag.frame) {
    window.cancelAnimationFrame(drag.frame);
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.remove("is-dragging");
  }

  /* DIRECT-UX-1 — 제자리로 돌아왔으면(또는 한 칸도 못 움직였으면)
     확정하지 않는다. 바뀐 것이 없는 편집이 ↶ 한 칸을 차지하면
     "되돌렸는데 아무 일도 없다"가 된다. */
  if (
    drag.x === studioInspectorLayoutRatio(drag.originX) &&
    drag.y === studioInspectorLayoutRatio(drag.originY)
  ) {

    clearStudioInspectorPreview();

    return;

  }

  /* 한 번의 편집으로 두 축을 함께 확정한다 — 따로 확정하면 Undo 가
     두 칸이 되고, 가운데 상태(가로만 옮겨진 자리)가 저장에 남는다. */
  applyStudioInspectorPatch((element) => {

    element.setAttribute(SKIN_LAYOUT_ITEM_PREFIX + "x", drag.x);
    element.setAttribute(SKIN_LAYOUT_ITEM_PREFIX + "y", drag.y);

    return {};

  });

}

function cancelStudioInspectorLayoutDrag() {

  const drag =
    studioInspectorLayoutDrag;

  if (!drag) {
    return;
  }

  studioInspectorLayoutDrag = null;

  if (drag.frame) {
    window.cancelAnimationFrame(drag.frame);
  }

  if (studioInspectorLayer) {
    studioInspectorLayer.classList.remove("is-dragging");
  }

  /* 임시로 옮겨 둔 자리를 원래대로 되돌린다 — 확정하지 않았으므로
     working draft 는 처음부터 한 글자도 바뀌지 않았다. */
  clearStudioInspectorPreview();

}

/* =========================================================
   "이 선택이 이동 손잡이를 가질 자격이 있는가"

   ★ 결과를 studioInspectorMovable 에 **미리 넣어 둔다**. 좌표
     칠하기는 스크롤·리사이즈·프레임 메시지마다 도는데, 그 자리에서
     매번 판단하면 template 을 통째로 다시 파싱하게 된다
     (describeStudioInspectorSelection). 그렇게 두었더니 Studio 가
     느려져 다른 e2e 가 선택을 기다리다 시간 초과로 깨졌다
     (2026-09-18). studioInspectorResizable 이 같은 이유로 같은
     모양인 값이다.

   sandbox 프레임 안 선택은 프레임이 부모 안쪽 폭/높이(metrics)를
   보내 왔을 때만 단다(SANDBOX-SELECT-PARITY-1) — 그 값이 비율을
   세우는 기준이다. 없으면 끌 수 없다(지어내지 않는다).
========================================================== */

function resolveStudioInspectorMovable(resolved) {

  if (
    !studioInspectorEnabled ||
    !studioInspectorSelection ||
    !resolved ||
    !resolved.info ||
    !resolved.info.layout
  ) {
    return false;
  }

  if (
    studioInspectorRemoteOverlay &&
    !(studioInspectorMetrics && studioInspectorMetrics.parentWidth > 0 && studioInspectorMetrics.parentHeight > 0)
  ) {
    return false;
  }

  return resolved.info.layout.parentType === "free";

}


/* =========================================================
   폼 — 팝오버의 "배치" 구역

   studio-inspector-controls.js 가 type:"layoutBlock" 스펙을 만나면
   이 함수를 부른다. 폼을 여기서 그리는 이유는 행 수가 고른 값에
   따라 달라지기 때문이다(격자와 사이드바가 요구하는 칸이 다르다).
========================================================== */

function studioInspectorLayoutSelect(labelText, value, options, onChange) {

  const select =
    document.createElement("select");

  select.className =
    "studio-inspector-input studio-inspector-select";

  options.forEach(([optionValue, optionLabel]) => {

    const option =
      document.createElement("option");

    option.value = optionValue;
    option.textContent = optionLabel;

    select.appendChild(option);

  });

  select.value =
    value;

  select.addEventListener("change", () => onChange(select.value));

  appendStudioInspectorRow(labelText, select);

  return select;

}

function studioInspectorLayoutNumber(labelText, value, rule, onChange, options) {

  const input =
    document.createElement("input");

  input.type = "number";
  input.className = "studio-inspector-input studio-inspector-input--number";
  input.placeholder = "기본";

  if (rule && rule.kind === "int") {
    input.min = String(rule.min);
    input.max = String(rule.max);
  }

  if (options && options.percent) {
    input.min = "0";
    input.max = "100";
  }

  input.value =
    value;

  input.addEventListener("change", () => onChange(input.value));

  appendStudioInspectorRow(
    labelText,
    input,
    () => onChange("")
  );

  return input;

}

function renderStudioInspectorLayoutParam(layout, name) {

  const field =
    STUDIO_LAYOUT_PARAM_FIELDS[name];

  if (!field) {
    return;
  }

  const current =
    layout.params[name] === undefined ? "" : layout.params[name];

  if (field.options) {

    studioInspectorLayoutSelect(
      field.label,
      current,
      [["", "기본"]].concat(field.options),
      (value) => commitStudioInspectorLayoutParam(name, value)
    );

    return;

  }

  studioInspectorLayoutNumber(
    field.unit ? `${field.label} (${field.unit})` : field.label,
    current,
    SKIN_LAYOUT_PARAM_RULES[name],
    (value) => commitStudioInspectorLayoutParam(name, value)
  );

}

function renderStudioInspectorLayoutItemParam(layout, name) {

  const field =
    STUDIO_LAYOUT_ITEM_FIELDS[name];

  if (!field) {
    return;
  }

  const raw =
    layout.item.params[name];

  /* 자유 배치의 좌표는 0~1 비율로 저장되지만 사람에게는 % 로
     보여 준다 — "0.25"보다 "25"가 읽힌다. 되돌릴 때 같은 정밀도로
     자르므로 왕복해도 값이 흔들리지 않는다. */
  if (field.percent) {

    studioInspectorLayoutNumber(
      `${field.label} (%)`,
      raw === undefined ? "" : String(Math.round(Number(raw) * 100)),
      null,
      (value) => {

        const trimmed =
          String(value).trim();

        if (!trimmed) {
          commitStudioInspectorLayoutItemParam(name, "");
          return;
        }

        const percent =
          Math.min(100, Math.max(0, Number(trimmed)));

        if (!Number.isFinite(percent)) {
          return;
        }

        commitStudioInspectorLayoutItemParam(
          name,
          studioInspectorLayoutRatio(percent / 100)
        );

      },
      { percent: true }
    );

    return;

  }

  studioInspectorLayoutNumber(
    field.unit ? `${field.label} (${field.unit})` : field.label,
    raw === undefined ? "" : raw,
    SKIN_LAYOUT_ITEM_RULES[name],
    (value) => commitStudioInspectorLayoutItemParam(name, value)
  );

}

function renderStudioInspectorLayoutOrder(layout) {

  const group =
    document.createElement("div");

  group.className =
    "studio-inspector-layout-order";

  [["up", "↑", -1, "앞으로"], ["down", "↓", 1, "뒤로"]].forEach(
    ([key, glyph, delta, name]) => {

      const button =
        document.createElement("button");

      button.type = "button";
      button.className = "studio-inspector-clear studio-inspector-layout-order-button";
      button.id = `studioInspectorLayoutOrder-${key}`;
      button.dataset.inspectorLayoutOrder = key;
      button.textContent = glyph;
      button.setAttribute("aria-label", `${name}으로 옮기기`);

      button.disabled =
        delta < 0
          ? layout.index <= 0
          : layout.index >= layout.siblingCount - 1;

      button.addEventListener("click", () => moveStudioInspectorLayoutChild(delta));

      group.appendChild(button);

    }
  );

  appendStudioInspectorRow("순서", group);

}

function renderStudioInspectorLayoutBlock(spec, info) {

  const layout =
    info.layout;

  if (!layout) {
    return;
  }

  /* 1) 이 요소 자신의 배치 */

  if (info.capabilities.layout) {

    const currentChoice =
      layout.type === "stack"
        ? `stack:${layout.params.direction || "column"}`
        : (layout.type || "");

    studioInspectorLayoutSelect(
      spec.label,
      currentChoice,
      STUDIO_LAYOUT_CHOICES.map((choice) => [choice.value, choice.label]),
      (value) => commitStudioInspectorLayoutType(value)
    );

    /* direction 은 위 선택으로 이미 정해졌다 — 같은 값을 두 칸에
       두면 어느 쪽이 이기는지 사용자가 알 수 없다. */
    layout.typeParams
      .filter((name) => name !== "direction")
      .forEach((name) => renderStudioInspectorLayoutParam(layout, name));

  }

  /* 2) 부모 배치 안에서 이 요소의 자리 */

  if (info.capabilities.layoutItem) {

    if (layout.parentType === "sidebar") {

      studioInspectorLayoutSelect(
        "영역",
        layout.item.slot || "",
        [["", "본문"], ["sidebar", "사이드바"], ["main", "본문"]],
        (value) => commitStudioInspectorLayoutSlot(value)
      );

    }

    layout.itemParams.forEach(
      (name) => renderStudioInspectorLayoutItemParam(layout, name)
    );

  }

  /* 3) 순서 */

  if (info.capabilities.reorder) {
    renderStudioInspectorLayoutOrder(layout);
  }

}


/* =========================================================
   이동 손잡이 그리기 — overlay 의 paintStudioInspectorHandles() 가
   좌표를 줄 때마다 부른다(자르기 핸들과 같은 방식).

   자리는 선택 테두리의 **왼쪽 위 바깥**이다. 사각형이 Preview
   영역 밖으로 스크롤돼 나갔으면 손잡이도 내린다 — 보이지 않는
   자리를 잡게 두지 않는다.
========================================================== */

function paintStudioInspectorMoveHandle(rect) {

  if (!studioInspectorMoveHandle) {
    return;
  }

  if (!rect || !studioInspectorMovable) {
    studioInspectorMoveHandle.hidden = true;
    return;
  }

  const mapped =
    studioInspectorMapRectRaw(rect);

  if (!mapped) {
    studioInspectorMoveHandle.hidden = true;
    return;
  }

  const inside =
    mapped.left >= mapped.frame.left - 1 &&
    mapped.left <= mapped.frame.right + 1 &&
    mapped.top >= mapped.frame.top - 1 &&
    mapped.top <= mapped.frame.bottom + 1;

  if (!inside) {
    studioInspectorMoveHandle.hidden = true;
    return;
  }

  studioInspectorMoveHandle.style.left = `${mapped.left}px`;
  studioInspectorMoveHandle.style.top = `${mapped.top}px`;

  studioInspectorMoveHandle.hidden = false;

}


/* =========================================================
   본체 끌기 (DIRECT-UX-1 §7)

   자유 배치 안의 요소는 손잡이(✥)뿐 아니라 **본체**를 끌어도
   움직인다. 포인터는 Preview 프레임 안에 있으므로 이 문서에는
   pointer 이벤트가 오지 않는다 — 프레임이 좌표만 올려보내고
   (preview:inspect-drag, studio/preview/preview-inspect-direct.js),
   여기서 그 좌표를 이 문서 좌표로 옮겨 **위 손잡이 드래그와 같은
   함수**에 넣는다. 계산 · 임시 미리보기 · 손을 뗄 때 한 번 확정이
   전부 같다(↶ 한 칸).

   좌표 변환은 overlay 의 테두리와 같은 식이다(Mobile 축소 배율 ·
   프레임 테두리 포함, studioInspectorFrameGeometry).
========================================================== */

const STUDIO_INSPECTOR_FRAME_POINTER = "preview-frame";


function handleStudioInspectorFrameDrag(data) {

  if (!data || typeof data.phase !== "string") {
    return;
  }

  if (data.phase === "cancel") {

    if (studioInspectorLayoutDrag && studioInspectorLayoutDrag.pointerId === STUDIO_INSPECTOR_FRAME_POINTER) {
      cancelStudioInspectorLayoutDrag();
    }

    return;

  }

  const x = Number(data.x);
  const y = Number(data.y);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !studioInspectorFrame) {
    return;
  }

  const geometry =
    studioInspectorFrameGeometry();

  const pointer = {
    pointerId: STUDIO_INSPECTOR_FRAME_POINTER,
    clientX: geometry.box.left + (geometry.borderLeft + x) * geometry.scale,
    clientY: geometry.box.top + (geometry.borderTop + y) * geometry.scale,
    preventDefault() {},
    stopPropagation() {}
  };

  if (data.phase === "start") {

    if (!studioInspectorMovable || !studioInspectorMoveHandle) {
      return;
    }

    beginStudioInspectorLayoutDrag(pointer, studioInspectorMoveHandle);

    /* 포인터는 프레임이 잡고 있다 — 레이어가 포인터를 가로채면
       안 된다(손잡이 드래그와 다른 점은 이것 하나다). */
    if (studioInspectorLayer) {
      studioInspectorLayer.classList.remove("is-dragging");
    }

    return;

  }

  if (!studioInspectorLayoutDrag || studioInspectorLayoutDrag.pointerId !== STUDIO_INSPECTOR_FRAME_POINTER) {
    return;
  }

  if (data.phase === "move") {
    moveStudioInspectorLayoutDrag(pointer);
    return;
  }

  if (data.phase === "end") {

    /* 마지막 좌표를 한 번 반영하고 확정한다 */
    moveStudioInspectorLayoutDrag(pointer);

    endStudioInspectorLayoutDrag(pointer);

  }

}


/*
  이동 손잡이의 move/up — 손잡이가 아니라 document 에서 받는다.
  이미지 모서리 드래그와 같은 이유다(포인터 캡처가 되든 안 되든
  document 까지는 올라온다). 드래그 중이 아니면 첫 줄에서 빠진다.
*/
document.addEventListener("pointermove", moveStudioInspectorLayoutDrag);

document.addEventListener("pointerup", endStudioInspectorLayoutDrag);

document.addEventListener("pointercancel", cancelStudioInspectorLayoutDrag);


if (typeof window !== "undefined") {

  window.commitStudioInspectorLayoutType = commitStudioInspectorLayoutType;
  window.commitStudioInspectorLayoutParam = commitStudioInspectorLayoutParam;
  window.commitStudioInspectorLayoutItemParam = commitStudioInspectorLayoutItemParam;
  window.commitStudioInspectorLayoutSlot = commitStudioInspectorLayoutSlot;
  window.moveStudioInspectorLayoutChild = moveStudioInspectorLayoutChild;

}
