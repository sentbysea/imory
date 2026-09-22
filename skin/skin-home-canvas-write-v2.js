/* =========================================================
   SKIN HOME CANVAS — v2(조합형) Canvas 의 **트리 탐색과 불변 쓰기**
   (HOME-CANVAS-V2-EDITOR-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §25
   로드맵:    docs/plans/IMORY_HOME_CANVAS_ROADMAP.md §14 (PLAN)

   ── 왜 v1 writer 와 같은 파일이 아닌가 ──────────────────
   skin/skin-home-canvas-write.js 는 **`canvas.elements` 하나**를
   찾는다 — version 을 보지 않고, 그 칸이 없다는 것이 곧 "v2 데이터에
   닿을 수 없다"의 근거다(§14-9 함정 2). 그 판정을 무르면 v1 writer 가
   v2 데이터를 반쯤 고칠 길이 생긴다. 그래서 v2 는 **자기 writer** 를
   갖고, 두 파일은 서로를 부르지 않는다.

   읽기(검증 · 실행 payload)는 skin/skin-home-canvas-v2.js 이고, 이
   파일은 그 계약을 **고치는 쪽**이다. 갈라진 자리는 v1 과 같다
   (skin-home-canvas.js ↔ skin-home-canvas-write.js).

   ── 여기 있는 것 ───────────────────────────────────────

     findSkinHomeCanvasV2Node        id 하나로 v2 트리에서 찾기
     listSkinHomeCanvasV2Nodes       고를 수 있는 것 전부(화면 순서)
     writeSkinHomeCanvasV2NodeFields 공용 불변 수정 **한 곳**
     writeSkinHomeCanvasV2BlockAlign     align
     writeSkinHomeCanvasV2BlockWidth     width
     writeSkinHomeCanvasV2BlockHeight    height (숫자 또는 "auto")
     writeSkinHomeCanvasV2BlockMargin    margin 네 칸
     writeSkinHomeCanvasV2NodeText       props.text
     writeSkinHomeCanvasV2BlockOrder     flow.blocks 안의 자리

   ── 한 이름 공간 ───────────────────────────────────────
   블록 id · `main_visual` 내부 요소 id · overlay id 가 **전부
   유일**하다(§14-5). 그래서 이 파일의 모든 함수는 id 하나만 받고
   "어디에 있는 것인가"는 스스로 찾는다 — 부르는 쪽이 경로를 들고
   다니면 그 경로가 낡는 순간 엉뚱한 노드를 고친다.

   ── 무엇을 보존하는가 ──────────────────────────────────
   바뀌는 칸 밖은 **전부 그대로** 새 객체로 옮긴다 — regions 의 모르는
   항목 · 항목의 모르는 칸 · canvas 의 모르는 칸(`overlays` 포함) ·
   flow 의 모르는 칸 · 다른 블록(같은 참조) · 그 블록의 모르는 칸 ·
   `props` 의 모르는 칸 · `main_visual` 내부 배열의 다른 요소 ·
   **배열 순서**. 입력은 한 칸도 mutate 하지 않는다(Undo 가 들고 있는
   직전 스냅샷이 이 호출로 바뀌면 안 된다 — studio/studio-history.js).

   ★ 판정(무엇이 유효한 align 인가 · `"auto"` 를 쓸 수 있는 블록
     종류는 무엇인가)은 skin/skin-home-canvas-v2.js 의 값 표 하나를
     본다. 여기서 새 규칙을 만들지 않는다 — 조용히 고치지 않는 것이
     §9 다.

   ★ 이 파일은 skin/skin-home-canvas.js · skin-home-canvas-v2.js
     **다음에** 로드된다(값 표와 작은 도구를 call time 에 찾는다).
========================================================== */


/* =========================================================
   1. 트리 탐색 — id 하나로 무엇이든 찾는다

   findSkinHomeCanvasV2Node(canvas, id) -> 찾은 것 | null

     {
       kind      : "block" | "frame-element" | "overlay"
       node      : 그 객체(참조)
       index     : 자기 배열 안의 자리
       parentId  : frame-element 일 때 그 프레임 블록의 id
     }

   ★ `kind` 가 "무엇을 고칠 수 있는가"를 정한다. 블록은 흐름 안의
     자리(순서 · 정렬 · 여백 · 폭 · 높이)를 갖고, 프레임 내부 요소와
     overlay 는 좌표를 갖는다(§14-10 의 책임 표).
========================================================== */

function findSkinHomeCanvasV2Node(canvas, id) {

  if (
    !isSkinHomeCanvasPlainObject(canvas) ||
    typeof id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)
  ) {
    return null;
  }

  const flow =
    isSkinHomeCanvasPlainObject(canvas.flow) ? canvas.flow : null;

  const blocks =
    (flow && Array.isArray(flow.blocks)) ? flow.blocks : [];

  for (let i = 0; i < blocks.length; i += 1) {

    const block = blocks[i];

    if (!isSkinHomeCanvasPlainObject(block)) {
      continue;
    }

    if (block.id === id) {
      return { kind: "block", node: block, index: i, parentId: null };
    }

    /* `main_visual` 내부 — 프레임 한 단계뿐이다(§14-12) */
    const props =
      isSkinHomeCanvasPlainObject(block.props) ? block.props : null;

    const inner =
      (props && Array.isArray(props.elements)) ? props.elements : [];

    for (let k = 0; k < inner.length; k += 1) {

      if (isSkinHomeCanvasPlainObject(inner[k]) && inner[k].id === id) {
        return {
          kind: "frame-element",
          node: inner[k],
          index: k,
          parentId: typeof block.id === "string" ? block.id : null
        };
      }

    }

  }

  const overlays =
    Array.isArray(canvas.overlays) ? canvas.overlays : [];

  for (let i = 0; i < overlays.length; i += 1) {

    if (isSkinHomeCanvasPlainObject(overlays[i]) && overlays[i].id === id) {
      return { kind: "overlay", node: overlays[i], index: i, parentId: null };
    }

  }

  return null;

}


/*
  listSkinHomeCanvasV2Nodes(canvas) -> [{ id, kind, type, parentId }]

  고를 수 있는 것 전부를 **화면 순서**로 늘어놓는다.

    블록 하나 → 그 블록, 그리고 곧바로 그 프레임의 내부 요소들

  순서가 중요한 이유는 다중 선택의 정렬 기준이기 때문이다(§16-5 —
  프레임이 보낸 순서를 믿지 않고 이 순서로 다시 세운다). overlay 는
  흐름 뒤에 그려지므로 맨 뒤다.
*/
function listSkinHomeCanvasV2Nodes(canvas) {

  const out = [];

  if (!isSkinHomeCanvasPlainObject(canvas)) {
    return out;
  }

  const flow =
    isSkinHomeCanvasPlainObject(canvas.flow) ? canvas.flow : null;

  const blocks =
    (flow && Array.isArray(flow.blocks)) ? flow.blocks : [];

  blocks.forEach((block) => {

    if (!isSkinHomeCanvasPlainObject(block) || typeof block.id !== "string") {
      return;
    }

    out.push({
      id: block.id,
      kind: "block",
      type: block.type,
      parentId: null
    });

    const props =
      isSkinHomeCanvasPlainObject(block.props) ? block.props : null;

    const inner =
      (props && Array.isArray(props.elements)) ? props.elements : [];

    inner.forEach((element) => {

      if (!isSkinHomeCanvasPlainObject(element) || typeof element.id !== "string") {
        return;
      }

      out.push({
        id: element.id,
        kind: "frame-element",
        type: element.type,
        parentId: block.id
      });

    });

  });

  (Array.isArray(canvas.overlays) ? canvas.overlays : []).forEach((element) => {

    if (!isSkinHomeCanvasPlainObject(element) || typeof element.id !== "string") {
      return;
    }

    out.push({
      id: element.id,
      kind: "overlay",
      type: element.type,
      parentId: null
    });

  });

  return out;

}


/* =========================================================
   2. 불변 수정 — 한 곳

   writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, spec)

     -> { ok: true,  regions, previous: { ...그 칸들 } }
     -> { ok: true,  regions, previous, unchanged: true }
     -> { ok: false, reason }

   v1 의 writeSkinHomeCanvasElementFields() 와 **같은 규약**이다 —
   허용 키 정확 일치 · `expected` 정확 일치 · 값 검사는 노드를 찾은
   뒤 · 같은 값이면 `unchanged`. 다른 것은 "어느 배열 안에 있는가"를
   찾아 그 길만 새로 만든다는 것뿐이다.

   ★ `expected` 를 주면 **지금 값과 정확히 같을 때만** 쓴다. 패널에
     보이는 값과 draft 가 어긋나 있으면(그 사이의 Undo · Import · AI)
     쓰지 않고 거부한다.
========================================================== */

function writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, spec) {

  if (
    typeof id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)
  ) {
    return { ok: false, reason: "id" };
  }

  if (!isSkinHomeCanvasPlainObject(next)) {
    return { ok: false, reason: "shape" };
  }

  const keys =
    Object.keys(next);

  if (
    keys.length !== spec.keys.length ||
    spec.keys.some((key) => keys.indexOf(key) === -1)
  ) {
    return { ok: false, reason: "keys" };
  }

  const found =
    findSkinHomeCanvasRegion(regions);

  if (!found) {
    return { ok: false, reason: "region" };
  }

  const canvas =
    found.entry.canvas;

  if (
    !isSkinHomeCanvasPlainObject(canvas) ||
    canvas.version !== SKIN_HOME_CANVAS_V2_VERSION
  ) {
    return { ok: false, reason: "canvas" };
  }

  const hit =
    findSkinHomeCanvasV2Node(canvas, id);

  if (!hit) {
    return { ok: false, reason: "missing" };
  }

  /* 이 spec 이 손댈 수 있는 자리인가(블록만 · 어디서나 …) */
  if (
    Array.isArray(spec.kinds) &&
    spec.kinds.indexOf(hit.kind) === -1
  ) {
    return { ok: false, reason: "kind" };
  }

  const current =
    hit.node;

  /* 값 검사는 노드를 찾은 **뒤에** 한다 — `height:"auto"` 가
     허용되는지는 그 블록의 type 이 정한다(§14-4) */
  const nextReason =
    spec.checkNext(next, current, hit);

  if (nextReason) {
    return { ok: false, reason: nextReason };
  }

  const inProps =
    spec.container === "props";

  const owner =
    inProps
      ? (isSkinHomeCanvasPlainObject(current.props) ? current.props : {})
      : current;

  const readCurrent =
    (key) =>
      (typeof spec.readCurrent === "function")
        ? spec.readCurrent(current, key)
        : owner[key];

  const previous = {};

  spec.keys.forEach((key) => {
    previous[key] = readCurrent(key);
  });

  if (isSkinHomeCanvasPlainObject(expected)) {

    if (spec.keys.some((key) => expected[key] !== readCurrent(key))) {
      return { ok: false, reason: "expected" };
    }

  }

  if (spec.keys.every((key) => readCurrent(key) === next[key])) {
    return { ok: true, regions: regions, previous: previous, unchanged: true };
  }

  /* ── 바뀐 노드 하나를 새 객체로 ── */

  const nextNode =
    copySkinHomeCanvasObject(current);

  if (inProps) {

    const propsCopy =
      copySkinHomeCanvasObject(owner);

    spec.keys.forEach((key) => {
      propsCopy[key] = next[key];
    });

    nextNode.props = propsCopy;

  }
  else if (typeof spec.applyNext === "function") {

    /* 칸이 한 겹 안에 있는 경우(margin 네 칸) — 복사 규칙은 그대로
       쓰고 "어디에 넣는가"만 spec 이 정한다 */
    spec.applyNext(nextNode, next, current);

  }
  else {

    spec.keys.forEach((key) => {
      nextNode[key] = next[key];
    });

  }

  return {
    ok: true,
    regions: replaceSkinHomeCanvasV2Node(regions, found, canvas, hit, nextNode),
    previous: previous
  };

}


/*
  바뀐 노드 하나를 제자리에 끼운 **새 regions**.

  ★ 바뀌는 경로 위의 객체만 새로 만든다 — regions 배열 · home_canvas
    항목 · canvas · flow · blocks 배열 · (프레임이면) 그 블록과
    props 와 elements 배열 · overlays 배열. 그 밖은 참조로 옮긴다.
*/
function replaceSkinHomeCanvasV2Node(regions, found, canvas, hit, nextNode) {

  const nextCanvas =
    copySkinHomeCanvasObject(canvas);

  if (hit.kind === "overlay") {

    nextCanvas.overlays =
      canvas.overlays.map(
        (element, index) => (index === hit.index ? nextNode : element)
      );

  }
  else {

    const flow =
      copySkinHomeCanvasObject(canvas.flow);

    if (hit.kind === "block") {

      flow.blocks =
        canvas.flow.blocks.map(
          (block, index) => (index === hit.index ? nextNode : block)
        );

    }
    else {

      /* frame-element — 그 프레임 블록만 새로 만든다 */
      flow.blocks =
        canvas.flow.blocks.map(
          (block) => {

            if (
              !isSkinHomeCanvasPlainObject(block) ||
              block.id !== hit.parentId
            ) {
              return block;
            }

            const blockCopy =
              copySkinHomeCanvasObject(block);

            const propsCopy =
              copySkinHomeCanvasObject(block.props);

            propsCopy.elements =
              block.props.elements.map(
                (element, index) => (index === hit.index ? nextNode : element)
              );

            blockCopy.props = propsCopy;

            return blockCopy;

          }
        );

    }

    nextCanvas.flow = flow;

  }

  return regions.map(
    (entry, index) => {

      if (index !== found.index) {
        return entry;
      }

      const copy =
        copySkinHomeCanvasObject(entry);

      copy.canvas = nextCanvas;

      return copy;

    }
  );

}


/* =========================================================
   3. 칸마다의 spec — 값 표는 skin/skin-home-canvas-v2.js 하나다
========================================================== */

/* 그 블록이 `height:"auto"` 를 쓸 수 있는가(§14-4의 표) */
function skinHomeCanvasV2AutoHeightAllowed(block) {

  return (
    SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES.indexOf(block && block.type) !== -1
  );

}


function writeSkinHomeCanvasV2BlockAlign(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["align"],
    kinds: ["block"],
    checkNext: (value) =>
      SKIN_HOME_CANVAS_BLOCK_ALIGNS.indexOf(value.align) === -1 ? "align" : null,

    /* 빠진 `align` 은 화면에서 `left` 다(§14-4). 패널도 그렇게 보여
       주므로 `expected` 도 같은 자로 읽어야 한다 — 안 그러면 "한 번도
       정렬을 적지 않은 블록은 영영 정렬을 못 바꾼다"가 된다. */
    readCurrent: (block, key) =>
      (key === "align" &&
        SKIN_HOME_CANVAS_BLOCK_ALIGNS.indexOf(block.align) === -1)
        ? SKIN_HOME_CANVAS_BLOCK_ALIGNS[0]
        : block[key]
  });

}


function writeSkinHomeCanvasV2BlockWidth(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["width"],
    kinds: ["block"],
    checkNext: (value) =>
      isSkinHomeCanvasSize(value.width) ? null : "size"
  });

}


function writeSkinHomeCanvasV2BlockHeight(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["height"],
    kinds: ["block"],
    checkNext: (value, block) => {

      if (value.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {
        return skinHomeCanvasV2AutoHeightAllowed(block) ? null : "auto";
      }

      return isSkinHomeCanvasSize(value.height) ? null : "size";

    }
  });

}


/*
  margin 네 칸을 **한 번에** 쓴다.

  ★ 한 칸씩 쓰지 않는 이유. `margin` 이 통째로 빠져 있을 수 있고
    (빠지면 네 칸 다 0 — §14-4), 그때 한 칸만 새로 만들면 나머지
    세 칸이 "없음"인 채로 남아 다음 입력의 `expected` 가 undefined 와
    0 사이에서 갈린다. 네 칸을 언제나 함께 읽고 함께 쓰면 그 갈림이
    없다. 한 번의 입력은 그중 한 칸만 바꾸므로 Undo 한 칸은 그대로다.

  ★ 음수를 허용한다 — 일부러 겹치기 위한 칸이다(§14-4).
*/
function writeSkinHomeCanvasV2BlockMargin(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: SKIN_HOME_CANVAS_EDGES.slice(),
    kinds: ["block"],

    checkNext: (value) =>
      SKIN_HOME_CANVAS_EDGES.some((edge) => !isSkinHomeCanvasCoord(value[edge]))
        ? "coord"
        : null,

    readCurrent: (block, key) => {

      const margin =
        isSkinHomeCanvasPlainObject(block.margin) ? block.margin : {};

      return isSkinHomeCanvasFiniteNumber(margin[key]) ? margin[key] : 0;

    },

    applyNext: (blockCopy, value, block) => {

      const margin =
        copySkinHomeCanvasObject(
          isSkinHomeCanvasPlainObject(block.margin) ? block.margin : {}
        );

      SKIN_HOME_CANVAS_EDGES.forEach((edge) => {
        margin[edge] = value[edge];
      });

      blockCopy.margin = margin;

    }
  });

}


/*
  글자 내용 — 블록이든 프레임 내부 요소든 overlay 든 `props.text` 다.

  ★ v1 과 같은 자를 쓴다(2000자 · 평문). 줄바꿈은 그대로 남고
    렌더러가 textContent 로 넣으므로 HTML 이 실행되지 않는다(§8).
*/
function writeSkinHomeCanvasV2NodeText(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["text"],
    container: "props",
    checkNext: (value, node) => {

      if (node.type !== "text") {
        return "type";
      }

      if (typeof value.text !== "string") {
        return "text";
      }

      return value.text.length > SKIN_HOME_CANVAS_MAX_TEXT_CHARS ? "length" : null;

    },

    /* 빠진 `props.text` 는 화면에서 빈 문자열이다(렌더러의 기본값) */
    readCurrent: (node, key) => {

      const props =
        isSkinHomeCanvasPlainObject(node.props) ? node.props : {};

      return typeof props[key] === "string" ? props[key] : "";

    }
  });

}


