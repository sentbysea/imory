/* =========================================================
   SKIN HOME CANVAS — v2 영구 그룹의 **순수 writer 와 수선**
   (HOME-CANVAS-GROUP-1A)

   기준 문서: docs/contracts/IMORY_HOME_CANVAS_CONTRACT.md §38
   설계:      docs/plans/IMORY_HOME_CANVAS_GROUP_DESIGN.md

   ── 그룹이 무엇인가 ────────────────────────────────────
   `canvas.groups` 는 **id 명단**이다. 그룹은 좌표도 렌더 DOM 도
   갖지 않고, 멤버 요소는 `overlays` · `props.elements` 의 **제자리에
   그대로** 있다.

     · 만들기 · 해제 · 넣기 · 빼기는 **좌표를 한 칸도 쓰지 않는다.**
       그래서 "화면이 안 바뀐다"가 계산해서 맞춘 결과가 아니라
       **구조적 사실**이다(왕복 오차 0 — 설계 §4-1).
     · 배열 순서를 바꾸지 않는다. 그래서 앞뒤 겹침 순서도 그대로다.
     · 실행 payload 에 실리지 않는다(buildSkinCanvasV2RenderPayload
       가 아는 칸만 싣는다) — 렌더러와 sandbox 봉투가 무변경이다.

   ── 여기 있는 것 ───────────────────────────────────────

     readSkinHomeCanvasV2Groups        regions → 그룹 명단(복사본)
     findSkinHomeCanvasV2Group         id 하나로 그룹 찾기
     skinHomeCanvasV2GroupOfMember     요소 id → 그 요소를 가진 그룹
     skinHomeCanvasV2GroupSpaceOf      요소 id → 좌표 공간 열쇠
     skinHomeCanvasV2NextGroupName     겹치지 않는 `그룹 N`

     writeSkinHomeCanvasV2GroupCreate    만들기
     writeSkinHomeCanvasV2GroupDissolve  해제(자식은 남는다)
     writeSkinHomeCanvasV2GroupJoin      넣기(다른 그룹에서 옮기기 포함)
     writeSkinHomeCanvasV2GroupLeave     빼기
     writeSkinHomeCanvasV2GroupRename    이름 변경
     writeSkinHomeCanvasV2GroupRemove    그룹과 **자식까지** 삭제

     pruneSkinHomeCanvasV2Groups         요소가 사라지거나 공간이
                                         바뀔 때 명단에서 뗀다
     repairSkinHomeCanvasV2Groups        낡은 명단 수선(Import)
     repairSkinHomeCanvasRegionGroups    같은 수선을 regions 단위로

   ── 규약은 §5 · §6 의 그것 그대로다 ────────────────────
   요청 하나 · 불변 이동 · 넣어 본 캔버스를 통째로
   `validateSkinCanvasV2Data()` 에 태우고, 막히면 regions 는 한
   글자도 바뀌지 않는다. 성공 · **변화 없음**(`unchanged:true`) ·
   거절(`reason`)을 가른다.

   ── Import 는 거부하지 않고 고친다 ─────────────────────
   낡은 명단(없는 id · 두 그룹에 걸친 요소 · 어긋난 좌표 공간)은
   **화면에 영향을 줄 수 없다** — 그룹은 그려지지 않기 때문이다.
   그래서 파일 전체를 못 열게 만들지 않고 수선하고, 무엇을
   고쳤는지 사람이 읽는 문장으로 알린다(계약 §38-8).

   ★ 반대로 **Import 밖의 writer 는 조용히 봐주지 않는다.** 위
     writer 들은 전부 거절하고 이유를 준다 — 조용히 고치지 않는
     것이 §9 다.

   ★ 이 파일은 skin/skin-home-canvas.js · skin-home-canvas-v2.js ·
     skin-home-canvas-write-v2.js **다음에** 로드된다(값 표 · 작은
     도구 · 트리 탐색을 call time 에 찾는다).
========================================================== */


/* =========================================================
   0. 읽기 — 언제나 복사본
========================================================== */

/* 이 canvas 의 그룹 배열(원본 참조). 없으면 빈 배열이다. */
function skinHomeCanvasV2GroupList(canvas) {

  return (canvas && Array.isArray(canvas.groups)) ? canvas.groups : [];

}


/*
  readSkinHomeCanvasV2Groups(regions) -> [{ id, name, members }]

  Studio 가 부르는 유일한 읽기 창구다. **그룹은 실행 payload 에
  실리지 않으므로**(계약 §38-1) 패널과 Layers 는 payload 가 아니라
  이 함수로 regions 의 원본을 본다.

  ★ 언제나 복사본이다 — 받은 쪽이 무엇을 해도 draft 가 바뀌지
    않는다(studioCanvasDraftPayload 와 같은 규칙).
*/
function readSkinHomeCanvasV2Groups(regions) {

  const located =
    (typeof skinHomeCanvasV2LocateCanvas === "function")
      ? skinHomeCanvasV2LocateCanvas(regions)
      : { ok: false };

  if (!located.ok) {
    return [];
  }

  return skinHomeCanvasV2GroupList(located.canvas).map(
    (group) => ({
      id: group.id,
      name:
        (typeof normalizeSkinHomeCanvasGroupName === "function")
          ? normalizeSkinHomeCanvasGroupName(group.name)
          : (typeof group.name === "string" ? group.name : null),
      members: Array.isArray(group.members) ? group.members.slice() : []
    })
  );

}


