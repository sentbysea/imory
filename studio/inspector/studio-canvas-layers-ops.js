/* =========================================================
   STUDIO — LAYERS 의 구조 동작 (STUDIO-LAYERS-STRUCTURE-1)

   계획 문서: docs/plans/IMORY_STUDIO_LAYERS_AND_CANVAS_TYPOGRAPHY_PLAN.md
              §2-3 · §2-4 · §2-5 · §2-6
   계약:      docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §32

   Layers 트리(studio-canvas-layers.js)와 끌기(studio-canvas-layers-drag.js)
   가 draft 에 닿을 때 지나는 **한 곳**이다.

   ── 이 파일에 없는 것 ──────────────────────────────────
     · draft 를 직접 고치는 줄이 한 줄도 없다. 전부
       commitStudioCanvasStructureNode() 로 간다(그 문이 편집 중 ·
       v2 · 대상 검증을 하고, 그 아래 순수 함수가 불변 수정과 전체
       재검증을 한다).
     · currentWorkingSkin 에 닿는 줄도 없다.
     · 구조를 담아 두는 배열도 없다. 트리는 그릴 때마다 draft 에서
       다시 만든다(계획 문서 §2-1).

   ── 왜 op 마다 말을 다르게 하는가 ──────────────────────
   같은 `reason` 이 동작마다 다른 뜻이다. `primary` 는 삭제에서는
   "대표 사진은 지울 수 없습니다"이고 눈 토글에서는 "대표 사진은
   숨길 수 없습니다"다. 그래서 표의 열쇠가 `op:reason` 이고, 없으면
   reason 하나로, 그것도 없으면 Canvas Inspector 의 표로 내려간다
   (studio-canvas-inspector.js STUDIO_CANVAS_REJECT_MESSAGES).
========================================================== */


/* op 별로 말이 달라지는 자리 — 열쇠는 `op:reason` 이다 */
const STUDIO_CANVAS_LAYERS_REJECT = {

  /* ── 순서 ── */
  "reorder:expected":
    "그 사이 순서가 바뀌었습니다 — 목록을 다시 보고 끌어 주세요.",
  "reorder:parent":
    "그 사이 이 요소의 소속이 바뀌었습니다 — 목록을 다시 보고 끌어 주세요.",
  "reorder:kind":
    "그 사이 이 요소가 달라졌습니다 — 목록을 다시 보고 끌어 주세요.",
  "reorder:range":
    "그 자리로는 옮길 수 없습니다.",
  "reorder:order":
    "그 자리로는 옮길 수 없습니다.",

  /* ── 대표 사진 ── */
  "primary:type":
    "대표 사진이 될 수 있는 것은 메인 비주얼 안의 사진뿐입니다.",
  "primary:kind":
    "대표 사진이 될 수 있는 것은 메인 비주얼 안의 사진뿐입니다.",
  "primary:parent":
    "다른 메인 비주얼의 사진은 이 프레임의 대표가 될 수 없습니다.",
  "primary:hidden":
    "숨긴 사진은 대표 사진이 될 수 없습니다 — 먼저 눈을 켜 주세요.",

  /* ── 숨김 · 잠금 ── */
  "flag:primary":
    "대표 사진은 숨길 수 없습니다 — 먼저 다른 사진을 대표로 지정해 주세요.",

  /* ── 소속 · 삭제 ── */
  "attach:kind":
    "메인 비주얼에 넣을 수 있는 것은 페이지 장식뿐입니다.",
  "detach:kind":
    "페이지 장식으로 뺄 수 있는 것은 메인 비주얼 안의 요소뿐입니다.",
  "attach:layout":
    "메인 비주얼이 지금 화면의 어디에 있는지 아직 모릅니다 — 잠시 뒤에 다시 끌어 주세요.",
  "detach:layout":
    "메인 비주얼이 지금 화면의 어디에 있는지 아직 모릅니다 — 잠시 뒤에 다시 끌어 주세요.",

  /* ── HOME-CANVAS-GROUP-1A — 그룹 ── */
  "group-create:count":
    "그룹으로 묶으려면 요소를 2개 이상 골라 주세요.",
  "group-create:limit":
    "한 번에 묶을 수 있는 요소는 64개까지입니다.",
  "group-create:space":
    "좌표 공간이 다른 요소는 함께 묶을 수 없습니다 — 페이지 장식끼리, 또는 같은 메인 비주얼 안의 요소끼리 골라 주세요.",
  "group-create:kind":
    "자동 배치 블록과 메인 비주얼 자체는 그룹으로 묶을 수 없습니다 — 그것들에는 좌표가 없습니다.",
  "group-create:member":
    "이미 다른 그룹에 들어 있는 요소가 있습니다 — 먼저 그 그룹에서 빼 주세요.",
  "group-create:dupe":
    "같은 요소를 두 번 묶을 수 없습니다.",
  "group-create:selection":
    "고른 것이 그 사이 바뀌었습니다 — 다시 골라 주세요.",

  "group-join:space":
    "좌표 공간이 달라 이 그룹에 넣을 수 없습니다 — 같은 공간의 요소끼리만 한 그룹이 됩니다.",
  "group-join:kind":
    "자동 배치 블록과 메인 비주얼 자체는 그룹에 넣을 수 없습니다.",
  "group-join:nest":
    "그룹을 다른 그룹 안에 넣을 수 없습니다.",
  "group-join:group":
    "그 그룹이 목록에서 사라졌습니다 — 목록을 다시 보고 해 주세요.",

  "group-rename:name":
    "그룹 이름은 1~40자여야 합니다.",

  "group-remove:primary":
    "이 그룹에는 대표 사진이 들어 있어 통째로 지울 수 없습니다 — 먼저 다른 사진을 대표로 지정하거나 그 사진을 그룹에서 빼 주세요.",

  "group":
    "그 그룹이 목록에서 사라졌습니다 — 목록을 다시 보고 해 주세요.",

  /* ── 공통 ── */
  "element":
    "그 요소가 목록에서 사라졌습니다 — 목록을 다시 보고 해 주세요.",
  "selection":
    "그 요소가 목록에서 사라졌습니다 — 목록을 다시 보고 해 주세요.",
  "via":
    "이 목록에서는 할 수 없는 동작입니다.",
  "flag":
    "이 요소에는 그 표시를 줄 수 없습니다.",
  "canvas":
    "이 HOME 은 캔버스(v2)가 아닙니다."
};