/* =========================================================
   3-2. 자리 · 크기 · 각도 — 프레임 내부 요소와 overlay
        (HOME-CANVAS-V2-EDITOR-1B)

   ★ **블록에는 없는 칸이다.** 블록의 자리는 순서 · 정렬 · 여백이
     정하고(§14-10 의 책임 표), 좌표를 갖는 것은 `main_visual` 내부
     요소와 페이지 `overlays` 둘뿐이다. 그래서 아래 writer 들은
     `kinds` 로 그 둘만 받는다 — 블록 id 로 부르면 "kind" 로 거부다.

   ── 두 규칙이 서로 다른 칸을 쓴다 ──────────────────────

     follow:"transform" · overlay   x · y            (좌표를 직접)
     follow:"pin"                   pin.offset.x · y (기준점에서 얼마나)

   그래서 writer 도 갈라진다. 한 함수에 담아 `follow` 로 분기하면
   `next.x` 가 어떤 때는 좌표고 어떤 때는 offset 이 되어, 부르는 쪽이
   틀리면 조용히 엉뚱한 칸이 저장된다. 이름이 다르면 그 길이 없다.

     writeSkinHomeCanvasV2NodePosition  x · y
     writeSkinHomeCanvasV2NodeBox       x · y · width · height
     writeSkinHomeCanvasV2NodePinOffset offsetX · offsetY
     writeSkinHomeCanvasV2NodePinBox    offsetX · offsetY · width · height
     writeSkinHomeCanvasV2NodeRotation  rotation

   ★ **화면 좌표를 여기까지 들고 오지 않는다.** pin 요소의 화면
     자리(`기준점 + offset`)를 offset 으로 되돌리는 계산은 부모
     realm 의 한 곳(studio/inspector/studio-canvas-v2-space.js)이
     하고, 이 파일은 이미 storage 칸으로 번역된 값만 받는다 —
     렌더러의 자를 두 벌 만들지 않기 위해서다(계약 §26-3).

   ★ `height:"auto"` 를 쓸 수 있는 종류는 **v1 의 표**다. 프레임
     내부 요소와 overlay 는 v1 요소와 같은 모양이므로(§14-8)
     `SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES` 를 그대로 본다 — 블록의
     표(SKIN_HOME_CANVAS_BLOCK_AUTO_HEIGHT_TYPES)와 다른 표다.
========================================================== */

/* 좌표를 갖는 자리 — 블록은 여기 없다 */
const SKIN_HOME_CANVAS_V2_FREE_KINDS = ["frame-element", "overlay"];


/* 그 요소가 `height:"auto"` 를 쓸 수 있는가(v1 §6 의 표) */
function skinHomeCanvasV2NodeAutoHeightAllowed(node) {

  return (
    isSkinHomeCanvasPlainObject(node) &&
    SKIN_HOME_CANVAS_AUTO_HEIGHT_TYPES.indexOf(node.type) !== -1
  );

}


/*
  지금 그 요소가 **pin 으로 놓이는가**.

  ★ `hit.kind` 를 함께 본다. overlay 에 `follow:"pin"` 이 적혀 있어도
    그것은 **모르는 칸**이고(§14-8 — overlay 는 v1 요소 판정을 쓴다)
    렌더러도 그 칸을 읽지 않는다. 데이터에 적힌 글자 하나로 저장
    경로가 갈리면, 화면과 저장이 서로 다른 규칙을 보게 된다.
*/
function skinHomeCanvasV2NodeIsPinned(node, hit) {

  return !!(hit && hit.kind === "frame-element" && node && node.follow === "pin");

}


/* x · y · width · height 의 값 검사 — v1 의 그 규칙 그대로다 */
function skinHomeCanvasV2CheckBoxValue(value, node, keys) {

  if (keys.indexOf("x") !== -1) {

    if (!isSkinHomeCanvasCoord(value.x) || !isSkinHomeCanvasCoord(value.y)) {
      return "coord";
    }

  }

  if (keys.indexOf("offsetX") !== -1) {

    if (!isSkinHomeCanvasCoord(value.offsetX) || !isSkinHomeCanvasCoord(value.offsetY)) {
      return "coord";
    }

  }

  if (keys.indexOf("width") === -1) {
    return null;
  }

  if (!isSkinHomeCanvasSize(value.width)) {
    return "size";
  }

  if (value.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {
    return skinHomeCanvasV2NodeAutoHeightAllowed(node) ? null : "auto";
  }

  return isSkinHomeCanvasSize(value.height) ? null : "size";

}


/*
  pin 의 지금 값. `pin` 이 통째로 빠져 있을 수 있고, 그때 offset 은
  네 칸 기본값 그대로 0 이다(§14-6) — 실행 payload 도 0 을 채워
  보내므로 패널 · 프레임 · 여기가 **같은 자**를 쓴다.
*/
function skinHomeCanvasV2ReadPinField(node, key) {

  if (key !== "offsetX" && key !== "offsetY") {
    return node[key];
  }

  const pin =
    isSkinHomeCanvasPlainObject(node.pin) ? node.pin : {};

  const offset =
    isSkinHomeCanvasPlainObject(pin.offset) ? pin.offset : {};

  const value =
    key === "offsetX" ? offset.x : offset.y;

  return isSkinHomeCanvasFiniteNumber(value) ? value : 0;

}


/*
  ★ `pin` 의 나머지 세 칸(`target` · `anchor` · `origin`)과 모르는
    칸은 그대로 옮긴다. 자리를 옮긴다고 고정 관계가 바뀌지 않는
    것이 §14-6 이고, 이 라운드가 고치는 것은 offset 두 칸뿐이다.
*/
function skinHomeCanvasV2ApplyPinField(nodeCopy, value, node, keys) {

  const pin =
    copySkinHomeCanvasObject(
      isSkinHomeCanvasPlainObject(node.pin) ? node.pin : {}
    );

  const offset =
    copySkinHomeCanvasObject(
      isSkinHomeCanvasPlainObject(pin.offset) ? pin.offset : {}
    );

  offset.x = value.offsetX;
  offset.y = value.offsetY;

  pin.offset = offset;

  nodeCopy.pin = pin;

  if (keys.indexOf("width") !== -1) {
    nodeCopy.width = value.width;
    nodeCopy.height = value.height;
  }

}


function writeSkinHomeCanvasV2NodePosition(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["x", "y"],
    kinds: SKIN_HOME_CANVAS_V2_FREE_KINDS,
    checkNext: (value, node, hit) =>
      skinHomeCanvasV2NodeIsPinned(node, hit)
        ? "pin"
        : skinHomeCanvasV2CheckBoxValue(value, node, ["x"])
  });

}


/*
  ★ 네 칸이 한 요청이다. 폭만 바뀌는 좌우 리사이즈에서도 x · y ·
    height 가 함께 온다(값이 같을 뿐이다) — v1 §18-2 와 같은 규칙이고
    같은 이유다(칸마다 메시지를 가르면 중간 상태가 생긴다).
*/
function writeSkinHomeCanvasV2NodeBox(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["x", "y", "width", "height"],
    kinds: SKIN_HOME_CANVAS_V2_FREE_KINDS,
    checkNext: (value, node, hit) =>
      skinHomeCanvasV2NodeIsPinned(node, hit)
        ? "pin"
        : skinHomeCanvasV2CheckBoxValue(value, node, ["x", "width"])
  });

}


function writeSkinHomeCanvasV2NodePinOffset(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["offsetX", "offsetY"],
    kinds: ["frame-element"],
    checkNext: (value, node, hit) =>
      skinHomeCanvasV2NodeIsPinned(node, hit)
        ? skinHomeCanvasV2CheckBoxValue(value, node, ["offsetX"])
        : "pin",
    readCurrent: skinHomeCanvasV2ReadPinField,
    applyNext: (nodeCopy, value, node) =>
      skinHomeCanvasV2ApplyPinField(nodeCopy, value, node, ["offsetX", "offsetY"])
  });

}


function writeSkinHomeCanvasV2NodePinBox(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["offsetX", "offsetY", "width", "height"],
    kinds: ["frame-element"],
    checkNext: (value, node, hit) =>
      skinHomeCanvasV2NodeIsPinned(node, hit)
        ? skinHomeCanvasV2CheckBoxValue(value, node, ["offsetX", "width"])
        : "pin",
    readCurrent: skinHomeCanvasV2ReadPinField,
    applyNext: (nodeCopy, value, node) =>
      skinHomeCanvasV2ApplyPinField(
        nodeCopy, value, node, ["offsetX", "offsetY", "width", "height"])
  });

}


/*
  ★ 각도는 두 규칙이 같은 칸을 쓴다. 회전 중심이 요소 상자의
    정중앙이라(§4) `translate` 로 옮긴 pin 장식도 자기 중심을 돌고,
    그래서 `pin` 과 `transform` 이 나뉠 이유가 없다.

  ★ `rotation` 이 없는 요소의 지금 값은 0 이다(§5). 고르기만 해서는
    그 칸이 생기지 않고, 실제로 돌린 제스처만 만든다 — v1 §19 와
    같은 자다.
*/
function writeSkinHomeCanvasV2NodeRotation(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {
    keys: ["rotation"],
    kinds: SKIN_HOME_CANVAS_V2_FREE_KINDS,
    checkNext: (value) =>
      isSkinHomeCanvasFiniteNumber(value.rotation) ? null : "rotation",
    readCurrent: (node) =>
      isSkinHomeCanvasFiniteNumber(node.rotation) ? node.rotation : 0
  });

}