/* id 하나로 그룹 찾기 -> { group, index } | null */
function findSkinHomeCanvasV2Group(canvas, id) {

  if (typeof id !== "string" || !id) {
    return null;
  }

  const groups =
    skinHomeCanvasV2GroupList(canvas);

  for (let i = 0; i < groups.length; i += 1) {

    if (isSkinHomeCanvasPlainObject(groups[i]) && groups[i].id === id) {
      return { group: groups[i], index: i };
    }

  }

  return null;

}


/* 그 요소를 갖고 있는 그룹 -> { group, index } | null */
function skinHomeCanvasV2GroupOfMember(canvas, memberId) {

  if (typeof memberId !== "string" || !memberId) {
    return null;
  }

  const groups =
    skinHomeCanvasV2GroupList(canvas);

  for (let i = 0; i < groups.length; i += 1) {

    const group = groups[i];

    if (
      isSkinHomeCanvasPlainObject(group) &&
      Array.isArray(group.members) &&
      group.members.indexOf(memberId) !== -1
    ) {
      return { group: group, index: i };
    }

  }

  return null;

}


/*
  skinHomeCanvasV2GroupSpaceOf(canvas, id) -> 공간 열쇠 | null

    "overlay"            도화지 자 — 페이지 자유 장식
    "frame:<frameId>"    그 프레임 — 내부 `transform` 과 `pin` 을 **함께**

  ★ 같은 프레임 안에서는 `follow` 가 달라도 한 공간이다(설계 §4-4).
    프레임 내부 자와 프레임 상자 자가 다르지만 둘 다 **그 프레임의
    자**이고, 조작은 멤버마다 자기 자로 환산한다(1B · 1C).

  ★ 블록은 null 이다 — 블록에는 `x`·`y` 가 없다(순서 · align ·
    margin). 좌표가 없는 것을 함께 옮길 수 없으므로 그룹의 멤버가
    될 수 없다.
*/
function skinHomeCanvasV2GroupSpaceOf(canvas, id) {

  const hit =
    (typeof findSkinHomeCanvasV2Node === "function")
      ? findSkinHomeCanvasV2Node(canvas, id)
      : null;

  if (!hit) {
    return null;
  }

  if (hit.kind === "overlay") {
    return "overlay";
  }

  if (hit.kind === "frame-element" && hit.parentId) {
    return `frame:${hit.parentId}`;
  }

  return null;

}


/* 그 그룹이 놓인 공간 — **지금 풀리는 첫 멤버**가 정한다 */
function skinHomeCanvasV2GroupSpace(canvas, group) {

  const members =
    (group && Array.isArray(group.members)) ? group.members : [];

  for (let i = 0; i < members.length; i += 1) {

    const space =
      skinHomeCanvasV2GroupSpaceOf(canvas, members[i]);

    if (space) {
      return space;
    }

  }

  return null;

}


/*
  skinHomeCanvasV2NextGroupName(canvas) -> "그룹 N"

  ★ **자리로 계산하지 않는다.** `그룹 1` 을 지웠을 때 `그룹 2` 가
    `그룹 1` 로 바뀌면 사용자는 다른 폴더를 보게 된다(설계 §6-2).
    지금 쓰이는 `그룹 N` 꼴의 **최대 N + 1** 이다.
*/
function skinHomeCanvasV2NextGroupName(canvas) {

  const prefix =
    (typeof SKIN_HOME_CANVAS_GROUP_NAME_PREFIX === "string")
      ? SKIN_HOME_CANVAS_GROUP_NAME_PREFIX
      : "그룹";

  let max = 0;

  skinHomeCanvasV2GroupList(canvas).forEach(
    (group) => {

      const name =
        (typeof normalizeSkinHomeCanvasGroupName === "function")
          ? normalizeSkinHomeCanvasGroupName(group && group.name)
          : null;

      if (!name || name.indexOf(`${prefix} `) !== 0) {
        return;
      }

      const rest =
        name.slice(prefix.length + 1);

      if (!/^[0-9]{1,6}$/.test(rest)) {
        return;
      }

      const value =
        Number(rest);

      if (value > max) {
        max = value;
      }

    }
  );

  return `${prefix} ${max + 1}`;

}


/* 이 캔버스가 쓰고 있는 id 전부(요소 · 블록 · 그룹) — 새 id 를
   만들 때 부딪히지 않게 */
