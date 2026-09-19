/* =========================================================
   SKIN BOTTOM DOCK — 표시 채우기 (DOM, 렌더 뒤)

   기준 문서: IMORY_BOTTOM_DOCK_DESIGN.md §3 · §9

   Studio 의 Dock 패널은 항목과 열기 버튼의 **표시**를 네 가지로만
   고르게 한다 — 아이콘 · 이모지 · 글자 · 이미지 주소. 사용자는 고른
   것이 화면에 나온다고 믿는다. 그런데 그것을 그리는 것은 스킨의
   templates.dock 이고, 스킨마다 받는 재료가 다르다:

     · 플랫폼 기본 template — 아이콘 자리가 비어 있다(모양은 스킨
       CSS 가 [data-kind] 로 그리는 계약이었다)
     · 어떤 스킨은 트리거에 글자만 받는다(dock.trigger.text) — 거기서
       아이콘이나 이미지를 고르면 **빈 버튼**이 된다
     · 어떤 스킨은 [data-kind="home"]::before 로 자기 그림을 그린다

   이 파일은 그 틈만 메운다. 원칙은 하나다:

     ★ 스킨이 그렸으면 손대지 않는다. 스킨이 아무것도 보여 주지
       않을 때만 플랫폼이 고른 표시를 넣는다.

   ── 무엇을 넣나 ──────────────────────────────────────────
     아이콘   <span data-imory-dock-icon="heart" aria-hidden="true">
              (그림은 skin/skin-dock-icons.css — 아이모리 목록에 있는
               이름일 때만. 스킨 고유 낱말은 여전히 스킨 CSS 의 몫)
     이미지   <img src alt="">
     이모지 · 글자
              <span data-imory-dock-text> 에 textContent 로

   셋 다 스킨 HTML 이 적을 수 없는 자리에 **렌더 뒤** 플랫폼이 넣는
   것이다 — data-imory-dock-item 을 찍는 것과 같은 결이다
   (skin-bottom-dock-mount.js).

   ── "스킨이 그렸다"는 판정 ───────────────────────────────
   아이콘: 종류가 찍힌 요소([data-kind])의 ::before/::after 에 content
           가 있거나, 배경/마스크 그림이 있으면 스킨이 그린 것이다.
   그 밖: 그 자리(항목/트리거)에 **보이는** 글자나 이미지가 하나라도
          있으면 스킨이 무언가를 보여 주고 있는 것이다.

   계산 스타일을 읽으므로 dock 이 문서에 붙은 **뒤**에 부른다.

   classic script. skin/skin-bottom-dock.js(isSkinDockImoryIcon)보다
   뒤, skin-bottom-dock-mount.js 보다 앞에 로드한다(호출 시점에만
   있으면 된다).
========================================================== */

const SKIN_DOCK_ICON_ATTR =
  "data-imory-dock-icon";

const SKIN_DOCK_TEXT_ATTR =
  "data-imory-dock-text";


/* host 안에서, host 까지 올라가는 동안 [hidden] 이 없는가 */
function isSkinDockNodeShown(node, host) {

  let el =
    node.nodeType === 1 ? node : node.parentElement;

  while (el) {

    if (el.hidden) {
      return false;
    }

    if (el === host) {
      return true;
    }

    el = el.parentElement;

  }

  return true;

}


/* 그 자리에 보이는 글자나 이미지가 있는가 */
function skinDockHostShowsSomething(host) {

  const doc =
    host.ownerDocument;

  const walker =
    doc.createTreeWalker(host, 4 /* NodeFilter.SHOW_TEXT */);

  let node;

  while ((node = walker.nextNode())) {

    if (node.nodeValue.trim() && isSkinDockNodeShown(node, host)) {
      return true;
    }

  }

  return Array.from(
    host.querySelectorAll(`img, [${SKIN_DOCK_ICON_ATTR}]`)
  ).some((el) => isSkinDockNodeShown(el, host));

}