/* =========================================================
   4. 순서 — 배열 안의 자리를 옮긴다

   writeSkinHomeCanvasV2BlockOrder(regions, id, next, expected)

     next     { index }  옮겨 갈 자리(0 부터)
     expected { index }  지금 자리

   ★ 위 필드 writer 와 같은 관문을 쓰지 않는다. 바뀌는 것이 노드의
     칸이 아니라 **배열 자체**라서 복사 범위가 다르기 때문이다. 대신
     규약(허용 키 · expected 정확 일치 · unchanged)은 그대로 맞춘다.

   ★ `hidden` 블록도 자리를 차지한다 — 화면에서는 건너뛰지만(§23-5)
     배열에서는 한 칸이다. 순서를 옮길 때 그 칸을 빼고 세면 저장값과
     화면이 어긋난다.
========================================================== */

function writeSkinHomeCanvasV2BlockOrder(regions, id, next, expected) {

  if (
    typeof id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)
  ) {
    return { ok: false, reason: "id" };
  }

  if (
    !isSkinHomeCanvasPlainObject(next) ||
    Object.keys(next).length !== 1 ||
    !Number.isInteger(next.index)
  ) {
    return { ok: false, reason: "shape" };
  }

  const found =
    findSkinHomeCanvasRegion(regions);

  if (!found) {
    return { ok: false, reason: "region" };
  }

  const canvas =
    found.entry.canvas;

  if (
    !isSkinHomeCanvasPlainObject(canvas) ||
    canvas.version !== SKIN_HOME_CANVAS_V2_VERSION
  ) {
    return { ok: false, reason: "canvas" };
  }

  const hit =
    findSkinHomeCanvasV2Node(canvas, id);

  if (!hit) {
    return { ok: false, reason: "missing" };
  }

  if (hit.kind !== "block") {
    return { ok: false, reason: "kind" };
  }

  const blocks =
    canvas.flow.blocks;

  if (isSkinHomeCanvasPlainObject(expected)) {

    if (
      Object.keys(expected).length !== 1 ||
      expected.index !== hit.index
    ) {
      return { ok: false, reason: "expected" };
    }

  }

  if (next.index < 0 || next.index > blocks.length - 1) {
    return { ok: false, reason: "range" };
  }

  const previous =
    { index: hit.index };

  if (next.index === hit.index) {
    return { ok: true, regions: regions, previous: previous, unchanged: true };
  }

  const nextBlocks =
    blocks.slice();

  nextBlocks.splice(hit.index, 1);

  nextBlocks.splice(next.index, 0, hit.node);

  const nextFlow =
    copySkinHomeCanvasObject(canvas.flow);

  nextFlow.blocks = nextBlocks;

  const nextCanvas =
    copySkinHomeCanvasObject(canvas);

  nextCanvas.flow = nextFlow;

  const nextRegions =
    regions.map(
      (entry, index) => {

        if (index !== found.index) {
          return entry;
        }

        const copy =
          copySkinHomeCanvasObject(entry);

        copy.canvas = nextCanvas;

        return copy;

      }
    );

  return { ok: true, regions: nextRegions, previous: previous };

}


/* =========================================================
   4. 새 재료 하나 — 추가 (HOME-CANVAS-V2-ADD-1)

   writeSkinHomeCanvasV2AddNode(regions, request)

     request { target, type, slot, frameId }

       target  "flow"    → canvas.flow.blocks 의 **맨 뒤**
               "overlay" → canvas.overlays 의 **맨 뒤**
               "frame"   → 그 `main_visual` 의 `props.elements` 맨 뒤
                           (HOME-CANVAS-V2-ELEMENTS-1)
       type    그 자리가 허용하는 종류(아래 표들)
       slot    사진이 들어가는 종류에만 — 이미지 슬롯 이름
       frameId `target:"frame"` 일 때 그 프레임 블록의 id

     -> { ok:true, regions, id, target, type }
     -> { ok:false, reason }

   ★ **기본값을 여기서 정한다.** 패널이 값을 만들어 보내면 같은
     "새 요소"가 입구마다 다른 모양으로 태어난다 — 지금은 왼쪽
     패널 하나뿐이지만, 그 하나가 계약이 되면 다음 입구(AI · 단축키)
     가 그것을 다시 적게 된다. 부르는 쪽이 정하는 것은 **어디에
     무엇을** 까지다.

   ★ 넣은 뒤 **전체를 다시 검증한다**(validateSkinCanvasV2Data).
     새 노드 하나만 보면 "id 가 이 캔버스 안에서 유일한가" ·
     "프레임 내부 요소가 primaryId 를 가리키는가" 같은 판정이
     빠진다. 기존 규칙 한 벌을 그대로 지나는 편이 새 판정을
     만드는 것보다 안전하고, 여기서 막히면 draft 는 한 글자도
     바뀌지 않는다.

   ★ 삭제는 `HOME-CANVAS-V2-ELEMENTS-1` 이 아래 §5 에 더했다
     (writeSkinHomeCanvasV2RemoveNode).
========================================================== */

const SKIN_HOME_CANVAS_V2_ADD_TARGETS = ["flow", "overlay", "frame"];

/*
  이미지 슬롯이 **필수**인 종류(v1 props 표 — skin/skin-home-canvas.js
  validateSkinCanvasSlotProp 의 required 가 참인 셋). `main_visual` 은
  자기 props 에 slot 이 없지만 계약상 primary 사진을 함께 만들어야
  하므로(§14-5) 같은 칸을 받는다.
*/
const SKIN_HOME_CANVAS_V2_SLOT_TYPES = ["photo", "sticker", "logo"];

/*
  블록의 기본 크기(§14-4 의 자 — 폭은 흐름의 가용 폭, 높이는 그 종류가
  쓸 수 있는 값).

    fill  폭을 가용 폭 전부로. false 면 아래 width 와 가용 폭 중 작은 쪽.

  ★ `height` 가 대개 숫자인 것은 **새로 만든 것이 곧바로 보이고
    잡히기** 위해서다. `category_nav` 를 "auto" 로 두면 카테고리가
    없는 블로그에서 높이 0 이 되고, 주인은 아무것도 생기지 않았다고
    읽는다. 글자는 내용이 곧 높이라 "auto" 가 맞고, `main_visual` 의
    "auto" 는 primary 사진 상자의 비율이므로(§24-5) 언제나 보인다.
*/
const SKIN_HOME_CANVAS_V2_BLOCK_DEFAULTS = {
  logo:         { width: 160, height: 40, fill: false },
  category_nav: { width: 0, height: 48, fill: true },
  text:         { width: 0, height: SKIN_HOME_CANVAS_AUTO_HEIGHT, fill: true },
  divider:      { width: 0, height: 2, fill: true },
  main_visual:  { width: 240, height: SKIN_HOME_CANVAS_AUTO_HEIGHT, fill: false }
};

/* 페이지 자유 장식의 기본 크기(도화지 좌표 — 계약 §4) */
const SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS = {
  photo:        { width: 160, height: 200 },
  sticker:      { width: 96, height: 96 },
  logo:         { width: 160, height: 48 },
  text:         { width: 200, height: SKIN_HOME_CANVAS_AUTO_HEIGHT },
  shape:        { width: 120, height: 120 },
  category_nav: { width: 200, height: 48 }
};

/* main_visual 을 새로 만들 때의 프레임 내부 자와 primary 사진 상자 */
const SKIN_HOME_CANVAS_V2_NEW_FRAME = { baseWidth: 240, baseHeight: 300 };

/* 새 글자 요소의 내용 — 빈 문자열이면 화면에 아무것도 없어 잡을 수 없다 */
const SKIN_HOME_CANVAS_V2_NEW_TEXT = "새 텍스트";

/* 새 장식이 겹쳐 쌓이지 않게 조금씩 밀어 둔다(도화지 좌표) */
const SKIN_HOME_CANVAS_V2_OVERLAY_ORIGIN = 24;
const SKIN_HOME_CANVAS_V2_OVERLAY_STEP = 12;
const SKIN_HOME_CANVAS_V2_OVERLAY_CASCADE = 6;


/*
  이 캔버스 안에서 아직 쓰이지 않은 새 id.

  ★ id 규칙도 만드는 법도 v1 의 그 하나다
    (createSkinHomeCanvasElementId — skin/skin-home-canvas.js).
    여기서 `canvas_text_1` 같은 **뜻이 있는 이름**을 새로 만들지
    않는다: 뜻이 있으면 나중에 종류를 바꿨을 때 이름이 거짓말을
    하고, Import 로 합쳐진 두 캔버스에서 같은 이름이 만나기 쉽다.
*/
function skinHomeCanvasV2NewId(used) {

  for (let i = 0; i < 8; i += 1) {

    const id =
      (typeof createSkinHomeCanvasElementId === "function")
        ? createSkinHomeCanvasElementId()
        : null;

    if (
      typeof id === "string" &&
      SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id) &&
      !used.has(id)
    ) {
      used.add(id);
      return id;
    }

  }

  return null;

}


/* 흐름 안에서 블록이 쓸 수 있는 가로 폭(§23-4 의 자) */
function skinHomeCanvasV2FlowWidth(flow) {

  const padding =
    isSkinHomeCanvasPlainObject(flow.padding) ? flow.padding : {};

  const left =
    isSkinHomeCanvasFiniteNumber(padding.left) ? padding.left : 0;

  const right =
    isSkinHomeCanvasFiniteNumber(padding.right) ? padding.right : 0;

  const inner =
    Math.round(SKIN_HOME_CANVAS_BASE_WIDTH - left - right);

  /* 자가 0 이하다(padding 이 도화지보다 크다) — 숫자를 지어내지
     않고 도화지 폭을 쓴다. 화면에서는 어차피 그 자가 다시 정한다 */
  return inner > 0 ? inner : SKIN_HOME_CANVAS_BASE_WIDTH;

}