function skinHomeCanvasV2UsedIds(canvas) {

  const used = new Set();

  if (typeof listSkinHomeCanvasV2Nodes === "function") {
    listSkinHomeCanvasV2Nodes(canvas).forEach((node) => used.add(node.id));
  }

  skinHomeCanvasV2GroupList(canvas).forEach(
    (group) => {

      if (isSkinHomeCanvasPlainObject(group) && typeof group.id === "string") {
        used.add(group.id);
      }

    }
  );

  return used;

}


/* 멤버를 **캔버스 배열 순서**로 정렬한다 — 폴더의 자식 순서가
   원본의 상대 순서를 그대로 따르게(계약 §38-4) */
function skinHomeCanvasV2SortMembers(canvas, ids) {

  const order =
    (typeof listSkinHomeCanvasV2Nodes === "function")
      ? listSkinHomeCanvasV2Nodes(canvas).map((node) => node.id)
      : [];

  const known =
    ids.filter((id) => order.indexOf(id) !== -1)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));

  /* 순서를 모르는 id(있을 수 없지만 방어적으로)는 뒤에 그대로 */
  const rest =
    ids.filter((id) => order.indexOf(id) === -1);

  return known.concat(rest);

}


/* =========================================================
   1. 불변 쓰기의 공통 자리
========================================================== */

/*
  그룹 배열 하나만 갈아 끼운 **새 canvas**.

  ★ 비면 칸 자체를 뺀다 — "빠진 것"과 "빈 배열"이 같은 뜻이므로
    (계약 §38-1) 한 모양만 저장한다. 해제를 되풀이해도 JSON 에
    빈 배열이 쌓이지 않는다.
*/
function skinHomeCanvasV2CanvasWithGroups(canvas, groups) {

  const nextCanvas =
    copySkinHomeCanvasObject(canvas);

  if (groups.length) {
    nextCanvas.groups = groups;
  }
  else {
    delete nextCanvas.groups;
  }

  return nextCanvas;

}


/* 그룹 하나만 새 객체로 바꾼 **새 배열**(나머지는 같은 참조) */
function skinHomeCanvasV2GroupsWith(canvas, index, nextGroup) {

  const groups =
    skinHomeCanvasV2GroupList(canvas);

  if (nextGroup === null) {
    return groups.filter((item, at) => at !== index);
  }

  return groups.map((item, at) => (at === index ? nextGroup : item));

}


/* 넣어 본 캔버스를 통째로 다시 검증하고 새 regions 를 만든다 */
function skinHomeCanvasV2CommitGroups(located, groups, extra) {

  const nextCanvas =
    skinHomeCanvasV2CanvasWithGroups(located.canvas, groups);

  const verdict =
    (typeof validateSkinCanvasV2Data === "function")
      ? validateSkinCanvasV2Data(nextCanvas, "canvas")
      : { ok: true };

  if (!verdict.ok) {
    return { ok: false, reason: "invalid", path: verdict.path, message: verdict.message };
  }

  return Object.assign(
    {
      ok: true,
      regions:
        skinHomeCanvasV2ReplaceCanvas(located.regions, located.found, nextCanvas)
    },
    extra || {}
  );

}


/* 모든 그룹 writer 의 첫 줄 — v2 캔버스를 찾고 regions 를 들고 있는다 */
function skinHomeCanvasV2GroupLocate(regions) {

  const located =
    (typeof skinHomeCanvasV2LocateCanvas === "function")
      ? skinHomeCanvasV2LocateCanvas(regions)
      : { ok: false, reason: "unsupported" };

  if (!located.ok) {
    return located;
  }

  located.regions = regions;

  return located;

}


/* =========================================================
   2. 만들기
========================================================== */