function studioCanvasLayersRejectText(op, reason) {

  const key =
    `${op}:${reason}`;

  if (Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_LAYERS_REJECT, key)) {
    return STUDIO_CANVAS_LAYERS_REJECT[key];
  }

  if (Object.prototype.hasOwnProperty.call(STUDIO_CANVAS_LAYERS_REJECT, reason)) {
    return STUDIO_CANVAS_LAYERS_REJECT[reason];
  }

  /* Canvas Inspector 의 표 하나를 그대로 쓴다 — 같은 이유를 두 벌
     적지 않는다(layout · limit · invalid · not-editing …) */
  if (typeof studioCanvasInspectorRejectText === "function") {
    return studioCanvasInspectorRejectText(reason);
  }

  return "이 동작을 할 수 없습니다.";

}


/* =========================================================
   1. 문 하나 — 모든 구조 동작이 여기를 지난다

   ★ `via: "layers"` 를 붙인다. Layers 의 행은 자기 id 를 적고 있고
     지금 draft 에서 만들어졌으므로, "지금 고른 것 하나"를 요구하는
     Inspector 의 규칙 대신 "그 id 가 draft 에 있는가"를 본다
     (계약 §32-3). 그래야 고르지 않은 행의 눈 · 자물쇠 · 삭제를
     누를 수 있고, 숨긴 것을 다시 켜는 길이 열린다.
========================================================== */

function runStudioCanvasLayersOp(request) {

  if (typeof window.commitStudioCanvasStructureNode !== "function") {
    return { accepted: false, reason: "unsupported", message: "" };
  }

  const result =
    window.commitStudioCanvasStructureNode({ ...request, via: "layers" });

  if (result && result.accepted) {
    return {
      accepted: true,
      unchanged: result.unchanged === true,
      message: ""
    };
  }

  return {
    accepted: false,
    reason: (result && result.reason) || "rejected",
    message: studioCanvasLayersRejectText(
      request.op,
      (result && result.reason) || "rejected"
    )
  };

}


/* =========================================================
   2. 여섯 동작

   전부 같은 모양이다 — 요청을 만들고, 문 하나를 지나고, 거절이면
   이유를 문장으로 돌려준다. **성공한 한 번이 Undo 한 칸**이고
   (그 칸은 studio/studio-preview.js 의 다섯 줄이 만든다), 변화가
   없으면 `unchanged` 라 기록도 dirty 도 생기지 않는다.
========================================================== */