/* 종류별 props — 값 표는 v1 의 그것 하나다(§14-4) */
function buildSkinHomeCanvasV2NewProps(type, slot) {

  if (type === "photo" || type === "sticker") {
    return { slot: slot };
  }

  if (type === "logo") {
    return { slot: slot, fallback: SKIN_HOME_CANVAS_LOGO_FALLBACKS[0] };
  }

  if (type === "text") {
    return { text: SKIN_HOME_CANVAS_V2_NEW_TEXT, role: "body" };
  }

  if (type === "category_nav") {
    return { mode: SKIN_HOME_CANVAS_NAV_MODES[0] };
  }

  if (type === "shape") {
    return { kind: SKIN_HOME_CANVAS_SHAPE_KINDS[0] };
  }

  /* divider — props 가 없다(§14-4) */
  return null;

}


function buildSkinHomeCanvasV2NewBlock(flow, type, slot, id, used) {

  const spec =
    SKIN_HOME_CANVAS_V2_BLOCK_DEFAULTS[type];

  const available =
    skinHomeCanvasV2FlowWidth(flow);

  const block = {
    id: id,
    type: type,
    width: spec.fill ? available : Math.min(spec.width, available),
    height: spec.height,
    align: "center"
  };

  if (type === "main_visual") {

    const photoId =
      skinHomeCanvasV2NewId(used);

    if (!photoId) {
      return null;
    }

    /*
      ★ primary 사진을 **함께** 만든다. 계약이 "elements 는 비어 있을
        수 없다 · primaryId 는 그 안의 photo 를 가리킨다"이므로(§9-(3)),
        빈 프레임은 애초에 저장할 수 없다.

      ★ 사진 상자가 프레임 내부 자를 꽉 채운다 — 그래야 `height:"auto"`
        가 곧 그 비율이 된다(§24-5).
    */
    block.props = {
      baseWidth: SKIN_HOME_CANVAS_V2_NEW_FRAME.baseWidth,
      baseHeight: SKIN_HOME_CANVAS_V2_NEW_FRAME.baseHeight,
      primaryId: photoId,
      elements: [
        {
          id: photoId,
          type: "photo",
          follow: SKIN_HOME_CANVAS_FOLLOW_MODES[0],
          x: 0,
          y: 0,
          width: SKIN_HOME_CANVAS_V2_NEW_FRAME.baseWidth,
          height: SKIN_HOME_CANVAS_V2_NEW_FRAME.baseHeight,
          props: { slot: slot }
        }
      ]
    };

    return block;

  }

  const props =
    buildSkinHomeCanvasV2NewProps(type, slot);

  if (props) {
    block.props = props;
  }

  return block;

}


function buildSkinHomeCanvasV2NewOverlay(type, slot, id, index) {

  const spec =
    SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS[type];

  const step =
    (index % SKIN_HOME_CANVAS_V2_OVERLAY_CASCADE) * SKIN_HOME_CANVAS_V2_OVERLAY_STEP;

  const overlay = {
    id: id,
    type: type,
    x: SKIN_HOME_CANVAS_V2_OVERLAY_ORIGIN + step,
    y: SKIN_HOME_CANVAS_V2_OVERLAY_ORIGIN + step,
    width: spec.width,
    height: spec.height
  };

  const props =
    buildSkinHomeCanvasV2NewProps(type, slot);

  if (props) {
    overlay.props = props;
  }

  return overlay;

}


/*
  HOME-CANVAS-V2-ELEMENTS-1 — `main_visual` **안**에 들어가는 새 장식.

  ★ 값 표를 새로 만들지 않는다. 종류마다의 크기는 위 자유 장식의 그
    표 하나이고, 여기서는 **프레임의 자에 맞춰 줄인다** — 프레임
    내부 좌표는 `props.baseWidth` 가 자이므로(계약 §24-3) 도화지
    기준의 160×200 을 그대로 넣으면 자가 150 인 프레임에서는 새
    장식이 프레임을 통째로 덮는다.

      k = min(1, props.baseWidth ÷ 390)

  ★ 자리도 같은 자로 줄인다. 프레임 안은 도화지보다 좁으므로
    24px 계단이 몇 개만에 프레임 밖으로 나간다.

  ★ `follow` 는 `transform` 이다(계약의 기본값 — §14-6). `pin` 으로
    바꾸는 것은 패널의 따라가기 칸이고, 그때 자리를 유지하는 계산은
    studio/inspector/studio-canvas-v2-space.js 가 한다.
*/
function buildSkinHomeCanvasV2NewFrameElement(frame, type, slot, id) {

  const spec =
    SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS[type];

  const props =
    isSkinHomeCanvasPlainObject(frame.props) ? frame.props : {};

  const base =
    isSkinHomeCanvasFiniteNumber(props.baseWidth) && props.baseWidth > 0
      ? props.baseWidth
      : SKIN_HOME_CANVAS_BASE_WIDTH;

  const k =
    Math.min(1, base / SKIN_HOME_CANVAS_BASE_WIDTH);

  const count =
    Array.isArray(props.elements) ? props.elements.length : 0;

  const step =
    (count % SKIN_HOME_CANVAS_V2_OVERLAY_CASCADE) *
    Math.max(2, Math.round(SKIN_HOME_CANVAS_V2_OVERLAY_STEP * k));

  const origin =
    Math.max(2, Math.round(SKIN_HOME_CANVAS_V2_OVERLAY_ORIGIN * k));

  const element = {
    id: id,
    type: type,
    follow: SKIN_HOME_CANVAS_FOLLOW_MODES[0],
    x: origin + step,
    y: origin + step,
    width: Math.max(1, Math.round(spec.width * k)),
    height:
      spec.height === SKIN_HOME_CANVAS_AUTO_HEIGHT
        ? SKIN_HOME_CANVAS_AUTO_HEIGHT
        : Math.max(1, Math.round(spec.height * k))
  };

  const built =
    buildSkinHomeCanvasV2NewProps(type, slot);

  if (built) {
    element.props = built;
  }

  return element;

}


function writeSkinHomeCanvasV2AddNode(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  if (SKIN_HOME_CANVAS_V2_ADD_TARGETS.indexOf(value.target) === -1) {
    return { ok: false, reason: "target" };
  }

  const target =
    value.target;

  /* 어느 자리가 어떤 종류를 받는가 — 두 표는 v1 · v2 의 그것
     그대로다(자동 배치는 블록 다섯, 자유 층과 프레임 안은 v1 여섯) */
  const allowed =
    (target === "flow")
      ? SKIN_HOME_CANVAS_BLOCK_TYPES
      : SKIN_HOME_CANVAS_ELEMENT_TYPES;

  if (allowed.indexOf(value.type) === -1) {
    return { ok: false, reason: "type" };
  }

  const type =
    value.type;

  const found =
    findSkinHomeCanvasRegion(regions);

  if (!found) {
    return { ok: false, reason: "region" };
  }

  const canvas =
    found.entry.canvas;

  if (
    !isSkinHomeCanvasPlainObject(canvas) ||
    canvas.version !== SKIN_HOME_CANVAS_V2_VERSION
  ) {
    return { ok: false, reason: "canvas" };
  }

  const flow =
    isSkinHomeCanvasPlainObject(canvas.flow) ? canvas.flow : null;

  if (!flow || !Array.isArray(flow.blocks)) {
    return { ok: false, reason: "canvas" };
  }

  const overlays =
    Array.isArray(canvas.overlays) ? canvas.overlays : [];

  /* HOME-CANVAS-V2-ELEMENTS-1 — `main_visual` 안에 넣는 경우.
     프레임은 **부르는 쪽이 명시적으로 고른다**(계약 §28-2) — 지금
     선택에서 추측하지 않는다. */
  const frameHit =
    (target === "frame")
      ? skinHomeCanvasV2FrameHit(canvas, value.frameId)
      : null;

  if (target === "frame" && !frameHit) {
    return { ok: false, reason: "frame" };
  }

  const list =
    (target === "flow")
      ? flow.blocks
      : (target === "frame" ? frameHit.node.props.elements : overlays);

  if (list.length >= SKIN_HOME_CANVAS_MAX_ELEMENTS) {
    return { ok: false, reason: "limit" };
  }

  /* 슬롯 — 이름만 본다. **비어 있어도 된다**(아직 연결되지 않은
     슬롯은 그냥 그림이 없는 요소다 — 계약 §6 · §27-4) */
  const needsSlot =
    SKIN_HOME_CANVAS_V2_SLOT_TYPES.indexOf(type) !== -1 ||
    type === "main_visual";

  const slot =
    needsSlot ? value.slot : "";

  if (
    needsSlot &&
    (typeof slot !== "string" || !SKIN_HOME_CANVAS_SLOT_NAME_PATTERN.test(slot))
  ) {
    return { ok: false, reason: "slot" };
  }

  const used =
    new Set(listSkinHomeCanvasV2Nodes(canvas).map((node) => node.id));

  const id =
    skinHomeCanvasV2NewId(used);

  if (!id) {
    return { ok: false, reason: "id" };
  }

  let node;

  if (target === "flow") {
    node = buildSkinHomeCanvasV2NewBlock(flow, type, slot, id, used);
  }
  else if (target === "frame") {
    node = buildSkinHomeCanvasV2NewFrameElement(frameHit.node, type, slot, id);
  }
  else {
    node = buildSkinHomeCanvasV2NewOverlay(type, slot, id, overlays.length);
  }

  if (!node) {
    return { ok: false, reason: "id" };
  }

  const nextCanvas =
    copySkinHomeCanvasObject(canvas);

  if (target === "flow") {

    const nextFlow =
      copySkinHomeCanvasObject(flow);

    nextFlow.blocks = flow.blocks.concat([node]);

    nextCanvas.flow = nextFlow;

  }
  else if (target === "frame") {

    nextCanvas.flow =
      skinHomeCanvasV2FlowWithFrameElements(
        flow,
        frameHit,
        frameHit.node.props.elements.concat([node])
      );

  }
  else {
    nextCanvas.overlays = overlays.concat([node]);
  }

  /* 위 ★ — 기존 규칙 한 벌을 그대로 지난다 */
  const verdict =
    (typeof validateSkinCanvasV2Data === "function")
      ? validateSkinCanvasV2Data(nextCanvas, "canvas")
      : { ok: true };

  if (!verdict.ok) {
    return { ok: false, reason: "invalid", path: verdict.path, message: verdict.message };
  }

  const nextRegions =
    regions.map(
      (entry, index) => {

        if (index !== found.index) {
          return entry;
        }

        const copy =
          copySkinHomeCanvasObject(entry);

        copy.canvas = nextCanvas;

        return copy;

      }
    );

  return {
    ok: true,
    regions: nextRegions,
    id: id,
    target: target,
    type: type
  };

}


