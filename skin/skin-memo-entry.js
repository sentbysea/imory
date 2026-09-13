/* =========================================================
   SKIN MEMO ENTRY — 메모 화면으로 가는 기본 진입점 (HIGHLIGHT-1 후속)

   메모 카테고리(/:slug/memos)는 스킨이 navigation.memos를 그려야만
   닿을 수 있었다. 기존 스킨들은 그 링크를 갖고 있지 않으므로 주소를
   직접 치지 않으면 자기 메모를 볼 수 없었다
   (IMORY_HIGHLIGHT1_DESIGN.md §11-2).

   이 파일은 그 빈자리를 메운다 — **스킨 코드를 고치지 않고**
   플랫폼이 자기 진입점 하나를 화면에 얹는다.

   ── 세 가지 규칙 ───────────────────────────────────────
   1) 스킨이 이미 메모 링크를 그렸으면 얹지 않는다. 판정 근거는
      스킨 이름도 클래스도 아니고 **주소**뿐이다 — 렌더된 DOM 안의
      <a href>가 그 사이트의 /memos 경로를 가리키는가
      (skin/skin-owner-entry.js가 EDIT/WRITE를 알아보는 방법과 같다).
   2) 사용자가 껐으면 얹지 않는다. Settings > HOME > ETC의
      "메모 진입점 숨기기"(site_settings.hide_memo_entry)가 그 스위치이고,
      Context에는 navigation.memos.enabled로 온다.
   3) 메모 화면 자신에서는 얹지 않는다(자기 자신으로 가는 링크).

   ── 왜 스킨 DOM 안이 아니라 떠 있는 칩인가 ──────────────
   스킨마다 내비게이션의 모양도 자리도 다르다. 남의 <nav> 안에
   플랫폼이 <li>를 끼워 넣기 시작하면 그 순간부터 스킨 내부 구조에
   의존하는 제품 코드가 된다(SKIN_SURFACE_AND_TRANSITION_CONTRACT.md
   0절). 그래서 스킨 DOM에는 한 글자도 손대지 않고, .menu-button /
   .music-button과 같은 결의 **떠 있는 플랫폼 chrome**을 하나 둔다.

   ── 왜 링크(<a>)인가 ───────────────────────────────────
   버튼이 아니라 진짜 주소를 가진 링크여야 새 탭으로 열기·주소
   복사·수정키 클릭 같은 브라우저 기본 동작이 그대로 산다. 평소
   클릭은 data-imory-platform-nav 표식을 보고 기존 SPA 라우터가
   가로챈다(skin/skin-link-nav.js) — 별도 라우터를 만들지 않는다.

   ── Studio Preview ─────────────────────────────────────
   Preview 문서(studio/preview/preview-frame.html)도 이 파일을 그대로
   읽는다. 그래야 편집자가 공개 화면과 **같은 진입점**을 보고 메모
   화면 미리보기로 들어갈 수 있다(§11-4). 그쪽은 클릭을 자기
   bridge가 가로채므로 이 파일은 링크만 만들고 이동에는 관여하지
   않는다 — 그래서 이 파일에는 의존이 하나도 없다(순수 DOM).

   classic script. 의존 없음.
========================================================== */


/* 플랫폼이 얹은 칩임을 나타내는 유일한 표식 */

const PLATFORM_MEMO_ENTRY_ID =
  "imoryPlatformMemoEntry";


let platformMemoEntryNode =
  null;


/* =========================================================
   skinHasMemosLink(root, memosHref) -> boolean

   렌더된 스킨 DOM이 이미 메모 화면으로 가는 링크를 갖고 있는가.

   root는 아직 화면에 붙이기 전의 detached 엘리먼트도 된다 —
   anchor.getAttribute가 아니라 anchor.href(절대 URL)를 읽으므로
   문서 base 기준으로 해석된다(skin/skin-owner-entry.js와 같은 이유).
========================================================== */

function skinHasMemosLink(
  root,
  memosHref
) {

  if (
    !root ||
    typeof root.querySelectorAll !== "function" ||
    !memosHref
  ) {

    return false;

  }


  let wanted;

  try {

    wanted =
      new URL(
        memosHref,
        window.location.href
      );

  }

  catch (err) {

    return false;

  }


  /* 끝의 / 하나 차이로 다른 주소가 되지 않게 맞춰 둔다 */

  const wantedPath =
    wanted.pathname.replace(
      /\/+$/,
      ""
    );


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

    }

    catch (err) {

      continue;

    }


    if (url.origin !== window.location.origin) {

      continue;

    }


    const path =
      url.pathname.replace(
        /\/+$/,
        ""
      );


    /*
      /memos 자신과 그 아래(폴더별 보기, 폴더 하나)까지 인정한다 —
      스킨이 "메모 · 폴더별"만 그렸어도 진입점은 이미 있는 것이다.
    */

    if (
      path === wantedPath ||
      path.startsWith(wantedPath + "/")
    ) {

      return true;

    }

  }


  return false;

}


/* =========================================================
   refreshPlatformMemoEntry(options)

     href       메모 화면 주소(navigation.memos.href). 없으면 내린다.
     enabled    navigation.memos.enabled — 사용자가 끈 경우 false
     skinRoot   이번 화면에 렌더된 스킨 루트(있으면 중복 판정에 쓴다)
     isMemosScreen  지금 화면이 메모 화면인가
     label      칩에 쓸 글자(기본 "MEMO")
     document   Preview iframe에서 부를 때 그 문서

   화면이 바뀔 때마다 부른다. 조건이 맞으면 하나만 만들고, 맞지
   않으면 지운다 — 같은 칩이 두 개 생기는 경로가 없다.
========================================================== */