/*
  writeSkinHomeCanvasV2GroupCreate(regions, request)

    request { ids: [id, id, …], name? }

    -> { ok:true, regions, id, name, members }
    -> { ok:false, reason }

      reason  "shape"   요청 모양이 아니다
              "count"   2개 미만
              "dupe"    같은 id 가 두 번
              "missing" 그 id 가 이 캔버스에 없다
              "kind"    블록(좌표가 없다)이다
              "space"   좌표 공간이 섞여 있다
              "member"  이미 다른 그룹에 들어 있다
              "id"      새 그룹 id 를 만들지 못했다
              "name"    이름이 규칙 밖이다

  ★ **요소를 한 칸도 건드리지 않는다.** 좌표 · geometry · 배열
    순서 · 렌더 결과가 전부 그대로이고, 늘어나는 것은
    `canvas.groups` 한 항목뿐이다.
*/
function writeSkinHomeCanvasV2GroupCreate(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value || !Array.isArray(value.ids)) {
    return { ok: false, reason: "shape" };
  }

  const min =
    (typeof SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS === "number")
      ? SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS
      : 2;

  if (value.ids.length < min) {
    return { ok: false, reason: "count" };
  }

  const located =
    skinHomeCanvasV2GroupLocate(regions);

  if (!located.ok) {
    return located;
  }

  const canvas =
    located.canvas;

  const seen = new Set();

  let space = null;

  for (let i = 0; i < value.ids.length; i += 1) {

    const id = value.ids[i];

    if (
      typeof id !== "string" ||
      !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(id)
    ) {
      return { ok: false, reason: "shape" };
    }

    if (seen.has(id)) {
      return { ok: false, reason: "dupe" };
    }

    seen.add(id);

    const hit =
      findSkinHomeCanvasV2Node(canvas, id);

    if (!hit) {
      return { ok: false, reason: "missing" };
    }

    const mine =
      skinHomeCanvasV2GroupSpaceOf(canvas, id);

    /* 블록 · `main_visual` 프레임 자체는 좌표가 없다 */
    if (!mine) {
      return { ok: false, reason: "kind" };
    }

    if (space === null) {
      space = mine;
    }
    else if (space !== mine) {
      return { ok: false, reason: "space" };
    }

    if (skinHomeCanvasV2GroupOfMember(canvas, id)) {
      return { ok: false, reason: "member" };
    }

  }

  const name =
    (value.name === undefined || value.name === null)
      ? skinHomeCanvasV2NextGroupName(canvas)
      : normalizeSkinHomeCanvasGroupName(value.name);

  if (!name || name.length > SKIN_HOME_CANVAS_GROUP_NAME_MAX) {
    return { ok: false, reason: "name" };
  }

  const groupId =
    skinHomeCanvasV2NewId(skinHomeCanvasV2UsedIds(canvas));

  if (!groupId) {
    return { ok: false, reason: "id" };
  }

  const members =
    skinHomeCanvasV2SortMembers(canvas, value.ids.slice());

  const groups =
    skinHomeCanvasV2GroupList(canvas).concat([
      { id: groupId, name: name, members: members }
    ]);

  return skinHomeCanvasV2CommitGroups(
    located,
    groups,
    { id: groupId, name: name, members: members.slice() }
  );

}


/* =========================================================
   3. 해제 — 폴더만 없앤다
========================================================== */

/*
  writeSkinHomeCanvasV2GroupDissolve(regions, { id })

  ★ 자식은 **모두 그대로** 남는다. 좌표 0칸 · 배열 순서 0칸이라
    화면과 앞뒤 순서가 한 픽셀도 바뀌지 않는다.
*/
function writeSkinHomeCanvasV2GroupDissolve(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2GroupLocate(regions);

  if (!located.ok) {
    return located;
  }

  const hit =
    findSkinHomeCanvasV2Group(located.canvas, value.id);

  if (!hit) {
    return { ok: false, reason: "group" };
  }

  return skinHomeCanvasV2CommitGroups(
    located,
    skinHomeCanvasV2GroupsWith(located.canvas, hit.index, null),
    { id: value.id, members: (hit.group.members || []).slice() }
  );

}


/* =========================================================
   4. 넣기 · 빼기
========================================================== */

/* 멤버 하나를 뺀 그룹 배열 — 남은 수가 최소 미만이면 그룹째 뺀다.
   그 해제는 **같은 커밋 · 같은 Undo 한 칸**이다(계약 §38-5). */
function skinHomeCanvasV2GroupsWithout(canvas, ownerIndex, memberId) {

  const groups =
    skinHomeCanvasV2GroupList(canvas);

  const owner =
    groups[ownerIndex];

  const members =
    (owner.members || []).filter((item) => item !== memberId);

  const min =
    (typeof SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS === "number")
      ? SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS
      : 2;

  if (members.length < min) {
    return {
      groups: groups.filter((item, at) => at !== ownerIndex),
      dissolved: owner.id
    };
  }

  const nextOwner =
    copySkinHomeCanvasObject(owner);

  nextOwner.members = members;

  return {
    groups: groups.map((item, at) => (at === ownerIndex ? nextOwner : item)),
    dissolved: null
  };

}