/* =========================================================
   5. 소속과 따라가기 — 묶기 · 빼기 · 삭제 · follow · pin
      (HOME-CANVAS-V2-ELEMENTS-1)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §28

   ── 이 절이 하는 일과 하지 않는 일 ─────────────────────

   여기 있는 함수는 **이미 계산이 끝난 숫자**를 받는다. "화면의 그
   자리를 프레임 안 좌표로 얼마라고 적어야 하는가"는 부모 realm 의
   한 곳이 렌더러의 자로 계산하고
   (studio/inspector/studio-canvas-v2-space.js), 이 파일은 그 결과를
   **불변으로 옮겨 적기만** 한다 — 계약 §26-4 가 정한 그 경계 그대로다.

     writeSkinHomeCanvasV2AttachNode   overlay  → 프레임 내부
     writeSkinHomeCanvasV2DetachNode   프레임 내부 → overlay
     writeSkinHomeCanvasV2RemoveNode   블록 · 프레임 내부 · overlay 삭제
     writeSkinHomeCanvasV2NodeFollow   transform ↔ pin
     writeSkinHomeCanvasV2NodePin      pin 의 대상 · 기준점 · 자기 기준점

   ── id 는 바뀌지 않는다 ────────────────────────────────
   묶기 · 해제는 **소속과 좌표계만** 옮긴다(§14-7). id 가 그대로라서
   한 이름 공간(§14-5)이 필요했고, 그래서 옮긴 뒤에도 선택 · 스킨
   CSS 선택자 · 이미지 슬롯 연결이 끊기지 않는다.

   ── 넣어 본 뒤 전체를 다시 검증한다 ────────────────────
   추가(§4)와 같은 규칙이다. 소속이 바뀌면 "프레임 안에 넣을 수 없는
   종류인가" · "primary 가 여전히 프레임 안의 사진인가" · "elements 가
   비지 않았는가" 같은 판정이 한꺼번에 걸리는데, 그 한 벌은 이미
   validateSkinCanvasV2Data() 가 갖고 있다. 막히면 regions 는 한
   글자도 바뀌지 않는다.
========================================================== */

/* pin 의 빠진 기준점 기본값(§14-6) */
const SKIN_HOME_CANVAS_V2_PIN_DEFAULT_POINT = "center";

/* 자리를 유지한 채 pin 이 될 때 쓰는 기준점 — §28-4 의 그 결정 */
const SKIN_HOME_CANVAS_V2_PIN_START_POINT = "top-left";


/* 그 id 가 이 캔버스의 `main_visual` 블록인가 */
function skinHomeCanvasV2FrameHit(canvas, frameId) {

  const hit =
    findSkinHomeCanvasV2Node(canvas, frameId);

  if (
    !hit ||
    hit.kind !== "block" ||
    hit.node.type !== "main_visual" ||
    !isSkinHomeCanvasPlainObject(hit.node.props) ||
    !Array.isArray(hit.node.props.elements)
  ) {
    return null;
  }

  return hit;

}


/* 프레임 하나의 내부 배열만 갈아 끼운 **새 flow** */
function skinHomeCanvasV2FlowWithFrameElements(flow, frameHit, elements) {

  const nextFlow =
    copySkinHomeCanvasObject(flow);

  nextFlow.blocks =
    flow.blocks.map(
      (block, index) => {

        if (index !== frameHit.index) {
          return block;
        }

        const blockCopy =
          copySkinHomeCanvasObject(block);

        const propsCopy =
          copySkinHomeCanvasObject(block.props);

        propsCopy.elements = elements;

        blockCopy.props = propsCopy;

        return blockCopy;

      }
    );

  return nextFlow;

}


/* 바뀐 canvas 하나를 제자리에 끼운 **새 regions** */
function skinHomeCanvasV2ReplaceCanvas(regions, found, nextCanvas) {

  return regions.map(
    (entry, index) => {

      if (index !== found.index) {
        return entry;
      }

      const copy =
        copySkinHomeCanvasObject(entry);

      copy.canvas = nextCanvas;

      return copy;

    }
  );

}


/*
  소속을 옮기는 요청이 공통으로 지나는 자리 — 이 캔버스가 v2 인가 ·
  그 id 가 무엇인가.
*/
function skinHomeCanvasV2Locate(regions, id) {

  if (
    typeof id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)
  ) {
    return { ok: false, reason: "id" };
  }

  const found =
    findSkinHomeCanvasRegion(regions);

  if (!found) {
    return { ok: false, reason: "region" };
  }

  const canvas =
    found.entry.canvas;

  if (
    !isSkinHomeCanvasPlainObject(canvas) ||
    canvas.version !== SKIN_HOME_CANVAS_V2_VERSION ||
    !isSkinHomeCanvasPlainObject(canvas.flow) ||
    !Array.isArray(canvas.flow.blocks)
  ) {
    return { ok: false, reason: "canvas" };
  }

  const hit =
    findSkinHomeCanvasV2Node(canvas, id);

  if (!hit) {
    return { ok: false, reason: "missing" };
  }

  return { ok: true, found: found, canvas: canvas, hit: hit };

}


/*
  자리와 크기 네 칸 — 묶기 · 빼기가 받는 그 값.

  ★ 검사는 v1 · §26 의 그 규칙 그대로다. 옮긴다고 좌표 범위나
    `height:"auto"` 의 허용 종류가 달라지지 않는다.
*/
function skinHomeCanvasV2CheckPlacement(next, node) {

  if (!isSkinHomeCanvasPlainObject(next)) {
    return "shape";
  }

  const keys =
    Object.keys(next);

  const wanted =
    ["x", "y", "width", "height"];

  if (
    keys.length !== wanted.length ||
    wanted.some((key) => keys.indexOf(key) === -1)
  ) {
    return "keys";
  }

  if (!isSkinHomeCanvasCoord(next.x) || !isSkinHomeCanvasCoord(next.y)) {
    return "coord";
  }

  if (!isSkinHomeCanvasSize(next.width)) {
    return "size";
  }

  if (next.height === SKIN_HOME_CANVAS_AUTO_HEIGHT) {
    return skinHomeCanvasV2NodeAutoHeightAllowed(node) ? null : "auto";
  }

  return isSkinHomeCanvasSize(next.height) ? null : "size";

}