/*
  studioCanvasLayersReorder(row, index)

    row    끌기를 시작할 때 본 행 { id, kind, parentId, index }
    index  옮겨 갈 자리

  ★ **시작할 때 본 자리를 함께 보낸다.** 그 사이 Undo · AI · Code 가
    배열을 바꿨으면 그 행이 가리키던 자리는 이미 다른 것의 자리다
    (계약 §32-4).
*/
function studioCanvasLayersReorder(row, index) {

  return runStudioCanvasLayersOp({
    op: "reorder",
    id: row.id,
    kind: row.kind,
    parentId: row.parentId || "",
    index: index,
    expected: { index: row.index }
  });

}


/* overlay 하나를 그 `main_visual` 안으로 — 기존 묶기 경로 그대로다
   (자리 계산은 planStudioCanvasV2Attach, 계약 §28-4) */
function studioCanvasLayersAttach(id, frameId) {

  return runStudioCanvasLayersOp({ op: "attach", id: id, frameId: frameId });

}


/* 프레임 안의 요소 하나를 페이지 장식으로 — 기존 빼기 경로 그대로다 */
function studioCanvasLayersDetach(id) {

  return runStudioCanvasLayersOp({ op: "detach", id: id });

}


/* 그 프레임의 대표 사진을 이 사진으로. 옛 대표는 남는다 */
function studioCanvasLayersPrimary(id, frameId) {

  return runStudioCanvasLayersOp({ op: "primary", id: id, frameId: frameId });

}


/* 눈 · 자물쇠 한 칸 */
function studioCanvasLayersFlag(id, flag, on) {

  return runStudioCanvasLayersOp({
    op: "flag",
    id: id,
    flag: flag,
    on: !!on
  });

}


/* =========================================================
   3. 삭제 — 프레임은 자식 수를 보여 주고 한 번 묻는다

   ★ 계약이 이미 그렇게 말한다 — "블록을 지우면 그 안의 장식도 함께
     없어진다"(§28-5). 그 숫자를 보여 주지 않으면 주인은 메인 비주얼
     하나만 지운다고 읽는다.

   ★ 묻고 취소하면 **기록 0 칸**이다. 그래서 확인은 문 앞에서 한다 —
     draft 에 닿은 뒤에 되돌리지 않는다.

   ★ 대표 사진처럼 지울 수 없는 것은 묻지 않고 이유를 보여 준다.
     순수 함수가 이름 있는 이유(`primary`)로 먼저 막는다(§28-5).
========================================================== */

/* =========================================================
   4. 그룹 (HOME-CANVAS-GROUP-1A)

   계약: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §38

   ★ 위 여섯과 **같은 문 하나**를 지난다. 그룹이라고 다른 길을
     내지 않는다 — 대상이 요소가 아니라 그룹일 뿐이고, 그 판정은
     관문이 op 별로 한다(studio-canvas-selection.js).

   ★ 좌표를 한 칸도 쓰지 않는다. 만들기 · 해제 · 넣기 · 빼기 ·
     이름 변경은 `canvas.groups` 만 건드리므로 화면이 바이트 단위로
     그대로다(계약 §38-1).
========================================================== */

/*
  studioCanvasLayersGroupCreate(ids)

  ids 를 주지 않으면 **지금 고른 것**을 묶는다. 그때는
  `via:"selection"` 이라 관문이 "화면에 보이는 그 선택인가"를
  대조한다 — Layers 의 단추도 Inspector 의 단추도 같은 문이다.
*/
function studioCanvasLayersGroupCreate(ids) {

  const wanted =
    Array.isArray(ids) && ids.length
      ? ids.slice()
      : (
          (typeof window.getStudioCanvasSelection === "function")
            ? window.getStudioCanvasSelection().ids.slice()
            : []
        );

  if (typeof window.commitStudioCanvasStructureNode !== "function") {
    return { accepted: false, reason: "unsupported", message: "" };
  }

  /* ★ 여기만 `via:"selection"` 이다. 묶을 대상이 곧 **지금 고른
     것**이므로, 화면에 보이는 것과 바뀌는 것을 어긋나게 두지
     않는다(계약 §38-3). */
  const result =
    window.commitStudioCanvasStructureNode({
      op: "group-create",
      ids: wanted,
      via: "selection"
    });

  if (result && result.accepted) {
    return { accepted: true, id: result.id, name: result.name, message: "" };
  }

  return {
    accepted: false,
    reason: (result && result.reason) || "rejected",
    message: studioCanvasLayersRejectText(
      "group-create", (result && result.reason) || "rejected"
    )
  };

}