/*
  writeSkinHomeCanvasV2GroupJoin(regions, { id, groupId })

  기존 레이어 하나를 그 그룹에 넣는다. **다른 그룹에 있던 것도
  같은 요청 하나로** 옮긴다 — 뗀 상태와 붙인 상태 사이의 반쪽
  저장이 생기지 않는다(계약 §38-5).

    -> { ok:true, regions, id, groupId, from, dissolved }
    -> { ok:true, unchanged:true }            이미 그 그룹이다
    -> { ok:false, reason }
*/
function writeSkinHomeCanvasV2GroupJoin(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (
    !value ||
    typeof value.id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(value.id)
  ) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2GroupLocate(regions);

  if (!located.ok) {
    return located;
  }

  const canvas =
    located.canvas;

  const target =
    findSkinHomeCanvasV2Group(canvas, value.groupId);

  if (!target) {
    return { ok: false, reason: "group" };
  }

  if (!findSkinHomeCanvasV2Node(canvas, value.id)) {
    return { ok: false, reason: "missing" };
  }

  /* 그룹을 다른 그룹 안에 넣을 수 없다 — 평평한 한 단계다 */
  if (findSkinHomeCanvasV2Group(canvas, value.id)) {
    return { ok: false, reason: "nest" };
  }

  const mine =
    skinHomeCanvasV2GroupSpaceOf(canvas, value.id);

  if (!mine) {
    return { ok: false, reason: "kind" };
  }

  const theirs =
    skinHomeCanvasV2GroupSpace(canvas, target.group);

  if (!theirs || theirs !== mine) {
    return { ok: false, reason: "space" };
  }

  const owner =
    skinHomeCanvasV2GroupOfMember(canvas, value.id);

  if (owner && owner.group.id === value.groupId) {
    return { ok: true, unchanged: true, id: value.id, groupId: value.groupId };
  }


  /* ── 1) 옛 그룹에서 뗀다(있으면) ── */

  let groups =
    skinHomeCanvasV2GroupList(canvas);

  let dissolved = null;

  if (owner) {

    const without =
      skinHomeCanvasV2GroupsWithout(canvas, owner.index, value.id);

    groups = without.groups;

    dissolved = without.dissolved;

  }


  /* ── 2) 새 그룹에 붙인다 — 자리는 **캔버스 배열 순서** ── */

  const at =
    groups.findIndex(
      (item) => isSkinHomeCanvasPlainObject(item) && item.id === value.groupId
    );

  if (at === -1) {
    /* 옮기려던 대상 그룹이 방금 해제됐다(멤버가 둘이었고 그 하나가
       이 요소였다) — 넣을 곳이 없다 */
    return { ok: false, reason: "group" };
  }

  const nextGroup =
    copySkinHomeCanvasObject(groups[at]);

  nextGroup.members =
    skinHomeCanvasV2SortMembers(
      canvas,
      (groups[at].members || []).concat([value.id])
    );

  groups =
    groups.map((item, index) => (index === at ? nextGroup : item));

  return skinHomeCanvasV2CommitGroups(
    located,
    groups,
    {
      id: value.id,
      groupId: value.groupId,
      from: owner ? owner.group.id : null,
      dissolved: dissolved
    }
  );

}


/*
  writeSkinHomeCanvasV2GroupLeave(regions, { id })

  그 요소를 자기 그룹에서 뺀다. **배열 자리는 그대로다** — 소속만
  바뀌므로 화면 위치 · geometry · 겹침 순서가 한 칸도 안 변한다.

    -> { ok:true, regions, id, groupId, dissolved }
    -> { ok:true, unchanged:true }   원래 어느 그룹에도 없었다
*/
function writeSkinHomeCanvasV2GroupLeave(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (
    !value ||
    typeof value.id !== "string" ||
    !SKIN_HOME_CANVAS_ELEMENT_ID_PATTERN.test(value.id)
  ) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2GroupLocate(regions);

  if (!located.ok) {
    return located;
  }

  const owner =
    skinHomeCanvasV2GroupOfMember(located.canvas, value.id);

  if (!owner) {
    return { ok: true, unchanged: true, id: value.id };
  }

  const without =
    skinHomeCanvasV2GroupsWithout(located.canvas, owner.index, value.id);

  return skinHomeCanvasV2CommitGroups(
    located,
    without.groups,
    { id: value.id, groupId: owner.group.id, dissolved: without.dissolved }
  );

}


/* =========================================================
   5. 이름 변경
========================================================== */

/*
  writeSkinHomeCanvasV2GroupRename(regions, { id, name })

  ★ **이름만** 바뀐다. 요소 id 도 `members` 참조도 그대로다.
  ★ 같은 이름이면 변화 없음(0칸)이다 — 정규화한 뒤에 비교한다.
*/
function writeSkinHomeCanvasV2GroupRename(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  const name =
    normalizeSkinHomeCanvasGroupName(value.name);

  if (!name) {
    return { ok: false, reason: "name" };
  }

  if (name.length > SKIN_HOME_CANVAS_GROUP_NAME_MAX) {
    return { ok: false, reason: "name" };
  }

  const located =
    skinHomeCanvasV2GroupLocate(regions);

  if (!located.ok) {
    return located;
  }

  const hit =
    findSkinHomeCanvasV2Group(located.canvas, value.id);

  if (!hit) {
    return { ok: false, reason: "group" };
  }

  const previous =
    normalizeSkinHomeCanvasGroupName(hit.group.name);

  if (previous === name) {
    return { ok: true, unchanged: true, id: value.id, name: name };
  }

  const nextGroup =
    copySkinHomeCanvasObject(hit.group);

  nextGroup.name = name;

  return skinHomeCanvasV2CommitGroups(
    located,
    skinHomeCanvasV2GroupsWith(located.canvas, hit.index, nextGroup),
    { id: value.id, name: name, previous: previous }
  );

}