/*
  writeSkinHomeCanvasV2AttachNode(regions, request)

    request { id, frameId, next: { x, y, width, height } }

  `next` 는 **프레임 내부 좌표**다(props.baseWidth 의 자).

  ★ 새 소속의 따라가기 방식은 `transform` 이다 — 계약의 기본값이고
    (§14-6), 그래야 "프레임과 함께 커진다"가 묶기의 뜻이 된다.
    `pin` 으로 바꾸는 것은 그 다음 동작이다(아래 Follow).

  ★ `pin` 이 남아 있으면 **그대로 둔다**. 예전에 프레임 안에 있던
    장식이 돌아온 경우 그 설정이 살아 있는 편이 맞고, 안 쓰는 칸을
    지우지 않는 것이 §14-6 이다.
*/
function writeSkinHomeCanvasV2AttachNode(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2Locate(regions, value.id);

  if (!located.ok) {
    return located;
  }

  const hit =
    located.hit;

  if (hit.kind !== "overlay") {
    return { ok: false, reason: "kind" };
  }

  const frameHit =
    skinHomeCanvasV2FrameHit(located.canvas, value.frameId);

  if (!frameHit) {
    return { ok: false, reason: "frame" };
  }

  if (frameHit.node.props.elements.length >= SKIN_HOME_CANVAS_MAX_ELEMENTS) {
    return { ok: false, reason: "limit" };
  }

  const reason =
    skinHomeCanvasV2CheckPlacement(value.next, hit.node);

  if (reason) {
    return { ok: false, reason: reason };
  }

  const nextNode =
    copySkinHomeCanvasObject(hit.node);

  nextNode.follow = SKIN_HOME_CANVAS_FOLLOW_MODES[0];
  nextNode.x = value.next.x;
  nextNode.y = value.next.y;
  nextNode.width = value.next.width;
  nextNode.height = value.next.height;

  const nextCanvas =
    copySkinHomeCanvasObject(located.canvas);

  nextCanvas.overlays =
    located.canvas.overlays.filter((item, index) => index !== hit.index);

  nextCanvas.flow =
    skinHomeCanvasV2FlowWithFrameElements(
      located.canvas.flow,
      frameHit,
      frameHit.node.props.elements.concat([nextNode])
    );

  const verdict =
    (typeof validateSkinCanvasV2Data === "function")
      ? validateSkinCanvasV2Data(nextCanvas, "canvas")
      : { ok: true };

  if (!verdict.ok) {
    return { ok: false, reason: "invalid", path: verdict.path, message: verdict.message };
  }

  return {
    ok: true,
    regions: skinHomeCanvasV2ReplaceCanvas(regions, located.found, nextCanvas),
    id: value.id,
    frameId: value.frameId
  };

}


/*
  writeSkinHomeCanvasV2DetachNode(regions, request)

    request { id, next: { x, y, width, height } }

  `next` 는 **도화지 좌표**다(canvas.baseWidth 의 자).

  ★ primary 사진은 뺄 수 없다. `primaryId` 가 가리키는 요소가
    프레임 안에 있어야 한다는 것이 계약(§14-5)이고, 그것을 빼면
    프레임 자체가 저장될 수 없는 모양이 된다. 거부 이유를 따로 두어
    (`primary`) 패널이 "왜 안 되는가"를 말할 수 있게 한다.

  ★ `follow` 와 `pin` 은 그대로 둔다. overlay 에서는 **읽지 않는
    칸**이고(§14-8 — overlay 는 v1 요소 판정을 쓴다), 다시 묶었을 때
    그 설정이 살아 있는 편이 맞다.
*/
function writeSkinHomeCanvasV2DetachNode(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2Locate(regions, value.id);

  if (!located.ok) {
    return located;
  }

  const hit =
    located.hit;

  if (hit.kind !== "frame-element") {
    return { ok: false, reason: "kind" };
  }

  const frameHit =
    skinHomeCanvasV2FrameHit(located.canvas, hit.parentId);

  if (!frameHit) {
    return { ok: false, reason: "frame" };
  }

  if (frameHit.node.props.primaryId === value.id) {
    return { ok: false, reason: "primary" };
  }

  const overlays =
    Array.isArray(located.canvas.overlays) ? located.canvas.overlays : [];

  if (overlays.length >= SKIN_HOME_CANVAS_MAX_ELEMENTS) {
    return { ok: false, reason: "limit" };
  }

  const reason =
    skinHomeCanvasV2CheckPlacement(value.next, hit.node);

  if (reason) {
    return { ok: false, reason: reason };
  }

  const nextNode =
    copySkinHomeCanvasObject(hit.node);

  nextNode.x = value.next.x;
  nextNode.y = value.next.y;
  nextNode.width = value.next.width;
  nextNode.height = value.next.height;

  const nextCanvas =
    copySkinHomeCanvasObject(located.canvas);

  nextCanvas.flow =
    skinHomeCanvasV2FlowWithFrameElements(
      located.canvas.flow,
      frameHit,
      frameHit.node.props.elements.filter((item, index) => index !== hit.index)
    );

  nextCanvas.overlays =
    overlays.concat([nextNode]);

  const verdict =
    (typeof validateSkinCanvasV2Data === "function")
      ? validateSkinCanvasV2Data(nextCanvas, "canvas")
      : { ok: true };

  if (!verdict.ok) {
    return { ok: false, reason: "invalid", path: verdict.path, message: verdict.message };
  }

  return {
    ok: true,
    regions: skinHomeCanvasV2ReplaceCanvas(regions, located.found, nextCanvas),
    id: value.id,
    frameId: hit.parentId
  };

}


/*
  writeSkinHomeCanvasV2RemoveNode(regions, request)

    request { id }

  블록 · 프레임 내부 요소 · overlay 셋 다 지운다. 블록을 지우면 그
  안의 요소도 함께 없어진다 — 프레임이 곧 그 요소들의 자리다.

  ★ **primary 사진은 지울 수 없다**(위 Detach 와 같은 이유). 계약을
    깨는 동작을 "지운 뒤 검증에서 걸린다"로 처리하지 않고 이름 있는
    이유로 먼저 막는다 — 주인에게 무엇이 문제인지 말할 수 있어야
    한다.

  ★ 되살리는 것은 Undo 다(§27-7 의 그 결정 그대로). 지운 요소를
    어딘가에 담아 두지 않는다.
*/
function writeSkinHomeCanvasV2RemoveNode(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2Locate(regions, value.id);

  if (!located.ok) {
    return located;
  }

  const hit =
    located.hit;

  const canvas =
    located.canvas;

  const nextCanvas =
    copySkinHomeCanvasObject(canvas);

  if (hit.kind === "overlay") {

    nextCanvas.overlays =
      canvas.overlays.filter((item, index) => index !== hit.index);

  }
  else if (hit.kind === "block") {

    const nextFlow =
      copySkinHomeCanvasObject(canvas.flow);

    nextFlow.blocks =
      canvas.flow.blocks.filter((item, index) => index !== hit.index);

    nextCanvas.flow = nextFlow;

  }
  else {

    const frameHit =
      skinHomeCanvasV2FrameHit(canvas, hit.parentId);

    if (!frameHit) {
      return { ok: false, reason: "frame" };
    }

    if (frameHit.node.props.primaryId === value.id) {
      return { ok: false, reason: "primary" };
    }

    nextCanvas.flow =
      skinHomeCanvasV2FlowWithFrameElements(
        canvas.flow,
        frameHit,
        frameHit.node.props.elements.filter((item, index) => index !== hit.index)
      );

  }

  const verdict =
    (typeof validateSkinCanvasV2Data === "function")
      ? validateSkinCanvasV2Data(nextCanvas, "canvas")
      : { ok: true };

  if (!verdict.ok) {
    return { ok: false, reason: "invalid", path: verdict.path, message: verdict.message };
  }

  return {
    ok: true,
    regions: skinHomeCanvasV2ReplaceCanvas(regions, located.found, nextCanvas),
    id: value.id,
    kind: hit.kind,
    parentId: hit.parentId
  };

}


/*
  writeSkinHomeCanvasV2NodeFollow(regions, id, next, expected)

    next      { follow: "transform", x, y, width, height }
              { follow: "pin", offsetX, offsetY, width, height,
                target, anchor, origin }
    expected  { follow }   지금의 따라가기 방식

  ★ **자리를 함께 쓴다.** `transform` 과 `pin` 은 쓰는 칸도 자도
    다르므로(§14-6 · §26-2), 방식만 바꾸고 좌표를 그대로 두면 장식이
    다른 자리로 튄다. 그래서 이 한 요청이 "방식 + 그 방식에서의
    지금 자리"를 함께 소유한다 — 한 번의 전환이 Undo 한 칸이다.

  ★ `pin` 으로 바뀔 때 `target` · `anchor` · `origin` 을 **함께
    적는다**. 부르는 쪽(자를 아는 곳)이 자리를 유지하는 기준점을
    골라 오기 때문이고, 그것을 여기서 다시 고르면 계산과 저장이
    갈라진다.

  ★ 반대 방향(`pin` → `transform`)에서는 `pin` 을 지우지 않는다 —
    다시 pin 으로 돌아올 때 그 설정이 살아 있어야 한다(§14-6).
*/
function writeSkinHomeCanvasV2NodeFollow(regions, id, next, expected) {

  if (!isSkinHomeCanvasPlainObject(next)) {
    return { ok: false, reason: "shape" };
  }

  const follow =
    next.follow;

  if (SKIN_HOME_CANVAS_FOLLOW_MODES.indexOf(follow) === -1) {
    return { ok: false, reason: "follow" };
  }

  const toPin =
    follow === "pin";

  const keys =
    toPin
      ? ["follow", "offsetX", "offsetY", "width", "height",
         "target", "anchor", "origin"]
      : ["follow", "x", "y", "width", "height"];

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {

    keys: keys,
    kinds: ["frame-element"],

    checkNext: (value, node) => {

      if (!isSkinHomeCanvasSize(value.width)) {
        return "size";
      }

      if (value.height !== SKIN_HOME_CANVAS_AUTO_HEIGHT) {

        if (!isSkinHomeCanvasSize(value.height)) {
          return "size";
        }

      }
      else if (!skinHomeCanvasV2NodeAutoHeightAllowed(node)) {
        return "auto";
      }

      if (!toPin) {
        return (isSkinHomeCanvasCoord(value.x) && isSkinHomeCanvasCoord(value.y))
          ? null
          : "coord";
      }

      if (
        !isSkinHomeCanvasCoord(value.offsetX) ||
        !isSkinHomeCanvasCoord(value.offsetY)
      ) {
        return "coord";
      }

      return skinHomeCanvasV2CheckPinSettings(value);

    },

    /* `expected` 는 따라가기 방식 한 칸만 본다 — 나머지 네댓 칸은
       부르는 쪽이 방금 그 자에서 계산한 값이라 대조할 "지금 값"이
       없다(자가 바뀌는 전환이다). */
    readCurrent: (node, key) =>
      (key === "follow")
        ? (node.follow === "pin" ? "pin" : "transform")
        : undefined,

    applyNext: (nodeCopy, value, node) => {

      nodeCopy.follow = value.follow;
      nodeCopy.width = value.width;
      nodeCopy.height = value.height;

      if (!toPin) {

        nodeCopy.x = value.x;
        nodeCopy.y = value.y;

        return;

      }

      const pin =
        copySkinHomeCanvasObject(
          isSkinHomeCanvasPlainObject(node.pin) ? node.pin : {}
        );

      pin.target = value.target;
      pin.anchor = value.anchor;
      pin.origin = value.origin;
      pin.offset = { x: value.offsetX, y: value.offsetY };

      nodeCopy.pin = pin;

    }

  });

}


