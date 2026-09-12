/* =========================================================
   CONTENT PROTECTION (사이트 보호 설정)

   Settings > HOME > ETC의 세 가지를 담당한다. **블로그 전체**에
   적용되는 설정이고, 값은 site_settings에 key/value로 들어간다
   (blog_title / favicon_url / cursor_url과 같은 자리).

     block_context_menu  우클릭(컨텍스트 메뉴) 차단 — 주인장 제외
     block_text_copy     텍스트 복사 차단          — 주인장 제외
     strip_image_exif    올리는 이미지의 EXIF 제거

   기준 문서: IMORY_GALLERY1_DESIGN.md §13

   ★ 왜 카테고리가 아니라 사이트 단위인가
   처음에는 카테고리 컬럼으로 만들었지만, 그러면 카테고리가 없는
   화면(HOME·배너)에 적용할 대상이 없어 "블로그를 보호한다"가 되지
   못한다. 그래서 site_settings의 사이트 단위 설정으로 옮겼다 —
   새 컬럼도 migration도 필요 없다.

   ★ 무엇을 막고 무엇을 못 막는가 (정직하게)

   앞의 두 가지는 **브라우저의 기본 동작을 막는 것**이다. 개발자
   도구·소스 보기·화면 캡처·확장 프로그램·JS를 끈 브라우저 앞에서는
   무력하다. 서버가 보낸 바이트는 이미 그 사람의 컴퓨터에 있다.
   "실수로/가볍게 가져가는 것"을 한 겹 불편하게 만드는 장치이지
   보안 경계가 아니다 — 그래서 이 파일은 **플랫폼 화면 동작**만
   건드리고 데이터 접근에는 손대지 않는다.

   반대로 EXIF 제거는 실제로 되돌릴 수 없는 처리다. 파일을 올리기
   전에 브라우저에서 다시 인코딩해 **좌표·기기·촬영 시각이 담긴
   메타데이터가 애초에 서버로 가지 않게** 한다.

   ★ 주인장 제외

   "주인장"은 이 블로그의 소유자다. 글쓴이가 자기 글을 다룰 때까지
   불편해질 이유가 없다. 판정은 이 파일 안에서 직접 한다
   (imoryViewerIsSiteOwner) — posts/editor/posts-state.js의 같은
   함수에 기대면 부팅 직후에는 아직 로드되지 않아 "주인장인데
   막힌다"가 된다.

   설정 조회와 주인장 판정을 **동시에** 띄우고, 설정이 오면 곧바로
   걸고 주인장으로 확인되면 곧바로 푼다 — 순서대로 기다리면 주인장
   화면에서 우클릭이 잠깐 막히는 것이 눈에 보인다.

   classic script. core/lib/supabase-client.js 뒤에 로드된다
   (index.html / admin/index.html). 공개 화면에서 실제로 거는 곳은
   home/site-meta.js의 loadSiteMeta() 하나다 — 화면이 바뀔 때마다
   다시 걸 필요가 없다(사이트 단위 설정이므로).
========================================================== */

const IMORY_CONTENT_PROTECTION_KEYS =
  [
    "block_context_menu",
    "block_text_copy",
    "strip_image_exif"
  ];


const IMORY_CONTENT_PROTECTION_STYLE_ID =
  "imoryContentProtectionStyle";

const IMORY_CONTENT_PROTECTION_BODY_CLASS =
  "imory-no-copy";


const IMORY_CONTENT_OPTIONS_NONE =
  {
    blockContextMenu: false,
    blockTextCopy: false,
    stripImageExif: false
  };


/* site_settings의 value는 문자열이다 — "on"만 켜짐으로 본다 */

function imoryContentOptionIsOn(
  value
) {

  return typeof value === "string" && value.trim() === "on";

}


/*
  -> { blockContextMenu, blockTextCopy, stripImageExif }

  ownerId가 null이면 필터 없이 읽는다(비-scoped 배포 —
  home/site-meta.js의 다른 설정들과 같은 규칙).

  실패하면 "전부 꺼짐"이다: 보호 설정을 못 읽었다고 화면을 못
  보여줄 이유가 없다.
*/