/* =========================================================
   6. 삭제 — 그룹과 **자식까지**
========================================================== */

/*
  writeSkinHomeCanvasV2GroupRemove(regions, { id })

  ★ 해제와 **다른 동작**이다. 해제는 폴더만 없애고 자식을 남기며,
    이 함수는 자식 요소를 전부 지운다. 부르는 쪽이 글자로 그 둘을
    가른다(계약 §38-7).

  ★ 멤버 중 하나가 그 프레임의 **대표 사진**이면 전체를 거부한다
    (`reason:"primary"`) — 일부만 지운 상태를 만들지 않는다.

  ★ 한 번이 Undo 한 칸이다. 지워진 자식 · 지워진 그룹 · 풀린 선택이
    함께 되돌아온다.
*/
function writeSkinHomeCanvasV2GroupRemove(regions, request) {

  const value =
    isSkinHomeCanvasPlainObject(request) ? request : null;

  if (!value) {
    return { ok: false, reason: "shape" };
  }

  const located =
    skinHomeCanvasV2GroupLocate(regions);

  if (!located.ok) {
    return located;
  }

  const canvas =
    located.canvas;

  const hit =
    findSkinHomeCanvasV2Group(canvas, value.id);

  if (!hit) {
    return { ok: false, reason: "group" };
  }

  const members =
    (hit.group.members || []).slice();

  /* 실제로 풀리는 멤버만 지운다 — 낡은 id 는 지울 것이 없다 */
  const doomed =
    members.filter((id) => !!findSkinHomeCanvasV2Node(canvas, id));

  /* 대표 사진 검사가 **먼저**다 — 반쪽 상태를 만들지 않는다 */
  for (let i = 0; i < doomed.length; i += 1) {

    const node =
      findSkinHomeCanvasV2Node(canvas, doomed[i]);

    if (node.kind !== "frame-element") {
      continue;
    }

    const frameHit =
      skinHomeCanvasV2FrameHit(canvas, node.parentId);

    if (frameHit && frameHit.node.props.primaryId === doomed[i]) {
      return { ok: false, reason: "primary" };
    }

  }

  const gone =
    new Set(doomed);

  let nextCanvas =
    copySkinHomeCanvasObject(canvas);

  /* ── overlays ── */

  if (Array.isArray(canvas.overlays)) {

    const kept =
      canvas.overlays.filter((item) => !(item && gone.has(item.id)));

    if (kept.length !== canvas.overlays.length) {
      nextCanvas.overlays = kept;
    }

  }

  /* ── 프레임 내부 요소 — 프레임마다 한 번 ── */

  const frames =
    new Set();

  doomed.forEach(
    (id) => {

      const node =
        findSkinHomeCanvasV2Node(canvas, id);

      if (node && node.kind === "frame-element" && node.parentId) {
        frames.add(node.parentId);
      }

    }
  );

  frames.forEach(
    (frameId) => {

      const frameHit =
        skinHomeCanvasV2FrameHit(nextCanvas, frameId);

      if (!frameHit) {
        return;
      }

      nextCanvas.flow =
        skinHomeCanvasV2FlowWithFrameElements(
          nextCanvas.flow,
          frameHit,
          frameHit.node.props.elements.filter((item) => !(item && gone.has(item.id)))
        );

    }
  );

  /* ── 그룹 자신 ── */

  const groups =
    skinHomeCanvasV2GroupList(canvas).filter((item, at) => at !== hit.index);

  nextCanvas =
    skinHomeCanvasV2CanvasWithGroups(nextCanvas, groups);

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
    members: members,
    removed: doomed
  };

}


/* =========================================================
   7. 명단이 낡을 때 — 떼기와 수선

   B-2(id 명단) 가 짊어진 **유일한 비용**이다. 요소를 지우거나
   좌표 공간을 옮기면 명단이 따라오지 않는다. 화면에는 영향이
   없지만(그룹은 그려지지 않는다) 폴더가 비어 보일 수 있다.

   그래서 **쓰는 쪽에서** 고친다 — 읽을 때가 아니라(§9 조용히
   고치지 않는다) 그 요소를 실제로 건드리는 그 커밋에서.
========================================================== */