/* pin 의 세 칸 — 값 표는 skin/skin-home-canvas-v2.js 하나다 */
function skinHomeCanvasV2CheckPinSettings(value) {

  if (SKIN_HOME_CANVAS_PIN_TARGETS.indexOf(value.target) === -1) {
    return "target";
  }

  if (SKIN_HOME_CANVAS_PIN_POINTS.indexOf(value.anchor) === -1) {
    return "anchor";
  }

  return (SKIN_HOME_CANVAS_PIN_POINTS.indexOf(value.origin) === -1)
    ? "origin"
    : null;

}


/*
  writeSkinHomeCanvasV2NodePin(regions, id, next, expected)

    next · expected { target, anchor, origin, offsetX, offsetY }

  ★ 다섯 칸이 한 요청이다. 기준 대상 · 기준점 · 자기 기준점 중 하나만
    바뀌어도 **같은 자리에 있으려면 offset 이 함께 바뀌어야** 한다
    (§14-6 의 그 이유 — 편집기가 offset 을 몰래 다시 계산하면 안 되고,
    그래서 바꾸는 쪽이 셋과 offset 을 함께 소유한다).

  ★ `follow:"pin"` 인 요소에만 쓴다. transform 요소의 pin 은 보존
    대상이지 지금 쓰는 칸이 아니다 — 방식을 먼저 바꾼다.
*/
function writeSkinHomeCanvasV2NodePin(regions, id, next, expected) {

  return writeSkinHomeCanvasV2NodeFields(regions, id, next, expected, {

    keys: ["target", "anchor", "origin", "offsetX", "offsetY"],
    kinds: ["frame-element"],

    checkNext: (value, node, hit) => {

      if (!skinHomeCanvasV2NodeIsPinned(node, hit)) {
        return "pin";
      }

      if (
        !isSkinHomeCanvasCoord(value.offsetX) ||
        !isSkinHomeCanvasCoord(value.offsetY)
      ) {
        return "coord";
      }

      return skinHomeCanvasV2CheckPinSettings(value);

    },

    readCurrent: (node, key) => {

      if (key === "offsetX" || key === "offsetY") {
        return skinHomeCanvasV2ReadPinField(node, key);
      }

      const pin =
        isSkinHomeCanvasPlainObject(node.pin) ? node.pin : {};

      if (key === "target") {
        return (SKIN_HOME_CANVAS_PIN_TARGETS.indexOf(pin.target) !== -1)
          ? pin.target
          : SKIN_HOME_CANVAS_PIN_TARGETS[0];
      }

      /* 빠진 칸의 기본값은 실행 payload 를 만드는 그 자다
         (buildSkinCanvasPinPayload — anchor · origin 둘 다 center) */
      return (SKIN_HOME_CANVAS_PIN_POINTS.indexOf(pin[key]) !== -1)
        ? pin[key]
        : SKIN_HOME_CANVAS_V2_PIN_DEFAULT_POINT;

    },

    applyNext: (nodeCopy, value, node) => {

      const pin =
        copySkinHomeCanvasObject(
          isSkinHomeCanvasPlainObject(node.pin) ? node.pin : {}
        );

      pin.target = value.target;
      pin.anchor = value.anchor;
      pin.origin = value.origin;
      pin.offset = { x: value.offsetX, y: value.offsetY };

      nodeCopy.pin = pin;

    }

  });

}


if (typeof window !== "undefined") {

  window.findSkinHomeCanvasV2Node = findSkinHomeCanvasV2Node;
  window.listSkinHomeCanvasV2Nodes = listSkinHomeCanvasV2Nodes;

  window.writeSkinHomeCanvasV2BlockAlign = writeSkinHomeCanvasV2BlockAlign;
  window.writeSkinHomeCanvasV2BlockWidth = writeSkinHomeCanvasV2BlockWidth;
  window.writeSkinHomeCanvasV2BlockHeight = writeSkinHomeCanvasV2BlockHeight;
  window.writeSkinHomeCanvasV2BlockMargin = writeSkinHomeCanvasV2BlockMargin;
  window.writeSkinHomeCanvasV2BlockOrder = writeSkinHomeCanvasV2BlockOrder;
  window.writeSkinHomeCanvasV2NodeText = writeSkinHomeCanvasV2NodeText;

  /* HOME-CANVAS-V2-EDITOR-1B — 프레임 내부 요소 · overlay 의 자리 */
  window.writeSkinHomeCanvasV2NodePosition = writeSkinHomeCanvasV2NodePosition;
  window.writeSkinHomeCanvasV2NodeBox = writeSkinHomeCanvasV2NodeBox;
  window.writeSkinHomeCanvasV2NodePinOffset = writeSkinHomeCanvasV2NodePinOffset;
  window.writeSkinHomeCanvasV2NodePinBox = writeSkinHomeCanvasV2NodePinBox;
  window.writeSkinHomeCanvasV2NodeRotation = writeSkinHomeCanvasV2NodeRotation;

  /* HOME-CANVAS-V2-ADD-1 — 새 재료 하나 */
  window.writeSkinHomeCanvasV2AddNode = writeSkinHomeCanvasV2AddNode;

  /* HOME-CANVAS-V2-ELEMENTS-1 — 소속과 따라가기 */
  window.writeSkinHomeCanvasV2AttachNode = writeSkinHomeCanvasV2AttachNode;
  window.writeSkinHomeCanvasV2DetachNode = writeSkinHomeCanvasV2DetachNode;
  window.writeSkinHomeCanvasV2RemoveNode = writeSkinHomeCanvasV2RemoveNode;
  window.writeSkinHomeCanvasV2NodeFollow = writeSkinHomeCanvasV2NodeFollow;
  window.writeSkinHomeCanvasV2NodePin = writeSkinHomeCanvasV2NodePin;

  window.SKIN_HOME_CANVAS_V2_PIN_START_POINT =
    SKIN_HOME_CANVAS_V2_PIN_START_POINT;

}


if (typeof module !== "undefined" && module.exports) {

  const api = {
    findSkinHomeCanvasV2Node,
    listSkinHomeCanvasV2Nodes,
    writeSkinHomeCanvasV2NodeFields,
    writeSkinHomeCanvasV2BlockAlign,
    writeSkinHomeCanvasV2BlockWidth,
    writeSkinHomeCanvasV2BlockHeight,
    writeSkinHomeCanvasV2BlockMargin,
    writeSkinHomeCanvasV2BlockOrder,
    writeSkinHomeCanvasV2NodeText,
    skinHomeCanvasV2AutoHeightAllowed,

    /* HOME-CANVAS-V2-EDITOR-1B */
    SKIN_HOME_CANVAS_V2_FREE_KINDS,
    skinHomeCanvasV2NodeAutoHeightAllowed,
    writeSkinHomeCanvasV2NodePosition,
    writeSkinHomeCanvasV2NodeBox,
    writeSkinHomeCanvasV2NodePinOffset,
    writeSkinHomeCanvasV2NodePinBox,
    writeSkinHomeCanvasV2NodeRotation,

    /* HOME-CANVAS-V2-ADD-1 — 새 재료 하나 */
    SKIN_HOME_CANVAS_V2_ADD_TARGETS,
    SKIN_HOME_CANVAS_V2_SLOT_TYPES,
    SKIN_HOME_CANVAS_V2_BLOCK_DEFAULTS,
    SKIN_HOME_CANVAS_V2_OVERLAY_DEFAULTS,
    SKIN_HOME_CANVAS_V2_NEW_FRAME,
    SKIN_HOME_CANVAS_V2_NEW_TEXT,
    writeSkinHomeCanvasV2AddNode,

    /* HOME-CANVAS-V2-ELEMENTS-1 — 소속과 따라가기 */
    SKIN_HOME_CANVAS_V2_PIN_DEFAULT_POINT,
    SKIN_HOME_CANVAS_V2_PIN_START_POINT,
    skinHomeCanvasV2FrameHit,
    writeSkinHomeCanvasV2AttachNode,
    writeSkinHomeCanvasV2DetachNode,
    writeSkinHomeCanvasV2RemoveNode,
    writeSkinHomeCanvasV2NodeFollow,
    writeSkinHomeCanvasV2NodePin
  };

  module.exports = api;

  Object.assign(globalThis, api);

}