async function fetchImoryContentOptions(
  ownerId
) {

  try {

    let query =
      supabaseClient
        .from(
          "site_settings"
        )
        .select(
          "key, value"
        )
        .in(
          "key",
          IMORY_CONTENT_PROTECTION_KEYS
        );


    if (ownerId) {

      query =
        query.eq(
          "user_id",
          ownerId
        );

    }


    const {
      data,
      error
    } =
      await query;


    if (error) {

      console.warn(
        "[content-protection] 보호 설정 조회 실패(전부 꺼짐으로 진행):",
        error
      );


      return IMORY_CONTENT_OPTIONS_NONE;

    }


    const byKey =
      new Map(
        (data || []).map((row) => [row.key, row.value])
      );


    return {

      blockContextMenu:
        imoryContentOptionIsOn(byKey.get("block_context_menu")),

      blockTextCopy:
        imoryContentOptionIsOn(byKey.get("block_text_copy")),

      stripImageExif:
        imoryContentOptionIsOn(byKey.get("strip_image_exif"))

    };

  }

  catch (err) {

    console.warn(
      "[content-protection] 보호 설정 조회 실패(전부 꺼짐으로 진행):",
      err
    );


    return IMORY_CONTENT_OPTIONS_NONE;

  }

}


/*
  이 블로그의 설정. 한 번만 읽고 promise를 캐시한다 — 사이트 단위
  값이라 화면이 바뀐다고 달라지지 않고, 설정 변경은 admin 페이지
  (전체 새로고침)에서 일어난다.

  getSiteOwner()는 home/site-owner.js에 있다(공개 화면 전용).
  admin에는 없으므로 그쪽에서는 이 함수를 쓰지 않는다 —
  admin/settings/admin-etc-settings.js가 자기 값을 들고 있다.
*/

let imorySiteContentOptionsPromise =
  null;


function loadImorySiteContentOptions() {

  if (!imorySiteContentOptionsPromise) {

    imorySiteContentOptionsPromise =
      (async () => {

        let ownerId =
          null;


        if (typeof getSiteOwner === "function") {

          const owner =
            await getSiteOwner();


          if (owner && owner.scoped) {

            if (!owner.ownerId) {

              /* 잘못된 slug — 남의 설정으로 새지 않게 여기서 멈춘다 */

              return IMORY_CONTENT_OPTIONS_NONE;

            }


            ownerId =
              owner.ownerId;

          }

        }


        return fetchImoryContentOptions(
          ownerId
        );

      })();

  }


  return imorySiteContentOptionsPromise;

}


/* =========================================================
   화면에 거는 쪽

   listener는 capture 단계에서 preventDefault만 한다 — 다른 기능의
   동작을 가로채지 않기 위해 stopPropagation은 하지 않는다.

   복사 차단의 CSS는 여기서 한 번만 주입한다. 별도 CSS 파일을 만들면
   배포 버전(?v=) 로더에 항목이 하나 더 늘 뿐이고, 이 규칙은 이
   기능 밖에서 쓰이지 않는다.
========================================================== */

function ensureImoryContentProtectionStyle() {

  if (
    document.getElementById(
      IMORY_CONTENT_PROTECTION_STYLE_ID
    )
  ) {

    return;

  }


  const style =
    document.createElement("style");

  style.id =
    IMORY_CONTENT_PROTECTION_STYLE_ID;


  /*
    입력 요소는 예외다 — 비밀글 비밀번호처럼 방문자가 직접 쓰고
    고쳐야 하는 자리까지 굳어 버리면 화면이 고장 난 것처럼 보인다.
  */

  style.textContent =
    `
      body.${IMORY_CONTENT_PROTECTION_BODY_CLASS} {
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
      }

      body.${IMORY_CONTENT_PROTECTION_BODY_CLASS} input,
      body.${IMORY_CONTENT_PROTECTION_BODY_CLASS} textarea,
      body.${IMORY_CONTENT_PROTECTION_BODY_CLASS} [contenteditable="true"] {
        -webkit-user-select: text;
        -moz-user-select: text;
        user-select: text;
      }
    `;


  document.head.appendChild(
    style
  );

}


function handleImoryBlockedContextMenu(
  event
) {

  event.preventDefault();

}


function handleImoryBlockedCopy(
  event
) {

  /*
    입력 요소 안에서 쓴 내용은 자기 것이다 — 여기까지 막으면
    방문자가 자기가 입력한 값을 복사하지도 못한다.
  */

  const target =
    event.target;

  if (
    target &&
    typeof target.closest === "function" &&
    target.closest('input, textarea, [contenteditable="true"]')
  ) {

    return;

  }


  event.preventDefault();

}


let imoryContentProtectionActive =
  {
    contextMenu: false,
    textCopy: false
  };