/* 스킨 CSS 가 이 요소에 그림을 그렸는가(가상 요소 · 배경 · 마스크) */
function skinDockElementIsPainted(el) {

  const view =
    el.ownerDocument.defaultView;

  if (!view || typeof view.getComputedStyle !== "function") {
    return false;
  }

  for (const pseudo of ["::before", "::after"]) {

    const content =
      view.getComputedStyle(el, pseudo).content;

    if (content && content !== "none" && content !== "normal") {
      return true;
    }

  }

  const style =
    view.getComputedStyle(el);

  const images = [
    style.backgroundImage,
    style.maskImage,
    style.webkitMaskImage
  ];

  return images.some((value) => !!value && value !== "none");

}


/* 이미지를 넣을 자리 — 링크가 있으면 그 안(누르는 넓이가 같다) */
function skinDockInsertTarget(host) {

  if (host.matches("a[href]")) {
    return host;
  }

  return host.querySelector("a[href]") || host;

}


/*
  applySkinDockVisual(host, visual)

  host    항목 clone([data-imory-dock-item]) 또는 트리거
  visual  buildSkinDockVisualContext 의 결과(skin-bottom-dock.js)
*/
function applySkinDockVisual(host, visual) {

  if (!host || !visual) {
    return;
  }

  const doc =
    host.ownerDocument;


  if (visual.isIcon) {

    const token =
      visual.iconKind;

    if (
      !token ||
      typeof isSkinDockImoryIcon !== "function" ||
      !isSkinDockImoryIcon(token)
    ) {
      return;
    }

    /* 종류가 찍힌 요소 — 자기 자신이거나 안쪽 */
    const candidates =
      [host, ...host.querySelectorAll("[data-kind]")].filter(
        (el) =>
          el.getAttribute("data-kind") === token &&
          isSkinDockNodeShown(el, host)
      );

    const kindEl =
      candidates[0] || null;

    if (kindEl && skinDockElementIsPainted(kindEl)) {
      return;
    }

    if (!kindEl && skinDockHostShowsSomething(host)) {
      /* 스킨이 아이콘 자리를 두지 않고 글자로 보여 주는 dock —
         그 디자인을 존중한다 */
      return;
    }

    if ((kindEl || host).querySelector(`[${SKIN_DOCK_ICON_ATTR}]`)) {
      return;
    }

    const icon =
      doc.createElement("span");

    icon.setAttribute(SKIN_DOCK_ICON_ATTR, token);
    icon.setAttribute("aria-hidden", "true");

    const target =
      kindEl || skinDockInsertTarget(host);

    target.insertBefore(icon, target.firstChild);

    return;

  }


  /* 이모지 · 글자 · 이미지 — 스킨이 아무것도 보여 주지 않을 때만 */

  if (skinDockHostShowsSomething(host)) {
    return;
  }

  const target =
    skinDockInsertTarget(host);

  if (visual.isImage && visual.imageUrl) {

    const img =
      doc.createElement("img");

    img.setAttribute("src", visual.imageUrl);
    img.setAttribute("alt", "");
    img.setAttribute("data-imory-dock-image", "");

    target.insertBefore(img, target.firstChild);

    return;

  }

  if (visual.hasText && visual.text) {

    const span =
      doc.createElement("span");

    span.setAttribute(SKIN_DOCK_TEXT_ATTR, "");
    span.setAttribute("aria-hidden", "true");
    span.textContent = visual.text;

    target.insertBefore(span, target.firstChild);

  }

}


/*
  applySkinDockVisuals({ dockRoot, dockContext, triggerEl })

  mountSkinBottomDock 이 렌더 직후, 접힘 상태를 얹기 **전에** 부른다
  (접힌 뒤에는 항목이 hidden 이라 "보이는가"를 잴 수 없다).
*/
function applySkinDockVisuals({ dockRoot, dockContext, triggerEl }) {

  if (!dockRoot || !dockContext) {
    return;
  }

  if (triggerEl && dockContext.trigger) {
    applySkinDockVisual(triggerEl, dockContext.trigger);
  }

  const itemsById =
    new Map((dockContext.items || []).map((item) => [String(item.id), item]));

  dockRoot.querySelectorAll("[data-imory-dock-item]").forEach((el) => {

    const item =
      itemsById.get(el.getAttribute("data-imory-dock-item"));

    if (item) {
      applySkinDockVisual(el, item.visual);
    }

  });

}


if (typeof window !== "undefined") {

  window.applySkinDockVisuals = applySkinDockVisuals;

}
