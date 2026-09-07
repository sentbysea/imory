/* =========================================================
   SKIN OWNER ENTRY DETECTION (PHASE 1H 1절)

   "이 스킨이 자기 레이아웃 안에 관리/작성 진입점을 직접 그렸는가"를
   플랫폼이 알아내는 유일한 지점.

   왜 필요한가 — 지금까지 소유자에게 보이는 관리 진입점은 표시 공간
   오른쪽 위에 떠 있는 플랫폼 도구(#postAddButton / #postListEditToggleButton
   등, .post-container--owner-tools)뿐이었다. 스킨이 자기 자리에 EDIT을
   그릴 수 있게 되면(viewer.manageHref, skin/skin-context.js) 같은 동작이
   화면에 두 번 나타난다. 플랫폼은 "스킨이 이미 그렸다"를 알아야 자기
   버튼을 접을 수 있다.

   무엇을 근거로 판정하는가 — 렌더된 DOM 안의 <a href>가 이 사이트의
   요청 쿼리(?manage=1 / ?write=1 / ?edit=1, core/lib/site-path.js)를
   가리키는지만 본다. 스킨 이름·스킨 CSS 클래스·카테고리 id를 전혀
   보지 않는다(SKIN_SURFACE_AND_TRANSITION_CONTRACT.md 0절 원칙) —
   어떤 스킨이든 그 주소를 그리기만 하면 자동으로 인정되고, 안 그리면
   플랫폼의 기본 도구가 그대로 남는다.

   판정은 "표시"만 정한다. 실제 소유자 검사는 지금까지와 똑같이 받는
   쪽(openCategoryPage / startPostCompose / openPostEditor)이 다시 하고,
   쓰기 권한은 RLS가 강제한다 — 이 파일은 권한에 손대지 않는다.

   의존(classic script, 이 파일보다 먼저 로드되어야 함):
   core/lib/site-path.js(isSiteManageRequested / isSiteComposeRequested /
   isSiteEditRequested).
========================================================== */

/* =========================================================
   resolveSkinOwnerEntries(root) -> { manage, write, edit }

   root는 렌더된 스킨이 들어 있는 아무 엘리먼트나 된다 — 아직 화면에
   붙이기 전의 detached 스크래치 엘리먼트(posts-view-list.js가 늦은
   응답 보호를 위해 쓰는 것)도 그대로 통한다. anchor.getAttribute를
   쓰지 않고 anchor.href(절대 URL)를 읽으므로 detached 상태에서도
   문서 base 기준으로 해석된다.
========================================================== */

function resolveSkinOwnerEntries(
  root
) {

  const found = {
    manage: false,
    write: false,
    edit: false
  };


  if (
    !root ||
    typeof root.querySelectorAll !== "function"
  ) {

    return found;

  }


  const anchors =
    root.querySelectorAll("a[href]");


  for (const anchor of anchors) {

    let url;

    try {

      url =
        new URL(
          anchor.href,
          window.location.href
        );

    } catch (err) {

      continue;

    }


    /*
      다른 오리진으로 나가는 링크는 이 사이트의 요청 쿼리가 아니다 —
      우연히 ?manage=1이 붙은 외부 주소를 진입점으로 오인하지 않는다
      (skin-link-nav.js가 그런 링크를 가로채지 않는 것과 같은 이유).
    */

    if (url.origin !== window.location.origin) {

      continue;

    }


    if (isSiteManageRequested(url.search)) {

      found.manage = true;

    }


    if (isSiteComposeRequested(url.search)) {

      found.write = true;

    }


    if (isSiteEditRequested(url.search)) {

      found.edit = true;

    }

  }


  return found;

}