function setImoryContentProtection(
  contextMenu,
  textCopy
) {

  if (
    imoryContentProtectionActive.contextMenu !== contextMenu
  ) {

    if (contextMenu) {

      document.addEventListener(
        "contextmenu",
        handleImoryBlockedContextMenu,
        true
      );

    }

    else {

      document.removeEventListener(
        "contextmenu",
        handleImoryBlockedContextMenu,
        true
      );

    }


    imoryContentProtectionActive.contextMenu =
      contextMenu;

  }


  if (
    imoryContentProtectionActive.textCopy !== textCopy
  ) {

    if (textCopy) {

      ensureImoryContentProtectionStyle();

      document.addEventListener(
        "copy",
        handleImoryBlockedCopy,
        true
      );

      document.addEventListener(
        "cut",
        handleImoryBlockedCopy,
        true
      );

      document.body.classList.add(
        IMORY_CONTENT_PROTECTION_BODY_CLASS
      );

    }

    else {

      document.removeEventListener(
        "copy",
        handleImoryBlockedCopy,
        true
      );

      document.removeEventListener(
        "cut",
        handleImoryBlockedCopy,
        true
      );

      document.body.classList.remove(
        IMORY_CONTENT_PROTECTION_BODY_CLASS
      );

    }


    imoryContentProtectionActive.textCopy =
      textCopy;

  }

}


function clearImoryContentProtection() {

  setImoryContentProtection(
    false,
    false
  );

}


/*
  지금 이 화면을 보고 있는 사람이 이 블로그의 주인인가.

  posts/editor/posts-state.js에 같은 판정(isSiteOwnerSignedIn)이
  있지만 그 파일에 기대지 않는다 — 이 함수는 site-meta.js가 부팅
  직후에 부르고, 그 시점에 posts/* 스크립트는 아직 로드되지 않았을
  수 있다. 예전에 "주인장인데도 우클릭이 막힌다"가 정확히 그
  이유였다.
*/

async function imoryViewerIsSiteOwner() {

  try {

    const owner =
      typeof getSiteOwner === "function"
        ? await getSiteOwner()
        : null;


    const {
      data
    } =
      await supabaseClient
        .auth
        .getUser();


    const user =
      data ? data.user : null;


    if (!user) {

      return false;

    }


    /* 비-scoped 배포(단일 사용자)에서는 로그인 = 주인장 */

    if (!owner || !owner.scoped) {

      return true;

    }


    return owner.ownerId === user.id;

  }

  catch (err) {

    return false;

  }

}


/*
  공개 화면에서 한 번 부른다(home/site-meta.js). 사이트 단위
  설정이라 화면이 바뀌어도 다시 걸 필요가 없다.

  순서에 주의: 설정을 읽자마자 **먼저 걸고**, 주인장으로 확인되면
  그때 푼다. 소유자 판정은 네트워크가 필요해서 늦게 오기 때문이다.
*/

async function applyImorySiteContentProtection() {

  /*
    두 조회를 **동시에** 띄운다. 설정이 오면 곧바로 걸고, 주인장
    판정이 오면 곧바로 푼다 — 순서대로 기다리면 주인장 화면에서
    우클릭이 잠깐 막히는 게 눈에 보인다.
  */

  const optionsPromise =
    loadImorySiteContentOptions();

  const ownerPromise =
    imoryViewerIsSiteOwner();


  const options =
    await optionsPromise;


  if (
    !options.blockContextMenu &&
    !options.blockTextCopy
  ) {

    return;

  }


  setImoryContentProtection(
    options.blockContextMenu,
    options.blockTextCopy
  );


  if (await ownerPromise) {

    clearImoryContentProtection();

  }

}


/* =========================================================
   EXIF 제거 · 압축

   ★ 올리는 이미지를 다시 인코딩하는 일은 core/lib/image-upload.js
     (prepareImoryUploadImage)로 옮겼다.

   여기 있던 stripImageExifIfNeeded는 **일부 업로드 경로에서만**
   불렸다 — 배너·아바타·스킨 이미지 라이브러리는 원본을 그대로
   올렸고, 그래서 설정을 켜 둬도 어느 경로로 올렸느냐에 따라
   메타데이터가 남았다. 지금은 모든 경로가 그 함수 하나를 지나고,
   메타데이터 제거와 함께 용량 압축도 같이 한다.

   이 파일은 **설정을 읽는 일**만 계속 맡는다
   (loadImorySiteContentOptions → { blockContextMenu,
   blockTextCopy, stripImageExif }).
========================================================== */