/* 폴더만 없앤다 — 자식은 모두 그대로 남는다(계약 §38-7) */
function studioCanvasLayersGroupDissolve(groupId) {

  return runStudioCanvasLayersOp({ op: "group-dissolve", id: groupId });

}


/* 기존 레이어 하나를 그 그룹에 넣는다(다른 그룹에서 옮기는 것도
   이 요청 하나다 — 계약 §38-5) */
function studioCanvasLayersGroupJoin(id, groupId) {

  return runStudioCanvasLayersOp({
    op: "group-join",
    id: id,
    groupId: groupId
  });

}


/* 그룹에서 뺀다 — 배열 자리는 그대로라 화면이 안 바뀐다 */
function studioCanvasLayersGroupLeave(id) {

  return runStudioCanvasLayersOp({ op: "group-leave", id: id });

}


/* 이름만 바꾼다 — 요소 id 도 member 참조도 그대로다 */
function studioCanvasLayersGroupRename(groupId, name) {

  return runStudioCanvasLayersOp({
    op: "group-rename",
    id: groupId,
    name: name
  });

}


/*
  studioCanvasLayersGroupRemove(groupId, options)

  **그룹과 그 안의 요소를 모두** 지운다. 해제와 다른 동작이므로
  글자로 그 둘을 가르고(계약 §38-7) 한 번 묻는다.

  ★ 묻고 취소하면 기록 0 칸이다 — 확인은 문 앞에서 한다.
*/
function studioCanvasLayersGroupRemove(groupId, options) {

  const ask =
    !(options && options.confirm === false);

  if (ask) {

    const info =
      (typeof window.studioCanvasGroupInfo === "function")
        ? window.studioCanvasGroupInfo(groupId)
        : null;

    const label =
      (info && info.name) ? `"${info.name}"` : "이 그룹";

    const count =
      info ? info.live.length : 0;

    const ok =
      window.confirm(
        `${label} 과 그 안의 요소 ${count}개를 함께 지웁니다.\n` +
        "폴더만 없애고 요소는 남기려면 [그룹 해제] 를 쓰세요.\n" +
        "되돌리려면 Undo(↶) 를 누르면 됩니다."
      );

    if (!ok) {
      return { accepted: false, reason: "cancelled", message: "" };
    }

  }

  return runStudioCanvasLayersOp({ op: "group-remove", id: groupId });

}


function studioCanvasLayersRemove(row, options) {

  const ask =
    !(options && options.confirm === false);

  /* main_visual 이면 자식이 몇인가 — 지금 draft 에서 센다 */
  if (
    ask &&
    row.kind === "block" &&
    row.type === "main_visual" &&
    typeof window.studioCanvasNodeInfo === "function"
  ) {

    const info =
      window.studioCanvasNodeInfo(row.id);

    const inner =
      (info && info.node && info.node.props && Array.isArray(info.node.props.elements))
        ? info.node.props.elements.length
        : 0;

    const ok =
      window.confirm(
        `메인 비주얼을 지우면 그 안의 요소 ${inner}개도 함께 없어집니다. 지울까요?`
      );

    if (!ok) {
      return { accepted: false, reason: "cancelled", message: "" };
    }

  }

  return runStudioCanvasLayersOp({ op: "remove", id: row.id });

}


if (typeof window !== "undefined") {

  window.studioCanvasLayersRejectText = studioCanvasLayersRejectText;
  window.studioCanvasLayersReorder = studioCanvasLayersReorder;
  window.studioCanvasLayersAttach = studioCanvasLayersAttach;
  window.studioCanvasLayersDetach = studioCanvasLayersDetach;
  window.studioCanvasLayersPrimary = studioCanvasLayersPrimary;
  window.studioCanvasLayersFlag = studioCanvasLayersFlag;
  window.studioCanvasLayersRemove = studioCanvasLayersRemove;

  /* HOME-CANVAS-GROUP-1A — 영구 그룹 여섯 */
  window.studioCanvasLayersGroupCreate = studioCanvasLayersGroupCreate;
  window.studioCanvasLayersGroupDissolve = studioCanvasLayersGroupDissolve;
  window.studioCanvasLayersGroupJoin = studioCanvasLayersGroupJoin;
  window.studioCanvasLayersGroupLeave = studioCanvasLayersGroupLeave;
  window.studioCanvasLayersGroupRename = studioCanvasLayersGroupRename;
  window.studioCanvasLayersGroupRemove = studioCanvasLayersGroupRemove;

}