function refreshPlatformMemoEntry(
  options = {}
) {

  const doc =
    options.document ||
    document;


  const existing =
    doc.getElementById(
      PLATFORM_MEMO_ENTRY_ID
    );


  const href =
    typeof options.href === "string" &&
    options.href
      ? options.href
      : "";


  const shouldShow =
    Boolean(href) &&
    options.enabled !== false &&
    options.isMemosScreen !== true &&
    !skinHasMemosLink(
      options.skinRoot,
      href
    );


  if (!shouldShow) {

    if (existing) {

      existing.remove();

    }


    if (platformMemoEntryNode === existing) {

      platformMemoEntryNode =
        null;

    }


    return null;

  }


  const anchor =
    existing ||
    doc.createElement("a");


  anchor.id =
    PLATFORM_MEMO_ENTRY_ID;


  anchor.className =
    "platform-memo-entry";


  /*
    기존 SPA 라우터가 가로챌 수 있게 표식을 남긴다. 스킨 루트
    바깥에 있는 링크라 이 표식이 없으면 문서 전체가 다시 로드된다
    (skin/skin-link-nav.js).
  */

  anchor.setAttribute(
    "data-imory-platform-nav",
    "memos"
  );


  anchor.setAttribute(
    "href",
    href
  );


  anchor.textContent =
    options.label ||
    "MEMO";


  anchor.setAttribute(
    "aria-label",
    "메모 모아보기"
  );


  if (!anchor.isConnected) {

    doc.body.appendChild(anchor);

  }


  platformMemoEntryNode =
    anchor;


  return anchor;

}


/*
  화면을 떠날 때(관리 화면 · 에디터 등 스킨이 아닌 화면) 부른다.
*/

function hidePlatformMemoEntry(
  targetDocument
) {

  return refreshPlatformMemoEntry({
    href: "",

    document:
      targetDocument
  });

}


/* =========================================================
   공개 화면용 컨트롤러

   위의 두 함수는 의존이 하나도 없다(Preview 문서도 그대로 읽는다).
   아래부터는 공개 화면(index.html)에서만 의미가 있는 부분이고,
   전역이 없으면 조용히 아무것도 하지 않는다 — 그래서 Preview에
   같은 파일을 로드해도 이 블록은 한 번도 실행되지 않는다.

   "숨김" 설정은 한 페이지 세션에 한 번만 읽는다. 사이트 단위
   설정이라 화면이 바뀔 때마다 다시 물어볼 이유가 없다
   (core/lib/content-protection.js가 보호 설정을 다루는 방식과 같다).
========================================================== */

let platformMemoEntrySettingPromise =
  null;


function fetchPlatformMemoEntrySetting() {

  if (platformMemoEntrySettingPromise) {

    return platformMemoEntrySettingPromise;

  }


  platformMemoEntrySettingPromise =
    (async () => {

      if (
        typeof supabaseClient === "undefined" ||
        typeof getSiteOwner !== "function"
      ) {

        return {
          slug: "",

          hidden: false
        };

      }


      let owner;

      try {

        owner =
          await getSiteOwner();

      }

      catch (err) {

        owner =
          null;

      }


      const slug =
        owner?.slug ||
        (
          typeof siteOwnerSlug === "string"
            ? siteOwnerSlug
            : ""
        );


      if (!owner?.ownerId) {

        /*
          소유자를 모르는 배포(잘못된 slug, 조회 실패)에는 메모
          화면이 없다 — 진입점도 내보내지 않는다.
        */

        return {
          slug: "",

          hidden: false
        };

      }


      let hidden =
        false;


      try {

        const {
          data,
          error
        } =
          await supabaseClient
            .from(
              "site_settings"
            )
            .select(
              "value"
            )
            .eq(
              "user_id",
              owner.ownerId
            )
            .eq(
              "key",
              "hide_memo_entry"
            );


        if (error) {

          throw error;

        }


        hidden =
          (data || []).some(
            (row) =>
              String(row.value || "").trim() === "on"
          );

      }

      catch (err) {

        /*
          설정을 못 읽었다고 진입점을 없애지 않는다 — 기본은
          "보인다"이고, 숨김은 사용자가 명시적으로 켠 경우뿐이다.
        */

        hidden =
          false;

      }


      return {
        slug,

        hidden
      };

    })();


  return platformMemoEntrySettingPromise;

}


/* =========================================================
   syncPlatformMemoEntryForScreen(options)

     skinRoot       이번 화면에 렌더된 스킨 루트(중복 판정용)
     isMemosScreen  메모 화면 자신인가
     active         false면 조건과 무관하게 내린다

   각 화면이 "이 화면을 그렸다"를 확정한 직후 부른다. await하지
   않아도 된다 — 늦게 끝나도 그때의 화면 상태를 다시 확인한다.
========================================================== */

async function syncPlatformMemoEntryForScreen(
  options = {}
) {

  if (options.active === false) {

    return hidePlatformMemoEntry();

  }


  const setting =
    await fetchPlatformMemoEntrySetting();


  if (
    !setting.slug ||
    typeof buildSiteMemosPath !== "function"
  ) {

    return hidePlatformMemoEntry();

  }


  return refreshPlatformMemoEntry({
    href:
      buildSiteMemosPath(setting.slug),

    enabled:
      !setting.hidden,

    skinRoot:
      options.skinRoot ||
      null,

    isMemosScreen:
      options.isMemosScreen === true
  });

}