/*
  pruneSkinHomeCanvasV2Groups(canvas, ids) -> { groups, changed }

  그 id 들을 모든 그룹의 명단에서 뗀다. 남은 수가 최소 미만이 된
  그룹은 사라진다.

  부르는 곳 셋(skin/skin-home-canvas-write-v2.js)

    remove  요소가 아예 없어진다
    attach  overlay → 프레임 안 : **좌표 공간이 바뀐다**
    detach  프레임 안 → overlay : 〃

  ★ attach · detach 에서 떼는 이유는 "한 그룹은 한 좌표 공간"이
    그룹의 성립 조건이기 때문이다(계약 §38-2). 옮긴 요소를 명단에
    남겨 두면 그 그룹이 두 자에 걸친다.
*/
function pruneSkinHomeCanvasV2Groups(canvas, ids) {

  const doomed =
    new Set(Array.isArray(ids) ? ids : [ids]);

  const groups =
    skinHomeCanvasV2GroupList(canvas);

  if (!groups.length || !doomed.size) {
    return { groups: groups, changed: false };
  }

  const min =
    (typeof SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS === "number")
      ? SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS
      : 2;

  let changed = false;

  const next = [];

  groups.forEach(
    (group) => {

      if (!isSkinHomeCanvasPlainObject(group) || !Array.isArray(group.members)) {
        next.push(group);
        return;
      }

      const members =
        group.members.filter((id) => !doomed.has(id));

      if (members.length === group.members.length) {
        next.push(group);
        return;
      }

      changed = true;

      if (members.length < min) {
        return;
      }

      const copy =
        copySkinHomeCanvasObject(group);

      copy.members = members;

      next.push(copy);

    }
  );

  return { groups: next, changed: changed };

}


/*
  repairSkinHomeCanvasV2Groups(canvas)
    -> { groups, changed, repairedGroups, removedMembers }

  Import 가 부르는 수선이다. **거부하지 않고 고친다**(계약 §38-8).

    1  없는 member id 를 뺀다(지워진 요소 · 그룹 id · 오타)
    2  좌표가 없는 것(블록 · `main_visual` 프레임 자체)을 뺀다
    3  같은 그룹 안의 중복을 뺀다
    4  이미 앞 그룹이 가진 요소를 뺀다 — **먼저 나온 유효 그룹만**
       인정한다
    5  좌표 공간이 섞여 있으면 **첫 멤버의 공간**만 남긴다
    6  남은 수가 최소 미만이면 그 그룹을 뺀다

  ★ 모양이 잘못된 항목(객체가 아니다 · id 규칙 위반 · members 가
    배열이 아니다)은 **손대지 않는다.** 그것은 수선이 아니라
    거부이고, 검증기가 경로와 함께 말한다.
*/
function repairSkinHomeCanvasV2Groups(canvas) {

  const groups =
    skinHomeCanvasV2GroupList(canvas);

  if (!groups.length) {
    return { groups: groups, changed: false, repairedGroups: 0, removedMembers: 0 };
  }

  const min =
    (typeof SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS === "number")
      ? SKIN_HOME_CANVAS_GROUP_MIN_MEMBERS
      : 2;

  /* 이미 임자가 있는 요소 — 앞 그룹이 이긴다 */
  const claimed = new Set();

  let repairedGroups = 0;

  let removedMembers = 0;

  const next = [];

  groups.forEach(
    (group) => {

      if (
        !isSkinHomeCanvasPlainObject(group) ||
        typeof group.id !== "string" ||
        !Array.isArray(group.members)
      ) {
        /* 검증기가 거부할 모양이다 — 그대로 둔다 */
        next.push(group);
        return;
      }

      const mine = new Set();

      const kept = [];

      let space = null;

      group.members.forEach(
        (id) => {

          if (typeof id !== "string" || mine.has(id) || claimed.has(id)) {
            removedMembers += 1;
            return;
          }

          const where =
            skinHomeCanvasV2GroupSpaceOf(canvas, id);

          /* 없는 id · 블록 · 프레임 자체 */
          if (!where) {
            removedMembers += 1;
            return;
          }

          if (space === null) {
            space = where;
          }
          else if (space !== where) {
            removedMembers += 1;
            return;
          }

          mine.add(id);

          kept.push(id);

        }
      );

      /* 그룹째 사라진다 — 남은 멤버는 **임자 없음**으로 둔다.
         그래야 뒤 그룹이 같은 요소를 정당하게 가져갈 수 있다. */
      if (kept.length < min) {
        repairedGroups += 1;
        return;
      }

      kept.forEach((id) => claimed.add(id));

      if (
        kept.length === group.members.length &&
        kept.every((id, at) => id === group.members[at])
      ) {
        next.push(group);
        return;
      }

      repairedGroups += 1;

      const copy =
        copySkinHomeCanvasObject(group);

      copy.members = kept;

      next.push(copy);

    }
  );

  return {
    groups: next,
    changed: repairedGroups > 0,
    repairedGroups: repairedGroups,
    removedMembers: removedMembers
  };

}


/*
  repairSkinHomeCanvasRegionGroups(regions)
    -> { regions, changed, repairedGroups, removedMembers }

  Import 의 입구가 부르는 한 줄이다(skin/skin-package-import.js).
  `home_canvas` 이름의 항목 **하나**만 본다 — 모르는 이름과 모르는
  칸은 지금까지처럼 그대로 보존한다.

  ★ **검증보다 먼저** 부른다. 수선이 끝난 명단을 검증기가 다시
    보므로, "고칠 수 있는 낡음"과 "고칠 수 없는 모양 오류"가
    갈린다(계약 §38-8).

  ★ v2 가 아니면 아무것도 하지 않는다. v1 에서 `groups` 는 모르는
    칸이고, 모르는 칸은 보존한다.
*/
function repairSkinHomeCanvasRegionGroups(regions) {

  const empty =
    { regions: regions, changed: false, repairedGroups: 0, removedMembers: 0 };

  if (!Array.isArray(regions)) {
    return empty;
  }

  const located =
    (typeof skinHomeCanvasV2LocateCanvas === "function")
      ? skinHomeCanvasV2LocateCanvas(regions)
      : { ok: false };

  if (!located.ok) {
    return empty;
  }

  const result =
    repairSkinHomeCanvasV2Groups(located.canvas);

  if (!result.changed) {
    return empty;
  }

  const nextCanvas =
    skinHomeCanvasV2CanvasWithGroups(located.canvas, result.groups);

  return {
    regions: skinHomeCanvasV2ReplaceCanvas(regions, located.found, nextCanvas),
    changed: true,
    repairedGroups: result.repairedGroups,
    removedMembers: result.removedMembers
  };

}


/*
  수선 결과를 사람이 읽는 문장으로 — Import 완료 안내가 그대로 쓴다.
  고친 것이 없으면 빈 배열이다.
*/
function describeSkinHomeCanvasGroupRepair(result) {

  if (!result || !result.changed) {
    return [];
  }

  const parts = [];

  if (result.repairedGroups) {
    parts.push(`그룹 ${result.repairedGroups}개`);
  }

  if (result.removedMembers) {
    parts.push(`잘못된 멤버 ${result.removedMembers}개`);
  }

  if (!parts.length) {
    return [];
  }

  return [
    `HOME 캔버스의 ${parts.join(" · ")}를 정리하고 가져왔습니다 — ` +
    "없는 요소 · 두 그룹에 걸친 요소 · 좌표 공간이 다른 요소를 명단에서 뺐고, " +
    "멤버가 둘 미만이 된 그룹은 해제했습니다(요소 자체는 하나도 지우지 않았습니다)."
  ];

}


if (typeof window !== "undefined") {

  window.readSkinHomeCanvasV2Groups = readSkinHomeCanvasV2Groups;
  window.findSkinHomeCanvasV2Group = findSkinHomeCanvasV2Group;
  window.skinHomeCanvasV2GroupOfMember = skinHomeCanvasV2GroupOfMember;
  window.skinHomeCanvasV2GroupSpaceOf = skinHomeCanvasV2GroupSpaceOf;
  window.skinHomeCanvasV2GroupSpace = skinHomeCanvasV2GroupSpace;
  window.skinHomeCanvasV2NextGroupName = skinHomeCanvasV2NextGroupName;

  window.writeSkinHomeCanvasV2GroupCreate = writeSkinHomeCanvasV2GroupCreate;
  window.writeSkinHomeCanvasV2GroupDissolve = writeSkinHomeCanvasV2GroupDissolve;
  window.writeSkinHomeCanvasV2GroupJoin = writeSkinHomeCanvasV2GroupJoin;
  window.writeSkinHomeCanvasV2GroupLeave = writeSkinHomeCanvasV2GroupLeave;
  window.writeSkinHomeCanvasV2GroupRename = writeSkinHomeCanvasV2GroupRename;
  window.writeSkinHomeCanvasV2GroupRemove = writeSkinHomeCanvasV2GroupRemove;

  window.pruneSkinHomeCanvasV2Groups = pruneSkinHomeCanvasV2Groups;
  window.repairSkinHomeCanvasV2Groups = repairSkinHomeCanvasV2Groups;
  window.repairSkinHomeCanvasRegionGroups = repairSkinHomeCanvasRegionGroups;
  window.describeSkinHomeCanvasGroupRepair = describeSkinHomeCanvasGroupRepair;

}


if (typeof module !== "undefined" && module.exports) {

  const api = {
    skinHomeCanvasV2GroupList,
    readSkinHomeCanvasV2Groups,
    findSkinHomeCanvasV2Group,
    skinHomeCanvasV2GroupOfMember,
    skinHomeCanvasV2GroupSpaceOf,
    skinHomeCanvasV2GroupSpace,
    skinHomeCanvasV2NextGroupName,

    writeSkinHomeCanvasV2GroupCreate,
    writeSkinHomeCanvasV2GroupDissolve,
    writeSkinHomeCanvasV2GroupJoin,
    writeSkinHomeCanvasV2GroupLeave,
    writeSkinHomeCanvasV2GroupRename,
    writeSkinHomeCanvasV2GroupRemove,

    pruneSkinHomeCanvasV2Groups,
    repairSkinHomeCanvasV2Groups,
    repairSkinHomeCanvasRegionGroups,
    describeSkinHomeCanvasGroupRepair
  };

  module.exports = api;

  Object.assign(globalThis, api);

}
